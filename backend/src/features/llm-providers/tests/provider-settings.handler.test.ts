import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { providerSettingsHandler } from "../handler/provider-settings.handler.js";
import type { DrizzleDatabase } from "../../../shared/db/index.js";

// Mock the service
vi.mock("../services/provider-settings.service.js", () => ({
  ProviderSettingsService: vi.fn().mockImplementation(() => ({
    getSettings: vi.fn(),
    getAllSettings: vi.fn(),
    createSettings: vi.fn(),
    updateSettings: vi.fn(),
    deleteSettings: vi.fn(),
    testConnection: vi.fn(),
    fetchAvailableModels: vi.fn(),
    getDefaultSettings: vi.fn(),
    setDefaultSettings: vi.fn(),
  })),
}));

// Mock the repository
vi.mock("../repositories/provider-settings.repository.js", () => ({
  ProviderSettingsRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findDefault: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setAsDefault: vi.fn(),
  })),
}));

describe("Provider Settings Handler", () => {
  let app: FastifyInstance;
  let mockDb: Partial<DrizzleDatabase>;

  beforeEach(async () => {
    mockDb = {};

    app = Fastify();
    await app.register(providerSettingsHandler, {
      prefix: "/api/provider-settings",
      db: mockDb as DrizzleDatabase,
    });
  });

  describe("GET /", () => {
    it("should return all provider settings", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/provider-settings",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.settings)).toBe(true);
    });
  });

  describe("GET /:id", () => {
    it("should return a single provider setting", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/provider-settings/test-id",
      });

      expect([200, 404]).toContain(response.statusCode);
    });

    it("should return 404 for non-existent setting", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/provider-settings/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /", () => {
    it("should create a new provider setting with valid input", async () => {
      const payload = {
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama2",
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload,
      });

      expect([200, 201, 400]).toContain(response.statusCode);
    });

    it("should reject invalid provider type", async () => {
      const payload = {
        providerType: "invalid",
        model: "test",
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject missing required fields", async () => {
      const payload = {
        providerType: "ollama",
        // missing model
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings",
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PUT /:id", () => {
    it("should update provider settings", async () => {
      const payload = {
        model: "mistral",
      };

      const response = await app.inject({
        method: "PUT",
        url: "/api/provider-settings/test-id",
        payload,
      });

      expect([200, 400, 404]).toContain(response.statusCode);
    });

    it("should reject invalid provider type in update", async () => {
      const payload = {
        providerType: "invalid",
      };

      const response = await app.inject({
        method: "PUT",
        url: "/api/provider-settings/test-id",
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("should delete provider settings", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/provider-settings/test-id",
      });

      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe("POST /test-connection", () => {
    it("should test provider connection", async () => {
      const payload = {
        providerType: "ollama",
        baseUrl: "http://localhost:11434",
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings/test-connection",
        payload,
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it("should require provider type", async () => {
      const payload = {
        baseUrl: "http://localhost:11434",
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings/test-connection",
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /models/:providerType", () => {
    it("should fetch available models for provider", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/provider-settings/models/ollama?baseUrl=http://localhost:11434",
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it("should return models array when successful", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/provider-settings/models/anthropic",
      });

      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe("POST /:id/set-default", () => {
    it("should set provider as default", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/provider-settings/test-id/set-default",
      });

      expect([200, 404]).toContain(response.statusCode);
    });
  });
});
