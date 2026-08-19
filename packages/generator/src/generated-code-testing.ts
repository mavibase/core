import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

import type { GeneratedFile } from "./index.js";
import { Filesystem, type FileOperationPlan } from "./filesystem.js";

export interface GeneratedCodeTestingOptions {
  expectedPaths?: readonly string[];
  rootDir?: string;
  targetRoot?: string;
  compile?: boolean;
}

export interface GeneratedCodeVerificationResult {
  valid: boolean;
  files: string[];
  diagnostics: string[];
  operations: FileOperationPlan[];
}

export class GeneratedCodeVerificationError extends Error {
  readonly result: GeneratedCodeVerificationResult;

  constructor(result: GeneratedCodeVerificationResult) {
    super(`Generated-code verification failed with ${result.diagnostics.length} issue(s).`);
    this.name = "GeneratedCodeVerificationError";
    this.result = result;
  }
}

const zodDeclaration = `declare module "zod" {
  export const z: any;
}
`;

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function artifactAbsolutePath(rootDir: string, targetRoot: string, path: string): string {
  return resolve(rootDir, targetRoot === "." ? path : join(targetRoot, path));
}

function compilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
}

export async function verifyGeneratedArtifacts(
  artifacts: readonly GeneratedFile[],
  options?: GeneratedCodeTestingOptions,
): Promise<GeneratedCodeVerificationResult> {
  const rootDir = options?.rootDir ?? (await mkdtemp(join(tmpdir(), "mavibase-generated-")));
  const ownsRoot = options?.rootDir === undefined;
  const targetRoot = options?.targetRoot ?? "generated";
  const supportDir = ownsRoot
    ? rootDir
    : await mkdtemp(join(tmpdir(), "mavibase-generated-support-"));
  const diagnostics: string[] = [];
  let operations: FileOperationPlan[] = [];

  try {
    const paths = artifacts.map((artifact) => artifact.path);
    const uniquePaths = new Set(paths);
    if (uniquePaths.size !== paths.length) {
      diagnostics.push("Generated artifacts contain duplicate paths.");
    }

    const expectedPaths = [...(options?.expectedPaths ?? paths)].sort((left, right) =>
      left.localeCompare(right),
    );
    const actualPaths = [...paths].sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
      diagnostics.push(
        `Generated paths differ from expectations. Expected: ${expectedPaths.join(", ")}; actual: ${actualPaths.join(", ")}.`,
      );
    }

    const filesystem = new Filesystem({ rootDir, targetRoot });
    const plan = await filesystem.write(artifacts);
    operations = plan.operations;

    for (const artifact of artifacts) {
      if (!(await filesystem.exists(artifact.path))) {
        diagnostics.push(`Generated file does not exist after writing: ${artifact.path}.`);
      }

      const transpiled = ts.transpileModule(artifact.content, {
        compilerOptions: compilerOptions(),
        reportDiagnostics: true,
        fileName: artifact.path,
      });
      for (const diagnostic of transpiled.diagnostics ?? []) {
        diagnostics.push(`${artifact.path}: ${diagnosticText(diagnostic)}`);
      }
    }

    if (options?.compile ?? true) {
      if (supportDir !== rootDir) {
        await mkdir(supportDir, { recursive: true });
      }
      const zodPath = join(supportDir, "zod.d.ts");
      await writeFile(zodPath, zodDeclaration, "utf8");
      const filePaths = artifacts.map((artifact) =>
        artifactAbsolutePath(rootDir, targetRoot, artifact.path),
      );
      const program = ts.createProgram([...filePaths, zodPath], compilerOptions());
      for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
        diagnostics.push(
          diagnostic.file
            ? `${diagnostic.file.fileName}: ${diagnosticText(diagnostic)}`
            : diagnosticText(diagnostic),
        );
      }
    }

    return {
      valid: diagnostics.length === 0,
      files: actualPaths,
      diagnostics,
      operations,
    };
  } finally {
    if (ownsRoot) {
      await rm(rootDir, { recursive: true, force: true });
    }
    if (supportDir !== rootDir) {
      await rm(supportDir, { recursive: true, force: true });
    }
  }
}

export async function assertGeneratedArtifacts(
  artifacts: readonly GeneratedFile[],
  options?: GeneratedCodeTestingOptions,
): Promise<GeneratedCodeVerificationResult> {
  const result = await verifyGeneratedArtifacts(artifacts, options);
  if (!result.valid) {
    throw new GeneratedCodeVerificationError(result);
  }
  return result;
}
