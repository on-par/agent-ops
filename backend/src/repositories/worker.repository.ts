import { eq, inArray, or } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/index.js";
import {
  workers,
  type Worker,
  type NewWorker,
  type WorkerStatus,
} from "../db/schema.js";

/**
 * Repository for managing Worker entities using Drizzle ORM
 * Provides CRUD operations and specialized queries for worker management
 */
export class WorkerRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Create a new worker
   * @param worker - Worker data to insert
   * @returns The created worker
   */
  async create(worker: NewWorker): Promise<Worker> {
    const [createdWorker] = await this.db
      .insert(workers)
      .values(worker)
      .returning();

    if (!createdWorker) {
      throw new Error("Failed to create worker");
    }

    return createdWorker;
  }

  /**
   * Find a worker by ID
   * @param id - Worker ID
   * @returns Worker if found, null otherwise
   */
  async findById(id: string): Promise<Worker | null> {
    const [worker] = await this.db
      .select()
      .from(workers)
      .where(eq(workers.id, id))
      .limit(1);

    return worker || null;
  }

  /**
   * Get all workers
   * @returns Array of all workers
   */
  async findAll(): Promise<Worker[]> {
    return await this.db.select().from(workers);
  }

  /**
   * Find workers by status
   * @param status - Worker status to filter by
   * @returns Array of workers with the specified status
   */
  async findByStatus(status: WorkerStatus): Promise<Worker[]> {
    return await this.db
      .select()
      .from(workers)
      .where(eq(workers.status, status));
  }

  /**
   * Find workers by template ID
   * @param templateId - Template ID to filter by
   * @returns Array of workers using the specified template
   */
  async findByTemplate(templateId: string): Promise<Worker[]> {
    return await this.db
      .select()
      .from(workers)
      .where(eq(workers.templateId, templateId));
  }

  /**
   * Get active workers (status is "idle" or "working")
   * @returns Array of active workers
   */
  async findActive(): Promise<Worker[]> {
    return await this.db
      .select()
      .from(workers)
      .where(or(eq(workers.status, "idle"), eq(workers.status, "working")));
  }

  /**
   * Update a worker by ID
   * @param id - Worker ID
   * @param updates - Partial worker data to update
   * @returns The updated worker
   * @throws Error if worker not found
   */
  async update(id: string, updates: Partial<Worker>): Promise<Worker> {
    const [updatedWorker] = await this.db
      .update(workers)
      .set(updates)
      .where(eq(workers.id, id))
      .returning();

    if (!updatedWorker) {
      throw new Error(`Worker with id ${id} not found`);
    }

    return updatedWorker;
  }

  /**
   * Update worker metrics (tokensUsed, costUsd, toolCalls)
   * @param id - Worker ID
   * @param metrics - Metrics to update
   * @returns The updated worker
   * @throws Error if worker not found
   */
  async updateMetrics(
    id: string,
    metrics: { tokensUsed?: number; costUsd?: number; toolCalls?: number }
  ): Promise<Worker> {
    // Fetch current worker to increment metrics
    const currentWorker = await this.findById(id);
    if (!currentWorker) {
      throw new Error(`Worker with id ${id} not found`);
    }

    // Prepare updates - increment existing values
    const updates: Partial<Worker> = {};
    if (metrics.tokensUsed !== undefined) {
      updates.tokensUsed = currentWorker.tokensUsed + metrics.tokensUsed;
    }
    if (metrics.costUsd !== undefined) {
      updates.costUsd = currentWorker.costUsd + metrics.costUsd;
    }
    if (metrics.toolCalls !== undefined) {
      updates.toolCalls = currentWorker.toolCalls + metrics.toolCalls;
    }

    return await this.update(id, updates);
  }

  /**
   * Delete a worker by ID
   * @param id - Worker ID
   * @throws Error if worker not found
   */
  async delete(id: string): Promise<void> {
    const result = await this.db
      .delete(workers)
      .where(eq(workers.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Worker with id ${id} not found`);
    }
  }
}
