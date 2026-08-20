import { describe, expect, it } from "vitest";

import { defineModel, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateRelationships, relationshipTemplateData } from "./relationship-generator.js";

describe("relationship generator", () => {
  it("generates deterministic relationship metadata for supported cardinalities", () => {
    const User = defineModel({
      name: "User",
      relationships: {
        posts: relationship.oneToMany().to("Post"),
        profile: relationship.oneToOne().to("Profile"),
      },
    });
    const Post = defineModel({ name: "Post" });
    const Profile = defineModel({ name: "Profile" });
    const graph = buildGraph({
      name: "relationship-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, Post, Profile],
    });

    const first = generateRelationships(graph);
    const second = generateRelationships(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("relationships.ts");
    expect(first?.content).toContain("export const UserRelationships = {");
    expect(first?.content).toContain(
      '"posts": { source: "User", target: "Post", type: "one-to-many", cardinality: "many", required: false, optional: true },',
    );
    expect(first?.content).toContain(
      '"profile": { source: "User", target: "Profile", type: "one-to-one", cardinality: "one", required: false, optional: true },',
    );
  });

  it("sorts models and relationships and returns no artifact without relationships", () => {
    const graph = buildGraph({
      name: "relationship-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [
        defineModel({
          name: "User",
          relationships: {
            zPost: relationship.manyToOne().to("Post"),
            aProfile: relationship.oneToOne().to("Profile"),
          },
        }),
        defineModel({ name: "Post" }),
        defineModel({ name: "Profile" }),
      ],
    });

    expect(relationshipTemplateData(graph).models.map((model) => model.name)).toEqual(["User"]);
    expect(
      relationshipTemplateData(graph).models[0]?.relationships.map((item) => item.name),
    ).toEqual(["aProfile", "zPost"]);
    expect(
      generateRelationships({ name: "empty", version: "1.0.0", nodes: [], edges: [] }),
    ).toBeUndefined();
  });
});
