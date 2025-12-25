import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import {
  containers,
  type Container,
  type NewContainer,
  type ContainerStatus,
} from "../../../shared/db/schema.js";

/**
 * Repository for managing Container entities using Drizzle ORM
 * Provides CRUD operations and specialized queries for container management
 */
export class ContainerRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Create a new container
   * @param container - Container data to insert
   * @returns The created container
   */
  async create(container: NewContainer): Promise<Container> {
    const [createdContainer] = await this.db
      .insert(containers)
      .values(container)
      .returning();

    if (!createdContainer) {
      throw new Error("Failed to create container");
    }

    return createdContainer;
  }

  /**
   * Find a container by ID
   * @param id - Container ID
   * @returns Container if found, null otherwise
   */
  async findById(id: string): Promise<Container | null> {
    const [container] = await this.db
      .select()
      .from(containers)
      .where(eq(containers.id, id))
      .limit(1);

    return container || null;
  }

  /**
   * Find a container by Docker container ID
   * @param containerId - Docker container ID
   * @returns Container if found, null otherwise
   */
  async findByContainerId(containerId: string): Promise<Container | null> {
    const [container] = await this.db
      .select()
      .from(containers)
      .where(eq(containers.containerId, containerId))
      .limit(1);

    return container || null;
  }

  /**
   * Get all containers
   * @returns Array of all containers
   */
  async findAll(): Promise<Container[]> {
    return await this.db.select().from(containers);
  }

  /**
   * Find containers by status
   * @param status - Container status to filter by
   * @returns Array of containers with the specified status
   */
  async findByStatus(status: ContainerStatus): Promise<Container[]> {
    return await this.db
      .select()
      .from(containers)
      .where(eq(containers.status, status));
  }

  /**
   * Find containers by workspace ID
   * @param workspaceId - Workspace ID to filter by
   * @returns Array of containers associated with the workspace
   */
  async findByWorkspaceId(workspaceId: string): Promise<Container[]> {
    return await this.db
      .select()
      .from(containers)
      .where(eq(containers.workspaceId, workspaceId));
  }

  /**
   * Find containers by execution ID
   * @param executionId - Execution ID to filter by
   * @returns Array of containers associated with the execution
   */
  async findByExecutionId(executionId: string): Promise<Container[]> {
    return await this.db
      .select()
      .from(containers)
      .where(eq(containers.executionId, executionId));
  }

  /**
   * Update container status
   * @param id - Container ID
   * @param status - New status
   * @returns The updated container
   * @throws Error if container not found
   */
  async updateStatus(id: string, status: ContainerStatus): Promise<Container> {
    const [updatedContainer] = await this.db
      .update(containers)
      .set({ status })
      .where(eq(containers.id, id))
      .returning();

    if (!updatedContainer) {
      throw new Error(`Container with id ${id} not found`);
    }

    return updatedContainer;
  }

  /**
   * Update a container by ID
   * @param id - Container ID
   * @param updates - Partial container data to update
   * @returns The updated container
   * @throws Error if container not found
   */
  async update(id: string, updates: Partial<Container>): Promise<Container> {
    const [updatedContainer] = await this.db
      .update(containers)
      .set(updates)
      .where(eq(containers.id, id))
      .returning();

    if (!updatedContainer) {
      throw new Error(`Container with id ${id} not found`);
    }

    return updatedContainer;
  }

  /**
   * Delete a container by ID
   * @param id - Container ID
   * @throws Error if container not found
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(containers)
      .where(eq(containers.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Container with id ${id} not found`);
    }
  }
}
