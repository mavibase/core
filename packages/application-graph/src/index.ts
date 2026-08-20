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

export type SerializedGraph = {
  format: "mavibase-graph";
  schemaVersion: 1;
  graph: ApplicationGraph;
};

export interface GraphIssue {
  path: string;
  message: string;
}

const GRAPH_SCHEMA_VERSION = 1;
const GRAPH_FORMAT = "mavibase-graph";

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

export function serializeGraph(graph: ApplicationGraph): string {
  const payload: SerializedGraph = {
    format: GRAPH_FORMAT,
    schemaVersion: GRAPH_SCHEMA_VERSION,
    graph: {
      name: graph.name,
      version: graph.version,
      nodes: graph.nodes,
      edges: graph.edges,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function deserializeGraph(input: string): ApplicationGraph {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Failed to parse graph JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid graph payload.");
  }

  const payload = parsed as Record<string, unknown>;

  if (payload["format"] !== GRAPH_FORMAT) {
    throw new Error('Invalid graph format. Expected "mavibase-graph".');
  }

  if (payload["schemaVersion"] !== GRAPH_SCHEMA_VERSION) {
    throw new Error(`Unsupported graph schema version: "${payload["schemaVersion"]}".`);
  }

  const graph = payload["graph"] as ApplicationGraph | undefined;

  if (!graph || typeof graph !== "object") {
    throw new Error("Invalid graph payload.");
  }

  return graph;
}

export function validateGraph(graph: ApplicationGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];

  const nodeIds = new Set<string>();
  const nodeIdToType = new Map<string, GraphNodeType>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        path: `nodes[${node.id}]`,
        message: `Duplicate node id: "${node.id}". Node ids must be unique.`,
      });
    }

    nodeIds.add(node.id);
    nodeIdToType.set(node.id, node.type);
  }

  for (const edge of graph.edges) {
    if (!edge.from || !edge.to) {
      issues.push({
        path: "edges",
        message: "Edge must define both from and to node ids.",
      });
    }

    if (!nodeIds.has(edge.from)) {
      issues.push({
        path: `edges[${edge.from} -> ${edge.to}]`,
        message: `Edge references unknown source node: "${edge.from}".`,
      });
    }

    if (!nodeIds.has(edge.to)) {
      issues.push({
        path: `edges[${edge.from} -> ${edge.to}]`,
        message: `Edge references unknown target node: "${edge.to}".`,
      });
    }

    const fromType = nodeIdToType.get(edge.from);

    if (fromType === "application" && edge.type !== "contains") {
      issues.push({
        path: `edges[${edge.from} -> ${edge.to}]`,
        message: "Application nodes may only have contains edges.",
      });
    }
  }

  return issues;
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
      ...(definition.stack.web === undefined &&
      definition.stack.backend === undefined &&
      definition.stack.database === undefined
        ? {}
        : { stack: definition.stack }),
    }),
  );

  const models = definition.models ?? [];

  for (const route of definition.routes ?? []) {
    const routeId = `route:${route.id}`;
    nodes.push(
      createNode("route", routeId, {
        id: route.id,
        name: route.name,
        method: route.method,
        path: route.path,
        ...(route.description === undefined ? {} : { description: route.description }),
        ...(route.parameters === undefined ? {} : { parameters: route.parameters }),
        ...(route.responses === undefined ? {} : { responses: route.responses }),
        ...(route.middleware === undefined ? {} : { middleware: route.middleware }),
      }),
    );
    edges.push(createEdge(appId, routeId, "contains"));
  }

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
          ...(fieldDef.validation === undefined ? {} : { validation: fieldDef.validation }),
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
        const targetModel = models.find((candidate) => candidate.name === relDef.model);

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
