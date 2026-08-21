import type { ApplicationGraph, GraphNode } from "@mavibase/application-graph";
import { validateGraph } from "@mavibase/application-graph";

export type ModelValidationCategory =
  "input" | "persistence" | "output" | "relationship" | "database-constraint";

export interface ModelValidationIssue {
  category: ModelValidationCategory;
  path: string;
  message: string;
}

const fieldTypes = new Set([
  "string",
  "integer",
  "float",
  "decimal",
  "boolean",
  "uuid",
  "datetime",
  "json",
]);

const relationshipTypes = new Set(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]);
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function nodeName(node: GraphNode): string | undefined {
  const name = node.data?.["name"];
  return typeof name === "string" && name.trim() ? name : undefined;
}

function jsonSerializable(value: unknown): boolean {
  if (value === undefined) return false;
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

export function validateModelGraph(graph: ApplicationGraph): ModelValidationIssue[] {
  const issues: ModelValidationIssue[] = validateGraph(graph).map((issue) => ({
    category: "relationship",
    path: issue.path,
    message: issue.message,
  }));
  const models = graph.nodes.filter((node) => node.type === "model");
  const modelNames = new Set<string>();

  for (const model of models) {
    const name = nodeName(model);
    if (!name) {
      issues.push({
        category: "input",
        path: model.id,
        message: "Model name must be a non-empty string.",
      });
      continue;
    }
    if (!identifier.test(name)) {
      issues.push({
        category: "input",
        path: `models.${name}`,
        message: `Model name "${name}" is not a valid TypeScript identifier.`,
      });
    }
    if (modelNames.has(name)) {
      issues.push({
        category: "input",
        path: `models.${name}`,
        message: `Duplicate model name: "${name}".`,
      });
    }
    modelNames.add(name);
  }

  for (const model of models) {
    const modelName = nodeName(model) ?? model.id;
    const fields = graph.edges
      .filter((edge) => edge.from === model.id && edge.type === "has-field")
      .map((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is GraphNode => node?.type === "field");
    const fieldNames = new Set<string>();

    for (const field of fields) {
      const name = nodeName(field);
      if (!name) {
        issues.push({
          category: "input",
          path: `models.${modelName}.fields`,
          message: "Field name must be a non-empty string.",
        });
        continue;
      }
      const path = `models.${modelName}.fields.${name}`;
      const type = field.data?.["type"];
      if (typeof type !== "string" || !fieldTypes.has(type)) {
        issues.push({
          category: "input",
          path: `${path}.type`,
          message: `Unsupported field type: "${String(type)}".`,
        });
      }
      if (!identifier.test(name)) {
        issues.push({
          category: "input",
          path,
          message: `Field name "${name}" is not a valid TypeScript identifier.`,
        });
      }
      if (fieldNames.has(name)) {
        issues.push({ category: "input", path, message: `Duplicate field name: "${name}".` });
      }
      fieldNames.add(name);

      const modifiers = record(field.data?.["modifiers"]);
      const booleanModifiers = [
        "required",
        "optional",
        "nullable",
        "unique",
        "indexed",
        "primary",
        "generated",
        "readOnly",
        "writeOnly",
      ];
      for (const modifier of booleanModifiers) {
        if (modifier in modifiers && typeof modifiers[modifier] !== "boolean") {
          issues.push({
            category: "persistence",
            path: `${path}.modifiers.${modifier}`,
            message: `Field modifier "${modifier}" must be boolean.`,
          });
        }
      }
      if (modifiers["required"] === true && modifiers["optional"] === true) {
        issues.push({
          category: "input",
          path: `${path}.modifiers`,
          message: "A field cannot be both required and optional.",
        });
      }
      if (modifiers["readOnly"] === true && modifiers["writeOnly"] === true) {
        issues.push({
          category: "output",
          path: `${path}.modifiers`,
          message: "A field cannot be both read-only and write-only.",
        });
      }
      if ("default" in modifiers && !jsonSerializable(modifiers["default"])) {
        issues.push({
          category: "persistence",
          path: `${path}.modifiers.default`,
          message: "Field defaults must be JSON-serializable.",
        });
      }
      if (modifiers["generated"] === true && "default" in modifiers) {
        issues.push({
          category: "persistence",
          path: `${path}.modifiers`,
          message: "A generated field cannot also define a default value.",
        });
      }
    }

    const relationships = graph.edges
      .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
      .map((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is GraphNode => node?.type === "relationship");
    const relationshipNames = new Set<string>();

    for (const relationship of relationships) {
      const name = nodeName(relationship);
      const path = `models.${modelName}.relationships.${name ?? relationship.id}`;
      const data = record(relationship.data);
      const type = data["type"];
      const target = data["model"];
      if (!name || !identifier.test(name)) {
        issues.push({
          category: "relationship",
          path,
          message: "Relationship name must be a valid TypeScript identifier.",
        });
      }
      if (name && relationshipNames.has(name)) {
        issues.push({
          category: "relationship",
          path,
          message: `Duplicate relationship name: "${name}".`,
        });
      }
      if (name) relationshipNames.add(name);
      if (typeof type !== "string" || !relationshipTypes.has(type)) {
        issues.push({
          category: "relationship",
          path: `${path}.type`,
          message: `Unsupported relationship type: "${String(type)}".`,
        });
      }
      if (typeof target !== "string" || !modelNames.has(target)) {
        issues.push({
          category: "relationship",
          path: `${path}.model`,
          message: `Relationship target must reference a valid model: "${String(target)}".`,
        });
      }
      if (
        "field" in data &&
        (typeof data["field"] !== "string" || !fieldNames.has(data["field"]))
      ) {
        issues.push({
          category: "relationship",
          path: `${path}.field`,
          message: `Relationship field must reference a field on "${modelName}".`,
        });
      }
      if (
        typeof data["required"] === "boolean" &&
        typeof data["optional"] === "boolean" &&
        data["required"] === data["optional"]
      ) {
        issues.push({
          category: "relationship",
          path: `${path}`,
          message: "A relationship cannot be both required and optional.",
        });
      }
      if (data["owner"] !== undefined && data["owner"] !== "source" && data["owner"] !== "target") {
        issues.push({
          category: "relationship",
          path: `${path}.owner`,
          message: "Relationship owner must be source or target.",
        });
      }
      for (const key of ["onDelete", "onUpdate"] as const) {
        if (
          data[key] !== undefined &&
          !["cascade", "restrict", "set-null", "no-action"].includes(String(data[key]))
        ) {
          issues.push({
            category: "relationship",
            path: `${path}.${key}`,
            message: `Relationship ${key} must be a valid referential action.`,
          });
        }
      }
      if (type === "many-to-many") {
        if (typeof data["through"] !== "string" || !modelNames.has(data["through"])) {
          issues.push({
            category: "relationship",
            path: `${path}.through`,
            message: "Many-to-many relationships must reference an explicit join model.",
          });
        }
      }
    }
  }

  const inverseTypes: Record<string, string> = {
    "one-to-one": "one-to-one",
    "one-to-many": "many-to-one",
    "many-to-one": "one-to-many",
    "many-to-many": "many-to-many",
  };
  for (const model of models) {
    const source = nodeName(model);
    if (!source) continue;
    const relationships = graph.edges
      .filter((edge) => edge.from === model.id && edge.type === "has-relationship")
      .map((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is GraphNode => node?.type === "relationship");
    for (const relationship of relationships) {
      const data = record(relationship.data);
      const inverse = data["inverse"];
      if (typeof inverse !== "string") continue;
      const targetName = data["model"];
      const targetModel = models.find((candidate) => nodeName(candidate) === targetName);
      const targetRelationship = targetModel
        ? graph.edges
            .filter((edge) => edge.from === targetModel.id && edge.type === "has-relationship")
            .map((edge) => graph.nodes.find((node) => node.id === edge.to))
            .find((node) => node?.type === "relationship" && node.data?.["name"] === inverse)
        : undefined;
      const path = `models.${source}.relationships.${String(data["name"] ?? relationship.id)}.inverse`;
      if (!targetRelationship) {
        issues.push({
          category: "relationship",
          path,
          message: "Inverse relationship must exist on the target model.",
        });
        continue;
      }
      const targetData = record(targetRelationship.data);
      if (targetData["model"] !== source || targetData["inverse"] !== data["name"]) {
        issues.push({
          category: "relationship",
          path,
          message: "Inverse relationship must point back to the source relationship.",
        });
      }
      if (inverseTypes[String(data["type"])] !== targetData["type"]) {
        issues.push({
          category: "relationship",
          path,
          message: "Relationship cardinality does not match its inverse.",
        });
      }
    }
  }

  return issues;
}
