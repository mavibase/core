import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

export const handlerFrameworks = ["express", "fastify", "hono", "nestjs"] as const;
export type HandlerFramework = (typeof handlerFrameworks)[number];

interface RouteHandlerData {
  name: string;
  handlerName: string;
  dependenciesName: string;
  inputName: string;
  requestParserName: string;
  outputParserName: string;
  hasOutputValidation: boolean;
  method: string;
  path: string;
  responseStatus: number;
}

export interface RouteHandlerTemplateData {
  framework: HandlerFramework;
  routes: RouteHandlerData[];
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

function symbolName(name: string, suffix: string): string {
  const value = name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1))
    .join("");
  return (value || "Route") + suffix;
}

function handlerName(name: string): string {
  return symbolName(name, "Handler");
}

function responseStatus(node: GraphNode): number {
  const responses = node.data?.["responses"];
  if (!Array.isArray(responses)) return 200;
  const statuses = responses
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    .map((value) => value["status"])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 200 && value <= 299,
    )
    .sort((left, right) => left - right);
  return statuses[0] ?? 200;
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

function routeData(graph: ApplicationGraph): RouteHandlerData[] {
  return graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeValue(node, "name") ?? node.id;
      const status = responseStatus(node);
      const responses = node.data?.["responses"];
      return {
        name,
        handlerName: handlerName(name),
        dependenciesName: symbolName(name, "Dependencies"),
        inputName: symbolName(name, "Input"),
        requestParserName: symbolName(name, "Request"),
        outputParserName: symbolName(name, "Response"),
        hasOutputValidation:
          Array.isArray(responses) &&
          responses.some(
            (response) =>
              Boolean(response && typeof response === "object") &&
              (response as Record<string, unknown>)["status"] === status,
          ),
        method: nodeValue(node, "method") ?? "GET",
        path: nodeValue(node, "path") ?? "/",
        responseStatus: status,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function defaultDependency(route: RouteHandlerData): string[] {
  return [
    "export const " + route.handlerName + " = create" + route.handlerName + "({",
    "  async execute() {",
    "    throw new Error(" + JSON.stringify("Implement " + route.name + " service.") + ");",
    "  },",
    "});",
    "",
  ];
}

function commonTypes(lines: string[]): void {
  lines.push(
    "export interface RequestContext {",
    "  request: unknown;",
    "  response: unknown;",
    "}",
    "",
  );
}

function inputAndDependencies(lines: string[], route: RouteHandlerData): void {
  lines.push(
    "export interface " + route.inputName + " {",
    "  params: Record<string, unknown>;",
    "  query: Record<string, unknown>;",
    "  headers: Record<string, unknown>;",
    "  body: unknown;",
    "}",
    "",
    "export interface " + route.dependenciesName + " {",
    "  execute(input: " + route.inputName + ", context: RequestContext): Promise<unknown>;",
    "}",
    "",
  );
}

function validationImports(data: RouteHandlerTemplateData): string[] {
  return data.routes.flatMap((route) => [
    "import { parse" + route.requestParserName + " } from \"./route-schemas.js\";",
    ...(route.hasOutputValidation
      ? [
          "import { parse" +
            route.outputParserName +
            " } from \"./route-output-validation.js\";",
        ]
      : []),
  ]);
}

function outputExpression(route: RouteHandlerData): string {
  return route.hasOutputValidation
    ? "parse" + route.outputParserName + "(" + route.responseStatus + ", result)"
    : "result";
}

function expressTemplate(data: RouteHandlerTemplateData): string {
  const lines = [
    'import type { NextFunction, Request, Response } from "express";',
    'import { toApiError } from "./api-errors.js";',
    ...validationImports(data),
    "",
  ];
  commonTypes(lines);
  for (const route of data.routes) {
    inputAndDependencies(lines, route);
    lines.push(
      "export function create" + route.handlerName + "(deps: " + route.dependenciesName + ") {",
      "  return async function " + route.handlerName + "(request: Request, response: Response, next: NextFunction): Promise<void> {",
      "    try {",
      "      const input = parse" + route.requestParserName + "({ params: request.params, query: request.query, headers: request.headers, body: request.body });",
      "      const result = await deps.execute(input, { request, response });",
      "      response.status(" + route.responseStatus + ").json(" + outputExpression(route) + ");",
      "    } catch (error) {",
      "      next(toApiError(error));",
      "    }",
      "  };",
      "}",
      "",
      ...defaultDependency(route),
    );
  }
  return lines.join("\n");
}

function fastifyTemplate(data: RouteHandlerTemplateData): string {
  const lines = [
    'import type { FastifyReply, FastifyRequest } from "fastify";',
    ...validationImports(data),
    "",
  ];
  commonTypes(lines);
  for (const route of data.routes) {
    inputAndDependencies(lines, route);
    lines.push(
      "export function create" + route.handlerName + "(deps: " + route.dependenciesName + ") {",
      "  return async function " + route.handlerName + "(request: FastifyRequest, reply: FastifyReply): Promise<void> {",
      "    const input = parse" + route.requestParserName + "({ params: request.params, query: request.query, headers: request.headers, body: request.body });",
      "    const result = await deps.execute(input, { request, response: reply });",
      "    await reply.code(" + route.responseStatus + ").send(" + outputExpression(route) + ");",
      "  };",
      "}",
      "",
      ...defaultDependency(route),
    );
  }
  return lines.join("\n");
}

function honoTemplate(data: RouteHandlerTemplateData): string {
  const lines = [
    'import type { Context } from "hono";',
    ...validationImports(data),
    "",
  ];
  commonTypes(lines);
  for (const route of data.routes) {
    inputAndDependencies(lines, route);
    lines.push(
      "export function create" + route.handlerName + "(deps: " + route.dependenciesName + ") {",
      "  return async function " + route.handlerName + "(context: Context): Promise<Response> {",
      "    const input = parse" + route.requestParserName + "({ params: context.req.param(), query: context.req.query(), headers: context.req.header(), body: await context.req.json().catch(() => undefined) });",
      "    const result = await deps.execute(input, { request: context.req.raw, response: context });",
      "    return context.json(" + outputExpression(route) + ", " + route.responseStatus + ");",
      "  };",
      "}",
      "",
      ...defaultDependency(route),
    );
  }
  return lines.join("\n");
}

function nestjsTemplate(data: RouteHandlerTemplateData): string {
  const decorators = [...new Set(data.routes.map((route) => route.method.toLowerCase()))]
    .map((method) => (method[0]?.toUpperCase() ?? "") + method.slice(1))
    .sort();
  const lines = [
    "import { Controller, " + decorators.join(", ") + " } from \"@nestjs/common\";",
    "",
    "export interface RequestContext { request: unknown; response: unknown; }",
    "export interface MavibaseControllerDependencies {",
    "  execute(input: Record<string, unknown>, context: RequestContext): Promise<unknown>;",
    "}",
    "",
    "@Controller()",
    "export class MavibaseController {",
    "  constructor(private readonly deps: MavibaseControllerDependencies) {}",
    "",
  ];
  for (const route of data.routes) {
    const decorator = (route.method[0]?.toUpperCase() ?? "") + route.method.slice(1).toLowerCase();
    lines.push(
      "  @" + decorator + "(" + JSON.stringify(route.path) + ")",
      "  async " + route.handlerName + "(): Promise<unknown> {",
      "    return this.deps.execute({ params: {}, query: {}, headers: {}, body: undefined }, { request: undefined, response: undefined });",
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
    throw new RouteHandlerGenerationError("Unsupported handler framework: \"" + selectedFramework + "\".");
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
