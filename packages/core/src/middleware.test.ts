import { describe, expect, it } from "vitest";

import { defineMiddleware, defineRoute } from "./index.js";

describe("middleware definitions", () => {
  it("preserves middleware pipeline order and metadata", () => {
    expect(
      defineRoute({
        name: "users.list",
        method: "GET",
        path: "/users",
        middleware: [
          defineMiddleware({ name: "auth", phase: "before" }),
          { name: "audit", phase: "after", options: { event: "users.list" } },
        ],
      }).middleware,
    ).toEqual([
      { id: "auth", name: "auth", phase: "before" },
      { id: "audit", name: "audit", phase: "after", options: { event: "users.list" } },
    ]);
  });

  it("rejects invalid and duplicate middleware", () => {
    expect(() => defineMiddleware({ name: "not valid" })).toThrow("Invalid middleware name");
    expect(() =>
      defineRoute({
        name: "users.list",
        method: "GET",
        path: "/users",
        middleware: [{ name: "auth" }, { id: "auth", name: "audit" }],
      }),
    ).toThrow("Duplicate route middleware");
  });
});
