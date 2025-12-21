# Worker Repository - Example Usage

This document demonstrates how to use the WorkerRepository class.

## Setup

```typescript
import { createDatabase } from "../db/index.js";
import { WorkerRepository } from "./worker.repository.js";

// Initialize database connection
const { db } = createDatabase({ url: "sqlite://./agent-ops.db" });

// Create repository instance
const workerRepo = new WorkerRepository(db);
```

## Creating a Worker

```typescript
import { v4 as uuidv4 } from "uuid";

const newWorker = await workerRepo.create({
  id: uuidv4(),
  templateId: "template-123",
  status: "idle",
  sessionId: uuidv4(),
  spawnedAt: new Date(),
});

console.log("Created worker:", newWorker.id);
```

## Finding Workers

### By ID
```typescript
const worker = await workerRepo.findById("worker-123");
if (worker) {
  console.log("Found worker:", worker);
} else {
  console.log("Worker not found");
}
```

### All Workers
```typescript
const allWorkers = await workerRepo.findAll();
console.log(`Total workers: ${allWorkers.length}`);
```

### By Status
```typescript
const idleWorkers = await workerRepo.findByStatus("idle");
console.log(`Idle workers: ${idleWorkers.length}`);

const workingWorkers = await workerRepo.findByStatus("working");
console.log(`Working workers: ${workingWorkers.length}`);
```

### By Template
```typescript
const workers = await workerRepo.findByTemplate("template-123");
console.log(`Workers using template-123: ${workers.length}`);
```

### Active Workers Only
```typescript
// Returns workers with status "idle" or "working"
const activeWorkers = await workerRepo.findActive();
console.log(`Active workers: ${activeWorkers.length}`);
```

## Updating Workers

### General Update
```typescript
const updated = await workerRepo.update("worker-123", {
  status: "working",
  currentRole: "implementer",
  currentWorkItemId: "work-item-456",
});

console.log("Updated worker status:", updated.status);
```

### Update Metrics
```typescript
// Metrics are INCREMENTED, not replaced
const worker = await workerRepo.updateMetrics("worker-123", {
  tokensUsed: 1000,    // Adds 1000 to current tokensUsed
  costUsd: 0.05,       // Adds 0.05 to current costUsd
  toolCalls: 3,        // Adds 3 to current toolCalls
});

console.log("New metrics:", {
  tokens: worker.tokensUsed,
  cost: worker.costUsd,
  tools: worker.toolCalls,
});
```

## Deleting Workers

```typescript
await workerRepo.delete("worker-123");
console.log("Worker deleted");
```

## Error Handling

All methods throw descriptive errors when operations fail:

```typescript
try {
  await workerRepo.update("non-existent-id", { status: "working" });
} catch (error) {
  console.error(error.message); // "Worker with id non-existent-id not found"
}

try {
  await workerRepo.delete("non-existent-id");
} catch (error) {
  console.error(error.message); // "Worker with id non-existent-id not found"
}
```

## Complete Example

```typescript
import { createDatabase } from "../db/index.js";
import { WorkerRepository } from "./worker.repository.js";
import { v4 as uuidv4 } from "uuid";

async function main() {
  // Setup
  const { db } = createDatabase({ url: "sqlite://./agent-ops.db" });
  const workerRepo = new WorkerRepository(db);

  // Create a worker
  const worker = await workerRepo.create({
    id: uuidv4(),
    templateId: "template-123",
    status: "idle",
    sessionId: uuidv4(),
    spawnedAt: new Date(),
  });

  // Start working
  await workerRepo.update(worker.id, {
    status: "working",
    currentRole: "implementer",
  });

  // Track usage
  await workerRepo.updateMetrics(worker.id, {
    tokensUsed: 1500,
    costUsd: 0.075,
    toolCalls: 5,
  });

  // Get active workers
  const activeWorkers = await workerRepo.findActive();
  console.log(`Active workers: ${activeWorkers.length}`);

  // Complete work and terminate
  await workerRepo.update(worker.id, {
    status: "terminated",
    currentWorkItemId: null,
  });

  // Clean up
  await workerRepo.delete(worker.id);
}

main().catch(console.error);
```

## Type Safety

The repository leverages TypeScript for full type safety:

```typescript
import type { Worker, NewWorker, WorkerStatus } from "../db/schema.js";

// NewWorker type for creation (id, templateId, sessionId, spawnedAt required)
const newWorker: NewWorker = {
  id: uuidv4(),
  templateId: "template-123",
  status: "idle",
  sessionId: uuidv4(),
  spawnedAt: new Date(),
};

// Worker type for query results (includes all fields with defaults)
const worker: Worker | null = await workerRepo.findById("worker-123");

// WorkerStatus type for status queries
const status: WorkerStatus = "working";
const workers = await workerRepo.findByStatus(status);
```
