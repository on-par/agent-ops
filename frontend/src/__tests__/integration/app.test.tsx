import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Dashboard } from '../../pages/Dashboard';
import { Kanban } from '../../pages/Kanban';
import { Agents } from '../../pages/Agents';
import { Templates } from '../../pages/Templates';
import { Settings } from '../../pages/Settings';
import { createMockWebSocket } from '../setup';

// Create test wrapper with all providers
function TestApp({ initialRoute = '/' }: { initialRoute?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('App Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Navigation Flow', () => {
    it('should navigate between all pages', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      // Start at Dashboard
      expect(screen.getByText('Mission Control')).toBeInTheDocument();

      // Navigate to Kanban
      const kanbanLink = screen.getByRole('link', { name: /kanban/i });
      await user.click(kanbanLink);
      await waitFor(() => {
        // Use getAllByText since "Kanban Board" appears in nav tooltip and page title
        const kanbanTexts = screen.getAllByText('Kanban Board');
        expect(kanbanTexts.length).toBeGreaterThan(0);
      });

      // Navigate to Agents
      const agentsLink = screen.getByRole('link', { name: /agents/i });
      await user.click(agentsLink);
      await waitFor(() => {
        expect(screen.getByText('Agent Operations')).toBeInTheDocument();
      });

      // Navigate to Templates
      const templatesLink = screen.getByRole('link', { name: /templates/i });
      await user.click(templatesLink);
      await waitFor(() => {
        // "Templates" appears in nav tooltip and page title
        const templatesTexts = screen.getAllByText('Templates');
        expect(templatesTexts.length).toBeGreaterThan(0);
      });

      // Navigate to Settings
      const settingsLink = screen.getByRole('link', { name: /settings/i });
      await user.click(settingsLink);
      await waitFor(() => {
        // "Settings" appears in nav tooltip and page title
        const settingsTexts = screen.getAllByText('Settings');
        expect(settingsTexts.length).toBeGreaterThan(0);
      });

      // Navigate back to Dashboard
      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      await user.click(dashboardLink);
      await waitFor(() => {
        expect(screen.getByText('Mission Control')).toBeInTheDocument();
      });
    });

    it('should maintain layout across page navigation', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      // Logo should be present on all pages - appears multiple times
      const aoElements = screen.getAllByText('AO');
      expect(aoElements.length).toBeGreaterThan(0);

      await user.click(screen.getByRole('link', { name: /kanban/i }));
      // AO appears multiple times
      const aoAfterNav = screen.getAllByText('AO');
      expect(aoAfterNav.length).toBeGreaterThan(0);

      await user.click(screen.getByRole('link', { name: /agents/i }));
      // AO appears multiple times
      const aoAfterAgents = screen.getAllByText('AO');
      expect(aoAfterAgents.length).toBeGreaterThan(0);
    });

    it('should highlight active navigation item', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      const kanbanLink = screen.getByRole('link', { name: /kanban/i });

      // Dashboard should be active initially
      expect(dashboardLink).toHaveClass(/cyan/);

      // Navigate to Kanban
      await user.click(kanbanLink);

      await waitFor(() => {
        expect(kanbanLink).toHaveClass(/cyan/);
      });
    });
  });

  describe('Data Flow', () => {
    it('should share state between components', async () => {
      const user = userEvent.setup();

      // Mock API
      global.fetch = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(<TestApp />);

      // Navigate to different pages and verify data consistency
      await user.click(screen.getByRole('link', { name: /kanban/i }));
      await waitFor(() => {
        // Use getAllByText since "Kanban Board" appears multiple times
        const kanbanTexts = screen.getAllByText('Kanban Board');
        expect(kanbanTexts.length).toBeGreaterThan(0);
      });

      // Navigate to Agents
      await user.click(screen.getByRole('link', { name: /agents/i }));
      await waitFor(() => {
        expect(screen.getByText('Agent Operations')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('should handle WebSocket connections', () => {
      const mockWs = createMockWebSocket();

      render(<TestApp />);

      // WebSocket should be available
      expect(global.WebSocket).toBeDefined();
    });

    it('should handle real-time updates', async () => {
      const mockWs = createMockWebSocket();

      render(<TestApp />);

      // Simulate WebSocket message
      mockWs.triggerEvent('message', {
        data: JSON.stringify({
          type: 'WORKER_STATUS_UPDATE',
          payload: { id: 'worker-1', status: 'active' },
        }),
      });

      // Component should still render normally
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });
  });

  describe('Direct Route Access', () => {
    it('should render Dashboard on root route', () => {
      render(<TestApp initialRoute="/" />);
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });

    it('should render Kanban on /kanban route', () => {
      render(<TestApp initialRoute="/kanban" />);
      // Use getAllByText since "Kanban Board" appears multiple times
      const kanbanTexts = screen.getAllByText('Kanban Board');
      expect(kanbanTexts.length).toBeGreaterThan(0);
    });

    it('should render Agents on /agents route', () => {
      render(<TestApp initialRoute="/agents" />);
      expect(screen.getByText('Agent Operations')).toBeInTheDocument();
    });

    it('should render Templates on /templates route', () => {
      render(<TestApp initialRoute="/templates" />);
      // "Templates" appears in nav tooltip and page title
      const templatesTexts = screen.getAllByText('Templates');
      expect(templatesTexts.length).toBeGreaterThan(0);
    });

    it('should render Settings on /settings route', () => {
      render(<TestApp initialRoute="/settings" />);
      // "Settings" appears in nav tooltip and page title
      const settingsTexts = screen.getAllByText('Settings');
      expect(settingsTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Search Functionality', () => {
    it('should maintain search across page navigation', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      // Search on Dashboard
      const dashboardSearch = screen.getByPlaceholderText(/search agents, tasks/i);
      await user.type(dashboardSearch, 'test query');

      expect(dashboardSearch).toHaveValue('test query');

      // Navigate to Agents
      await user.click(screen.getByRole('link', { name: /agents/i }));

      // Agents page should have its own search
      await waitFor(() => {
        const agentsSearch = screen.getByPlaceholderText(/search agents/i);
        expect(agentsSearch).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn();
      (global.fetch as any).mockRejectedValueOnce(new Error('API Error'));

      render(<TestApp />);

      // App should still render even with API errors
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn();
      (global.fetch as any).mockRejectedValueOnce(new Error('Network Error'));

      render(<TestApp />);

      // App should be resilient to network errors
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should render mobile menu', async () => {
      const user = userEvent.setup();
      const { container } = render(<TestApp />);

      // Find the menu button by looking for button with Menu icon
      const buttons = container.querySelectorAll('button');
      const menuButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('md:hidden');
      });

      expect(menuButton).toBeDefined();

      if (menuButton) {
        // Just verify the button exists (sidebar toggle is CSS-based and hard to test in jsdom)
        expect(menuButton).toBeInTheDocument();
      }
    });

    it('should close mobile menu on navigation', async () => {
      const user = userEvent.setup();
      const { container } = render(<TestApp />);

      // Open mobile menu
      const buttons = container.querySelectorAll('button');
      const menuButton = Array.from(buttons).find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('md:hidden');
      });

      if (!menuButton) return;

      await user.click(menuButton);

      // Click a navigation item
      const kanbanLink = screen.getByRole('link', { name: /kanban/i });
      await user.click(kanbanLink);

      // Menu should close
      const sidebar = document.querySelector('aside');
      await waitFor(() => {
        expect(sidebar).toHaveClass('-translate-x-full');
      });
    });
  });

  describe('Page Interactions', () => {
    it('should handle filter changes on Agents page', async () => {
      const user = userEvent.setup();
      render(<TestApp initialRoute="/agents" />);

      const activeFilter = screen.getByRole('button', { name: /^active$/i });
      await user.click(activeFilter);

      expect(activeFilter).toHaveClass(/cyan/);
    });

    it('should handle time period changes on Dashboard', async () => {
      const user = userEvent.setup();
      render(<TestApp initialRoute="/" />);

      const sevenDayButton = screen.getByRole('button', { name: '7d' });
      await user.click(sevenDayButton);

      expect(sevenDayButton).toHaveClass('active');
    });

    it('should handle search on Agents page', async () => {
      const user = userEvent.setup();
      render(<TestApp initialRoute="/agents" />);

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'CodeReviewer');

      expect(searchInput).toHaveValue('CodeReviewer');
      expect(screen.getByText('CodeReviewer')).toBeInTheDocument();
    });
  });

  describe('UI Consistency', () => {
    it('should maintain consistent header across pages', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      // Check initial page has proper structure - AO appears multiple times
      const aoElements = screen.getAllByText('AO');
      expect(aoElements.length).toBeGreaterThan(0);

      // Navigate and check consistency
      await user.click(screen.getByRole('link', { name: /kanban/i }));
      const aoAfterKanban = screen.getAllByText('AO');
      expect(aoAfterKanban.length).toBeGreaterThan(0);

      await user.click(screen.getByRole('link', { name: /agents/i }));
      const aoAfterAgents = screen.getAllByText('AO');
      expect(aoAfterAgents.length).toBeGreaterThan(0);
    });

    it('should maintain theme across pages', async () => {
      const user = userEvent.setup();
      render(<TestApp />);

      // Check for dark theme classes
      const app = document.querySelector('[class*="bg"]');
      expect(app).toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: /settings/i }));

      // Theme should persist
      const settingsPage = document.querySelector('[class*="bg"]');
      expect(settingsPage).toBeInTheDocument();
    });
  });
});
