import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUIStore } from '../../stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useUIStore());
    act(() => {
      result.current.setSidebarOpen(true);
      result.current.setTheme('dark');
      result.current.clearNotifications();
      result.current.closeModal();
    });
  });

  describe('Initial State', () => {
    it('should have sidebar open initially', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current.sidebarOpen).toBe(true);
    });

    it('should have dark theme initially', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current.theme).toBe('dark');
    });

    it('should have no notifications initially', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current.notifications).toEqual([]);
    });

    it('should have no active modal initially', () => {
      const { result } = renderHook(() => useUIStore());
      expect(result.current.activeModal).toBeNull();
    });
  });

  describe('Sidebar', () => {
    it('should toggle sidebar', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.sidebarOpen).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(true);
    });

    it('should set sidebar state', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.sidebarOpen).toBe(true);
    });
  });

  describe('Theme', () => {
    it('should set theme', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
    });

    it('should toggle theme', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.theme).toBe('dark');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
    });
  });

  describe('Notifications', () => {
    it('should add a notification', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({
          type: 'success',
          title: 'Success!',
          message: 'Operation completed',
        });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Success!');
      expect(result.current.notifications[0].type).toBe('success');
    });

    it('should generate unique ID for notifications', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({
          type: 'info',
          title: 'Info 1',
        });
        result.current.addNotification({
          type: 'info',
          title: 'Info 2',
        });
      });

      expect(result.current.notifications[0].id).not.toBe(
        result.current.notifications[1].id
      );
    });

    it('should set timestamp for notifications', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({
          type: 'warning',
          title: 'Warning!',
        });
      });

      expect(result.current.notifications[0].timestamp).toBeDefined();
    });

    it('should remove a notification', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({
          type: 'error',
          title: 'Error',
        });
      });

      const notificationId = result.current.notifications[0].id;

      act(() => {
        result.current.removeNotification(notificationId);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    it('should remove only the specified notification', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({
          type: 'info',
          title: 'Info 1',
        });
        result.current.addNotification({
          type: 'info',
          title: 'Info 2',
        });
      });

      const firstId = result.current.notifications[0].id;

      act(() => {
        result.current.removeNotification(firstId);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Info 2');
    });

    it('should clear all notifications', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.addNotification({ type: 'info', title: 'Info 1' });
        result.current.addNotification({ type: 'info', title: 'Info 2' });
        result.current.addNotification({ type: 'info', title: 'Info 3' });
      });

      expect(result.current.notifications).toHaveLength(3);

      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.notifications).toHaveLength(0);
    });
  });

  describe('Modal', () => {
    it('should open a modal', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('settings-modal');
      });

      expect(result.current.activeModal).toBe('settings-modal');
    });

    it('should close a modal', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('test-modal');
        result.current.closeModal();
      });

      expect(result.current.activeModal).toBeNull();
    });

    it('should replace active modal when opening new one', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.openModal('modal-1');
      });

      expect(result.current.activeModal).toBe('modal-1');

      act(() => {
        result.current.openModal('modal-2');
      });

      expect(result.current.activeModal).toBe('modal-2');
    });
  });
});
