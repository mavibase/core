import type { RefinementDefinition, ScalarType, SchemaExpression, StructuredConstraint } from "@mavibase/core";
import { validateStructuredConstraints } from "@mavibase/core";
import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";
import { defineTemplate } from "./template.js";
import { renderSchemaExpression } from "./schema-expression-generator.js";

type ParameterLocation = "path" | "query" | "header" | "body";

interface RouteValidationParameter {
  name: string;
  location: ParameterLocation;
  schema: string | SchemaExpression;
  constraints: readonly StructuredConstraint[];
  required: boolean;
}

export interface RouteValidationTemplateData {
  routes: { name: string; schemaName: string; parameters: RouteValidationParameter[] }[];
  schemaReferences: string[];
  refinementImports: { importPath: string; exportName: string; localName: string }[];
}

export class RouteValidationGenerationError extends Error {
  readonly code = "MAVIBASE_ROUTE_VALIDATION_GENERATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RouteValidationGenerationError";
  }
}

const fieldSchemaMap: Readonly<Record<ScalarType, string>> = {
  string: "z.string()",
  integer: "z.number().int()",
  float: "z.number()",
  decimal: "z.number()",
  boolean: "z.boolean()",
  uuid: "z.string().uuid()",
  datetime: "z.coerce.date()",
  json: "z.unknown()",
  text: "z.string()",
  date: "z.coerce.date()",
  bigint: "z.bigint()",
};

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function refinementDefinitions(graph: ApplicationGraph): Record<string, RefinementDefinition> {
  const application = graph.nodes.find((node) => node.type === "application");
  const definitions = application?.data?.["definitions"];
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return {};
  const refinements = (definitions as Record<string, unknown>)["refinements"];
  if (!refinements || typeof refinements !== "object" || Array.isArray(refinements)) return {};
  return refinements as Record<string, RefinementDefinition>;
}

function schemaDefinitions(graph: ApplicationGraph): Record<string, SchemaExpression> {
  const application = graph.nodes.find((node) => node.type === "application");
  const definitions = application?.data?.["definitions"];
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return {};
  const schemas = (definitions as Record<string, unknown>)["schemas"];
  if (!schemas || typeof schemas !== "object" || Array.isArray(schemas)) return {};
  return schemas as Record<string, SchemaExpression>;
}

function applyConstraint(
  expression: string,
  constraint: StructuredConstraint,
  refinements: Record<string, RefinementDefinition>,
  imports: Map<string, { importPath: string; exportName: string; localName: string }>,
): string {
  if (constraint.kind === "minLength") return expression + ".min(" + constraint.value + ")";
  if (constraint.kind === "maxLength") return expression + ".max(" + constraint.value + ")";
  if (constraint.kind === "pattern") return expression + ".regex(new RegExp(" + JSON.stringify(constraint.value) + "))";
  if (constraint.kind === "min") return expression + ".min(" + constraint.value + ")";
  if (constraint.kind === "max") return expression + ".max(" + constraint.value + ")";
  if (constraint.kind === "email") return expression + ".email()";
  const definition = refinements[constraint.id];
  if (
    !definition ||
    typeof definition.importPath !== "string" ||
    !definition.importPath.startsWith(".") ||
    typeof definition.exportName !== "string"
  ) {
    throw new RouteValidationGenerationError(
      "Custom refinement reference cannot be resolved: \"" + constraint.id + "\".",
    );
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(definition.exportName)) {
    throw new RouteValidationGenerationError(
      "Custom refinement exportName is invalid: \"" + definition.exportName + "\".",
    );
  }
  const localName = "refine_" + constraint.id.replace(/[^A-Za-z0-9_$]/g, "_");
  imports.set(constraint.id, { importPath: definition.importPath, exportName: definition.exportName, localName });
  return expression + ".refine(" + localName + ")";
}

function schemaName(routeName: string): string {
  const parts = routeName.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  const value = parts.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("");
  return `${value || "Route"}RequestSchema`;
}

function legacyConstraints(expression: string): readonly StructuredConstraint[] | undefined {
  const value = expression.trim();
  if (value === "z.string().email()") return [{ kind: "email" }];
  const stringMin = value.match(/^z\.string\(\)\.min\((\d+)\)$/);
  if (stringMin) return [{ kind: "minLength", value: Number(stringMin[1]) }];
  const stringMax = value.match(/^z\.string\(\)\.max\((\d+)\)$/);
  if (stringMax) return [{ kind: "maxLength", value: Number(stringMax[1]) }];
  const numberMin = value.match(/^z\.number\(\)\.min\((-?\d+(?:\.\d+)?)\)$/);
  if (numberMin) return [{ kind: "min", value: Number(numberMin[1]) }];
  const numberMax = value.match(/^z\.number\(\)\.max\((-?\d+(?:\.\d+)?)\)$/);
  if (numberMax) return [{ kind: "max", value: Number(numberMax[1]) }];
  return undefined;
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
      const validation = parameter["validation"];
      const constraints = [...((parameter["constraints"] as StructuredConstraint[] | undefined) ?? [])];
      if (typeof validation === "string" && !validation.trim()) {
        throw new RouteValidationGenerationError(
          `Invalid validation expression for route parameter "${name}".`,
        );
      }
      if (typeof schema === "string" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(schema)) {
        throw new RouteValidationGenerationError(
          `Invalid schema reference for route parameter "${name}": "${schema}".`,
        );
      }
      if (typeof validation === "string") {
        const legacy = legacyConstraints(validation);
        if (!legacy) {
          throw new RouteValidationGenerationError(
            "Legacy validation expression for route parameter \"" + name + "\" is unsupported; use structured constraints.",
          );
        }
        constraints.push(...legacy);
      }
      for (const message of validateStructuredConstraints(constraints)) {
        throw new RouteValidationGenerationError(
          "Invalid constraints for route parameter \"" + name + "\": " + message,
        );
      }
      return {
        name,
        location: location as ParameterLocation,
        schema:
          typeof schema === "string" && schema.trim()
            ? schema
            : typeof type === "string" && type in fieldSchemaMap
              ? fieldSchemaMap[type as ScalarType]
              : "z.unknown()",
        required: parameter["required"] === true,
        constraints,
      };
    })
    .filter((parameter): parameter is RouteValidationParameter => parameter !== undefined)
    .sort((left, right) =>
      `${left.location}:${left.name}`.localeCompare(`${right.location}:${right.name}`),
    );
}

export const routeValidationTemplate = defineTemplate<RouteValidationTemplateData>(
  ({ routes, schemaReferences, refinementImports }) => {
    const lines = [
      'import { z } from "zod";',
      'import { createApiError } from "./api-errors.js";',
      ...schemaReferences.map((reference) => `import { ${reference} } from "./schemas.js";`),
      ...refinementImports.map(
        (refinement) =>
          "import { " + refinement.exportName + " as " + refinement.localName + " } from " +
          JSON.stringify(refinement.importPath) + ";",
      ),
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
      const parserName = schemaName(route.name).replace(/Schema$/, "");
      const pathExpression = route.parameters.some((parameter) => parameter.location === "path")
        ? route.schemaName + ".path.parse(input.params) as Record<string, unknown>"
        : "input.params as Record<string, unknown>";
      const queryExpression = route.parameters.some((parameter) => parameter.location === "query")
        ? route.schemaName + ".query.parse(input.query) as Record<string, unknown>"
        : "input.query as Record<string, unknown>";
      const headersExpression = route.parameters.some((parameter) => parameter.location === "header")
        ? route.schemaName + ".headers.parse(input.headers) as Record<string, unknown>"
        : "input.headers as Record<string, unknown>";
      const bodyExpression = route.parameters.some((parameter) => parameter.location === "body")
        ? route.schemaName + ".body.parse(input.body)"
        : "input.body";
      lines.push(
        "export function parse" +
          parserName +
          "(input: { params: unknown; query: unknown; headers: unknown; body: unknown }): { params: Record<string, unknown>; query: Record<string, unknown>; headers: Record<string, unknown>; body: unknown } {",
        "  try {",
        "    return {",
        "      params: " + pathExpression + ",",
        "      query: " + queryExpression + ",",
        "      headers: " + headersExpression + ",",
        "      body: " + bodyExpression + ",",
        "    };",
        "  } catch (error) {",
        "    if (error instanceof z.ZodError) {",
        "      throw createApiError(400, \"VALIDATION_ERROR\", \"Request validation failed.\", { route: " +
          JSON.stringify(route.name) +
          ", issues: error.issues });",
        "    }",
        "    throw error;",
        "  }",
        "}",
        "",
      );
    }
    return lines.join("\n");
  },
  { name: "route-validation" },
);

export function routeValidationTemplateData(graph: ApplicationGraph): RouteValidationTemplateData {
  const imports = new Map<string, { importPath: string; exportName: string; localName: string }>();
  const refinements = refinementDefinitions(graph);
  const modelNames = new Set(
    graph.nodes
      .filter((node) => node.type === "model")
      .map((node) => nodeName(node))
      .filter((name): name is string => name !== undefined),
  );
  const schemaNames = new Set(Object.keys(schemaDefinitions(graph)));
  const schemaExpressionReferences = new Set<string>();
  const routes = graph.nodes
    .filter((node) => node.type === "route")
    .map((node) => {
      const name = nodeName(node) ?? node.id;
      const parameters = routeParameters(node).map((parameter) => ({
        ...parameter,
        schema: parameter.constraints.reduce(
          (expression, constraint) => applyConstraint(expression, constraint, refinements, imports),
          typeof parameter.schema === "string"
            ? parameter.schema
            : renderSchemaExpression(parameter.schema, {
                modelNames,
                schemaNames,
                modelReferences: schemaExpressionReferences,
                schemaReferences: schemaExpressionReferences,
              }),
        ),
      }));
      return { name, schemaName: schemaName(name), parameters };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const schemaReferences = [
    ...new Set(
      routes
        .flatMap((route) => route.parameters)
        .map((parameter) => parameter.schema)
        .filter((schema) => /^[A-Za-z_$][A-Za-z0-9_$]*Schema$/.test(schema)),
    ),
    ...schemaExpressionReferences,
  ].sort((left, right) => left.localeCompare(right));
  const modelSchemas = new Set([...modelNames].map((name) => `${name}Schema`));
  const generatedSchemas = new Set([...modelSchemas, ...[...schemaNames].map((name) => `${name}Schema`)]);
  const missingSchema = schemaReferences.find((reference) => !generatedSchemas.has(reference));
  if (missingSchema) {
    throw new RouteValidationGenerationError(
      `Schema reference "${missingSchema}" does not match a generated model schema.`,
    );
  }

  return {
    routes,
    schemaReferences,
    refinementImports: [...imports.values()].sort((left, right) =>
      left.localName.localeCompare(right.localName),
    ),
  };
}

export function generateRouteValidation(graph: ApplicationGraph): GeneratedFile | undefined {
  const data = routeValidationTemplateData(graph);
  if (data.routes.length === 0) return undefined;
  return { path: "route-schemas.ts", content: routeValidationTemplate.render(data) };
}
