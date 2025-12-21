import { WorkItemRepository } from "../repositories/work-item.repository.js";
import type { AgentRole } from "../models/index.js";
import type {
  WorkItemStatus,
  WorkItemType,
  SuccessCriterion,
  WorkItem,
  NewWorkItem,
} from "../db/schema.js";
import { randomUUID } from "crypto";

/**
 * Input type for creating a new work item
 */
export interface CreateWorkItemInput {
  title: string;
  type: WorkItemType;
  description?: string;
  createdBy: string;
  parentId?: string;
  successCriteria?: Array<Omit<SuccessCriterion, "id" | "completed">>;
  linkedFiles?: string[];
  status?: WorkItemStatus;
}

/**
 * Input type for updating a work item
 */
export interface UpdateWorkItemInput {
  title?: string;
  description?: string;
  linkedFiles?: string[];
  successCriteria?: SuccessCriterion[];
  requiresApproval?: Record<string, boolean>;
}

/**
 * Valid status transitions map
 * Defines which status transitions are allowed
 */
const VALID_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  backlog: ["ready"],
  ready: ["in_progress", "backlog"],
  in_progress: ["review", "backlog"],
  review: ["done", "in_progress"],
  done: [], // Terminal state - no transitions allowed from done
};

/**
 * WorkItem Service
 * Provides business logic for work item lifecycle management
 */
export class WorkItemService {
  constructor(private repository: WorkItemRepository) {}

  /**
   * Create a new work item
   * @param data - Work item creation data
   * @returns The created work item
   * @throws Error if validation fails or creation fails
   */
  async create(data: CreateWorkItemInput): Promise<WorkItem> {
    // Generate ID and prepare success criteria
    const id = randomUUID();
    const now = new Date();
    const successCriteria: SuccessCriterion[] = (data.successCriteria || []).map(
      (criterion) => ({
        id: randomUUID(),
        description: criterion.description,
        completed: false,
      })
    );

    // Build new work item
    const newWorkItem: NewWorkItem = {
      id,
      title: data.title,
      type: data.type,
      status: data.status || "backlog",
      description: data.description || "",
      successCriteria,
      linkedFiles: data.linkedFiles || [],
      createdBy: data.createdBy,
      assignedAgents: {},
      requiresApproval: {},
      parentId: data.parentId,
      childIds: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    };

    // If there's a parent, verify it exists and update its childIds
    if (data.parentId) {
      const parent = await this.repository.findById(data.parentId);
      if (!parent) {
        throw new Error(`Parent work item with ID ${data.parentId} not found`);
      }

      // Add this item to parent's children
      const updatedChildIds = [...parent.childIds, id];
      await this.repository.update(data.parentId, { childIds: updatedChildIds });
    }

    return await this.repository.create(newWorkItem);
  }

  /**
   * Get a work item by ID
   * @param id - Work item ID
   * @returns The work item or null if not found
   */
  async getById(id: string): Promise<WorkItem | null> {
    return await this.repository.findById(id);
  }

  /**
   * Get all work items with optional filters
   * @param filters - Optional filters for status and type
   * @returns Array of matching work items
   */
  async getAll(filters?: {
    status?: WorkItemStatus;
    type?: WorkItemType;
  }): Promise<WorkItem[]> {
    return await this.repository.findAll(filters);
  }

  /**
   * Update a work item
   * @param id - Work item ID
   * @param data - Partial work item data to update
   * @returns The updated work item
   * @throws Error if work item not found or validation fails
   */
  async update(id: string, data: UpdateWorkItemInput): Promise<WorkItem> {
    // Verify work item exists
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    return await this.repository.update(id, data);
  }

  /**
   * Delete a work item
   * @param id - Work item ID
   * @throws Error if work item not found or has children
   */
  async delete(id: string): Promise<void> {
    // Verify work item exists
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    // Prevent deletion if it has children
    if (existing.childIds && existing.childIds.length > 0) {
      throw new Error(
        `Cannot delete work item ${id}: it has ${existing.childIds.length} child items. Delete children first.`
      );
    }

    // Remove from parent's childIds if it has a parent
    if (existing.parentId) {
      const parent = await this.repository.findById(existing.parentId);
      if (parent) {
        const updatedChildIds = parent.childIds.filter((childId) => childId !== id);
        await this.repository.update(existing.parentId, {
          childIds: updatedChildIds,
        });
      }
    }

    await this.repository.delete(id);
  }

  /**
   * Transition a work item to a new status
   * Validates the transition is allowed and updates relevant timestamps
   * @param id - Work item ID
   * @param newStatus - Target status
   * @returns The updated work item
   * @throws Error if transition is invalid or work item not found
   */
  async transitionStatus(
    id: string,
    newStatus: WorkItemStatus
  ): Promise<WorkItem> {
    // Get current work item
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const currentStatus = workItem.status;

    // Check if already in target status
    if (currentStatus === newStatus) {
      return workItem; // No transition needed
    }

    // Validate transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: cannot move from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.join(", ")}`
      );
    }

    // Check if transition requires approval
    const transitionKey = `${currentStatus}_to_${newStatus}`;
    if (workItem.requiresApproval[transitionKey]) {
      throw new Error(
        `Status transition from '${currentStatus}' to '${newStatus}' requires approval`
      );
    }

    // Update timestamps based on status
    const updates: Partial<WorkItem> = { status: newStatus };

    if (newStatus === "in_progress" && !workItem.startedAt) {
      updates.startedAt = new Date();
    }

    if (newStatus === "done") {
      updates.completedAt = new Date();
    }

    // If moving back from done, clear completedAt
    if (currentStatus === "done") {
      updates.completedAt = null;
    }

    return await this.repository.update(id, updates);
  }

  /**
   * Add a success criterion to a work item
   * @param id - Work item ID
   * @param criterion - Success criterion data (without id)
   * @returns The updated work item
   * @throws Error if work item not found
   */
  async addSuccessCriterion(
    id: string,
    criterion: Omit<SuccessCriterion, "id">
  ): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const newCriterion: SuccessCriterion = {
      id: randomUUID(),
      description: criterion.description,
      completed: criterion.completed || false,
      ...(criterion.verifiedBy && { verifiedBy: criterion.verifiedBy }),
      ...(criterion.verifiedAt && { verifiedAt: criterion.verifiedAt }),
    };

    const updatedCriteria = [...workItem.successCriteria, newCriterion];

    return await this.repository.update(id, {
      successCriteria: updatedCriteria,
    });
  }

  /**
   * Mark a success criterion as complete
   * @param workItemId - Work item ID
   * @param criterionId - Success criterion ID
   * @param verifiedBy - ID of agent or user who verified
   * @returns The updated work item
   * @throws Error if work item or criterion not found
   */
  async markCriterionComplete(
    workItemId: string,
    criterionId: string,
    verifiedBy: string
  ): Promise<WorkItem> {
    const workItem = await this.repository.findById(workItemId);
    if (!workItem) {
      throw new Error(`Work item with ID ${workItemId} not found`);
    }

    const criterionIndex = workItem.successCriteria.findIndex(
      (c) => c.id === criterionId
    );

    if (criterionIndex === -1) {
      throw new Error(
        `Success criterion with ID ${criterionId} not found in work item ${workItemId}`
      );
    }

    // Update the criterion
    const updatedCriteria = [...workItem.successCriteria];
    const existingCriterion = updatedCriteria[criterionIndex];
    if (!existingCriterion) {
      throw new Error(`Criterion at index ${criterionIndex} is undefined`);
    }
    updatedCriteria[criterionIndex] = {
      id: existingCriterion.id,
      description: existingCriterion.description,
      completed: true,
      verifiedBy,
      verifiedAt: Date.now(), // Store as Unix timestamp milliseconds
    };

    return await this.repository.update(workItemId, {
      successCriteria: updatedCriteria,
    });
  }

  /**
   * Check if all success criteria are complete
   * @param id - Work item ID
   * @returns True if all criteria are complete, false otherwise
   * @throws Error if work item not found
   */
  async areAllCriteriaComplete(id: string): Promise<boolean> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    // If no criteria defined, consider it complete
    if (workItem.successCriteria.length === 0) {
      return true;
    }

    // Check if all criteria are completed
    return workItem.successCriteria.every((criterion) => criterion.completed);
  }

  /**
   * Assign an agent to a role for a work item
   * @param id - Work item ID
   * @param role - Agent role
   * @param agentId - Agent ID
   * @returns The updated work item
   * @throws Error if work item not found
   */
  async assignAgent(
    id: string,
    role: AgentRole,
    agentId: string
  ): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const updatedAssignments = {
      ...workItem.assignedAgents,
      [role]: agentId,
    };

    return await this.repository.update(id, {
      assignedAgents: updatedAssignments,
    });
  }

  /**
   * Unassign an agent from a role
   * @param id - Work item ID
   * @param role - Agent role to unassign
   * @returns The updated work item
   * @throws Error if work item not found
   */
  async unassignAgent(id: string, role: AgentRole): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const updatedAssignments = { ...workItem.assignedAgents };
    delete updatedAssignments[role];

    return await this.repository.update(id, {
      assignedAgents: updatedAssignments,
    });
  }

  /**
   * Get all child work items for a parent
   * @param id - Parent work item ID
   * @returns Array of child work items
   */
  async getChildren(id: string): Promise<WorkItem[]> {
    return await this.repository.findChildren(id);
  }

  /**
   * Get work items that are blocking this one
   * @param id - Work item ID
   * @returns Array of blocking work items
   * @throws Error if work item not found
   */
  async getBlocking(id: string): Promise<WorkItem[]> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    if (!workItem.blockedBy || workItem.blockedBy.length === 0) {
      return [];
    }

    return await this.repository.findByIds(workItem.blockedBy);
  }

  /**
   * Add a blocking relationship
   * @param id - Work item ID to be blocked
   * @param blockingId - ID of work item that blocks
   * @returns The updated work item
   * @throws Error if either work item not found
   */
  async addBlocker(id: string, blockingId: string): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    // Verify blocking work item exists
    const blockingItem = await this.repository.findById(blockingId);
    if (!blockingItem) {
      throw new Error(`Blocking work item with ID ${blockingId} not found`);
    }

    // Prevent self-blocking
    if (id === blockingId) {
      throw new Error("Work item cannot block itself");
    }

    // Check if already blocked by this item
    if (workItem.blockedBy.includes(blockingId)) {
      return workItem; // Already blocked, no change needed
    }

    const updatedBlockers = [...workItem.blockedBy, blockingId];

    return await this.repository.update(id, {
      blockedBy: updatedBlockers,
    });
  }

  /**
   * Remove a blocking relationship
   * @param id - Work item ID that is blocked
   * @param blockingId - ID of work item to stop blocking
   * @returns The updated work item
   * @throws Error if work item not found
   */
  async removeBlocker(id: string, blockingId: string): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const updatedBlockers = workItem.blockedBy.filter(
      (blockerId) => blockerId !== blockingId
    );

    return await this.repository.update(id, {
      blockedBy: updatedBlockers,
    });
  }

  /**
   * Check if a work item is blocked
   * @param id - Work item ID
   * @returns True if blocked by any work items, false otherwise
   * @throws Error if work item not found
   */
  async isBlocked(id: string): Promise<boolean> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    return workItem.blockedBy && workItem.blockedBy.length > 0;
  }

  /**
   * Set approval requirement for a status transition
   * @param id - Work item ID
   * @param fromStatus - Source status
   * @param toStatus - Target status
   * @param required - Whether approval is required
   * @returns The updated work item
   * @throws Error if work item not found
   */
  async setTransitionApproval(
    id: string,
    fromStatus: WorkItemStatus,
    toStatus: WorkItemStatus,
    required: boolean
  ): Promise<WorkItem> {
    const workItem = await this.repository.findById(id);
    if (!workItem) {
      throw new Error(`Work item with ID ${id} not found`);
    }

    const transitionKey = `${fromStatus}_to_${toStatus}`;
    const updatedApprovals = {
      ...workItem.requiresApproval,
      [transitionKey]: required,
    };

    return await this.repository.update(id, {
      requiresApproval: updatedApprovals,
    });
  }

  /**
   * Get work items by assigned agent
   * @param agentId - Agent ID
   * @returns Array of work items assigned to the agent
   */
  async getByAssignedAgent(agentId: string): Promise<WorkItem[]> {
    return await this.repository.findByAssignedAgent(agentId);
  }

  /**
   * Get work items by creator
   * @param createdBy - Creator ID
   * @returns Array of work items created by the user
   */
  async getByCreator(createdBy: string): Promise<WorkItem[]> {
    return await this.repository.findByCreator(createdBy);
  }

  /**
   * Get work items by status
   * @param status - Work item status
   * @returns Array of work items with the specified status
   */
  async getByStatus(status: WorkItemStatus): Promise<WorkItem[]> {
    return await this.repository.findByStatus(status);
  }
}
