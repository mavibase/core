/** Operations that Mavibase can generate for a model. */
export const crudOperations = [
  "list",
  "get",
  "create",
  "replace",
  "update",
  "delete",
] as const;

export type CrudOperation = (typeof crudOperations)[number];

/** The HTTP method associated with a generated CRUD operation. */
export const crudOperationMethods: Readonly<Record<CrudOperation, "GET" | "POST" | "PUT" | "PATCH" | "DELETE">> = {
  list: "GET",
  get: "GET",
  create: "POST",
  replace: "PUT",
  update: "PATCH",
  delete: "DELETE",
};

export interface CrudOperationConfig {
  list?: boolean;
  get?: boolean;
  create?: boolean;
  replace?: boolean;
  update?: boolean;
  delete?: boolean;
}

export type PaginationStyle = "offset";

export interface CrudPaginationConfig {
  enabled?: boolean;
  style?: PaginationStyle;
  defaultLimit?: number;
  maxLimit?: number;
}

export type CrudFilterOperator =
  | "eq"
  | "contains"
  | "startsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface CrudFilteringConfig {
  enabled?: boolean;
  /** Fields that may be used in generated filters. */
  fields?: readonly string[];
  /** Optional per-field operator allow-list. */
  operators?: Readonly<Record<string, readonly CrudFilterOperator[]>>;
}

export type SortDirection = "asc" | "desc";

export interface CrudSortingConfig {
  enabled?: boolean;
  /** Fields that may be used in generated sorting. */
  fields?: readonly string[];
  defaultField?: string;
  defaultDirection?: SortDirection;
}

/** Declarative configuration for generated model CRUD behavior. */
export interface CrudDefinition {
  enabled?: boolean;
  operations?: CrudOperationConfig;
  pagination?: CrudPaginationConfig;
  filtering?: CrudFilteringConfig;
  sorting?: CrudSortingConfig;
}

export interface CrudValidationIssue {
  path: string;
  message: string;
}

const filterOperators: readonly CrudFilterOperator[] = [
  "eq",
  "contains",
  "startsWith",
  "gt",
  "gte",
  "lt",
  "lte",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateBoolean(
  value: unknown,
  path: string,
  issues: CrudValidationIssue[],
): void {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push({ path, message: "Value must be a boolean when provided." });
  }
}

function validateFieldList(
  value: unknown,
  path: string,
  modelFields: ReadonlySet<string>,
  issues: CrudValidationIssue[],
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Field list must be an array when provided." });
    return [];
  }

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const [index, field] of value.entries()) {
    const fieldPath = `${path}[${index}]`;
    if (typeof field !== "string" || !field.trim()) {
      issues.push({ path: fieldPath, message: "Field name must be a non-empty string." });
      continue;
    }
    if (seen.has(field)) {
      issues.push({ path: fieldPath, message: `Duplicate field: "${field}".` });
      continue;
    }
    seen.add(field);
    fields.push(field);
    if (!modelFields.has(field)) {
      issues.push({ path: fieldPath, message: `Unknown model field: "${field}".` });
    }
  }
  return fields;
}

/** Validate CRUD configuration against the fields available on a model. */
export function validateCrudDefinition(
  value: unknown,
  modelFields: ReadonlySet<string> | readonly string[],
  path = "crud",
): CrudValidationIssue[] {
  const issues: CrudValidationIssue[] = [];
  if (!isRecord(value)) {
    issues.push({ path, message: "CRUD configuration must be an object." });
    return issues;
  }

  const fields = modelFields instanceof Set ? modelFields : new Set(modelFields);
  validateBoolean(value["enabled"], `${path}.enabled`, issues);

  const operations = value["operations"];
  if (operations !== undefined) {
    if (!isRecord(operations)) {
      issues.push({ path: `${path}.operations`, message: "CRUD operations must be an object." });
    } else {
      for (const operation of crudOperations) {
        validateBoolean(operations[operation], `${path}.operations.${operation}`, issues);
      }
    }
  }

  const pagination = value["pagination"];
  if (pagination !== undefined) {
    if (!isRecord(pagination)) {
      issues.push({ path: `${path}.pagination`, message: "Pagination configuration must be an object." });
    } else {
      validateBoolean(pagination["enabled"], `${path}.pagination.enabled`, issues);
      if (pagination["style"] !== undefined && pagination["style"] !== "offset") {
        issues.push({ path: `${path}.pagination.style`, message: `Unsupported pagination style: "${String(pagination["style"])}".` });
      }
      for (const key of ["defaultLimit", "maxLimit"] as const) {
        const limit = pagination[key];
        if (limit !== undefined && (!Number.isInteger(limit) || Number(limit) < 1)) {
          issues.push({ path: `${path}.pagination.${key}`, message: "Pagination limit must be a positive integer." });
        }
      }
      const defaultLimit = pagination["defaultLimit"];
      const maxLimit = pagination["maxLimit"];
      if (
        Number.isInteger(defaultLimit) && Number.isInteger(maxLimit) &&
        Number(defaultLimit) > Number(maxLimit)
      ) {
        issues.push({ path: `${path}.pagination.defaultLimit`, message: "Default pagination limit cannot exceed the maximum limit." });
      }
    }
  }

  const filtering = value["filtering"];
  if (filtering !== undefined) {
    if (!isRecord(filtering)) {
      issues.push({ path: `${path}.filtering`, message: "Filtering configuration must be an object." });
    } else {
      validateBoolean(filtering["enabled"], `${path}.filtering.enabled`, issues);
      if (filtering["fields"] !== undefined) {
        validateFieldList(filtering["fields"], `${path}.filtering.fields`, fields, issues);
      }
      const operators = filtering["operators"];
      if (operators !== undefined) {
        if (!isRecord(operators)) {
          issues.push({ path: `${path}.filtering.operators`, message: "Filter operators must be an object." });
        } else {
          for (const [field, configured] of Object.entries(operators)) {
            if (!fields.has(field)) {
              issues.push({ path: `${path}.filtering.operators.${field}`, message: `Unknown model field: "${field}".` });
            }
            if (!Array.isArray(configured) || configured.some((operator) => !filterOperators.includes(operator as CrudFilterOperator))) {
              issues.push({ path: `${path}.filtering.operators.${field}`, message: "Filter operators must contain only supported operator names." });
            }
          }
        }
      }
    }
  }

  const sorting = value["sorting"];
  if (sorting !== undefined) {
    if (!isRecord(sorting)) {
      issues.push({ path: `${path}.sorting`, message: "Sorting configuration must be an object." });
    } else {
      validateBoolean(sorting["enabled"], `${path}.sorting.enabled`, issues);
      const sortingFields = sorting["fields"] === undefined
        ? undefined
        : validateFieldList(sorting["fields"], `${path}.sorting.fields`, fields, issues);
      const allowedSortingFields = new Set(sortingFields ?? fields);
      const defaultField = sorting["defaultField"];
      if (defaultField !== undefined && (typeof defaultField !== "string" || !allowedSortingFields.has(defaultField))) {
        issues.push({ path: `${path}.sorting.defaultField`, message: `Default sort field must be included in the allowed sorting fields.` });
      }
      const direction = sorting["defaultDirection"];
      if (direction !== undefined && direction !== "asc" && direction !== "desc") {
        issues.push({ path: `${path}.sorting.defaultDirection`, message: `Invalid sort direction: "${String(direction)}".` });
      }
    }
  }

  return issues;
}

export function isCrudOperation(value: unknown): value is CrudOperation {
  return typeof value === "string" && crudOperations.includes(value as CrudOperation);
}
