import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import type { Config } from "../../../shared/config.js";
import { ContainerManagerService } from "../services/container-manager.service.js";
import {
  createContainerSchema,
  stopContainerSchema,
  type CreateContainerInput,
  type StopContainerInput,
} from "../schemas/container.schemas.js";
import { ZodError } from "zod";

export interface ContainerHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  config: Config;
  containerService?: ContainerManagerService;
}

/**
 * Container REST Routes
 * Provides APIs for managing Docker containers
 */
export async function containerRoutes(
  app: FastifyInstance,
  options: ContainerHandlerOptions
): Promise<void> {
  const { db } = options;

  // Initialize container manager service (or use injected one for testing)
  const containerService = options.containerService ?? new ContainerManagerService(db);

  // Error handler helper
  const handleError = (error: unknown, reply: FastifyReply): void => {
    if (error instanceof ZodError) {
      // Validation error
      reply.status(400).send({
        error: "Validation error",
        details: error.issues,
        statusCode: 400,
      });
      return;
    }

    if (error instanceof Error) {
      const message = error.message;

      // Check if it's a "not found" error
      if (message.includes("not found")) {
        reply.status(404).send({
          error: "Container not found",
          statusCode: 404,
        });
        return;
      }

      // Internal server error
      reply.status(500).send({
        error: message,
        statusCode: 500,
      });
      return;
    }

    // Unknown error - rethrow
    throw error;
  };

  /**
   * GET / - Get list of all containers
   * Returns: Array of Container objects
   */
  app.get("/", async (_request, reply) => {
    try {
      const containers = await containerService.listContainers();
      reply.send(containers);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /:id - Get single container by ID
   * Returns: Container object or 404 if not found
   */
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const container = await containerService.getContainerStatus(id);

      if (!container) {
        reply.status(404).send({
          error: "Container not found",
          statusCode: 404,
        });
        return;
      }

      reply.send(container);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * POST / - Create a new container
   * Body: CreateContainerInput (validated by Zod)
   * Returns: Created container with 201 status
   */
  app.post("/", async (request, reply) => {
    try {
      // Validate request body with Zod
      const validatedData = createContainerSchema.parse(request.body);

      // Create container options
      const createOptions: any = {
        image: validatedData.image,
        name: validatedData.name,
      };

      if (validatedData.workspaceId !== undefined) {
        createOptions.workspaceId = validatedData.workspaceId;
      }
      if (validatedData.executionId !== undefined) {
        createOptions.executionId = validatedData.executionId;
      }
      if (validatedData.env !== undefined) {
        createOptions.env = validatedData.env;
      }
      if (validatedData.resourceLimits !== undefined) {
        createOptions.resourceLimits = validatedData.resourceLimits;
      }

      const container = await containerService.createContainer(createOptions);

      reply.status(201).send(container);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * POST /:id/start - Start a container
   * Returns: Updated container with running status
   */
  app.post("/:id/start", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const container = await containerService.startContainer(id);

      reply.send(container);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * POST /:id/stop - Stop a container
   * Body: StopContainerInput (optional timeout)
   * Returns: Updated container with stopped status
   */
  app.post("/:id/stop", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Validate request body with Zod (optional timeout)
      const validatedData = stopContainerSchema.parse(request.body || {});

      const container = await containerService.stopContainer(
        id,
        validatedData.timeout
      );

      reply.send(container);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * DELETE /:id - Remove a container
   * Returns: 204 No Content on success
   */
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      await containerService.removeContainer(id, false);

      reply.status(204).send();
    } catch (error) {
      handleError(error, reply);
    }
  });
}
