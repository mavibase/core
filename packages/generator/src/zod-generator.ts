import type { FieldModifiers, FieldType } from "@mavibase/core";
import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

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

const fieldSchemaMap: Readonly<Record<FieldType, string>> = {
  string: "z.string()",
  integer: "z.number().int()",
  float: "z.number()",
  decimal: "z.number()",
  boolean: "z.boolean()",
  uuid: "z.string().uuid()",
  datetime: "z.coerce.date()",
  json: "z.unknown()",
};

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function getModifiers(data: unknown): FieldModifiers {
  if (!data || typeof data !== "object") {
    return {};
  }

  return data as FieldModifiers;
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

function fieldSchema(node: GraphNode, modelName: string): ZodFieldTemplateData | undefined {
  const name = nodeName(node);
  if (!name) {
    return undefined;
  }

  const type = node.data?.["type"];
  if (typeof type !== "string" || !(type in fieldSchemaMap)) {
    throw new ZodGenerationError({
      path: `models.${modelName}.fields.${name}.type`,
      reason: `unsupported field type "${String(type)}"`,
      recommendation: "Use a field type supported by the Mavibase field system.",
    });
  }

  const fieldModifiers = getModifiers(node.data?.["modifiers"]);
  let schema = fieldSchemaMap[type as FieldType];

  if (fieldModifiers.optional === true) {
    schema += ".optional()";
  }

  if (fieldModifiers.nullable === true) {
    schema += ".nullable()";
  }

  if (Object.prototype.hasOwnProperty.call(fieldModifiers, "default")) {
    schema += `.default(${defaultLiteral(fieldModifiers.default, `models.${modelName}.fields.${name}.default`)})`;
  }

  return { name, schema };
}

function relationshipSchema(
  node: GraphNode,
  modelName: string,
): ZodFieldTemplateData | undefined {
  const name = nodeName(node);
  if (!name) {
    return undefined;
  }

  const target = node.data?.["model"];
  if (typeof target !== "string" || !target.trim()) {
    throw new ZodGenerationError({
      path: `models.${modelName}.relationships.${name}.model`,
      reason: "relationship target is missing",
      recommendation: "Define a target model for the relationship.",
    });
  }

  const type = node.data?.["type"];
  const collection = type === "one-to-many" || type === "many-to-many";
  if (
    type !== "one-to-one" &&
    type !== "one-to-many" &&
    type !== "many-to-one" &&
    type !== "many-to-many"
  ) {
    throw new ZodGenerationError({
      path: `models.${modelName}.relationships.${name}.type`,
      reason: `unsupported relationship type "${String(type)}"`,
      recommendation: "Use a relationship type supported by the Mavibase relationship system.",
    });
  }

  const schema = `z.lazy(() => ${target}Schema)`;
  return { name, schema: collection ? `z.array(${schema})` : schema };
}

export function zodTemplateData(graph: ApplicationGraph): ZodSchemasTemplateData {
  const models = graph.nodes
    .filter((node) => node.type === "model")
    .map((model) => {
      const modelName = nodeName(model) ?? model.id;
      const fields = graph.edges
        .filter((edge) => edge.from === model.id && edge.type === "has-field")
        .map((edge) => graph.nodes.find((node) => node.id === edge.to))
        .filter((node): node is GraphNode => node?.type === "field")
        .map((node) => fieldSchema(node, modelName))
        .filter((field): field is ZodFieldTemplateData => field !== undefined)
        .sort((left, right) => left.name.localeCompare(right.name));

      const relationships = graph.edges
        .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
        .map((edge) => graph.nodes.find((node) => node.id === edge.to))
        .filter((node): node is GraphNode => node?.type === "relationship")
        .map((node) => relationshipSchema(node, modelName))
        .filter((relationship): relationship is ZodFieldTemplateData => relationship !== undefined)
        .sort((left, right) => left.name.localeCompare(right.name));

      return { name: modelName, fields, relationships } satisfies ZodModelTemplateData;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return { models };
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
