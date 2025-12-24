import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../db/index.js";
import {
  templates,
  type Template,
  type NewTemplate,
  type AgentRole,
} from "../../../db/schema.js";

/**
 * Repository for Template entity operations.
 * Handles all database interactions for agent templates including
 * system-defined and user-created templates.
 */
export class TemplateRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  /**
   * Create a new template.
   *
   * @param template - The template data to insert
   * @returns The created template
   * @throws Error if template creation fails
   */
  async create(template: NewTemplate): Promise<Template> {
    const result = await this.db.insert(templates).values(template).returning();

    if (!result[0]) {
      throw new Error("Failed to create template");
    }

    return result[0];
  }

  /**
   * Find a template by its ID.
   *
   * @param id - The template ID
   * @returns The template if found, null otherwise
   */
  async findById(id: string): Promise<Template | null> {
    const result = await this.db
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find all templates.
   *
   * @returns Array of all templates
   */
  async findAll(): Promise<Template[]> {
    return await this.db.select().from(templates);
  }

  /**
   * Find templates by their default role.
   *
   * @param role - The agent role to filter by
   * @returns Array of templates with the specified default role
   */
  async findByRole(role: AgentRole): Promise<Template[]> {
    return await this.db
      .select()
      .from(templates)
      .where(eq(templates.defaultRole, role));
  }

  /**
   * Find all built-in (system) templates.
   * System templates are identified by createdBy = "system".
   *
   * @returns Array of system templates
   */
  async findBuiltIn(): Promise<Template[]> {
    return await this.db
      .select()
      .from(templates)
      .where(eq(templates.createdBy, "system"));
  }

  /**
   * Update a template by ID.
   * Updates the updatedAt timestamp automatically.
   * Does not allow updating id or createdBy fields.
   *
   * @param id - The template ID
   * @param updates - Partial template data to update
   * @returns The updated template
   * @throws Error if template not found
   */
  async update(
    id: string,
    updates: Partial<Omit<Template, "id" | "createdBy" | "createdAt">>
  ): Promise<Template> {
    // First verify the template exists
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Template not found");
    }

    // Ensure updatedAt is set to current time
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Remove id and createdBy if somehow included (TypeScript should prevent this)
    delete (updateData as any).id;
    delete (updateData as any).createdBy;
    delete (updateData as any).createdAt;

    const result = await this.db
      .update(templates)
      .set(updateData)
      .where(eq(templates.id, id))
      .returning();

    if (!result[0]) {
      throw new Error("Failed to update template");
    }

    return result[0];
  }

  /**
   * Delete a template by ID.
   * Only allows deletion of user-created templates.
   * System templates (createdBy = "system") cannot be deleted.
   *
   * @param id - The template ID
   * @throws Error if template not found or is a system template
   */
  async delete(id: string): Promise<void> {
    // First verify the template exists
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Template not found");
    }

    // Prevent deletion of system templates
    if (existing.createdBy === "system") {
      throw new Error("Cannot delete system template");
    }

    await this.db.delete(templates).where(eq(templates.id, id));
  }
}
