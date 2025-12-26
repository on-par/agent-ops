/**
 * React Query hooks for Templates API
 * Provides queries and mutations for template operations
 */

import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { templatesApi } from '../lib/api-templates';
import type { Template, RegisterTemplateInput, CloneTemplateInput } from '../types/api';

/**
 * Query keys factory for templates
 */
export const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: () => [...templateKeys.lists()] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
};

/**
 * Parse date fields from API response
 */
function parseTemplateDates(item: Record<string, unknown>): Template {
  return {
    ...item,
    createdAt: new Date(item.createdAt as string),
    updatedAt: new Date(item.updatedAt as string),
  } as Template;
}

/**
 * Fetch all templates
 */
async function fetchTemplates(): Promise<Template[]> {
  const templates = await templatesApi.getAll();
  return templates.map((template) => parseTemplateDates(template as unknown as Record<string, unknown>));
}

/**
 * Fetch single template
 */
async function fetchTemplate(id: string): Promise<Template> {
  const template = await templatesApi.getById(id);
  return parseTemplateDates(template as unknown as Record<string, unknown>);
}

/**
 * Query options for fetching all templates
 * Enables prefetching and cache operations with type inference
 */
export const templatesOptions = () => queryOptions({
  queryKey: templateKeys.list(),
  queryFn: fetchTemplates,
});

/**
 * Query options for fetching a single template by ID
 * Enables prefetching and cache operations with type inference
 */
export const templateOptions = (id: string) => queryOptions({
  queryKey: templateKeys.detail(id),
  queryFn: () => fetchTemplate(id),
  enabled: !!id,
});

/**
 * Hook to get all templates
 */
export function useTemplates(): UseQueryResult<Template[]> {
  return useQuery(templatesOptions());
}

/**
 * Hook to get a single template by ID
 */
export function useTemplate(id?: string): UseQueryResult<Template> {
  return useQuery(templateOptions(id || ''));
}

/**
 * Hook to register/create a new template
 */
export function useCreateTemplate(): UseMutationResult<Template, unknown, RegisterTemplateInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => templatesApi.register(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

/**
 * Hook to clone a template
 */
export function useCloneTemplate(
  id: string
): UseMutationResult<Template, unknown, CloneTemplateInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => templatesApi.clone(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}
