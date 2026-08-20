import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { modelTemplateData } from "./model-generator.js";
import { relationshipTemplateData } from "./relationship-generator.js";
import { defineTemplate } from "./template.js";

export interface QueryHelperModelTemplateData {
  name: string;
  hasId: boolean;
  relationshipNames: string[];
}

export interface QueryHelpersTemplateData {
  models: QueryHelperModelTemplateData[];
}

export const queryHelpersTemplate = defineTemplate<QueryHelpersTemplateData>(
  ({ models }) => {
    const imports = models.map((model) => `import type { ${model.name} } from "./types.js";`);
    const declarations = models.map((model) => {
      const idType = model.hasId ? `${model.name}["id"]` : "string | number";
      const lines = [
        `export type ${model.name}Id = ${idType};`,
        "",
        `export interface ${model.name}QueryOptions {`,
        `  where?: Partial<${model.name}>;`,
        ...(model.relationshipNames.length === 0
          ? []
          : [
              `  with?: readonly (${model.relationshipNames.map((name) => JSON.stringify(name)).join(" | ")})[];`,
            ]),
        "  limit?: number;",
        "  offset?: number;",
        "}",
        "",
        `export interface ${model.name}QueryHelpers {`,
        `  findById(id: ${model.name}Id): Promise<${model.name} | undefined>;`,
        `  findMany(options?: ${model.name}QueryOptions): Promise<${model.name}[]>;`,
        `  create(input: ${model.name}): Promise<${model.name}>;`,
        `  update(id: ${model.name}Id, input: Partial<${model.name}>): Promise<${model.name}>;`,
        `  delete(id: ${model.name}Id): Promise<void>;`,
        "}",
      ];
      return lines.join("\n");
    });

    return (
      [
        ...imports,
        ...(imports.length > 0 && declarations.length > 0 ? [""] : []),
        ...declarations,
      ].join("\n\n") + (declarations.length > 0 ? "\n" : "")
    );
  },
  { name: "query-helpers" },
);

export function queryHelpersTemplateData(graph: ApplicationGraph): QueryHelpersTemplateData {
  const relationships = new Map(
    relationshipTemplateData(graph).models.map((model) => [
      model.name,
      model.relationships.map((relationship) => relationship.name),
    ]),
  );

  return {
    models: modelTemplateData(graph)
      .models.map((model) => ({
        name: model.name,
        hasId: model.fields.some((field) => field.name === "id"),
        relationshipNames: [...(relationships.get(model.name) ?? [])].sort((left, right) =>
          left.localeCompare(right),
        ),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function generateQueryHelpers(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = queryHelpersTemplateData(graph);
  if (data.models.length === 0) return undefined;

  return {
    path: "query-helpers.ts",
    content: queryHelpersTemplate.render(data),
  };
}
