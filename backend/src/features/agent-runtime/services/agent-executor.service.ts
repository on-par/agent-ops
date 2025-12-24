import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../shared/db/index.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import { AgentOutputCollectorService } from "./agent-output-collector.service.js";
import type { AgentExecutionStatus, AgentExecutionOutput } from "../../shared/db/schema.js";

export interface ExecutionContext {
  workerId: string;
  workItemId: string;
  workspaceId: string;
  templateId: string;
  workspacePath: string;
  prompt: string;
}

export interface ExecutionResult {
  executionId: string;
  sessionId: string;
  status: AgentExecutionStatus;
  output?: AgentExecutionOutput;
  error?: string;
}

export interface ClaudeSDKResult {
  sessionId: string;
  tokensUsed?: number;
  costUsd?: number;
  toolCallsCount?: number;
  error?: Error;
}

/**
 * Service for executing agents using Claude SDK
 * Orchestrates agent execution, output collection, and result tracking
 */
export class AgentExecutorService {
  private repository: AgentExecutionRepository;
  private outputCollector: AgentOutputCollectorService;
  private activeExecutions: Map<string, AbortController>;

  // Hook for Claude SDK query function - can be injected for testing
  private claudeSDKQuery?: (
    prompt: string,
    options: {
      workspacePath: string;
      sessionId: string;
      onPreToolUse?: (tool: { name: string; input: unknown }) => void;
      onPostToolUse?: (tool: { name: string; output: unknown }) => void;
      signal?: AbortSignal;
    }
  ) => Promise<ClaudeSDKResult>;

  constructor(
    db: DrizzleDatabase,
    claudeSDKQuery?: typeof AgentExecutorService.prototype.claudeSDKQuery
  ) {
    this.repository = new AgentExecutionRepository(db);
    this.outputCollector = new AgentOutputCollectorService(db);
    this.activeExecutions = new Map();
    if (claudeSDKQuery !== undefined) {
      this.claudeSDKQuery = claudeSDKQuery;
    }
  }

  /**
   * Execute an agent with the given context
   * @param context - Execution context with workspace and prompt
   * @returns Execution result with status and output
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    // Create execution record
    const executionId = uuidv4();
    const sessionId = uuidv4();
    const startTime = new Date();

    await this.repository.create({
      id: executionId,
      workerId: context.workerId,
      workItemId: context.workItemId,
      workspaceId: context.workspaceId,
      templateId: context.templateId,
      status: "pending",
      createdAt: startTime,
    });

    // Create abort controller for this execution
    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);

    try {
      // Update status to running
      await this.repository.updateStatus(executionId, "running");

      // Execute with Claude SDK
      const result = await this.executeWithClaudeSDK(
        context.prompt,
        context.workspacePath,
        sessionId,
        abortController.signal
      );

      // Check if execution was aborted
      if (abortController.signal.aborted) {
        await this.repository.updateStatus(executionId, "cancelled");
        return {
          executionId,
          sessionId,
          status: "cancelled",
        };
      }

      // Check for errors
      if (result.error) {
        await this.repository.updateStatus(executionId, "error");
        await this.repository.update(executionId, {
          errorMessage: result.error.message,
        });

        return {
          executionId,
          sessionId,
          status: "error",
          error: result.error.message,
        };
      }

      // Collect output - build metrics object with only defined values
      const metricsForCollection: { tokensUsed?: number; costUsd?: number; toolCallsCount?: number } = {};
      if (result.tokensUsed !== undefined) metricsForCollection.tokensUsed = result.tokensUsed;
      if (result.costUsd !== undefined) metricsForCollection.costUsd = result.costUsd;
      if (result.toolCallsCount !== undefined) metricsForCollection.toolCallsCount = result.toolCallsCount;

      const output = await this.outputCollector.collectAll(
        executionId,
        context.workspacePath,
        startTime,
        metricsForCollection,
        undefined, // summary - could be extracted from result
        undefined  // logs - could be collected during execution
      );

      // Update status to success
      await this.repository.updateStatus(executionId, "success");

      return {
        executionId,
        sessionId,
        status: "success",
        output: output as AgentExecutionOutput,
      };
    } catch (error) {
      // Handle unexpected errors
      await this.repository.updateStatus(executionId, "error");
      await this.repository.update(executionId, {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        executionId,
        sessionId,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      // Clean up abort controller
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Cancel a running execution
   * @param executionId - Execution ID to cancel
   */
  async cancel(executionId: string): Promise<void> {
    const abortController = this.activeExecutions.get(executionId);
    if (!abortController) {
      throw new Error(`Execution ${executionId} is not running`);
    }

    // Abort the execution
    abortController.abort();

    // Update status
    await this.repository.updateStatus(executionId, "cancelled");
  }

  /**
   * Execute using Claude SDK query function
   * This can be mocked in tests
   */
  private async executeWithClaudeSDK(
    prompt: string,
    workspacePath: string,
    sessionId: string,
    signal: AbortSignal
  ): Promise<ClaudeSDKResult> {
    if (!this.claudeSDKQuery) {
      // Default implementation - would use actual Claude SDK in production
      // For now, throw error to indicate SDK is not configured
      throw new Error(
        "Claude SDK query function not configured. Set claudeSDKQuery in constructor for testing or production use."
      );
    }

    let toolCallCount = 0;

    const result = await this.claudeSDKQuery(prompt, {
      workspacePath,
      sessionId,
      onPreToolUse: (_tool) => {
        toolCallCount++;
        // Could emit events here for observability
      },
      onPostToolUse: (_tool) => {
        // Could emit events here for observability
      },
      signal,
    });

    return {
      ...result,
      toolCallsCount: result.toolCallsCount ?? toolCallCount,
    };
  }
}
