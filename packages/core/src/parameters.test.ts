import { describe, expect, it } from "vitest";

import { defineParameter, defineRoute, routePathParameterNames } from "./index.js";

describe("route parameters", () => {
  it("defines path, query, header, and body parameters", () => {
    expect(defineParameter({ name: "id", location: "path", type: "uuid" })).toEqual({
      name: "id",
      location: "path",
      required: true,
      type: "uuid",
    });
    expect(defineParameter({ name: "limit", location: "query", type: "integer" }).required).toBe(
      false,
    );
  });

  it("extracts supported path parameter syntax", () => {
    expect(routePathParameterNames("/users/:userId/posts/{postId}")).toEqual(["userId", "postId"]);
  });

  it("validates path coverage and body cardinality", () => {
    expect(() =>
      defineRoute({
        name: "users.get",
        method: "GET",
        path: "/users/:id",
        parameters: [defineParameter({ name: "other", location: "path" })],
      }),
    ).toThrow("Path parameter");
    expect(() =>
      defineRoute({
        name: "users.create",
        method: "POST",
        path: "/users",
        parameters: [
          defineParameter({ name: "first", location: "body" }),
          defineParameter({ name: "second", location: "body" }),
        ],
      }),
    ).toThrow("at most one body parameter");
  });
});
