import type { ApplicationDefinition } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";
import { buildGraph } from "@mavibase/application-graph";

import { generateModels } from "./model-generator.js";
import { generateTypes } from "./type-generator.js";
import { generateZodSchemas } from "./zod-generator.js";

export const version = "0.1.0";

export interface GenerateOptions {
  outDir?: string;
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

export function generate(graph: ApplicationGraph, options?: GenerateOptions): GenerateResult {
  const artifacts: GeneratedFile[] = [];

  const modelFile = generateModels(graph);

  if (modelFile) {
    artifacts.push(modelFile);
  }

  const zodFile = generateZodSchemas(graph);

  if (zodFile) {
    artifacts.push(zodFile);
  }

  const typeFile = generateTypes(graph);

  if (typeFile) {
    artifacts.push(typeFile);
  }

  const outDir = options?.outDir ?? "generated";

  return {
    files: artifacts.map((artifact) => `${outDir}/${artifact.path}`),
    artifacts,
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
export * from "./model-generator.js";
export * from "./template.js";
export * from "./type-generator.js";
export * from "./zod-generator.js";
