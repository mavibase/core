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

export function isCrudOperation(value: unknown): value is CrudOperation {
  return typeof value === "string" && crudOperations.includes(value as CrudOperation);
}
