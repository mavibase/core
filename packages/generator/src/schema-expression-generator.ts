import type { SchemaExpression } from "@mavibase/core";

export interface SchemaExpressionRenderContext {
  modelNames: ReadonlySet<string>;
  schemaNames: ReadonlySet<string>;
  mode?: SchemaExpressionMode;
  modelReferences?: Set<string>;
  schemaReferences?: Set<string>;
}

export type SchemaExpressionMode = "default" | "input" | "output" | "persistence";

export class SchemaExpressionGenerationError extends Error {
  readonly code = "MAVIBASE_SCHEMA_EXPRESSION_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "SchemaExpressionGenerationError";
  }
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function schemaExportName(name: string): string {
  return `${name}Schema`;
}

function contextualSchemaExportName(name: string, mode: SchemaExpressionMode): string {
  return mode === "default" ? schemaExportName(name) : `${name}${mode[0]!.toUpperCase()}${mode.slice(1)}Schema`;
}

export function renderSchemaExpression(
  expression: SchemaExpression,
  context: SchemaExpressionRenderContext,
  path = "schema",
): string {
  const mode = context.mode ?? "default";
  if (expression.kind === "model") {
    if (!context.modelNames.has(expression.model)) {
      throw new SchemaExpressionGenerationError(
        `Model schema reference "${expression.model}" at "${path}" does not match a generated model.`,
      );
    }
    const name = contextualSchemaExportName(expression.model, mode);
    context.modelReferences?.add(name);
    return `z.lazy(() => ${name})`;
  }
  if (expression.kind === "reference") {
    if (!context.schemaNames.has(expression.schema.name)) {
      throw new SchemaExpressionGenerationError(
        `Schema reference "${expression.schema.name}" at "${path}" does not match the schema registry.`,
      );
    }
    const name = contextualSchemaExportName(expression.schema.name, mode);
    context.schemaReferences?.add(name);
    return `z.lazy(() => ${name})`;
  }
  if (expression.kind === "object") {
    const fields = Object.keys(expression.fields)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (name) =>
          `${propertyName(name)}: ${renderSchemaExpression(expression.fields[name]!, context, `${path}.fields.${name}`)}`,
      );
    return `z.object({ ${fields.join(", ")} })`;
  }
  if (expression.kind === "array") {
    return `z.array(${renderSchemaExpression(expression.item, context, `${path}.item`)})`;
  }
  if (expression.kind === "union") {
    return `z.union([${expression.members
      .map((member, index) => renderSchemaExpression(member, context, `${path}.members[${index}]`))
      .join(", ")}])`;
  }
  if (expression.kind === "intersection") {
    return expression.members
      .map((member, index) => renderSchemaExpression(member, context, `${path}.members[${index}]`))
      .reduce((left, right) => `z.intersection(${left}, ${right})`);
  }
  throw new SchemaExpressionGenerationError(`Unsupported schema expression at "${path}".`);
}

export function legacySchemaExpression(value: unknown): SchemaExpression | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (value.endsWith("Schema") && /^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(value)) {
    return { kind: "model", model: value.slice(0, -"Schema".length) };
  }
  return undefined;
}
