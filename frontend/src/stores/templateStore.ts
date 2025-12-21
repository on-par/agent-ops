// Templates Zustand Store

import { create } from "zustand";
import type { Template } from "../types";

interface TemplateState {
  // Data
  templates: Template[];
  selectedTemplateId: string | null;

  // Actions
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  selectTemplate: (id: string | null) => void;

  // Bulk operations
  clearTemplates: () => void;

  // Getters
  getTemplateById: (id: string) => Template | undefined;
  getTemplatesByCreator: (createdBy: string) => Template[];
  getSystemTemplates: () => Template[];
  getUserTemplates: () => Template[];
  getSelectedTemplate: () => Template | undefined;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  // Initial state
  templates: [],
  selectedTemplateId: null,

  // Actions
  setTemplates: (templates) => set({ templates }),

  addTemplate: (template) =>
    set((state) => ({
      templates: [...state.templates, template],
    })),

  updateTemplate: (id, updates) =>
    set((state) => ({
      templates: state.templates.map((template) =>
        template.id === id ? { ...template, ...updates } : template
      ),
    })),

  removeTemplate: (id) =>
    set((state) => ({
      templates: state.templates.filter((template) => template.id !== id),
      selectedTemplateId:
        state.selectedTemplateId === id ? null : state.selectedTemplateId,
    })),

  selectTemplate: (id) => set({ selectedTemplateId: id }),

  clearTemplates: () => set({ templates: [], selectedTemplateId: null }),

  // Getters
  getTemplateById: (id) =>
    get().templates.find((template) => template.id === id),

  getTemplatesByCreator: (createdBy) =>
    get().templates.filter((template) => template.createdBy === createdBy),

  getSystemTemplates: () =>
    get().templates.filter((template) => template.createdBy === "system"),

  getUserTemplates: () =>
    get().templates.filter((template) => template.createdBy !== "system"),

  getSelectedTemplate: () => {
    const { selectedTemplateId, templates } = get();
    return selectedTemplateId
      ? templates.find((template) => template.id === selectedTemplateId)
      : undefined;
  },
}));
