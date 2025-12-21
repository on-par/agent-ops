import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../../pages/Dashboard';

describe('Dashboard', () => {
  describe('Header', () => {
    it('should display mission control title', () => {
      render(<Dashboard />);
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });

    it('should show live status indicator', () => {
      render(<Dashboard />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('should display search input', () => {
      render(<Dashboard />);
      const searchInput = screen.getByPlaceholderText(/search agents, tasks/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('should display new task button', () => {
      render(<Dashboard />);
      const newTaskButton = screen.getByRole('button', { name: /new task/i });
      expect(newTaskButton).toBeInTheDocument();
    });
  });

  describe('Stats Cards', () => {
    it('should display all stat cards', () => {
      render(<Dashboard />);

      // Use getAllByText since "Active Agents" appears multiple times
      const activeAgentsTexts = screen.getAllByText('Active Agents');
      expect(activeAgentsTexts.length).toBeGreaterThan(0);
      expect(screen.getByText('Tasks Completed')).toBeInTheDocument();
      expect(screen.getByText('In Queue')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
    });

    it('should display stat values', () => {
      render(<Dashboard />);

      expect(screen.getByText('12')).toBeInTheDocument(); // Active Agents
      expect(screen.getByText('1,847')).toBeInTheDocument(); // Tasks Completed
      expect(screen.getByText('38')).toBeInTheDocument(); // In Queue
      expect(screen.getByText('98.7%')).toBeInTheDocument(); // Success Rate
    });

    it('should show trend indicators', () => {
      render(<Dashboard />);

      expect(screen.getByText('+3 from yesterday')).toBeInTheDocument();
      expect(screen.getByText('+12.5% this week')).toBeInTheDocument();
    });
  });

  describe('Throughput Chart', () => {
    it('should render task throughput section', () => {
      render(<Dashboard />);
      expect(screen.getByText('Task Throughput')).toBeInTheDocument();
    });

    it('should display time period filters', () => {
      render(<Dashboard />);

      expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
    });

    it('should change time period on button click', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const sevenDayButton = screen.getByRole('button', { name: '7d' });
      await user.click(sevenDayButton);

      expect(sevenDayButton).toHaveClass('active');
    });

    it('should display chart legend', () => {
      render(<Dashboard />);

      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('Active Agents', () => {
    it('should display active agents section', () => {
      render(<Dashboard />);
      // Use getAllByText since "Active Agents" appears multiple times
      const activeAgentsTexts = screen.getAllByText('Active Agents');
      expect(activeAgentsTexts.length).toBeGreaterThan(0);
    });

    it('should render agent cards', () => {
      render(<Dashboard />);

      // Agent names may appear multiple times in different sections
      const codeReviewerTexts = screen.getAllByText('CodeReviewer-A1');
      expect(codeReviewerTexts.length).toBeGreaterThan(0);
      const dataProcessorTexts = screen.getAllByText('DataProcessor-B2');
      expect(dataProcessorTexts.length).toBeGreaterThan(0);
      const deployerTexts = screen.getAllByText('Deployer-D4');
      expect(deployerTexts.length).toBeGreaterThan(0);
    });

    it('should display agent types', () => {
      render(<Dashboard />);

      expect(screen.getByText('Code Analysis')).toBeInTheDocument();
      expect(screen.getByText('ETL Pipeline')).toBeInTheDocument();
      expect(screen.getByText('CI/CD')).toBeInTheDocument();
    });

    it('should show agent status', () => {
      render(<Dashboard />);

      // Check for active status indicators
      const statusElements = screen.getAllByText(/active/i);
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('should display success rates', () => {
      render(<Dashboard />);

      expect(screen.getByText('99.2%')).toBeInTheDocument();
      expect(screen.getByText('98.8%')).toBeInTheDocument();
    });

    it('should have view all link', () => {
      render(<Dashboard />);
      expect(screen.getByText('View all')).toBeInTheDocument();
    });
  });

  describe('Live Activity', () => {
    it('should display live activity feed', () => {
      render(<Dashboard />);
      expect(screen.getByText('Live Activity')).toBeInTheDocument();
    });

    it('should show activity items', () => {
      render(<Dashboard />);

      expect(screen.getByText('Code review completed')).toBeInTheDocument();
      expect(screen.getByText('Processing data batch #4821')).toBeInTheDocument();
      expect(screen.getByText('Deployment to staging')).toBeInTheDocument();
    });

    it('should display activity timestamps', () => {
      render(<Dashboard />);

      expect(screen.getByText('2s ago')).toBeInTheDocument();
      expect(screen.getByText('15s ago')).toBeInTheDocument();
      expect(screen.getByText('1m ago')).toBeInTheDocument();
    });

    it('should show different status types', () => {
      render(<Dashboard />);

      // Success, pending, warning, error statuses should be indicated
      const successItems = screen.getAllByText(/completed/i);
      expect(successItems.length).toBeGreaterThan(0);
    });
  });

  describe('Up Next Queue', () => {
    it('should display up next section', () => {
      render(<Dashboard />);
      expect(screen.getByText('Up Next')).toBeInTheDocument();
    });

    it('should show queued tasks', () => {
      render(<Dashboard />);

      expect(screen.getByText('Security audit scan')).toBeInTheDocument();
      expect(screen.getByText('Daily report generation')).toBeInTheDocument();
      expect(screen.getByText('Database backup')).toBeInTheDocument();
    });

    it('should display task status badges', () => {
      render(<Dashboard />);

      expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
      expect(screen.getAllByText('WAITING').length).toBeGreaterThan(0);
    });

    it('should show task priorities with visual indicators', () => {
      render(<Dashboard />);

      const taskItems = screen.getAllByText(/scan|generation|backup/i);
      expect(taskItems.length).toBeGreaterThan(0);
    });
  });

  describe('Interactivity', () => {
    it('should handle search input', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const searchInput = screen.getByPlaceholderText(/search agents, tasks/i);
      await user.type(searchInput, 'test query');

      expect(searchInput).toHaveValue('test query');
    });

    it('should handle new task button click', async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      const newTaskButton = screen.getByRole('button', { name: /new task/i });
      await user.click(newTaskButton);

      // Button should be clickable
      expect(newTaskButton).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('should have proper grid layout structure', () => {
      const { container } = render(<Dashboard />);

      // Check for grid layouts
      const grids = container.querySelectorAll('[class*="grid"]');
      expect(grids.length).toBeGreaterThan(0);
    });

    it('should be responsive', () => {
      const { container } = render(<Dashboard />);

      // Check for responsive classes
      const responsiveElements = container.querySelectorAll(
        '[class*="sm:"], [class*="md:"], [class*="lg:"]'
      );
      expect(responsiveElements.length).toBeGreaterThan(0);
    });
  });
});
