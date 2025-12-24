import type { LLMProvider, Message } from "../../llm-providers/interfaces/llm-provider.interface.js";
import { AGENT_TOOLS, AgentToolExecutor } from "./agent-tools.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Options for agent execution
 */
export interface AgentEngineOptions {
  maxIterations?: number;
  workspacePath: string;
  llmProvider: LLMProvider;
}

/**
 * Result of agent execution
 */
export interface AgentEngineResult {
  success: boolean;
  finalMessage?: string | undefined;
  iterations: number;
  toolCallsCount: number;
  error?: string | undefined;
}

/**
 * Task information loaded from bd
 */
export interface TaskInfo {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
}

/**
 * Agent execution engine
 * Implements the core agent logic that runs inside a container
 */
export class AgentEngineService {
  private llmProvider: LLMProvider;
  private toolExecutor: AgentToolExecutor;
  private workspacePath: string;
  private maxIterations: number;

  constructor(options: AgentEngineOptions) {
    this.llmProvider = options.llmProvider;
    this.workspacePath = options.workspacePath;
    this.toolExecutor = new AgentToolExecutor(options.workspacePath);
    this.maxIterations = options.maxIterations || 20;
  }

  /**
   * Load task information from bd
   */
  async loadTask(taskId: string): Promise<TaskInfo> {
    try {
      const { stdout } = await execAsync(`bd show ${taskId}`, {
        cwd: this.workspacePath,
      });

      // Parse bd output to extract task information
      // Format: "taskId: title\nStatus: status\nPriority: priority\n\nDescription:\ndescription"
      const lines = stdout.split("\n");
      const firstLine = lines[0] || "";
      const [id, ...titleParts] = firstLine.split(": ");
      const title = titleParts.join(": ");

      let status = "unknown";
      let priority = "unknown";
      let description = "";
      let inDescription = false;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (line.startsWith("Status: ")) {
          status = line.replace("Status: ", "").trim();
        } else if (line.startsWith("Priority: ")) {
          priority = line.replace("Priority: ", "").trim();
        } else if (line.startsWith("Description:")) {
          inDescription = true;
        } else if (inDescription && line.trim()) {
          description += line + "\n";
        }
      }

      return {
        id: taskId,
        title: title.trim(),
        description: description.trim(),
        status: status.trim(),
        priority: priority.trim(),
      };
    } catch (error) {
      throw new Error(
        `Failed to load task ${taskId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Execute agent with a task
   * Implements the tool calling loop: read → think → act → observe
   */
  async executeTask(taskId: string): Promise<AgentEngineResult> {
    // Load task from bd
    const task = await this.loadTask(taskId);

    // Build initial prompt
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildTaskPrompt(task);

    // Initialize conversation
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let iterations = 0;
    let toolCallsCount = 0;

    // Tool calling loop
    while (iterations < this.maxIterations) {
      iterations++;

      // Check if provider supports tool calling
      if (!this.llmProvider.supportsToolCalling()) {
        return {
          success: false,
          error: "LLM provider does not support tool calling",
          iterations,
          toolCallsCount,
        };
      }

      // Call LLM with tools
      const result = await this.llmProvider.callWithTools(messages, AGENT_TOOLS);

      // Check if we're done (no tool calls)
      if (result.finishReason === "stop") {
        return {
          success: true,
          finalMessage: result.content,
          iterations,
          toolCallsCount,
        };
      }

      // Execute tool calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        // Add assistant message with tool calls
        messages.push({
          role: "assistant",
          content: result.content || "Using tools...",
        });

        // Execute each tool call and collect results
        for (const toolCall of result.toolCalls) {
          toolCallsCount++;

          const toolResult = await this.toolExecutor.executeTool(
            toolCall.name,
            toolCall.input
          );

          // Add tool result as user message
          const resultMessage = toolResult.success
            ? `Tool ${toolCall.name} succeeded:\n${toolResult.output}`
            : `Tool ${toolCall.name} failed:\n${toolResult.error}`;

          messages.push({
            role: "user",
            content: resultMessage,
          });
        }
      } else {
        // No tool calls but also not finished - add content and continue
        if (result.content) {
          messages.push({
            role: "assistant",
            content: result.content,
          });
        }
      }
    }

    // Max iterations reached
    return {
      success: false,
      error: `Max iterations (${this.maxIterations}) reached`,
      iterations,
      toolCallsCount,
    };
  }

  /**
   * Execute agent and commit changes on success
   */
  async executeAndCommit(taskId: string): Promise<AgentEngineResult> {
    const result = await this.executeTask(taskId);

    if (result.success) {
      try {
        // Stage all changes
        await execAsync("git add -A", { cwd: this.workspacePath });

        // Commit changes
        const commitMessage = `Implement ${taskId}\n\n${result.finalMessage || "Task completed"}`;
        await execAsync(`git commit -m "${commitMessage}"`, {
          cwd: this.workspacePath,
        });
      } catch (error) {
        // Non-fatal - task succeeded but commit failed
        result.error = `Task succeeded but commit failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }

    return result;
  }

  private buildSystemPrompt(): string {
    return `You are an autonomous coding agent. Your role is to:

1. Understand the task requirements
2. Plan your approach
3. Execute steps using the available tools
4. Verify your changes work correctly
5. Report completion

Available tools:
- read_file: Read file contents
- write_file: Write or create files
- edit_file: Search and replace in files
- run_command: Execute shell commands
- search_files: Find files by glob pattern
- grep: Search for text in files

Guidelines:
- Follow existing code patterns in the codebase
- Don't over-engineer - implement what's specified
- Write tests for new functionality
- Keep changes focused and atomic
- Run tests before completion

When you're done:
1. Run relevant tests to verify your changes
2. Summarize what you implemented
3. Signal completion by not requesting any more tools`;
  }

  private buildTaskPrompt(task: TaskInfo): string {
    return `Please implement the following task:

Task ID: ${task.id}
Title: ${task.title}
Priority: ${task.priority}
Status: ${task.status}

Description:
${task.description}

Begin by exploring the codebase to understand existing patterns, then implement the required functionality.`;
  }
}
