import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

interface ResponseTemplateData {
  status: number;
  description?: string;
  schema?: string;
  contentType?: string;
}

export interface RouteResponseTemplateData {
  name: string;
  exportName: string;
  responses: ResponseTemplateData[];
}

export class RouteResponseGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_RESPONSE_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteResponseGenerationError";
  }
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function exportName(name: string): string {
  const value = name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `${value || "Route"}Responses`;
}

function responseData(route: GraphNode): ResponseTemplateData[] {
  const values = route.data?.["responses"];
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === "object"),
    )
    .map((value) => ({
      status: Number(value["status"]),
      ...(typeof value["description"] === "string" ? { description: value["description"] } : {}),
      ...(typeof value["schema"] === "string" ? { schema: value["schema"] } : {}),
      ...(typeof value["contentType"] === "string" ? { contentType: value["contentType"] } : {}),
    }))
    .sort((left, right) => left.status - right.status);
}

export const routeResponseTemplate = defineTemplate<RouteResponseTemplateData[]>(
  (routes) => {
    const schemaReferences = [
      ...new Set(
        routes.flatMap((route) => route.responses).flatMap((response) => response.schema ?? []),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const lines = [
      ...schemaReferences.map((reference) => `import { ${reference} } from "./schemas.js";`),
      ...(schemaReferences.length > 0 ? [""] : []),
    ];

    for (const route of routes) {
      lines.push(`export const ${route.exportName} = {`);
      for (const response of route.responses) {
        const values = [
          ...(response.description === undefined
            ? []
            : [`description: ${JSON.stringify(response.description)}`]),
          ...(response.schema === undefined ? [] : [`schema: ${response.schema}`]),
          ...(response.contentType === undefined
            ? []
            : [`contentType: ${JSON.stringify(response.contentType)}`]),
        ];
        lines.push(`  ${response.status}: { ${values.join(", ")} },`);
      }
      lines.push("} as const;", "");
    }
    return lines.join("\n");
  },
  { name: "route-responses" },
);

export function routeResponseTemplateData(graph: ApplicationGraph): RouteResponseTemplateData[] {
  const modelSchemas = new Set(
    graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => nodeName(node))
      .filter((name): name is string => name !== undefined)
      .map((name) => `${name}Schema`),
  );
  const routes = graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeName(node) ?? node.id;
      const responses = responseData(node);
      for (const response of responses) {
        if (response.schema !== undefined && !modelSchemas.has(response.schema)) {
          throw new RouteResponseGenerationError(
            `Schema reference "${response.schema}" does not match a generated model schema.`,
          );
        }
      }
      return { name, exportName: exportName(name), responses };
    })
    .filter((route) => route.responses.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
  return routes;
}

export function generateRouteResponses(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = routeResponseTemplateData(graph);
  if (data.length === 0) return undefined;
  return { path: "route-responses.ts", content: routeResponseTemplate.render(data) };
}
