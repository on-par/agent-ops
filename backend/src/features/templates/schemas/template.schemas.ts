import { z } from "zod";
import { AgentRoleSchema } from "../models/template.js";
import {
  CreateAgentTemplateSchema,
  UpdateAgentTemplateSchema,
} from "../models/template.js";

/**
 * Request validation schemas for template API routes
 * These schemas validate incoming HTTP requests
 */

/**
 * Re-export create schema for request validation
 */
export const CreateTemplateSchema = CreateAgentTemplateSchema;
export type CreateTemplateRequest = z.infer<typeof CreateTemplateSchema>;

/**
 * Re-export update schema for request validation
 */
export const UpdateTemplateSchema = UpdateAgentTemplateSchema;
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateSchema>;

/**
 * Schema for cloning a template
 */
export const CloneTemplateSchema = z.object({
  newName: z.string().min(1, "New template name is required"),
  createdBy: z.string().min(1, "Creator ID is required"),
});
export type CloneTemplateRequest = z.infer<typeof CloneTemplateSchema>;

/**
 * Schema for template ID in URL parameters
 */
export const TemplateIdParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
});
export type TemplateIdParams = z.infer<typeof TemplateIdParamsSchema>;

/**
 * Schema for role query parameter
 */
export const RoleQuerySchema = z.object({
  role: AgentRoleSchema.optional(),
});
export type RoleQuery = z.infer<typeof RoleQuerySchema>;

/**
 * Schema for work item type query parameter
 */
export const WorkItemTypeQuerySchema = z.object({
  type: z.string().min(1).optional(),
});
export type WorkItemTypeQuery = z.infer<typeof WorkItemTypeQuerySchema>;

/**
 * Schema for user ID query parameter
 */
export const UserIdQuerySchema = z.object({
  userId: z.string().min(1).optional(),
});
export type UserIdQuery = z.infer<typeof UserIdQuerySchema>;
