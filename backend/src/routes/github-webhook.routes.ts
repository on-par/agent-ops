import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import {
  GitHubWebhookService,
  type WebhookEventType,
  type WebhookPayload,
} from "../services/github-webhook.service.js";
import type { Config } from "../config.js";
import type { DrizzleDatabase } from "../db/index.js";

interface GitHubWebhookRoutesOptions extends FastifyPluginOptions {
  config: Config;
  db: DrizzleDatabase;
}

// Custom request type for raw body access
interface WebhookRequest extends FastifyRequest {
  rawBody?: string;
}

export async function githubWebhookRoutes(
  app: FastifyInstance,
  options: GitHubWebhookRoutesOptions
): Promise<void> {
  const { config, db } = options;
  const webhookService = new GitHubWebhookService(db, config.githubWebhookSecret);

  // Add raw body parser for signature verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        // Store raw body for signature verification
        (req as WebhookRequest).rawBody = body as string;
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * POST /api/webhooks/github
   * Handle incoming GitHub webhooks
   */
  app.post("/", async (request: WebhookRequest, reply) => {
    // Get event type from header
    const eventType = request.headers["x-github-event"] as WebhookEventType | undefined;
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const deliveryId = request.headers["x-github-delivery"] as string | undefined;

    request.log.info(
      { eventType, deliveryId, hasSignature: !!signature },
      "Received GitHub webhook"
    );

    // Validate event type
    if (!eventType) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Missing X-GitHub-Event header",
      });
    }

    // Verify signature
    const rawBody = request.rawBody ?? JSON.stringify(request.body);
    if (!webhookService.verifySignature(rawBody, signature)) {
      request.log.warn({ deliveryId }, "Invalid webhook signature");
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid webhook signature",
      });
    }

    try {
      // Process the webhook
      const result = await webhookService.processWebhook(
        eventType,
        request.body as WebhookPayload
      );

      request.log.info(
        {
          eventType,
          deliveryId,
          success: result.success,
          action: result.action,
          workItemId: result.workItemId,
        },
        result.message
      );

      return reply.send(result);
    } catch (err) {
      request.log.error({ err, eventType, deliveryId }, "Failed to process webhook");
      return reply.status(500).send({
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/webhooks/github/status
   * Check webhook endpoint status
   */
  app.get("/status", async (_request, reply) => {
    return reply.send({
      status: "ok",
      configured: !!config.githubWebhookSecret,
      endpoint: `${config.baseUrl}/api/webhooks/github`,
    });
  });
}
