import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

export const handlerFrameworks = ["express", "fastify", "hono", "nestjs"] as const;
export type HandlerFramework = (typeof handlerFrameworks)[number];

export interface RouteHandlerTemplateData {
  framework: HandlerFramework;
  routes: { name: string; handlerName: string; method: string; path: string }[];
}

export class RouteHandlerGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_HANDLER_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteHandlerGenerationError";
  }
}

function nodeValue(node: GraphNode, key: string): string | undefined {
  const value = node.data?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function handlerName(name: string): string {
  const value = name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `${value || "Route"}Handler`;
}

function frameworkFromGraph(graph: ApplicationGraph): HandlerFramework | undefined {
  const application = graph.nodes.find((node) => node.type === "application");
  const stack = application?.data?.["stack"];
  if (!stack || typeof stack !== "object") return undefined;
  const backend = (stack as Record<string, unknown>)["backend"];
  if (!backend || typeof backend !== "object") return undefined;
  const framework = (backend as Record<string, unknown>)["framework"];
  return handlerFrameworks.includes(framework as HandlerFramework)
    ? (framework as HandlerFramework)
    : undefined;
}

function routeData(
  graph: ApplicationGraph,
): { name: string; handlerName: string; method: string; path: string }[] {
  return graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeValue(node, "name") ?? node.id;
      return {
        name,
        handlerName: handlerName(name),
        method: nodeValue(node, "method") ?? "GET",
        path: nodeValue(node, "path") ?? "/",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function expressTemplate(data: RouteHandlerTemplateData): string {
  const lines = ['import type { Request, Response } from "express";', ""];
  for (const route of data.routes) {
    lines.push(
      `export async function ${route.handlerName}(request: Request, response: Response): Promise<void> {`,
      "  void request;",
      '  response.status(501).json({ error: "Not implemented" });',
      "}",
      "",
    );
  }
  return lines.join("\n");
}

function fastifyTemplate(data: RouteHandlerTemplateData): string {
  const lines = ['import type { FastifyReply, FastifyRequest } from "fastify";', ""];
  for (const route of data.routes) {
    lines.push(
      `export async function ${route.handlerName}(request: FastifyRequest, reply: FastifyReply): Promise<void> {`,
      "  void request;",
      '  await reply.code(501).send({ error: "Not implemented" });',
      "}",
      "",
    );
  }
  return lines.join("\n");
}

function honoTemplate(data: RouteHandlerTemplateData): string {
  const lines = ['import type { Context } from "hono";', ""];
  for (const route of data.routes) {
    lines.push(
      `export async function ${route.handlerName}(context: Context): Promise<Response> {`,
      '  return context.json({ error: "Not implemented" }, 501);',
      "}",
      "",
    );
  }
  return lines.join("\n");
}

function nestjsTemplate(data: RouteHandlerTemplateData): string {
  const decorators = [...new Set(data.routes.map((route) => route.method.toLowerCase()))]
    .map((method) => method[0]?.toUpperCase() + method.slice(1))
    .sort();
  const lines = [
    `import { Controller, ${decorators.join(", ")} } from "@nestjs/common";`,
    "",
    "@Controller()",
    "export class MavibaseController {",
  ];
  for (const route of data.routes) {
    const decorator = route.method[0]?.toUpperCase() + route.method.slice(1).toLowerCase();
    lines.push(
      `  @${decorator}(${JSON.stringify(route.path)})`,
      `  async ${route.handlerName}(): Promise<{ error: string }> {`,
      '    return { error: "Not implemented" };',
      "  }",
      "",
    );
  }
  lines.push("}", "");
  return lines.join("\n");
}

export const routeHandlerTemplate = defineTemplate<RouteHandlerTemplateData>(
  (data) => {
    if (data.framework === "express") return expressTemplate(data);
    if (data.framework === "fastify") return fastifyTemplate(data);
    if (data.framework === "hono") return honoTemplate(data);
    return nestjsTemplate(data);
  },
  { name: "route-handlers" },
);

export function routeHandlerTemplateData(
  graph: ApplicationGraph,
  framework?: HandlerFramework,
): RouteHandlerTemplateData | undefined {
  const routes = routeData(graph);
  if (routes.length === 0) return undefined;
  const selectedFramework = framework ?? frameworkFromGraph(graph);
  if (selectedFramework === undefined) return undefined;
  if (!handlerFrameworks.includes(selectedFramework)) {
    throw new RouteHandlerGenerationError(`Unsupported handler framework: "${selectedFramework}".`);
  }
  return { framework: selectedFramework, routes };
}

export function generateRouteHandlers(
  graph: ApplicationGraph,
  framework?: HandlerFramework,
): GeneratedFile | undefined {
  const data = routeHandlerTemplateData(graph, framework);
  if (!data) return undefined;
  return { path: "route-handlers.ts", content: routeHandlerTemplate.render(data) };
}
