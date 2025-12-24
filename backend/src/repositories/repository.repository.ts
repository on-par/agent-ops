import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../db/index.js";
import {
  repositories,
  type Repository,
  type NewRepository,
  type RepoSyncStatus,
} from "../db/schema.js";

export class RepositoryRepository {
  constructor(private db: DrizzleDatabase) {}

  async findById(id: string): Promise<Repository | undefined> {
    const results = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id))
      .limit(1);

    return results[0];
  }

  async findByGitHubRepoId(githubRepoId: number): Promise<Repository | undefined> {
    const results = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, githubRepoId))
      .limit(1);

    return results[0];
  }

  async findByFullName(fullName: string): Promise<Repository | undefined> {
    const results = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.fullName, fullName))
      .limit(1);

    return results[0];
  }

  async findByConnectionId(connectionId: string): Promise<Repository[]> {
    return this.db
      .select()
      .from(repositories)
      .where(eq(repositories.connectionId, connectionId));
  }

  async findAll(): Promise<Repository[]> {
    return this.db.select().from(repositories);
  }

  async findSyncEnabled(): Promise<Repository[]> {
    return this.db
      .select()
      .from(repositories)
      .where(eq(repositories.syncEnabled, true));
  }

  async create(
    data: Omit<NewRepository, "id" | "createdAt" | "updatedAt">
  ): Promise<Repository> {
    const now = new Date();
    const newRepo: NewRepository = {
      id: uuidv4(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(repositories).values(newRepo);

    const created = await this.findById(newRepo.id);
    if (!created) {
      throw new Error("Failed to create repository");
    }

    return created;
  }

  async update(
    id: string,
    data: Partial<Omit<Repository, "id" | "createdAt" | "connectionId" | "githubRepoId">>
  ): Promise<Repository> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    await this.db
      .update(repositories)
      .set(updateData)
      .where(eq(repositories.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Repository not found: ${id}`);
    }

    return updated;
  }

  async updateSyncStatus(
    id: string,
    status: RepoSyncStatus,
    error?: string
  ): Promise<Repository> {
    const updateData: Partial<Repository> = {
      syncStatus: status,
      syncError: error ?? null,
      updatedAt: new Date(),
    };

    if (status === "synced") {
      updateData.lastSyncAt = new Date();
      updateData.syncError = null;
    }

    await this.db
      .update(repositories)
      .set(updateData)
      .where(eq(repositories.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Repository not found: ${id}`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(repositories)
      .where(eq(repositories.id, id));
  }

  async deleteByConnectionId(connectionId: string): Promise<void> {
    await this.db
      .delete(repositories)
      .where(eq(repositories.connectionId, connectionId));
  }
}
