// Work Items Zustand Store

import { create } from "zustand";
import type { WorkItem, WorkItemStatus } from "../types";

interface WorkItemState {
  // Data
  items: WorkItem[];
  selectedItemId: string | null;

  // Actions
  setItems: (items: WorkItem[]) => void;
  addItem: (item: WorkItem) => void;
  updateItem: (id: string, updates: Partial<WorkItem>) => void;
  removeItem: (id: string) => void;
  selectItem: (id: string | null) => void;

  // Bulk operations
  updateItemStatus: (id: string, status: WorkItemStatus) => void;
  clearItems: () => void;

  // Getters
  getItemById: (id: string) => WorkItem | undefined;
  getItemsByStatus: (status: WorkItemStatus) => WorkItem[];
  getSelectedItem: () => WorkItem | undefined;
}

export const useWorkItemStore = create<WorkItemState>((set, get) => ({
  // Initial state
  items: [],
  selectedItemId: null,

  // Actions
  setItems: (items) => set({ items }),

  addItem: (item) =>
    set((state) => ({
      items: [...state.items, item],
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
    })),

  selectItem: (id) => set({ selectedItemId: id }),

  updateItemStatus: (id, status) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status } : item
      ),
    })),

  clearItems: () => set({ items: [], selectedItemId: null }),

  // Getters
  getItemById: (id) => get().items.find((item) => item.id === id),

  getItemsByStatus: (status) =>
    get().items.filter((item) => item.status === status),

  getSelectedItem: () => {
    const { selectedItemId, items } = get();
    return selectedItemId
      ? items.find((item) => item.id === selectedItemId)
      : undefined;
  },
}));
