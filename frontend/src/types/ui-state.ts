/**
 * UI state types for Zustand stores
 * These types define the shape of client-side state managed by Zustand
 */

import type { WorkItemStatus, WorkerStatus } from './dashboard';

/**
 * Kanban page UI state
 */
export interface KanbanUIState {
  statusFilter: WorkItemStatus | 'all';
  searchQuery: string;
  draggedItemId: string | null;
  dropTargetColumnId: string | null;
  selectedWorkItemId: string | null;
  isCreateModalOpen: boolean;
  isEditModalOpen: boolean;

  // Actions
  setStatusFilter: (status: WorkItemStatus | 'all') => void;
  setSearchQuery: (query: string) => void;
  setDraggedItem: (id: string | null) => void;
  setDropTarget: (columnId: string | null) => void;
  setSelectedWorkItem: (id: string | null) => void;
  setCreateModalOpen: (open: boolean) => void;
  setEditModalOpen: (open: boolean) => void;
}

/**
 * Agents page UI state
 */
export interface AgentsUIState {
  statusFilter: WorkerStatus | 'all';
  searchQuery: string;
  selectedWorkerId: string | null;
  isSpawnModalOpen: boolean;

  // Actions
  setStatusFilter: (status: WorkerStatus | 'all') => void;
  setSearchQuery: (query: string) => void;
  setSelectedWorker: (id: string | null) => void;
  setSpawnModalOpen: (open: boolean) => void;
}

/**
 * Dashboard page UI state
 */
export interface DashboardUIState {
  timePeriod: 'today' | 'week' | 'month' | 'year';
  isAutoRefresh: boolean;

  // Actions
  setTimePeriod: (period: 'today' | 'week' | 'month' | 'year') => void;
  setAutoRefresh: (enabled: boolean) => void;
}

/**
 * Global UI state for non-page-specific UI concerns
 */
export interface GlobalUIState {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}
