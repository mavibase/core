import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";

export function generateApiErrors(graph: ApplicationGraph): GeneratedFile | undefined {
  const hasRoutes = graph.nodes.some((node) => node.type === "route");
  if (!hasRoutes) return undefined;
  return {
    path: "api-errors.ts",
    content: `export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export function createApiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  return {
    status,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

export function notImplementedError(): ApiError {
  return createApiError(501, "NOT_IMPLEMENTED", "Route handler is not implemented.");
}
`,
  };
}
