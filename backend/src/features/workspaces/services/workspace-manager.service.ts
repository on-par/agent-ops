import { dir as tmpDir } from "tmp-promise";
import { rm } from "fs/promises";
import type { DrizzleDatabase } from "../../../db/index.js";
import { WorkspaceRepository } from "../repositories/workspace.repository.js";
import type { Workspace, WorkspaceStatus } from "../../../db/schema.js";

export interface WorkspaceManagerConfig {
  baseDir?: string;
  cleanupDelayMs?: number;
}

/**
 * Service for managing temporary workspaces for agent execution
 * Handles creation, tracking, and cleanup of isolated workspace directories
 */
export class WorkspaceManagerService {
  private repository: WorkspaceRepository;
  private config: Required<WorkspaceManagerConfig>;

  constructor(db: DrizzleDatabase, config: WorkspaceManagerConfig = {}) {
    this.repository = new WorkspaceRepository(db);
    this.config = {
      baseDir: config.baseDir ?? "/tmp/agent-workspaces",
      cleanupDelayMs: config.cleanupDelayMs ?? 3600000, // 1 hour default
    };
  }

  /**
   * Create a new workspace with a temporary directory
   * @param workerId - ID of the worker using this workspace
   * @param workItemId - ID of the work item being processed
   * @param repositoryId - ID of the repository being worked on
   * @returns The created workspace record
   */
  async createWorkspace(
    workerId?: string,
    workItemId?: string,
    repositoryId?: string
  ): Promise<Workspace> {
    // Create temporary directory
    const tmpDirResult = await tmpDir({
      prefix: "agent-workspace-",
      tmpdir: this.config.baseDir,
      unsafeCleanup: true,
    });

    // Create database record
    const workspace = await this.repository.create({
      workerId: workerId ?? null,
      workItemId: workItemId ?? null,
      repositoryId: repositoryId ?? null,
      path: tmpDirResult.path,
      status: "active",
    });

    return workspace;
  }

  /**
   * Get a workspace by ID
   * @param id - Workspace ID
   * @returns The workspace if found
   */
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.repository.findById(id);
  }

  /**
   * Get the filesystem path for a workspace
   * @param id - Workspace ID
   * @returns The filesystem path
   * @throws Error if workspace not found
   */
  async getWorkspacePath(id: string): Promise<string> {
    const workspace = await this.repository.findById(id);
    if (!workspace) {
      throw new Error(`Workspace with id ${id} not found`);
    }
    return workspace.path;
  }

  /**
   * Cleanup a workspace - removes directory and marks as cleaning
   * @param id - Workspace ID
   */
  async cleanupWorkspace(id: string): Promise<void> {
    const workspace = await this.repository.findById(id);
    if (!workspace) {
      throw new Error(`Workspace with id ${id} not found`);
    }

    // Update status to cleaning
    await this.repository.updateStatus(id, "cleaning");

    // Remove the directory
    try {
      await rm(workspace.path, { recursive: true, force: true });
    } catch (error) {
      // Directory might already be gone, that's okay
      const errCode = (error as { code?: string }).code;
      if (errCode !== "ENOENT") {
        throw error;
      }
    }
  }

  /**
   * List all active workspaces
   * @returns Array of active workspaces
   */
  async listActiveWorkspaces(): Promise<Workspace[]> {
    return this.repository.findByStatus("active");
  }

  /**
   * Cleanup workspaces older than the specified age
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Number of workspaces cleaned up
   */
  async cleanupStaleWorkspaces(maxAgeMs?: number): Promise<number> {
    const age = maxAgeMs ?? this.config.cleanupDelayMs;
    const cutoffTime = new Date(Date.now() - age);

    // Get all active workspaces
    const activeWorkspaces = await this.repository.findByStatus("active");

    let cleanedCount = 0;
    for (const workspace of activeWorkspaces) {
      if (workspace.createdAt < cutoffTime) {
        try {
          await this.cleanupWorkspace(workspace.id);
          cleanedCount++;
        } catch (error) {
          // Log but continue with other workspaces
          console.error(`Failed to cleanup workspace ${workspace.id}:`, error);
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Update workspace status
   * @param id - Workspace ID
   * @param status - New status
   * @returns Updated workspace
   */
  async updateStatus(id: string, status: WorkspaceStatus): Promise<Workspace> {
    return this.repository.updateStatus(id, status);
  }

  /**
   * Update workspace branch name
   * @param id - Workspace ID
   * @param branchName - Branch name
   * @returns Updated workspace
   */
  async updateBranchName(id: string, branchName: string): Promise<Workspace> {
    return this.repository.update(id, { branchName });
  }

  /**
   * Find workspaces by worker ID
   * @param workerId - Worker ID
   * @returns Array of workspaces for the worker
   */
  async findByWorkerId(workerId: string): Promise<Workspace[]> {
    return this.repository.findByWorkerId(workerId);
  }
}
