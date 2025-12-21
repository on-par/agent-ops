// API Client for Agent Ops platform

import type { ApiError, ApiResponse } from "../types";

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

// ============================================================================
// Error Classes
// ============================================================================

export class ApiClientError extends Error {
  code?: string;
  details?: unknown;
  status?: number;

  constructor(
    message: string,
    code?: string,
    details?: unknown,
    status?: number
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    response.success === false &&
    "error" in response
  );
}

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  /**
   * Makes a fetch request with proper error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const defaultHeaders: HeadersInit = {
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      // Handle non-JSON responses
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        if (!response.ok) {
          throw new ApiClientError(
            `HTTP ${response.status}: ${response.statusText}`,
            "HTTP_ERROR",
            undefined,
            response.status
          );
        }
        // For successful non-JSON responses (e.g., 204 No Content)
        return undefined as T;
      }

      const data = await response.json();

      // Check if response indicates an error
      if (isApiError(data)) {
        throw new ApiClientError(
          data.error.message,
          data.error.code,
          data.error.details,
          response.status
        );
      }

      // Check HTTP status even if response is JSON
      if (!response.ok) {
        throw new ApiClientError(
          data.message || `HTTP ${response.status}: ${response.statusText}`,
          "HTTP_ERROR",
          data,
          response.status
        );
      }

      // Return the data from a successful response
      if ("data" in data && "success" in data && data.success === true) {
        return (data as ApiResponse<T>).data;
      }

      // Fallback: return the whole response if it doesn't match our expected format
      return data as T;
    } catch (error) {
      // Re-throw ApiClientError instances
      if (error instanceof ApiClientError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new ApiClientError(
          "Network error: Unable to connect to the server",
          "NETWORK_ERROR",
          error
        );
      }

      // Handle other errors
      throw new ApiClientError(
        error instanceof Error ? error.message : "Unknown error occurred",
        "UNKNOWN_ERROR",
        error
      );
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = endpoint;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url = `${endpoint}?${searchParams.toString()}`;
    }

    return this.request<T>(url, { method: "GET" });
  }

  /**
   * POST request
   */
  async post<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const api = new ApiClient(API_BASE_URL);

// ============================================================================
// Utility function to convert API dates (Unix ms) to Date objects
// ============================================================================

export function parseApiDates<T>(
  obj: T,
  dateFields: (keyof T)[]
): T {
  const result = { ...obj } as any;

  for (const field of dateFields) {
    const value = result[field];
    if (typeof value === "number") {
      result[field] = new Date(value);
    } else if (typeof value === "string") {
      result[field] = new Date(value);
    }
  }

  return result as T;
}

// ============================================================================
// HTTP status helpers
// ============================================================================

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

export function isValidationError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 400;
}

export function isServerError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status !== undefined &&
    error.status >= 500
  );
}
