import type {
  BackendFramework,
  DatabaseProvider,
  Language,
  Runtime,
  WebFramework,
} from "@mavibase/config";
import { createDefaultStackRegistries } from "@mavibase/config";

import { isRouteMethod, type RouteDefinition } from "./routes.js";
import { validateRouteParameters, type DefineParameterInput } from "./parameters.js";
import {
  defineDatabaseConstraint,
  defineDatabaseIndex,
  type DatabaseConstraintDefinition,
  type DatabaseConstraintInput,
  type DatabaseIndexDefinition,
} from "./database.js";

import type { Diagnostic, ValidationResult } from "./diagnostics.js";

export * from "./diagnostics.js";

export const version = "0.1.0";

export * from "./routes.js";
export * from "./parameters.js";
export * from "./responses.js";
export * from "./middleware.js";

export * from "./database.js";

export type AppEnvironment = "development" | "test" | "production";

export interface AppFeatures {
  /** Enable auth generation */
  authentication?: boolean;

  /** Enable authorization and policies */
  authorization?: boolean;

  /** Enable validation generation */
  validation?: boolean;

  /** Enable rate limiting */
  rateLimiting?: boolean;

  /** Generate API clients */
  apiClients?: boolean;

  /** Generate tests */
  tests?: boolean;
}

export interface StackConfig {
  language: Language;
  runtime: Runtime;

  web?: {
    framework: WebFramework;
  };

  backend?: {
    framework: BackendFramework;
  };

  database?: {
    provider: DatabaseProvider;
  };
}

export interface DefinitionsRegistry {
  [name: string]: Record<string, unknown>;
}

/** Mavibase field types */
export type ScalarType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "json"
  | "bigint";

export interface EnumType {
  kind: "enum";
  values: readonly string[];
}

export interface ArrayType {
  kind: "array";
  element: SemanticType;
}

export type SemanticType = ScalarType | EnumType | ArrayType;
export type FieldType = SemanticType;

/** Modifiers that shape how a field behaves */
export interface FieldModifiers {
  /** Field must always be present */
  required?: boolean;

  /** Field can be omitted */
  optional?: boolean;

  /** Field can be null */
  nullable?: boolean;

  /** Values must be distinct */
  unique?: boolean;

  /** Values are searchable by index */
  indexed?: boolean;

  /** Field identifies the record */
  primary?: boolean;

  /** Value used when none is supplied */
  default?: unknown;

  /** Value is produced automatically */
  generated?: boolean;

  /** Field is written on create or update but never returned */
  writeOnly?: boolean;

  /** Field is returned but ignored when written */
  readOnly?: boolean;
}

/** A field definition describes a single model field */
export interface FieldDefinition {
  type: SemanticType;
  modifiers?: FieldModifiers;
  validation?: string;
}

export interface NormalizedField {
  name: string;
  type: SemanticType;
  modifiers: Required<FieldModifiers>;
  validation?: string;
}

/** A field definition with chainable modifier methods */
export interface ModifiableField extends FieldDefinition {
  required(): ModifiableField;
  optional(): ModifiableField;
  nullable(): ModifiableField;
  unique(): ModifiableField;
  indexed(): ModifiableField;
  primary(): ModifiableField;
  default(value: unknown): ModifiableField;
  generated(): ModifiableField;
  readOnly(): ModifiableField;
  writeOnly(): ModifiableField;
  validate(expression: string): ModifiableField;
}

/** Modifier methods live on the prototype so structural equality ignores them */
const fieldPrototype = {
  required(this: ModifiableField): ModifiableField {
    return withModifiers(this, { required: true, optional: false });
  },
  optional(this: ModifiableField): ModifiableField {
    return withModifiers(this, { optional: true, required: false });
  },
  nullable(this: ModifiableField): ModifiableField {
    return withModifiers(this, { nullable: true });
  },
  unique(this: ModifiableField): ModifiableField {
    return withModifiers(this, { unique: true });
  },
  indexed(this: ModifiableField): ModifiableField {
    return withModifiers(this, { indexed: true });
  },
  primary(this: ModifiableField): ModifiableField {
    return withModifiers(this, { primary: true });
  },
  default(this: ModifiableField, value: unknown): ModifiableField {
    return withModifiers(this, { default: value });
  },
  generated(this: ModifiableField): ModifiableField {
    return withModifiers(this, { generated: true });
  },
  readOnly(this: ModifiableField): ModifiableField {
    return withModifiers(this, { readOnly: true });
  },
  writeOnly(this: ModifiableField): ModifiableField {
    return withModifiers(this, { writeOnly: true });
  },
  validate(this: ModifiableField, expression: string): ModifiableField {
    if (!expression.trim()) throw new Error("Field validation expression must not be empty.");
    return withValidation(this, expression);
  },
};

/** Build a field from a type and optional modifiers */
function createField(
  type: SemanticType,
  modifiers?: FieldModifiers,
  validation?: string,
): ModifiableField {
  const definition = Object.create(fieldPrototype) as ModifiableField;

  definition.type = type;

  if (modifiers) {
    definition.modifiers = modifiers;
  }

  if (validation !== undefined) {
    definition.validation = validation;
  }

  return definition;
}

/** Return a new field with the given modifiers merged in */
function withModifiers(field: ModifiableField, modifiers: FieldModifiers): ModifiableField {
  return createField(field.type, { ...field.modifiers, ...modifiers }, field.validation);
}

function withValidation(field: ModifiableField, validation: string): ModifiableField {
  return createField(field.type, field.modifiers, validation);
}

/** Factory for creating field definitions */
export const field = {
  string(): ModifiableField {
    return createField("string");
  },
  text(): ModifiableField {
    return createField("text");
  },
  integer(): ModifiableField {
    return createField("integer");
  },
  float(): ModifiableField {
    return createField("float");
  },
  decimal(): ModifiableField {
    return createField("decimal");
  },
  boolean(): ModifiableField {
    return createField("boolean");
  },
  uuid(): ModifiableField {
    return createField("uuid");
  },
  datetime(): ModifiableField {
    return createField("datetime");
  },
  date(): ModifiableField {
    return createField("date");
  },
  json(): ModifiableField {
    return createField("json");
  },
  bigint(): ModifiableField {
    return createField("bigint");
  },
  enum(values: readonly string[]): ModifiableField {
    return createField({ kind: "enum", values: [...values] });
  },
  array(element: SemanticType | FieldDefinition): ModifiableField {
    const semanticType =
      typeof element === "object" && element !== null && "type" in element
        ? element.type
        : element;
    return createField({ kind: "array", element: semanticType });
  },
};

/** Mavibase relationship types */
export type RelationshipType = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

/** A relationship definition describes a link to another model */
export interface RelationshipDefinition {
  type: RelationshipType;

  /** Target model the relationship points to */
  model?: string;
}

/** A relationship with a chainable target helper */
export interface ModifiableRelationship extends RelationshipDefinition {
  to(model: string): ModifiableRelationship;
}

/** Relationship helper methods live on the prototype so structural equality ignores them */
const relationshipPrototype = {
  to(this: ModifiableRelationship, model: string): ModifiableRelationship {
    return createRelationship(this.type, model);
  },
};

/** Build a relationship from a type and optional target model */
function createRelationship(type: RelationshipType, model?: string): ModifiableRelationship {
  const definition = Object.create(relationshipPrototype) as ModifiableRelationship;

  definition.type = type;

  if (model) {
    definition.model = model;
  }

  return definition;
}

/** Factory for creating relationship definitions */
export const relationship = {
  oneToOne(): ModifiableRelationship {
    return createRelationship("one-to-one");
  },
  oneToMany(): ModifiableRelationship {
    return createRelationship("one-to-many");
  },
  manyToOne(): ModifiableRelationship {
    return createRelationship("many-to-one");
  },
  manyToMany(): ModifiableRelationship {
    return createRelationship("many-to-many");
  },
};

export interface ModelDefinition {
  /** Stable identifier for the model */
  id: string;

  /** model name */
  name: string;

  /** Model fields */
  fields?: Record<string, FieldDefinition>;

  /** Model relationships */
  relationships?: Record<string, RelationshipDefinition>;

  /** Database indexes */
  indexes?: readonly DatabaseIndexDefinition[];

  /** Database constraints */
  constraints?: readonly DatabaseConstraintDefinition[];

  /** Additional model metadata */
  metadata?: Record<string, unknown>;
}

export interface DefineModelInput {
  name: string;
  id?: string;
  fields?: Record<string, FieldDefinition>;
  relationships?: Record<string, RelationshipDefinition>;
  indexes?: readonly unknown[];
  constraints?: readonly unknown[];
  metadata?: Record<string, unknown>;
}

export interface ApplicationDefinition {
  name: string;
  version: string;
  environment: AppEnvironment;
  stack: StackConfig;
  features?: AppFeatures;
  models?: ModelDefinition[];
  routes?: RouteDefinition[];
  definitions?: DefinitionsRegistry;
}

/** Convert a model name into a stable identifier */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Define a model for the application */
export function defineModel(input: DefineModelInput): ModelDefinition {
  if (!input.name.trim()) {
    throw new Error("Model name must not be empty.");
  }

  const id = input.id ?? slugify(input.name);

  const indexes = (input.indexes ?? []).map((value) => {
    const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const columns = candidate["columns"] ?? candidate["fields"];
    return defineDatabaseIndex(input.name, {
      ...(typeof candidate["name"] === "string" ? { name: candidate["name"] } : {}),
      columns: columns as readonly string[],
      ...(typeof candidate["unique"] === "boolean" ? { unique: candidate["unique"] } : {}),
    });
  });
  const constraints = (input.constraints ?? []).map((value) =>
    defineDatabaseConstraint(input.name, value as DatabaseConstraintInput),
  );

  return {
    id,
    name: input.name,
    fields: input.fields ?? {},
    relationships: input.relationships ?? {},
    indexes,
    constraints,
    metadata: input.metadata ?? {},
  };
}
export interface ValidationIssue {
  path: string;
  /**Description of the problem */
  message: string;
}

const VALID_SCALAR_TYPES: readonly ScalarType[] = [
  "string",
  "text",
  "integer",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "json",
  "bigint",
];

export function isSemanticType(value: unknown): value is SemanticType {
  if (typeof value === "string") {
    return VALID_SCALAR_TYPES.includes(value as ScalarType);
  }
  if (!isRecord(value)) return false;
  if (value["kind"] === "enum") {
    const values = value["values"];
    return (
      Array.isArray(values) &&
      values.length > 0 &&
      values.every((item) => typeof item === "string") &&
      new Set(values).size === values.length
    );
  }
  return value["kind"] === "array" && isSemanticType(value["element"]);
}

const VALID_RELATIONSHIP_TYPES: readonly string[] = [
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many",
];

const VALID_ENVIRONMENTS: readonly AppEnvironment[] = ["development", "test", "production"];
const VALID_LANGUAGES: readonly Language[] = ["javascript", "typescript"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSemver(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value,
    )
  );
}

function validateStackReference(
  stack: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  const registries = createDefaultStackRegistries();
  const language = stack["language"];
  const runtime = stack["runtime"];

  if (!VALID_LANGUAGES.includes(language as Language)) {
    issues.push({
      path: "stack.language",
      message: `Invalid stack language: "${String(language)}".`,
    });
  }

  if (!isNonEmptyString(runtime) || !registries.runtimes.get(runtime)) {
    issues.push({
      path: "stack.runtime",
      message: `Invalid stack runtime: "${String(runtime)}".`,
    });
  }

  const references: readonly [string, string, "framework" | "database"][] = [
    ["web", "framework", "framework"],
    ["backend", "framework", "framework"],
    ["database", "provider", "database"],
  ];

  for (const [sectionName, referenceName, referenceType] of references) {
    const section = stack[sectionName];
    if (section === undefined) continue;
    if (!isRecord(section)) {
      issues.push({
        path: `stack.${sectionName}`,
        message: `Stack ${sectionName} configuration must be an object.`,
      });
      continue;
    }

    const reference = section[referenceName];
    const registry = referenceType === "framework" ? registries.frameworks : registries.databases;
    if (!isNonEmptyString(reference) || !registry.get(reference)) {
      issues.push({
        path: `stack.${sectionName}.${referenceName}`,
        message: `Invalid stack ${referenceType} reference: "${String(reference)}".`,
      });
    }
  }
}

/** Validate a definition and return any issues found */
export function validateDefinition(definition: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(definition)) {
    issues.push({
      path: "definition",
      message: "Application definition must be an object.",
    });
    return issues;
  }

  const candidate = definition;
  const name = candidate["name"];
  const versionValue = candidate["version"];
  const environment = candidate["environment"];
  const stackConfig = candidate["stack"];

  if (!isNonEmptyString(name)) {
    issues.push({
      path: "name",
      message: "Application name must not be empty.",
    });
  }
  if (!isSemver(versionValue)) {
    issues.push({
      path: "version",
      message: `Invalid application version: "${String(versionValue)}". Expected semver.`,
    });
  }
  if (!VALID_ENVIRONMENTS.includes(environment as AppEnvironment)) {
    issues.push({
      path: "environment",
      message: `Invalid application environment: "${String(environment)}".`,
    });
  }
  if (!isRecord(stackConfig)) {
    issues.push({
      path: "stack",
      message: "Application stack configuration must be an object.",
    });
  } else {
    validateStackReference(stackConfig, issues);
  }

  const features = candidate["features"];
  if (features !== undefined) {
    if (!isRecord(features)) {
      issues.push({ path: "features", message: "Application features must be an object." });
    } else {
      for (const feature of [
        "authentication",
        "authorization",
        "validation",
        "rateLimiting",
        "apiClients",
        "tests",
      ]) {
        if (features[feature] !== undefined && typeof features[feature] !== "boolean") {
          issues.push({
            path: `features.${feature}`,
            message: `Application feature "${feature}" must be a boolean.`,
          });
        }
      }
    }
  }

  const definitions = candidate["definitions"];
  if (definitions !== undefined && !isRecord(definitions)) {
    issues.push({
      path: "definitions",
      message: "Application definitions registry must be an object.",
    });
  }

  const rawModels = candidate["models"];
  const rawRoutes = candidate["routes"];

  if (rawModels !== undefined && !Array.isArray(rawModels)) {
    issues.push({ path: "models", message: "Application models must be an array." });
  }
  if (rawRoutes !== undefined && !Array.isArray(rawRoutes)) {
    issues.push({ path: "routes", message: "Application routes must be an array." });
  }

  const models = Array.isArray(rawModels) ? rawModels : [];
  const routes = Array.isArray(rawRoutes) ? rawRoutes : [];
  const modelNames = new Set<string>();

  for (const model of models) {
    if (model && typeof model === "object") {
      const modelName = (model as Record<string, unknown>)["name"];

      if (typeof modelName === "string") {
        modelNames.add(modelName);
      }
    }
  }

  const routeNames = new Set<string>();
  const routeSignatures = new Set<string>();
  for (const route of routes) {
    if (!isRecord(route)) {
      issues.push({ path: "routes", message: "Every route must be an object." });
      continue;
    }
    const routeObj = route;
    const routeName = routeObj["name"];
    const method = routeObj["method"];
    const path = routeObj["path"];
    const parameters = routeObj["parameters"];
    const responses = routeObj["responses"];

    if (typeof routeName !== "string" || !routeName.trim()) {
      issues.push({ path: "routes.name", message: "Route name must not be empty." });
    } else if (routeNames.has(routeName)) {
      issues.push({
        path: `routes.${routeName}`,
        message: `Duplicate route name: "${routeName}".`,
      });
    } else {
      routeNames.add(routeName);
    }
    if (!isRouteMethod(method)) {
      issues.push({
        path: `routes.${String(routeName)}.method`,
        message: `Invalid route method: "${String(method)}".`,
      });
    }
    if (typeof path !== "string" || !path.startsWith("/") || path.includes("//")) {
      issues.push({
        path: `routes.${String(routeName)}.path`,
        message: `Invalid route path: "${String(path)}".`,
      });
    }
    if (parameters !== undefined && !Array.isArray(parameters)) {
      issues.push({
        path: `routes.${String(routeName)}.parameters`,
        message: "Route parameters must be an array.",
      });
    }
    if (Array.isArray(parameters) && typeof path === "string") {
      for (const issue of validateRouteParameters(path, parameters as DefineParameterInput[])) {
        issues.push({
          path: `routes.${String(routeName)}.${issue.path}`,
          message: issue.message,
        });
      }
    }
    if (responses !== undefined && !Array.isArray(responses)) {
      issues.push({
        path: `routes.${String(routeName)}.responses`,
        message: "Route responses must be an array.",
      });
    }
    if (Array.isArray(responses)) {
      const statuses = new Set<number>();
      for (const [index, response] of responses.entries()) {
        if (!response || typeof response !== "object") continue;
        const responseObj = response as Record<string, unknown>;
        const status = responseObj["status"];
        if (!Number.isInteger(status) || Number(status) < 100 || Number(status) > 599) {
          issues.push({
            path: `routes.${String(routeName)}.responses[${index}].status`,
            message: `Invalid response status: "${String(status)}".`,
          });
        } else if (statuses.has(Number(status))) {
          issues.push({
            path: `routes.${String(routeName)}.responses[${index}].status`,
            message: `Duplicate route response status: "${status}".`,
          });
        } else {
          statuses.add(Number(status));
        }
        const schema = responseObj["schema"];
        if (
          schema !== undefined &&
          (typeof schema !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(schema))
        ) {
          issues.push({
            path: `routes.${String(routeName)}.responses[${index}].schema`,
            message: `Invalid response schema reference: "${String(schema)}".`,
          });
        }
      }
    }
    if (typeof method === "string" && typeof path === "string") {
      const signature = `${method} ${path}`;
      if (routeSignatures.has(signature)) {
        issues.push({
          path: `routes.${String(routeName)}`,
          message: `Duplicate route method and path: "${signature}".`,
        });
      }
      routeSignatures.add(signature);
    }
  }

  const seen = new Set<string>();

  for (const model of models) {
    if (!isRecord(model)) {
      issues.push({ path: "models", message: "Every model must be an object." });
      continue;
    }

    const modelObj = model;
    const modelName = modelObj["name"];

    if (!isNonEmptyString(modelName)) {
      issues.push({ path: "models.name", message: "Model name must not be empty." });
      continue;
    }

    if (seen.has(modelName)) {
      issues.push({
        path: `models.${modelName}`,
        message: `Duplicate model name: "${modelName}". Model names must be unique.`,
      });
    }

    seen.add(modelName);
  }

  for (const model of models) {
    if (!isRecord(model)) {
      continue;
    }

    const modelObj = model;
    const modelName = modelObj["name"];

    if (typeof modelName !== "string") {
      continue;
    }

    const fields = modelObj["fields"];
    if (fields !== undefined && !isRecord(fields)) {
      issues.push({
        path: `models.${String(modelName)}.fields`,
        message: "Model fields must be an object.",
      });
    }
    const fieldEntries = isRecord(fields) ? Object.entries(fields) : [];

    for (const [name, fieldDef] of fieldEntries) {
      const fieldType =
        fieldDef && typeof fieldDef === "object" && (fieldDef as Record<string, unknown>)["type"];

      if (!isSemanticType(fieldType)) {
        issues.push({
          path: `models.${modelName}.fields.${name}.type`,
          message: `Invalid field type for "${modelName}.${name}".`,
        });
      }
    }

    const relationships = modelObj["relationships"];
    if (relationships !== undefined && !isRecord(relationships)) {
      issues.push({
        path: `models.${String(modelName)}.relationships`,
        message: "Model relationships must be an object.",
      });
    }
    const relationshipEntries = isRecord(relationships) ? Object.entries(relationships) : [];

    for (const [name, relDef] of relationshipEntries) {
      const relObj =
        isRecord(relDef) ? relDef : undefined;

      if (!relObj) {
        issues.push({
          path: `models.${String(modelName)}.relationships.${name}`,
          message: "Relationship definition must be an object.",
        });
      }

      const relType =
        relObj && typeof relObj === "object" && (relObj as Record<string, unknown>)["type"];

      if (!VALID_RELATIONSHIP_TYPES.includes(String(relType))) {
        issues.push({
          path: `models.${modelName}.relationships.${name}.type`,
          message: `Invalid relationship type for "${modelName}.${name}".`,
        });
      }

      const targetModel = relObj && relObj["model"];

      if (typeof targetModel === "string" && !modelNames.has(targetModel)) {
        issues.push({
          path: `models.${modelName}.relationships.${name}.model`,
          message: `Relationship "${modelName}.${name}" references unknown model "${targetModel}".`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (modelName: string): void => {
    if (visiting.has(modelName)) {
      const cycleStart = stack.indexOf(modelName);

      if (cycleStart >= 0) {
        const cycle = [...stack.slice(cycleStart), modelName].join(" -> ");

        issues.push({
          path: "models",
          message: `Circular relationship dependency: ${cycle}.`,
        });
      }

      return;
    }

    if (visited.has(modelName)) {
      return;
    }

    visiting.add(modelName);
    stack.push(modelName);

    const model = models.find((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }

      return (candidate as Record<string, unknown>)["name"] === modelName;
    });

    if (model && typeof model === "object") {
      const modelObj = model as Record<string, unknown>;
      const relationships = modelObj["relationships"];

      if (relationships && typeof relationships === "object") {
        for (const relDef of Object.values(relationships as Record<string, unknown>)) {
          const relObj = isRecord(relDef) ? relDef : undefined;

          const targetModel = relObj && relObj["model"];

          // self-referencing relationships are a valid pattern
          if (typeof targetModel === "string" && targetModel !== modelName) {
            visit(targetModel);
          }
        }
      }
    }

    stack.pop();
    visiting.delete(modelName);
    visited.add(modelName);
  };

  for (const model of models) {
    if (isRecord(model)) {
      const modelName = model["name"];

      if (typeof modelName === "string") {
        visit(modelName);
      }
    }
  }

  return issues;
}

function diagnosticCode(issue: ValidationIssue): string {
  const path = issue.path;
  const message = issue.message;

  if (path === "definition") return "definition.invalid-shape";
  if (path === "name") return "definition.invalid-name";
  if (path === "version") return "definition.invalid-version";
  if (path === "environment") return "definition.invalid-environment";
  if (path === "stack" || path.startsWith("stack.")) return "definition.invalid-stack";
  if (path === "features" || path.startsWith("features.")) return "definition.invalid-features";
  if (path === "definitions") return "definition.invalid-registry";
  if (path === "models" || path.startsWith("models.")) {
    if (message.startsWith("Duplicate model name:")) return "definition.duplicate-model";
    if (path.endsWith(".type")) return "definition.invalid-field-type";
    if (path.endsWith(".model")) return "definition.missing-reference";
    return "definition.invalid-model";
  }
  if (path === "routes" || path.startsWith("routes.")) {
    if (message.startsWith("Duplicate route name:")) return "definition.duplicate-route";
    if (message.startsWith("Duplicate route method and path:")) {
      return "definition.duplicate-route-signature";
    }
    return "definition.invalid-route";
  }
  return "definition.invalid";
}

function issueToDiagnostic(issue: ValidationIssue): Diagnostic {
  return {
    severity: "error",
    code: diagnosticCode(issue),
    message: issue.message,
    path: issue.path,
  };
}

function normalizedDefinition(definition: ApplicationDefinition): ApplicationDefinition {
  return {
    ...definition,
    models: definition.models ?? [],
    routes: definition.routes ?? [],
    definitions: definition.definitions ?? {},
  };
}

export function validateDefinitionResult(
  definition: unknown,
): ValidationResult<ApplicationDefinition> {
  const issues = validateDefinition(definition);
  const diagnostics = issues.map(issueToDiagnostic);

  if (diagnostics.length > 0) {
    return { valid: false, diagnostics };
  }

  return {
    valid: true,
    value: normalizedDefinition(definition as ApplicationDefinition),
    diagnostics,
  };
}

export function normalizeDefinition(
  definition: unknown,
): ValidationResult<ApplicationDefinition> {
  return validateDefinitionResult(definition);
}

/** Define a Mavibase application */
export function defineApp(definition: ApplicationDefinition): ApplicationDefinition {
  if (!isRecord(definition) || !isNonEmptyString(definition["name"])) {
    throw new Error("Application name must not be empty.");
  }

  if (!isSemver(definition["version"])) {
    throw new Error(`Invalid application version: "${definition.version}". Expected semver.`);
  }

  const issues = validateDefinition(definition);

  if (issues.length > 0) {
    throw new Error(
      `Invalid application definition: ${issues.map((issue) => issue.message).join(" ")}`,
    );
  }

  return {
    ...definition,
    models: definition.models ?? [],
    ...(definition.routes === undefined ? {} : { routes: definition.routes }),
    definitions: definition.definitions ?? {},
  };
}
