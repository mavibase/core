import type { FieldDefinition, SemanticType } from "@mavibase/core";
import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { requireGeneratorFieldContext } from "./field-context.js";

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

      const context = requireGeneratorFieldContext(
        {
          type: node.data?.["type"] as SemanticType,
          ...(node.data?.["modifiers"] === undefined
            ? {}
            : { modifiers: node.data["modifiers"] as NonNullable<FieldDefinition["modifiers"]> }),
          ...(node.data?.["validation"] === undefined
            ? {}
            : { validation: node.data["validation"] as string }),
        },
        `models.${nodeName(model) ?? model.id}.fields.${fieldName}`,
      );
      return {
        name: fieldName,
        type: context.typescriptType,
        optional: context.optional,
        nullable: context.nullable,
        readonly: context.readOnly,
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
      const context = requireGeneratorFieldContext(
        {
          type: node.data?.["type"] as SemanticType,
          ...(node.data?.["modifiers"] === undefined
            ? {}
            : { modifiers: node.data["modifiers"] as NonNullable<FieldDefinition["modifiers"]> }),
          ...(node.data?.["validation"] === undefined
            ? {}
            : { validation: node.data["validation"] as string }),
        },
        `models.${nodeName(model) ?? model.id}.fields.${name}`,
      );
      const rawModifiers =
        node.data?.["modifiers"] && typeof node.data["modifiers"] === "object"
          ? (node.data["modifiers"] as Record<string, unknown>)
          : {};
      const metadata: ModelMetadataFieldTemplateData = {
        type: context.semanticType,
        required: rawModifiers.required === true,
        optional: context.optional,
        nullable: context.nullable,
        unique: rawModifiers.unique === true,
        indexed: rawModifiers.indexed === true,
        primary: rawModifiers.primary === true,
        generated: rawModifiers.generated === true,
        readOnly: context.readOnly,
        writeOnly: context.writeOnly,
        ...(rawModifiers.default === undefined
          ? {}
          : { defaultValue: rawModifiers.default }),
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
