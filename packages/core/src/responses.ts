import { validateSchemaExpression, type SchemaExpression } from "./schema.js";

export interface RouteResponseDefinition {
  status: number;
  description?: string;
  schema?: string | SchemaExpression;
  contentType?: string;
}

export interface DefineResponseInput {
  status: number;
  description?: string;
  schema?: string | SchemaExpression;
  contentType?: string;
}

export function defineResponse(input: DefineResponseInput): RouteResponseDefinition {
  if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
    throw new Error(`Invalid response status: "${input.status}".`);
  }
  if (
    typeof input.schema === "string" &&
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(input.schema)
  ) {
    throw new Error(`Invalid response schema reference: "${input.schema}".`);
  }
  if (input.schema !== undefined && typeof input.schema !== "string") {
    const issues = validateSchemaExpression(input.schema);
    if (issues.length > 0) throw new Error(issues[0]);
  }
  return {
    status: input.status,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
  };
}
