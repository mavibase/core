export const version = "0.1.0";

/** Language of the generated app */
export type Language = "javascript" | "typescript";

/** Frontend framework */
export type WebFramework = "react" | "next";

/** Backend framework */
export type BackendFramework = "express";

/** Runtime used by the app */
export type Runtime = "node" | "bun" | "deno";

/** Database provider */
export type DatabaseProvider = "postgresql" | "mysql" | "sqlite";

/** Package manager used by the generated project */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface MavibaseConfig {
  language: Language;
  monorepo?: boolean;

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
