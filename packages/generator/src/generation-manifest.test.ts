import { describe, expect, it } from "vitest";

import {
  artifactIdentity,
  createGenerationManifest,
  hashGeneratedContent,
  parseGenerationManifest,
  serializeGenerationManifest,
} from "./generation-manifest.js";

describe("generation manifest", () => {
  it("creates stable identities and canonical serialization", () => {
    const manifest = createGenerationManifest(
      "generated",
      [
        { path: "z.ts", content: "z" },
        { path: "a.ts", content: "a" },
      ],
      "0.1.0",
    );

    expect(artifactIdentity("a.ts")).toBe("mavibase-generator:a.ts");
    expect(manifest.files["mavibase-generator:a.ts"]?.contentHash).toBe(hashGeneratedContent("a"));
    expect(serializeGenerationManifest(manifest)).toBe(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    expect(parseGenerationManifest(JSON.parse(serializeGenerationManifest(manifest)))).toEqual(
      manifest,
    );
  });

  it("rejects malformed or unsafe manifests", () => {
    expect(parseGenerationManifest({ format: "wrong" })).toBeUndefined();
    expect(
      parseGenerationManifest({
        format: "mavibase-generation-manifest",
        schemaVersion: 1,
        generatorVersion: "0.1.0",
        targetRoot: "generated",
        files: { bad: { path: "../outside.ts", contentHash: "hash" } },
      }),
    ).toBeUndefined();
  });
});
