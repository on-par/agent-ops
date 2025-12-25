/**
 * Axios HTTP client for Agent Ops API
 * Provides type-safe request/response handling with interceptors
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { API_BASE } from './api';
import type { ApiError } from '../types/api';

/**
 * Create axios instance with base configuration
 */
export const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add headers and handle setup
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle success and errors
 */
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Normalize errors into ApiError type
    const apiError: ApiError = {
      type: 'network',
      message: 'Unknown error occurred',
    };

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;

        if (status === 400) {
          apiError.type = 'validation';
          const responseData = error.response.data as Record<string, unknown>;
          apiError.message = (responseData?.message as string) || 'Invalid request';
          apiError.details = responseData?.details as Record<string, unknown>;
        } else if (status === 401) {
          apiError.type = 'unauthorized';
          apiError.message = 'Unauthorized - please log in';
        } else if (status === 404) {
          apiError.type = 'not_found';
          apiError.message = 'Resource not found';
        } else if (status >= 500) {
          apiError.type = 'server';
          const responseData = error.response.data as Record<string, unknown>;
          apiError.message = (responseData?.message as string) || 'Server error';
        } else {
          apiError.type = 'server';
          apiError.message = error.message;
        }

        apiError.statusCode = status;
      } else if (error.request) {
        // Request made but no response
        apiError.type = 'network';
        apiError.message = 'No response from server';
      } else {
        // Error in request setup
        apiError.type = 'network';
        apiError.message = error.message;
      }
    } else {
      apiError.message = error instanceof Error ? error.message : String(error);
    }

    return Promise.reject(apiError);
  }
);

/**
 * Generic API client methods
 */
export const apiClient = {
  /**
   * GET request
   */
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.get<T>(url, config).then((response) => response.data);
  },

  /**
   * POST request
   */
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.post<T>(url, data, config).then((response) => response.data);
  },

  /**
   * PATCH request
   */
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.patch<T>(url, data, config).then((response) => response.data);
  },

  /**
   * DELETE request
   */
  delete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.delete<T>(url, config).then((response) => response.data);
  },
};

export default apiClient;
