import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkerStore, type Worker } from '../../stores/workerStore';

describe('workerStore', () => {
  const mockWorker: Worker = {
    id: 'worker-1',
    name: 'Test Worker',
    status: 'active',
    currentTask: 'Processing data',
    tasksCompleted: 100,
    successRate: 98.5,
  };

  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useWorkerStore());
    act(() => {
      result.current.clearWorkers();
    });
  });

  describe('Initial State', () => {
    it('should have empty workers array initially', () => {
      const { result } = renderHook(() => useWorkerStore());
      expect(result.current.workers).toEqual([]);
    });

    it('should have no selected worker initially', () => {
      const { result } = renderHook(() => useWorkerStore());
      expect(result.current.selectedWorkerId).toBeNull();
    });
  });

  describe('addWorker', () => {
    it('should add a new worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      expect(result.current.workers).toHaveLength(1);
      expect(result.current.workers[0]).toEqual(mockWorker);
    });

    it('should add multiple workers', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
        result.current.addWorker({
          ...mockWorker,
          id: 'worker-2',
          name: 'Another Worker',
        });
      });

      expect(result.current.workers).toHaveLength(2);
    });
  });

  describe('updateWorker', () => {
    it('should update worker properties', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      act(() => {
        result.current.updateWorker('worker-1', {
          currentTask: 'New task',
          tasksCompleted: 101,
        });
      });

      expect(result.current.workers[0].currentTask).toBe('New task');
      expect(result.current.workers[0].tasksCompleted).toBe(101);
      expect(result.current.workers[0].name).toBe('Test Worker'); // Unchanged
    });

    it('should set lastActive timestamp on update', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      const lastActive = new Date().toISOString();

      act(() => {
        result.current.updateWorker('worker-1', {
          status: 'idle',
          lastActive,
        });
      });

      expect(result.current.workers[0].lastActive).toBeDefined();
    });

    it('should not update non-existent worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      act(() => {
        result.current.updateWorker('non-existent', { status: 'paused' });
      });

      expect(result.current.workers[0].status).toBe('active');
    });
  });

  describe('removeWorker', () => {
    it('should remove a worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      act(() => {
        result.current.removeWorker('worker-1');
      });

      expect(result.current.workers).toHaveLength(0);
    });

    it('should deselect worker if removed', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
        result.current.selectWorker('worker-1');
      });

      expect(result.current.selectedWorkerId).toBe('worker-1');

      act(() => {
        result.current.removeWorker('worker-1');
      });

      expect(result.current.selectedWorkerId).toBeNull();
    });

    it('should keep selection if different worker is removed', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
        result.current.addWorker({
          ...mockWorker,
          id: 'worker-2',
          name: 'Another Worker',
        });
        result.current.selectWorker('worker-1');
      });

      act(() => {
        result.current.removeWorker('worker-2');
      });

      expect(result.current.selectedWorkerId).toBe('worker-1');
    });
  });

  describe('selectWorker', () => {
    it('should select a worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.selectWorker('worker-1');
      });

      expect(result.current.selectedWorkerId).toBe('worker-1');
    });

    it('should deselect by passing null', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.selectWorker('worker-1');
        result.current.selectWorker(null);
      });

      expect(result.current.selectedWorkerId).toBeNull();
    });
  });

  describe('pauseWorker', () => {
    it('should pause an active worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      act(() => {
        result.current.updateWorkerStatus('worker-1', 'paused');
      });

      expect(result.current.workers[0].status).toBe('paused');
    });
  });

  describe('resumeWorker', () => {
    it('should resume a paused worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker({ ...mockWorker, status: 'paused' });
      });

      act(() => {
        result.current.updateWorkerStatus('worker-1', 'working');
      });

      expect(result.current.workers[0].status).toBe('working');
    });
  });

  describe('getActiveWorkers', () => {
    it('should return only active workers', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker({ ...mockWorker, id: 'w1', status: 'working' });
        result.current.addWorker({ ...mockWorker, id: 'w2', status: 'idle' });
        result.current.addWorker({ ...mockWorker, id: 'w3', status: 'working' });
        result.current.addWorker({ ...mockWorker, id: 'w4', status: 'paused' });
      });

      const activeWorkers = result.current.getActiveWorkers();
      expect(activeWorkers).toHaveLength(2);
      expect(activeWorkers.every((w) => w.status === 'working')).toBe(true);
    });
  });

  describe('getWorkerById', () => {
    it('should return worker by id', () => {
      const { result } = renderHook(() => useWorkerStore());

      act(() => {
        result.current.addWorker(mockWorker);
      });

      const worker = result.current.getWorkerById('worker-1');
      expect(worker).toEqual(mockWorker);
    });

    it('should return undefined for non-existent worker', () => {
      const { result } = renderHook(() => useWorkerStore());

      const worker = result.current.getWorkerById('non-existent');
      expect(worker).toBeUndefined();
    });
  });

  describe('setWorkers', () => {
    it('should replace all workers', () => {
      const { result } = renderHook(() => useWorkerStore());

      const newWorkers = [
        { ...mockWorker, id: 'w1' },
        { ...mockWorker, id: 'w2' },
      ];

      act(() => {
        result.current.setWorkers(newWorkers);
      });

      expect(result.current.workers).toEqual(newWorkers);
    });
  });
});
