import { describe, expect, it } from "vitest";

import { defineApp, defineRoute } from "./index.js";

describe("route definitions", () => {
  it("defines routes with stable metadata", () => {
    expect(
      defineRoute({
        name: "users.list",
        method: "GET",
        path: "/users",
        description: "List users",
      }),
    ).toEqual({
      id: "get:users.list",
      name: "users.list",
      method: "GET",
      path: "/users",
      description: "List users",
    });
  });

  it("rejects invalid route definitions", () => {
    expect(() => defineRoute({ name: "", method: "GET", path: "/users" })).toThrow(
      "Route name must not be empty",
    );
    expect(() => defineRoute({ name: "users", method: "GET", path: "users" })).toThrow(
      "Invalid route path",
    );
  });

  it("validates duplicate route signatures", () => {
    expect(() =>
      defineApp({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        routes: [
          defineRoute({ name: "users.list", method: "GET", path: "/users" }),
          defineRoute({ name: "users.all", method: "GET", path: "/users" }),
        ],
      }),
    ).toThrow("Duplicate route method and path");
  });
});
