import {
  isSemanticType,
  type Diagnostic,
  type FieldDefinition,
  type NormalizedField,
  type SemanticType,
  type StructuredConstraint,
  type ValidationResult,
  validateStructuredConstraints,
} from "@mavibase/core";

export interface GeneratorFieldContext {
  name: string;
  semanticType: SemanticType;
  typescriptType: string;
  zodExpression: string;
  constraints: readonly StructuredConstraint[];
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

function legacyConstraints(expression: string): readonly StructuredConstraint[] | undefined {
  const value = expression.trim();
  if (value === "z.string().email()") return [{ kind: "email" }];
  const stringMin = value.match(/^z\.string\(\)\.min\((\d+)\)$/);
  if (stringMin) return [{ kind: "minLength", value: Number(stringMin[1]) }];
  const stringMax = value.match(/^z\.string\(\)\.max\((\d+)\)$/);
  if (stringMax) return [{ kind: "maxLength", value: Number(stringMax[1]) }];
  const numberMin = value.match(/^z\.number\(\)\.min\((-?\d+(?:\.\d+)?)\)$/);
  if (numberMin) return [{ kind: "min", value: Number(numberMin[1]) }];
  const numberMax = value.match(/^z\.number\(\)\.max\((-?\d+(?:\.\d+)?)\)$/);
  if (numberMax) return [{ kind: "max", value: Number(numberMax[1]) }];
  const pattern = value.match(/^z\.string\(\)\.regex\((["'])(.*)\1\)$/);
  if (pattern) return [{ kind: "pattern", value: pattern[2] ?? "" }];
  return undefined;
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
  const constraints = [...(field.constraints ?? [])] as StructuredConstraint[];
  if (typeof field.validation === "string") {
    const legacy = legacyConstraints(field.validation);
    if (!legacy) {
      diagnostics.push({
        severity: "error",
        code: "field.validation.unsupported",
        message: "Legacy validation expression is unsupported; use structured constraints.",
        path: path + ".validation",
      });
    } else {
      constraints.push(...legacy);
    }
  }
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
  for (const message of validateStructuredConstraints(constraints)) {
    diagnostics.push({
      severity: "error",
      code: "field.constraints.invalid",
      message,
      path: `${path}.constraints`,
    });
  }
  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return {
    valid: true,
    value: {
      name: fieldName(path),
      type: field.type,
      modifiers,
      constraints: constraints as readonly StructuredConstraint[],
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
  const { type, modifiers, constraints } = value;
  return {
    valid: true,
    value: {
      name: value.name,
      semanticType: type,
      typescriptType: typescriptType(type),
      zodExpression: zodExpression(type),
      constraints,
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
