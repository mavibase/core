import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import type { FieldDefinition, SemanticType } from "@mavibase/core";
import { requireGeneratorFieldContext } from "./field-context.js";

interface OpenApiParameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

function value(node: GraphNode, key: string): string | undefined {
  const candidate = node.data?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function schemaFor(type: unknown): Record<string, unknown> {
  const map: Readonly<Record<string, Record<string, unknown>>> = {
    string: { type: "string" },
    integer: { type: "integer" },
    float: { type: "number", format: "float" },
    decimal: { type: "number" },
    boolean: { type: "boolean" },
    uuid: { type: "string", format: "uuid" },
    datetime: { type: "string", format: "date-time" },
    json: {},
  };
  return map[String(type)] ?? {};
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function routeParameters(route: GraphNode): { parameters: OpenApiParameter[]; body?: unknown } {
  const values = route.data?.["parameters"];
  if (!Array.isArray(values)) return { parameters: [] };
  const parameters: OpenApiParameter[] = [];
  let body: unknown;
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const parameter = value as Record<string, unknown>;
    const name = parameter["name"];
    const location = parameter["location"];
    if (typeof name !== "string" || typeof location !== "string") continue;
    const schema =
      typeof parameter["schema"] === "string"
        ? { $ref: `#/components/schemas/${parameter["schema"]}` }
        : schemaFor(parameter["type"]);
    if (location === "body") {
      body = {
        required: parameter["required"] === true,
        content: { "application/json": { schema } },
      };
      continue;
    }
    parameters.push({
      name,
      in: location,
      required: parameter["required"] === true || location === "path",
      ...(typeof parameter["description"] === "string"
        ? { description: parameter["description"] }
        : {}),
      schema,
    });
  }
  return {
    parameters: parameters.sort((left, right) =>
      `${left.in}:${left.name}`.localeCompare(`${right.in}:${right.name}`),
    ),
    ...(body === undefined ? {} : { body }),
  };
}

function routeResponses(route: GraphNode): Record<string, unknown> {
  const values = route.data?.["responses"];
  if (!Array.isArray(values) || values.length === 0) {
    return { "200": { description: "Successful response" } };
  }
  const responses: Record<string, unknown> = {};
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const response = value as Record<string, unknown>;
    const status = response["status"];
    if (!Number.isInteger(status)) continue;
    const contentType =
      typeof response["contentType"] === "string" ? response["contentType"] : "application/json";
    const schema =
      typeof response["schema"] === "string"
        ? { $ref: `#/components/schemas/${response["schema"]}` }
        : undefined;
    responses[String(status)] = {
      description:
        typeof response["description"] === "string" ? response["description"] : "Response",
      ...(schema === undefined ? {} : { content: { [contentType]: { schema } } }),
    };
  }
  return responses;
}

function modelComponents(graph: ApplicationGraph): Record<string, unknown> {
  const components: Record<string, unknown> = {};
  for (const model of graph.nodes.filter((node) => node.type === "model")) {
    const modelName = value(model, "name");
    if (!modelName) continue;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const edge of graph.edges.filter(
      (candidate) => candidate.from === model.id && candidate.type === "has-field",
    )) {
      const field = graph.nodes.find((node) => node.id === edge.to && node.type === "field");
      const fieldName = field ? value(field, "name") : undefined;
      if (!field || !fieldName) continue;
      const context = requireGeneratorFieldContext(
        {
          type: field.data?.["type"] as SemanticType,
          ...(field.data?.["modifiers"] === undefined
            ? {}
            : { modifiers: field.data["modifiers"] as NonNullable<FieldDefinition["modifiers"]> }),
          ...(field.data?.["validation"] === undefined
            ? {}
            : { validation: field.data["validation"] as string }),
        },
        `models.${modelName}.fields.${fieldName}`,
      );
      properties[fieldName] = context.openApiSchema;
      const modifiers = field.data?.["modifiers"];
      if (
        modifiers &&
        typeof modifiers === "object" &&
        (modifiers as Record<string, unknown>)["required"] === true
      ) {
        required.push(fieldName);
      }
    }
    components[`${modelName}Schema`] = {
      type: "object",
      properties,
      ...(required.length === 0 ? {} : { required: required.sort() }),
    };
  }
  return components;
}

export function generateOpenApiDocument(graph: ApplicationGraph): GeneratedFile | undefined {
  const routes = graph.nodes.filter((node) => node.type === "route");
  if (routes.length === 0) return undefined;
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of [...routes].sort((left, right) =>
    (value(left, "name") ?? left.id).localeCompare(value(right, "name") ?? right.id),
  )) {
    const path = openApiPath(value(route, "path") ?? "/");
    const method = (value(route, "method") ?? "GET").toLowerCase();
    const routeName = value(route, "name") ?? route.id;
    const request = routeParameters(route);
    paths[path] ??= {};
    paths[path][method] = {
      operationId: routeName,
      ...(value(route, "description") === undefined
        ? {}
        : { description: value(route, "description") }),
      ...(request.parameters.length === 0 ? {} : { parameters: request.parameters }),
      ...(request.body === undefined ? {} : { requestBody: request.body }),
      responses: routeResponses(route),
    };
  }
  const components = modelComponents(graph);
  const document = {
    openapi: "3.1.0",
    info: { title: graph.name, version: graph.version },
    paths,
    ...(Object.keys(components).length === 0 ? {} : { components: { schemas: components } }),
  };
  return {
    path: "openapi.ts",
    content: `export const openApiDocument = ${JSON.stringify(document, null, 2)} as const;\n`,
  };
}
