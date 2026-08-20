import type { ApplicationGraph } from "@mavibase/application-graph";

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
}

export interface ModelTestsTemplateData {
  models: ModelTestTemplateData[];
}

export const modelTestsTemplate = defineTemplate<ModelTestsTemplateData>(
  ({ models }) => {
    const lines = [
      ...models.flatMap((model) => [
        `import { ${model.name}Model } from "./model-metadata.js";`,
        `import { ${model.name}Schema } from "./schemas.js";`,
        "",
        `export const ${model.name}ModelTests = {`,
        `  model: ${model.name}Model,`,
        `  schema: ${model.name}Schema,`,
        `  fields: ${JSON.stringify(model.fields)} as const,`,
        `  requiredFields: ${JSON.stringify(model.requiredFields)} as const,`,
        `  optionalFields: ${JSON.stringify(model.optionalFields)} as const,`,
        `  nullableFields: ${JSON.stringify(model.nullableFields)} as const,`,
        `  relationshipNames: ${JSON.stringify(model.relationshipNames)} as const,`,
        "} as const;",
        "",
      ]),
    ];
    return lines.join("\n");
  },
  { name: "model-tests" },
);

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
      return {
        name: model.name,
        fields,
        requiredFields: fields.filter((name) => model.fields[name]?.required === true),
        optionalFields: fields.filter((name) => model.fields[name]?.optional === true),
        nullableFields: fields.filter((name) => model.fields[name]?.nullable === true),
        relationshipNames: [...(relationships.get(model.name) ?? [])].sort((left, right) =>
          left.localeCompare(right),
        ),
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
