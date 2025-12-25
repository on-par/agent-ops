import { z } from "zod";

/**
 * Validation schema for resource limits
 */
export const resourceLimitsSchema = z.object({
  cpuLimit: z.number().positive().optional(),
  memoryLimit: z.number().positive().optional(),
});

/**
 * Validation schema for creating a new container
 */
export const createContainerSchema = z.object({
  image: z.string().min(1, "Image is required"),
  name: z.string().min(1, "Name is required"),
  workspaceId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  env: z.record(z.string(), z.string()).optional(),
  resourceLimits: resourceLimitsSchema.optional(),
});

/**
 * Validation schema for stopping a container
 */
export const stopContainerSchema = z.object({
  timeout: z.number().int().positive().default(10).optional(),
});

/**
 * Validation schema for container logs query parameters
 */
export const logsQuerySchema = z.object({
  follow: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .optional(),
  tail: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .optional(),
  timestamps: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .optional(),
});

/**
 * Type exports for use in handlers
 */
export type CreateContainerInput = z.infer<typeof createContainerSchema>;
export type StopContainerInput = z.infer<typeof stopContainerSchema>;
export type LogsQueryInput = z.infer<typeof logsQuerySchema>;
