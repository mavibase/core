export const middlewarePhases = ["before", "after", "around"] as const;

export type MiddlewarePhase = (typeof middlewarePhases)[number];

export interface MiddlewareDefinition {
  id: string;
  name: string;
  phase?: MiddlewarePhase;
  options?: Record<string, unknown>;
}

export interface DefineMiddlewareInput {
  id?: string;
  name: string;
  phase?: MiddlewarePhase;
  options?: Record<string, unknown>;
}

export function defineMiddleware(input: DefineMiddlewareInput): MiddlewareDefinition {
  if (!input.name.trim()) {
    throw new Error("Middleware name must not be empty.");
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$.-]*$/.test(input.name)) {
    throw new Error(`Invalid middleware name: "${input.name}".`);
  }
  if (input.phase !== undefined && !middlewarePhases.includes(input.phase)) {
    throw new Error(`Invalid middleware phase: "${input.phase}".`);
  }
  return {
    id: input.id ?? input.name,
    name: input.name,
    ...(input.phase === undefined ? {} : { phase: input.phase }),
    ...(input.options === undefined ? {} : { options: { ...input.options } }),
  };
}
