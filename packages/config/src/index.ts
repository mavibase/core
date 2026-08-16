export const version = "0.1.0";

/**
 * Language of the generated application.
 *
 * Only TypeScript is supported initially.
 */
export type Language = "typescript";

/**
 * Frontend framework for the generated application.
 */
export type WebFramework = "react" | "next";

/**
 * Backend framework for the generated application.
 */
export type BackendFramework = "express";

/**
 * Mavibase configuration file shape.
 *
 * This is the shape of `mavibase.config.ts`. It is intentionally minimal
 * for now and will be extended in later phases.
 */
export interface MavibaseConfig {
  /**
   * Application language.
   */
  language: Language;

  /**
   * Whether to use a monorepo layout.
   */
  monorepo?: boolean;

  /**
   * Frontend framework configuration.
   */
  web?: {
    framework: WebFramework;
  };

  /**
   * Backend framework configuration.
   */
  backend?: {
    framework: BackendFramework;
  };
}

/**
 * Load a mavibase configuration.
 *
 * The implementation will be built out in later phases. Currently returns
 * the input value unchanged.
 */
export function defineConfig(config: MavibaseConfig): MavibaseConfig {
  return config;
}
