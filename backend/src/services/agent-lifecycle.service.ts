/**
 * Agent Lifecycle Service
 *
 * Manages lifecycle hooks for agent execution, allowing registration of callbacks
 * for pre-execution, post-execution, error handling, and status changes.
 */

export type LifecycleHookType = "pre_execution" | "post_execution" | "error" | "status_change";

export interface ExecutionContext {
  workerId: string;
  workItemId: string;
  workspaceId: string;
  templateId: string;
  workspacePath: string;
}

export interface ExecutionResult {
  executionId: string;
  status: string;
  output?: unknown;
  error?: string;
}

export type PreExecutionHook = (context: ExecutionContext) => Promise<boolean>;
export type PostExecutionHook = (context: ExecutionContext, result: ExecutionResult) => Promise<void>;
export type ErrorHook = (context: ExecutionContext, error: Error) => Promise<void>;
export type StatusChangeHook = (executionId: string, oldStatus: string, newStatus: string) => Promise<void>;

/**
 * Service for managing agent lifecycle hooks
 * Provides a registry for pre-execution, post-execution, error, and status change hooks
 */
export class AgentLifecycleService {
  private preExecutionHooks: Map<string, PreExecutionHook>;
  private postExecutionHooks: Map<string, PostExecutionHook>;
  private errorHooks: Map<string, ErrorHook>;
  private statusChangeHooks: Map<string, StatusChangeHook>;

  constructor() {
    this.preExecutionHooks = new Map();
    this.postExecutionHooks = new Map();
    this.errorHooks = new Map();
    this.statusChangeHooks = new Map();
  }

  /**
   * Register a pre-execution hook
   * @param id - Unique identifier for this hook
   * @param hook - Callback function that returns true to continue, false to abort
   */
  registerPreExecutionHook(id: string, hook: PreExecutionHook): void {
    this.preExecutionHooks.set(id, hook);
  }

  /**
   * Register a post-execution hook
   * @param id - Unique identifier for this hook
   * @param hook - Callback function to execute after agent completion
   */
  registerPostExecutionHook(id: string, hook: PostExecutionHook): void {
    this.postExecutionHooks.set(id, hook);
  }

  /**
   * Register an error hook
   * @param id - Unique identifier for this hook
   * @param hook - Callback function to execute when errors occur
   */
  registerErrorHook(id: string, hook: ErrorHook): void {
    this.errorHooks.set(id, hook);
  }

  /**
   * Register a status change hook
   * @param id - Unique identifier for this hook
   * @param hook - Callback function to execute when execution status changes
   */
  registerStatusChangeHook(id: string, hook: StatusChangeHook): void {
    this.statusChangeHooks.set(id, hook);
  }

  /**
   * Run all pre-execution hooks in order
   * @param context - Execution context
   * @returns false if any hook returns false, true otherwise
   */
  async runPreExecutionHooks(context: ExecutionContext): Promise<boolean> {
    for (const [id, hook] of this.preExecutionHooks.entries()) {
      try {
        const shouldContinue = await hook(context);
        if (!shouldContinue) {
          return false;
        }
      } catch (error) {
        // Log error but don't let hook failures stop execution
        console.error(`Pre-execution hook ${id} failed:`, error);
        // Optionally: could make this configurable to fail-fast
      }
    }
    return true;
  }

  /**
   * Run all post-execution hooks in order
   * @param context - Execution context
   * @param result - Execution result
   */
  async runPostExecutionHooks(context: ExecutionContext, result: ExecutionResult): Promise<void> {
    for (const [id, hook] of this.postExecutionHooks.entries()) {
      try {
        await hook(context, result);
      } catch (error) {
        // Log error but continue running other hooks
        console.error(`Post-execution hook ${id} failed:`, error);
      }
    }
  }

  /**
   * Run all error hooks in order
   * @param context - Execution context
   * @param error - Error that occurred
   */
  async runErrorHooks(context: ExecutionContext, error: Error): Promise<void> {
    for (const [id, hook] of this.errorHooks.entries()) {
      try {
        await hook(context, error);
      } catch (hookError) {
        // Log error but continue running other hooks
        console.error(`Error hook ${id} failed:`, hookError);
      }
    }
  }

  /**
   * Notify all status change hooks
   * @param executionId - Execution identifier
   * @param oldStatus - Previous status
   * @param newStatus - New status
   */
  async notifyStatusChange(executionId: string, oldStatus: string, newStatus: string): Promise<void> {
    for (const [id, hook] of this.statusChangeHooks.entries()) {
      try {
        await hook(executionId, oldStatus, newStatus);
      } catch (error) {
        // Log error but continue notifying other hooks
        console.error(`Status change hook ${id} failed:`, error);
      }
    }
  }

  /**
   * Unregister a hook by type and ID
   * @param type - Hook type to unregister
   * @param id - Hook identifier
   */
  unregisterHook(type: LifecycleHookType, id: string): void {
    switch (type) {
      case "pre_execution":
        this.preExecutionHooks.delete(id);
        break;
      case "post_execution":
        this.postExecutionHooks.delete(id);
        break;
      case "error":
        this.errorHooks.delete(id);
        break;
      case "status_change":
        this.statusChangeHooks.delete(id);
        break;
    }
  }

  /**
   * Get the number of registered hooks by type
   * @param type - Hook type
   * @returns Number of registered hooks
   */
  getHookCount(type: LifecycleHookType): number {
    switch (type) {
      case "pre_execution":
        return this.preExecutionHooks.size;
      case "post_execution":
        return this.postExecutionHooks.size;
      case "error":
        return this.errorHooks.size;
      case "status_change":
        return this.statusChangeHooks.size;
    }
  }

  /**
   * Clear all hooks of a specific type
   * @param type - Hook type to clear
   */
  clearHooks(type: LifecycleHookType): void {
    switch (type) {
      case "pre_execution":
        this.preExecutionHooks.clear();
        break;
      case "post_execution":
        this.postExecutionHooks.clear();
        break;
      case "error":
        this.errorHooks.clear();
        break;
      case "status_change":
        this.statusChangeHooks.clear();
        break;
    }
  }

  /**
   * Clear all registered hooks
   */
  clearAllHooks(): void {
    this.preExecutionHooks.clear();
    this.postExecutionHooks.clear();
    this.errorHooks.clear();
    this.statusChangeHooks.clear();
  }
}
