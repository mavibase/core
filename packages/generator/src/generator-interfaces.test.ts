import { describe, expect, it } from "vitest";

import type {
  BackendGeneratorSet,
  ControllerGenerator,
  GeneratorContext,
  RepositoryGenerator,
} from "./generator-interfaces.js";

const context: GeneratorContext = {
  graph: { name: "example", version: "0.1.0", nodes: [], edges: [] },
  framework: "express",
  outDir: "generated",
};

const controller: ControllerGenerator = {
  name: "express-controller-generator",
  kind: "controller",
  supportedFrameworks: ["express"],
  supports: (candidate) => candidate.framework === "express",
  generate: () => [{ path: "controllers/index.ts", content: "" }],
};

const repository: RepositoryGenerator = {
  name: "postgresql-repository-generator",
  kind: "repository",
  supportedFrameworks: ["express"],
  supports: (candidate) => candidate.framework === "express",
  generate: () => [{ path: "repositories/index.ts", content: "" }],
};

describe("generator interfaces", () => {
  it("defines the context required by a generator component", () => {
    expect(controller.supports(context)).toBe(true);
    expect(controller.generate(context)).toEqual([{ path: "controllers/index.ts", content: "" }]);
  });

  it("keeps controller and repository components distinct", () => {
    const components: BackendGeneratorSet = {
      controllers: [controller],
      repositories: [repository],
      requestSchemas: [],
      responseSchemas: [],
      routeRegistrations: [],
      errorInfrastructure: [],
    };

    expect(components.controllers[0]?.kind).toBe("controller");
    expect(components.repositories[0]?.kind).toBe("repository");
  });
});
