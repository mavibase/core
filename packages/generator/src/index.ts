import { normalizeDefinition, type ApplicationDefinition, type Diagnostic } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";
import { buildGraph, validateGraphResult } from "@mavibase/application-graph";

import { generateModelMetadata, generateModels } from "./model-generator.js";
import { generateRelationships } from "./relationship-generator.js";
import { generateQueryHelpers } from "./query-helper-generator.js";
import { generateModelTests } from "./model-test-generator.js";
import { assertModelGenerationValid } from "./model-generation-validation.js";
import { generateTypes } from "./type-generator.js";
import { generateZodSchemas } from "./zod-generator.js";
import { generateRouteValidation } from "./route-validation-generator.js";
import { generateRouteResponses } from "./route-response-generator.js";
import { generateRouteOutputValidation } from "./route-output-validation-generator.js";
import { generateRouteHandlers, type HandlerFramework } from "./route-handler-generator.js";
import { generateRouteMiddleware } from "./route-middleware-generator.js";
import { generateApiErrors } from "./api-error-generator.js";
import { generateOpenApiDocument } from "./openapi-generator.js";

export const version = "0.1.0";

export interface GenerateOptions {
  outDir?: string;
  layout?: "flat" | "structured";
  framework?: HandlerFramework;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateResult {
  files: string[];
  artifacts: GeneratedFile[];
}

export class GenerationValidationError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(message: string, diagnostics: readonly Diagnostic[]) {
    super(message);
    this.name = "GenerationValidationError";
    this.diagnostics = diagnostics;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function structuredArtifact(artifact: GeneratedFile): GeneratedFile {
  const paths: Readonly<Record<string, string>> = {
    "models.ts": "models/index.ts",
    "model-metadata.ts": "models/metadata.ts",
    "relationships.ts": "models/relationships.ts",
    "model-tests.ts": "models/tests.ts",
    "query-helpers.ts": "queries/index.ts",
    "schemas.ts": "schemas/index.ts",
    "types.ts": "types/index.ts",
    "route-schemas.ts": "routes/schemas.ts",
    "route-responses.ts": "routes/responses.ts",
    "route-output-validation.ts": "routes/output-validation.ts",
    "route-handlers.ts": "controllers/index.ts",
    "route-middleware.ts": "middleware/index.ts",
    "api-errors.ts": "errors/index.ts",
    "openapi.ts": "docs/openapi.ts",
  };
  const path = paths[artifact.path] ?? artifact.path;
  let content = artifact.content;

  if (artifact.path === "query-helpers.ts") {
    content = content.replaceAll('from "./types.js"', 'from "../types/index.js"');
  }
  if (artifact.path === "model-tests.ts") {
    content = content.replaceAll('from "./model-metadata.js"', 'from "./metadata.js"');
    content = content.replaceAll('from "./schemas.js"', 'from "../schemas/index.js"');
  }
  if (artifact.path === "route-schemas.ts") {
    content = content.replaceAll('from "./schemas.js"', 'from "../schemas/index.js"');
  }
  if (artifact.path === "route-responses.ts") {
    content = content.replaceAll('from "./schemas.js"', 'from "../schemas/index.js"');
  }
  if (artifact.path === "route-output-validation.ts") {
    content = content.replaceAll('from "./schemas.js"', 'from "../schemas/index.js"');
  }
  if (artifact.path === "route-handlers.ts") {
    content = content.replaceAll('from "./api-errors.js"', 'from "../errors/index.js"');
  }

  return { path, content };
}

export function generate(graph: ApplicationGraph, options?: GenerateOptions): GenerateResult {
  const graphResult = validateGraphResult(graph);
  if (!graphResult.valid) {
    throw new GenerationValidationError(
      `Invalid application graph: ${graphResult.diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`,
      graphResult.diagnostics,
    );
  }

  assertModelGenerationValid(
    graph,
    options?.outDir === undefined ? undefined : { outDir: options.outDir },
  );
  const artifacts: GeneratedFile[] = [];

  const modelFile = generateModels(graph);

  if (modelFile) {
    artifacts.push(modelFile);
  }

  const modelMetadataFile = generateModelMetadata(graph);

  if (modelMetadataFile) {
    artifacts.push(modelMetadataFile);
  }

  const relationshipFile = generateRelationships(graph);

  if (relationshipFile) {
    artifacts.push(relationshipFile);
  }

  const queryHelpersFile = generateQueryHelpers(graph);

  if (queryHelpersFile) {
    artifacts.push(queryHelpersFile);
  }

  const zodFile = generateZodSchemas(graph);

  if (zodFile) {
    artifacts.push(zodFile);
  }

  const typeFile = generateTypes(graph);

  if (typeFile) {
    artifacts.push(typeFile);
  }

  const modelTestsFile = generateModelTests(graph);

  if (modelTestsFile) {
    artifacts.push(modelTestsFile);
  }

  const routeValidationFile = generateRouteValidation(graph);

  if (routeValidationFile) {
    artifacts.push(routeValidationFile);
  }

  const routeResponsesFile = generateRouteResponses(graph);

  if (routeResponsesFile) {
    artifacts.push(routeResponsesFile);
  }

  const routeOutputValidationFile = generateRouteOutputValidation(graph);

  if (routeOutputValidationFile) {
    artifacts.push(routeOutputValidationFile);
  }

  const routeHandlersFile = generateRouteHandlers(graph, options?.framework);

  if (routeHandlersFile) {
    artifacts.push(routeHandlersFile);
  }

  const routeMiddlewareFile = generateRouteMiddleware(graph);

  if (routeMiddlewareFile) {
    artifacts.push(routeMiddlewareFile);
  }

  const apiErrorsFile = generateApiErrors(graph);

  if (apiErrorsFile) {
    artifacts.push(apiErrorsFile);
  }

  const openApiFile = generateOpenApiDocument(graph);

  if (openApiFile) {
    artifacts.push(openApiFile);
  }

  const outDir = options?.outDir ?? "generated";
  const outputArtifacts =
    options?.layout === "structured" ? artifacts.map(structuredArtifact) : artifacts;

  return {
    files: outputArtifacts.map((artifact) => `${outDir}/${artifact.path}`),
    artifacts: outputArtifacts,
  };
}

export function generateFromDefinition(
  definition: ApplicationDefinition,
  options?: GenerateOptions,
): GenerateResult {
  const definitionResult = normalizeDefinition(definition);
  if (!definitionResult.valid || !definitionResult.value) {
    throw new GenerationValidationError(
      `Invalid application definition: ${definitionResult.diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`,
      definitionResult.diagnostics,
    );
  }

  const graph = buildGraph(definitionResult.value);
  const graphResult = validateGraphResult(graph);
  if (!graphResult.valid) {
    throw new GenerationValidationError(
      `Invalid application graph: ${graphResult.diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`,
      graphResult.diagnostics,
    );
  }

  return generate(graph, options);
}

export { slugify };
export * from "./filesystem.js";
export * from "./generated-code-testing.js";
export * from "./database-validation.js";
export * from "./model-generator.js";
export * from "./relationship-generator.js";
export * from "./query-helper-generator.js";
export * from "./model-validation.js";
export * from "./model-generation-validation.js";
export * from "./model-test-generator.js";
export * from "./model-generation-testing.js";
export * from "./migration-generator.js";
export * from "./postgresql-generator.js";
export * from "./sql-generator.js";
export * from "./seed-generator.js";
export * from "./template.js";
export * from "./type-generator.js";
export * from "./zod-generator.js";
export * from "./route-validation-generator.js";
export * from "./route-response-generator.js";
export * from "./route-output-validation-generator.js";
export * from "./route-handler-generator.js";
export * from "./route-middleware-generator.js";
export * from "./api-error-generator.js";
export * from "./openapi-generator.js";
export * from "./schema-normalizer.js";
export * from "./generation-plan.js";
export * from "./generation-manifest.js";
