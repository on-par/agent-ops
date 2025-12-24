import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AgentLifecycleService,
  type ExecutionContext,
  type ExecutionResult,
  type PreExecutionHook,
  type PostExecutionHook,
  type ErrorHook,
  type StatusChangeHook,
} from "./agent-lifecycle.service.js";

describe("AgentLifecycleService", () => {
  let service: AgentLifecycleService;

  // Test data fixtures
  const mockContext: ExecutionContext = {
    workerId: "worker-123",
    workItemId: "item-456",
    workspaceId: "workspace-789",
    templateId: "template-abc",
    workspacePath: "/tmp/workspace",
  };

  const mockResult: ExecutionResult = {
    executionId: "exec-123",
    status: "success",
    output: { data: "test output" },
  };

  const mockError = new Error("Test error");

  beforeEach(() => {
    service = new AgentLifecycleService();
  });

  describe("Hook Registration", () => {
    it("should register pre-execution hook", () => {
      const hook: PreExecutionHook = vi.fn().mockResolvedValue(true);
      service.registerPreExecutionHook("test-hook", hook);
      expect(service.getHookCount("pre_execution")).toBe(1);
    });

    it("should register post-execution hook", () => {
      const hook: PostExecutionHook = vi.fn().mockResolvedValue(undefined);
      service.registerPostExecutionHook("test-hook", hook);
      expect(service.getHookCount("post_execution")).toBe(1);
    });

    it("should register error hook", () => {
      const hook: ErrorHook = vi.fn().mockResolvedValue(undefined);
      service.registerErrorHook("test-hook", hook);
      expect(service.getHookCount("error")).toBe(1);
    });

    it("should register status change hook", () => {
      const hook: StatusChangeHook = vi.fn().mockResolvedValue(undefined);
      service.registerStatusChangeHook("test-hook", hook);
      expect(service.getHookCount("status_change")).toBe(1);
    });

    it("should allow multiple hooks of the same type", () => {
      const hook1: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(true);
      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);
      expect(service.getHookCount("pre_execution")).toBe(2);
    });

    it("should replace hook with same ID", () => {
      const hook1: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(false);
      service.registerPreExecutionHook("same-id", hook1);
      service.registerPreExecutionHook("same-id", hook2);
      expect(service.getHookCount("pre_execution")).toBe(1);
    });
  });

  describe("Pre-Execution Hooks", () => {
    it("should call all pre-execution hooks in order", async () => {
      const callOrder: number[] = [];
      const hook1: PreExecutionHook = vi.fn().mockImplementation(async () => {
        callOrder.push(1);
        return true;
      });
      const hook2: PreExecutionHook = vi.fn().mockImplementation(async () => {
        callOrder.push(2);
        return true;
      });

      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);

      const result = await service.runPreExecutionHooks(mockContext);

      expect(result).toBe(true);
      expect(hook1).toHaveBeenCalledWith(mockContext);
      expect(hook2).toHaveBeenCalledWith(mockContext);
      expect(callOrder).toEqual([1, 2]);
    });

    it("should return false if any hook returns false", async () => {
      const hook1: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(false);
      const hook3: PreExecutionHook = vi.fn().mockResolvedValue(true);

      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);
      service.registerPreExecutionHook("hook-3", hook3);

      const result = await service.runPreExecutionHooks(mockContext);

      expect(result).toBe(false);
      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      // hook3 should not be called since hook2 returned false
      expect(hook3).not.toHaveBeenCalled();
    });

    it("should handle hook errors gracefully and continue", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const hook1: PreExecutionHook = vi.fn().mockRejectedValue(new Error("Hook failed"));
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(true);

      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);

      const result = await service.runPreExecutionHooks(mockContext);

      expect(result).toBe(true);
      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Pre-execution hook hook-1 failed:"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should return true when no hooks are registered", async () => {
      const result = await service.runPreExecutionHooks(mockContext);
      expect(result).toBe(true);
    });
  });

  describe("Post-Execution Hooks", () => {
    it("should call all post-execution hooks with context and result", async () => {
      const hook1: PostExecutionHook = vi.fn().mockResolvedValue(undefined);
      const hook2: PostExecutionHook = vi.fn().mockResolvedValue(undefined);

      service.registerPostExecutionHook("hook-1", hook1);
      service.registerPostExecutionHook("hook-2", hook2);

      await service.runPostExecutionHooks(mockContext, mockResult);

      expect(hook1).toHaveBeenCalledWith(mockContext, mockResult);
      expect(hook2).toHaveBeenCalledWith(mockContext, mockResult);
    });

    it("should handle hook errors gracefully and continue", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const hook1: PostExecutionHook = vi.fn().mockRejectedValue(new Error("Hook failed"));
      const hook2: PostExecutionHook = vi.fn().mockResolvedValue(undefined);

      service.registerPostExecutionHook("hook-1", hook1);
      service.registerPostExecutionHook("hook-2", hook2);

      await service.runPostExecutionHooks(mockContext, mockResult);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Post-execution hook hook-1 failed:"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should complete when no hooks are registered", async () => {
      await expect(service.runPostExecutionHooks(mockContext, mockResult)).resolves.toBeUndefined();
    });
  });

  describe("Error Hooks", () => {
    it("should call all error hooks with context and error", async () => {
      const hook1: ErrorHook = vi.fn().mockResolvedValue(undefined);
      const hook2: ErrorHook = vi.fn().mockResolvedValue(undefined);

      service.registerErrorHook("hook-1", hook1);
      service.registerErrorHook("hook-2", hook2);

      await service.runErrorHooks(mockContext, mockError);

      expect(hook1).toHaveBeenCalledWith(mockContext, mockError);
      expect(hook2).toHaveBeenCalledWith(mockContext, mockError);
    });

    it("should handle hook errors gracefully and continue", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const hook1: ErrorHook = vi.fn().mockRejectedValue(new Error("Hook failed"));
      const hook2: ErrorHook = vi.fn().mockResolvedValue(undefined);

      service.registerErrorHook("hook-1", hook1);
      service.registerErrorHook("hook-2", hook2);

      await service.runErrorHooks(mockContext, mockError);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error hook hook-1 failed:"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should complete when no hooks are registered", async () => {
      await expect(service.runErrorHooks(mockContext, mockError)).resolves.toBeUndefined();
    });
  });

  describe("Status Change Hooks", () => {
    it("should call all status change hooks with execution ID and statuses", async () => {
      const hook1: StatusChangeHook = vi.fn().mockResolvedValue(undefined);
      const hook2: StatusChangeHook = vi.fn().mockResolvedValue(undefined);

      service.registerStatusChangeHook("hook-1", hook1);
      service.registerStatusChangeHook("hook-2", hook2);

      await service.notifyStatusChange("exec-123", "pending", "running");

      expect(hook1).toHaveBeenCalledWith("exec-123", "pending", "running");
      expect(hook2).toHaveBeenCalledWith("exec-123", "pending", "running");
    });

    it("should handle hook errors gracefully and continue", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const hook1: StatusChangeHook = vi.fn().mockRejectedValue(new Error("Hook failed"));
      const hook2: StatusChangeHook = vi.fn().mockResolvedValue(undefined);

      service.registerStatusChangeHook("hook-1", hook1);
      service.registerStatusChangeHook("hook-2", hook2);

      await service.notifyStatusChange("exec-123", "pending", "running");

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status change hook hook-1 failed:"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should complete when no hooks are registered", async () => {
      await expect(service.notifyStatusChange("exec-123", "pending", "running")).resolves.toBeUndefined();
    });
  });

  describe("Hook Unregistration", () => {
    it("should unregister pre-execution hook", () => {
      const hook: PreExecutionHook = vi.fn().mockResolvedValue(true);
      service.registerPreExecutionHook("test-hook", hook);
      expect(service.getHookCount("pre_execution")).toBe(1);

      service.unregisterHook("pre_execution", "test-hook");
      expect(service.getHookCount("pre_execution")).toBe(0);
    });

    it("should unregister post-execution hook", () => {
      const hook: PostExecutionHook = vi.fn().mockResolvedValue(undefined);
      service.registerPostExecutionHook("test-hook", hook);
      expect(service.getHookCount("post_execution")).toBe(1);

      service.unregisterHook("post_execution", "test-hook");
      expect(service.getHookCount("post_execution")).toBe(0);
    });

    it("should unregister error hook", () => {
      const hook: ErrorHook = vi.fn().mockResolvedValue(undefined);
      service.registerErrorHook("test-hook", hook);
      expect(service.getHookCount("error")).toBe(1);

      service.unregisterHook("error", "test-hook");
      expect(service.getHookCount("error")).toBe(0);
    });

    it("should unregister status change hook", () => {
      const hook: StatusChangeHook = vi.fn().mockResolvedValue(undefined);
      service.registerStatusChangeHook("test-hook", hook);
      expect(service.getHookCount("status_change")).toBe(1);

      service.unregisterHook("status_change", "test-hook");
      expect(service.getHookCount("status_change")).toBe(0);
    });

    it("should handle unregistering non-existent hook gracefully", () => {
      expect(() => service.unregisterHook("pre_execution", "non-existent")).not.toThrow();
      expect(service.getHookCount("pre_execution")).toBe(0);
    });

    it("should only unregister the specified hook", () => {
      const hook1: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(true);
      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);

      service.unregisterHook("pre_execution", "hook-1");
      expect(service.getHookCount("pre_execution")).toBe(1);
    });
  });

  describe("Hook Clearing", () => {
    it("should clear all hooks of a specific type", () => {
      const hook1: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const hook2: PreExecutionHook = vi.fn().mockResolvedValue(true);
      service.registerPreExecutionHook("hook-1", hook1);
      service.registerPreExecutionHook("hook-2", hook2);

      service.clearHooks("pre_execution");
      expect(service.getHookCount("pre_execution")).toBe(0);
    });

    it("should only clear hooks of the specified type", () => {
      const preHook: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const postHook: PostExecutionHook = vi.fn().mockResolvedValue(undefined);
      service.registerPreExecutionHook("pre-hook", preHook);
      service.registerPostExecutionHook("post-hook", postHook);

      service.clearHooks("pre_execution");
      expect(service.getHookCount("pre_execution")).toBe(0);
      expect(service.getHookCount("post_execution")).toBe(1);
    });

    it("should clear all hooks", () => {
      service.registerPreExecutionHook("pre-hook", vi.fn().mockResolvedValue(true));
      service.registerPostExecutionHook("post-hook", vi.fn().mockResolvedValue(undefined));
      service.registerErrorHook("error-hook", vi.fn().mockResolvedValue(undefined));
      service.registerStatusChangeHook("status-hook", vi.fn().mockResolvedValue(undefined));

      service.clearAllHooks();
      expect(service.getHookCount("pre_execution")).toBe(0);
      expect(service.getHookCount("post_execution")).toBe(0);
      expect(service.getHookCount("error")).toBe(0);
      expect(service.getHookCount("status_change")).toBe(0);
    });
  });

  describe("Integration Scenarios", () => {
    it("should support complete execution lifecycle", async () => {
      const preHook: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const postHook: PostExecutionHook = vi.fn().mockResolvedValue(undefined);
      const statusHook: StatusChangeHook = vi.fn().mockResolvedValue(undefined);

      service.registerPreExecutionHook("pre", preHook);
      service.registerPostExecutionHook("post", postHook);
      service.registerStatusChangeHook("status", statusHook);

      // Simulate execution flow
      const shouldProceed = await service.runPreExecutionHooks(mockContext);
      expect(shouldProceed).toBe(true);

      await service.notifyStatusChange("exec-123", "pending", "running");
      await service.runPostExecutionHooks(mockContext, mockResult);
      await service.notifyStatusChange("exec-123", "running", "success");

      expect(preHook).toHaveBeenCalledTimes(1);
      expect(postHook).toHaveBeenCalledTimes(1);
      expect(statusHook).toHaveBeenCalledTimes(2);
    });

    it("should support error scenario", async () => {
      const preHook: PreExecutionHook = vi.fn().mockResolvedValue(true);
      const errorHook: ErrorHook = vi.fn().mockResolvedValue(undefined);
      const statusHook: StatusChangeHook = vi.fn().mockResolvedValue(undefined);

      service.registerPreExecutionHook("pre", preHook);
      service.registerErrorHook("error", errorHook);
      service.registerStatusChangeHook("status", statusHook);

      // Simulate execution with error
      await service.runPreExecutionHooks(mockContext);
      await service.notifyStatusChange("exec-123", "pending", "running");
      await service.runErrorHooks(mockContext, mockError);
      await service.notifyStatusChange("exec-123", "running", "error");

      expect(preHook).toHaveBeenCalledTimes(1);
      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(errorHook).toHaveBeenCalledWith(mockContext, mockError);
      expect(statusHook).toHaveBeenCalledTimes(2);
    });

    it("should abort execution if pre-hook returns false", async () => {
      const preHook: PreExecutionHook = vi.fn().mockResolvedValue(false);
      const postHook: PostExecutionHook = vi.fn().mockResolvedValue(undefined);

      service.registerPreExecutionHook("pre", preHook);
      service.registerPostExecutionHook("post", postHook);

      const shouldProceed = await service.runPreExecutionHooks(mockContext);
      expect(shouldProceed).toBe(false);

      // Post hook should not be called if execution was aborted
      expect(postHook).not.toHaveBeenCalled();
    });
  });
});
