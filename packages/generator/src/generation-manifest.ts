import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { GeneratedFile } from "./index.js";

export const generationManifestFormat = "mavibase-generation-manifest" as const;
export const generationManifestSchemaVersion = 1 as const;
export const generationManifestPath = ".mavibase/generated-manifest.json";

export interface GenerationManifestFile {
  path: string;
  contentHash: string;
  generator?: string;
  lastKnownContentHash?: string;
}

export interface GenerationManifest {
  format: typeof generationManifestFormat;
  schemaVersion: typeof generationManifestSchemaVersion;
  generatorVersion: string;
  targetRoot: string;
  files: Record<string, GenerationManifestFile>;
}

export function hashGeneratedContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function normalizeArtifactPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function artifactIdentity(path: string, generator = "mavibase-generator"): string {
  return `${generator}:${normalizeArtifactPath(path)}`;
}

export function createGenerationManifest(
  targetRoot: string,
  artifacts: readonly GeneratedFile[],
  generatorVersion: string,
  generator = "mavibase-generator",
): GenerationManifest {
  const files: Record<string, GenerationManifestFile> = {};
  for (const artifact of [...artifacts].sort((left, right) => left.path.localeCompare(right.path))) {
    const path = normalizeArtifactPath(artifact.path);
    files[artifactIdentity(path, generator)] = {
      path,
      contentHash: hashGeneratedContent(artifact.content),
      generator,
    };
  }
  return {
    format: generationManifestFormat,
    schemaVersion: generationManifestSchemaVersion,
    generatorVersion,
    targetRoot: normalizeArtifactPath(targetRoot),
    files,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeRelativePath(path: string): boolean {
  return !path.startsWith("/") && !/^[a-zA-Z]:/.test(path) && !path.split("/").includes("..");
}

function validManifestFile(value: unknown): value is GenerationManifestFile {
  return (
    isRecord(value) &&
    typeof value["path"] === "string" &&
    typeof value["contentHash"] === "string" &&
    (value["generator"] === undefined || typeof value["generator"] === "string") &&
    (value["lastKnownContentHash"] === undefined ||
      typeof value["lastKnownContentHash"] === "string")
  );
}

export function parseGenerationManifest(value: unknown): GenerationManifest | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value["format"] !== generationManifestFormat ||
    value["schemaVersion"] !== generationManifestSchemaVersion ||
    typeof value["generatorVersion"] !== "string" ||
    typeof value["targetRoot"] !== "string" ||
    !isRecord(value["files"])
  ) {
    return undefined;
  }
  const files: Record<string, GenerationManifestFile> = {};
  const targetRoot = normalizeArtifactPath(value["targetRoot"]);
  if (!isSafeRelativePath(targetRoot)) return undefined;
  for (const [key, file] of Object.entries(value["files"])) {
    if (!validManifestFile(file) || !isSafeRelativePath(normalizeArtifactPath(file.path))) return undefined;
    files[key] = {
      path: normalizeArtifactPath(file.path),
      contentHash: file.contentHash,
      ...(file.generator === undefined ? {} : { generator: file.generator }),
      ...(file.lastKnownContentHash === undefined
        ? {}
        : { lastKnownContentHash: file.lastKnownContentHash }),
    };
  }
  return {
    format: generationManifestFormat,
    schemaVersion: generationManifestSchemaVersion,
    generatorVersion: value["generatorVersion"],
    targetRoot,
    files,
  };
}

export function serializeGenerationManifest(manifest: GenerationManifest): string {
  const files = Object.fromEntries(
    Object.entries(manifest.files).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({ ...manifest, files }, null, 2)}\n`;
}

export async function readGenerationManifest(
  rootDir: string,
  path = generationManifestPath,
): Promise<GenerationManifest | undefined> {
  try {
    const content = await readFile(resolve(rootDir, path), "utf8");
    return parseGenerationManifest(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeGenerationManifest(
  rootDir: string,
  manifest: GenerationManifest,
  path = generationManifestPath,
): Promise<void> {
  const target = resolve(rootDir, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serializeGenerationManifest(manifest), "utf8");
}
