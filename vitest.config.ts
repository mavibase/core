import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mavibase/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@mavibase/application-graph": new URL(
        "./packages/application-graph/src/index.ts",
        import.meta.url,
      ).pathname,
      "@mavibase/generator": new URL("./packages/generator/src/index.ts", import.meta.url).pathname,
      "@mavibase/config": new URL("./packages/config/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});