export interface RouteResponseDefinition {
  status: number;
  description?: string;
  schema?: string;
  contentType?: string;
}

export interface DefineResponseInput {
  status: number;
  description?: string;
  schema?: string;
  contentType?: string;
}

export function defineResponse(input: DefineResponseInput): RouteResponseDefinition {
  if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
    throw new Error(`Invalid response status: "${input.status}".`);
  }
  if (input.schema !== undefined && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(input.schema)) {
    throw new Error(`Invalid response schema reference: "${input.schema}".`);
  }
  return {
    status: input.status,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
  };
}
