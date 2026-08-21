import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";
import type { FieldDefinition, SemanticType } from "@mavibase/core";

import {
  requireGeneratorFieldContext,
  type GeneratorFieldContext,
} from "./field-context.js";

export interface NormalizedModelFieldContext extends GeneratorFieldContext {
  required: boolean;
  unique: boolean;
  indexed: boolean;
  primary: boolean;
  generated: boolean;
  defaultValue?: unknown;
}

export interface NormalizedModelRelationshipContext {
  name: string;
  target: string;
  type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  collection: boolean;
}

export interface NormalizedModelContext {
  name: string;
  table: string;
  fields: readonly NormalizedModelFieldContext[];
  relationships: readonly NormalizedModelRelationshipContext[];
}

export class ModelContextError extends Error {
  readonly code = "MAVIBASE_MODEL_CONTEXT_ERROR";
  readonly path: string;

  constructor(path: string, message: string, cause?: unknown) {
    super(`Invalid model context at "${path}": ${message}`, { cause });
    this.name = "ModelContextError";
    this.path = path;
  }
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fieldContext(
  node: GraphNode,
  modelName: string,
): NormalizedModelFieldContext | undefined {
  const name = nodeName(node);
  if (!name) return undefined;
  const data = record(node.data);
  const modifiers = record(data["modifiers"]);
  const context = requireGeneratorFieldContext(
    {
      type: data["type"] as SemanticType,
      ...(data["modifiers"] === undefined
        ? {}
        : { modifiers: data["modifiers"] as NonNullable<FieldDefinition["modifiers"]> }),
      ...(data["validation"] === undefined ? {} : { validation: data["validation"] as string }),
    },
    `models.${modelName}.fields.${name}`,
  );
  return {
    ...context,
    required: modifiers["required"] === true,
    unique: modifiers["unique"] === true,
    indexed: modifiers["indexed"] === true,
    primary: modifiers["primary"] === true,
    generated: modifiers["generated"] === true,
    ...(Object.prototype.hasOwnProperty.call(modifiers, "default")
      ? { defaultValue: modifiers["default"] }
      : {}),
  };
}

function relationshipContext(
  node: GraphNode,
  modelName: string,
): NormalizedModelRelationshipContext | undefined {
  const name = nodeName(node);
  if (!name) return undefined;
  const data = record(node.data);
  const target = data["model"];
  if (typeof target !== "string" || !target.trim()) {
    throw new ModelContextError(
      `models.${modelName}.relationships.${name}.model`,
      "relationship target is missing",
    );
  }
  const type = data["type"];
  if (
    type !== "one-to-one" &&
    type !== "one-to-many" &&
    type !== "many-to-one" &&
    type !== "many-to-many"
  ) {
    throw new ModelContextError(
      `models.${modelName}.relationships.${name}.type`,
      `unsupported relationship type "${String(type)}"`,
    );
  }
  return { name, target, type, collection: type === "one-to-many" || type === "many-to-many" };
}

export function normalizeModelContexts(graph: ApplicationGraph): readonly NormalizedModelContext[] {
  return graph.nodes
    .filter((node) => node.type === "model")
    .map((model) => {
      const name = nodeName(model) ?? model.id;
      const fields = graph.edges
        .filter((edge) => edge.from === model.id && edge.type === "has-field")
        .map((edge) => graph.nodes.find((node) => node.id === edge.to))
        .filter((node): node is GraphNode => node?.type === "field")
        .map((node) => fieldContext(node, name))
        .filter((field): field is NormalizedModelFieldContext => field !== undefined)
        .sort((left, right) => left.name.localeCompare(right.name));
      const relationships = graph.edges
        .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
        .map((edge) => graph.nodes.find((node) => node.id === edge.to))
        .filter((node): node is GraphNode => node?.type === "relationship")
        .map((node) => relationshipContext(node, name))
        .filter(
          (relationship): relationship is NormalizedModelRelationshipContext =>
            relationship !== undefined,
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      return { name, table: name, fields, relationships };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
