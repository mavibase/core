import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Filesystem, FilesystemApplyError, FilesystemError } from "./filesystem.js";
import { createGenerationManifest } from "./generation-manifest.js";

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mavibase-filesystem-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("filesystem abstraction", () => {
  it("creates, reads, compares, and updates generated files", async () => {
    const rootDir = await temporaryDirectory();
    const filesystem = new Filesystem({ rootDir });
    const first = [{ path: "models.ts", content: "export interface User {}\n" }];

    expect(await filesystem.exists("models.ts")).toBe(false);
    const createPlan = await filesystem.write(first);
    expect(createPlan.operations.map(({ operation }) => operation)).toEqual(["create"]);
    expect(createPlan.operations[0]).toMatchObject({
      status: "applied",
      code: "filesystem.create",
    });
    expect(await filesystem.read("models.ts")).toBe(first[0]?.content);
    expect(await filesystem.compare("models.ts", first[0]?.content ?? "")).toEqual({
      exists: true,
      equal: true,
      currentContent: first[0]?.content,
    });

    const updatePlan = await filesystem.write([{ path: "models.ts", content: "updated\n" }]);
    expect(updatePlan.operations.map(({ operation }) => operation)).toEqual(["update"]);
    expect(await readFile(join(rootDir, "generated", "models.ts"), "utf8")).toBe("updated\n");
  });

  it("produces a deterministic lexicographically ordered plan", async () => {
    const filesystem = new Filesystem({ rootDir: await temporaryDirectory() });
    const artifacts = [
      { path: "z.ts", content: "z" },
      { path: "a.ts", content: "a" },
    ];

    const first = await filesystem.plan(artifacts);
    const second = await filesystem.plan([...artifacts].reverse());
    expect(first).toEqual(second);
    expect(first.operations.map(({ path }) => path)).toEqual(["generated/a.ts", "generated/z.ts"]);
  });

  it("does not overwrite an existing file with unknown ownership", async () => {
    const rootDir = await temporaryDirectory();
    await mkdir(join(rootDir, "generated"), { recursive: true });
    await writeFile(join(rootDir, "generated", "developer.ts"), "developer\n");
    const filesystem = new Filesystem({ rootDir, targetRoot: "." });

    const plan = await filesystem.write([
      { path: "generated/developer.ts", content: "generated\n" },
    ]);
    expect(plan.operations[0]?.operation).toBe("skip");
    expect(await readFile(join(rootDir, "generated", "developer.ts"), "utf8")).toBe("developer\n");
  });

  it("honors protected paths even when ownership is known", async () => {
    const rootDir = await temporaryDirectory();
    await mkdir(join(rootDir, "generated"), { recursive: true });
    await writeFile(join(rootDir, "generated", "models.ts"), "old\n");
    const filesystem = new Filesystem({
      rootDir,
      protectedPaths: ["generated/models.ts"],
      generatedPaths: ["generated/models.ts"],
    });

    const plan = await filesystem.write([{ path: "models.ts", content: "new\n" }]);
    expect(plan.operations[0]?.operation).toBe("skip");
    expect(await readFile(join(rootDir, "generated", "models.ts"), "utf8")).toBe("old\n");
  });

  it("supports dry-run without mutating the filesystem", async () => {
    const rootDir = await temporaryDirectory();
    const filesystem = new Filesystem({ rootDir, dryRun: true });

    const plan = await filesystem.write([{ path: "nested/models.ts", content: "content" }]);
    expect(plan.dryRun).toBe(true);
    expect(plan.operations[0]?.operation).toBe("create");
    expect(await filesystem.exists("nested/models.ts")).toBe(false);
  });

  it("rejects traversal and absolute paths", async () => {
    const filesystem = new Filesystem({ rootDir: await temporaryDirectory() });
    await expect(
      filesystem.plan([{ path: "../outside.ts", content: "nope" }]),
    ).rejects.toBeInstanceOf(FilesystemError);
    await expect(
      filesystem.plan([{ path: "/outside.ts", content: "nope" }]),
    ).rejects.toBeInstanceOf(FilesystemError);
  });

  it("deletes only paths explicitly known to be generated", async () => {
    const rootDir = await temporaryDirectory();
    await mkdir(join(rootDir, "generated"), { recursive: true });
    await writeFile(join(rootDir, "generated", "removed.ts"), "generated\n");
    const filesystem = new Filesystem({ rootDir, generatedPaths: ["generated/removed.ts"] });

    const plan = await filesystem.write([]);
    expect(plan.operations[0]?.operation).toBe("delete");
    expect(await filesystem.exists("removed.ts")).toBe(false);
  });

  it("uses manifest hashes to protect updates and deletions", async () => {
    const rootDir = await temporaryDirectory();
    await mkdir(join(rootDir, "generated"), { recursive: true });
    await writeFile(join(rootDir, "generated", "models.ts"), "old\n");
    const manifest = createGenerationManifest(
      "generated",
      [{ path: "models.ts", content: "old\n" }, { path: "removed.ts", content: "removed\n" }],
      "0.1.0",
    );
    const filesystem = new Filesystem({ rootDir, targetRoot: "generated", manifest });

    const update = await filesystem.plan([{ path: "models.ts", content: "new\n" }]);
    expect(update.operations.find((operation) => operation.path.endsWith("models.ts"))?.operation).toBe(
      "update",
    );
    expect(update.operations.find((operation) => operation.path.endsWith("removed.ts"))?.operation).toBe(
      "skip",
    );

    await writeFile(join(rootDir, "generated", "models.ts"), "developer\n");
    const conflict = await filesystem.plan([{ path: "models.ts", content: "newer\n" }]);
    expect(conflict.operations[0]?.operation).toBe("skip");
    expect(conflict.operations[0]?.reason).toContain("developer");
    expect(conflict.operations[0]?.code).toBe("filesystem.conflict");
  });

  it("rolls back earlier mutations when a later operation fails", async () => {
    const rootDir = await temporaryDirectory();
    const initial = new Filesystem({ rootDir });
    await initial.write([
      { path: "a.ts", content: "a-old\n" },
      { path: "b.ts", content: "b-old\n" },
    ]);
    const filesystem = new Filesystem({
      rootDir,
      failAfterOperation: 2,
      generatedPaths: ["generated/a.ts", "generated/b.ts"],
    });

    await expect(
      filesystem.write([
        { path: "a.ts", content: "a-new\n" },
        { path: "b.ts", content: "b-new\n" },
      ]),
    ).rejects.toBeInstanceOf(FilesystemApplyError);
    expect(await readFile(join(rootDir, "generated", "a.ts"), "utf8")).toBe("a-old\n");
    expect(await readFile(join(rootDir, "generated", "b.ts"), "utf8")).toBe("b-old\n");
    expect((await readdir(join(rootDir, "generated"))).some((name) => name.includes("transaction"))).toBe(
      false,
    );
  });

  it("rejects symlink and reparse-point escapes", async () => {
    const rootDir = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await mkdir(join(rootDir, "generated"), { recursive: true });
    try {
      await symlink(outside, join(rootDir, "generated", "link"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES") return;
      throw error;
    }
    const filesystem = new Filesystem({ rootDir });
    await expect(
      filesystem.plan([{ path: "link/escape.ts", content: "unsafe" }]),
    ).rejects.toBeInstanceOf(FilesystemError);
  });
});
