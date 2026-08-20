import type { ApplicationGraph } from "@mavibase/application-graph";
import type { Diagnostic, StackConfig } from "@mavibase/core";

import {
  generate,
  version,
  type GeneratedFile,
  type GenerateOptions,
} from "./index.js";
import type { FileOperationPlan, Filesystem } from "./filesystem.js";
import { createGenerationManifest, type GenerationManifest } from "./generation-manifest.js";

export interface GenerationInput {
  graph: ApplicationGraph;
  stack?: StackConfig;
  options?: GenerateOptions;
}

export interface GenerationPlan {
  artifacts: readonly GeneratedFile[];
  operations: readonly FileOperationPlan[];
  diagnostics: readonly Diagnostic[];
  manifest: GenerationManifest;
}

function artifactPath(artifact: GeneratedFile): string {
  return artifact.path.replaceAll("\\", "/");
}

export async function planGeneration(
  input: GenerationInput,
  filesystem: Filesystem,
): Promise<GenerationPlan> {
  void input.stack;
  const result = generate(input.graph, input.options);
  const artifacts = [...result.artifacts]
    .map((artifact) => ({ ...artifact, path: artifactPath(artifact) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const writePlan = await filesystem.plan(artifacts);
  return {
    artifacts,
    operations: writePlan.operations,
    diagnostics: [],
    manifest: createGenerationManifest(filesystem.targetRoot, artifacts, version),
  };
}
