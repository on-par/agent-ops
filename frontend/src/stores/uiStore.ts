// UI State Zustand Store

import { create } from "zustand";

// ============================================================================
// Types
// ============================================================================

export type ModalType =
  | "createWorkItem"
  | "editWorkItem"
  | "createTemplate"
  | "editTemplate"
  | "spawnWorker"
  | "workerDetails"
  | null;

export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  timestamp: string;
}

interface UIState {
  // Layout
  sidebarOpen: boolean;
  theme: "light" | "dark";

  // Selection
  selectedWorkItemId: string | null;
  selectedWorkerId: string | null;
  selectedTemplateId: string | null;

  // Modals
  activeModal: ModalType;
  modalData: Record<string, unknown>;

  // Notifications
  notifications: Notification[];

  // Actions - Layout
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;

  // Actions - Selection
  selectWorkItem: (id: string | null) => void;
  selectWorker: (id: string | null) => void;
  selectTemplate: (id: string | null) => void;
  clearSelections: () => void;

  // Actions - Modals
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  // Actions - Notifications
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useUIStore = create<UIState>((set) => ({
  // Initial state - Layout
  sidebarOpen: true,
  theme: "dark",

  // Initial state - Selection
  selectedWorkItemId: null,
  selectedWorkerId: null,
  selectedTemplateId: null,

  // Initial state - Modals
  activeModal: null,
  modalData: {},

  // Initial state - Notifications
  notifications: [],

  // Actions - Layout
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setTheme: (theme) => set({ theme }),

  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === "light" ? "dark" : "light",
    })),

  // Actions - Selection
  selectWorkItem: (id) => set({ selectedWorkItemId: id }),

  selectWorker: (id) => set({ selectedWorkerId: id }),

  selectTemplate: (id) => set({ selectedTemplateId: id }),

  clearSelections: () =>
    set({
      selectedWorkItemId: null,
      selectedWorkerId: null,
      selectedTemplateId: null,
    }),

  // Actions - Modals
  openModal: (modal, data = {}) =>
    set({
      activeModal: modal,
      modalData: data,
    }),

  closeModal: () =>
    set({
      activeModal: null,
      modalData: {},
    }),

  // Actions - Notifications
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id: `notif-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));
