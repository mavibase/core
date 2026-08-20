import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

interface MiddlewareData {
  id: string;
  name: string;
  phase?: string;
  options?: Record<string, unknown>;
}

export interface RouteMiddlewareTemplateData {
  name: string;
  exportName: string;
  middleware: MiddlewareData[];
}

function nodeName(node: GraphNode): string {
  const value = node.data?.["name"];
  return typeof value === "string" && value.trim() ? value : node.id;
}

function exportName(name: string): string {
  const value = name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `${value || "Route"}Middleware`;
}

function middlewareData(node: GraphNode): MiddlewareData[] {
  const values = node.data?.["middleware"];
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === "object"),
    )
    .map((value) => ({
      id: typeof value["id"] === "string" ? value["id"] : String(value["name"] ?? "middleware"),
      name: typeof value["name"] === "string" ? value["name"] : "middleware",
      ...(typeof value["phase"] === "string" ? { phase: value["phase"] } : {}),
      ...(value["options"] && typeof value["options"] === "object"
        ? { options: value["options"] as Record<string, unknown> }
        : {}),
    }));
}

export const routeMiddlewareTemplate = defineTemplate<RouteMiddlewareTemplateData[]>(
  (routes) => {
    const lines: string[] = [];
    for (const route of routes) {
      lines.push(`export const ${route.exportName} = [`);
      for (const middleware of route.middleware) {
        lines.push(
          `  ${JSON.stringify({
            id: middleware.id,
            name: middleware.name,
            ...(middleware.phase === undefined ? {} : { phase: middleware.phase }),
            ...(middleware.options === undefined ? {} : { options: middleware.options }),
          })},`,
        );
      }
      lines.push("] as const;", "");
    }
    return lines.join("\n");
  },
  { name: "route-middleware" },
);

export function routeMiddlewareTemplateData(
  graph: ApplicationGraph,
): RouteMiddlewareTemplateData[] {
  return graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeName(node);
      return { name, exportName: exportName(name), middleware: middlewareData(node) };
    })
    .filter((route) => route.middleware.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function generateRouteMiddleware(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = routeMiddlewareTemplateData(graph);
  if (data.length === 0) return undefined;
  return { path: "route-middleware.ts", content: routeMiddlewareTemplate.render(data) };
}
