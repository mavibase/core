import type { ApplicationGraph } from "@mavibase/application-graph";
import type { RefinementDefinition, SchemaExpression, StructuredConstraint } from "@mavibase/core";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { FieldContextError } from "./field-context.js";
import {
  ModelContextError,
  normalizeModelContexts,
  type NormalizedModelFieldContext,
  type NormalizedModelRelationshipContext,
} from "./model-context.js";
import { renderSchemaExpression } from "./schema-expression-generator.js";

export interface ZodFieldTemplateData {
  name: string;
  schema: string;
}

export interface ZodModelTemplateData {
  name: string;
  fields: ZodFieldTemplateData[];
  relationships: ZodFieldTemplateData[];
}

export interface ZodSchemaTemplateData {
  name: string;
  schema: string;
}

export interface ZodSchemasTemplateData {
  schemas: ZodSchemaTemplateData[];
  models: ZodModelTemplateData[];
  refinementImports: { importPath: string; exportName: string; localName: string }[];
}

export interface ZodGenerationErrorDetails {
  path: string;
  reason: string;
  recommendation: string;
}

export class ZodGenerationError extends Error {
  readonly code = "MAVIBASE_ZOD_GENERATION_ERROR";
  readonly details: ZodGenerationErrorDetails;

  constructor(details: ZodGenerationErrorDetails, cause?: unknown) {
    super(
      `Zod generation failed for "${details.path}": ${details.reason}. ${details.recommendation}`,
      { cause },
    );
    this.name = "ZodGenerationError";
    this.details = details;
  }
}

export const zodSchemasTemplate = defineTemplate<ZodSchemasTemplateData>(
  ({ schemas, models, refinementImports }) => {
    const lines = [
      'import { z } from "zod";',
      ...refinementImports.map(
        (refinement) =>
          "import { " +
          refinement.exportName +
          " as " +
          refinement.localName +
          " } from " +
          JSON.stringify(refinement.importPath) +
          ";",
      ),
      "",
    ];

    for (const schema of schemas) {
      lines.push(`export const ${schema.name}Schema = ${schema.schema};`, "");
    }

    for (const model of models) {
      lines.push(`export const ${model.name}Schema = z.object({`);

      for (const field of model.fields) {
        lines.push(`  ${propertyName(field.name)}: ${field.schema},`);
      }

      for (const relationship of model.relationships) {
        lines.push(`  ${propertyName(relationship.name)}: ${relationship.schema},`);
      }

      lines.push("});", "");
    }

    return lines.join("\n");
  },
  { name: "zod-schemas" },
);

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function defaultLiteral(value: unknown, path: string): string {
  if (value === undefined) {
    throw new ZodGenerationError({
      path,
      reason: "default value is undefined",
      recommendation: "Use a JSON-serializable default value or remove the default modifier.",
    });
  }

  try {
    const literal = JSON.stringify(value);
    if (literal === undefined) {
      throw new TypeError("value cannot be represented as a JSON literal");
    }
    return literal;
  } catch (error) {
    if (error instanceof ZodGenerationError) {
      throw error;
    }
    throw new ZodGenerationError(
      {
        path,
        reason: "default value cannot be represented in generated TypeScript",
        recommendation: "Use a JSON-serializable default value.",
      },
      error,
    );
  }
}

function refinementDefinitions(graph: ApplicationGraph): Record<string, RefinementDefinition> {
  const application = graph.nodes.find((node) => node.type === "application");
  const definitions = application?.data?.["definitions"];
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return {};
  const refinements = (definitions as Record<string, unknown>)["refinements"];
  if (!refinements || typeof refinements !== "object" || Array.isArray(refinements)) return {};
  return refinements as Record<string, RefinementDefinition>;
}

function schemaDefinitions(graph: ApplicationGraph): Record<string, SchemaExpression> {
  const application = graph.nodes.find((node) => node.type === "application");
  const definitions = application?.data?.["definitions"];
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return {};
  const schemas = (definitions as Record<string, unknown>)["schemas"];
  if (!schemas || typeof schemas !== "object" || Array.isArray(schemas)) return {};
  return schemas as Record<string, SchemaExpression>;
}

function applyConstraint(
  expression: string,
  constraint: StructuredConstraint,
  refinements: Record<string, RefinementDefinition>,
  imports: Map<string, { importPath: string; exportName: string; localName: string }>,
): string {
  if (constraint.kind === "minLength") return expression + ".min(" + constraint.value + ")";
  if (constraint.kind === "maxLength") return expression + ".max(" + constraint.value + ")";
  if (constraint.kind === "pattern") {
    return expression + ".regex(new RegExp(" + JSON.stringify(constraint.value) + "))";
  }
  if (constraint.kind === "min") return expression + ".min(" + constraint.value + ")";
  if (constraint.kind === "max") return expression + ".max(" + constraint.value + ")";
  if (constraint.kind === "email") return expression + ".email()";
  const definition = refinements[constraint.id];
  if (
    !definition ||
    typeof definition.importPath !== "string" ||
    !definition.importPath.startsWith(".") ||
    typeof definition.exportName !== "string"
  ) {
    throw new ZodGenerationError({
      path: "validation.refinements." + constraint.id,
      reason: "custom refinement reference cannot be resolved",
      recommendation: "Configure an importPath and exportName for the refinement.",
    });
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(definition.exportName)) {
    throw new ZodGenerationError({
      path: "validation.refinements." + constraint.id,
      reason: "custom refinement exportName is not a valid identifier",
      recommendation: "Use a named developer-owned export.",
    });
  }
  const localName = "refine_" + constraint.id.replace(/[^A-Za-z0-9_$]/g, "_");
  imports.set(constraint.id, { importPath: definition.importPath, exportName: definition.exportName, localName });
  return expression + ".refine(" + localName + ")";
}

function fieldSchema(
  field: NormalizedModelFieldContext,
  modelName: string,
  refinements: Record<string, RefinementDefinition>,
  imports: Map<string, { importPath: string; exportName: string; localName: string }>,
): ZodFieldTemplateData {
  let schema = field.zodExpression;

  for (const constraint of field.constraints) {
    schema = applyConstraint(schema, constraint, refinements, imports);
  }

  if (field.optional) {
    schema += ".optional()";
  }

  if (field.nullable) {
    schema += ".nullable()";
  }

  if (field.defaultValue !== undefined) {
    schema += `.default(${defaultLiteral(field.defaultValue, `models.${modelName}.fields.${field.name}.default`)})`;
  }

  return { name: field.name, schema };
}

function relationshipSchema(
  relationship: NormalizedModelRelationshipContext,
): ZodFieldTemplateData {
  const schema = `z.lazy(() => ${relationship.target}Schema)`;
  return {
    name: relationship.name,
    schema: relationship.collection ? `z.array(${schema})` : schema,
  };
}

export function zodTemplateData(graph: ApplicationGraph): ZodSchemasTemplateData {
  try {
    const imports = new Map<string, { importPath: string; exportName: string; localName: string }>();
    const refinements = refinementDefinitions(graph);
    const modelContexts = normalizeModelContexts(graph);
    const modelNames = new Set(modelContexts.map((model) => model.name));
    const schemas = schemaDefinitions(graph);
    const schemaNames = new Set(Object.keys(schemas));
    const schemaData = Object.keys(schemas)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({
        name,
        schema: renderSchemaExpression(schemas[name]!, { modelNames, schemaNames }),
      }));
    const models = modelContexts.map((model) => ({
      name: model.name,
      fields: model.fields.map((field) => fieldSchema(field, model.name, refinements, imports)),
      relationships: model.relationships.map((relationship) => relationshipSchema(relationship)),
    } satisfies ZodModelTemplateData));
    return {
      schemas: schemaData,
      models,
      refinementImports: [...imports.values()].sort((left, right) =>
        left.localName.localeCompare(right.localName),
      ),
    };
  } catch (error) {
    if (error instanceof ModelContextError) {
      throw new ZodGenerationError(
        {
          path: error.path,
          reason: error.message,
          recommendation: "Correct the model context before generating Zod schemas.",
        },
        error,
      );
    }
    if (error instanceof FieldContextError) {
      throw new ZodGenerationError(
        {
          path: error.diagnostics[0]?.path ?? "model.field",
          reason: "unsupported field type",
          recommendation: "Use a field type supported by the Mavibase field system.",
        },
        error,
      );
    }
    throw error;
  }
}

export function generateZodSchemas(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = zodTemplateData(graph);
  if (data.models.length === 0 && data.schemas.length === 0) {
    return undefined;
  }

  return {
    path: "schemas.ts",
    content: zodSchemasTemplate.render(data),
  };
}
