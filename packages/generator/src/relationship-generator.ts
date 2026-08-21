import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { normalizeModelContexts } from "./model-context.js";

export type RelationshipType = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export interface RelationshipTemplateData {
  name: string;
  source: string;
  target: string;
  type: RelationshipType;
  cardinality: "one" | "many";
  required: boolean;
  optional: boolean;
  field?: string;
  owner?: "source" | "target";
  inverse?: string;
  through?: string;
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
            ...(relationship.field === undefined
              ? []
              : [`field: ${JSON.stringify(relationship.field)}`]),
            ...(relationship.owner === undefined
              ? []
              : [`owner: ${JSON.stringify(relationship.owner)}`]),
            ...(relationship.inverse === undefined
              ? []
              : [`inverse: ${JSON.stringify(relationship.inverse)}`]),
            ...(relationship.through === undefined
              ? []
              : [`through: ${JSON.stringify(relationship.through)}`]),
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

export function relationshipTemplateData(graph: ApplicationGraph): RelationshipsTemplateData {
  return {
    models: normalizeModelContexts(graph)
      .map((model) => ({
        name: model.name,
        relationships: model.relationships.map((relationship) => ({
          name: relationship.name,
          source: model.name,
          target: relationship.target,
          type: relationship.type,
          cardinality: relationship.collection ? "many" : "one",
          required: relationship.required,
          optional: relationship.optional,
          ...(relationship.field === undefined ? {} : { field: relationship.field }),
          ...(relationship.owner === undefined ? {} : { owner: relationship.owner }),
          ...(relationship.inverse === undefined ? {} : { inverse: relationship.inverse }),
          ...(relationship.through === undefined ? {} : { through: relationship.through }),
          ...(relationship.foreignKey === undefined ? {} : { foreignKey: relationship.foreignKey }),
          ...(relationship.onDelete === undefined ? {} : { onDelete: relationship.onDelete }),
          ...(relationship.onUpdate === undefined ? {} : { onUpdate: relationship.onUpdate }),
        } satisfies RelationshipTemplateData)),
      }))
      .filter((model) => model.relationships.length > 0),
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
