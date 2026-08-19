import type { FieldModifiers, FieldType } from "@mavibase/core";
import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

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
  type: string;
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

const fieldTypeMap: Readonly<Record<FieldType, string>> = {
  string: "string",
  integer: "number",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  uuid: "string",
  datetime: "Date",
  json: "unknown",
};

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

function fieldType(type: unknown): string {
  if (typeof type !== "string" || !(type in fieldTypeMap)) {
    return "unknown";
  }

  return fieldTypeMap[type as FieldType];
}

function modifiers(data: unknown): FieldModifiers {
  if (!data || typeof data !== "object") {
    return {};
  }

  return data as FieldModifiers;
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function modelFields(graph: ApplicationGraph, model: GraphNode): ModelFieldTemplateData[] {
  const fields = graph.edges
    .filter((edge) => edge.from === model.id && edge.type === "has-field")
    .map((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is GraphNode => node?.type === "field")
    .map((node) => {
      const fieldName = nodeName(node);
      if (!fieldName) {
        return undefined;
      }

      const fieldModifiers = modifiers(node.data?.["modifiers"]);
      return {
        name: fieldName,
        type: fieldType(node.data?.["type"]),
        optional: fieldModifiers.optional === true,
        nullable: fieldModifiers.nullable === true,
        readonly: fieldModifiers.readOnly === true,
      } satisfies ModelFieldTemplateData;
    })
    .filter((field): field is ModelFieldTemplateData => field !== undefined);

  const relationships = graph.edges
    .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
    .map((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is GraphNode => node?.type === "relationship")
    .map((node): ModelFieldTemplateData | undefined => {
      const name = nodeName(node);
      const target = node.data?.["model"];
      const relationshipType = node.data?.["type"];

      if (!name || typeof target !== "string" || !target.trim()) {
        return undefined;
      }

      const isCollection =
        relationshipType === "one-to-many" || relationshipType === "many-to-many";
      return {
        name,
        type: isCollection ? `${target}[]` : target,
        optional: false,
        nullable: false,
        readonly: false,
      };
    })
    .filter((field): field is ModelFieldTemplateData => field !== undefined);

  return [...fields, ...relationships].sort((left, right) => left.name.localeCompare(right.name));
}

export function modelTemplateData(graph: ApplicationGraph): ModelsTemplateData {
  const models = graph.nodes
    .filter((node) => node.type === "model")
    .map((node) => {
      const name = nodeName(node) ?? node.id;
      return { name, fields: modelFields(graph, node) } satisfies ModelTemplateData;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return { models };
}

function modelMetadataFields(
  graph: ApplicationGraph,
  model: GraphNode,
): Record<string, ModelMetadataFieldTemplateData> {
  const fields = graph.edges
    .filter((edge) => edge.from === model.id && edge.type === "has-field")
    .map((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is GraphNode => node?.type === "field")
    .map((node): readonly [string, ModelMetadataFieldTemplateData] | undefined => {
      const name = nodeName(node);
      if (!name) return undefined;
      const fieldModifiers = modifiers(node.data?.["modifiers"]);
      const metadata: ModelMetadataFieldTemplateData = {
        type: typeof node.data?.["type"] === "string" ? node.data["type"] : "unknown",
        required: fieldModifiers.required === true,
        optional: fieldModifiers.optional === true,
        nullable: fieldModifiers.nullable === true,
        unique: fieldModifiers.unique === true,
        indexed: fieldModifiers.indexed === true,
        primary: fieldModifiers.primary === true,
        generated: fieldModifiers.generated === true,
        readOnly: fieldModifiers.readOnly === true,
        writeOnly: fieldModifiers.writeOnly === true,
        ...(fieldModifiers.default === undefined ? {} : { defaultValue: fieldModifiers.default }),
      };
      return [name, metadata];
    })
    .filter(
      (entry): entry is readonly [string, ModelMetadataFieldTemplateData] => entry !== undefined,
    )
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(fields);
}

export function modelMetadataTemplateData(graph: ApplicationGraph): ModelMetadataTemplateData {
  return {
    models: graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => {
        const name = nodeName(node) ?? node.id;
        return { name, table: name, fields: modelMetadataFields(graph, node) };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
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
