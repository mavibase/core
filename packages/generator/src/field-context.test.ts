import { describe, expect, it } from "vitest";

import { field } from "@mavibase/core";

import { generatorFieldContext, normalizeField } from "./field-context.js";

describe("field context", () => {
  it("normalizes modifiers and maps every supported semantic type", () => {
    const cases = [
      ["string", "string", "z.string()", "VARCHAR", { type: "string" }],
      ["text", "string", "z.string()", "TEXT", { type: "string" }],
      ["integer", "number", "z.number().int()", "INTEGER", { type: "integer" }],
      ["float", "number", "z.number()", "DOUBLE PRECISION", { type: "number", format: "float" }],
      ["decimal", "number", "z.number()", "DECIMAL", { type: "number" }],
      ["boolean", "boolean", "z.boolean()", "BOOLEAN", { type: "boolean" }],
      ["date", "Date", "z.coerce.date()", "DATE", { type: "string", format: "date" }],
      ["datetime", "Date", "z.coerce.date()", "TIMESTAMP", { type: "string", format: "date-time" }],
      ["uuid", "string", "z.string().uuid()", "UUID", { type: "string", format: "uuid" }],
      ["json", "unknown", "z.unknown()", "JSONB", {}],
      ["bigint", "bigint", "z.bigint()", "BIGINT", { type: "integer", format: "int64" }],
    ] as const;

    for (const [type, typescriptType, zodExpression, postgresType, openApiSchema] of cases) {
      const result = generatorFieldContext(
        { type, modifiers: { optional: true, nullable: true, readOnly: true, writeOnly: true } },
        "models.User.fields.value",
      );
      expect(result.valid).toBe(true);
      expect(result.value).toMatchObject({
        name: "value",
        semanticType: type,
        typescriptType,
        zodExpression,
        postgresType,
        openApiSchema,
        optional: true,
        nullable: true,
        readOnly: true,
        writeOnly: true,
      });
    }
  });

  it("maps enum and array types consistently", () => {
    const result = generatorFieldContext(
      { type: { kind: "array", element: { kind: "enum", values: ["draft", "published"] } } },
      "models.Post.fields.statuses",
    );
    expect(result).toEqual({
      valid: true,
      value: {
        name: "statuses",
        semanticType: { kind: "array", element: { kind: "enum", values: ["draft", "published"] } },
        constraints: [],
        typescriptType: 'Array<"draft" | "published">',
        zodExpression: 'z.array(z.enum(["draft","published"]))',
        postgresType: "TEXT[]",
        openApiSchema: { type: "array", items: { type: "string", enum: ["draft", "published"] } },
        optional: false,
        nullable: false,
        readOnly: false,
        writeOnly: false,
      },
      diagnostics: [],
    });
  });

  it("rejects invalid semantic types and conflicting modifiers", () => {
    const result = normalizeField(
      { type: "not-supported" as never, modifiers: { required: true, optional: true } },
      "models.User.fields.name",
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "field.type.invalid",
      "field.modifiers.conflict",
    ]);
  });

  it("accepts structured constraints and rejects unsupported legacy expressions", () => {
    const structured = generatorFieldContext(
      {
        type: "string",
        constraints: [{ kind: "minLength", value: 3 }, { kind: "email" }],
      },
      "models.User.fields.email",
    );
    expect(structured.valid).toBe(true);
    expect(structured.value?.constraints).toEqual([
      { kind: "minLength", value: 3 },
      { kind: "email" },
    ]);

    const unsupported = generatorFieldContext(
      { type: "string", validation: "z.string().transform(custom)" },
      "models.User.fields.email",
    );
    expect(unsupported.valid).toBe(false);
    expect(unsupported.diagnostics[0]?.code).toBe("field.validation.unsupported");
  });

  it("creates serializable enum and array fields", () => {
    expect(field.enum(["draft", "published"]).type).toEqual({
      kind: "enum",
      values: ["draft", "published"],
    });
    expect(field.array(field.string()).type).toEqual({ kind: "array", element: "string" });
  });
});
