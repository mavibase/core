import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { FieldContextError } from "./field-context.js";
import {
  ModelContextError,
  normalizeModelContexts,
  type NormalizedModelFieldContext,
  type NormalizedModelRelationshipContext,
} from "./model-context.js";

export interface ZodFieldTemplateData {
  name: string;
  schema: string;
}

export interface ZodModelTemplateData {
  name: string;
  fields: ZodFieldTemplateData[];
  relationships: ZodFieldTemplateData[];
}

export interface ZodSchemasTemplateData {
  models: ZodModelTemplateData[];
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
  ({ models }) => {
    const lines = ['import { z } from "zod";', ""];

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

function fieldSchema(field: NormalizedModelFieldContext, modelName: string): ZodFieldTemplateData {
  let schema = field.zodExpression;

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
    const models = normalizeModelContexts(graph).map((model) => ({
      name: model.name,
      fields: model.fields.map((field) => fieldSchema(field, model.name)),
      relationships: model.relationships.map((relationship) => relationshipSchema(relationship)),
    } satisfies ZodModelTemplateData));
    return { models };
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
  if (data.models.length === 0) {
    return undefined;
  }

  return {
    path: "schemas.ts",
    content: zodSchemasTemplate.render(data),
  };
}
