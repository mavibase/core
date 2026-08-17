export const version = "0.1.0";

/**
 * Base type for all application definitions.
 *
 * This is intentionally loose for now. Specific model, field, and relationship
 * definitions will narrow this type in later phases.
 */
export type ApplicationDefinition = Record<string, unknown>;

/**
 * Define an application.
 *
 * This is the entry point for describing an application structure.
 * The implementation will be built out in later phases.
 */
export function defineApp(definition: ApplicationDefinition): ApplicationDefinition {
  return definition;
}
