import type { ApplicationGraph } from "@mavibase/application-graph";
import type { SemanticType } from "@mavibase/core";

import type { GeneratedFile } from "./index.js";
import { modelMetadataTemplateData } from "./model-generator.js";
import { relationshipTemplateData } from "./relationship-generator.js";
import { defineTemplate } from "./template.js";

export interface ModelTestTemplateData {
  name: string;
  fields: string[];
  requiredFields: string[];
  optionalFields: string[];
  nullableFields: string[];
  relationshipNames: string[];
  relationshipCollections: Record<string, boolean>;
  validExample: string;
  invalidExample: string;
  canAssertValidSchema: boolean;
  canAssertInvalidSchema: boolean;
}

export interface ModelTestsTemplateData {
  models: ModelTestTemplateData[];
}

export const modelTestsTemplate = defineTemplate<ModelTestsTemplateData>(
  ({ models }) => {
    const lines = [
      "function assertModelTest(condition: boolean, message: string): void {",
      "  if (!condition) throw new Error(message);",
      "}",
      "",
      ...models.flatMap((model) => [
        `import { ${model.name}Model } from "./model-metadata.js";`,
        `import { ${model.name}Schema } from "./schemas.js";`,
        ...(model.relationshipNames.length === 0
          ? []
          : [`import { ${model.name}Relationships } from "./relationships.js";`]),
        "",
        `export const ${model.name}ModelTests = {`,
        `  model: ${model.name}Model,`,
        `  schema: ${model.name}Schema,`,
        `  fields: ${JSON.stringify(model.fields)} as const,`,
        `  requiredFields: ${JSON.stringify(model.requiredFields)} as const,`,
        `  optionalFields: ${JSON.stringify(model.optionalFields)} as const,`,
        `  nullableFields: ${JSON.stringify(model.nullableFields)} as const,`,
        `  relationshipNames: ${JSON.stringify(model.relationshipNames)} as const,`,
        "  run(): void {",
        `    assertModelTest(JSON.stringify(Object.keys(${model.name}Model.fields).sort()) === ${JSON.stringify(JSON.stringify(model.fields.slice().sort()))}, "${model.name} metadata fields are inconsistent.");`,
        ...(model.relationshipNames.length === 0
          ? []
          : [`    assertModelTest(JSON.stringify(Object.keys(${model.name}Relationships).sort()) === ${JSON.stringify(JSON.stringify(model.relationshipNames.slice().sort()))}, "${model.name} relationship metadata is inconsistent.");`]),
        ...(model.canAssertValidSchema
          ? [`    assertModelTest(${model.name}Schema.safeParse(${model.validExample}).success, "${model.name} schema rejected its valid example.");`]
          : []),
        ...(model.canAssertInvalidSchema
          ? [`    assertModelTest(!${model.name}Schema.safeParse(${model.invalidExample}).success, "${model.name} schema accepted its invalid example.");`]
          : []),
        "  },",
        "} as const;",
        "",
      ]),
      "export function runGeneratedModelTests(): void {",
      ...models.map((model) => `  ${model.name}ModelTests.run();`),
      "}",
      "",
      "runGeneratedModelTests();",
      "",
    ];
    return lines.join("\n");
  },
  { name: "model-tests" },
);

function valueLiteral(type: SemanticType): string {
  if (typeof type !== "string") {
    if (type.kind === "enum") return JSON.stringify(type.values[0]);
    return `[]`;
  }
  if (type === "string" || type === "text") return JSON.stringify("mavibase-test");
  if (type === "integer" || type === "float" || type === "decimal") return "1";
  if (type === "boolean") return "true";
  if (type === "date" || type === "datetime") return JSON.stringify("2024-01-01");
  if (type === "uuid") return JSON.stringify("00000000-0000-4000-8000-000000000000");
  if (type === "bigint") return "1n";
  return "{}";
}

function invalidValueLiteral(type: SemanticType): string | undefined {
  if (typeof type !== "string") {
    if (type.kind === "enum") return JSON.stringify("__invalid_enum__");
    return "{}";
  }
  if (type === "string" || type === "text") return "123";
  if (type === "integer" || type === "float" || type === "decimal") return JSON.stringify("invalid");
  if (type === "boolean") return JSON.stringify("invalid");
  if (type === "date" || type === "datetime") return JSON.stringify("invalid-date");
  if (type === "uuid") return JSON.stringify("invalid-uuid");
  if (type === "bigint") return JSON.stringify("invalid");
  return undefined;
}

function exampleObject(
  fields: Record<string, { type: SemanticType; optional: boolean }>,
  invalid = false,
): { value: string; canAssert: boolean } {
  const entries: string[] = [];
  let canAssert = false;
  for (const [name, field] of Object.entries(fields).sort(([left], [right]) => left.localeCompare(right))) {
    if (field.optional) continue;
    const value = invalid ? invalidValueLiteral(field.type) : valueLiteral(field.type);
    if (value === undefined) continue;
    if (invalid) {
      canAssert = true;
      entries.push(`${JSON.stringify(name)}: ${value}`);
      break;
    }
    entries.push(`${JSON.stringify(name)}: ${value}`);
  }
  return { value: `{ ${entries.join(", ")} }`, canAssert };
}

export function modelTestsTemplateData(graph: ApplicationGraph): ModelTestsTemplateData {
  const metadata = modelMetadataTemplateData(graph);
  const relationships = new Map(
    relationshipTemplateData(graph).models.map((model) => [
      model.name,
      model.relationships.map((relationship) => relationship.name),
    ]),
  );

  return {
    models: metadata.models.map((model) => {
      const fields = Object.entries(model.fields).map(([name]) => name);
      const fieldDefinitions = Object.fromEntries(
        Object.entries(model.fields).map(([name, field]) => [name, { type: field.type, optional: field.optional }]),
      );
      const validExample = exampleObject(fieldDefinitions);
      const invalidExample = exampleObject(fieldDefinitions, true);
      const relationshipModel = relationshipTemplateData(graph).models.find(
        (relationshipModel) => relationshipModel.name === model.name,
      );
      const relationshipCollections = Object.fromEntries(
        (relationshipModel?.relationships ?? []).map((relationship) => [
          relationship.name,
          relationship.cardinality === "many",
        ]),
      );
      return {
        name: model.name,
        fields,
        requiredFields: fields.filter((name) => model.fields[name]?.required === true),
        optionalFields: fields.filter((name) => model.fields[name]?.optional === true),
        nullableFields: fields.filter((name) => model.fields[name]?.nullable === true),
        relationshipNames: [...(relationships.get(model.name) ?? [])].sort((left, right) =>
          left.localeCompare(right),
        ),
        relationshipCollections,
        validExample: validExample.value,
        invalidExample: invalidExample.value,
        canAssertValidSchema:
          Object.values(relationshipCollections).every((collection) => collection) &&
          validExample.canAssert,
        canAssertInvalidSchema: invalidExample.canAssert,
      };
    }),
  };
}

export function generateModelTests(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = modelTestsTemplateData(graph);
  if (data.models.length === 0) return undefined;

  return {
    path: "model-tests.ts",
    content: modelTestsTemplate.render(data),
  };
}
