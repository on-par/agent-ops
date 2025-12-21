# Frontend Tests

Comprehensive test suite for the Agent Ops platform frontend built with Vitest and React Testing Library.

## Test Structure

```
frontend/src/__tests__/
├── setup.ts                    # Test configuration and global mocks
├── stores/                     # Zustand store tests
│   ├── workItemStore.test.ts
│   ├── workerStore.test.ts
│   └── uiStore.test.ts
├── hooks/                      # React Query hook tests
│   ├── useWorkItems.test.ts
│   └── useWorkers.test.ts
├── components/                 # Component tests
│   ├── Layout.test.tsx
│   ├── Dashboard.test.tsx
│   ├── Kanban.test.tsx
│   └── Agents.test.tsx
└── integration/                # Integration tests
    └── app.test.tsx
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm test -- --watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- src/__tests__/stores/workItemStore.test.ts
```

### Run tests matching a pattern
```bash
npm test -- --grep "workItemStore"
```

## Test Categories

### 1. Store Tests (`stores/`)

Tests for Zustand stores covering:
- Initial state
- State mutations (add, update, delete)
- Derived state and selectors
- Error handling

**Example:**
```typescript
describe('workItemStore', () => {
  it('should add a new work item', () => {
    const { result } = renderHook(() => useWorkItemStore());
    act(() => {
      result.current.addItem({
        title: 'Test Task',
        status: 'PENDING',
        priority: 'high',
      });
    });
    expect(result.current.items).toHaveLength(1);
  });
});
```

### 2. Hook Tests (`hooks/`)

Tests for React Query hooks covering:
- Data fetching
- Mutations (create, update, delete)
- Error handling
- Cache invalidation
- Loading states

**Example:**
```typescript
describe('useWorkItems', () => {
  it('should fetch all work items', async () => {
    const { result } = renderHook(() => useWorkItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockWorkItems);
  });
});
```

### 3. Component Tests (`components/`)

Tests for React components covering:
- Rendering
- User interactions
- State changes
- Navigation
- Conditional rendering
- Accessibility

**Example:**
```typescript
describe('Dashboard', () => {
  it('should display all stat cards', () => {
    render(<Dashboard />);

    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('Tasks Completed')).toBeInTheDocument();
  });
});
```

### 4. Integration Tests (`integration/`)

End-to-end tests covering:
- Page navigation
- Data flow between components
- WebSocket integration
- Error handling
- Responsive behavior

**Example:**
```typescript
describe('App Integration', () => {
  it('should navigate between all pages', async () => {
    render(<TestApp />);

    await user.click(screen.getByRole('link', { name: /kanban/i }));
    expect(screen.getByText('Kanban Board')).toBeInTheDocument();
  });
});
```

## Test Setup

The `setup.ts` file includes:

### Global Mocks
- **WebSocket**: Mock WebSocket for real-time features
- **IntersectionObserver**: Mock for lazy loading
- **ResizeObserver**: Mock for responsive components
- **matchMedia**: Mock for media queries

### Test Utilities
- Mock API responses
- Mock WebSocket factory
- React Query test client setup

## Writing New Tests

### 1. Store Test Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useYourStore } from '../../stores/yourStore';

describe('yourStore', () => {
  beforeEach(() => {
    // Reset store state
  });

  it('should test functionality', () => {
    const { result } = renderHook(() => useYourStore());
    act(() => {
      result.current.someAction();
    });
    expect(result.current.someState).toBe(expectedValue);
  });
});
```

### 2. Hook Test Template

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useYourHook', () => {
  it('should fetch data', async () => {
    const { result } = renderHook(() => useYourHook(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
```

### 3. Component Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from '../../components/YourComponent';

describe('YourComponent', () => {
  it('should render correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    render(<YourComponent />);

    await user.click(screen.getByRole('button', { name: /click me/i }));
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

## Best Practices

### 1. Test Organization
- Group related tests in `describe` blocks
- Use clear, descriptive test names
- Follow AAA pattern: Arrange, Act, Assert

### 2. Assertions
- Use semantic queries (`getByRole`, `getByLabelText`)
- Prefer `screen` over destructuring
- Use `waitFor` for async operations

### 3. User Interactions
- Use `@testing-library/user-event` for realistic interactions
- Always `await` user events
- Test accessibility (ARIA roles, labels)

### 4. Mocking
- Mock external dependencies
- Keep mocks close to tests
- Reset mocks between tests

### 5. Coverage
- Aim for >80% coverage
- Focus on critical paths
- Don't test implementation details

## Common Patterns

### Testing Async Operations

```typescript
it('should handle async operation', async () => {
  render(<Component />);

  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### Testing User Events

```typescript
it('should handle user input', async () => {
  const user = userEvent.setup();
  render(<Component />);

  await user.type(screen.getByRole('textbox'), 'test input');
  expect(screen.getByRole('textbox')).toHaveValue('test input');
});
```

### Testing Navigation

```typescript
it('should navigate to page', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('link', { name: /page name/i }));

  await waitFor(() => {
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });
});
```

## Debugging Tests

### View DOM state
```typescript
import { screen } from '@testing-library/react';

// Print current DOM
screen.debug();

// Print specific element
screen.debug(screen.getByRole('button'));
```

### Interactive debugging
```bash
# Run tests with debugger
npm test -- --inspect-brk
```

### View test coverage
```bash
npm run test:coverage
# Open coverage/index.html in browser
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test -- --run

- name: Upload coverage
  run: npm run test:coverage
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library User Events](https://testing-library.com/docs/user-event/intro)
- [Query Priority](https://testing-library.com/docs/queries/about/#priority)
