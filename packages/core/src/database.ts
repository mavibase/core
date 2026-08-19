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
          if (type !== "check")
            validateReferences(value["columns"], columns, `${path}.columns`, issues);
          if (type === "foreign-key") {
            if (!isNonEmptyString(value["referencedTable"]))
              issues.push({
                path: `${path}.referencedTable`,
                message: "Foreign keys need a referenced table.",
              });
            if (
              !Array.isArray(value["referencedColumns"]) ||
              value["referencedColumns"].length === 0
            )
              issues.push({
                path: `${path}.referencedColumns`,
                message: "Foreign keys need referenced columns.",
              });
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
