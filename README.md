# Mavibase Core

Mavibase is a TypeScript-first full-stack application development system. Define your application once, and Mavibase generates and manages the repetitive backend, frontend integration, APIs, models, validation, security, types, and project structure.

This repository contains the Mavibase Core engine — the monorepo that powers the CLI, Console, and code generation.

## Packages

| Package                       | Purpose                                | Dependencies                                    |
| ----------------------------- | -------------------------------------- | ----------------------------------------------- |
| `@mavibase/core`              | Application definition engine          | —                                               |
| `@mavibase/application-graph` | Machine-readable application structure | `@mavibase/core`                                |
| `@mavibase/generator`         | Code generation engine                 | `@mavibase/core`, `@mavibase/application-graph` |
| `@mavibase/config`            | `mavibase.config.ts` handling          | —                                               |

## Architecture

```
Application Definition
        ↓
Application Graph
        ↓
Generator
        ↓
Generated Application
```

Dependency direction (no circular dependencies):

```
@mavibase/core               (no internal dependencies)
   ├── @mavibase/application-graph
   │     └── @mavibase/generator
   └── (independent) @mavibase/config
```

`@mavibase/config` is intentionally independent. It does not depend on any other Mavibase package so it can be published and reused standalone.

## Development

Installing dependencies:

```bash
pnpm install
```

Running all checks:

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript type checking
pnpm test        # Vitest unit tests
pnpm build       # Build all packages
```

Formatting the code:

```bash
pnpm format       # Write formatted files
pnpm format:check # Verify formatting
```

## License

MIT
