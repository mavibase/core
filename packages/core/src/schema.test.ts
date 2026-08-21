import { describe, expect, it } from "vitest";

import { validateSchemaExpression } from "./schema.js";

describe("schema expressions", () => {
  it("accepts composed declarative expressions", () => {
    expect(
      validateSchemaExpression({
        kind: "intersection",
        members: [
          { kind: "model", model: "User" },
          { kind: "array", item: { kind: "reference", schema: { name: "UserPayload" } } },
        ],
      }),
    ).toEqual([]);
  });

  it("reports malformed composition nodes", () => {
    expect(validateSchemaExpression({ kind: "union", members: [{ kind: "model", model: "User" }] })).toEqual([
      "schema.members must contain at least two schema expressions.",
    ]);
  });
});
