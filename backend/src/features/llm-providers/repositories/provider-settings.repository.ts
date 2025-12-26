import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import {
  providerSettings,
  type ProviderSettingsRecord,
  type NewProviderSettingsRecord,
} from "../../../shared/db/schema.js";

/**
 * Repository for Provider Settings database operations
 * Provides CRUD operations and specialized queries for LLM provider configuration
 */
export class ProviderSettingsRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Create a new provider settings record
   * @param data - Provider settings data to insert
   * @returns The created provider settings record
   * @throws Error if creation fails
   */
  async create(data: NewProviderSettingsRecord): Promise<ProviderSettingsRecord> {
    try {
      const result = await this.db.insert(providerSettings).values(data).returning();

      if (result.length === 0 || !result[0]) {
        throw new Error("Failed to create provider settings: No data returned");
      }

      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to create provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find provider settings by ID
   * @param id - Provider settings ID
   * @returns The provider settings record or undefined if not found
   */
  async findById(id: string): Promise<ProviderSettingsRecord | undefined> {
    try {
      const result = await this.db
        .select()
        .from(providerSettings)
        .where(eq(providerSettings.id, id))
        .limit(1);

      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      throw new Error(
        `Failed to find provider settings by ID: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find all provider settings
   * @returns Array of all provider settings records
   */
  async findAll(): Promise<ProviderSettingsRecord[]> {
    try {
      return await this.db.select().from(providerSettings);
    } catch (error) {
      throw new Error(
        `Failed to find all provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find the default provider settings
   * @returns The default provider settings record or undefined if none is set
   */
  async findDefault(): Promise<ProviderSettingsRecord | undefined> {
    try {
      const result = await this.db
        .select()
        .from(providerSettings)
        .where(eq(providerSettings.isDefault, true))
        .limit(1);

      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      throw new Error(
        `Failed to find default provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update a provider settings record
   * @param id - Provider settings ID
   * @param data - Partial provider settings data to update
   * @returns The updated provider settings record
   * @throws Error if record not found or update fails
   */
  async update(
    id: string,
    data: Partial<Omit<NewProviderSettingsRecord, "id">>
  ): Promise<ProviderSettingsRecord> {
    try {
      const result = await this.db
        .update(providerSettings)
        .set({
          ...data,
          updatedAt: data.updatedAt || new Date(),
        })
        .where(eq(providerSettings.id, id))
        .returning();

      if (result.length === 0 || !result[0]) {
        throw new Error("Provider settings record not found");
      }

      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to update provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a provider settings record
   * @param id - Provider settings ID
   * @throws Error if deletion fails
   */
  async delete(id: string): Promise<void> {
    try {
      await this.db.delete(providerSettings).where(eq(providerSettings.id, id));
    } catch (error) {
      throw new Error(
        `Failed to delete provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set a provider as default and clear all other defaults
   * @param id - Provider settings ID to set as default
   * @returns The updated provider settings record with isDefault=true
   * @throws Error if record not found or operation fails
   */
  async setAsDefault(id: string): Promise<ProviderSettingsRecord> {
    try {
      // Clear all other defaults
      await this.db
        .update(providerSettings)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(providerSettings.isDefault, true));

      // Set the specified one as default
      const result = await this.db
        .update(providerSettings)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(providerSettings.id, id))
        .returning();

      if (result.length === 0 || !result[0]) {
        throw new Error("Provider settings record not found");
      }

      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to set default provider settings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
