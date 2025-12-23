/**
 * API client configuration for Agent Ops frontend
 * Reads the backend URL from environment variables injected by Aspire
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export { API_BASE };
