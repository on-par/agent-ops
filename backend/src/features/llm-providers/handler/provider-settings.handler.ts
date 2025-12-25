import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { ProviderSettingsRepository } from "../repositories/provider-settings.repository.js";
import { ProviderSettingsService } from "../services/provider-settings.service.js";
import type { ProviderType, ProviderSettingsInput } from "../types/provider-settings.types.js";

interface ProviderSettingsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
}

// Zod schemas for validation
const providerTypeSchema = z.enum(["ollama", "openai", "anthropic", "openrouter"]);

const createSettingsSchema = z.object({
  providerType: providerTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1, "Model is required"),
  isDefault: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  providerType: providerTypeSchema.optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

const testConnectionSchema = z.object({
  providerType: providerTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
});

export async function providerSettingsHandler(
  app: FastifyInstance,
  options: ProviderSettingsHandlerOptions
): Promise<void> {
  const { db } = options;
  const repository = new ProviderSettingsRepository(db);
  const service = new ProviderSettingsService(repository);

  /**
   * GET /api/provider-settings
   * List all provider settings
   */
  app.get("/", async (_request, reply) => {
    try {
      const settings = await service.getAllSettings();
      return reply.send({ settings });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: "Failed to fetch settings", message });
    }
  });

  /**
   * GET /api/provider-settings/:id
   * Get a specific provider setting
   */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      const setting = await service.getSettings(request.params.id);
      return reply.send({ setting });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found")) {
        return reply.status(404).send({ error: "Setting not found" });
      }
      return reply.status(500).send({ error: "Failed to fetch setting", message });
    }
  });

  /**
   * POST /api/provider-settings
   * Create a new provider setting
   */
  app.post<{ Body: z.infer<typeof createSettingsSchema> }>(
    "/",
    async (request, reply) => {
      try {
        const validated = createSettingsSchema.parse(request.body);
        const input: ProviderSettingsInput = {
          providerType: validated.providerType,
          model: validated.model,
        };
        if (validated.baseUrl !== undefined) input.baseUrl = validated.baseUrl;
        if (validated.apiKey !== undefined) input.apiKey = validated.apiKey;
        if (validated.isDefault !== undefined) input.isDefault = validated.isDefault;
        const setting = await service.createSettings(input);
        return reply.status(201).send({ setting });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: "Validation failed", details: error.flatten() });
        }
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: "Failed to create setting", message });
      }
    }
  );

  /**
   * PUT /api/provider-settings/:id
   * Update a provider setting
   */
  app.put<{ Params: { id: string }; Body: z.infer<typeof updateSettingsSchema> }>(
    "/:id",
    async (request, reply) => {
      try {
        const validated = updateSettingsSchema.parse(request.body);
        const input: Partial<ProviderSettingsInput> = {};
        if (validated.providerType !== undefined) input.providerType = validated.providerType;
        if (validated.model !== undefined) input.model = validated.model;
        if (validated.baseUrl !== undefined) input.baseUrl = validated.baseUrl;
        if (validated.apiKey !== undefined) input.apiKey = validated.apiKey;
        if (validated.isDefault !== undefined) input.isDefault = validated.isDefault;
        const setting = await service.updateSettings(request.params.id, input);
        return reply.send({ setting });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: "Validation failed", details: error.flatten() });
        }
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("not found")) {
          return reply.status(404).send({ error: "Setting not found" });
        }
        return reply.status(500).send({ error: "Failed to update setting", message });
      }
    }
  );

  /**
   * DELETE /api/provider-settings/:id
   * Delete a provider setting
   */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await service.deleteSettings(request.params.id);
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found")) {
        return reply.status(404).send({ error: "Setting not found" });
      }
      return reply.status(500).send({ error: "Failed to delete setting", message });
    }
  });

  /**
   * POST /api/provider-settings/test-connection
   * Test provider connection
   */
  app.post<{ Body: z.infer<typeof testConnectionSchema> }>(
    "/test-connection",
    async (request, reply) => {
      try {
        const validated = testConnectionSchema.parse(request.body);
        const result = await service.testConnection(
          validated.providerType as ProviderType,
          validated.baseUrl,
          validated.apiKey
        );
        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: "Validation failed", details: error.flatten() });
        }
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: "Connection test failed", message });
      }
    }
  );

  /**
   * GET /api/provider-settings/models/:providerType
   * Fetch available models for a provider
   */
  app.get<{
    Params: { providerType: string };
    Querystring: { baseUrl?: string; apiKey?: string };
  }>("/models/:providerType", async (request, reply) => {
    try {
      const validated = providerTypeSchema.parse(request.params.providerType);
      const models = await service.fetchAvailableModels(
        validated,
        request.query.baseUrl,
        request.query.apiKey
      );
      return reply.send({ models });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: "Validation failed", details: error.flatten() });
      }
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: "Failed to fetch models", message });
    }
  });

  /**
   * POST /api/provider-settings/:id/set-default
   * Set a provider as default
   */
  app.post<{ Params: { id: string } }>("/:id/set-default", async (request, reply) => {
    try {
      const setting = await service.setDefaultSettings(request.params.id);
      return reply.send({ setting });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found")) {
        return reply.status(404).send({ error: "Setting not found" });
      }
      return reply.status(500).send({ error: "Failed to set default", message });
    }
  });
}
