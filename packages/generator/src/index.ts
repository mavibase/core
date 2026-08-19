import type { ApplicationDefinition } from "@mavibase/core";
import type { ApplicationGraph } from "@mavibase/application-graph";
import { buildGraph } from "@mavibase/application-graph";

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

function renderModelFile(graph: ApplicationGraph): GeneratedFile | undefined {
  const modelNodes = graph.nodes.filter((node) => node.type === "model");

  if (modelNodes.length === 0) {
    return undefined;
  }

  const lines: string[] = [];

  for (const node of modelNodes) {
    const name = node.data?.["name"] as string | undefined;
    const modelName = name ?? node.id;

    lines.push(`export interface ${modelName} {`);

    const fieldNodes = graph.edges
      .filter((edge) => edge.from === node.id && edge.type === "has-field")
      .map((edge) => edge.to)
      .map((id) => graph.nodes.find((candidate) => candidate.id === id))
      .filter((candidate) => candidate !== undefined);

    for (const fieldNode of fieldNodes) {
      const fieldName = fieldNode.data?.["name"] as string | undefined;
      const fieldType = fieldNode.data?.["type"] as string | undefined;

      if (fieldName && fieldType) {
        lines.push(`  ${fieldName}: ${fieldType};`);
      }
    }

    lines.push("}");
    lines.push("");
  }

  return {
    path: "models.ts",
    content: lines.join("\n").trimEnd() + "\n",
  };
}

export function generate(graph: ApplicationGraph, options?: GenerateOptions): GenerateResult {
  const artifacts: GeneratedFile[] = [];

  const modelFile = renderModelFile(graph);

  if (modelFile) {
    artifacts.push(modelFile);
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
export * from "./template.js";
