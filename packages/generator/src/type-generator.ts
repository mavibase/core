import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { modelTemplateData, type ModelsTemplateData } from "./model-generator.js";
import { defineTemplate } from "./template.js";

export type TypeTemplateData = ModelsTemplateData;

export const typesTemplate = defineTemplate<TypeTemplateData>(
  ({ models }) =>
    models
      .map((model) => {
        const lines = [`export type ${model.name} = {`];

        for (const field of model.fields) {
          const readonly = field.readonly ? "readonly " : "";
          const optional = field.optional ? "?" : "";
          const nullable = field.nullable ? " | null" : "";
          lines.push(`  ${readonly}${field.name}${optional}: ${field.type}${nullable};`);
        }

        lines.push("};");
        return lines.join("\n");
      })
      .join("\n\n") + "\n",
  { name: "types" },
);

export function typeTemplateData(graph: ApplicationGraph): TypeTemplateData {
  return modelTemplateData(graph);
}

export function generateTypes(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = typeTemplateData(graph);
  if (data.models.length === 0) {
    return undefined;
  }

  return {
    path: "types.ts",
    content: typesTemplate.render(data),
  };
}
