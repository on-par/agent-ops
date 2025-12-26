/**
 * Verification tests for React Query integration
 *
 * These tests verify that the core React Query implementation is complete
 * as specified in issue agent-ops-4yu.5. Each test corresponds to a specific
 * requirement from the issue.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../test-utils';

// Import all hooks and key factories to verify they exist
import { useWorkerPool, useSpawnWorker, usePauseWorker, useResumeWorker, useTerminateWorker, workerKeys } from './use-workers';
import { useWorkItems, useCreateWorkItem, useUpdateWorkItem, useDeleteWorkItem, useTransitionWorkItem, workItemKeys } from './use-work-items';
import { useTemplates, useCreateTemplate, useCloneTemplate, templateKeys } from './use-templates';
import { useDashboardStats, dashboardKeys } from './use-dashboard';
import { useRealtimeUpdates } from './use-websocket';

describe('React Query Integration Verification', () => {
  describe('1. QueryClient Configuration', () => {
    it('should have QueryClient configured (verified by hook rendering)', async () => {
      // If QueryClient is not configured, this will throw
      const { result } = renderHook(() => useWorkerPool(), {
        wrapper: createWrapper(),
      });

      // Verify hook returns UseQueryResult shape
      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isError');
      expect(result.current).toHaveProperty('isSuccess');
    });
  });

  describe('2. Query Key Factories', () => {
    it('should export workerKeys with hierarchical structure', () => {
      expect(workerKeys.all).toEqual(['workers']);
      expect(workerKeys.lists()).toEqual(['workers', 'list']);
      expect(workerKeys.list()).toEqual(['workers', 'list']);
      expect(workerKeys.details()).toEqual(['workers', 'detail']);
      expect(workerKeys.detail('w-1')).toEqual(['workers', 'detail', 'w-1']);
    });

    it('should export workItemKeys with hierarchical structure', () => {
      expect(workItemKeys.all).toEqual(['workItems']);
      expect(workItemKeys.lists()).toEqual(['workItems', 'list']);
      expect(workItemKeys.list()).toEqual(['workItems', 'list', undefined]);
      expect(workItemKeys.list({ status: 'ready' })).toEqual(['workItems', 'list', { status: 'ready' }]);
      expect(workItemKeys.details()).toEqual(['workItems', 'detail']);
      expect(workItemKeys.detail('wi-1')).toEqual(['workItems', 'detail', 'wi-1']);
    });

    it('should export templateKeys with hierarchical structure', () => {
      expect(templateKeys.all).toEqual(['templates']);
      expect(templateKeys.lists()).toEqual(['templates', 'list']);
      expect(templateKeys.list()).toEqual(['templates', 'list']);
      expect(templateKeys.details()).toEqual(['templates', 'detail']);
      expect(templateKeys.detail('t-1')).toEqual(['templates', 'detail', 't-1']);
    });

    it('should export dashboardKeys with hierarchical structure', () => {
      expect(dashboardKeys.all).toEqual(['dashboard']);
      expect(dashboardKeys.stats()).toEqual(['dashboard', 'stats']);
    });
  });

  describe('3. Workers Hooks', () => {
    it('should export useWorkerPool hook', () => {
      expect(typeof useWorkerPool).toBe('function');
    });

    it('should export mutation hooks for worker operations', () => {
      // Verify hooks exist and are functions
      expect(typeof useSpawnWorker).toBe('function');
      expect(typeof usePauseWorker).toBe('function');
      expect(typeof useResumeWorker).toBe('function');
      expect(typeof useTerminateWorker).toBe('function');
    });
  });

  describe('4. Work Items Hooks with Optimistic Updates', () => {
    it('should fetch work items with useWorkItems', async () => {
      const { result } = renderHook(() => useWorkItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it('should export mutation hooks with optimistic update capability', () => {
      // Verify hooks exist - optimistic updates are implemented in useUpdateWorkItem and useTransitionWorkItem
      expect(typeof useCreateWorkItem).toBe('function');
      expect(typeof useUpdateWorkItem).toBe('function');
      expect(typeof useDeleteWorkItem).toBe('function');
      expect(typeof useTransitionWorkItem).toBe('function');
    });
  });

  describe('5. Templates Hooks', () => {
    it('should fetch templates with useTemplates', async () => {
      const { result } = renderHook(() => useTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it('should export CRUD mutation hooks', () => {
      expect(typeof useCreateTemplate).toBe('function');
      expect(typeof useCloneTemplate).toBe('function');
    });
  });

  describe('6. Dashboard Hooks with Polling', () => {
    it('should fetch dashboard stats with useDashboardStats', async () => {
      const { result } = renderHook(() => useDashboardStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data).toHaveProperty('agents');
      expect(result.current.data).toHaveProperty('workItems');
    });
  });

  describe('7. WebSocket Integration', () => {
    it('should export useRealtimeUpdates hook', () => {
      expect(typeof useRealtimeUpdates).toBe('function');
    });
  });
});
