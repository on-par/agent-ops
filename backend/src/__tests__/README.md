# Backend Test Suite

Comprehensive test suite for the Agent Ops backend, covering database operations, schema validation, API routes, and integration workflows.

## Overview

- **Total Tests**: 193
- **Test Framework**: Vitest
- **Database**: In-memory SQLite
- **ORM**: Drizzle ORM
- **Test Files**: 6

## Test Structure

```
backend/src/__tests__/
├── setup.ts                 # Test utilities, fixtures, and database setup
├── schema.test.ts           # Zod validation schema tests (48 tests)
├── work-items.test.ts       # Work Items CRUD and workflow tests (41 tests)
├── templates.test.ts        # Templates CRUD and JSON field tests (44 tests)
├── workers.test.ts          # Workers lifecycle and metrics tests (44 tests)
└── integration.test.ts      # End-to-end workflow tests (16 tests)
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- schema.test.ts

# Run tests matching a pattern
npm test -- --grep "CRUD"
```

## Test Files

### 1. setup.ts - Test Utilities

Provides shared test infrastructure:

- **Test Database**: Creates in-memory SQLite database for each test
- **Fixtures**: Factory functions for creating test data
- **Helpers**: Utility functions for common test operations

**Key Functions**:
- `setupTestDatabase()` - Sets up fresh database for each test
- `getTestDatabase()` - Returns current test database instance
- `clearTestDatabase()` - Clears all data between tests
- `seedDatabase()` - Seeds database with sample data
- `testFixtures` - Factory functions for creating test entities

**Example Usage**:
```typescript
import { setupTestDatabase, getTestDatabase, testFixtures } from './setup';

setupTestDatabase(); // Call in describe block

it('should create work item', async () => {
  const db = getTestDatabase();
  const workItem = testFixtures.workItem({ title: 'Test' });
  await db.insert(schema.workItems).values(workItem);
});
```

### 2. schema.test.ts - Validation Tests (48 tests)

Tests Zod validation schemas for API request/response validation.

**Coverage**:
- Work Item schemas (create, update)
- Template schemas (create, update)
- Worker schemas (create, update)
- Trace schemas (create)
- Type coercion and error handling

**Test Categories**:
- ✅ Valid input validation
- ✅ Default value application
- ✅ Field constraints (length, range, format)
- ✅ Enum validation
- ✅ UUID validation
- ✅ JSON field validation
- ✅ Type coercion behavior

**Example Test**:
```typescript
it('should validate a valid work item', () => {
  const validWorkItem = {
    title: 'Implement authentication',
    type: 'feature',
    createdBy: 'user-123',
  };

  const result = createWorkItemSchema.parse(validWorkItem);
  expect(result.successCriteria).toEqual([]);
});
```

### 3. work-items.test.ts - Work Items Tests (41 tests)

Tests database operations for work items including CRUD, status workflows, and filtering.

**Test Categories**:
- **CREATE** (6 tests): Creating work items with various configurations
- **READ** (12 tests): Querying, filtering, sorting, pagination
- **UPDATE** (9 tests): Updating fields, status transitions, timestamps
- **DELETE** (3 tests): Deleting work items
- **Status Workflow** (5 tests): Status transition validation
- **Complex Queries** (4 tests): Advanced filtering and aggregation
- **Error Cases** (3 tests): Error handling

**Status Workflow**:
```
backlog → ready → in_progress → review → done
           ↑          ↓           ↓
           └──────────┴───────────┘
```

**Example Test**:
```typescript
it('should update work item status', async () => {
  const db = getTestDatabase();
  const workItem = testFixtures.workItem({ status: 'backlog' });
  await db.insert(schema.workItems).values(workItem);

  await db
    .update(schema.workItems)
    .set({ status: 'in_progress', startedAt: new Date() })
    .where(eq(schema.workItems.id, workItem.id));

  const [updated] = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, workItem.id));

  expect(updated.status).toBe('in_progress');
  expect(updated.startedAt).toBeTruthy();
});
```

### 4. templates.test.ts - Templates Tests (44 tests)

Tests database operations for agent templates, focusing on JSON field handling and configuration.

**Test Categories**:
- **CREATE** (10 tests): Creating templates with various configurations
- **READ** (8 tests): Querying and filtering templates
- **UPDATE** (12 tests): Updating template fields including arrays
- **DELETE** (4 tests): Deleting templates and foreign key constraints
- **JSON Field Handling** (5 tests): Complex JSON serialization/deserialization
- **Complex Queries** (3 tests): Advanced filtering and aggregation
- **Error Cases** (3 tests): Error handling

**JSON Fields Tested**:
- `builtinTools` - Array of strings
- `mcpServers` - Array of complex objects with nested configs
- `allowedWorkItemTypes` - Array of work item type strings

**Example Test**:
```typescript
it('should update MCP servers', async () => {
  const db = getTestDatabase();
  const template = testFixtures.template({
    mcpServers: [{ name: 'server-1', type: 'stdio', args: [], env: {} }]
  });
  await db.insert(schema.templates).values(template);

  const newServers = [
    { name: 'server-2', type: 'stdio', args: [], env: {} },
    { name: 'server-3', type: 'sse', url: 'https://api.example.com', args: [], env: {} }
  ];

  await db
    .update(schema.templates)
    .set({ mcpServers: newServers })
    .where(eq(schema.templates.id, template.id));

  const [updated] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, template.id));

  expect(updated.mcpServers).toHaveLength(2);
});
```

### 5. workers.test.ts - Workers Tests (44 tests)

Tests database operations for worker agents, including spawning, status management, and metrics tracking.

**Test Categories**:
- **CREATE (Spawn)** (6 tests): Spawning workers from templates
- **READ** (8 tests): Querying workers with joins
- **UPDATE** (8 tests): Updating worker status and metrics
- **DELETE (Terminate)** (4 tests): Terminating workers
- **Status Transitions** (6 tests): Worker lifecycle management
- **Metrics** (4 tests): Token usage, cost tracking, context window
- **Complex Queries** (3 tests): Finding available workers, aggregations
- **Error Cases** (3 tests): Error handling

**Worker Lifecycle**:
```
idle → working → idle
  ↓      ↓        ↓
  ↓    paused   error
  ↓      ↓        ↓
  └→ terminated ←┘
```

**Metrics Tracked**:
- Token usage
- Cost (USD)
- Context window usage
- Tool calls
- Errors

**Example Test**:
```typescript
it('should update worker metrics', async () => {
  const db = getTestDatabase();
  const template = testFixtures.template({ id: 'template-1' });
  await db.insert(schema.templates).values(template);

  const worker = testFixtures.worker('template-1');
  await db.insert(schema.workers).values(worker);

  await db
    .update(schema.workers)
    .set({
      contextWindowUsed: 50000,
      tokensUsed: 10000,
      costUsd: 0.05,
      toolCalls: 25,
    })
    .where(eq(schema.workers.id, worker.id));

  const [updated] = await db
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.id, worker.id));

  expect(updated.tokensUsed).toBe(10000);
  expect(updated.costUsd).toBe(0.05);
});
```

### 6. integration.test.ts - Integration Tests (16 tests)

Tests end-to-end workflows and multi-entity interactions.

**Test Categories**:
- **Full Workflow** (3 tests): Template → Worker → Work Item lifecycle
- **Multi-Agent Workflow** (3 tests): Multiple agents collaborating
- **Concurrent Operations** (4 tests): Race conditions and concurrent updates
- **Observability & Traces** (3 tests): Event tracking and analytics
- **Data Integrity** (3 tests): Foreign key constraints and relationships

**Example Workflow Test**:
```typescript
it('should complete full workflow from template creation to work completion', async () => {
  const db = getTestDatabase();

  // 1. Create template
  const template = testFixtures.template({ id: 'implementer-template' });
  await db.insert(schema.templates).values(template);

  // 2. Create work item
  const workItem = testFixtures.workItem({ id: 'feature-1', status: 'ready' });
  await db.insert(schema.workItems).values(workItem);

  // 3. Spawn worker
  const worker = testFixtures.worker('implementer-template', { id: 'worker-1' });
  await db.insert(schema.workers).values(worker);

  // 4. Assign work
  await db.update(schema.workers)
    .set({ status: 'working', currentWorkItemId: 'feature-1' })
    .where(eq(schema.workers.id, 'worker-1'));

  await db.update(schema.workItems)
    .set({ status: 'in_progress', assignedAgents: { implementer: 'worker-1' } })
    .where(eq(schema.workItems.id, 'feature-1'));

  // 5. Update metrics
  await db.update(schema.workers)
    .set({ tokensUsed: 5000, costUsd: 0.025 })
    .where(eq(schema.workers.id, 'worker-1'));

  // 6. Complete work
  await db.update(schema.workItems)
    .set({ status: 'done', completedAt: new Date() })
    .where(eq(schema.workItems.id, 'feature-1'));

  await db.update(schema.workers)
    .set({ status: 'idle', currentWorkItemId: null })
    .where(eq(schema.workers.id, 'worker-1'));

  // Verify final state
  const [completedItem] = await db.select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, 'feature-1'));

  expect(completedItem.status).toBe('done');
  expect(completedItem.completedAt).toBeTruthy();
});
```

## Test Fixtures

The test suite uses factory functions to create test data:

```typescript
// Work Item
const workItem = testFixtures.workItem({
  title: 'Custom title',
  type: 'feature',
  status: 'backlog',
});

// Template
const template = testFixtures.template({
  name: 'Implementer',
  systemPrompt: 'You are an implementer...',
  builtinTools: ['read', 'write', 'bash'],
});

// Worker
const worker = testFixtures.worker('template-id', {
  status: 'idle',
  contextWindowLimit: 100000,
});

// Trace
const trace = testFixtures.trace({
  workerId: 'worker-1',
  workItemId: 'work-1',
  eventType: 'tool_call',
  data: { tool: 'bash', command: 'ls' },
});

// Success Criterion
const criterion = testFixtures.successCriterion({
  description: 'Tests pass',
  completed: false,
});

// MCP Server
const mcpServer = testFixtures.mcpServer({
  name: 'filesystem',
  type: 'stdio',
  command: 'node',
  args: ['server.js'],
});
```

## Test Patterns

### 1. Database Setup

Each test file uses the `setupTestDatabase()` helper:

```typescript
import { setupTestDatabase, getTestDatabase } from './setup';

setupTestDatabase(); // Sets up fresh DB before each test

describe('My Tests', () => {
  it('should work', async () => {
    const db = getTestDatabase();
    // Use db...
  });
});
```

### 2. Testing CRUD Operations

```typescript
// CREATE
const [created] = await db.insert(schema.workItems)
  .values(workItem)
  .returning();
expect(created.id).toBe(workItem.id);

// READ
const [found] = await db.select()
  .from(schema.workItems)
  .where(eq(schema.workItems.id, workItem.id));
expect(found).toBeDefined();

// UPDATE
const [updated] = await db.update(schema.workItems)
  .set({ title: 'New title' })
  .where(eq(schema.workItems.id, workItem.id))
  .returning();
expect(updated.title).toBe('New title');

// DELETE
const [deleted] = await db.delete(schema.workItems)
  .where(eq(schema.workItems.id, workItem.id))
  .returning();
expect(deleted.id).toBe(workItem.id);
```

### 3. Testing Relationships

```typescript
// Join workers with templates
const results = await db.select({
  worker: schema.workers,
  template: schema.templates,
})
.from(schema.workers)
.leftJoin(
  schema.templates,
  eq(schema.workers.templateId, schema.templates.id)
);

expect(results[0].template?.id).toBe('template-1');
```

### 4. Testing Concurrent Operations

```typescript
// Simulate concurrent updates
await Promise.all([
  db.update(schema.workers).set({ status: 'working' }),
  db.update(schema.workers).set({ tokensUsed: 1000 }),
]);
```

## Coverage Goals

- ✅ All CRUD operations
- ✅ Status workflow transitions
- ✅ Data validation (Zod schemas)
- ✅ JSON field serialization
- ✅ Foreign key constraints
- ✅ Query filtering and pagination
- ✅ Aggregation and analytics
- ✅ Error handling
- ✅ Concurrent operations
- ✅ End-to-end workflows

## Future Enhancements

### Potential Additions

1. **API Route Tests**: Test Fastify route handlers
2. **WebSocket Tests**: Test real-time updates
3. **Performance Tests**: Test query performance with large datasets
4. **Migration Tests**: Test database migration scripts
5. **Authentication Tests**: Test API security
6. **Rate Limiting Tests**: Test API throttling

### WebSocket Testing Example

```typescript
// Future: Test WebSocket broadcasts
it('should broadcast work item updates via WebSocket', async () => {
  const app = getTestApp();
  const ws = await app.inject({
    method: 'GET',
    url: '/ws',
  });

  // Update work item
  await db.update(schema.workItems)
    .set({ status: 'done' })
    .where(eq(schema.workItems.id, 'work-1'));

  // Verify WebSocket message
  expect(ws.payload).toContain('work_item_update');
});
```

## Best Practices

1. **Isolation**: Each test starts with a fresh database
2. **Clarity**: Descriptive test names that explain what is being tested
3. **Assertions**: Clear expectations with specific assertions
4. **Coverage**: Test both happy paths and error cases
5. **Performance**: Tests complete in ~370ms total
6. **Fixtures**: Reusable factory functions for consistent test data
7. **Documentation**: Tests serve as living documentation

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "Database not initialized"
**Solution**: Ensure `setupTestDatabase()` is called in the describe block

**Issue**: Foreign key constraint errors
**Solution**: Ensure parent entities are created before children

**Issue**: Timing issues in concurrent tests
**Solution**: Use proper async/await and ensure operations complete

**Issue**: JSON field serialization errors
**Solution**: Ensure JSON fields match the expected schema structure

## Contributing

When adding new tests:

1. Follow existing patterns and structure
2. Use test fixtures for creating test data
3. Add descriptive test names
4. Test both success and error cases
5. Keep tests focused and isolated
6. Update this README if adding new test categories

## License

Part of the Agent Ops platform
