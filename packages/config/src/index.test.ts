import { describe, expect, it } from "vitest";
import { version } from "./index.js";

describe("config", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });
});
