export type StructuredConstraint =
  | { kind: "minLength"; value: number }
  | { kind: "maxLength"; value: number }
  | { kind: "pattern"; value: string }
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "email" }
  | { kind: "refine"; id: string };

export interface RefinementDefinition {
  importPath: string;
  exportName: string;
}

export interface ValidationDefinitions {
  refinements?: Record<string, RefinementDefinition>;
}

export function validateStructuredConstraints(
  constraints: unknown,
): readonly string[] {
  if (!Array.isArray(constraints)) return ["Constraints must be an array."];
  const issues: string[] = [];
  for (const [index, value] of constraints.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push("Constraint at index " + index + " must be an object.");
      continue;
    }
    const constraint = value as Record<string, unknown>;
    const kind = constraint["kind"];
    if (
      kind !== "minLength" &&
      kind !== "maxLength" &&
      kind !== "pattern" &&
      kind !== "min" &&
      kind !== "max" &&
      kind !== "email" &&
      kind !== "refine"
    ) {
      issues.push("Unsupported constraint kind: \"" + String(kind) + "\".");
      continue;
    }
    if (kind === "email") continue;
    if (kind === "pattern" && typeof constraint["value"] !== "string") {
      issues.push("Constraint \"" + kind + "\" value must be a string.");
    } else if (
      (kind === "minLength" || kind === "maxLength") &&
      (!Number.isInteger(constraint["value"]) || Number(constraint["value"]) < 0)
    ) {
      issues.push("Constraint \"" + kind + "\" value must be a non-negative integer.");
    } else if (
      (kind === "min" || kind === "max") &&
      (typeof constraint["value"] !== "number" || !Number.isFinite(constraint["value"]))
    ) {
      issues.push("Constraint \"" + kind + "\" value must be a finite number.");
    } else if (
      kind === "refine" &&
      (typeof constraint["id"] !== "string" || constraint["id"].trim().length === 0)
    ) {
      issues.push("Constraint \"refine\" requires a non-empty id.");
    }
  }
  return issues;
}
