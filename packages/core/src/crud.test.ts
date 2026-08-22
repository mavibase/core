import { describe, expect, it } from "vitest";
import {
  crudOperationMethods,
  crudOperations,
  defineModel,
  isCrudOperation,
  validateDefinition,
  validateCrudDefinition,
  type CrudDefinition,
} from "./index.js";

describe("CRUD definition contracts", () => {
  it("exports stable CRUD operations and HTTP mappings", () => {
    expect(crudOperations).toEqual(["list", "get", "create", "replace", "update", "delete"]);
    expect(crudOperationMethods).toEqual({
      list: "GET",
      get: "GET",
      create: "POST",
      replace: "PUT",
      update: "PATCH",
      delete: "DELETE",
    });
  });

  it("recognizes only supported CRUD operation names", () => {
    expect(isCrudOperation("list")).toBe(true);
    expect(isCrudOperation("update")).toBe(true);
    expect(isCrudOperation("publish")).toBe(false);
    expect(isCrudOperation(undefined)).toBe(false);
  });

  it("preserves CRUD configuration when defining a model", () => {
    const crud: CrudDefinition = {
      enabled: true,
      operations: { list: true, get: true, create: true, update: true, delete: true },
      pagination: { enabled: true, style: "offset", defaultLimit: 20, maxLimit: 100 },
      filtering: { enabled: true, fields: ["email"] },
      sorting: { enabled: true, fields: ["createdAt"], defaultField: "createdAt", defaultDirection: "desc" },
    };

    expect(defineModel({ name: "User", crud })).toMatchObject({ name: "User", crud });
  });

  it("accepts valid pagination, filtering, and sorting configuration", () => {
    expect(validateCrudDefinition({
      enabled: true,
      operations: { list: true, get: true, create: true, update: true, delete: true },
      pagination: { enabled: true, style: "offset", defaultLimit: 20, maxLimit: 100 },
      filtering: { enabled: true, fields: ["email"], operators: { email: ["eq", "contains"] } },
      sorting: { enabled: true, fields: ["createdAt"], defaultField: "createdAt", defaultDirection: "desc" },
    }, new Set(["email", "createdAt"]))).toEqual([]);
  });

  it("allows filtering and sorting without explicit field lists", () => {
    expect(validateCrudDefinition({
      filtering: { enabled: true },
      sorting: { enabled: true, defaultField: "createdAt" },
    }, new Set(["email", "createdAt"]))).toEqual([]);
  });

  it("reports invalid CRUD configuration with precise paths", () => {
    const issues = validateCrudDefinition({
      operations: { list: "yes" },
      pagination: { style: "cursor", defaultLimit: 0, maxLimit: 10 },
      filtering: { fields: ["missing"], operators: { email: ["rawSql"] } },
      sorting: { fields: ["createdAt"], defaultField: "missing", defaultDirection: "sideways" },
    }, new Set(["email", "createdAt"]), "models.User.crud");

    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "models.User.crud.operations.list",
      "models.User.crud.pagination.style",
      "models.User.crud.pagination.defaultLimit",
      "models.User.crud.filtering.fields[0]",
      "models.User.crud.filtering.operators.email",
      "models.User.crud.sorting.defaultField",
      "models.User.crud.sorting.defaultDirection",
    ]));
  });

  it("validates CRUD configuration through application definitions", () => {
    const issues = validateDefinition({
      name: "Example",
      version: "0.1.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      models: [{
        id: "user",
        name: "User",
        fields: { email: { type: "string" } },
        crud: { filtering: { fields: ["unknown"] } },
      }],
    });

    expect(issues).toContainEqual({
      path: "models.User.crud.filtering.fields[0]",
      message: 'Unknown model field: "unknown".',
    });
  });
});
