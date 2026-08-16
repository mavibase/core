import type { ApplicationDefinition } from "@mavibase/core";

export const version = "0.1.0";

/**
 * Represents a node in the application graph.
 *
 * Nodes will represent models, fields, APIs, and other application
 * components in later phases.
 */
export interface GraphNode {
  id: string;
  type: string;
}

/**
 * Represents a directional edge between two graph nodes.
 */
export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

/**
 * A machine-readable representation of an application.
 *
 * Contains all nodes and edges that describe the structure of an application.
 */
export interface ApplicationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build an application graph from an application definition.
 *
 * The implementation will be built out in later phases. Currently returns
 * an empty graph.
 */
export function buildGraph(_definition: ApplicationDefinition): ApplicationGraph {
  return {
    nodes: [],
    edges: [],
  };
}
