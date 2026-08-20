import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";
import { validateGraphResult } from "@mavibase/application-graph";
import {
  defineDatabaseSchema,
  defineDatabaseSeed,
  isSemanticType,
  type DatabaseColumnDefinition,
  type DatabaseConstraintDefinition,
  type DatabaseIndexDefinition,
  type DatabaseNamingPolicy,
  type DatabaseSchemaModel,
  type DatabaseSeedDefinition,
  type SemanticType,
} from "@mavibase/core";

export interface SchemaNormalizationOptions {
  seeds?: readonly DatabaseSeedDefinition[];
  naming?: Partial<DatabaseNamingPolicy>;
}

export interface SchemaNormalizationIssue {
  path: string;
  message: string;
}

export class SchemaNormalizationError extends Error {
  readonly code = "MAVIBASE_SCHEMA_NORMALIZATION_ERROR";
  readonly issues: readonly SchemaNormalizationIssue[];

  constructor(issues: readonly SchemaNormalizationIssue[]) {
    super(`Unable to normalize database schema: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "SchemaNormalizationError";
    this.issues = issues;
  }
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function databaseType(type: SemanticType): DatabaseColumnDefinition["type"] {
  if (typeof type === "string") return type;
  return type.kind === "enum" ? "text" : "json";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeColumn(node: GraphNode, path: string): DatabaseColumnDefinition {
  const data = record(node.data);
  const semanticType = data["type"];
  if (!isSemanticType(semanticType)) {
    throw new SchemaNormalizationError([
      { path: `${path}.type`, message: "Field type is not a supported semantic type." },
    ]);
  }
  const modifiers = record(data["modifiers"]);
  const nullable =
    modifiers["nullable"] === true ? true : modifiers["required"] === true ? false : undefined;
  return {
    name: typeof data["name"] === "string" ? data["name"] : node.id,
    type: databaseType(semanticType),
    semanticType,
    ...(nullable === undefined ? {} : { nullable }),
    ...(modifiers["primary"] === true ? { primaryKey: true } : {}),
    ...(modifiers["unique"] === true ? { unique: true } : {}),
    ...(modifiers["indexed"] === true ? { indexed: true } : {}),
    ...(modifiers["generated"] === true ? { generated: true } : {}),
    ...(Object.prototype.hasOwnProperty.call(modifiers, "default")
      ? { defaultValue: modifiers["default"] }
      : {}),
  };
}

function modelDatabaseValues(
  model: GraphNode,
): {
  indexes?: readonly DatabaseIndexDefinition[];
  constraints?: readonly DatabaseConstraintDefinition[];
} {
  const data = record(model.data);
  const indexes = data["indexes"];
  const constraints = data["constraints"];
  return {
    ...(Array.isArray(indexes) ? { indexes: indexes as readonly DatabaseIndexDefinition[] } : {}),
    ...(Array.isArray(constraints)
      ? { constraints: constraints as readonly DatabaseConstraintDefinition[] }
      : {}),
  };
}

export function normalizeDatabaseSchema(
  graph: ApplicationGraph,
  options: SchemaNormalizationOptions = {},
): DatabaseSchemaModel {
  const graphResult = validateGraphResult(graph);
  if (!graphResult.valid) {
    throw new SchemaNormalizationError(
      graphResult.diagnostics.map((diagnostic) => ({
        path: diagnostic.path ?? "graph",
        message: diagnostic.message,
      })),
    );
  }

  const models = graph.nodes
    .filter((node) => node.type === "model")
    .sort((left, right) => left.id.localeCompare(right.id));
  const tables = models.map((model) => {
    const modelName = nodeName(model) ?? model.id;
    const fields = graph.edges
      .filter((edge) => edge.from === model.id && edge.type === "has-field")
      .map((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is GraphNode => node?.type === "field")
      .sort((left, right) => (nodeName(left) ?? left.id).localeCompare(nodeName(right) ?? right.id))
      .map((node) => normalizeColumn(node, `tables.${modelName}.columns.${nodeName(node) ?? node.id}`));
    return {
      id: model.id,
      name: modelName,
      columns: fields,
      ...modelDatabaseValues(model),
    };
  });

  const seeds = (options.seeds ?? []).map((seed) => defineDatabaseSeed(seed));
  const schema = defineDatabaseSchema({
    name: graph.name,
    version: graph.version,
    tables,
  });
  return {
    ...schema,
    seeds,
    naming: {
      tableCase: options.naming?.tableCase ?? "preserve",
      columnCase: options.naming?.columnCase ?? "preserve",
      indexCase: options.naming?.indexCase ?? "preserve",
      constraintCase: options.naming?.constraintCase ?? "preserve",
    },
    operations: [],
  };
}
