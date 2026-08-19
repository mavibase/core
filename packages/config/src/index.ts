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
export type DatabaseProvider = "postgresql";

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
export * from "./runtime.js";
