import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { glob } from "glob";
import { z } from "zod";
import type { Tool } from "../../llm-providers/interfaces/llm-provider.interface.js";

const execAsync = promisify(exec);

/**
 * Tool input schemas for agent operations
 */
const ReadFileInputSchema = z.object({
  path: z.string(),
});

const WriteFileInputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditFileInputSchema = z.object({
  path: z.string(),
  old: z.string(),
  new: z.string(),
});

const RunCommandInputSchema = z.object({
  cmd: z.string(),
});

const SearchFilesInputSchema = z.object({
  pattern: z.string(),
});

const GrepInputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
export type EditFileInput = z.infer<typeof EditFileInputSchema>;
export type RunCommandInput = z.infer<typeof RunCommandInputSchema>;
export type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;
export type GrepInput = z.infer<typeof GrepInputSchema>;

/**
 * Tool output types
 */
export interface ToolOutput {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Agent tool definitions for LLM provider
 * These tools allow the agent to interact with the filesystem and execute commands
 */
export const AGENT_TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read (relative to workspace root)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file in the workspace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write (relative to workspace root)",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file using search and replace",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to edit (relative to workspace root)",
        },
        old: {
          type: "string",
          description: "Text to search for and replace",
        },
        new: {
          type: "string",
          description: "Text to replace with",
        },
      },
      required: ["path", "old", "new"],
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command in the workspace",
    inputSchema: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["cmd"],
    },
  },
  {
    name: "search_files",
    description: "Search for files matching a glob pattern",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search for text patterns in files",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text pattern to search for (supports regex)",
        },
        path: {
          type: "string",
          description: "Optional path to search in (defaults to workspace root)",
        },
      },
      required: ["pattern"],
    },
  },
];

/**
 * Execute agent tools
 * Handles the actual execution of tool calls from the LLM
 */
export class AgentToolExecutor {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Execute a tool call and return the result
   */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolOutput> {
    try {
      switch (toolName) {
        case "read_file": {
          const parsed = ReadFileInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.readFile(parsed.data);
        }
        case "write_file": {
          const parsed = WriteFileInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.writeFile(parsed.data);
        }
        case "edit_file": {
          const parsed = EditFileInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.editFile(parsed.data);
        }
        case "run_command": {
          const parsed = RunCommandInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.runCommand(parsed.data);
        }
        case "search_files": {
          const parsed = SearchFilesInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.searchFiles(parsed.data);
        }
        case "grep": {
          const parsed = GrepInputSchema.safeParse(input);
          if (!parsed.success) return { success: false, error: parsed.error.message };
          return await this.grep(parsed.data);
        }
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async readFile(input: ReadFileInput): Promise<ToolOutput> {
    const fullPath = `${this.workspacePath}/${input.path}`;
    const content = await readFile(fullPath, "utf-8");
    return {
      success: true,
      output: content,
    };
  }

  private async writeFile(input: WriteFileInput): Promise<ToolOutput> {
    const fullPath = `${this.workspacePath}/${input.path}`;
    await writeFile(fullPath, input.content, "utf-8");
    return {
      success: true,
      output: `File written: ${input.path}`,
    };
  }

  private async editFile(input: EditFileInput): Promise<ToolOutput> {
    const fullPath = `${this.workspacePath}/${input.path}`;
    let content = await readFile(fullPath, "utf-8");

    if (!content.includes(input.old)) {
      return {
        success: false,
        error: `Text not found in file: ${input.old}`,
      };
    }

    content = content.replace(input.old, input.new);
    await writeFile(fullPath, content, "utf-8");

    return {
      success: true,
      output: `File edited: ${input.path}`,
    };
  }

  private async runCommand(input: RunCommandInput): Promise<ToolOutput> {
    const { stdout, stderr } = await execAsync(input.cmd, {
      cwd: this.workspacePath,
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });

    return {
      success: true,
      output: stdout || stderr || "Command completed",
    };
  }

  private async searchFiles(input: SearchFilesInput): Promise<ToolOutput> {
    const files = await glob(input.pattern, {
      cwd: this.workspacePath,
      nodir: true,
    });

    return {
      success: true,
      output: files.join("\n"),
    };
  }

  private async grep(input: GrepInput): Promise<ToolOutput> {
    const searchPath = input.path || ".";
    const fullPath = `${this.workspacePath}/${searchPath}`;

    // Use grep command for simplicity
    // Note: This could be improved with a pure JS implementation for cross-platform support
    const { stdout } = await execAsync(
      `grep -r "${input.pattern}" "${fullPath}" || true`,
      {
        cwd: this.workspacePath,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      }
    );

    return {
      success: true,
      output: stdout || "No matches found",
    };
  }
}
