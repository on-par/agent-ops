import { z } from "zod";

/**
 * Agent role types for workflow specialization
 */
export const AgentRoleSchema = z.enum([
  "refiner",
  "implementer",
  "tester",
  "reviewer",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

/**
 * Permission modes for agent autonomy levels
 */
export const PermissionModeSchema = z.enum([
  "askUser",
  "acceptEdits",
  "bypassPermissions",
]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/**
 * MCP server configuration schema
 * Supports stdio, SSE (Server-Sent Events), and in-process server types
 */
export const MCPServerConfigSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  type: z.enum(["stdio", "sse", "inprocess"]),
  command: z.string().optional(),
  url: z.string().url().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

/**
 * Agent template schema
 * Defines the configuration for spawning agent workers
 */
export const AgentTemplateSchema = z.object({
  // Identity
  id: z.string().min(1, "Template ID is required"),
  name: z.string().min(1, "Template name is required"),
  description: z.string().default(""),
  createdBy: z.string().min(1, "Creator ID is required"), // "system" or user_id

  // Claude Agent SDK configuration
  systemPrompt: z.string().min(1, "System prompt is required"),
  permissionMode: PermissionModeSchema.default("askUser"),
  maxTurns: z.number().int().positive().default(100),

  // Tools configuration
  builtinTools: z.array(z.string()).default([]),
  mcpServers: z.array(MCPServerConfigSchema).default([]),

  // Agent Ops metadata
  allowedWorkItemTypes: z
    .array(z.string())
    .default(["*"])
    .describe("Array of allowed work item types, or ['*'] for all types"),
  defaultRole: AgentRoleSchema.optional(),

  // Timestamps (Unix milliseconds)
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

/**
 * Schema for creating a new agent template (without auto-generated fields)
 */
export const CreateAgentTemplateSchema = AgentTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateAgentTemplate = z.infer<typeof CreateAgentTemplateSchema>;

/**
 * Schema for updating an existing agent template
 */
export const UpdateAgentTemplateSchema = AgentTemplateSchema.partial().omit({
  id: true,
  createdBy: true,
  createdAt: true,
});
export type UpdateAgentTemplate = z.infer<typeof UpdateAgentTemplateSchema>;
