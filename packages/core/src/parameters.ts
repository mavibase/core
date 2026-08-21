import type { FieldType } from "./index.js";
import { validateStructuredConstraints, type StructuredConstraint } from "./validation.js";
import { validateSchemaExpression, type SchemaExpression } from "./schema.js";

export const routeParameterLocations = ["path", "query", "header", "body"] as const;
export type RouteParameterLocation = (typeof routeParameterLocations)[number];

export interface RouteParameterDefinition {
  name: string;
  location: RouteParameterLocation;
  required: boolean;
  type?: FieldType;
  schema?: string | SchemaExpression;
  constraints?: readonly StructuredConstraint[];
  validation?: string;
  description?: string;
}

export interface DefineParameterInput {
  name: string;
  location: RouteParameterLocation;
  required?: boolean;
  type?: FieldType;
  schema?: string | SchemaExpression;
  constraints?: readonly StructuredConstraint[];
  validation?: string;
  description?: string;
}

export interface ParameterValidationIssue {
  path: string;
  message: string;
}

export function defineParameter(input: DefineParameterInput): RouteParameterDefinition {
  if (!input.name.trim()) throw new Error("Parameter name must not be empty.");
  if (!routeParameterLocations.includes(input.location)) {
    throw new Error(`Invalid parameter location: "${input.location}".`);
  }
  return {
    name: input.name,
    location: input.location,
    required: input.required ?? input.location === "path",
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(input.constraints === undefined ? {} : { constraints: [...input.constraints] }),
    ...(input.validation === undefined ? {} : { validation: input.validation }),
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}

export function routePathParameterNames(path: string): string[] {
  const names = new Set<string>();
  for (const match of path.matchAll(/:(\w+)|\{([^{}]+)\}/g)) {
    const name = match[1] ?? match[2];
    if (name) names.add(name);
  }
  return [...names];
}

export function validateRouteParameters(
  routePath: string,
  parameters: readonly DefineParameterInput[] | readonly RouteParameterDefinition[],
): ParameterValidationIssue[] {
  const issues: ParameterValidationIssue[] = [];
  const pathNames = new Set(routePathParameterNames(routePath));
  const seen = new Set<string>();
  let bodyCount = 0;

  for (const [index, parameter] of parameters.entries()) {
    const path = `parameters[${index}]`;
    if (!parameter.name.trim()) {
      issues.push({ path: `${path}.name`, message: "Parameter name must not be empty." });
      continue;
    }
    const key = `${parameter.location}:${parameter.name}`;
    if (seen.has(key)) {
      issues.push({
        path,
        message: `Duplicate ${parameter.location} parameter: "${parameter.name}".`,
      });
    }
    seen.add(key);
    if (!routeParameterLocations.includes(parameter.location)) {
      issues.push({
        path: `${path}.location`,
        message: `Invalid parameter location: "${parameter.location}".`,
      });
    }
    if (parameter.location === "path") {
      if (!pathNames.has(parameter.name)) {
        issues.push({
          path: `${path}.name`,
          message: `Path parameter "${parameter.name}" is not declared in route path "${routePath}".`,
        });
      }
      if (parameter.required === false) {
        issues.push({ path: `${path}.required`, message: "Path parameters must be required." });
      }
    }
    if (parameter.location === "body") bodyCount += 1;
    if (parameter.constraints !== undefined) {
      for (const message of validateStructuredConstraints(parameter.constraints)) {
        issues.push({ path: `${path}.constraints`, message });
      }
    }
    if (parameter.schema !== undefined && typeof parameter.schema !== "string") {
      for (const message of validateSchemaExpression(parameter.schema, `${path}.schema`)) {
        issues.push({ path: `${path}.schema`, message });
      }
    }
  }

  for (const pathName of pathNames) {
    if (
      !parameters.some((parameter) => parameter.location === "path" && parameter.name === pathName)
    ) {
      issues.push({
        path: "parameters",
        message: `Route path parameter "${pathName}" must have a parameter definition.`,
      });
    }
  }
  if (bodyCount > 1) {
    issues.push({ path: "parameters", message: "A route may define at most one body parameter." });
  }
  return issues;
}
