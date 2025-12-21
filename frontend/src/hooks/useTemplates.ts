// React Query hooks for Templates

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, parseApiDates } from "../lib/api";
import type { Template, CreateTemplateDTO, UpdateTemplateDTO } from "../types";
import { useTemplateStore } from "../stores/templateStore";

// ============================================================================
// Query Keys
// ============================================================================

export const templateKeys = {
  all: ["templates"] as const,
  lists: () => [...templateKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...templateKeys.lists(), filters] as const,
  details: () => [...templateKeys.all, "detail"] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchTemplates(): Promise<Template[]> {
  const templates = await api.get<Template[]>("/templates");
  return templates.map((template) =>
    parseApiDates(template, ["createdAt", "updatedAt"])
  );
}

async function fetchTemplate(id: string): Promise<Template> {
  const template = await api.get<Template>(`/templates/${id}`);
  return parseApiDates(template, ["createdAt", "updatedAt"]);
}

async function createTemplate(data: CreateTemplateDTO): Promise<Template> {
  const template = await api.post<Template>("/templates", data);
  return parseApiDates(template, ["createdAt", "updatedAt"]);
}

async function updateTemplate(
  id: string,
  data: UpdateTemplateDTO
): Promise<Template> {
  const template = await api.patch<Template>(`/templates/${id}`, data);
  return parseApiDates(template, ["createdAt", "updatedAt"]);
}

async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/templates/${id}`);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all templates
 */
export function useTemplates() {
  const setTemplates = useTemplateStore((state) => state.setTemplates);

  const query = useQuery({
    queryKey: templateKeys.lists(),
    queryFn: fetchTemplates,
    staleTime: 60000, // 60 seconds (templates change less frequently)
  });

  // Update store when data changes
  if (query.data) {
    setTemplates(query.data);
  }

  return query;
}

/**
 * Fetch a single template by ID
 */
export function useTemplate(id: string) {
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);

  const query = useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
    staleTime: 60000,
  });

  // Update store when data changes
  if (query.data) {
    updateTemplate(id, query.data);
  }

  return query;
}

/**
 * Create a new template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const addTemplate = useTemplateStore((state) => state.addTemplate);

  return useMutation({
    mutationFn: createTemplate,
    onSuccess: (data) => {
      // Invalidate and refetch templates list
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      // Add to store
      addTemplate(data);
    },
  });
}

/**
 * Update an existing template
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const updateTemplateInStore = useTemplateStore((state) => state.updateTemplate);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateDTO }) =>
      updateTemplate(id, data),
    onSuccess: (data, variables) => {
      // Invalidate specific template and list
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      // Update store
      updateTemplateInStore(variables.id, data);
    },
  });
}

/**
 * Delete a template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const removeTemplate = useTemplateStore((state) => state.removeTemplate);

  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: (_, id) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.removeQueries({ queryKey: templateKeys.detail(id) });
      // Remove from store
      removeTemplate(id);
    },
  });
}

/**
 * Duplicate a template (create a copy)
 */
export function useDuplicateTemplate() {
  const createTemplate = useCreateTemplate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const original = await fetchTemplate(id);
      const duplicate: CreateTemplateDTO = {
        name: `${original.name} (Copy)`,
        description: original.description,
        systemPrompt: original.systemPrompt,
        permissionMode: original.permissionMode,
        maxTurns: original.maxTurns,
        builtinTools: original.builtinTools,
        mcpServers: original.mcpServers,
        allowedWorkItemTypes: original.allowedWorkItemTypes,
        defaultRole: original.defaultRole,
      };
      return createTemplate.mutateAsync(duplicate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}
