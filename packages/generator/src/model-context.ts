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
  required: boolean;
  optional: boolean;
  owner?: "source" | "target";
  inverse?: string;
  field?: string;
  through?: string;
  foreignKey?: string;
  onDelete?: "cascade" | "restrict" | "set-null" | "no-action";
  onUpdate?: "cascade" | "restrict" | "set-null" | "no-action";
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

function referentialAction(value: unknown): "cascade" | "restrict" | "set-null" | "no-action" | undefined {
  return value === "cascade" || value === "restrict" || value === "set-null" || value === "no-action"
    ? value
    : undefined;
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
      ...(data["constraints"] === undefined
        ? {}
        : { constraints: data["constraints"] as NonNullable<FieldDefinition["constraints"]> }),
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
  const required = data["required"] === true;
  const optional = typeof data["optional"] === "boolean" ? data["optional"] : !required;
  if (required && data["optional"] === true) {
    throw new ModelContextError(
      `models.${modelName}.relationships.${name}`,
      "relationship cannot be both required and optional",
    );
  }
  const owner = data["owner"];
  if (owner !== undefined && owner !== "source" && owner !== "target") {
    throw new ModelContextError(
      `models.${modelName}.relationships.${name}.owner`,
      "relationship owner must be source or target",
    );
  }
  const actions = new Set(["cascade", "restrict", "set-null", "no-action"]);
  for (const key of ["onDelete", "onUpdate"] as const) {
    if (data[key] !== undefined && !actions.has(data[key] as string)) {
      throw new ModelContextError(
        `models.${modelName}.relationships.${name}.${key}`,
        "relationship referential action is invalid",
      );
    }
  }
  const onDelete = referentialAction(data["onDelete"]);
  const onUpdate = referentialAction(data["onUpdate"]);
  return {
    name,
    target,
    type,
    collection: type === "one-to-many" || type === "many-to-many",
    required,
    optional,
    ...(owner === undefined ? {} : { owner }),
    ...(typeof data["inverse"] === "string" ? { inverse: data["inverse"] } : {}),
    ...(typeof data["field"] === "string" ? { field: data["field"] } : {}),
    ...(typeof data["through"] === "string" ? { through: data["through"] } : {}),
    ...(typeof data["foreignKey"] === "string" ? { foreignKey: data["foreignKey"] } : {}),
    ...(onDelete === undefined ? {} : { onDelete }),
    ...(onUpdate === undefined ? {} : { onUpdate }),
  };
}

export function normalizeModelContexts(graph: ApplicationGraph): readonly NormalizedModelContext[] {
  const contexts = graph.nodes
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
  const models = new Map(contexts.map((model) => [model.name, model]));
  const inverseTypes: Record<NormalizedModelRelationshipContext["type"], string> = {
    "one-to-one": "one-to-one",
    "one-to-many": "many-to-one",
    "many-to-one": "one-to-many",
    "many-to-many": "many-to-many",
  };
  for (const model of contexts) {
    const fields = new Set(model.fields.map((field) => field.name));
    for (const relationship of model.relationships) {
      const target = models.get(relationship.target);
      if (!target) {
        throw new ModelContextError(
          `models.${model.name}.relationships.${relationship.name}.model`,
          `relationship target does not exist: "${relationship.target}"`,
        );
      }
      if (relationship.field && !fields.has(relationship.field)) {
        throw new ModelContextError(
          `models.${model.name}.relationships.${relationship.name}.field`,
          `relationship field does not exist: "${relationship.field}"`,
        );
      }
      if (relationship.type === "many-to-many") {
        if (!relationship.through) {
          throw new ModelContextError(
            `models.${model.name}.relationships.${relationship.name}.through`,
            "many-to-many relationships require an explicit join model",
          );
        }
        if (!models.has(relationship.through)) {
          throw new ModelContextError(
            `models.${model.name}.relationships.${relationship.name}.through`,
            `join model does not exist: "${relationship.through}"`,
          );
        }
      }
      if (relationship.inverse) {
        const inverse = target.relationships.find((candidate) => candidate.name === relationship.inverse);
        if (!inverse) {
          throw new ModelContextError(
            `models.${model.name}.relationships.${relationship.name}.inverse`,
            `inverse relationship does not exist on "${target.name}"`,
          );
        }
        if (inverse.target !== model.name || inverse.inverse !== relationship.name) {
          throw new ModelContextError(
            `models.${model.name}.relationships.${relationship.name}.inverse`,
            "inverse relationship must point back to the source relationship",
          );
        }
        if (inverse.type !== inverseTypes[relationship.type]) {
          throw new ModelContextError(
            `models.${model.name}.relationships.${relationship.name}.inverse`,
            "relationship cardinality does not match its inverse",
          );
        }
      }
    }
  }
  return contexts;
}
