import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";
import type { CrudOperation } from "@mavibase/core";

import type {
  ControllerGenerator,
  GeneratorContext,
  RepositoryGenerator,
  RouteRegistrationGenerator,
} from "./generator-interfaces.js";
import type { GeneratedFile } from "./index.js";
import { crudValidationParserName } from "./route-validation-generator.js";

interface CrudModel {
  id: string;
  name: string;
  operations: CrudOperation[];
}

const operationOrder: readonly CrudOperation[] = [
  "list",
  "get",
  "create",
  "replace",
  "update",
  "delete",
];

function graphFramework(graph: ApplicationGraph): string | undefined {
  const application = graph.nodes.find((node) => node.type === "application");
  const stack = application?.data?.["stack"];
  if (!stack || typeof stack !== "object") return undefined;
  const backend = (stack as Record<string, unknown>)["backend"];
  if (!backend || typeof backend !== "object") return undefined;
  const framework = (backend as Record<string, unknown>)["framework"];
  return typeof framework === "string" ? framework : undefined;
}

export function backendFrameworkFromGraph(graph: ApplicationGraph): string | undefined {
  return graphFramework(graph);
}

function symbolName(value: string): string {
  const symbol = value
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1))
    .join("");
  return symbol || "Model";
}

function propertyName(value: string): string {
  const symbol = symbolName(value);
  return symbol[0]?.toLowerCase() + symbol.slice(1);
}

function pluralPath(value: string): string {
  const path = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (path.endsWith("y") && !/[aeiou]y$/.test(path)) return `${path.slice(0, -1)}ies`;
  if (path.endsWith("s")) return `${path}es`;
  return `${path}s`;
}

function crudModels(graph: ApplicationGraph): CrudModel[] {
  return graph.nodes
    .filter((node): node is GraphNode & { data: Record<string, unknown> } =>
      node.type === "model" && node.data !== undefined,
    )
    .map((node) => {
      const crud = node.data["crud"];
      if (!crud || typeof crud !== "object") return undefined;
      const operations = (crud as Record<string, unknown>)["operations"];
      if (!operations || typeof operations !== "object") return undefined;
      const enabled = (crud as Record<string, unknown>)["enabled"];
      if (enabled !== true) return undefined;
      const selected = operationOrder.filter((operation) => (operations as Record<string, unknown>)[operation] === true);
      if (selected.length === 0) return undefined;
      const name = node.data["name"];
      if (typeof name !== "string" || !name.trim()) return undefined;
      return { id: node.id, name, operations: selected };
    })
    .filter((model): model is CrudModel => model !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function operationControllerName(model: CrudModel, operation: CrudOperation): string {
  const modelSymbol = symbolName(model.name);
  const operationNames: Record<CrudOperation, string> = {
    list: "List",
    get: "Get",
    create: "Create",
    replace: "Replace",
    update: "Update",
    delete: "Delete",
  };
  return `create${operationNames[operation]}${modelSymbol}Controller`;
}

function operationMethod(operation: CrudOperation): string {
  const methods: Record<CrudOperation, string> = {
    list: "get",
    get: "get",
    create: "post",
    replace: "put",
    update: "patch",
    delete: "delete",
  };
  return methods[operation];
}

function operationPath(model: CrudModel, operation: CrudOperation): string {
  const path = `/${pluralPath(model.name)}`;
  return operation === "list" || operation === "create" ? path : `${path}/:id`;
}

function supportsExpress(context: GeneratorContext): boolean {
  return context.framework === "express";
}

function controllerContent(models: readonly CrudModel[]): string {
  const lines = [
    'import type { NextFunction, Request, Response } from "express";',
    'import { createApiError } from "./api-errors.js";',
    'import type { CrudRepositories } from "./express-crud-repositories.js";',
    `import { ${models.flatMap((model) => model.operations.map((operation) => `parse${crudValidationParserName(model.name, operation)}`)).join(", ")} } from "./route-schemas.js";`,
    "",
    "export type CrudController = (request: Request, response: Response, next: NextFunction) => Promise<void>;",
    "",
    "export interface CrudControllerDependencies {",
    "  repositories: CrudRepositories;",
    "}",
    "",
  ];

  for (const model of models) {
    const property = propertyName(model.name);
    for (const operation of model.operations) {
      const status = operation === "create" ? 201 : operation === "delete" ? 204 : 200;
      lines.push(
        `export function ${operationControllerName(model, operation)}(deps: CrudControllerDependencies) {`,
        "  return async function controller(request: Request, response: Response, next: NextFunction): Promise<void> {",
        "    try {",
        `      const input = parse${crudValidationParserName(model.name, operation)}({ params: request.params, query: request.query, headers: request.headers, body: request.body });`,
        operation === "list"
          ? `      const result = await deps.repositories.${property}.list({ ...input, page: input.query.page as number, limit: input.query.limit as number });`
          : operation === "create"
            ? `      const result = await deps.repositories.${property}.create({ ...input, body: input.body as Record<string, unknown> });`
            : operation === "replace"
              ? `      const result = await deps.repositories.${property}.replace({ ...input, body: input.body as Record<string, unknown> });`
          : operation === "update"
                ? `      const result = await deps.repositories.${property}.update({ ...input, body: input.body as Record<string, unknown> });`
                : `      const result = await deps.repositories.${property}.${operation}(input);`,
        ...(["get", "replace", "update"].includes(operation)
          ? [`      if (result === undefined || result === null) throw createApiError(404, "NOT_FOUND", "Resource not found.");`]
          : []),
        ...(operation === "delete"
          ? [`      if (result !== true) throw createApiError(404, "NOT_FOUND", "Resource not found.");`]
          : []),
        operation === "delete"
          ? `      response.status(${status}).send();`
          : `      response.status(${status}).json(result);`,
        "    } catch (error) {",
        "      next(error);",
        "    }",
        "  };",
        "}",
        "",
      );
    }
  }
  return lines.join("\n");
}

function repositoryContent(models: readonly CrudModel[]): string {
  const lines = [
    "export interface CrudRequestInput {",
    "  params: Record<string, unknown>;",
    "  query: Record<string, unknown>;",
    "  body: unknown;",
    "}",
    "",
    "export interface CrudListInput extends CrudRequestInput {",
    "  page: number;",
    "  limit: number;",
    "}",
    "",
    "export interface CrudCreateInput extends CrudRequestInput {",
    "  body: Record<string, unknown>;",
    "}",
    "",
    "export interface CrudReplaceInput extends CrudRequestInput {",
    "  body: Record<string, unknown>;",
    "}",
    "",
    "export interface CrudPatchInput extends CrudRequestInput {",
    "  body: Record<string, unknown>;",
    "}",
    "",
    "export interface CrudPagination {",
    "  page: number;",
    "  limit: number;",
    "  total: number;",
    "  totalPages: number;",
    "}",
    "",
    "export interface CrudListResult {",
    "  items: unknown[];",
    "  pagination: CrudPagination;",
    "}",
    "",
  ];
  for (const model of models) {
    const property = propertyName(model.name);
    const typeName = `${symbolName(model.name)}Repository`;
    lines.push(`export interface ${typeName} {`);
    for (const operation of model.operations) {
      lines.push(
        operation === "list"
          ? "  list(input: CrudListInput): Promise<CrudListResult>;"
          : operation === "create"
            ? "  create(input: CrudCreateInput): Promise<unknown>;"
            : operation === "replace"
              ? "  replace(input: CrudReplaceInput): Promise<unknown>;"
          : operation === "update"
                ? "  update(input: CrudPatchInput): Promise<unknown>;"
                : operation === "delete"
                  ? "  delete(input: CrudRequestInput): Promise<boolean>;"
                : `  ${operation}(input: CrudRequestInput): Promise<unknown>;`,
      );
    }
    lines.push("}", "");
    lines.push(`export type ${symbolName(model.name)}RepositoryKey = "${property}";`, "");
  }
  lines.push("export interface CrudRepositories {");
  for (const model of models) {
    lines.push(`  ${propertyName(model.name)}: ${symbolName(model.name)}Repository;`);
  }
  lines.push("}", "");
  lines.push("export function createDefaultCrudRepositories(): CrudRepositories {");
  lines.push("  const notImplemented = async (): Promise<never> => { throw new Error(\"Implement the generated repository operation.\"); };", "  return {");
  for (const model of models) {
    lines.push(`    ${propertyName(model.name)}: {`);
    for (const operation of model.operations) lines.push(`      ${operation}: notImplemented,`);
    lines.push("    },");
  }
  lines.push("  };", "}", "");
  return lines.join("\n");
}

function routeContent(models: readonly CrudModel[]): string {
  const lines = [
    'import type { Express } from "express";',
    'import {',
    ...models.flatMap((model) => model.operations.map((operation) => `  ${operationControllerName(model, operation)},`)),
    '} from "./express-crud-controllers.js";',
    'import type { CrudController, CrudControllerDependencies } from "./express-crud-controllers.js";',
    "",
    "export type CrudControllerOverrides = Partial<Record<\"list\" | \"get\" | \"create\" | \"replace\" | \"update\" | \"delete\", CrudController>>;",
    "",
    "export interface CrudRouteOverrides {",
    ...models.map((model) => `  ${propertyName(model.name)}?: CrudControllerOverrides;`),
    "}",
    "",
    "export function registerCrudRoutes(app: Express, deps: CrudControllerDependencies, overrides: CrudRouteOverrides = {}): void {",
  ];
  for (const model of models) {
    for (const operation of model.operations) {
      lines.push(`  app.${operationMethod(operation)}(${JSON.stringify(operationPath(model, operation))}, overrides.${propertyName(model.name)}?.${operation} ?? ${operationControllerName(model, operation)}(deps));`);
    }
  }
  lines.push("}", "");
  return lines.join("\n");
}

function component<T extends "controller" | "repository" | "route-registration">(
  name: string,
  kind: T,
  path: string,
  render: (models: readonly CrudModel[]) => string,
): Extract<ControllerGenerator | RepositoryGenerator | RouteRegistrationGenerator, { kind: T }> {
  return {
    name,
    kind,
    supportedFrameworks: ["express"],
    supports: supportsExpress,
    generate(context: GeneratorContext) {
      const models = crudModels(context.graph);
      return models.length === 0 ? [] : [{ path, content: render(models) }];
    },
  } as unknown as Extract<ControllerGenerator | RepositoryGenerator | RouteRegistrationGenerator, { kind: T }>;
}

export const expressControllerGenerator = component(
  "express-crud-controller-generator",
  "controller",
  "express-crud-controllers.ts",
  controllerContent,
);

export const expressRepositoryGenerator = component(
  "express-crud-repository-generator",
  "repository",
  "express-crud-repositories.ts",
  repositoryContent,
);

export const expressCrudRouteRegistrationGenerator = component(
  "express-crud-route-registration-generator",
  "route-registration",
  "express-crud-routes.ts",
  routeContent,
);

const extensionDocumentation: GeneratedFile = {
  path: "express-crud-extension.md",
  content: `# Extending generated Express CRUD\n\nGenerated CRUD files are replaceable infrastructure. Do not edit them directly.\n\nCreate a developer-owned file outside the generated directory, for example \`src/mavibase/crud-extensions.ts\`, and provide custom repositories or controllers when wiring the generated routes:\n\n\`\`\`ts\nimport type { CrudRepositories } from "../generated/repositories/index.js";\nimport type { CrudRouteOverrides } from "../generated/routes/crud.js";\n\nexport const repositories: CrudRepositories = {\n  // Implement the generated repository methods here.\n};\n\nexport const controllers: CrudRouteOverrides = {\n  // Override only the operations that need custom behavior.\n};\n\`\`\`\n\nPass these values to \`registerCrudRoutes(app, { repositories }, controllers)\`. Mavibase does not generate or overwrite files outside its configured generated directory.\n`,
};

export function createExpressCrudArtifacts(context: GeneratorContext): readonly GeneratedFile[] {
  if (!supportsExpress(context)) return [];
  const artifacts = [
    ...expressControllerGenerator.generate(context),
    ...expressRepositoryGenerator.generate(context),
    ...expressCrudRouteRegistrationGenerator.generate(context),
  ];
  return artifacts.length === 0 ? [] : [...artifacts, extensionDocumentation];
}
