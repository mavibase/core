import type { ApplicationGraph } from "@mavibase/application-graph";

import type { GeneratedFile } from "./index.js";

export function generateApiErrors(graph: ApplicationGraph): GeneratedFile | undefined {
  const hasRoutes = graph.nodes.some((node) => node.type === "route");
  const hasCrud = graph.nodes.some((node) => {
    if (node.type !== "model" || !node.data) return false;
    const crud = node.data["crud"];
    return Boolean(crud && typeof crud === "object" && (crud as Record<string, unknown>)["enabled"] === true);
  });
  if (!hasRoutes && !hasCrud) return undefined;
  return {
    path: "api-errors.ts",
    content: `import type { ErrorRequestHandler } from "express";

export const apiErrorCodes = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "UNPROCESSABLE_ENTITY",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "OUTPUT_VALIDATION_ERROR",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface ApiError {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export function createApiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  requestId?: string,
): ApiError {
  return {
    status,
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

export function isApiError(value: unknown): value is ApiError {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>)["status"] === "number" &&
      typeof (value as Record<string, unknown>)["code"] === "string" &&
      typeof (value as Record<string, unknown>)["message"] === "string",
  );
}

export function toApiError(error: unknown, requestId?: string): ApiError {
  if (isApiError(error)) {
    return requestId === undefined || error.requestId !== undefined
      ? error
      : { ...error, requestId };
  }
  return createApiError(500, "INTERNAL_ERROR", "Internal server error.", undefined, requestId);
}

export function createApiErrorHandler(): ErrorRequestHandler {
  return (error, request, response, _next) => {
    const header = request.headers["x-request-id"];
    const requestId = typeof header === "string" ? header : undefined;
    const apiError = toApiError(error, requestId);
    response.status(apiError.status).json({ error: apiError });
  };
}

export function notImplementedError(): ApiError {
  return createApiError(501, "NOT_IMPLEMENTED", "Route handler is not implemented.");
}
`,
  };
}
