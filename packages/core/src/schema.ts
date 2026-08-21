export interface SchemaReference {
  name: string;
}

export type SchemaExpression =
  | { kind: "model"; model: string }
  | { kind: "reference"; schema: SchemaReference }
  | { kind: "object"; fields: Record<string, SchemaExpression> }
  | { kind: "array"; item: SchemaExpression }
  | { kind: "union"; members: readonly SchemaExpression[] }
  | { kind: "intersection"; members: readonly SchemaExpression[] };

export function validateSchemaExpression(value: unknown, path = "schema"): readonly string[] {
  const issues: string[] = [];

  function visit(expression: unknown, expressionPath: string): void {
    if (!expression || typeof expression !== "object" || Array.isArray(expression)) {
      issues.push(`${expressionPath} must be a schema expression object.`);
      return;
    }
    const candidate = expression as Record<string, unknown>;
    const kind = candidate["kind"];
    if (
      kind !== "model" &&
      kind !== "reference" &&
      kind !== "object" &&
      kind !== "array" &&
      kind !== "union" &&
      kind !== "intersection"
    ) {
      issues.push(`${expressionPath}.kind is unsupported: "${String(kind)}".`);
      return;
    }
    if (kind === "model") {
      if (typeof candidate["model"] !== "string" || !candidate["model"].trim()) {
        issues.push(`${expressionPath}.model must be a non-empty string.`);
      }
      return;
    }
    if (kind === "reference") {
      const schema = candidate["schema"];
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        issues.push(`${expressionPath}.schema must be an object.`);
      } else if (
        typeof (schema as Record<string, unknown>)["name"] !== "string" ||
        !(schema as Record<string, unknown>)["name"]
      ) {
        issues.push(`${expressionPath}.schema.name must be a non-empty string.`);
      }
      return;
    }
    if (kind === "object") {
      const fields = candidate["fields"];
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        issues.push(`${expressionPath}.fields must be an object.`);
        return;
      }
      for (const name of Object.keys(fields).sort((left, right) => left.localeCompare(right))) {
        visit((fields as Record<string, unknown>)[name], `${expressionPath}.fields.${name}`);
      }
      return;
    }
    if (kind === "array") {
      visit(candidate["item"], `${expressionPath}.item`);
      return;
    }
    const members = candidate["members"];
    if (!Array.isArray(members) || members.length < 2) {
      issues.push(`${expressionPath}.members must contain at least two schema expressions.`);
      return;
    }
    members.forEach((member, index) => visit(member, `${expressionPath}.members[${index}]`));
  }

  visit(value, path);
  return issues;
}
