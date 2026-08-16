# Mavibase Core

Mavibase is a TypeScript-first full-stack application development system. Define your application once, and Mavibase generates and manages the repetitive backend, frontend integration, APIs, models, validation, security, types, and project structure.

This repository contains the Mavibase Core engine - the monorepo that powers the CLI, Console, and code generation.

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
