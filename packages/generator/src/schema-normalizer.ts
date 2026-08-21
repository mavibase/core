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
  capabilities?: DatabaseProviderCapabilities;
}

export interface DatabaseProviderCapabilities {
  scalarTypes: readonly string[];
  features?: ReadonlySet<"arrays" | "enums">;
  constraints: ReadonlySet<"primary" | "foreign-key" | "unique" | "check">;
  indexes: { composite: boolean; unique: boolean };
  migrationOperations: ReadonlySet<
    | "create-table"
    | "drop-table"
    | "add-column"
    | "drop-column"
    | "alter-column"
    | "create-index"
    | "drop-index"
    | "add-constraint"
    | "drop-constraint"
  >;
  supportsDestructiveMigrations: boolean;
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

export function validateDatabaseSchemaCapabilities(
  schema: DatabaseSchemaModel,
  capabilities: DatabaseProviderCapabilities,
): SchemaNormalizationIssue[] {
  const issues: SchemaNormalizationIssue[] = [];
  for (const [tableIndex, table] of schema.tables.entries()) {
    for (const [columnIndex, column] of table.columns.entries()) {
      if (!capabilities.scalarTypes.includes(column.type)) {
        issues.push({
          path: `tables[${tableIndex}].columns[${columnIndex}].type`,
          message: `Provider does not support scalar type "${column.type}".`,
        });
      }
      const semanticType = column.semanticType;
      if (semanticType && typeof semanticType === "object") {
        const kind = (semanticType as { kind?: unknown }).kind;
        if (kind === "array" && !capabilities.features?.has("arrays")) {
          issues.push({
            path: `tables[${tableIndex}].columns[${columnIndex}].type`,
            message: "Provider does not support array fields.",
          });
        }
        if (kind === "enum" && !capabilities.features?.has("enums")) {
          issues.push({
            path: `tables[${tableIndex}].columns[${columnIndex}].type`,
            message: "Provider does not support enum fields.",
          });
        }
      }
    }
    for (const [indexIndex, index] of (table.indexes ?? []).entries()) {
      if (index.columns.length > 1 && !capabilities.indexes.composite) {
        issues.push({
          path: `tables[${tableIndex}].indexes[${indexIndex}]`,
          message: "Provider does not support composite indexes.",
        });
      }
      if (index.unique && !capabilities.indexes.unique) {
        issues.push({
          path: `tables[${tableIndex}].indexes[${indexIndex}].unique`,
          message: "Provider does not support unique indexes.",
        });
      }
    }
    for (const [constraintIndex, constraint] of (table.constraints ?? []).entries()) {
      const capability = constraint.type === "primary-key" ? "primary" : constraint.type;
      if (!capabilities.constraints.has(capability)) {
        issues.push({
          path: `tables[${tableIndex}].constraints[${constraintIndex}].type`,
          message: `Provider does not support ${constraint.type} constraints.`,
        });
      }
    }
  }
  for (const [operationIndex, operation] of schema.operations.entries()) {
    if (!capabilities.migrationOperations.has(operation.kind)) {
      issues.push({
        path: `operations[${operationIndex}].kind`,
        message: `Provider does not support migration operation "${operation.kind}".`,
      });
    }
    if (
      ["drop-table", "drop-column", "drop-index", "drop-constraint"].includes(operation.kind) &&
      !capabilities.supportsDestructiveMigrations
    ) {
      issues.push({
        path: `operations[${operationIndex}].kind`,
        message: `Provider does not support destructive migration operation "${operation.kind}".`,
      });
    }
  }
  return issues;
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
  const normalized: DatabaseSchemaModel = {
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
  if (options.capabilities) {
    const issues = validateDatabaseSchemaCapabilities(normalized, options.capabilities);
    if (issues.length > 0) throw new SchemaNormalizationError(issues);
  }
  return normalized;
}
