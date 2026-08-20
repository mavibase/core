import type { ApplicationGraph } from "@mavibase/application-graph";

import { generate, type GenerateResult } from "./index.js";
import {
  GeneratedCodeVerificationError,
  type GeneratedCodeTestingOptions,
  type GeneratedCodeVerificationResult,
  verifyGeneratedArtifacts,
} from "./generated-code-testing.js";
import { validateModelGeneration } from "./model-generation-validation.js";

export interface ModelGenerationVerificationOptions extends GeneratedCodeTestingOptions {
  outDir?: string;
}

function invalidResult(diagnostics: string[]): GeneratedCodeVerificationResult {
  return { valid: false, files: [], diagnostics, operations: [] };
}

export async function verifyModelGeneration(
  graph: ApplicationGraph,
  options?: ModelGenerationVerificationOptions,
): Promise<GeneratedCodeVerificationResult> {
  const validationOptions =
    options?.outDir === undefined ? undefined : { outDir: options.outDir };
  const issues = validateModelGeneration(graph, validationOptions);
  if (issues.length > 0) {
    return invalidResult(issues.map((issue) => `${issue.path}: ${issue.message}`));
  }
  const generateOptions = options?.outDir === undefined ? undefined : { outDir: options.outDir };
  const result: GenerateResult = generate(graph, generateOptions);
  return verifyGeneratedArtifacts(result.artifacts, {
    ...options,
    expectedPaths: options?.expectedPaths ?? result.artifacts.map((artifact) => artifact.path),
  });
}

export async function assertModelGeneration(
  graph: ApplicationGraph,
  options?: ModelGenerationVerificationOptions,
): Promise<GeneratedCodeVerificationResult> {
  const result = await verifyModelGeneration(graph, options);
  if (!result.valid) throw new GeneratedCodeVerificationError(result);
  return result;
}
