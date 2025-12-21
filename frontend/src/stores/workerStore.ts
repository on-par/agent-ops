// Workers Zustand Store

import { create } from "zustand";
import type { Worker, WorkerStatus } from "../types";

interface WorkerState {
  // Data
  workers: Worker[];
  selectedWorkerId: string | null;

  // Actions
  setWorkers: (workers: Worker[]) => void;
  addWorker: (worker: Worker) => void;
  updateWorker: (id: string, updates: Partial<Worker>) => void;
  removeWorker: (id: string) => void;
  selectWorker: (id: string | null) => void;

  // Bulk operations
  updateWorkerStatus: (id: string, status: WorkerStatus) => void;
  updateWorkerMetrics: (
    id: string,
    metrics: Partial<
      Pick<
        Worker,
        | "contextWindowUsed"
        | "tokensUsed"
        | "costUsd"
        | "toolCalls"
        | "errors"
      >
    >
  ) => void;
  clearWorkers: () => void;

  // Getters
  getWorkerById: (id: string) => Worker | undefined;
  getWorkersByStatus: (status: WorkerStatus) => Worker[];
  getWorkersByTemplate: (templateId: string) => Worker[];
  getActiveWorkers: () => Worker[];
  getSelectedWorker: () => Worker | undefined;
}

export const useWorkerStore = create<WorkerState>((set, get) => ({
  // Initial state
  workers: [],
  selectedWorkerId: null,

  // Actions
  setWorkers: (workers) => set({ workers }),

  addWorker: (worker) =>
    set((state) => ({
      workers: [...state.workers, worker],
    })),

  updateWorker: (id, updates) =>
    set((state) => ({
      workers: state.workers.map((worker) =>
        worker.id === id ? { ...worker, ...updates } : worker
      ),
    })),

  removeWorker: (id) =>
    set((state) => ({
      workers: state.workers.filter((worker) => worker.id !== id),
      selectedWorkerId:
        state.selectedWorkerId === id ? null : state.selectedWorkerId,
    })),

  selectWorker: (id) => set({ selectedWorkerId: id }),

  updateWorkerStatus: (id, status) =>
    set((state) => ({
      workers: state.workers.map((worker) =>
        worker.id === id ? { ...worker, status } : worker
      ),
    })),

  updateWorkerMetrics: (id, metrics) =>
    set((state) => ({
      workers: state.workers.map((worker) =>
        worker.id === id ? { ...worker, ...metrics } : worker
      ),
    })),

  clearWorkers: () => set({ workers: [], selectedWorkerId: null }),

  // Getters
  getWorkerById: (id) => get().workers.find((worker) => worker.id === id),

  getWorkersByStatus: (status) =>
    get().workers.filter((worker) => worker.status === status),

  getWorkersByTemplate: (templateId) =>
    get().workers.filter((worker) => worker.templateId === templateId),

  getActiveWorkers: () =>
    get().workers.filter((worker) => worker.status === "working"),

  getSelectedWorker: () => {
    const { selectedWorkerId, workers } = get();
    return selectedWorkerId
      ? workers.find((worker) => worker.id === selectedWorkerId)
      : undefined;
  },
}));
