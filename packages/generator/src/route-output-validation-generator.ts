import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";
import type { SchemaExpression } from "@mavibase/core";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { renderSchemaExpression } from "./schema-expression-generator.js";

interface OutputResponseTemplateData {
  status: number;
  schema: string;
  references: string[];
}

export interface RouteOutputValidationTemplateData {
  name: string;
  exportName: string;
  responses: OutputResponseTemplateData[];
  schemaReferences: string[];
}

export class RouteOutputValidationGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_OUTPUT_VALIDATION_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteOutputValidationGenerationError";
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
  return `${value || "Route"}ResponseSchemas`;
}

function responseSchema(status: number, schema: unknown, routeName: string): string {
  if (typeof schema === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(schema)) {
    return schema;
  }
  if (schema !== undefined) {
    throw new RouteOutputValidationGenerationError(
      `Invalid response schema reference for route "${routeName}": "${String(schema)}".`,
    );
  }
  return status === 204 || status === 304 ? "z.void()" : "z.unknown()";
}

function schemaDefinitions(graph: ApplicationGraph): Record<string, SchemaExpression> {
  const application = graph.nodes.find((node) => node.type === "application");
  const definitions = application?.data?.["definitions"];
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return {};
  const schemas = (definitions as Record<string, unknown>)["schemas"];
  if (!schemas || typeof schemas !== "object" || Array.isArray(schemas)) return {};
  return schemas as Record<string, SchemaExpression>;
}

export const routeOutputValidationTemplate = defineTemplate<RouteOutputValidationTemplateData[]>(
  (routes) => {
    const references = [
      ...new Set(routes.flatMap((route) => route.schemaReferences)),
    ].sort((left, right) => left.localeCompare(right));
    const lines = [
      'import { z } from "zod";',
      'import { createApiError } from "./api-errors.js";',
      ...references.map((reference) => `import { ${reference} } from "./schemas.js";`),
      "",
    ];

    for (const route of routes) {
      lines.push(`export const ${route.exportName} = {`);
      for (const response of route.responses) {
        lines.push(`  ${response.status}: ${response.schema},`);
      }
      lines.push("} as const;", "");
      lines.push(
        "export function parse" +
          route.exportName.replace(/Schemas$/, "") +
          "(status: number, value: unknown): unknown {",
        "  try {",
        "    const schema = " + route.exportName + "[status as keyof typeof " + route.exportName + "];",
        "    if (!schema) throw new Error(\"Unsupported response status: \" + status);",
        "    return schema.parse(value);",
        "  } catch (error) {",
        "    if (error instanceof z.ZodError) {",
        "      throw createApiError(500, \"OUTPUT_VALIDATION_ERROR\", \"Response validation failed.\", { route: " +
          JSON.stringify(route.name) +
          ", status, issues: error.issues });",
        "    }",
        "    throw error;",
        "  }",
        "}",
        "",
      );
    }

    return lines.join("\n");
  },
  { name: "route-output-validation" },
);

export function routeOutputValidationTemplateData(
  graph: ApplicationGraph,
): RouteOutputValidationTemplateData[] {
  const modelNames = new Set(
    graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => nodeName(node))
      .filter((name): name is string => name !== undefined)
  );
  const schemaNames = new Set(Object.keys(schemaDefinitions(graph)));
  const contextualNames = (names: ReadonlySet<string>): string[] =>
    ["Schema", "InputSchema", "OutputSchema", "PersistenceSchema"].flatMap((suffix) =>
      [...names].map((name) => `${name}${suffix}`),
    );
  const generatedSchemas = new Set([...contextualNames(modelNames), ...contextualNames(schemaNames)]);
  const routes = graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeName(node) ?? node.id;
      const values = node.data?.["responses"];
      if (!Array.isArray(values)) return undefined;
      const responses = values
        .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
        .map((value) => {
          const status = value["status"];
          if (!Number.isInteger(status) || Number(status) < 100 || Number(status) > 599) {
            throw new RouteOutputValidationGenerationError(
              `Invalid response status for route "${name}": "${String(status)}".`,
            );
          }
          const schemaValue = value["schema"];
          const references = new Set<string>();
          const schema =
            schemaValue && typeof schemaValue === "object"
              ? renderSchemaExpression(schemaValue as SchemaExpression, {
                  modelNames,
                  schemaNames,
                  mode: "output",
                  modelReferences: references,
                  schemaReferences: references,
                })
              : responseSchema(Number(status), schemaValue, name);
          if (/^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(schema) && !generatedSchemas.has(schema)) {
            throw new RouteOutputValidationGenerationError(
              `Schema reference "${schema}" does not match a generated schema.`,
            );
          }
          return { status: Number(status), schema, references: [...references] };
        })
        .sort((left, right) => left.status - right.status);
      if (responses.length === 0) return undefined;
      const schemaReferences = responses
        .flatMap((response) => response.references)
        .concat(
          responses
            .map((response) => response.schema)
            .filter((schema) => /^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(schema)),
        );
      return { name, exportName: exportName(name), responses, schemaReferences };
    })
    .filter((route): route is RouteOutputValidationTemplateData => route !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  return routes;
}

export function generateRouteOutputValidation(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = routeOutputValidationTemplateData(graph);
  if (data.length === 0) return undefined;
  return {
    path: "route-output-validation.ts",
    content: routeOutputValidationTemplate.render(data),
  };
}
