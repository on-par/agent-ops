import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Layout } from '../../components/Layout';

// Mock Outlet component
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Page Content</div>,
  };
});

describe('Layout', () => {
  const renderLayout = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Layout />
      </MemoryRouter>
    );
  };

  describe('Sidebar Navigation', () => {
    it('should render navigation items', () => {
      renderLayout();

      // Check for navigation items by their aria-labels or roles
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /kanban/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /agents/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /templates/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    });

    it('should highlight active navigation item', () => {
      renderLayout('/agents');

      const agentsLink = screen.getByRole('link', { name: /agents/i });
      expect(agentsLink).toHaveClass(/cyan/); // Active state has cyan color
    });

    it('should navigate to correct routes', async () => {
      const user = userEvent.setup();
      renderLayout();

      const kanbanLink = screen.getByRole('link', { name: /kanban/i });
      await user.click(kanbanLink);

      await waitFor(() => {
        expect(kanbanLink).toHaveClass(/cyan/);
      });
    });
  });

  describe('Mobile Menu', () => {
    it('should show mobile menu button on mobile', () => {
      renderLayout();

      // Mobile menu button should be present
      const menuButton = screen.getByRole('button', { name: /menu/i });
      expect(menuButton).toBeInTheDocument();
    });

    it('should toggle mobile sidebar', async () => {
      const user = userEvent.setup();
      renderLayout();

      const menuButton = screen.getByRole('button', { name: /menu/i });
      await user.click(menuButton);

      // Check if sidebar is visible
      const sidebar = screen.getByRole('complementary', { name: /navigation/i }) ||
                      document.querySelector('aside');
      expect(sidebar).not.toHaveClass('-translate-x-full');

      // Close button should be visible
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      // Sidebar should be hidden again
      await waitFor(() => {
        expect(sidebar).toHaveClass('-translate-x-full');
      });
    });
  });

  describe('Logo', () => {
    it('should display logo with correct text', () => {
      renderLayout();

      // Check for logo text "AO"
      expect(screen.getByText('AO')).toBeInTheDocument();
    });

    it('should display app name on mobile header', () => {
      renderLayout();

      expect(screen.getByText('Agent Ops')).toBeInTheDocument();
    });
  });

  describe('Content Area', () => {
    it('should render outlet content', () => {
      renderLayout();

      expect(screen.getByTestId('outlet')).toBeInTheDocument();
      expect(screen.getByText('Page Content')).toBeInTheDocument();
    });
  });

  describe('Tooltips', () => {
    it('should show tooltips on navigation hover', async () => {
      const user = userEvent.setup();
      renderLayout();

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });

      await user.hover(dashboardLink);

      // Tooltip should appear (though visibility is controlled by CSS)
      const tooltip = dashboardLink.querySelector('[class*="tooltip"]');
      expect(tooltip).toBeInTheDocument();
    });
  });

  describe('Route Changes', () => {
    it('should close mobile menu on route change', async () => {
      const user = userEvent.setup();
      renderLayout();

      // Open mobile menu
      const menuButton = screen.getByRole('button', { name: /menu/i });
      await user.click(menuButton);

      // Navigate to another page
      const agentsLink = screen.getByRole('link', { name: /agents/i });
      await user.click(agentsLink);

      // Menu should close automatically
      const sidebar = document.querySelector('aside');
      await waitFor(() => {
        expect(sidebar).toHaveClass('-translate-x-full');
      });
    });
  });
});
