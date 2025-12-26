import type { LogLevel, StructuredLogEntry } from "../types/container.types.js";

/**
 * Detect log level from message content using keyword matching
 * @param message - The log message to analyze
 * @returns The detected log level
 */
export function detectLogLevel(message: string): LogLevel {
  const lowerMessage = message.toLowerCase();

  // Check for error patterns
  if (
    lowerMessage.includes("error") ||
    lowerMessage.includes("fatal") ||
    lowerMessage.includes("fail") ||
    lowerMessage.includes("exception")
  ) {
    return "error";
  }

  // Check for warning patterns
  if (
    lowerMessage.includes("warn") ||
    lowerMessage.includes("warning") ||
    lowerMessage.includes("caution") ||
    lowerMessage.includes("deprecated")
  ) {
    return "warn";
  }

  // Check for debug patterns
  if (
    lowerMessage.includes("debug") ||
    lowerMessage.includes("trace") ||
    lowerMessage.includes("verbose")
  ) {
    return "debug";
  }

  // Default to info
  return "info";
}

/**
 * Parse a Docker log line into a structured entry
 * @param line - Raw log line from Docker
 * @param hasTimestamps - Whether Docker timestamps are included
 * @returns Structured log entry or null for empty lines
 */
export function parseLogLine(
  line: string,
  hasTimestamps: boolean
): StructuredLogEntry | null {
  // Handle empty or whitespace-only lines
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  let timestamp: string;
  let message: string;

  if (hasTimestamps) {
    // Docker format: "2025-12-26T10:30:45.123456789Z actual log message"
    const match = trimmedLine.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);

    if (match && match[1] && match[2]) {
      timestamp = match[1];
      message = match[2].trim();
    } else {
      // Fallback if timestamp pattern doesn't match
      timestamp = new Date().toISOString();
      message = trimmedLine;
    }
  } else {
    // Generate current timestamp
    timestamp = new Date().toISOString();
    message = trimmedLine;
  }

  // Detect log level from message content
  const level = detectLogLevel(message);

  return {
    timestamp,
    level,
    message,
  };
}
