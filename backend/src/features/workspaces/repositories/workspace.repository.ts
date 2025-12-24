import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../shared/db/index.js";
import {
  workspaces,
  type Workspace,
  type NewWorkspace,
  type WorkspaceStatus,
} from "../../shared/db/schema.js";

/**
 * Repository for managing Workspace entities using Drizzle ORM
 * Provides CRUD operations for workspace management during agent execution
 */
export class WorkspaceRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Find a workspace by ID
   * @param id - Workspace ID
   * @returns Workspace if found, undefined otherwise
   */
  async findById(id: string): Promise<Workspace | undefined> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    return workspace;
  }

  /**
   * Create a new workspace
   * @param data - Workspace data (without id and createdAt)
   * @returns The created workspace
   */
  async create(
    data: Omit<NewWorkspace, "id" | "createdAt">
  ): Promise<Workspace> {
    const newWorkspace: NewWorkspace = {
      id: uuidv4(),
      ...data,
      createdAt: new Date(),
    };

    const [created] = await this.db
      .insert(workspaces)
      .values(newWorkspace)
      .returning();

    if (!created) {
      throw new Error("Failed to create workspace");
    }

    return created;
  }

  /**
   * Find workspaces by worker ID
   * @param workerId - Worker ID to filter by
   * @returns Array of workspaces for the worker
   */
  async findByWorkerId(workerId: string): Promise<Workspace[]> {
    return await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.workerId, workerId));
  }

  /**
   * Find workspaces by status
   * @param status - Workspace status to filter by
   * @returns Array of workspaces with the specified status
   */
  async findByStatus(status: WorkspaceStatus): Promise<Workspace[]> {
    return await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.status, status));
  }

  /**
   * Update workspace status with appropriate timestamp
   * @param id - Workspace ID
   * @param status - New status
   * @returns The updated workspace
   */
  async updateStatus(id: string, status: WorkspaceStatus): Promise<Workspace> {
    const now = new Date();
    const updateData: Partial<Workspace> = { status };

    // Set appropriate timestamp based on status
    if (status === "completed") {
      updateData.completedAt = now;
    } else if (status === "cleaning") {
      updateData.cleanupAt = now;
    }

    const [updated] = await this.db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Workspace with id ${id} not found`);
    }

    return updated;
  }

  /**
   * Update workspace fields
   * @param id - Workspace ID
   * @param data - Partial workspace data to update
   * @returns The updated workspace
   */
  async update(id: string, data: Partial<Workspace>): Promise<Workspace> {
    const [updated] = await this.db
      .update(workspaces)
      .set(data)
      .where(eq(workspaces.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Workspace with id ${id} not found`);
    }

    return updated;
  }

  /**
   * Delete a workspace by ID
   * @param id - Workspace ID
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(workspaces)
      .where(eq(workspaces.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Workspace with id ${id} not found`);
    }
  }

  /**
   * Find all workspaces
   * @returns Array of all workspaces
   */
  async findAll(): Promise<Workspace[]> {
    return await this.db.select().from(workspaces);
  }
}
