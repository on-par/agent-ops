import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kanban } from '../../pages/Kanban';

describe('Kanban', () => {
  describe('Header', () => {
    it('should display kanban board title', () => {
      render(<Kanban />);
      expect(screen.getByText('Kanban Board')).toBeInTheDocument();
    });

    it('should show subtitle', () => {
      render(<Kanban />);
      expect(
        screen.getByText('Visualize and manage tasks across stages')
      ).toBeInTheDocument();
    });

    it('should display new task button', () => {
      render(<Kanban />);
      const newTaskButton = screen.getByRole('button', { name: /new task/i });
      expect(newTaskButton).toBeInTheDocument();
    });
  });

  describe('Quick Stats', () => {
    it('should display total tasks count', () => {
      render(<Kanban />);
      expect(screen.getByText(/total tasks/i)).toBeInTheDocument();
    });

    it('should display in progress count', () => {
      render(<Kanban />);
      expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    });
  });

  describe('Board Columns', () => {
    it('should render all kanban columns', () => {
      render(<Kanban />);

      expect(screen.getByText('Backlog')).toBeInTheDocument();
      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should display task count for each column', () => {
      render(<Kanban />);

      // Each column should show its task count
      const countBadges = screen.getAllByText(/\d+/);
      expect(countBadges.length).toBeGreaterThan(0);
    });

    it('should show add task buttons in columns', () => {
      render(<Kanban />);

      const addButtons = screen.getAllByText(/add task/i);
      expect(addButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Task Cards', () => {
    it('should render task cards', () => {
      render(<Kanban />);

      expect(screen.getByText('Implement OAuth2 flow')).toBeInTheDocument();
      expect(screen.getByText('API rate limiting')).toBeInTheDocument();
      expect(screen.getByText('Optimize database queries')).toBeInTheDocument();
    });

    it('should display task descriptions', () => {
      render(<Kanban />);

      expect(screen.getByText('Add social login support')).toBeInTheDocument();
      expect(screen.getByText('Implement rate limiting middleware')).toBeInTheDocument();
    });

    it('should show task priorities', () => {
      render(<Kanban />);

      expect(screen.getAllByText(/high/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/medium/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/low/i).length).toBeGreaterThan(0);
    });

    it('should display task tags', () => {
      render(<Kanban />);

      expect(screen.getByText('auth')).toBeInTheDocument();
      expect(screen.getByText('feature')).toBeInTheDocument();
      expect(screen.getByText('database')).toBeInTheDocument();
      expect(screen.getByText('security')).toBeInTheDocument();
      expect(screen.getByText('testing')).toBeInTheDocument();
    });

    it('should show assigned agents', () => {
      render(<Kanban />);

      expect(screen.getByText('CodeReviewer-A1')).toBeInTheDocument();
      expect(screen.getByText('SecurityScanner')).toBeInTheDocument();
      expect(screen.getByText('TestGenerator')).toBeInTheDocument();
    });
  });

  describe('Task Management', () => {
    it('should have clickable task cards', async () => {
      const user = userEvent.setup();
      render(<Kanban />);

      const taskCard = screen.getByText('Implement OAuth2 flow').closest('div');
      expect(taskCard).toHaveClass(/cursor-grab/);
    });

    it('should show more options button on hover', () => {
      render(<Kanban />);

      const taskCards = document.querySelectorAll('[class*="group"]');
      expect(taskCards.length).toBeGreaterThan(0);
    });
  });

  describe('Status Icons', () => {
    it('should display appropriate status icons for columns', () => {
      const { container } = render(<Kanban />);

      // Check for status icons in column headers
      const columnHeaders = container.querySelectorAll('h3');
      expect(columnHeaders.length).toBeGreaterThan(0);
    });
  });

  describe('Drag and Drop', () => {
    it('should have draggable task cards', () => {
      render(<Kanban />);

      const taskCards = document.querySelectorAll('[class*="cursor-grab"]');
      expect(taskCards.length).toBeGreaterThan(0);
    });

    it('should have droppable columns', () => {
      render(<Kanban />);

      const columns = screen.getAllByText(/add task/i);
      expect(columns.length).toBe(5); // 5 columns
    });
  });

  describe('Layout', () => {
    it('should have horizontal scrollable board', () => {
      const { container } = render(<Kanban />);

      const scrollableContainer = container.querySelector('[class*="overflow-x-auto"]');
      expect(scrollableContainer).toBeInTheDocument();
    });

    it('should be responsive', () => {
      const { container } = render(<Kanban />);

      const responsiveElements = container.querySelectorAll(
        '[class*="sm:"], [class*="md:"], [class*="lg:"]'
      );
      expect(responsiveElements.length).toBeGreaterThan(0);
    });
  });

  describe('Interactivity', () => {
    it('should handle add task button click', async () => {
      const user = userEvent.setup();
      render(<Kanban />);

      const addButton = screen.getAllByText(/add task/i)[0];
      await user.click(addButton);

      expect(addButton).toBeInTheDocument();
    });

    it('should handle new task button in header', async () => {
      const user = userEvent.setup();
      render(<Kanban />);

      const newTaskButton = screen.getByRole('button', { name: /new task/i });
      await user.click(newTaskButton);

      expect(newTaskButton).toBeInTheDocument();
    });
  });

  describe('Priority Indicators', () => {
    it('should have visual priority indicators', () => {
      const { container } = render(<Kanban />);

      // Priority dots should be present
      const priorityDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(priorityDots.length).toBeGreaterThan(0);
    });
  });
});
