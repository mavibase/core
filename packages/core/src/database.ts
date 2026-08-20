export type DatabaseScalarType =
  "string" | "integer" | "float" | "decimal" | "boolean" | "uuid" | "datetime" | "json";

export type ReferentialAction = "cascade" | "restrict" | "set-null" | "no-action";

export interface DatabaseColumnDefinition {
  name: string;
  type: DatabaseScalarType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  indexed?: boolean;
  generated?: boolean;
  defaultValue?: unknown;
}

export interface DatabaseIndexDefinition {
  name: string;
  columns: readonly string[];
  unique?: boolean;
}

export interface DatabaseIndexInput {
  name?: string;
  columns: readonly string[];
  unique?: boolean;
}

export interface DatabasePrimaryKeyConstraint {
  name: string;
  type: "primary-key";
  columns: readonly string[];
}

export interface DatabaseUniqueConstraint {
  name: string;
  type: "unique";
  columns: readonly string[];
}

export interface DatabaseForeignKeyConstraint {
  name: string;
  type: "foreign-key";
  columns: readonly string[];
  referencedTable: string;
  referencedColumns: readonly string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
}

export interface DatabaseCheckConstraint {
  name: string;
  type: "check";
  expression: string;
}

export type DatabaseConstraintDefinition =
  | DatabasePrimaryKeyConstraint
  | DatabaseUniqueConstraint
  | DatabaseForeignKeyConstraint
  | DatabaseCheckConstraint;

export type DatabaseConstraintInput =
  | { name?: string; type: "primary-key" | "unique"; columns: readonly string[] }
  | {
      name?: string;
      type: "foreign-key";
      columns: readonly string[];
      referencedTable: string;
      referencedColumns: readonly string[];
      onDelete?: ReferentialAction;
      onUpdate?: ReferentialAction;
    }
  | { name?: string; type: "check"; expression: string };

export interface DatabaseTableDefinition {
  id: string;
  name: string;
  columns: readonly DatabaseColumnDefinition[];
  indexes?: readonly DatabaseIndexDefinition[];
  constraints?: readonly DatabaseConstraintDefinition[];
}

export interface DatabaseSchemaDefinition {
  name: string;
  version: string;
  tables: readonly DatabaseTableDefinition[];
}

export type DatabaseSeedMode = "insert" | "upsert";

export interface DatabaseSeedTableDefinition {
  table: string;
  rows: readonly Readonly<Record<string, unknown>>[];
  mode?: DatabaseSeedMode;
}

export interface DatabaseSeedDefinition {
  id: string;
  name: string;
  order?: number;
  tables: readonly DatabaseSeedTableDefinition[];
}

export interface DatabaseSchemaValidationIssue {
  path: string;
  message: string;
}

export class DatabaseSchemaDefinitionError extends Error {
  readonly code = "MAVIBASE_DATABASE_SCHEMA_DEFINITION_ERROR";
  readonly issues: readonly DatabaseSchemaValidationIssue[];

  constructor(issues: readonly DatabaseSchemaValidationIssue[]) {
    super(`Invalid database schema: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "DatabaseSchemaDefinitionError";
    this.issues = issues;
  }
}

export class DatabaseSeedDefinitionError extends Error {
  readonly code = "MAVIBASE_DATABASE_SEED_DEFINITION_ERROR";
  readonly issues: readonly DatabaseSchemaValidationIssue[];

  constructor(issues: readonly DatabaseSchemaValidationIssue[]) {
    super(`Invalid database seed: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "DatabaseSeedDefinitionError";
    this.issues = issues;
  }
}

function indexPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createDatabaseIndexName(
  tableName: string,
  columns: readonly string[],
  unique = false,
): string {
  const parts = [indexPart(tableName), ...columns.map(indexPart), unique ? "uniq" : "idx"];
  return parts.filter((part) => part.length > 0).join("_") || "index_idx";
}

export function defineDatabaseIndex(
  tableName: string,
  input: DatabaseIndexInput,
): DatabaseIndexDefinition {
  const issues: DatabaseSchemaValidationIssue[] = [];
  if (!isNonEmptyString(tableName)) {
    issues.push({ path: "table", message: "Index table name must not be empty." });
  }
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    issues.push({ path: "columns", message: "Index columns must contain at least one value." });
  } else {
    const seen = new Set<string>();
    for (const [index, column] of input.columns.entries()) {
      if (!isNonEmptyString(column)) {
        issues.push({
          path: `columns[${index}]`,
          message: "Index columns must contain non-empty strings.",
        });
      } else if (seen.has(column)) {
        issues.push({
          path: `columns[${index}]`,
          message: `Index columns must not contain duplicates: "${column}".`,
        });
      }
      seen.add(column);
    }
  }
  if (issues.length > 0) throw new DatabaseSchemaDefinitionError(issues);
  return {
    name: input.name ?? createDatabaseIndexName(tableName, input.columns, input.unique),
    columns: [...input.columns],
    ...(input.unique === undefined ? {} : { unique: input.unique }),
  };
}

export function createDatabaseConstraintName(
  tableName: string,
  type: DatabaseConstraintDefinition["type"],
  columns: readonly string[] = [],
): string {
  const suffix = type.replace("-", "_");
  const parts = [indexPart(tableName), ...columns.map(indexPart), suffix];
  return parts.filter((part) => part.length > 0).join("_") || "constraint";
}

export function defineDatabaseConstraint(
  tableName: string,
  input: DatabaseConstraintInput,
): DatabaseConstraintDefinition {
  const issues: DatabaseSchemaValidationIssue[] = [];
  if (!isNonEmptyString(tableName)) {
    issues.push({ path: "table", message: "Constraint table name must not be empty." });
  }
  const inputType = isRecord(input) ? input["type"] : undefined;
  if (!isRecord(input) || !["primary-key", "unique", "foreign-key", "check"].includes(String(inputType))) {
    issues.push({ path: "type", message: "Constraint type is not supported." });
  }
  if (issues.length > 0) throw new DatabaseSchemaDefinitionError(issues);
  if (input.type === "check") {
    if (!isNonEmptyString(input.expression)) {
      issues.push({
        path: "expression",
        message: "Check constraints need a non-empty expression.",
      });
    }
  } else {
    if (!Array.isArray(input.columns) || input.columns.length === 0) {
      issues.push({
        path: "columns",
        message: "Constraint columns must contain at least one value.",
      });
    } else {
      const seen = new Set<string>();
      for (const [index, column] of input.columns.entries()) {
        if (!isNonEmptyString(column)) {
          issues.push({
            path: `columns[${index}]`,
            message: "Constraint columns must contain non-empty strings.",
          });
        } else if (seen.has(column)) {
          issues.push({
            path: `columns[${index}]`,
            message: `Constraint columns must not contain duplicates: "${column}".`,
          });
        }
        seen.add(column);
      }
    }
    if (input.type === "foreign-key") {
      if (!isNonEmptyString(input.referencedTable)) {
        issues.push({ path: "referencedTable", message: "Foreign keys need a referenced table." });
      }
      if (!Array.isArray(input.referencedColumns) || input.referencedColumns.length === 0) {
        issues.push({
          path: "referencedColumns",
          message: "Foreign keys need referenced columns.",
        });
      } else if (new Set(input.referencedColumns).size !== input.referencedColumns.length) {
        issues.push({
          path: "referencedColumns",
          message: "Referenced columns must not contain duplicates.",
        });
      }
    }
  }
  if (issues.length > 0) throw new DatabaseSchemaDefinitionError(issues);
  const name =
    input.name ??
    createDatabaseConstraintName(tableName, input.type, "columns" in input ? input.columns : []);
  if (input.type === "check") {
    return { name, type: "check", expression: input.expression };
  }
  if (input.type === "foreign-key") {
    return {
      name,
      type: "foreign-key",
      columns: [...input.columns],
      referencedTable: input.referencedTable,
      referencedColumns: [...input.referencedColumns],
      ...(input.onDelete === undefined ? {} : { onDelete: input.onDelete }),
      ...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
    };
  }
  return { name, type: input.type, columns: [...input.columns] };
}

export function validateDatabaseSeedDefinition(
  definition: unknown,
): DatabaseSchemaValidationIssue[] {
  const issues: DatabaseSchemaValidationIssue[] = [];
  if (!isRecord(definition)) {
    return [{ path: "seed", message: "Database seed definition must be an object." }];
  }
  if (!isNonEmptyString(definition["id"])) {
    issues.push({ path: "id", message: "Database seed id must not be empty." });
  }
  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Database seed name must not be empty." });
  }
  if (
    definition["order"] !== undefined &&
    (typeof definition["order"] !== "number" || !Number.isFinite(definition["order"]))
  ) {
    issues.push({
      path: "order",
      message: "Database seed order must be a finite number when provided.",
    });
  }
  if (!Array.isArray(definition["tables"]) || definition["tables"].length === 0) {
    issues.push({
      path: "tables",
      message: "Database seed tables must contain at least one table.",
    });
    return issues;
  }
  for (const [tableIndex, table] of definition["tables"].entries()) {
    const path = `tables[${tableIndex}]`;
    if (!isRecord(table) || !isNonEmptyString(table["table"])) {
      issues.push({ path, message: "Seed table must define a non-empty table name." });
      continue;
    }
    if (!Array.isArray(table["rows"])) {
      issues.push({ path: `${path}.rows`, message: "Seed table rows must be an array." });
      continue;
    }
    if (table["mode"] !== undefined && table["mode"] !== "insert" && table["mode"] !== "upsert") {
      issues.push({ path: `${path}.mode`, message: "Seed table mode must be insert or upsert." });
    }
    for (const [rowIndex, row] of table["rows"].entries()) {
      if (!isRecord(row)) {
        issues.push({ path: `${path}.rows[${rowIndex}]`, message: "Seed rows must be objects." });
      }
    }
  }
  return issues;
}

export function defineDatabaseSeed(definition: DatabaseSeedDefinition): DatabaseSeedDefinition {
  const issues = validateDatabaseSeedDefinition(definition);
  if (issues.length > 0) throw new DatabaseSeedDefinitionError(issues);
  return {
    id: definition.id,
    name: definition.name,
    ...(definition.order === undefined ? {} : { order: definition.order }),
    tables: [...definition.tables]
      .sort((left, right) => left.table.localeCompare(right.table))
      .map((table) => ({
        table: table.table,
        ...(table.mode === undefined ? {} : { mode: table.mode }),
        rows: table.rows.map((row) => ({ ...row })),
      })),
  };
}

const scalarTypes: readonly DatabaseScalarType[] = [
  "string",
  "integer",
  "float",
  "decimal",
  "boolean",
  "uuid",
  "datetime",
  "json",
];

const referentialActions: readonly ReferentialAction[] = [
  "cascade",
  "restrict",
  "set-null",
  "no-action",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateColumns(
  table: Record<string, unknown>,
  path: string,
  issues: DatabaseSchemaValidationIssue[],
): void {
  const columns = table["columns"];
  if (!Array.isArray(columns)) {
    issues.push({ path: `${path}.columns`, message: "Table columns must be an array." });
    return;
  }

  const names = new Set<string>();
  for (const [index, column] of columns.entries()) {
    const columnPath = `${path}.columns[${index}]`;
    if (!isRecord(column) || !isNonEmptyString(column["name"])) {
      issues.push({ path: columnPath, message: "Column must define a non-empty name." });
      continue;
    }
    const name = column["name"] as string;
    if (names.has(name)) {
      issues.push({
        path: `${columnPath}.name`,
        message: `Column names must be unique: "${name}".`,
      });
    }
    names.add(name);
    if (!scalarTypes.includes(column["type"] as DatabaseScalarType)) {
      issues.push({
        path: `${columnPath}.type`,
        message: `Column type must be one of: ${scalarTypes.join(", ")}.`,
      });
    }
    for (const key of ["nullable", "primaryKey", "unique", "indexed", "generated"]) {
      if (column[key] !== undefined && typeof column[key] !== "boolean") {
        issues.push({
          path: `${columnPath}.${key}`,
          message: `Column ${key} must be a boolean when provided.`,
        });
      }
    }
  }
}

function validateReferences(
  values: unknown,
  columns: Set<string>,
  path: string,
  issues: DatabaseSchemaValidationIssue[],
): void {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push({ path, message: "Referenced columns must contain at least one value." });
    return;
  }
  for (const [index, value] of values.entries()) {
    if (!isNonEmptyString(value)) {
      issues.push({
        path: `${path}[${index}]`,
        message: "Referenced columns must contain non-empty strings.",
      });
    } else if (!columns.has(value)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `Referenced column does not exist: "${value}".`,
      });
    }
  }
}

export function validateDatabaseSchemaDefinition(
  definition: unknown,
): DatabaseSchemaValidationIssue[] {
  const issues: DatabaseSchemaValidationIssue[] = [];
  if (!isRecord(definition)) {
    return [{ path: "schema", message: "Database schema definition must be an object." }];
  }
  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Database schema name must not be empty." });
  }
  if (!isNonEmptyString(definition["version"])) {
    issues.push({ path: "version", message: "Database schema version must not be empty." });
  }
  if (!Array.isArray(definition["tables"])) {
    issues.push({ path: "tables", message: "Database schema tables must be an array." });
    return issues;
  }

  const tableIds = new Set<string>();
  const tableNames = new Set<string>();
  for (const [index, table] of definition["tables"].entries()) {
    const path = `tables[${index}]`;
    if (!isRecord(table) || !isNonEmptyString(table["id"]) || !isNonEmptyString(table["name"])) {
      issues.push({ path, message: "Table must define non-empty id and name values." });
      continue;
    }
    const id = table["id"] as string;
    const name = table["name"] as string;
    if (tableIds.has(id))
      issues.push({ path: `${path}.id`, message: `Table ids must be unique: "${id}".` });
    if (tableNames.has(name))
      issues.push({ path: `${path}.name`, message: `Table names must be unique: "${name}".` });
    tableIds.add(id);
    tableNames.add(name);
    validateColumns(table, path, issues);
  }

  const tables = definition["tables"] as unknown[];
  for (const [tableIndex, table] of tables.entries()) {
    if (!isRecord(table) || !Array.isArray(table["columns"])) continue;
    const columns = new Set(
      table["columns"]
        .filter(isRecord)
        .map((column) => column["name"])
        .filter(isNonEmptyString),
    );
    for (const key of ["indexes", "constraints"] as const) {
      const values = table[key];
      if (values === undefined) continue;
      if (!Array.isArray(values)) {
        issues.push({
          path: `tables[${tableIndex}].${key}`,
          message: `Table ${key} must be an array.`,
        });
        continue;
      }
      const names = new Set<string>();
      for (const [index, value] of values.entries()) {
        const path = `tables[${tableIndex}].${key}[${index}]`;
        if (!isRecord(value) || !isNonEmptyString(value["name"])) {
          issues.push({ path, message: `${key} must define a non-empty name.` });
          continue;
        }
        const name = value["name"] as string;
        if (names.has(name))
          issues.push({ path: `${path}.name`, message: `${key} names must be unique: "${name}".` });
        names.add(name);
        if (key === "indexes") {
          validateReferences(value["columns"], columns, `${path}.columns`, issues);
          if (
            Array.isArray(value["columns"]) &&
            new Set(value["columns"]).size !== value["columns"].length
          ) {
            issues.push({
              path: `${path}.columns`,
              message: "Index columns must not contain duplicates.",
            });
          }
          if (value["unique"] !== undefined && typeof value["unique"] !== "boolean") {
            issues.push({
              path: `${path}.unique`,
              message: "Index unique must be a boolean when provided.",
            });
          }
        } else {
          const type = value["type"];
          if (!["primary-key", "unique", "foreign-key", "check"].includes(type as string)) {
            issues.push({ path: `${path}.type`, message: "Constraint type is not supported." });
          }
          if (type === "check" && !isNonEmptyString(value["expression"])) {
            issues.push({
              path: `${path}.expression`,
              message: "Check constraints need a non-empty expression.",
            });
          }
          if (type !== "check") {
            validateReferences(value["columns"], columns, `${path}.columns`, issues);
            if (
              Array.isArray(value["columns"]) &&
              new Set(value["columns"]).size !== value["columns"].length
            ) {
              issues.push({
                path: `${path}.columns`,
                message: "Constraint columns must not contain duplicates.",
              });
            }
          }
          if (type === "foreign-key") {
            if (!isNonEmptyString(value["referencedTable"]))
              issues.push({
                path: `${path}.referencedTable`,
                message: "Foreign keys need a referenced table.",
              });
            if (
              !Array.isArray(value["referencedColumns"]) ||
              value["referencedColumns"].length === 0
            ) {
              issues.push({
                path: `${path}.referencedColumns`,
                message: "Foreign keys need referenced columns.",
              });
            } else {
              const referencedColumns = value["referencedColumns"] as unknown[];
              for (const [columnIndex, column] of referencedColumns.entries()) {
                if (!isNonEmptyString(column)) {
                  issues.push({
                    path: `${path}.referencedColumns[${columnIndex}]`,
                    message: "Referenced columns must contain non-empty strings.",
                  });
                }
              }
              if (new Set(referencedColumns).size !== referencedColumns.length) {
                issues.push({
                  path: `${path}.referencedColumns`,
                  message: "Referenced columns must not contain duplicates.",
                });
              }
            }
            for (const key of ["onDelete", "onUpdate"]) {
              if (
                value[key] !== undefined &&
                !referentialActions.includes(value[key] as ReferentialAction)
              )
                issues.push({
                  path: `${path}.${key}`,
                  message: `Referential action must be one of: ${referentialActions.join(", ")}.`,
                });
            }
          }
        }
      }
    }
  }
  return issues;
}

function cloneConstraint(constraint: DatabaseConstraintDefinition): DatabaseConstraintDefinition {
  return {
    ...constraint,
    ...("columns" in constraint ? { columns: [...constraint.columns] } : {}),
    ...("referencedColumns" in constraint
      ? { referencedColumns: [...constraint.referencedColumns] }
      : {}),
  } as DatabaseConstraintDefinition;
}

export function defineDatabaseSchema(
  definition: DatabaseSchemaDefinition,
): DatabaseSchemaDefinition {
  const issues = validateDatabaseSchemaDefinition(definition);
  if (issues.length > 0) throw new DatabaseSchemaDefinitionError(issues);

  return {
    name: definition.name,
    version: definition.version,
    tables: [...definition.tables]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((table) => ({
        id: table.id,
        name: table.name,
        columns: [...table.columns]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((column) => ({ ...column })),
        ...(table.indexes
          ? {
              indexes: [...table.indexes]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((index) => ({ ...index, columns: [...index.columns] })),
            }
          : {}),
        ...(table.constraints
          ? {
              constraints: [...table.constraints]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map(cloneConstraint),
            }
          : {}),
      })),
  };
}
