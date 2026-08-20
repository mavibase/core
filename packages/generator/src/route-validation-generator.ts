import type { FieldType } from "@mavibase/core";
import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";

type ParameterLocation = "path" | "query" | "header" | "body";

interface RouteValidationParameter {
  name: string;
  location: ParameterLocation;
  schema: string;
  required: boolean;
}

export interface RouteValidationTemplateData {
  routes: { name: string; schemaName: string; parameters: RouteValidationParameter[] }[];
  schemaReferences: string[];
}

export class RouteValidationGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_VALIDATION_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteValidationGenerationError";
  }
}

const fieldSchemaMap: Readonly<Record<FieldType, string>> = {
  string: "z.string()",
  integer: "z.number().int()",
  float: "z.number()",
  decimal: "z.number()",
  boolean: "z.boolean()",
  uuid: "z.string().uuid()",
  datetime: "z.coerce.date()",
  json: "z.unknown()",
};

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function schemaName(routeName: string): string {
  const parts = routeName.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  const value = parts.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("");
  return `${value || "Route"}RequestSchema`;
}

function routeParameters(route: GraphNode): RouteValidationParameter[] {
  const values = route.data?.["parameters"];
  if (!Array.isArray(values)) return [];

  return values
    .map((value): RouteValidationParameter | undefined => {
      if (!value || typeof value !== "object") return undefined;
      const parameter = value as Record<string, unknown>;
      const name = parameter["name"];
      const location = parameter["location"];
      if (
        typeof name !== "string" ||
        !["path", "query", "header", "body"].includes(String(location))
      ) {
        return undefined;
      }
      const schema = parameter["schema"];
      const type = parameter["type"];
      if (typeof schema === "string" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(schema)) {
        throw new RouteValidationGenerationError(
          `Invalid schema reference for route parameter "${name}": "${schema}".`,
        );
      }
      return {
        name,
        location: location as ParameterLocation,
        schema:
          typeof schema === "string" && schema.trim()
            ? schema
            : typeof type === "string" && type in fieldSchemaMap
              ? fieldSchemaMap[type as FieldType]
              : "z.unknown()",
        required: parameter["required"] === true,
      };
    })
    .filter((parameter): parameter is RouteValidationParameter => parameter !== undefined)
    .sort((left, right) =>
      `${left.location}:${left.name}`.localeCompare(`${right.location}:${right.name}`),
    );
}

export const routeValidationTemplate = defineTemplate<RouteValidationTemplateData>(
  ({ routes, schemaReferences }) => {
    const lines = [
      'import { z } from "zod";',
      ...schemaReferences.map((reference) => `import { ${reference} } from "./schemas.js";`),
      "",
    ];

    for (const route of routes) {
      lines.push(`export const ${route.schemaName} = {`);
      for (const location of ["path", "query", "header", "body"] as const) {
        const parameters = route.parameters.filter((parameter) => parameter.location === location);
        if (parameters.length === 0) continue;
        if (location === "body") {
          const parameter = parameters[0];
          if (parameter)
            lines.push(`  body: ${parameter.schema}${parameter.required ? "" : ".optional()"},`);
          continue;
        }
        const fields = parameters.map(
          (parameter) =>
            `${propertyName(parameter.name)}: ${parameter.schema}${parameter.required ? "" : ".optional()"}`,
        );
        const outputLocation = location === "header" ? "headers" : location;
        lines.push(`  ${outputLocation}: z.object({ ${fields.join(", ")} }),`);
      }
      lines.push("} as const;", "");
    }
    return lines.join("\n");
  },
  { name: "route-validation" },
);

export function routeValidationTemplateData(graph: ApplicationGraph): RouteValidationTemplateData {
  const routes = graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeName(node) ?? node.id;
      return { name, schemaName: schemaName(name), parameters: routeParameters(node) };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const schemaReferences = [
    ...new Set(
      routes
        .flatMap((route) => route.parameters)
        .map((parameter) => parameter.schema)
        .filter((schema) => /^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(schema)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const modelSchemas = new Set(
    graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => nodeName(node))
      .filter((name): name is string => name !== undefined)
      .map((name) => `${name}Schema`),
  );
  const missingSchema = schemaReferences.find((reference) => !modelSchemas.has(reference));
  if (missingSchema) {
    throw new RouteValidationGenerationError(
      `Schema reference "${missingSchema}" does not match a generated model schema.`,
    );
  }

  return { routes, schemaReferences };
}

export function generateRouteValidation(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = routeValidationTemplateData(graph);
  if (data.routes.length === 0) return undefined;
  return { path: "route-schemas.ts", content: routeValidationTemplate.render(data) };
}
