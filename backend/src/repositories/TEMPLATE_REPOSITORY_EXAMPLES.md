# Template Repository - Example Usage

This document demonstrates how to use the TemplateRepository class for managing agent templates.

## Setup

```typescript
import { createDatabase } from "../db/index.js";
import { TemplateRepository } from "./template.repository.js";

// Initialize database connection
const { db } = createDatabase({ url: "sqlite://./agent-ops.db" });

// Create repository instance
const templateRepo = new TemplateRepository(db);
```

## Creating Templates

### User-Created Template

```typescript
import { v4 as uuidv4 } from "uuid";

const newTemplate = await templateRepo.create({
  id: `tmpl-${uuidv4()}`,
  name: "My Custom Implementer",
  description: "A specialized template for backend implementation",
  createdBy: "user-123",
  systemPrompt: "You are an expert backend developer specializing in Node.js and TypeScript.",
  permissionMode: "askUser",
  maxTurns: 150,
  builtinTools: ["read", "write", "edit", "bash"],
  mcpServers: [],
  allowedWorkItemTypes: ["feature", "bug"],
  defaultRole: "implementer",
  createdAt: new Date(),
  updatedAt: new Date(),
});

console.log("Created template:", newTemplate.id);
```

### System Template

```typescript
const systemTemplate = await templateRepo.create({
  id: "system-refiner-v1",
  name: "System Refiner",
  description: "Built-in template for refining work items",
  createdBy: "system",
  systemPrompt: "You are a work item refiner. Analyze requirements and break them into actionable tasks.",
  permissionMode: "bypassPermissions",
  maxTurns: 50,
  builtinTools: ["read"],
  mcpServers: [],
  allowedWorkItemTypes: ["*"],
  defaultRole: "refiner",
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### Template with MCP Servers

```typescript
const mcpTemplate = await templateRepo.create({
  id: `tmpl-${uuidv4()}`,
  name: "Full-Stack Developer",
  description: "Template with filesystem and database access",
  createdBy: "user-456",
  systemPrompt: "You are a full-stack developer with access to filesystem and database tools.",
  permissionMode: "acceptEdits",
  maxTurns: 200,
  builtinTools: ["read", "write", "bash"],
  mcpServers: [
    {
      name: "filesystem",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: {},
    },
    {
      name: "postgres",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: {
        DATABASE_URL: "postgresql://localhost/mydb",
      },
    },
  ],
  allowedWorkItemTypes: ["feature", "bug", "task"],
  defaultRole: "implementer",
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

## Finding Templates

### By ID

```typescript
const template = await templateRepo.findById("tmpl-123");
if (template) {
  console.log("Found template:", template.name);
  console.log("System prompt:", template.systemPrompt);
} else {
  console.log("Template not found");
}
```

### All Templates

```typescript
const allTemplates = await templateRepo.findAll();
console.log(`Total templates: ${allTemplates.length}`);

allTemplates.forEach((tmpl) => {
  console.log(`- ${tmpl.name} (${tmpl.createdBy === "system" ? "System" : "User"})`);
});
```

### By Role

```typescript
// Find all implementer templates
const implementers = await templateRepo.findByRole("implementer");
console.log(`Implementer templates: ${implementers.length}`);

// Find all refiner templates
const refiners = await templateRepo.findByRole("refiner");
console.log(`Refiner templates: ${refiners.length}`);

// Find all tester templates
const testers = await templateRepo.findByRole("tester");

// Find all reviewer templates
const reviewers = await templateRepo.findByRole("reviewer");
```

### Built-In (System) Templates Only

```typescript
const systemTemplates = await templateRepo.findBuiltIn();
console.log(`System templates: ${systemTemplates.length}`);

systemTemplates.forEach((tmpl) => {
  console.log(`- ${tmpl.name}: ${tmpl.description}`);
});
```

## Updating Templates

### Update Basic Fields

```typescript
const updated = await templateRepo.update("tmpl-123", {
  name: "Updated Name",
  description: "Updated description",
  systemPrompt: "Updated system prompt with new instructions.",
  maxTurns: 200,
});

console.log("Updated template:", updated.name);
console.log("Updated at:", updated.updatedAt);
```

### Update Permission Mode

```typescript
const updated = await templateRepo.update("tmpl-123", {
  permissionMode: "bypassPermissions",
});

console.log("New permission mode:", updated.permissionMode);
```

### Update Built-in Tools

```typescript
const updated = await templateRepo.update("tmpl-123", {
  builtinTools: ["read", "write", "edit", "bash", "grep"],
});

console.log("Updated tools:", updated.builtinTools);
```

### Update Default Role

```typescript
const updated = await templateRepo.update("tmpl-123", {
  defaultRole: "reviewer",
});

console.log("New default role:", updated.defaultRole);
```

### Update MCP Servers

```typescript
const updated = await templateRepo.update("tmpl-123", {
  mcpServers: [
    {
      name: "github",
      type: "sse",
      url: "http://localhost:3000/mcp",
      args: [],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
      },
    },
  ],
});

console.log("MCP servers updated:", updated.mcpServers.length);
```

### Update Allowed Work Item Types

```typescript
const updated = await templateRepo.update("tmpl-123", {
  allowedWorkItemTypes: ["feature", "bug", "task", "research"],
});

console.log("Allowed types:", updated.allowedWorkItemTypes);
```

## Deleting Templates

### Delete User Template

```typescript
// Only user-created templates can be deleted
await templateRepo.delete("tmpl-123");
console.log("Template deleted");
```

### System Template Protection

```typescript
// System templates cannot be deleted
try {
  await templateRepo.delete("system-refiner-v1");
} catch (error) {
  console.error(error.message); // "Cannot delete system template"
}
```

## Error Handling

All methods throw descriptive errors when operations fail:

```typescript
try {
  await templateRepo.findById("non-existent");
  // Returns null, no error
} catch (error) {
  // Will not throw
}

try {
  await templateRepo.update("non-existent", { name: "New Name" });
} catch (error) {
  console.error(error.message); // "Template not found"
}

try {
  await templateRepo.delete("non-existent");
} catch (error) {
  console.error(error.message); // "Template not found"
}

try {
  await templateRepo.delete("system-template-id");
} catch (error) {
  console.error(error.message); // "Cannot delete system template"
}
```

## Complete Example

```typescript
import { createDatabase } from "../db/index.js";
import { TemplateRepository } from "./template.repository.js";
import { v4 as uuidv4 } from "uuid";

async function main() {
  // Setup
  const { db } = createDatabase({ url: "sqlite://./agent-ops.db" });
  const templateRepo = new TemplateRepository(db);

  // Create a custom template
  const templateId = `tmpl-${uuidv4()}`;
  const template = await templateRepo.create({
    id: templateId,
    name: "Backend Specialist",
    description: "Expert in Node.js, TypeScript, and database design",
    createdBy: "user-789",
    systemPrompt: `You are a backend specialist with expertise in:
- Node.js and TypeScript
- RESTful API design
- Database architecture (PostgreSQL, MongoDB)
- Security best practices
- Performance optimization`,
    permissionMode: "askUser",
    maxTurns: 150,
    builtinTools: ["read", "write", "edit", "bash"],
    mcpServers: [],
    allowedWorkItemTypes: ["feature", "bug"],
    defaultRole: "implementer",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`Created template: ${template.name}`);

  // Find all implementer templates
  const implementers = await templateRepo.findByRole("implementer");
  console.log(`Total implementer templates: ${implementers.length}`);

  // Update the template
  const updated = await templateRepo.update(templateId, {
    description: "Enhanced with testing capabilities",
    builtinTools: ["read", "write", "edit", "bash", "grep"],
    maxTurns: 200,
  });

  console.log(`Updated template, new max turns: ${updated.maxTurns}`);

  // List all templates
  const allTemplates = await templateRepo.findAll();
  console.log("\nAll templates:");
  allTemplates.forEach((tmpl) => {
    const type = tmpl.createdBy === "system" ? "System" : "User";
    console.log(`  - [${type}] ${tmpl.name} (${tmpl.defaultRole || "no role"})`);
  });

  // Clean up (only if user-created)
  if (template.createdBy !== "system") {
    await templateRepo.delete(templateId);
    console.log("\nTemplate deleted");
  }
}

main().catch(console.error);
```

## Type Safety

The repository leverages TypeScript for full type safety:

```typescript
import type {
  Template,
  NewTemplate,
  AgentRole,
  PermissionMode,
} from "../db/schema.js";

// NewTemplate type for creation (all required fields)
const newTemplate: NewTemplate = {
  id: "tmpl-123",
  name: "My Template",
  description: "Description",
  createdBy: "user-456",
  systemPrompt: "System prompt",
  permissionMode: "askUser",
  maxTurns: 100,
  builtinTools: [],
  mcpServers: [],
  allowedWorkItemTypes: ["*"],
  defaultRole: "implementer",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Template type for query results
const template: Template | null = await templateRepo.findById("tmpl-123");

// AgentRole type for role queries
const role: AgentRole = "implementer";
const templates = await templateRepo.findByRole(role);

// PermissionMode type for permission settings
const mode: PermissionMode = "askUser";
await templateRepo.update("tmpl-123", { permissionMode: mode });
```

## Best Practices

### 1. Use Descriptive IDs

```typescript
// Good: Descriptive ID
const id = `tmpl-backend-specialist-${uuidv4().slice(0, 8)}`;

// Avoid: Generic IDs without context
const id = uuidv4();
```

### 2. Set Appropriate Permission Modes

```typescript
// For user-facing agents: Ask for permission
permissionMode: "askUser"

// For automated tasks: Accept edits with review
permissionMode: "acceptEdits"

// For trusted system operations only: Bypass permissions
permissionMode: "bypassPermissions"
```

### 3. Configure Tools Based on Role

```typescript
// Refiner: Read-only access
builtinTools: ["read", "grep"]

// Implementer: Full development tools
builtinTools: ["read", "write", "edit", "bash", "grep"]

// Tester: Testing tools
builtinTools: ["read", "bash"]

// Reviewer: Read and comment tools
builtinTools: ["read", "grep"]
```

### 4. Use System Templates for Core Functionality

```typescript
// System templates are protected and cannot be deleted
const systemTemplates = await templateRepo.findBuiltIn();

// Users can extend system templates
const customTemplate = await templateRepo.create({
  ...systemTemplate,
  id: `tmpl-custom-${uuidv4()}`,
  name: `Custom ${systemTemplate.name}`,
  createdBy: "user-123",
  // Add customizations
  builtinTools: [...systemTemplate.builtinTools, "bash"],
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### 5. Handle Updates Gracefully

```typescript
// Always check if template exists before showing UI
const template = await templateRepo.findById(templateId);
if (!template) {
  throw new Error("Template not found");
}

// Prevent accidental overwrites
const updated = await templateRepo.update(templateId, {
  // Only update specific fields
  description: newDescription,
  // Don't pass entire template object
});
```
