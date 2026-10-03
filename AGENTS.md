# Repository Guidelines

## Project Structure & Module Organization

This repository contains the TypeScript core domain for the Resume V2 model. Production code lives under `src/`:

- `src/types/` contains serializable domain contracts such as `ResumeDocument`.
- `src/core/resume/` contains document creation, validation, serialization, constants, and command handling.
- `src/core/history/` contains undo/redo state and history operations.
- Files ending in `.test.ts` sit beside the implementation they verify.
- `src/data/` holds example fixtures. `docs/` contains the data-model design notes.

`dist/` is a legacy snapshot and is not the source of truth for the V2 core.

## Build, Test, and Development Commands

Install dependencies with `npm install`, then use:

```bash
npm run typecheck   # Run strict TypeScript checks without emitting files
npm test            # Run the Vitest suite once
npm run test:watch  # Run Vitest interactively during development
npm run check       # Run typecheck followed by the test suite
```

There is currently no separate production build or lint script; keep changes compatible with the `tsconfig.json` settings.

## Coding Style & Naming Conventions

Use TypeScript ESM, strict typing, two-space indentation, and semicolons, matching the existing files. Prefer pure functions and immutable updates for domain operations. Use `PascalCase` for types/classes, `camelCase` for functions and variables, and descriptive `UPPER_SNAKE_CASE` only for constants. Preserve stable branded IDs and serializable ISO date strings; do not introduce DOM, React, `File`, or other runtime-only values into domain types.

## Testing Guidelines

Tests use Vitest with the Node environment. Name files `<module>.test.ts`, keep them beside the module, and cover validation failures, serialization round trips, command behavior, and history invariants. Run `npm run check` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits use concise imperative subjects (for example, `Implement resume core domain`). Follow that style and keep each commit focused. Pull requests should explain the domain or behavior change, list verification commands and results, link any relevant issue or design note, and include test evidence for changed invariants. Call out schema or serialization compatibility implications explicitly.

## Architecture & Data-Model Rules

Keep content, layout, and theme separate. Layout nodes reference stable content IDs rather than copied text. AI changes must target `content.*` through normal commands, and persisted documents must remain versioned and JSON-serializable.
