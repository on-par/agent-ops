import { TemplateRepository } from "../repositories/template.repository.js";
import type { Template, AgentRole, WorkItemType } from "../db/schema.js";
import type {
  CreateAgentTemplate,
  UpdateAgentTemplate,
} from "../models/template.js";
import { CreateAgentTemplateSchema } from "../models/template.js";
import { randomUUID } from "crypto";

/**
 * Template Registry Service
 * Manages agent templates including built-in system templates and user-defined templates.
 * Provides validation, lookup, and lifecycle management for templates.
 */
export class TemplateRegistryService {
  constructor(private readonly repository: TemplateRepository) {}

  /**
   * Register a new template
   * Validates the template configuration and ensures unique naming
   *
   * @param template - Template creation data
   * @returns The created template
   * @throws Error if validation fails or name is not unique
   */
  async register(template: CreateAgentTemplate): Promise<Template> {
    // Validate template structure
    const validationResult = CreateAgentTemplateSchema.safeParse(template);
    if (!validationResult.success) {
      throw new Error(
        `Template validation failed: ${validationResult.error.message}`
      );
    }

    // Additional business logic validation
    await this.validate(template);

    // Check for name uniqueness
    const allTemplates = await this.repository.findAll();
    const nameExists = allTemplates.some(
      (t) => t.name.toLowerCase() === template.name.toLowerCase()
    );

    if (nameExists) {
      throw new Error(
        `Template with name '${template.name}' already exists. Please choose a unique name.`
      );
    }

    // Create template with generated ID and timestamps
    const now = new Date();
    const newTemplate = {
      id: randomUUID(),
      ...template,
      createdAt: now,
      updatedAt: now,
    };

    return await this.repository.create(newTemplate);
  }

  /**
   * Unregister (delete) a user-defined template
   * Prevents deletion of system templates
   *
   * @param templateId - Template ID to delete
   * @throws Error if template is a system template or not found
   */
  async unregister(templateId: string): Promise<void> {
    const template = await this.repository.findById(templateId);
    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`);
    }

    if (template.createdBy === "system") {
      throw new Error(
        "Cannot delete system template. System templates are read-only."
      );
    }

    await this.repository.delete(templateId);
  }

  /**
   * Get a template by ID
   *
   * @param templateId - Template ID
   * @returns The template if found, null otherwise
   */
  async getById(templateId: string): Promise<Template | null> {
    return await this.repository.findById(templateId);
  }

  /**
   * Get all templates (system and user-defined)
   *
   * @returns Array of all templates
   */
  async getAll(): Promise<Template[]> {
    return await this.repository.findAll();
  }

  /**
   * Get only built-in system templates
   *
   * @returns Array of system templates
   */
  async getBuiltIn(): Promise<Template[]> {
    return await this.repository.findBuiltIn();
  }

  /**
   * Get templates created by a specific user
   *
   * @param userId - User ID
   * @returns Array of templates created by the user
   */
  async getUserDefined(userId: string): Promise<Template[]> {
    const allTemplates = await this.repository.findAll();
    return allTemplates.filter(
      (t) => t.createdBy !== "system" && t.createdBy === userId
    );
  }

  /**
   * Find templates suitable for a specific agent role
   *
   * @param role - Agent role
   * @returns Array of templates with matching default role
   */
  async findByRole(role: AgentRole): Promise<Template[]> {
    return await this.repository.findByRole(role);
  }

  /**
   * Find templates that can handle a specific work item type
   * Returns templates where allowedWorkItemTypes includes "*" or the specific type
   *
   * @param type - Work item type
   * @returns Array of compatible templates
   */
  async findForWorkItemType(type: WorkItemType): Promise<Template[]> {
    const allTemplates = await this.repository.findAll();
    return allTemplates.filter(
      (t) =>
        t.allowedWorkItemTypes.includes("*") ||
        t.allowedWorkItemTypes.includes(type)
    );
  }

  /**
   * Update an existing template
   * Prevents updating immutable fields (id, createdBy, createdAt)
   *
   * @param templateId - Template ID
   * @param updates - Partial template updates
   * @returns The updated template
   * @throws Error if template not found or validation fails
   */
  async update(
    templateId: string,
    updates: UpdateAgentTemplate
  ): Promise<Template> {
    const existing = await this.repository.findById(templateId);
    if (!existing) {
      throw new Error(`Template with ID ${templateId} not found`);
    }

    // If name is being changed, check for uniqueness
    if (updates.name && updates.name !== existing.name) {
      const allTemplates = await this.repository.findAll();
      const nameExists = allTemplates.some(
        (t) =>
          t.id !== templateId &&
          t.name.toLowerCase() === updates.name!.toLowerCase()
      );

      if (nameExists) {
        throw new Error(
          `Template with name '${updates.name}' already exists. Please choose a unique name.`
        );
      }
    }

    // Validate the merged template
    if (updates.systemPrompt !== undefined || updates.name !== undefined) {
      const mergedTemplate: CreateAgentTemplate = {
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        createdBy: existing.createdBy,
        systemPrompt: updates.systemPrompt ?? existing.systemPrompt,
        permissionMode: updates.permissionMode ?? existing.permissionMode,
        maxTurns: updates.maxTurns ?? existing.maxTurns,
        builtinTools: updates.builtinTools ?? existing.builtinTools,
        mcpServers: updates.mcpServers ?? existing.mcpServers,
        allowedWorkItemTypes:
          updates.allowedWorkItemTypes ?? existing.allowedWorkItemTypes,
        defaultRole: updates.defaultRole ?? existing.defaultRole,
      };

      await this.validate(mergedTemplate);
    }

    return await this.repository.update(templateId, updates);
  }

  /**
   * Validate a template configuration
   * Checks business logic rules beyond schema validation
   *
   * @param template - Template to validate
   * @throws Error if validation fails
   */
  async validate(template: CreateAgentTemplate): Promise<void> {
    // Name validation
    if (template.name.trim().length === 0) {
      throw new Error("Template name cannot be empty");
    }

    if (template.name.length > 100) {
      throw new Error("Template name cannot exceed 100 characters");
    }

    // System prompt validation
    if (template.systemPrompt.trim().length === 0) {
      throw new Error("System prompt cannot be empty");
    }

    if (template.systemPrompt.length < 20) {
      throw new Error("System prompt must be at least 20 characters");
    }

    // Max turns validation (use default if not provided)
    const maxTurns = template.maxTurns ?? 100;
    if (maxTurns < 1) {
      throw new Error("Max turns must be at least 1");
    }

    if (maxTurns > 1000) {
      throw new Error("Max turns cannot exceed 1000");
    }

    // Work item types validation (use default if not provided)
    const allowedWorkItemTypes = template.allowedWorkItemTypes ?? ["*"];
    if (allowedWorkItemTypes.length === 0) {
      throw new Error(
        "At least one allowed work item type must be specified (use ['*'] for all)"
      );
    }

    // MCP servers validation (use default if not provided)
    const mcpServers = template.mcpServers ?? [];
    for (const server of mcpServers) {
      if (!server.name || server.name.trim().length === 0) {
        throw new Error("MCP server name cannot be empty");
      }

      if (server.type === "stdio" && !server.command) {
        throw new Error(
          `MCP server '${server.name}' with type 'stdio' must have a command`
        );
      }

      if (server.type === "sse" && !server.url) {
        throw new Error(
          `MCP server '${server.name}' with type 'sse' must have a URL`
        );
      }
    }

    // Check for duplicate MCP server names
    if (mcpServers.length > 0) {
      const serverNames = mcpServers.map((s) => s.name.toLowerCase());
      const uniqueNames = new Set(serverNames);
      if (serverNames.length !== uniqueNames.size) {
        throw new Error("MCP server names must be unique within a template");
      }
    }
  }

  /**
   * Clone an existing template with a new name and creator
   * Useful for users to customize system templates or duplicate their own
   *
   * @param templateId - Template ID to clone
   * @param newName - Name for the cloned template
   * @param createdBy - User ID who is creating the clone
   * @returns The newly created template
   * @throws Error if source template not found or name is not unique
   */
  async clone(
    templateId: string,
    newName: string,
    createdBy: string
  ): Promise<Template> {
    const source = await this.repository.findById(templateId);
    if (!source) {
      throw new Error(`Source template with ID ${templateId} not found`);
    }

    // Create new template from source
    const clonedTemplate: CreateAgentTemplate = {
      name: newName,
      description: `${source.description} (cloned)`,
      createdBy,
      systemPrompt: source.systemPrompt,
      permissionMode: source.permissionMode,
      maxTurns: source.maxTurns,
      builtinTools: [...source.builtinTools],
      mcpServers: source.mcpServers.map((s) => ({ ...s })),
      allowedWorkItemTypes: [...source.allowedWorkItemTypes],
      defaultRole: source.defaultRole,
    };

    return await this.register(clonedTemplate);
  }

  /**
   * Initialize built-in system templates if they don't already exist
   * This should be called during application startup
   *
   * @returns Number of templates initialized
   */
  async initializeBuiltIns(): Promise<number> {
    const existingBuiltIns = await this.repository.findBuiltIn();
    const existingNames = new Set(existingBuiltIns.map((t) => t.name));

    const builtInTemplates = this.getBuiltInTemplateDefinitions();
    let initialized = 0;

    for (const template of builtInTemplates) {
      if (!existingNames.has(template.name)) {
        await this.register(template);
        initialized++;
      }
    }

    return initialized;
  }

  /**
   * Get built-in template definitions
   * These are the default system templates provided by the platform
   *
   * @private
   * @returns Array of built-in template definitions
   */
  private getBuiltInTemplateDefinitions(): CreateAgentTemplate[] {
    return [
      // Refiner Agent - For backlog refinement
      {
        name: "Refiner Agent",
        description:
          "Specialized in backlog refinement, breaking down epics into actionable work items with clear acceptance criteria",
        createdBy: "system",
        systemPrompt: `You are a Refiner Agent specialized in backlog refinement and work item breakdown.

Your responsibilities:
- Analyze high-level requirements and epics
- Break down large work items into smaller, actionable tasks
- Define clear acceptance criteria and success metrics
- Identify dependencies and potential blockers
- Clarify ambiguities by asking the right questions
- Ensure work items are properly sized and ready for implementation

Best practices:
- Keep work items focused on a single responsibility
- Write clear, testable acceptance criteria
- Consider both functional and non-functional requirements
- Flag technical debt and quality concerns
- Suggest appropriate work item types (feature, bug, task, research)

Always maintain a user-centric perspective and ensure work items deliver clear value.`,
        permissionMode: "askUser",
        maxTurns: 50,
        builtinTools: ["read", "write", "edit", "bash"],
        mcpServers: [],
        allowedWorkItemTypes: ["*"],
        defaultRole: "refiner",
      },

      // Implementer Agent - For code implementation
      {
        name: "Implementer Agent",
        description:
          "Specialized in code implementation, following best practices and design patterns",
        createdBy: "system",
        systemPrompt: `You are an Implementer Agent specialized in writing production-quality code.

Your responsibilities:
- Implement features according to specifications
- Write clean, maintainable, and well-documented code
- Follow project conventions and best practices
- Handle edge cases and error scenarios
- Write unit tests alongside implementation
- Ensure code is performant and scalable

Best practices:
- Follow SOLID principles and design patterns
- Write self-documenting code with clear naming
- Add comments for complex business logic
- Use dependency injection for testability
- Consider security implications (input validation, SQL injection, XSS)
- Optimize database queries and API calls

Technical skills:
- Backend: Express, FastAPI, Django, Flask, Spring Boot, NestJS
- Databases: PostgreSQL, MySQL, MongoDB, Redis
- Testing: Jest, Pytest, JUnit, Vitest
- Version control: Git best practices

Always prioritize code quality, maintainability, and security over quick fixes.`,
        permissionMode: "acceptEdits",
        maxTurns: 100,
        builtinTools: ["read", "write", "edit", "bash", "glob", "grep"],
        mcpServers: [],
        allowedWorkItemTypes: ["feature", "bug", "task"],
        defaultRole: "implementer",
      },

      // Tester Agent - For writing and running tests
      {
        name: "Tester Agent",
        description:
          "Specialized in test creation, test automation, and quality assurance",
        createdBy: "system",
        systemPrompt: `You are a Tester Agent specialized in quality assurance and test automation.

Your responsibilities:
- Write comprehensive unit, integration, and e2e tests
- Identify edge cases and test scenarios
- Ensure test coverage meets quality standards
- Create test data and fixtures
- Run tests and analyze results
- Report bugs with clear reproduction steps

Testing approach:
- Test happy paths and edge cases
- Test error handling and validation
- Test authentication and authorization
- Test boundary conditions and limits
- Use mocking and stubbing appropriately
- Follow the AAA pattern (Arrange, Act, Assert)

Test types:
- Unit tests: Test individual functions and methods in isolation
- Integration tests: Test component interactions and API endpoints
- End-to-end tests: Test complete user workflows
- Performance tests: Test response times and scalability

Best practices:
- Write clear, descriptive test names
- Keep tests independent and isolated
- Use appropriate assertions
- Clean up test data after each test
- Maintain test code quality like production code

Always aim for high test coverage while ensuring tests are meaningful and maintainable.`,
        permissionMode: "askUser",
        maxTurns: 75,
        builtinTools: ["read", "write", "edit", "bash", "glob", "grep"],
        mcpServers: [],
        allowedWorkItemTypes: ["*"],
        defaultRole: "tester",
      },

      // Reviewer Agent - For code review
      {
        name: "Reviewer Agent",
        description:
          "Specialized in code review, identifying issues, and ensuring code quality",
        createdBy: "system",
        systemPrompt: `You are a Reviewer Agent specialized in code review and quality assurance.

Your responsibilities:
- Review code for correctness, quality, and maintainability
- Identify bugs, security vulnerabilities, and performance issues
- Ensure code follows project conventions and best practices
- Verify tests are comprehensive and meaningful
- Check for proper error handling and edge cases
- Ensure documentation is clear and complete

Review checklist:
- Code correctness: Does it work as intended?
- Code quality: Is it clean, readable, and maintainable?
- Security: Are there any vulnerabilities (SQL injection, XSS, CSRF)?
- Performance: Are there any bottlenecks or inefficiencies?
- Testing: Is test coverage adequate and meaningful?
- Error handling: Are errors handled gracefully?
- Documentation: Are complex parts well-documented?
- Design: Does it follow SOLID principles and patterns?

Feedback style:
- Be constructive and specific
- Explain the "why" behind suggestions
- Provide examples of better approaches
- Acknowledge good practices
- Differentiate between critical issues and nice-to-haves

Security focus areas:
- Input validation and sanitization
- SQL injection prevention
- XSS and CSRF protection
- Authentication and authorization
- Sensitive data handling
- Rate limiting and DoS prevention

Always prioritize actionable feedback that helps improve code quality and team knowledge.`,
        permissionMode: "askUser",
        maxTurns: 60,
        builtinTools: ["read", "bash", "glob", "grep"],
        mcpServers: [],
        allowedWorkItemTypes: ["*"],
        defaultRole: "reviewer",
      },
    ];
  }
}
