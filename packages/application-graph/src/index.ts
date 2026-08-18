import type { ApplicationDefinition } from "@mavibase/core";

export const version = "0.1.0";

export type GraphNodeType =
  | "application"
  | "model"
  | "field"
  | "relationship"
  | "route"
  | "operation"
  | "event"
  | "policy"
  | "workflow"
  | "service"
  | "integration";

export type GraphEdgeType =
  | "contains"
  | "has-field"
  | "has-relationship"
  | "targets"
  | "uses"
  | "validates"
  | "protects"
  | "triggers"
  | "implements"
  | "connects";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  data?: Record<string, unknown>;
}

export interface ApplicationGraph {
  name: string;
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function createNode(
  type: GraphNodeType,
  id: string,
  data?: Record<string, unknown>,
): GraphNode {
  return {
    id,
    type,
    ...(data ? { data } : {}),
  };
}

export function createEdge(
  from: string,
  to: string,
  type: GraphEdgeType,
  data?: Record<string, unknown>,
): GraphEdge {
  return {
    from,
    to,
    type,
    ...(data ? { data } : {}),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildGraph(definition: ApplicationDefinition): ApplicationGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const appId = `app:${slugify(definition.name)}`;

  nodes.push(
    createNode("application", appId, {
      name: definition.name,
      version: definition.version,
      environment: definition.environment,
    }),
  );

  const models = definition.models ?? [];

  for (const model of models) {
    const modelId = `model:${model.id}`;

    nodes.push(
      createNode("model", modelId, {
        name: model.name,
      }),
    );

    edges.push(createEdge(appId, modelId, "contains"));

    const fields = model.fields ?? {};

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      const fieldId = `field:${model.id}.${fieldName}`;

      nodes.push(
        createNode("field", fieldId, {
          name: fieldName,
          type: fieldDef.type,
          modifiers: fieldDef.modifiers,
        }),
      );

      edges.push(createEdge(modelId, fieldId, "has-field"));
    }

    const relationships = model.relationships ?? {};

    for (const [relName, relDef] of Object.entries(relationships)) {
      const relId = `relationship:${model.id}.${relName}`;

      nodes.push(
        createNode("relationship", relId, {
          name: relName,
          type: relDef.type,
          model: relDef.model,
        }),
      );

      edges.push(createEdge(modelId, relId, "has-relationship"));

      if (relDef.model) {
        const targetModel = models.find(
          (candidate) => candidate.name === relDef.model,
        );

        if (targetModel) {
          edges.push(createEdge(relId, `model:${targetModel.id}`, "targets"));
        }
      }
    }
  }

  return {
    name: definition.name,
    version: definition.version,
    nodes,
    edges,
  };
}