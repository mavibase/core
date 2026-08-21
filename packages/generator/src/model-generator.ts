import type { SemanticType } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { normalizeModelContexts } from "./model-context.js";

export interface ModelFieldTemplateData {
  name: string;
  type: string;
  optional: boolean;
  nullable: boolean;
  readonly: boolean;
}

export interface ModelTemplateData {
  name: string;
  fields: ModelFieldTemplateData[];
}

export interface ModelsTemplateData {
  models: ModelTemplateData[];
}

export interface ModelMetadataFieldTemplateData {
  type: SemanticType;
  required: boolean;
  optional: boolean;
  nullable: boolean;
  unique: boolean;
  indexed: boolean;
  primary: boolean;
  generated: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  defaultValue?: unknown;
}

export interface ModelMetadataTemplateData {
  models: {
    name: string;
    table: string;
    fields: Record<string, ModelMetadataFieldTemplateData>;
  }[];
}

export const modelsTemplate = defineTemplate<ModelsTemplateData>(
  ({ models }) =>
    models
      .map((model) => {
        const lines = [`export interface ${model.name} {`];

        for (const field of model.fields) {
          const readonly = field.readonly ? "readonly " : "";
          const optional = field.optional ? "?" : "";
          const nullable = field.nullable ? " | null" : "";
          lines.push(`  ${readonly}${field.name}${optional}: ${field.type}${nullable};`);
        }

        lines.push("}");
        return lines.join("\n");
      })
      .join("\n\n") + "\n",
  { name: "models" },
);

export const modelMetadataTemplate = defineTemplate<ModelMetadataTemplateData>(
  ({ models }) =>
    models
      .map((model) => {
        const lines = [
          `export const ${model.name}Model = {`,
          `  name: ${JSON.stringify(model.name)},`,
          `  table: ${JSON.stringify(model.table)},`,
          "  fields: {",
        ];
        for (const [name, field] of Object.entries(model.fields)) {
          const values = [
            `type: ${JSON.stringify(field.type)}`,
            `required: ${field.required}`,
            `optional: ${field.optional}`,
            `nullable: ${field.nullable}`,
            `unique: ${field.unique}`,
            `indexed: ${field.indexed}`,
            `primary: ${field.primary}`,
            `generated: ${field.generated}`,
            `readOnly: ${field.readOnly}`,
            `writeOnly: ${field.writeOnly}`,
            ...(field.defaultValue === undefined
              ? []
              : [`defaultValue: ${JSON.stringify(field.defaultValue)}`]),
          ];
          lines.push(`    ${JSON.stringify(name)}: { ${values.join(", ")} },`);
        }
        lines.push("  },", "} as const;");
        return lines.join("\n");
      })
      .join("\n\n") + (models.length > 0 ? "\n" : ""),
  { name: "model-metadata" },
);

export function modelTemplateData(graph: ApplicationGraph): ModelsTemplateData {
  const models = normalizeModelContexts(graph).map((model) => ({
    name: model.name,
    fields: [
      ...model.fields.map((field) => ({
        name: field.name,
        type: field.typescriptType,
        optional: field.optional,
        nullable: field.nullable,
        readonly: field.readOnly,
      })),
      ...model.relationships.map((relationship) => ({
        name: relationship.name,
        type: relationship.collection ? `${relationship.target}[]` : relationship.target,
        optional: false,
        nullable: false,
        readonly: false,
      })),
    ].sort((left, right) => left.name.localeCompare(right.name)),
  } satisfies ModelTemplateData));

  return { models };
}

export function modelMetadataTemplateData(graph: ApplicationGraph): ModelMetadataTemplateData {
  return {
    models: normalizeModelContexts(graph).map((model) => ({
      name: model.name,
      table: model.table,
      fields: Object.fromEntries(
        model.fields.map((field) => [
          field.name,
          {
            type: field.semanticType,
            required: field.required,
            optional: field.optional,
            nullable: field.nullable,
            unique: field.unique,
            indexed: field.indexed,
            primary: field.primary,
            generated: field.generated,
            readOnly: field.readOnly,
            writeOnly: field.writeOnly,
            ...(field.defaultValue === undefined ? {} : { defaultValue: field.defaultValue }),
          } satisfies ModelMetadataFieldTemplateData,
        ]),
      ),
    })),
  };
}

export function generateModels(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = modelTemplateData(graph);
  if (data.models.length === 0) {
    return undefined;
  }

  return {
    path: "models.ts",
    content: modelsTemplate.render(data),
  };
}

export function generateModelMetadata(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = modelMetadataTemplateData(graph);
  if (data.models.length === 0) return undefined;
  return {
    path: "model-metadata.ts",
    content: modelMetadataTemplate.render(data),
  };
}
