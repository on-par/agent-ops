import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "../lib/api";
import type {
  ProviderSettings,
  ProviderSettingsInput,
  AvailableModel,
  ConnectionTestResult,
  ProviderType,
} from "../types/llm-provider";

// Query keys
export const providerSettingsKeys = {
  all: ["provider-settings"] as const,
  lists: () => [...providerSettingsKeys.all, "list"] as const,
  details: () => [...providerSettingsKeys.all, "detail"] as const,
  detail: (id: string) => [...providerSettingsKeys.details(), id] as const,
  models: (provider: string, baseUrl?: string) =>
    [...providerSettingsKeys.all, "models", provider, baseUrl || "default"] as const,
};

/**
 * Fetch all provider settings
 */
async function fetchProviderSettings(): Promise<ProviderSettings[]> {
  const response = await fetch(`${API_BASE}/api/provider-settings`);
  if (!response.ok) {
    throw new Error("Failed to fetch provider settings");
  }
  const data = await response.json();
  return data.settings || [];
}

/**
 * Fetch a single provider setting by ID
 */
async function fetchProviderSetting(id: string): Promise<ProviderSettings> {
  const response = await fetch(`${API_BASE}/api/provider-settings/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch provider setting");
  }
  const data = await response.json();
  return data.setting;
}

/**
 * Fetch the default provider settings
 */
async function fetchDefaultProviderSettings(): Promise<ProviderSettings | null> {
  try {
    const response = await fetch(`${API_BASE}/api/provider-settings/default`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.setting || null;
  } catch {
    return null;
  }
}

/**
 * Create new provider settings
 */
async function createProviderSetting(
  input: ProviderSettingsInput
): Promise<ProviderSettings> {
  const response = await fetch(`${API_BASE}/api/provider-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create setting" }));
    throw new Error(error.error || error.message || "Failed to create setting");
  }

  const data = await response.json();
  return data.setting;
}

/**
 * Update provider settings
 */
async function updateProviderSetting(
  id: string,
  input: Partial<ProviderSettingsInput>
): Promise<ProviderSettings> {
  const response = await fetch(`${API_BASE}/api/provider-settings/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update setting" }));
    throw new Error(error.error || error.message || "Failed to update setting");
  }

  const data = await response.json();
  return data.setting;
}

/**
 * Delete provider settings
 */
async function deleteProviderSetting(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/provider-settings/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to delete setting" }));
    throw new Error(error.error || error.message || "Failed to delete setting");
  }
}

/**
 * Test provider connection
 */
async function testProviderConnection(
  providerType: ProviderType,
  baseUrl?: string,
  apiKey?: string
): Promise<ConnectionTestResult> {
  const response = await fetch(`${API_BASE}/api/provider-settings/test-connection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providerType,
      baseUrl,
      apiKey,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Connection test failed" }));
    throw new Error(error.error || error.message || "Connection test failed");
  }

  return response.json();
}

/**
 * Fetch available models for a provider
 */
async function fetchAvailableModels(
  providerType: ProviderType,
  baseUrl?: string,
  apiKey?: string
): Promise<AvailableModel[]> {
  const params = new URLSearchParams();
  if (baseUrl) params.append("baseUrl", baseUrl);
  if (apiKey) params.append("apiKey", apiKey);

  const url = `${API_BASE}/api/provider-settings/models/${providerType}${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch available models");
  }

  const data = await response.json();
  return data.models || [];
}

/**
 * Set a provider as default
 */
async function setDefaultProviderSetting(id: string): Promise<ProviderSettings> {
  const response = await fetch(`${API_BASE}/api/provider-settings/${id}/set-default`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to set default" }));
    throw new Error(error.error || error.message || "Failed to set default");
  }

  const data = await response.json();
  return data.setting;
}

/**
 * Hook to fetch all provider settings
 */
export function useProviderSettings() {
  return useQuery({
    queryKey: providerSettingsKeys.lists(),
    queryFn: fetchProviderSettings,
  });
}

/**
 * Hook to fetch a single provider setting
 */
export function useProviderSetting(id: string) {
  return useQuery({
    queryKey: providerSettingsKeys.detail(id),
    queryFn: () => fetchProviderSetting(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch default provider settings
 */
export function useDefaultProviderSettings() {
  return useQuery({
    queryKey: ["provider-settings", "default"],
    queryFn: fetchDefaultProviderSettings,
  });
}

/**
 * Hook to create provider settings
 */
export function useCreateProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProviderSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: providerSettingsKeys.lists(),
      });
    },
  });
}

/**
 * Hook to update provider settings
 */
export function useUpdateProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProviderSettingsInput> }) =>
      updateProviderSetting(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: providerSettingsKeys.lists(),
      });
      queryClient.setQueryData(providerSettingsKeys.detail(data.id), data);
    },
  });
}

/**
 * Hook to delete provider settings
 */
export function useDeleteProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProviderSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: providerSettingsKeys.lists(),
      });
    },
  });
}

/**
 * Hook to test provider connection
 */
export function useTestConnection() {
  return useMutation({
    mutationFn: ({
      providerType,
      baseUrl,
      apiKey,
    }: {
      providerType: ProviderType;
      baseUrl?: string;
      apiKey?: string;
    }) => testProviderConnection(providerType, baseUrl, apiKey),
  });
}

/**
 * Hook to fetch available models for a provider
 */
export function useAvailableModels(
  providerType?: ProviderType,
  baseUrl?: string,
  apiKey?: string
) {
  return useQuery({
    queryKey: providerSettingsKeys.models(providerType || "", baseUrl),
    queryFn: () => fetchAvailableModels(providerType!, baseUrl, apiKey),
    enabled: !!providerType,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to set a provider as default
 */
export function useSetDefaultProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setDefaultProviderSetting,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: providerSettingsKeys.lists(),
      });
      queryClient.setQueryData(providerSettingsKeys.detail(data.id), data);
    },
  });
}
