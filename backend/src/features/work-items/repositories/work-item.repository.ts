import { eq, and, inArray } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../db/index.js";
import {
  workItems,
  type WorkItem,
  type NewWorkItem,
  type WorkItemStatus,
  type WorkItemType,
} from "../../../db/schema.js";

/**
 * Repository for Work Item database operations
 * Provides comprehensive CRUD operations and specialized queries
 */
export class WorkItemRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Create a new work item
   * @param item - Work item data to insert
   * @returns The created work item
   * @throws Error if creation fails
   */
  async create(item: NewWorkItem): Promise<WorkItem> {
    try {
      const now = new Date();
      const workItem: NewWorkItem = {
        ...item,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };

      const result = await this.db.insert(workItems).values(workItem).returning();

      if (result.length === 0 || !result[0]) {
        throw new Error("Failed to create work item: No data returned");
      }

      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to create work item: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find a work item by ID
   * @param id - Work item ID
   * @returns The work item or null if not found
   */
  async findById(id: string): Promise<WorkItem | null> {
    try {
      const result = await this.db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id))
        .limit(1);

      return result.length > 0 && result[0] ? result[0] : null;
    } catch (error) {
      throw new Error(
        `Failed to find work item by ID: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find all work items with optional filters
   * @param filters - Optional filters for status and type
   * @returns Array of matching work items
   */
  async findAll(filters?: {
    status?: WorkItemStatus;
    type?: WorkItemType;
  }): Promise<WorkItem[]> {
    try {
      let query = this.db.select().from(workItems);

      // Apply filters if provided
      const conditions = [];
      if (filters?.status) {
        conditions.push(eq(workItems.status, filters.status));
      }
      if (filters?.type) {
        conditions.push(eq(workItems.type, filters.type));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      return await query;
    } catch (error) {
      throw new Error(
        `Failed to find work items: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update a work item
   * @param id - Work item ID
   * @param updates - Partial work item data to update
   * @returns The updated work item
   * @throws Error if work item not found or update fails
   */
  async update(id: string, updates: Partial<WorkItem>): Promise<WorkItem> {
    try {
      // Ensure updatedAt is set
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await this.db
        .update(workItems)
        .set(updateData)
        .where(eq(workItems.id, id))
        .returning();

      if (result.length === 0 || !result[0]) {
        throw new Error(`Work item with ID ${id} not found`);
      }

      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to update work item: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a work item by ID
   * @param id - Work item ID
   * @throws Error if work item not found or deletion fails
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await this.db
        .delete(workItems)
        .where(eq(workItems.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error(`Work item with ID ${id} not found`);
      }
    } catch (error) {
      throw new Error(
        `Failed to delete work item: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find work items by status
   * @param status - Work item status to filter by
   * @returns Array of work items with the specified status
   */
  async findByStatus(status: WorkItemStatus): Promise<WorkItem[]> {
    try {
      return await this.db
        .select()
        .from(workItems)
        .where(eq(workItems.status, status));
    } catch (error) {
      throw new Error(
        `Failed to find work items by status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find child work items for a parent
   * @param parentId - Parent work item ID
   * @returns Array of child work items
   */
  async findChildren(parentId: string): Promise<WorkItem[]> {
    try {
      return await this.db
        .select()
        .from(workItems)
        .where(eq(workItems.parentId, parentId));
    } catch (error) {
      throw new Error(
        `Failed to find child work items: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find all blocked work items
   * Returns work items that have blockers (non-empty blockedBy array)
   * @returns Array of blocked work items
   */
  async findBlocked(): Promise<WorkItem[]> {
    try {
      // In SQLite with Drizzle, we need to check if the JSON array has elements
      // We'll fetch all and filter in memory, or use a raw SQL query
      const allItems = await this.db.select().from(workItems);

      // Filter items that have blockers
      return allItems.filter((item) => {
        return item.blockedBy && item.blockedBy.length > 0;
      });
    } catch (error) {
      throw new Error(
        `Failed to find blocked work items: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find work items by multiple IDs
   * @param ids - Array of work item IDs
   * @returns Array of matching work items
   */
  async findByIds(ids: string[]): Promise<WorkItem[]> {
    try {
      if (ids.length === 0) {
        return [];
      }

      return await this.db
        .select()
        .from(workItems)
        .where(inArray(workItems.id, ids));
    } catch (error) {
      throw new Error(
        `Failed to find work items by IDs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find work items assigned to a specific agent
   * @param agentId - Agent ID
   * @returns Array of work items assigned to the agent
   */
  async findByAssignedAgent(agentId: string): Promise<WorkItem[]> {
    try {
      const allItems = await this.db.select().from(workItems);

      // Filter items where the agent is assigned in any role
      return allItems.filter((item) => {
        return (
          item.assignedAgents &&
          Object.values(item.assignedAgents).includes(agentId)
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to find work items by assigned agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Count work items by status
   * @returns Object with status counts
   */
  async countByStatus(): Promise<Record<WorkItemStatus, number>> {
    try {
      const items = await this.db.select().from(workItems);

      const counts: Record<string, number> = {
        backlog: 0,
        ready: 0,
        in_progress: 0,
        review: 0,
        done: 0,
      };

      items.forEach((item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
      });

      return counts as Record<WorkItemStatus, number>;
    } catch (error) {
      throw new Error(
        `Failed to count work items by status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find work items created by a specific user
   * @param createdBy - User ID or identifier
   * @returns Array of work items created by the user
   */
  async findByCreator(createdBy: string): Promise<WorkItem[]> {
    try {
      return await this.db
        .select()
        .from(workItems)
        .where(eq(workItems.createdBy, createdBy));
    } catch (error) {
      throw new Error(
        `Failed to find work items by creator: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Batch create multiple work items
   * @param items - Array of work items to create
   * @returns Array of created work items
   */
  async batchCreate(items: NewWorkItem[]): Promise<WorkItem[]> {
    try {
      if (items.length === 0) {
        return [];
      }

      const now = new Date();
      const workItemsToInsert = items.map((item) => ({
        ...item,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      }));

      const result = await this.db
        .insert(workItems)
        .values(workItemsToInsert)
        .returning();

      return result;
    } catch (error) {
      throw new Error(
        `Failed to batch create work items: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if a work item exists
   * @param id - Work item ID
   * @returns True if exists, false otherwise
   */
  async exists(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .select({ id: workItems.id })
        .from(workItems)
        .where(eq(workItems.id, id))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      throw new Error(
        `Failed to check work item existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
