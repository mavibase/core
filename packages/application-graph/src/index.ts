import type {
  ApplicationDefinition,
  Diagnostic,
  ValidationResult,
} from "@mavibase/core";

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

export class GraphValidationError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(message: string, diagnostics: readonly Diagnostic[]) {
    super(message);
    this.name = "GraphValidationError";
    this.diagnostics = diagnostics;
  }
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

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, canonicalizeValue(value[key])]),
  );
}

function compareGraphNodes(left: GraphNode, right: GraphNode): number {
  return left.id.localeCompare(right.id) || left.type.localeCompare(right.type);
}

function compareGraphEdges(left: GraphEdge, right: GraphEdge): number {
  return (
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.type.localeCompare(right.type) ||
    JSON.stringify(left.data ?? {}).localeCompare(JSON.stringify(right.data ?? {}))
  );
}

export function canonicalizeGraph(graph: ApplicationGraph): ApplicationGraph {
  return {
    name: graph.name,
    version: graph.version,
    nodes: graph.nodes
      .map((node) => ({
        id: node.id,
        type: node.type,
        ...(node.data === undefined
          ? {}
          : { data: canonicalizeValue(node.data) as Record<string, unknown> }),
      }))
      .sort(compareGraphNodes),
    edges: graph.edges
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        ...(edge.data === undefined
          ? {}
          : { data: canonicalizeValue(edge.data) as Record<string, unknown> }),
      }))
      .sort(compareGraphEdges),
  };
}

export function serializeGraph(graph: ApplicationGraph): string {
  const canonicalGraph = canonicalizeGraph(graph);
  const payload: SerializedGraph = {
    format: GRAPH_FORMAT,
    schemaVersion: GRAPH_SCHEMA_VERSION,
    graph: canonicalGraph,
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

  const graph = payload["graph"] as unknown;

  if (!graph || typeof graph !== "object") {
    throw new Error("Invalid graph payload.");
  }

  const result = validateGraphResult(graph);
  if (!result.valid || !result.value) {
    const message = result.diagnostics.map((diagnostic) => diagnostic.message).join(" ");
    throw new GraphValidationError(`Invalid graph: ${message}`, result.diagnostics);
  }

  return canonicalizeGraph(result.value as ApplicationGraph);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const graphNodeTypes: readonly GraphNodeType[] = [
  "application",
  "model",
  "field",
  "relationship",
  "route",
  "operation",
  "event",
  "policy",
  "workflow",
  "service",
  "integration",
];

const graphEdgeTypes: readonly GraphEdgeType[] = [
  "contains",
  "has-field",
  "has-relationship",
  "targets",
  "uses",
  "validates",
  "protects",
  "triggers",
  "implements",
  "connects",
];

function graphIssueCode(issue: GraphIssue): string {
  if (issue.message.startsWith("Duplicate node id:")) return "graph.duplicate-node";
  if (issue.message.startsWith("Duplicate edge:")) return "graph.duplicate-edge";
  if (issue.message.startsWith("Edge references unknown source")) {
    return "graph.unknown-edge-source";
  }
  if (issue.message.startsWith("Edge references unknown target")) {
    return "graph.unknown-edge-target";
  }
  if (issue.message.startsWith("Invalid node")) return "graph.invalid-node";
  if (issue.message.startsWith("Invalid edge")) return "graph.invalid-edge";
  if (issue.message.startsWith("Application nodes")) return "graph.invalid-edge-relation";
  return "graph.invalid-shape";
}

function graphIssueToDiagnostic(issue: GraphIssue): Diagnostic {
  return {
    severity: "error",
    code: graphIssueCode(issue),
    message: issue.message,
    path: issue.path,
  };
}

export function validateGraph(graph: unknown): GraphIssue[] {
  const issues: GraphIssue[] = [];

  if (!isRecord(graph)) {
    return [{ path: "graph", message: "Graph must be an object." }];
  }

  if (typeof graph["name"] !== "string" || !graph["name"].trim()) {
    issues.push({ path: "name", message: "Graph name must not be empty." });
  }
  if (typeof graph["version"] !== "string" || !graph["version"].trim()) {
    issues.push({ path: "version", message: "Graph version must not be empty." });
  }

  const rawNodes = graph["nodes"];
  const rawEdges = graph["edges"];
  if (!Array.isArray(rawNodes)) {
    issues.push({ path: "nodes", message: "Graph nodes must be an array." });
  }
  if (!Array.isArray(rawEdges)) {
    issues.push({ path: "edges", message: "Graph edges must be an array." });
  }
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) return issues;

  const nodeIds = new Set<string>();
  const nodeIdToType = new Map<string, GraphNodeType>();

  for (const [index, node] of rawNodes.entries()) {
    if (!isRecord(node)) {
      issues.push({
        path: `nodes[${index}]`,
        message: "Invalid node: node must be an object.",
      });
      continue;
    }
    if (typeof node["id"] !== "string" || !node["id"].trim()) {
      issues.push({
        path: `nodes[${index}].id`,
        message: "Invalid node id: node id must be a non-empty string.",
      });
      continue;
    }
    if (!graphNodeTypes.includes(node["type"] as GraphNodeType)) {
      issues.push({
        path: `nodes[${index}].type`,
        message: `Invalid node type: "${String(node["type"])}".`,
      });
    }
    if (node["data"] !== undefined && !isRecord(node["data"])) {
      issues.push({
        path: `nodes[${index}].data`,
        message: "Invalid node data: data must be an object.",
      });
    }

    const nodeId = node["id"] as string;
    if (nodeIds.has(nodeId)) {
      issues.push({
        path: `nodes[${nodeId}]`,
        message: `Duplicate node id: "${nodeId}". Node ids must be unique.`,
      });
    }

    nodeIds.add(nodeId);
    nodeIdToType.set(nodeId, node["type"] as GraphNodeType);
  }

  const edgeKeys = new Set<string>();
  for (const [index, edge] of rawEdges.entries()) {
    if (!isRecord(edge)) {
      issues.push({
        path: `edges[${index}]`,
        message: "Invalid edge: edge must be an object.",
      });
      continue;
    }

    const from = edge["from"];
    const to = edge["to"];
    const type = edge["type"];
    const fromId = typeof from === "string" ? from : String(from);
    const toId = typeof to === "string" ? to : String(to);
    if (typeof from !== "string" || typeof to !== "string" || !from || !to) {
      issues.push({
        path: "edges",
        message: "Edge must define both from and to node ids.",
      });
    }
    if (!graphEdgeTypes.includes(type as GraphEdgeType)) {
      issues.push({
        path: `edges[${index}].type`,
        message: `Invalid edge type: "${String(type)}".`,
      });
    }
    if (edge["data"] !== undefined && !isRecord(edge["data"])) {
      issues.push({
        path: `edges[${index}].data`,
        message: "Invalid edge data: data must be an object.",
      });
    }

    const edgeKey = `${fromId}\u0000${toId}\u0000${String(type)}`;
    if (edgeKeys.has(edgeKey)) {
      issues.push({
        path: `edges[${index}]`,
        message: `Duplicate edge: "${fromId} -> ${toId} (${String(type)})".`,
      });
    }
    edgeKeys.add(edgeKey);

    if (!nodeIds.has(fromId)) {
      issues.push({
        path: `edges[${fromId} -> ${toId}]`,
        message: `Edge references unknown source node: "${fromId}".`,
      });
    }

    if (!nodeIds.has(toId)) {
      issues.push({
        path: `edges[${fromId} -> ${toId}]`,
        message: `Edge references unknown target node: "${toId}".`,
      });
    }

    const fromType = nodeIdToType.get(fromId);

    if (fromType === "application" && type !== "contains") {
      issues.push({
        path: `edges[${fromId} -> ${toId}]`,
        message: "Application nodes may only have contains edges.",
      });
    }
  }

  return issues;
}

export function validateGraphResult(graph: unknown): ValidationResult<ApplicationGraph> {
  const issues = validateGraph(graph);
  const diagnostics = issues.map(graphIssueToDiagnostic);
  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return { valid: true, value: graph as ApplicationGraph, diagnostics };
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
        ...(model.indexes && model.indexes.length > 0 ? { indexes: model.indexes } : {}),
        ...(model.constraints && model.constraints.length > 0
          ? { constraints: model.constraints }
          : {}),
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
          ...(relDef.model === undefined ? {} : { model: relDef.model }),
          ...(relDef.inverse === undefined ? {} : { inverse: relDef.inverse }),
          ...(relDef.field === undefined ? {} : { field: relDef.field }),
          ...(relDef.through === undefined ? {} : { through: relDef.through }),
          ...(relDef.owner === undefined ? {} : { owner: relDef.owner }),
          ...(relDef.required === undefined ? {} : { required: relDef.required }),
          ...(relDef.optional === undefined ? {} : { optional: relDef.optional }),
          ...(relDef.foreignKey === undefined ? {} : { foreignKey: relDef.foreignKey }),
          ...(relDef.onDelete === undefined ? {} : { onDelete: relDef.onDelete }),
          ...(relDef.onUpdate === undefined ? {} : { onUpdate: relDef.onUpdate }),
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

  return canonicalizeGraph({
    name: definition.name,
    version: definition.version,
    nodes,
    edges,
  });
}
