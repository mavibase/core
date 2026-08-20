import type { ApplicationDefinition } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";
import { buildGraph } from "@mavibase/application-graph";

import { generateModelMetadata, generateModels } from "./model-generator.js";
import { generateRelationships } from "./relationship-generator.js";
import { generateQueryHelpers } from "./query-helper-generator.js";
import { generateModelTests } from "./model-test-generator.js";
import { assertModelGenerationValid } from "./model-generation-validation.js";
import { generateTypes } from "./type-generator.js";
import { generateZodSchemas } from "./zod-generator.js";
import { generateRouteValidation } from "./route-validation-generator.js";
import { generateRouteResponses } from "./route-response-generator.js";
import { generateRouteHandlers, type HandlerFramework } from "./route-handler-generator.js";

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
    "route-handlers.ts": "controllers/index.ts",
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

  return { path, content };
}

export function generate(graph: ApplicationGraph, options?: GenerateOptions): GenerateResult {
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

  const routeHandlersFile = generateRouteHandlers(graph, options?.framework);

  if (routeHandlersFile) {
    artifacts.push(routeHandlersFile);
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
  const graph = buildGraph(definition);

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
export * from "./route-handler-generator.js";
