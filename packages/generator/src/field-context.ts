import {
  isSemanticType,
  type Diagnostic,
  type FieldDefinition,
  type NormalizedField,
  type SemanticType,
  type ValidationResult,
} from "@mavibase/core";

export interface GeneratorFieldContext {
  name: string;
  semanticType: SemanticType;
  typescriptType: string;
  zodExpression: string;
  postgresType?: string;
  openApiSchema: Record<string, unknown>;
  optional: boolean;
  nullable: boolean;
  readOnly: boolean;
  writeOnly: boolean;
}

export class FieldContextError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(path: string, diagnostics: readonly Diagnostic[]) {
    super(`Invalid field at "${path}": ${diagnostics.map((diagnostic) => diagnostic.message).join(" ")}`);
    this.name = "FieldContextError";
    this.diagnostics = diagnostics;
  }
}

function fieldName(path: string): string {
  const value = path.split(".").pop() ?? path;
  return value.replace(/\]$/, "");
}

function normalizedModifiers(field: FieldDefinition): Required<NonNullable<FieldDefinition["modifiers"]>> {
  const modifiers = field.modifiers ?? {};
  return {
    required: modifiers.required === true,
    optional: modifiers.optional === true,
    nullable: modifiers.nullable === true,
    unique: modifiers.unique === true,
    indexed: modifiers.indexed === true,
    primary: modifiers.primary === true,
    default: modifiers.default,
    generated: modifiers.generated === true,
    writeOnly: modifiers.writeOnly === true,
    readOnly: modifiers.readOnly === true,
  };
}

export function normalizeField(field: FieldDefinition, path: string): ValidationResult<NormalizedField> {
  const diagnostics: Diagnostic[] = [];
  if (!field || typeof field !== "object") {
    return {
      valid: false,
      diagnostics: [{ severity: "error", code: "field.invalid", message: "Field must be an object.", path }],
    };
  }
  if (!isSemanticType(field.type)) {
    diagnostics.push({
      severity: "error",
      code: "field.type.invalid",
      message: "Field type is not a supported semantic type.",
      path: `${path}.type`,
    });
  }
  const modifiers = normalizedModifiers(field);
  if (modifiers.required && modifiers.optional) {
    diagnostics.push({
      severity: "error",
      code: "field.modifiers.conflict",
      message: "A field cannot be both required and optional.",
      path: `${path}.modifiers`,
    });
  }
  if (field.validation !== undefined && typeof field.validation !== "string") {
    diagnostics.push({
      severity: "error",
      code: "field.validation.invalid",
      message: "Field validation must be a string.",
      path: `${path}.validation`,
    });
  }
  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return {
    valid: true,
    value: {
      name: fieldName(path),
      type: field.type,
      modifiers,
      ...(field.validation === undefined ? {} : { validation: field.validation }),
    },
    diagnostics: [],
  };
}

function typescriptType(type: SemanticType): string {
  if (typeof type === "string") {
    return {
      string: "string",
      text: "string",
      integer: "number",
      float: "number",
      decimal: "number",
      boolean: "boolean",
      date: "Date",
      datetime: "Date",
      uuid: "string",
      json: "unknown",
      bigint: "bigint",
    }[type];
  }
  if (type.kind === "enum") return type.values.map((value) => JSON.stringify(value)).join(" | ");
  return `Array<${typescriptType(type.element)}>`;
}

function zodExpression(type: SemanticType): string {
  if (typeof type === "string") {
    return {
      string: "z.string()",
      text: "z.string()",
      integer: "z.number().int()",
      float: "z.number()",
      decimal: "z.number()",
      boolean: "z.boolean()",
      date: "z.coerce.date()",
      datetime: "z.coerce.date()",
      uuid: "z.string().uuid()",
      json: "z.unknown()",
      bigint: "z.bigint()",
    }[type];
  }
  if (type.kind === "enum") return `z.enum(${JSON.stringify(type.values)})`;
  return `z.array(${zodExpression(type.element)})`;
}

function postgresType(type: SemanticType): string {
  if (typeof type === "string") {
    return {
      string: "VARCHAR",
      text: "TEXT",
      integer: "INTEGER",
      float: "DOUBLE PRECISION",
      decimal: "DECIMAL",
      boolean: "BOOLEAN",
      date: "DATE",
      datetime: "TIMESTAMP",
      uuid: "UUID",
      json: "JSONB",
      bigint: "BIGINT",
    }[type];
  }
  if (type.kind === "enum") return "TEXT";
  return `${postgresType(type.element)}[]`;
}

function openApiSchema(type: SemanticType): Record<string, unknown> {
  if (typeof type === "string") {
    return {
      string: { type: "string" },
      text: { type: "string" },
      integer: { type: "integer" },
      float: { type: "number", format: "float" },
      decimal: { type: "number" },
      boolean: { type: "boolean" },
      date: { type: "string", format: "date" },
      datetime: { type: "string", format: "date-time" },
      uuid: { type: "string", format: "uuid" },
      json: {},
      bigint: { type: "integer", format: "int64" },
    }[type];
  }
  if (type.kind === "enum") return { type: "string", enum: [...type.values] };
  return { type: "array", items: openApiSchema(type.element) };
}

export function generatorFieldContext(
  field: FieldDefinition,
  path: string,
): ValidationResult<GeneratorFieldContext> {
  const normalized = normalizeField(field, path);
  if (!normalized.valid) return { valid: false, diagnostics: normalized.diagnostics };
  const value = normalized.value as NormalizedField;
  const { type, modifiers, validation } = value;
  return {
    valid: true,
    value: {
      name: value.name,
      semanticType: type,
      typescriptType: typescriptType(type),
      zodExpression: validation?.trim() || zodExpression(type),
      postgresType: postgresType(type),
      openApiSchema: openApiSchema(type),
      optional: modifiers.optional,
      nullable: modifiers.nullable,
      readOnly: modifiers.readOnly,
      writeOnly: modifiers.writeOnly,
    },
    diagnostics: [],
  };
}

export function requireGeneratorFieldContext(field: FieldDefinition, path: string): GeneratorFieldContext {
  const result = generatorFieldContext(field, path);
  if (!result.valid) throw new FieldContextError(path, result.diagnostics);
  return result.value as GeneratorFieldContext;
}
