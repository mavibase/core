import type {
  BackendFramework,
  DatabaseProvider,
  Language,
  Runtime,
  WebFramework,
} from "@mavibase/config";

import { isRouteMethod, type RouteDefinition } from "./routes.js";
import { validateRouteParameters, type DefineParameterInput } from "./parameters.js";

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
export type FieldType =
  "string" | "integer" | "float" | "decimal" | "boolean" | "uuid" | "datetime" | "json";

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
  type: FieldType;
  modifiers?: FieldModifiers;
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
};

/** Build a field from a type and optional modifiers */
function createField(type: FieldType, modifiers?: FieldModifiers): ModifiableField {
  const definition = Object.create(fieldPrototype) as ModifiableField;

  definition.type = type;

  if (modifiers) {
    definition.modifiers = modifiers;
  }

  return definition;
}

/** Return a new field with the given modifiers merged in */
function withModifiers(field: ModifiableField, modifiers: FieldModifiers): ModifiableField {
  return createField(field.type, {
    ...field.modifiers,
    ...modifiers,
  });
}

/** Factory for creating field definitions */
export const field = {
  string(): ModifiableField {
    return createField("string");
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
  json(): ModifiableField {
    return createField("json");
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
  indexes?: unknown[];

  /** Database constraints */
  constraints?: unknown[];

  /** Additional model metadata */
  metadata?: Record<string, unknown>;
}

export interface DefineModelInput {
  name: string;
  id?: string;
  fields?: Record<string, FieldDefinition>;
  relationships?: Record<string, RelationshipDefinition>;
  indexes?: unknown[];
  constraints?: unknown[];
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

  return {
    id,
    name: input.name,
    fields: input.fields ?? {},
    relationships: input.relationships ?? {},
    indexes: input.indexes ?? [],
    constraints: input.constraints ?? [],
    metadata: input.metadata ?? {},
  };
}
export interface ValidationIssue {
  path: string;
  /**Description of the problem */
  message: string;
}

const VALID_FIELD_TYPES: readonly string[] = [
  "string",
  "integer",
  "float",
  "decimal",
  "boolean",
  "uuid",
  "datetime",
  "json",
];

const VALID_RELATIONSHIP_TYPES: readonly string[] = [
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many",
];

/** Validate a definition and return any issues found */
export function validateDefinition(definition: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!definition || typeof definition !== "object") {
    return issues;
  }

  const candidate = definition as Record<string, unknown>;
  const rawModels = candidate["models"];
  const rawRoutes = candidate["routes"];

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
    if (!route || typeof route !== "object") continue;
    const routeObj = route as Record<string, unknown>;
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
    if (Array.isArray(parameters) && typeof path === "string") {
      for (const issue of validateRouteParameters(path, parameters as DefineParameterInput[])) {
        issues.push({
          path: `routes.${String(routeName)}.${issue.path}`,
          message: issue.message,
        });
      }
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
    if (!model || typeof model !== "object") {
      continue;
    }

    const modelObj = model as Record<string, unknown>;
    const modelName = modelObj["name"];

    if (typeof modelName !== "string") {
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
    if (!model || typeof model !== "object") {
      continue;
    }

    const modelObj = model as Record<string, unknown>;
    const modelName = modelObj["name"];

    if (typeof modelName !== "string") {
      continue;
    }

    const fields = modelObj["fields"];
    const fieldEntries =
      fields && typeof fields === "object" ? Object.entries(fields as Record<string, unknown>) : [];

    for (const [name, fieldDef] of fieldEntries) {
      const fieldType =
        fieldDef && typeof fieldDef === "object" && (fieldDef as Record<string, unknown>)["type"];

      if (!VALID_FIELD_TYPES.includes(String(fieldType))) {
        issues.push({
          path: `models.${modelName}.fields.${name}.type`,
          message: `Invalid field type for "${modelName}.${name}".`,
        });
      }
    }

    const relationships = modelObj["relationships"];
    const relationshipEntries =
      relationships && typeof relationships === "object"
        ? Object.entries(relationships as Record<string, unknown>)
        : [];

    for (const [name, relDef] of relationshipEntries) {
      const relObj =
        relDef && typeof relDef === "object" ? (relDef as Record<string, unknown>) : undefined;

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
          const relObj =
            relDef && typeof relDef === "object" ? (relDef as Record<string, unknown>) : undefined;

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
    if (model && typeof model === "object") {
      const modelName = (model as Record<string, unknown>)["name"];

      if (typeof modelName === "string") {
        visit(modelName);
      }
    }
  }

  return issues;
}

/** Define a Mavibase application */
export function defineApp(definition: ApplicationDefinition): ApplicationDefinition {
  if (!definition.name.trim()) {
    throw new Error("Application name must not be empty.");
  }

  if (!/^\d+\.\d+\.\d+/.test(definition.version)) {
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
