export const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type RouteMethod = (typeof routeMethods)[number];

export interface RouteDefinition {
  id: string;
  name: string;
  method: RouteMethod;
  path: string;
  description?: string;
  parameters?: RouteParameterDefinition[];
  responses?: import("./responses.js").RouteResponseDefinition[];
}

export interface DefineRouteInput {
  id?: string;
  name: string;
  method: RouteMethod;
  path: string;
  description?: string;
  parameters?: RouteParameterDefinition[] | DefineParameterInput[];
  responses?:
    | import("./responses.js").RouteResponseDefinition[]
    | import("./responses.js").DefineResponseInput[];
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
  const parameters = (input.parameters ?? []).map((parameter) => ({
    ...parameter,
    required: parameter.required ?? parameter.location === "path",
  }));
  const parameterIssues = validateRouteParameters(input.path, parameters);
  if (parameterIssues.length > 0) {
    throw new Error(parameterIssues[0]?.message ?? "Invalid route parameter.");
  }
  const responses = input.responses ?? [];
  const responseStatuses = new Set<number>();
  for (const response of responses) {
    if (responseStatuses.has(response.status)) {
      throw new Error(`Duplicate route response status: "${response.status}".`);
    }
    responseStatuses.add(response.status);
  }

  return {
    id: input.id ?? `${input.method.toLowerCase()}:${input.name}`,
    name: input.name,
    method: input.method,
    path: input.path,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(parameters.length === 0 ? {} : { parameters: parameters as RouteParameterDefinition[] }),
    ...(responses.length === 0 ? {} : { responses }),
  };
}
import {
  validateRouteParameters,
  type DefineParameterInput,
  type RouteParameterDefinition,
} from "./parameters.js";
