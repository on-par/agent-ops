# Phase 5.2: Agent Runtime API Routes - Integration Guide

## Overview
Phase 5.2 implements HTTP endpoints for agent execution management. The routes expose APIs for starting executions, getting status, cancelling, and managing workspaces.

## Files Created

### Routes Implementation
- **Location**: `backend/src/routes/agent-runtime.routes.ts`
- **Exports**: `agentRuntimeRoutes` - Fastify plugin
- **Dependencies**:
  - AgentExecutionRepository
  - WorkspaceRepository
  - WorkerRepository
  - WorkItemRepository

### Tests
- **Location**: `backend/src/routes/agent-runtime.routes.test.ts`
- **Test Coverage**: 18 tests covering all endpoints
- **Status**: All tests passing ✅

## API Endpoints

### 1. POST /api/agent-runtime/execute
Start a new agent execution.

**Request Body**:
```json
{
  "workerId": "string",
  "workItemId": "string",
  "prompt": "string"
}
```

**Response (201)**:
```json
{
  "executionId": "uuid"
}
```

**Error Responses**:
- `400` - Validation failed (missing or invalid fields)
- `404` - Worker or WorkItem not found

### 2. GET /api/agent-runtime/executions/:id
Get execution details.

**Response (200)**:
```json
{
  "id": "uuid",
  "workerId": "string",
  "workItemId": "string",
  "templateId": "string",
  "status": "pending|running|success|error|cancelled",
  "errorMessage": "string|null",
  "output": {
    "summary": "string",
    "filesChanged": ["string"],
    "testsRun": boolean,
    "testsPassed": boolean,
    "logs": ["string"],
    "diff": "string"
  },
  "durationMs": number,
  "tokensUsed": number,
  "costUsd": number,
  "toolCallsCount": number,
  "createdAt": timestamp,
  "startedAt": timestamp,
  "completedAt": timestamp
}
```

**Error Responses**:
- `404` - Execution not found

### 3. POST /api/agent-runtime/executions/:id/cancel
Cancel a running or pending execution.

**Response (200)**:
Returns the updated execution with `status: "cancelled"` and `completedAt` timestamp.

**Error Responses**:
- `404` - Execution not found
- `409` - Execution not in cancellable state (already completed, cancelled, or errored)

### 4. GET /api/agent-runtime/workspaces
List all active workspaces.

**Response (200)**:
```json
[
  {
    "id": "uuid",
    "workerId": "string|null",
    "workItemId": "string|null",
    "repositoryId": "string|null",
    "path": "string",
    "branchName": "string|null",
    "status": "active",
    "createdAt": timestamp,
    "completedAt": timestamp,
    "cleanupAt": timestamp
  }
]
```

### 5. DELETE /api/agent-runtime/workspaces/:id
Cleanup a workspace.

**Response (200)**:
```json
{
  "message": "Workspace {id} deleted successfully"
}
```

**Error Responses**:
- `404` - Workspace not found

## Phase 5.3: Integration Steps

To integrate these routes into the application, add the following to `backend/src/app.ts`:

### 1. Import the routes
```typescript
import { agentRuntimeRoutes } from "./routes/agent-runtime.routes.js";
```

### 2. Register the routes
Add this inside the `if (db)` block (after line 48):

```typescript
// Agent Runtime routes
await app.register(agentRuntimeRoutes, {
  prefix: "/api/agent-runtime",
  db,
  config,
});
```

### Complete Integration Example
```typescript
// Inside buildApp function, after line 75:
if (db) {
  // ... existing routes ...

  // Agent Runtime routes
  await app.register(agentRuntimeRoutes, {
    prefix: "/api/agent-runtime",
    db,
    config,
  });
}
```

## Testing

Run the tests to verify implementation:
```bash
npm test -- src/routes/agent-runtime.routes.test.ts
```

Expected output:
```
✓ src/routes/agent-runtime.routes.test.ts (18 tests) 55ms
  Test Files  1 passed (1)
  Tests  18 passed (18)
```

## Test Coverage

### POST /execute
- ✅ Creates execution and returns 201 with executionId
- ✅ Returns 400 for missing workerId
- ✅ Returns 400 for missing workItemId
- ✅ Returns 400 for missing prompt
- ✅ Returns 404 for non-existent worker
- ✅ Returns 404 for non-existent work item

### GET /executions/:id
- ✅ Returns 200 with execution details
- ✅ Returns 404 for non-existent execution

### POST /executions/:id/cancel
- ✅ Cancels running execution and returns 200
- ✅ Cancels pending execution and returns 200
- ✅ Returns 404 for non-existent execution
- ✅ Returns 409 for completed execution
- ✅ Returns 409 for cancelled execution
- ✅ Returns 409 for error execution

### GET /workspaces
- ✅ Returns 200 with array of active workspaces
- ✅ Returns empty array when no active workspaces exist

### DELETE /workspaces/:id
- ✅ Deletes workspace and returns 200
- ✅ Returns 404 for non-existent workspace

## Error Handling

The routes implement comprehensive error handling following the pattern from `work-items.routes.ts`:

- **400 Bad Request**: Validation errors (ZodError)
- **404 Not Found**: Resource not found
- **409 Conflict**: Invalid state transition (e.g., cancelling non-running execution)
- **500 Internal Server Error**: Unhandled errors (rethrown)

## Dependencies

The implementation relies on existing repositories:
- `AgentExecutionRepository` - For execution CRUD operations
- `WorkspaceRepository` - For workspace management
- `WorkerRepository` - For worker validation and lookup
- `WorkItemRepository` - For work item validation

All repositories are already implemented and tested.

## Next Steps

1. Integrate routes into `app.ts` (Phase 5.3)
2. Test integration with full application
3. Implement agent execution service layer (future phase)
4. Connect routes to actual agent runtime (future phase)

## Status

✅ Phase 5.2 Complete
- Routes implemented
- Tests written and passing
- Documentation complete
- Ready for integration
