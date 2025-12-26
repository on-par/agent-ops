/**
 * Templates API endpoints
 * Handles all template related API calls
 */

import { apiClient } from './axios-client';
import type { Template, RegisterTemplateInput, CloneTemplateInput } from '../types/api';

export const templatesApi = {
  /**
   * Get all templates
   */
  getAll: (): Promise<Template[]> => {
    return apiClient.get<Template[]>('/api/templates');
  },

  /**
   * Get a single template by ID
   */
  getById: (id: string): Promise<Template> => {
    return apiClient.get<Template>(`/api/templates/${id}`);
  },

  /**
   * Register/create a new template
   */
  register: (data: RegisterTemplateInput): Promise<Template> => {
    return apiClient.post<Template>('/api/templates', data);
  },

  /**
   * Update an existing template
   */
  update: (id: string, data: Partial<RegisterTemplateInput>): Promise<Template> => {
    return apiClient.patch<Template>(`/api/templates/${id}`, data);
  },

  /**
   * Delete/unregister a template
   */
  delete: (id: string): Promise<void> => {
    return apiClient.delete<void>(`/api/templates/${id}`);
  },

  /**
   * Clone a template with a new name
   */
  clone: (id: string, data: CloneTemplateInput): Promise<Template> => {
    return apiClient.post<Template>(`/api/templates/${id}/clone`, data);
  },
};
