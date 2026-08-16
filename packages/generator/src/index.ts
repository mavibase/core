import type { ApplicationDefinition } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";

export const version = "0.1.0";

/**
 * Options that control code generation.
 */
export interface GenerateOptions {
  /**
   * Output directory for generated code.
   */
  outDir?: string;
}

/**
 * Result of a code generation run.
 */
export interface GenerateResult {
  /**
   * List of file paths that were generated.
   */
  files: string[];
}

/**
 * Generate source code from an application graph.
 *
 * The implementation will be built out in later phases. Currently returns
 * an empty result.
 */
export function generate(_graph: ApplicationGraph, _options?: GenerateOptions): GenerateResult {
  return {
    files: [],
  };
}

/**
 * Generate source code from an application definition.
 *
 * Convenience wrapper that builds the graph from the definition and then
 * generates code from it.
 */
export function generateFromDefinition(
  definition: ApplicationDefinition,
  options?: GenerateOptions,
): GenerateResult {
  void definition;
  void options;
  return {
    files: [],
  };
}
