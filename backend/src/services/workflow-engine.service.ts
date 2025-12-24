import type { WorkItemRepository } from "../features/work-items/repositories/work-item.repository.js";
import type { WorkerRepository } from "../features/workers/repositories/worker.repository.js";
import type {
  WorkItem,
  WorkItemStatus,
  AgentRole,
} from "../db/schema.js";
import type { Transition } from "../models/work-item.js";

/**
 * Workflow state information for a work item
 */
export interface WorkflowState {
  currentStatus: WorkItemStatus;
  validTransitions: WorkItemStatus[];
  isBlocked: boolean;
  blockers: string[];
  assignedAgents: Record<string, string | undefined>;
}

/**
 * Approval tracking for transitions
 * Stored in work item's metadata or a separate approval system
 */
interface ApprovalRecord {
  transition: Transition;
  approverId: string;
  approvedAt: number;
}

/**
 * Workflow Engine Service
 * Manages work item state transitions, approval gates, and work assignment
 */
export class WorkflowEngineService {
  // Store approvals in memory for simplicity - in production, store in database
  private approvals = new Map<string, ApprovalRecord[]>();

  constructor(
    private workItemRepo: WorkItemRepository,
    private workerRepo: WorkerRepository
  ) {}

  /**
   * State transition map defining valid transitions
   * Maps current status to allowed next statuses
   */
  private readonly transitionMap: Record<WorkItemStatus, WorkItemStatus[]> = {
    backlog: ["ready"],
    ready: ["in_progress", "backlog"],
    in_progress: ["review", "backlog"],
    review: ["done", "in_progress", "backlog"],
    done: ["backlog"], // Allow any_to_backlog from done
  };

  /**
   * Transition name map for converting status pairs to transition names
   */
  private getTransitionName(
    from: WorkItemStatus,
    to: WorkItemStatus
  ): Transition | null {
    // Handle any_to_backlog case
    if (to === "backlog") {
      if (from === "ready") return "ready_to_backlog";
      if (from === "in_progress") return "in_progress_to_backlog";
      if (from === "review") return "any_to_backlog";
      if (from === "done") return "any_to_backlog";
      if (from === "backlog") return null; // Already in backlog
    }

    const transitionKey = `${from}_to_${to}` as Transition;
    const validTransitions: Transition[] = [
      "backlog_to_ready",
      "ready_to_in_progress",
      "in_progress_to_review",
      "review_to_done",
      "review_to_in_progress",
      "in_progress_to_backlog",
      "ready_to_backlog",
      "any_to_backlog",
    ];

    return validTransitions.includes(transitionKey) ? transitionKey : null;
  }

  /**
   * Check if a transition is valid for a work item
   * @param workItemId - Work item ID
   * @param targetStatus - Target status to transition to
   * @returns True if transition is valid, false otherwise
   */
  async canTransition(
    workItemId: string,
    targetStatus: WorkItemStatus
  ): Promise<boolean> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    // Don't allow transition to same status (no-op)
    if (workItem.status === targetStatus) {
      return false;
    }

    // Check if transition is valid according to state machine
    const allowedTransitions = this.transitionMap[workItem.status];
    if (!allowedTransitions.includes(targetStatus)) {
      return false;
    }

    // Check if work item is blocked by dependencies
    const isUnblocked = await this.checkDependencies(workItemId);
    if (!isUnblocked && targetStatus !== "backlog") {
      // Allow moving to backlog even if blocked (for deprioritization)
      return false;
    }

    return true;
  }

  /**
   * Execute a state transition
   * @param workItemId - Work item ID
   * @param targetStatus - Target status to transition to
   * @param actorId - Optional ID of actor performing transition
   */
  async transition(
    workItemId: string,
    targetStatus: WorkItemStatus,
    _actorId?: string
  ): Promise<WorkItem> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    // Check if transition is valid according to state machine first
    const allowedTransitions = this.transitionMap[workItem.status];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new Error(
        `Invalid transition from ${workItem.status} to ${targetStatus}`
      );
    }

    // Check if work item is blocked
    const isUnblocked = await this.checkDependencies(workItemId);
    if (!isUnblocked && targetStatus !== "backlog") {
      throw new Error("Work item is blocked by dependencies");
    }

    // Check if approval is required
    const transitionName = this.getTransitionName(
      workItem.status,
      targetStatus
    );
    if (transitionName) {
      const requiresApproval = await this.isApprovalRequired(
        workItemId,
        transitionName
      );
      if (requiresApproval) {
        const approvals = this.approvals.get(workItemId) || [];
        const hasApproval = approvals.some(
          (a) => a.transition === transitionName
        );
        if (!hasApproval) {
          throw new Error(
            `Approval required for transition ${transitionName}`
          );
        }
      }
    }

    // Prepare update data
    const updateData: Partial<WorkItem> = {
      status: targetStatus,
    };

    // Set timestamps based on transition
    if (targetStatus === "in_progress" && !workItem.startedAt) {
      updateData.startedAt = new Date();
    }

    if (targetStatus === "done" && !workItem.completedAt) {
      updateData.completedAt = new Date();
    }

    // Clear approvals after successful transition
    if (transitionName) {
      this.clearApproval(workItemId, transitionName);
    }

    // Execute transition
    return await this.workItemRepo.update(workItemId, updateData);
  }

  /**
   * Get list of valid transitions from current state
   * @param workItemId - Work item ID
   * @returns Array of valid target statuses
   */
  async getValidTransitions(workItemId: string): Promise<WorkItemStatus[]> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const allowedByStateMachine = this.transitionMap[workItem.status];

    // Filter out transitions that are blocked by dependencies
    const validTransitions: WorkItemStatus[] = [];
    for (const status of allowedByStateMachine) {
      const canTransition = await this.canTransition(workItemId, status);
      if (canTransition) {
        validTransitions.push(status);
      }
    }

    return validTransitions;
  }

  /**
   * Set approval requirement for a transition
   * @param workItemId - Work item ID
   * @param transition - Transition to require approval for
   * @param required - Whether approval is required
   */
  async requireApproval(
    workItemId: string,
    transition: Transition,
    required: boolean
  ): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const requiresApproval = { ...workItem.requiresApproval };
    if (required) {
      requiresApproval[transition] = true;
    } else {
      delete requiresApproval[transition];
    }

    await this.workItemRepo.update(workItemId, { requiresApproval });
  }

  /**
   * Check if approval is required for a transition
   * @param workItemId - Work item ID
   * @param transition - Transition to check
   * @returns True if approval is required
   */
  async isApprovalRequired(
    workItemId: string,
    transition: Transition
  ): Promise<boolean> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    return workItem.requiresApproval[transition] === true;
  }

  /**
   * Record approval for a transition
   * @param workItemId - Work item ID
   * @param transition - Transition being approved
   * @param approverId - ID of approver
   */
  async approveTransition(
    workItemId: string,
    transition: Transition,
    approverId: string
  ): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const approvals = this.approvals.get(workItemId) || [];
    approvals.push({
      transition,
      approverId,
      approvedAt: Date.now(),
    });
    this.approvals.set(workItemId, approvals);
  }

  /**
   * Clear approval for a transition (after it's been used)
   * @param workItemId - Work item ID
   * @param transition - Transition to clear
   */
  private clearApproval(workItemId: string, transition: Transition): void {
    const approvals = this.approvals.get(workItemId) || [];
    const filtered = approvals.filter((a) => a.transition !== transition);
    if (filtered.length > 0) {
      this.approvals.set(workItemId, filtered);
    } else {
      this.approvals.delete(workItemId);
    }
  }

  /**
   * Find work items suitable for a given role
   * @param role - Agent role
   * @returns Array of work items suitable for the role
   */
  async findWorkForRole(role: AgentRole): Promise<WorkItem[]> {
    // Define which statuses each role works on
    const roleToStatusMap: Record<AgentRole, WorkItemStatus[]> = {
      refiner: ["backlog"], // Refiners work on backlog items
      implementer: ["ready"], // Implementers pick up ready items
      tester: ["in_progress"], // Testers work on in-progress items
      reviewer: ["review"], // Reviewers handle review items
    };

    const statuses = roleToStatusMap[role];
    const allWork: WorkItem[] = [];

    for (const status of statuses) {
      const items = await this.workItemRepo.findByStatus(status);
      allWork.push(...items);
    }

    // Filter out blocked items
    const unblocked: WorkItem[] = [];
    for (const item of allWork) {
      const isUnblocked = await this.checkDependencies(item.id);
      if (isUnblocked) {
        unblocked.push(item);
      }
    }

    return unblocked;
  }

  /**
   * Assign work item to an agent and transition to in_progress
   * @param workItemId - Work item ID
   * @param workerId - Worker ID
   * @param role - Role the agent will perform
   */
  async assignWorkToAgent(
    workItemId: string,
    workerId: string,
    role: AgentRole
  ): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const worker = await this.workerRepo.findById(workerId);
    if (!worker) {
      throw new Error("Worker not found");
    }

    // Only assign work that is in ready status
    if (workItem.status !== "ready") {
      throw new Error("Work item must be in ready status to assign");
    }

    // Update work item with assigned agent
    const assignedAgents = { ...workItem.assignedAgents };
    assignedAgents[role] = workerId;

    await this.workItemRepo.update(workItemId, { assignedAgents });

    // Update worker with current work
    await this.workerRepo.update(workerId, {
      currentWorkItemId: workItemId,
      currentRole: role,
      status: "working",
    });

    // Transition work item to in_progress
    await this.transition(workItemId, "in_progress");
  }

  /**
   * Complete work and move to review, unassign worker
   * @param workItemId - Work item ID
   * @param workerId - Worker ID completing the work
   */
  async completeWork(workItemId: string, workerId: string): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const worker = await this.workerRepo.findById(workerId);
    if (!worker) {
      throw new Error("Worker not found");
    }

    // Verify work item is in progress
    if (workItem.status !== "in_progress") {
      throw new Error("Work item must be in progress to complete");
    }

    // Verify worker is assigned to this work item
    const isAssigned = Object.values(workItem.assignedAgents).includes(
      workerId
    );
    if (!isAssigned) {
      throw new Error("Worker is not assigned to this work item");
    }

    // Transition to review
    await this.transition(workItemId, "review");

    // Unassign worker
    await this.workerRepo.update(workerId, {
      currentWorkItemId: null,
      currentRole: null,
      status: "idle",
    });
  }

  /**
   * Get workflow state for a work item
   * @param workItemId - Work item ID
   * @returns Current workflow state
   */
  async getWorkflowState(workItemId: string): Promise<WorkflowState> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    const validTransitions = await this.getValidTransitions(workItemId);
    const isUnblocked = await this.checkDependencies(workItemId);

    return {
      currentStatus: workItem.status,
      validTransitions,
      isBlocked: !isUnblocked,
      blockers: workItem.blockedBy,
      assignedAgents: workItem.assignedAgents,
    };
  }

  /**
   * Get all blocked work items
   * @returns Array of blocked work items
   */
  async getBlockedItems(): Promise<WorkItem[]> {
    return await this.workItemRepo.findBlocked();
  }

  /**
   * Check if all dependencies are resolved for a work item
   * @param workItemId - Work item ID
   * @returns True if all blockers are resolved (done status)
   */
  async checkDependencies(workItemId: string): Promise<boolean> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error("Work item not found");
    }

    // If no blockers, return true
    if (!workItem.blockedBy || workItem.blockedBy.length === 0) {
      return true;
    }

    // Check if all blockers are in done status
    const blockers = await this.workItemRepo.findByIds(workItem.blockedBy);

    // All blockers must be done
    const allDone = blockers.every((blocker) => blocker.status === "done");

    return allDone;
  }
}
