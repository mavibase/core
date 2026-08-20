export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  value?: T;
  diagnostics: readonly Diagnostic[];
}

export function hasErrors(result: {
  diagnostics: readonly Diagnostic[];
}): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
