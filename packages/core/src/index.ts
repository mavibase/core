import type {
  BackendFramework,
  DatabaseProvider,
  Language,
  Runtime,
  WebFramework,
} from "@mavibase/config";

export const version = "0.1.0";

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
  | "string"
  | "integer"
  | "float"
  | "decimal"
  | "boolean"
  | "uuid"
  | "datetime"
  | "json";

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
function createField(
  type: FieldType,
  modifiers?: FieldModifiers,
): ModifiableField {
  const definition = Object.create(fieldPrototype) as ModifiableField;

  definition.type = type;

  if (modifiers) {
    definition.modifiers = modifiers;
  }

  return definition;
}

/** Return a new field with the given modifiers merged in */
function withModifiers(
  field: ModifiableField,
  modifiers: FieldModifiers,
): ModifiableField {
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

export interface ModelDefinition {
  /** Stable identifier for the model */
  id: string;

  /** Human-readable model name */
  name: string;

  /** Model fields */
  fields?: Record<string, FieldDefinition>;

  /** Model relationships */
  relationships?: Record<string, unknown>;

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
  relationships?: Record<string, unknown>;
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

/** Define a Mavibase application */
export function defineApp(
  definition: ApplicationDefinition,
): ApplicationDefinition {
  if (!definition.name.trim()) {
    throw new Error("Application name must not be empty.");
  }

  if (!/^\d+\.\d+\.\d+/.test(definition.version)) {
    throw new Error(
      `Invalid application version: "${definition.version}". Expected semver.`,
    );
  }

  const models = definition.models ?? [];

  const seen = new Set<string>();

  for (const model of models) {
    if (seen.has(model.name)) {
      throw new Error(
        `Duplicate model name: "${model.name}". Model names must be unique.`,
      );
    }

    seen.add(model.name);
  }

  return {
    ...definition,
    models,
    definitions: definition.definitions ?? {},
  };
}
