import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../../db/index.js";
import {
  githubConnections,
  type GitHubConnection,
  type NewGitHubConnection,
} from "../../../db/schema.js";

export class GitHubConnectionRepository {
  constructor(private db: DrizzleDatabase) {}

  async findById(id: string): Promise<GitHubConnection | undefined> {
    const results = await this.db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, id))
      .limit(1);

    return results[0];
  }

  async findByGitHubUserId(githubUserId: number): Promise<GitHubConnection | undefined> {
    const results = await this.db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.githubUserId, githubUserId))
      .limit(1);

    return results[0];
  }

  async findByUsername(username: string): Promise<GitHubConnection | undefined> {
    const results = await this.db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.githubUsername, username))
      .limit(1);

    return results[0];
  }

  async findAll(): Promise<GitHubConnection[]> {
    return this.db.select().from(githubConnections);
  }

  async create(
    data: Omit<NewGitHubConnection, "id" | "createdAt" | "updatedAt">
  ): Promise<GitHubConnection> {
    const now = new Date();
    const newConnection: NewGitHubConnection = {
      id: uuidv4(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(githubConnections).values(newConnection);

    const created = await this.findById(newConnection.id);
    if (!created) {
      throw new Error("Failed to create GitHub connection");
    }

    return created;
  }

  async upsert(
    data: Omit<NewGitHubConnection, "id" | "createdAt" | "updatedAt">
  ): Promise<GitHubConnection> {
    const existing = await this.findByGitHubUserId(data.githubUserId);

    if (existing) {
      const updateData: Parameters<typeof this.update>[1] = {
        accessToken: data.accessToken,
      };
      if (data.scopes !== undefined) {
        updateData.scopes = data.scopes;
      }
      if (data.refreshToken !== undefined) {
        updateData.refreshToken = data.refreshToken;
      }
      if (data.tokenExpiresAt !== undefined) {
        updateData.tokenExpiresAt = data.tokenExpiresAt;
      }
      if (data.githubAvatarUrl !== undefined) {
        updateData.githubAvatarUrl = data.githubAvatarUrl;
      }
      return this.update(existing.id, updateData);
    }

    return this.create(data);
  }

  async update(
    id: string,
    data: Partial<Omit<GitHubConnection, "id" | "createdAt" | "githubUserId">>
  ): Promise<GitHubConnection> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    await this.db
      .update(githubConnections)
      .set(updateData)
      .where(eq(githubConnections.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`GitHub connection not found: ${id}`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(githubConnections)
      .where(eq(githubConnections.id, id));
  }
}
