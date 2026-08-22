import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { handlerFrameworks, type HandlerFramework } from "./route-handler-generator.js";

interface RegistrationRoute {
  name: string;
  handlerName: string;
  dependenciesName: string;
  method: string;
  path: string;
  middleware: string[];
}

export interface RouteRegistrationTemplateData {
  framework: HandlerFramework;
  routes: RegistrationRoute[];
}

export class RouteRegistrationGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_REGISTRATION_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteRegistrationGenerationError";
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

function dependencyProperty(name: string): string {
  const value = name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part
        : (part[0]?.toUpperCase() ?? "") + part.slice(1),
    )
    .join("");
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : "route";
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

function routeMiddleware(node: GraphNode): string[] {
  const values = node.data?.["middleware"];
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
    .map((value) =>
      typeof value["id"] === "string"
        ? value["id"]
        : typeof value["name"] === "string"
          ? value["name"]
          : undefined,
    )
    .filter((value): value is string => value !== undefined && value.trim().length > 0);
}

function routeData(graph: ApplicationGraph): RegistrationRoute[] {
  return graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeValue(node, "name") ?? node.id;
      return {
        name,
        handlerName: symbolName(name, "Handler"),
        dependenciesName: symbolName(name, "Dependencies"),
        method: nodeValue(node, "method") ?? "GET",
        path: nodeValue(node, "path") ?? "/",
        middleware: routeMiddleware(node),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function middlewareResolverName(route: RegistrationRoute): string {
  return "resolve" + symbolName(route.name, "Middleware");
}

function middlewareExpression(route: RegistrationRoute, typeName: string): string {
  return route.middleware.length === 0
    ? "[]"
    : middlewareResolverName(route) + "<" + typeName + ">(dependencies.middleware)";
}

function expressTemplate(data: RouteRegistrationTemplateData): string {
  const lines = [
    'import type { ErrorRequestHandler, Express, RequestHandler } from "express";',
    ...data.routes.map(
      (route) =>
        'import { ' +
        "create" +
        route.handlerName +
        ', type ' +
        route.dependenciesName +
        ' } from "./route-handlers.js";',
    ),
    ...data.routes
      .filter((route) => route.middleware.length > 0)
      .map(
        (route) =>
          'import { ' +
          middlewareResolverName(route) +
          ' } from "./route-middleware.js";',
      ),
    "",
    "export interface RouteRegistrationDependencies {",
    ...data.routes.map(
      (route) =>
        "  " +
        dependencyProperty(route.name) +
        ": " +
        route.dependenciesName +
        ";",
    ),
    "  middleware?: Readonly<Record<string, RequestHandler>>;",
    "  errorHandler?: ErrorRequestHandler;",
    "}",
    "",
    "export function createDefaultRouteDependencies(): RouteRegistrationDependencies {",
    "  return {",
    ...data.routes.map((route) =>
      "    " + dependencyProperty(route.name) + ": { execute: async () => { throw new Error(" +
      JSON.stringify("Implement " + route.name + " service.") + "); } },",
    ),
    "  };",
    "}",
    "",
    "export function registerRoutes(",
    "  app: Express,",
    "  dependencies: RouteRegistrationDependencies,",
    "): void {",
  ];
  for (const route of data.routes) {
    lines.push(
      "  app." +
        route.method.toLowerCase() +
        "(" +
        JSON.stringify(route.path) +
        ", ..." +
        middlewareExpression(route, "RequestHandler") +
        ", create" +
        route.handlerName +
        "(dependencies." +
        dependencyProperty(route.name) +
        "));",
    );
  }
  lines.push(
    "  if (dependencies.errorHandler) app.use(dependencies.errorHandler);",
    "}",
    "",
  );
  return lines.join("\n");
}

function fastifyTemplate(data: RouteRegistrationTemplateData): string {
  const lines = [
    'import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";',
    ...data.routes.map(
      (route) =>
        'import { ' +
        "create" +
        route.handlerName +
        ', type ' +
        route.dependenciesName +
        ' } from "./route-handlers.js";',
    ),
    ...data.routes
      .filter((route) => route.middleware.length > 0)
      .map(
        (route) =>
          'import { ' +
          middlewareResolverName(route) +
          ' } from "./route-middleware.js";',
      ),
    "",
    "export interface RouteRegistrationDependencies {",
    ...data.routes.map(
      (route) =>
        "  " +
        dependencyProperty(route.name) +
        ": " +
        route.dependenciesName +
        ";",
    ),
    "  middleware?: Readonly<Record<string, preHandlerHookHandler>>;",
    "  errorHandler?: (error: Error, request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;",
    "}",
    "",
    "export function createDefaultRouteDependencies(): RouteRegistrationDependencies {",
    "  return {",
    ...data.routes.map((route) =>
      "    " + dependencyProperty(route.name) + ": { execute: async () => { throw new Error(" +
      JSON.stringify("Implement " + route.name + " service.") + "); } },",
    ),
    "  };",
    "}",
    "",
    "export function registerRoutes(",
    "  app: FastifyInstance,",
    "  dependencies: RouteRegistrationDependencies,",
    "): void {",
  ];
  for (const route of data.routes) {
    lines.push(
      "  app.route({ method: " +
        JSON.stringify(route.method) +
        ", url: " +
        JSON.stringify(route.path) +
        ", preHandler: " +
        middlewareExpression(route, "preHandlerHookHandler") +
        ", handler: create" +
        route.handlerName +
        "(dependencies." +
        dependencyProperty(route.name) +
        ") });",
    );
  }
  lines.push(
    "  if (dependencies.errorHandler) app.setErrorHandler(dependencies.errorHandler);",
    "}",
    "",
  );
  return lines.join("\n");
}

function honoTemplate(data: RouteRegistrationTemplateData): string {
  const lines = [
    'import type { Hono } from "hono";',
    'import type { MiddlewareHandler } from "hono";',
    ...data.routes.map(
      (route) =>
        'import { ' +
        "create" +
        route.handlerName +
        ', type ' +
        route.dependenciesName +
        ' } from "./route-handlers.js";',
    ),
    ...data.routes
      .filter((route) => route.middleware.length > 0)
      .map(
        (route) =>
          'import { ' +
          middlewareResolverName(route) +
          ' } from "./route-middleware.js";',
      ),
    "",
    "export interface RouteRegistrationDependencies {",
    ...data.routes.map(
      (route) =>
        "  " +
        dependencyProperty(route.name) +
        ": " +
        route.dependenciesName +
        ";",
    ),
    "  middleware?: Readonly<Record<string, MiddlewareHandler>>;",
    "  errorHandler?: Parameters<Hono[\"onError\"]>[0];",
    "}",
    "",
    "export function createDefaultRouteDependencies(): RouteRegistrationDependencies {",
    "  return {",
    ...data.routes.map((route) =>
      "    " + dependencyProperty(route.name) + ": { execute: async () => { throw new Error(" +
      JSON.stringify("Implement " + route.name + " service.") + "); } },",
    ),
    "  };",
    "}",
    "",
    "export function registerRoutes(",
    "  app: Hono,",
    "  dependencies: RouteRegistrationDependencies,",
    "): void {",
  ];
  for (const route of data.routes) {
    lines.push(
      "  app.on(" +
        JSON.stringify(route.method) +
        ", " +
        JSON.stringify(route.path) +
        ", ..." +
        middlewareExpression(route, "MiddlewareHandler") +
        ", create" +
        route.handlerName +
        "(dependencies." +
        dependencyProperty(route.name) +
        "));",
    );
  }
  lines.push(
    "  if (dependencies.errorHandler) app.onError(dependencies.errorHandler);",
    "}",
    "",
  );
  return lines.join("\n");
}

function nestjsTemplate(): string {
  return [
    'import type { INestApplication } from "@nestjs/common";',
    'import { MavibaseController, type MavibaseControllerDependencies } from "./route-handlers.js";',
    "",
    "export type RouteRegistrationDependencies = MavibaseControllerDependencies;",
    "",
    "export function registerRoutes(",
    "  app: INestApplication,",
    "  dependencies: RouteRegistrationDependencies,",
    "): MavibaseController {",
    "  void app;",
    "  return new MavibaseController(dependencies);",
    "}",
    "",
  ].join("\n");
}

export const routeRegistrationTemplate = defineTemplate<RouteRegistrationTemplateData>(
  (data) => {
    if (data.framework === "express") return expressTemplate(data);
    if (data.framework === "fastify") return fastifyTemplate(data);
    if (data.framework === "hono") return honoTemplate(data);
    return nestjsTemplate();
  },
  { name: "route-registration" },
);

export function routeRegistrationTemplateData(
  graph: ApplicationGraph,
  framework?: HandlerFramework,
): RouteRegistrationTemplateData | undefined {
  const routes = routeData(graph);
  if (routes.length === 0) return undefined;
  const selectedFramework = framework ?? frameworkFromGraph(graph);
  if (selectedFramework === undefined) return undefined;
  if (!handlerFrameworks.includes(selectedFramework)) {
    throw new RouteRegistrationGenerationError(
      "Unsupported registration framework: \"" + selectedFramework + "\".",
    );
  }
  return { framework: selectedFramework, routes };
}

export function generateRouteRegistration(
  graph: ApplicationGraph,
  framework?: HandlerFramework,
): GeneratedFile | undefined {
  const data = routeRegistrationTemplateData(graph, framework);
  if (!data) return undefined;
  return { path: "route-registration.ts", content: routeRegistrationTemplate.render(data) };
}
