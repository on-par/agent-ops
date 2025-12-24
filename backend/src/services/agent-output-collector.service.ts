import { exec } from "child_process";
import { promisify } from "util";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { DrizzleDatabase } from "../db/index.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import type { AgentExecutionOutput } from "../db/schema.js";

const execAsync = promisify(exec);

export interface CollectedOutput {
  summary?: string;
  filesChanged?: string[];
  diff?: string;
  logs?: string[];
  metrics?: {
    tokensUsed: number;
    costUsd: number;
    toolCallsCount: number;
    durationMs: number;
  };
}

/**
 * Service for collecting outputs from agent execution
 * Gathers diff, artifacts, and metrics from completed agent runs
 */
export class AgentOutputCollectorService {
  private repository: AgentExecutionRepository;

  constructor(db: DrizzleDatabase) {
    this.repository = new AgentExecutionRepository(db);
  }

  /**
   * Collect git diff from workspace
   * @param workspacePath - Path to the workspace directory
   * @returns Git diff string or undefined if no changes
   */
  async collectDiff(workspacePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync("git diff HEAD", {
        cwd: workspacePath,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large diffs
      });

      return stdout.trim() || undefined;
    } catch (error) {
      // If git command fails (e.g., not a git repo), return undefined
      console.warn(`Failed to collect diff from ${workspacePath}:`, error);
      return undefined;
    }
  }

  /**
   * Collect list of modified files from workspace
   * @param workspacePath - Path to the workspace directory
   * @returns Array of modified file paths
   */
  async collectArtifacts(workspacePath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync("git diff --name-only HEAD", {
        cwd: workspacePath,
      });

      const files = stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      return files;
    } catch (error) {
      // If git command fails, return empty array
      console.warn(`Failed to collect artifacts from ${workspacePath}:`, error);
      return [];
    }
  }

  /**
   * Collect execution metrics
   * @param startTime - Execution start time
   * @param result - Result object containing token usage and other metrics
   * @returns Metrics object
   */
  async collectMetrics(
    startTime: Date,
    result: {
      tokensUsed?: number;
      costUsd?: number;
      toolCallsCount?: number;
    }
  ): Promise<CollectedOutput["metrics"]> {
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    return {
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
      toolCallsCount: result.toolCallsCount ?? 0,
      durationMs,
    };
  }

  /**
   * Save collected output to database
   * @param executionId - Agent execution ID
   * @param output - Collected output data
   */
  async saveOutput(
    executionId: string,
    output: CollectedOutput
  ): Promise<void> {
    // Build the output object to save
    const executionOutput: AgentExecutionOutput = {
      summary: output.summary,
      filesChanged: output.filesChanged,
      diff: output.diff,
      logs: output.logs,
    };

    // Save output to execution record
    await this.repository.setOutput(executionId, executionOutput);

    // Update metrics if provided
    if (output.metrics) {
      await this.repository.updateMetrics(executionId, {
        tokensUsed: output.metrics.tokensUsed,
        costUsd: output.metrics.costUsd,
        toolCallsCount: output.metrics.toolCallsCount,
      });

      // Update duration separately through the update method
      await this.repository.update(executionId, {
        durationMs: output.metrics.durationMs,
      });
    }
  }

  /**
   * Collect all output from a completed execution
   * @param executionId - Agent execution ID
   * @param workspacePath - Path to the workspace directory
   * @param startTime - Execution start time
   * @param result - Execution result with metrics
   * @param summary - Optional summary text
   * @param logs - Optional log entries
   * @returns Collected output
   */
  async collectAll(
    executionId: string,
    workspacePath: string,
    startTime: Date,
    result: {
      tokensUsed?: number;
      costUsd?: number;
      toolCallsCount?: number;
    },
    summary?: string,
    logs?: string[]
  ): Promise<CollectedOutput> {
    const [diff, filesChanged, metrics] = await Promise.all([
      this.collectDiff(workspacePath),
      this.collectArtifacts(workspacePath),
      this.collectMetrics(startTime, result),
    ]);

    const output: CollectedOutput = {
      summary,
      filesChanged,
      diff,
      logs,
      metrics,
    };

    await this.saveOutput(executionId, output);

    return output;
  }
}
