import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

export type RelationshipType = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export interface RelationshipTemplateData {
  name: string;
  source: string;
  target: string;
  type: RelationshipType;
  cardinality: "one" | "many";
  required: boolean;
  optional: boolean;
  foreignKey?: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface RelationshipsTemplateData {
  models: {
    name: string;
    relationships: RelationshipTemplateData[];
  }[];
}

export const relationshipsTemplate = defineTemplate<RelationshipsTemplateData>(
  ({ models }) =>
    models
      .map((model) => {
        const lines = [`export const ${model.name}Relationships = {`];

        for (const relationship of model.relationships) {
          const values = [
            `source: ${JSON.stringify(relationship.source)}`,
            `target: ${JSON.stringify(relationship.target)}`,
            `type: ${JSON.stringify(relationship.type)}`,
            `cardinality: ${JSON.stringify(relationship.cardinality)}`,
            `required: ${relationship.required}`,
            `optional: ${relationship.optional}`,
            ...(relationship.foreignKey === undefined
              ? []
              : [`foreignKey: ${JSON.stringify(relationship.foreignKey)}`]),
            ...(relationship.onDelete === undefined
              ? []
              : [`onDelete: ${JSON.stringify(relationship.onDelete)}`]),
            ...(relationship.onUpdate === undefined
              ? []
              : [`onUpdate: ${JSON.stringify(relationship.onUpdate)}`]),
          ];
          lines.push(`  ${JSON.stringify(relationship.name)}: { ${values.join(", ")} },`);
        }

        lines.push("} as const;");
        return lines.join("\n");
      })
      .join("\n\n") + (models.length > 0 ? "\n" : ""),
  { name: "relationships" },
);

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function relationshipType(value: unknown): RelationshipType | undefined {
  return value === "one-to-one" ||
    value === "one-to-many" ||
    value === "many-to-one" ||
    value === "many-to-many"
    ? value
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function modelRelationships(
  graph: ApplicationGraph,
  model: GraphNode,
  source: string,
): RelationshipTemplateData[] {
  return graph.edges
    .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
    .map((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is GraphNode => node?.type === "relationship")
    .map((node): RelationshipTemplateData | undefined => {
      const name = nodeName(node);
      const target = stringValue(node.data?.["model"]);
      const type = relationshipType(node.data?.["type"]);

      if (!name || !target || !type) return undefined;

      const cardinality = type === "one-to-one" || type === "many-to-one" ? "one" : "many";
      const required = booleanValue(node.data?.["required"]) ?? false;
      const optional = booleanValue(node.data?.["optional"]) ?? !required;

      const relationship: RelationshipTemplateData = {
        name,
        source,
        target,
        type,
        cardinality,
        required,
        optional,
      };

      const foreignKey = stringValue(node.data?.["foreignKey"]);
      const onDelete = stringValue(node.data?.["onDelete"]);
      const onUpdate = stringValue(node.data?.["onUpdate"]);

      if (foreignKey !== undefined) relationship.foreignKey = foreignKey;
      if (onDelete !== undefined) relationship.onDelete = onDelete;
      if (onUpdate !== undefined) relationship.onUpdate = onUpdate;

      return relationship;
    })
    .filter((relationship): relationship is RelationshipTemplateData => relationship !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function relationshipTemplateData(graph: ApplicationGraph): RelationshipsTemplateData {
  return {
    models: graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => {
        const name = nodeName(node) ?? node.id;
        return { name, relationships: modelRelationships(graph, node, name) };
      })
      .filter((model) => model.relationships.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function generateRelationships(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = relationshipTemplateData(graph);
  if (data.models.length === 0) return undefined;

  return {
    path: "relationships.ts",
    content: relationshipsTemplate.render(data),
  };
}
