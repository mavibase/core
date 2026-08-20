export const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type RouteMethod = (typeof routeMethods)[number];

export interface RouteDefinition {
  id: string;
  name: string;
  method: RouteMethod;
  path: string;
  description?: string;
  parameters?: RouteParameterDefinition[];
}

export interface DefineRouteInput {
  id?: string;
  name: string;
  method: RouteMethod;
  path: string;
  description?: string;
  parameters?: RouteParameterDefinition[] | DefineParameterInput[];
}

export function isRouteMethod(value: unknown): value is RouteMethod {
  return typeof value === "string" && routeMethods.includes(value as RouteMethod);
}

export function defineRoute(input: DefineRouteInput): RouteDefinition {
  if (!input.name.trim()) {
    throw new Error("Route name must not be empty.");
  }
  if (!isRouteMethod(input.method)) {
    throw new Error(`Invalid route method: "${input.method}".`);
  }
  if (!input.path.startsWith("/") || input.path.includes("//")) {
    throw new Error(`Invalid route path: "${input.path}".`);
  }
  const parameters = input.parameters ?? [];
  const parameterIssues = validateRouteParameters(input.path, parameters);
  if (parameterIssues.length > 0) {
    throw new Error(parameterIssues[0]?.message ?? "Invalid route parameter.");
  }

  return {
    id: input.id ?? `${input.method.toLowerCase()}:${input.name}`,
    name: input.name,
    method: input.method,
    path: input.path,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(parameters.length === 0 ? {} : { parameters: parameters as RouteParameterDefinition[] }),
  };
}
import {
  validateRouteParameters,
  type DefineParameterInput,
  type RouteParameterDefinition,
} from "./parameters.js";
