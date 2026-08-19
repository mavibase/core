import { describe, expect, it } from "vitest";

import { defineTemplate, renderTemplate, TemplateError } from "./template.js";

describe("template", () => {
  it("defines and renders a template with structured data", () => {
    const template = defineTemplate<{ name: string; fields: string[] }>(
      ({ name, fields }) =>
        [`export interface ${name} {`, ...fields.map((field) => `  ${field}: string;`), "}"].join(
          "\n",
        ),
      { name: "interface" },
    );

    expect(template.name).toBe("interface");
    expect(renderTemplate(template, { name: "User", fields: ["id", "email"] })).toBe(
      "export interface User {\n  id: string;\n  email: string;\n}",
    );
  });

  it("produces deterministic output for repeated renders", () => {
    const template = defineTemplate<{ values: string[] }>(({ values }) => values.join("\n"));
    const data = { values: ["first", "second"] };

    expect(template.render(data)).toBe(template.render(data));
  });

  it("normalizes line endings without changing template content", () => {
    const template = defineTemplate(() => "first\r\nsecond\rthird");

    expect(template.render(undefined)).toBe("first\nsecond\nthird");
  });

  it("supports reusable templates with different valid inputs", () => {
    const template = defineTemplate<{ value: string }>(({ value }) => `const value = "${value}";`);

    expect(template.render({ value: "one" })).toBe('const value = "one";');
    expect(template.render({ value: "two" })).toBe('const value = "two";');
  });

  it("reports invalid data through the template error", () => {
    const template = defineTemplate<{ name: string }>(({ name }) => `Hello ${name}`, {
      name: "greeting",
      validate: (data) => {
        if (!data.name) throw new Error("name is required");
      },
    });

    expect(() => template.render({ name: "" })).toThrow(TemplateError);
    expect(() => template.render({ name: "" })).toThrow(
      'Template "greeting" failed: name is required.',
    );
  });

  it("reports renderer failures consistently", () => {
    const template = defineTemplate(
      () => {
        throw new Error("render failed");
      },
      { name: "broken" },
    );

    expect(() => template.render(undefined)).toThrowError(
      'Template "broken" failed: render failed.',
    );
  });
});
