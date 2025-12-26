import { describe, it, expect } from "vitest";
import { detectLogLevel, parseLogLine } from "../utils/log-parser.js";
import type { LogLevel } from "../types/container.types.js";

describe("log-parser", () => {
  describe("detectLogLevel()", () => {
    it("should return 'error' for messages containing ERROR", () => {
      expect(detectLogLevel("ERROR: Something failed")).toBe("error");
    });

    it("should return 'error' for messages containing Error", () => {
      expect(detectLogLevel("Error occurred")).toBe("error");
    });

    it("should return 'error' for messages containing error", () => {
      expect(detectLogLevel("an error happened")).toBe("error");
    });

    it("should return 'error' for messages containing FATAL", () => {
      expect(detectLogLevel("FATAL: Process crashed")).toBe("error");
    });

    it("should return 'error' for messages containing fatal", () => {
      expect(detectLogLevel("fatal error")).toBe("error");
    });

    it("should return 'error' for messages containing FAIL", () => {
      expect(detectLogLevel("FAIL: Test failed")).toBe("error");
    });

    it("should return 'error' for messages containing fail", () => {
      expect(detectLogLevel("operation failed")).toBe("error");
    });

    it("should return 'warn' for messages containing WARN", () => {
      expect(detectLogLevel("WARN: Check this")).toBe("warn");
    });

    it("should return 'warn' for messages containing Warning", () => {
      expect(detectLogLevel("Warning: deprecated API")).toBe("warn");
    });

    it("should return 'warn' for messages containing warning", () => {
      expect(detectLogLevel("this is a warning")).toBe("warn");
    });

    it("should return 'warn' for messages containing CAUTION", () => {
      expect(detectLogLevel("CAUTION: Verify settings")).toBe("warn");
    });

    it("should return 'debug' for messages containing DEBUG", () => {
      expect(detectLogLevel("DEBUG: Entering function")).toBe("debug");
    });

    it("should return 'debug' for messages containing Debug", () => {
      expect(detectLogLevel("Debug info here")).toBe("debug");
    });

    it("should return 'debug' for messages containing debug", () => {
      expect(detectLogLevel("debugging output")).toBe("debug");
    });

    it("should return 'debug' for messages containing TRACE", () => {
      expect(detectLogLevel("TRACE: Call stack")).toBe("debug");
    });

    it("should return 'debug' for messages containing trace", () => {
      expect(detectLogLevel("trace output")).toBe("debug");
    });

    it("should return 'info' for messages without level keywords", () => {
      expect(detectLogLevel("Application started successfully")).toBe("info");
    });

    it("should return 'info' as default", () => {
      expect(detectLogLevel("Random log message")).toBe("info");
    });
  });

  describe("parseLogLine()", () => {
    it("should extract Docker ISO 8601 timestamp when hasTimestamps=true", () => {
      const line =
        "2025-12-26T10:30:45.123456789Z Container started successfully";
      const result = parseLogLine(line, true);

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBe("2025-12-26T10:30:45.123456789Z");
      expect(result!.message).toBe("Container started successfully");
    });

    it("should generate current timestamp when hasTimestamps=false", () => {
      const line = "Log message without timestamp";
      const beforeTime = new Date().toISOString();
      const result = parseLogLine(line, false);
      const afterTime = new Date().toISOString();

      expect(result).not.toBeNull();
      // ISO 8601 timestamps are lexicographically comparable
      expect(result!.timestamp >= beforeTime && result!.timestamp <= afterTime).toBe(
        true
      );
      expect(result!.message).toBe("Log message without timestamp");
    });

    it("should return null for empty strings", () => {
      const result = parseLogLine("", true);
      expect(result).toBeNull();
    });

    it("should return null for whitespace-only strings", () => {
      const result = parseLogLine("   ", true);
      expect(result).toBeNull();
    });

    it("should preserve full message content after timestamp extraction", () => {
      const line = "2025-12-26T10:30:45.123456789Z Error: Failed to connect";
      const result = parseLogLine(line, true);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("Error: Failed to connect");
    });

    it("should correctly detect log level from message content", () => {
      const line = "2025-12-26T10:30:45.123456789Z ERROR: Connection lost";
      const result = parseLogLine(line, true);

      expect(result).not.toBeNull();
      expect(result!.level).toBe("error");
    });

    it("should handle multiline-like strings (just the first line)", () => {
      const line = "2025-12-26T10:30:45.123456789Z First line";
      const result = parseLogLine(line, true);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("First line");
    });

    it("should trim leading/trailing whitespace from message", () => {
      const line = "2025-12-26T10:30:45.123456789Z   trimmed message   ";
      const result = parseLogLine(line, true);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("trimmed message");
    });
  });
});
