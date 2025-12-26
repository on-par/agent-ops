import { describe, it, expect, beforeEach } from "vitest";
import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { ProviderSettingsRepository } from "../repositories/provider-settings.repository.js";
import type { NewProviderSettingsRecord } from "../../../shared/db/schema.js";

describe("ProviderSettingsRepository", () => {
  let db: Database;
  let drizzleDb: ReturnType<typeof drizzle>;
  let repository: ProviderSettingsRepository;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Run migrations
    db.exec(`
      CREATE TABLE provider_settings (
        id TEXT PRIMARY KEY,
        provider_type TEXT NOT NULL,
        base_url TEXT,
        api_key_encrypted TEXT,
        model TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    drizzleDb = drizzle(db, { schema });
    repository = new ProviderSettingsRepository(drizzleDb);
  });

  describe("create", () => {
    it("should create a new provider settings record", async () => {
      const now = new Date();
      const input: NewProviderSettingsRecord = {
        id: "ollama-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      const result = await repository.create(input);

      expect(result.id).toBe("ollama-1");
      expect(result.providerType).toBe("ollama");
      expect(result.model).toBe("llama2");
      expect(result.isDefault).toBe(false);
    });
  });

  describe("findById", () => {
    it("should find a settings record by ID", async () => {
      const now = new Date();
      const input: NewProviderSettingsRecord = {
        id: "test-1",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
        model: "gpt-4o",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(input);
      const result = await repository.findById("test-1");

      expect(result).toBeDefined();
      expect(result?.id).toBe("test-1");
      expect(result?.providerType).toBe("openai");
    });

    it("should return undefined when record not found", async () => {
      const result = await repository.findById("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("findAll", () => {
    it("should return all provider settings", async () => {
      const now = new Date();
      const settings1: NewProviderSettingsRecord = {
        id: "ollama-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      const settings2: NewProviderSettingsRecord = {
        id: "openai-1",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
        model: "gpt-4o",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(settings1);
      await repository.create(settings2);

      const results = await repository.findAll();

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.providerType === "ollama")).toBe(true);
      expect(results.some((r) => r.providerType === "openai")).toBe(true);
    });
  });

  describe("findDefault", () => {
    it("should return the default provider settings", async () => {
      const now = new Date();
      const settings1: NewProviderSettingsRecord = {
        id: "ollama-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      const settings2: NewProviderSettingsRecord = {
        id: "openai-1",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
        model: "gpt-4o",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(settings1);
      await repository.create(settings2);

      const result = await repository.findDefault();

      expect(result?.id).toBe("openai-1");
      expect(result?.isDefault).toBe(true);
    });

    it("should return undefined when no default is set", async () => {
      const result = await repository.findDefault();
      expect(result).toBeUndefined();
    });
  });

  describe("update", () => {
    it("should update an existing record", async () => {
      const now = new Date();
      const input: NewProviderSettingsRecord = {
        id: "test-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(input);

      const updated = await repository.update("test-1", {
        model: "mistral",
        updatedAt: new Date(),
      });

      expect(updated.model).toBe("mistral");
      expect(updated.providerType).toBe("ollama");
    });
  });

  describe("delete", () => {
    it("should delete a record", async () => {
      const now = new Date();
      const input: NewProviderSettingsRecord = {
        id: "test-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(input);
      await repository.delete("test-1");

      const result = await repository.findById("test-1");
      expect(result).toBeUndefined();
    });
  });

  describe("setAsDefault", () => {
    it("should set one provider as default and clear others", async () => {
      const now = new Date();
      const settings1: NewProviderSettingsRecord = {
        id: "ollama-1",
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        apiKeyEncrypted: null,
        model: "llama2",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };

      const settings2: NewProviderSettingsRecord = {
        id: "openai-1",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted-key",
        model: "gpt-4o",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      await repository.create(settings1);
      await repository.create(settings2);

      // Set openai as default
      await repository.setAsDefault("openai-1");

      const ollama = await repository.findById("ollama-1");
      const openai = await repository.findById("openai-1");

      expect(ollama?.isDefault).toBe(false);
      expect(openai?.isDefault).toBe(true);
    });
  });
});
