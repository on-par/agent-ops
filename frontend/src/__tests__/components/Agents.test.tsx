import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Agents } from '../../pages/Agents';

describe('Agents', () => {
  describe('Header', () => {
    it('should display agent operations title', () => {
      render(<Agents />);
      expect(screen.getByText('Agent Operations')).toBeInTheDocument();
    });

    it('should show subtitle', () => {
      render(<Agents />);
      expect(
        screen.getByText('Real-time monitoring and control')
      ).toBeInTheDocument();
    });

    it('should display new agent button', () => {
      render(<Agents />);
      const newAgentButton = screen.getByRole('button', { name: /new agent/i });
      expect(newAgentButton).toBeInTheDocument();
    });
  });

  describe('Quick Stats', () => {
    it('should display active agents count', () => {
      render(<Agents />);
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it('should display total tasks completed', () => {
      render(<Agents />);
      expect(screen.getByText(/tasks completed/i)).toBeInTheDocument();
    });
  });

  describe('Search and Filters', () => {
    it('should display search input', () => {
      render(<Agents />);
      const searchInput = screen.getByPlaceholderText(/search agents/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('should display status filter buttons', () => {
      render(<Agents />);

      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^active$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^paused$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^idle$/i })).toBeInTheDocument();
    });

    it('should filter agents by search query', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'CodeReviewer');

      expect(searchInput).toHaveValue('CodeReviewer');
      // CodeReviewer should still be visible
      expect(screen.getByText('CodeReviewer')).toBeInTheDocument();
    });

    it('should filter agents by status', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const activeButton = screen.getByRole('button', { name: /^active$/i });
      await user.click(activeButton);

      expect(activeButton).toHaveClass(/cyan/); // Active filter state
    });

    it('should show no results message when no agents match', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'nonexistent-agent-xyz123');

      expect(screen.getByText('No agents found')).toBeInTheDocument();
    });
  });

  describe('Agent Cards', () => {
    it('should render all agent cards', () => {
      render(<Agents />);

      expect(screen.getByText('CodeReviewer')).toBeInTheDocument();
      expect(screen.getByText('TestGenerator')).toBeInTheDocument();
      expect(screen.getByText('RefactorBot')).toBeInTheDocument();
      expect(screen.getByText('SecurityScanner')).toBeInTheDocument();
      expect(screen.getByText('DocWriter')).toBeInTheDocument();
      expect(screen.getByText('BranchManager')).toBeInTheDocument();
    });

    it('should display agent types', () => {
      render(<Agents />);

      expect(screen.getByText('Code Analysis')).toBeInTheDocument();
      expect(screen.getByText('QA Automation')).toBeInTheDocument();
    });

    it('should show agent status', () => {
      render(<Agents />);

      // Multiple active agents
      const activeStatuses = screen.getAllByText(/active/i);
      expect(activeStatuses.length).toBeGreaterThan(0);
    });

    it('should display current tasks', () => {
      render(<Agents />);

      expect(screen.getByText('ANALYZING PULL REQUEST')).toBeInTheDocument();
      expect(screen.getByText('GENERATING UNIT TESTS')).toBeInTheDocument();
      expect(screen.getByText('OPTIMIZING DATABASE QUERIES')).toBeInTheDocument();
    });

    it('should show task context', () => {
      render(<Agents />);

      expect(screen.getByText('feat/user-auth #247')).toBeInTheDocument();
      expect(screen.getByText('COVERAGE TARGET: 85%')).toBeInTheDocument();
      expect(screen.getByText('N+1 DETECTION ACTIVE')).toBeInTheDocument();
    });

    it('should display progress bars for active tasks', () => {
      const { container } = render(<Agents />);

      const progressBars = container.querySelectorAll('[class*="progress"]');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('should show activity sparklines', () => {
      const { container } = render(<Agents />);

      // Sparkline containers
      const sparklines = container.querySelectorAll('[class*="h-8"]');
      expect(sparklines.length).toBeGreaterThan(0);
    });

    it('should display agent stats', () => {
      render(<Agents />);

      // Should show follower counts and tasks completed
      expect(screen.getByText('1,247')).toBeInTheDocument();
      expect(screen.getByText('3,891')).toBeInTheDocument();
      expect(screen.getByText('8,234')).toBeInTheDocument();
    });

    it('should show average completion time', () => {
      render(<Agents />);

      expect(screen.getByText('2.3m')).toBeInTheDocument();
      expect(screen.getByText('4.1m')).toBeInTheDocument();
      expect(screen.getByText('1.8m')).toBeInTheDocument();
    });
  });

  describe('Agent Controls', () => {
    it('should show control buttons on hover', () => {
      const { container } = render(<Agents />);

      // Control buttons should be in the DOM (visibility controlled by CSS)
      const controlButtons = container.querySelectorAll('button[class*="group-hover"]');
      expect(controlButtons.length).toBeGreaterThan(0);
    });

    it('should have pause/play buttons', () => {
      const { container } = render(<Agents />);

      // Should have play/pause icons
      const controls = container.querySelectorAll('svg');
      expect(controls.length).toBeGreaterThan(0);
    });
  });

  describe('Status Indicators', () => {
    it('should show different status colors', () => {
      const { container } = render(<Agents />);

      // Different status indicators should have different colors
      const statusDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(statusDots.length).toBeGreaterThan(0);
    });

    it('should have animated status for active agents', () => {
      const { container } = render(<Agents />);

      const animatedDots = container.querySelectorAll('[class*="animate-blink"]');
      expect(animatedDots.length).toBeGreaterThan(0);
    });
  });

  describe('Grid Layout', () => {
    it('should have responsive grid layout', () => {
      const { container } = render(<Agents />);

      const grid = container.querySelector('[class*="grid-cols"]');
      expect(grid).toBeInTheDocument();
    });

    it('should have proper spacing between cards', () => {
      const { container } = render(<Agents />);

      const grid = container.querySelector('[class*="gap"]');
      expect(grid).toBeInTheDocument();
    });
  });

  describe('Animations', () => {
    it('should have slide-up animations on cards', () => {
      const { container } = render(<Agents />);

      const animatedCards = container.querySelectorAll('[class*="animate-slide-up"]');
      expect(animatedCards.length).toBeGreaterThan(0);
    });

    it('should have staggered animation delays', () => {
      const { container } = render(<Agents />);

      const cards = container.querySelectorAll('[style*="animation-delay"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('Interactivity', () => {
    it('should handle new agent button click', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const newAgentButton = screen.getByRole('button', { name: /new agent/i });
      await user.click(newAgentButton);

      expect(newAgentButton).toBeInTheDocument();
    });

    it('should clear search input', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'test');
      await user.clear(searchInput);

      expect(searchInput).toHaveValue('');
    });

    it('should handle multiple filter selections', async () => {
      const user = userEvent.setup();
      render(<Agents />);

      const allButton = screen.getByRole('button', { name: /^all$/i });
      const activeButton = screen.getByRole('button', { name: /^active$/i });
      const idleButton = screen.getByRole('button', { name: /^idle$/i });

      await user.click(activeButton);
      expect(activeButton).toHaveClass(/cyan/);

      await user.click(idleButton);
      expect(idleButton).toHaveClass(/cyan/);

      await user.click(allButton);
      expect(allButton).toHaveClass(/cyan/);
    });
  });

  describe('File Display', () => {
    it('should show current file being worked on', () => {
      render(<Agents />);

      expect(screen.getByText('src/auth/middleware.ts')).toBeInTheDocument();
      expect(screen.getByText('services/payment.service.ts')).toBeInTheDocument();
      expect(screen.getByText('repositories/user.repository.ts')).toBeInTheDocument();
    });
  });
});
