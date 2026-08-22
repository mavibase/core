import type { ApplicationGraph } from "@mavibase/application-graph";
import type { StackConfig } from "@mavibase/core";

import type { GeneratedFile } from "./index.js";

/** The generation stages that make up a generated backend. */
export type GeneratorComponentKind =
  | "controller"
  | "repository"
  | "request-schema"
  | "response-schema"
  | "route-registration"
  | "error-infrastructure";

/** Shared input available to every backend generator component. */
export interface GeneratorContext {
  graph: ApplicationGraph;
  stack?: StackConfig;
  /** Selected backend framework, for example `express` or `fastify`. */
  framework: string;
  /** Selected database provider, when the component needs one. */
  databaseProvider?: string;
  /** Relative output root used by the generation plan. */
  outDir: string;
}

/** A generator component must be able to declare support before generating output. */
export interface GeneratorComponent {
  readonly name: string;
  readonly kind: GeneratorComponentKind;
  readonly supportedFrameworks: readonly string[];
  supports(context: GeneratorContext): boolean;
  generate(context: GeneratorContext): readonly GeneratedFile[];
}

/** Generates framework-specific controller or handler boundaries. */
export interface ControllerGenerator extends GeneratorComponent {
  readonly kind: "controller";
}

/** Generates the database/repository boundary used by controllers. */
export interface RepositoryGenerator extends GeneratorComponent {
  readonly kind: "repository";
}

/** Generates request schemas and request parsing infrastructure. */
export interface RequestSchemaGenerator extends GeneratorComponent {
  readonly kind: "request-schema";
}

/** Generates response schemas and response serialization infrastructure. */
export interface ResponseSchemaGenerator extends GeneratorComponent {
  readonly kind: "response-schema";
}

/** Generates framework-specific route registration. */
export interface RouteRegistrationGenerator extends GeneratorComponent {
  readonly kind: "route-registration";
}

/** Generates shared API error classes and error middleware. */
export interface ErrorInfrastructureGenerator extends GeneratorComponent {
  readonly kind: "error-infrastructure";
}

/** The set of backend components required to produce a usable generated API. */
export interface BackendGeneratorSet {
  controllers: readonly ControllerGenerator[];
  repositories: readonly RepositoryGenerator[];
  requestSchemas: readonly RequestSchemaGenerator[];
  responseSchemas: readonly ResponseSchemaGenerator[];
  routeRegistrations: readonly RouteRegistrationGenerator[];
  errorInfrastructure: readonly ErrorInfrastructureGenerator[];
}
