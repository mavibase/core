import { describe, expect, it } from "vitest";

import { defineResponse, defineRoute } from "./index.js";

describe("route responses", () => {
  it("defines response status and schema metadata", () => {
    expect(
      defineResponse({
        status: 200,
        description: "The user",
        schema: "UserSchema",
        contentType: "application/json",
      }),
    ).toEqual({
      status: 200,
      description: "The user",
      schema: "UserSchema",
      contentType: "application/json",
    });
  });

  it("rejects invalid and duplicate response definitions", () => {
    expect(() => defineResponse({ status: 99 })).toThrow("Invalid response status");
    expect(() => defineResponse({ status: 200, schema: "not-valid.schema" })).toThrow(
      "Invalid response schema reference",
    );
    expect(() =>
      defineRoute({
        name: "users.list",
        method: "GET",
        path: "/users",
        responses: [defineResponse({ status: 200 }), defineResponse({ status: 200 })],
      }),
    ).toThrow("Duplicate route response status");
  });
});
