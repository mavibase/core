import type { ApplicationGraph } from "@mavibase/application-graph";

import { validateModelGraph, type ModelValidationIssue } from "./model-validation.js";

export interface ModelGenerationValidationOptions {
  outDir?: string;
}

export class ModelGenerationValidationError extends Error {
  readonly code = "MAVIBASE_MODEL_GENERATION_VALIDATION_ERROR";
  readonly issues: readonly ModelValidationIssue[];

  constructor(issues: readonly ModelValidationIssue[]) {
    super(`Model generation validation failed with ${issues.length} issue(s).`);
    this.name = "ModelGenerationValidationError";
    this.issues = issues;
  }
}

function validateOutputDirectory(outDir: string): ModelValidationIssue[] {
  const candidate = outDir.replaceAll("\\", "/").trim();
  if (!candidate || candidate.startsWith("/") || /^[A-Za-z]:/.test(candidate)) {
    return [
      {
        category: "output",
        path: "options.outDir",
        message: "Output directory must be a non-empty relative path.",
      },
    ];
  }
  if (candidate.split("/").some((part) => part === "..")) {
    return [
      {
        category: "output",
        path: "options.outDir",
        message: "Output directory must not contain path traversal.",
      },
    ];
  }
  return [];
}

export function validateModelGeneration(
  graph: ApplicationGraph,
  options?: ModelGenerationValidationOptions,
): ModelValidationIssue[] {
  return [
    ...validateModelGraph(graph),
    ...(options?.outDir === undefined ? [] : validateOutputDirectory(options.outDir)),
  ];
}

export function assertModelGenerationValid(
  graph: ApplicationGraph,
  options?: ModelGenerationValidationOptions,
): void {
  const issues = validateModelGeneration(graph, options);
  if (issues.length > 0) throw new ModelGenerationValidationError(issues);
}
