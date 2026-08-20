import { access, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { GeneratedFile } from "./index.js";
import {
  artifactIdentity,
  hashGeneratedContent,
  type GenerationManifest,
} from "./generation-manifest.js";

export type FileOperation = "create" | "update" | "delete" | "skip";
export type FileOperationStatus = "planned" | "applied" | "skipped" | "failed" | "rolled-back";

export interface FilesystemOptions {
  rootDir: string;
  targetRoot?: string;
  protectedPaths?: readonly string[];
  generatedPaths?: readonly string[];
  generatedMarker?: string;
  manifest?: GenerationManifest;
  generator?: string;
  failAfterOperation?: number;

  dryRun?: boolean;
}

export interface FileComparison {
  exists: boolean;
  equal: boolean;
  currentContent?: string;
}

export interface FileOperationPlan {
  operation: FileOperation;
  path: string;
  absolutePath: string;
  reason: string;
  content?: string;
  status?: FileOperationStatus;
  code?: string;
}

export interface WritePlan {
  operations: FileOperationPlan[];
  dryRun: boolean;
}

export interface FilesystemDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export class FilesystemApplyError extends Error {
  readonly code = "filesystem.apply-failed";
  readonly diagnostics: readonly FilesystemDiagnostic[];
  readonly operations: readonly FileOperationPlan[];

  constructor(
    diagnostics: readonly FilesystemDiagnostic[],
    operations: readonly FileOperationPlan[],
    cause?: unknown,
  ) {
    super(`Filesystem apply failed: ${diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`, {
      cause,
    });
    this.name = "FilesystemApplyError";
    this.diagnostics = diagnostics;
    this.operations = operations;
  }
}

export interface FilesystemErrorDetails {
  path: string;
  operation: string;
  reason: string;
  recommendation: string;
}

export class FilesystemError extends Error {
  readonly code = "MAVIBASE_FILESYSTEM_ERROR";
  readonly details: FilesystemErrorDetails;

  constructor(details: FilesystemErrorDetails, cause?: unknown) {
    super(
      `Filesystem ${details.operation} failed for "${details.path}": ${details.reason}. ${details.recommendation}`,
      { cause },
    );
    this.name = "FilesystemError";
    this.details = details;
  }
}

function normalizeRelativePath(value: string, operation: string): string {
  const candidate = value.replaceAll("\\", "/").trim();

  if (!candidate || isAbsolute(candidate) || /^[a-zA-Z]:/.test(candidate)) {
    throw new FilesystemError({
      path: value,
      operation,
      reason: "the path is absolute or empty",
      recommendation: "Provide a non-empty path relative to the configured project root.",
    });
  }

  const parts = candidate.split("/");
  if (parts.some((part) => part === "..")) {
    throw new FilesystemError({
      path: value,
      operation,
      reason: "path traversal is not allowed",
      recommendation: "Keep the path inside the configured target root.",
    });
  }

  const normalized = parts.filter((part) => part && part !== ".").join("/");
  if (!normalized) {
    throw new FilesystemError({
      path: value,
      operation,
      reason: "the path resolves to a directory",
      recommendation: "Provide a file path.",
    });
  }
  return normalized;
}

function isWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

function operationCode(operation: FileOperation, reason: string): string {
  if (operation === "skip") {
    if (reason.includes("protected")) return "filesystem.protected";
    if (reason.includes("developer")) return "filesystem.conflict";
    if (reason.includes("ownership")) return "filesystem.ownership-unknown";
    if (reason.includes("unchanged")) return "filesystem.unchanged";
    return "filesystem.skip";
  }
  return `filesystem.${operation}`;
}

function plannedOperation(operation: Omit<FileOperationPlan, "status" | "code">): FileOperationPlan {
  return {
    ...operation,
    status: "planned",
    code: operationCode(operation.operation, operation.reason),
  };
}

function statusOperation(
  operation: FileOperationPlan,
  status: FileOperationStatus,
  code = operation.code,
): FileOperationPlan {
  return { ...operation, status, ...(code === undefined ? {} : { code }) };
}

export class Filesystem {
  readonly rootDir: string;
  readonly targetRoot: string;
  readonly dryRun: boolean;
  private readonly protectedPaths: Set<string>;
  private readonly generatedPaths: Set<string>;
  private readonly generatedMarker: string | undefined;
  private readonly manifest: GenerationManifest | undefined;
  private readonly generator: string;
  private readonly failAfterOperation: number | undefined;

  constructor(options: FilesystemOptions) {
    this.rootDir = resolve(options.rootDir);
    const target = options.targetRoot ?? "generated";
    this.targetRoot = target === "." ? "" : normalizeRelativePath(target, "configure target root");
    this.dryRun = options.dryRun ?? false;
    this.generatedMarker = options.generatedMarker;
    this.manifest = options.manifest?.targetRoot === this.targetRoot ? options.manifest : undefined;
    this.generator = options.generator ?? "mavibase-generator";
    this.failAfterOperation = options.failAfterOperation;
    this.protectedPaths = new Set(
      (options.protectedPaths ?? []).map((path) =>
        normalizeRelativePath(path, "configure protected path"),
      ),
    );
    this.generatedPaths = new Set(
      (options.generatedPaths ?? []).map((path) =>
        normalizeRelativePath(path, "configure generated path"),
      ),
    );
  }

  private projectPath(path: string, operation: string): { path: string; absolutePath: string } {
    const artifactPath = normalizeRelativePath(path, operation);
    const projectPath = normalizeRelativePath(
      this.targetRoot ? `${this.targetRoot}/${artifactPath}` : artifactPath,
      operation,
    );
    const absolutePath = resolve(this.rootDir, projectPath);
    if (
      !isWithin(this.rootDir, absolutePath) ||
      !isWithin(resolve(this.rootDir, this.targetRoot || "."), absolutePath)
    ) {
      throw new FilesystemError({
        path,
        operation,
        reason: "the path escapes the configured target root",
        recommendation: "Use an artifact path contained by the target root.",
      });
    }
    return { path: projectPath, absolutePath };
  }

  private async ensureSafePath(path: string, operation: string): Promise<void> {
    const resolved = this.projectPath(path, operation);
    const root = resolve(this.rootDir);
    const target = resolve(root, this.targetRoot || ".");
    const relativePath = relative(root, resolved.absolutePath);
    let current = root;
    for (const part of relativePath.split(sep).filter(Boolean)) {
      current = resolve(current, part);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink()) {
          throw new FilesystemError({
            path,
            operation,
            reason: "a symlink or reparse point is present in the target path",
            recommendation: "Use a target path whose existing parents and file are not links.",
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
    try {
      const [realRoot, realTarget, realCandidate] = await Promise.all([
        realpath(root),
        realpath(target),
        realpath(resolved.absolutePath),
      ]);
      if (!isWithin(realRoot, realCandidate) || !isWithin(realTarget, realCandidate)) {
        throw new FilesystemError({
          path,
          operation,
          reason: "the resolved path escapes the configured target root",
          recommendation: "Use a target path contained by the configured root.",
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureSafePath(path, "check existence");
    const resolved = this.projectPath(path, "check existence");
    try {
      await access(resolved.absolutePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw this.error(path, "check existence", "could not inspect the path", error);
    }
  }

  async read(path: string): Promise<string> {
    await this.ensureSafePath(path, "read");
    const resolved = this.projectPath(path, "read");
    try {
      return await readFile(resolved.absolutePath, "utf8");
    } catch (error) {
      throw this.error(path, "read", "could not read the file", error);
    }
  }

  async compare(path: string, content: string): Promise<FileComparison> {
    if (!(await this.exists(path))) return { exists: false, equal: false };
    const currentContent = await this.read(path);
    return { exists: true, equal: currentContent === content, currentContent };
  }

  async plan(artifacts: readonly GeneratedFile[]): Promise<WritePlan> {
    const unique = new Map<string, GeneratedFile>();
    for (const artifact of artifacts) {
      const resolved = this.projectPath(artifact.path, "plan");
      if (unique.has(resolved.path)) {
        throw this.error(
          artifact.path,
          "plan",
          "duplicate artifact path",
          "Remove duplicate artifacts before writing.",
        );
      }
      unique.set(resolved.path, { ...artifact, path: resolved.path });
    }

    const paths = new Set([...unique.keys(), ...this.generatedPaths]);
    for (const file of Object.values(this.manifest?.files ?? {})) {
      const resolved = this.projectPath(file.path, "plan");
      paths.add(resolved.path);
    }
    const operations: FileOperationPlan[] = [];
    for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
      const artifact = unique.get(path);
      const artifactPath = this.targetRoot ? path.slice(`${this.targetRoot}/`.length) : path;
      const resolved = this.projectPath(artifactPath, "plan");
      await this.ensureSafePath(artifactPath, "plan");
      const exists = await this.exists(artifactPath);
      const protectedPath = this.protectedPaths.has(path);
      const manifestFile = this.manifest?.files[artifactIdentity(artifactPath, this.generator)];

      if (!artifact) {
        if (exists && manifestFile && !protectedPath) {
          const current = await this.read(artifactPath);
          if (hashGeneratedContent(current) === manifestFile.contentHash) {
            operations.push({
              operation: "delete",
              path,
              absolutePath: resolved.absolutePath,
              reason: "previously generated file is no longer produced",
            });
          } else {
            operations.push({
              operation: "skip",
              path,
              absolutePath: resolved.absolutePath,
              reason: "previously generated file was modified by a developer",
            });
          }
        } else if (exists && this.generatedPaths.has(path) && !protectedPath) {
          operations.push({
            operation: "delete",
            path,
            absolutePath: resolved.absolutePath,
            reason: "previously generated file is no longer produced",
          });
        } else {
          operations.push({
            operation: "skip",
            path,
            absolutePath: resolved.absolutePath,
            reason: exists ? "file is not confirmed as generated" : "file does not exist",
          });
        }
        continue;
      }

      if (!exists) {
        operations.push({
          operation: "create",
          path,
          absolutePath: resolved.absolutePath,
          reason: "target does not exist",
          content: artifact.content,
        });
      } else if (protectedPath) {
        operations.push({
          operation: "skip",
          path,
          absolutePath: resolved.absolutePath,
          reason: "path is protected",
        });
      } else if (manifestFile) {
        const current = await this.read(artifactPath);
        if (hashGeneratedContent(current) !== manifestFile.contentHash) {
          operations.push({
            operation: "skip",
            path,
            absolutePath: resolved.absolutePath,
            reason: "existing file was modified by a developer",
          });
          continue;
        }
        if ((await this.compare(artifactPath, artifact.content)).equal) {
          operations.push({
            operation: "skip",
            path,
            absolutePath: resolved.absolutePath,
            reason: "content is unchanged",
          });
        } else {
          operations.push({
            operation: "update",
            path,
            absolutePath: resolved.absolutePath,
            reason: "existing file is confirmed as generated and content differs",
            content: artifact.content,
          });
        }
      } else if (!(await this.isGenerated(path, artifactPath))) {
        operations.push({
          operation: "skip",
          path,
          absolutePath: resolved.absolutePath,
          reason: "existing file ownership is unknown or developer-owned",
        });
      } else if ((await this.compare(artifactPath, artifact.content)).equal) {
        operations.push({
          operation: "skip",
          path,
          absolutePath: resolved.absolutePath,
          reason: "content is unchanged",
        });
      } else {
        operations.push({
          operation: "update",
          path,
          absolutePath: resolved.absolutePath,
          reason: "existing file is confirmed as generated and content differs",
          content: artifact.content,
        });
      }
    }
    return {
      operations: operations.map((operation) => plannedOperation(operation)),
      dryRun: this.dryRun,
    };
  }

  async apply(plan: WritePlan): Promise<WritePlan> {
    if (plan.dryRun || this.dryRun) return plan;
    for (const operation of plan.operations) {
      if (operation.operation === "skip") continue;
      const artifactPath = this.targetRoot
        ? operation.path.slice(`${this.targetRoot}/`.length)
        : operation.path;
      await this.ensureSafePath(artifactPath, operation.operation);
    }

    const targetRoot = resolve(this.rootDir, this.targetRoot || ".");
    if (this.targetRoot) await this.ensureSafePath(".mavibase-target-check", "apply");
    await mkdir(targetRoot, { recursive: true });
    const transactionRoot = await mkdtemp(join(targetRoot, ".mavibase-transaction-"));
    const mutations = plan.operations.filter((operation) => operation.operation !== "skip");
    const journal = new Map<string, Buffer | undefined>();
    const touched: FileOperationPlan[] = [];
    const staged = new Map<string, string>();
    let mutationIndex = 0;

    try {
      for (const [index, operation] of mutations.entries()) {
        const artifactPath = this.targetRoot
          ? operation.path.slice(`${this.targetRoot}/`.length)
          : operation.path;
        const resolved = this.projectPath(artifactPath, operation.operation);
        if (operation.operation === "create" || operation.operation === "update") {
          const stagePath = join(transactionRoot, `${index}.stage`);
          await writeFile(stagePath, operation.content ?? "", "utf8");
          staged.set(operation.path, stagePath);
        }
        if (operation.operation === "update" || operation.operation === "delete") {
          journal.set(resolved.absolutePath, await readFile(resolved.absolutePath));
        } else {
          journal.set(resolved.absolutePath, undefined);
        }
      }

      const writes = mutations.filter(
        (operation) => operation.operation === "create" || operation.operation === "update",
      );
      const deletes = mutations.filter((operation) => operation.operation === "delete");
      for (const operation of [...writes, ...deletes]) {
        const artifactPath = this.targetRoot
          ? operation.path.slice(`${this.targetRoot}/`.length)
          : operation.path;
        const resolved = this.projectPath(artifactPath, operation.operation);
        touched.push(operation);
        if (operation.operation === "delete") {
          await rm(resolved.absolutePath);
          this.generatedPaths.delete(operation.path);
        } else {
          const stagePath = staged.get(operation.path);
          if (!stagePath) throw new Error("staged content is missing");
          await mkdir(resolve(resolved.absolutePath, ".."), { recursive: true });
          try {
            await rename(stagePath, resolved.absolutePath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") {
              throw error;
            }
            await rm(resolved.absolutePath, { force: true });
            await rename(stagePath, resolved.absolutePath);
          }
          this.generatedPaths.add(operation.path);
        }
        mutationIndex += 1;
        if (this.failAfterOperation !== undefined && mutationIndex >= this.failAfterOperation) {
          throw new Error("failure injection requested");
        }
      }

      await rm(transactionRoot, { recursive: true, force: true });
      return {
        ...plan,
        operations: plan.operations.map((operation) =>
          operation.operation === "skip"
            ? statusOperation(operation, "skipped")
            : statusOperation(operation, "applied"),
        ),
      };
    } catch (error) {
      const rollbackFailures: FilesystemDiagnostic[] = [];
      for (const operation of [...touched].reverse()) {
        const artifactPath = this.targetRoot
          ? operation.path.slice(`${this.targetRoot}/`.length)
          : operation.path;
        const resolved = this.projectPath(artifactPath, operation.operation);
        try {
          const original = journal.get(resolved.absolutePath);
          if (original === undefined) await rm(resolved.absolutePath, { force: true });
          else {
            await mkdir(resolve(resolved.absolutePath, ".."), { recursive: true });
            await writeFile(resolved.absolutePath, original);
          }
        } catch (rollbackError) {
          rollbackFailures.push({
            code: "filesystem.rollback-failed",
            message: `Failed to restore "${operation.path}".`,
            path: operation.path,
          });
          void rollbackError;
        }
      }
      await rm(transactionRoot, { recursive: true, force: true });
      const diagnostics: FilesystemDiagnostic[] = [
        {
          code: "filesystem.apply-failed",
          message: "The filesystem transaction failed and rollback was attempted.",
        },
        ...rollbackFailures,
      ];
      const operationResults = plan.operations.map((operation) => {
        if (operation.operation === "skip") return statusOperation(operation, "skipped");
        if (touched.some((candidate) => candidate.path === operation.path)) {
          return statusOperation(operation, "rolled-back", "filesystem.rolled-back");
        }
        return statusOperation(operation, "failed", "filesystem.apply-failed");
      });
      throw new FilesystemApplyError(diagnostics, operationResults, error);
    }
  }

  async write(artifacts: readonly GeneratedFile[]): Promise<WritePlan> {
    const plan = await this.plan(artifacts);
    return this.apply(plan);
  }

  
  async remove(path: string): Promise<WritePlan> {
    const resolved = this.projectPath(path, "delete");
    const knownPath = resolved.path;
    const exists = await this.exists(path);
    const operation = plannedOperation({
      operation:
        exists && this.generatedPaths.has(knownPath) && !this.protectedPaths.has(knownPath)
          ? "delete"
          : "skip",
      path: knownPath,
      absolutePath: resolved.absolutePath,
      reason: !exists
        ? "file does not exist"
        : this.protectedPaths.has(knownPath)
          ? "path is protected"
          : this.generatedPaths.has(knownPath)
            ? "file is confirmed as generated"
            : "file is not confirmed as generated",
    });
    return this.apply({ operations: [operation], dryRun: this.dryRun });
  }

  private async isGenerated(projectPath: string, artifactPath: string): Promise<boolean> {
    if (this.generatedPaths.has(projectPath)) return true;
    if (!this.generatedMarker) return false;
    const content = await this.read(artifactPath);
    return content.startsWith(this.generatedMarker);
  }

  private error(path: string, operation: string, reason: string, cause: unknown): FilesystemError {
    const recommendation =
      typeof cause === "string" ? cause : "Check the path and filesystem permissions.";
    return new FilesystemError({ path, operation, reason, recommendation }, cause);
  }
}

export function createFilesystem(options: FilesystemOptions): Filesystem {
  return new Filesystem(options);
}
