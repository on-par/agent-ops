/**
 * UI state types for Zustand stores
 * These types define the shape of client-side state managed by Zustand
 */

import type { WorkItemStatus, WorkItemType, WorkItemPriority, WorkerStatus } from './dashboard';

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
 * Work Items page UI state
 *
 * NOTE: This interface defines UI-only state. Server state (CRUD operations,
 * status transitions, optimistic updates) is managed by React Query hooks
 * in frontend/src/hooks/use-work-items.ts
 */
export interface WorkItemsUIState {
  // Filters
  statusFilter: WorkItemStatus | 'all';
  typeFilter: WorkItemType | 'all';
  priorityFilter: WorkItemPriority | 'all';
  searchQuery: string;

  // Selection
  selectedWorkItemId: string | null;

  // Modals
  isCreateModalOpen: boolean;
  isEditModalOpen: boolean;

  // Actions
  setStatusFilter: (status: WorkItemStatus | 'all') => void;
  setTypeFilter: (type: WorkItemType | 'all') => void;
  setPriorityFilter: (priority: WorkItemPriority | 'all') => void;
  setSearchQuery: (query: string) => void;
  setSelectedWorkItem: (id: string | null) => void;
  setCreateModalOpen: (open: boolean) => void;
  setEditModalOpen: (open: boolean) => void;
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
