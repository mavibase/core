import { describe, expect, it } from "vitest";
import {
  crudOperationMethods,
  crudOperations,
  defineModel,
  isCrudOperation,
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
});
