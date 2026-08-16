import { describe, expect, it } from "vitest";
import { version } from "./index.js";

describe("core", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });
});
