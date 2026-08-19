export const version = "0.1.0";

/** Language of the generated app */
export type Language = "javascript" | "typescript";

/** Frontend framework */
export type WebFramework = "react" | "next" | "nextjs" | "vue" | "svelte";

/** Backend framework */
export type BackendFramework = "express" | "fastify" | "nestjs" | "hono";

/** Runtime used by the app */
export type Runtime = "node" | "bun" | "deno";

/** Database provider */
export type DatabaseProvider = "postgresql" | "mysql" | "sqlite";

/** Package manager used by the generated project */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

import type { StackConfiguration } from "./stack-configuration.js";

export interface MavibaseConfig {
  language: Language;
  projectName?: string;
  stackId?: string;
  monorepo?: boolean;
  stack?: StackConfiguration;

  applications?: {
    web?: {
      name: string;
      framework: string;
    };
    api?: {
      name: string;
      framework: string;
    };
  };

  web?: {
    framework: WebFramework;
  };

  backend?: {
    framework: BackendFramework;
  };
}

/** Define the mavibase project configuration */
export function defineConfig(config: MavibaseConfig): MavibaseConfig {
  return config;
}

export * from "./framework.js";
export * from "./database.js";
export * from "./runtime.js";
export * from "./package-manager.js";
export * from "./stack-compatibility.js";
export * from "./stack-configuration.js";
export * from "./stack-registry.js";
