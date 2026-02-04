# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Monkeytype is a minimalistic typing test application built as a monorepo using Turborepo, pnpm workspaces, and TypeScript. The project consists of a Vite-based frontend, an Express backend with MongoDB/Redis, and shared packages for contracts, schemas, and utilities.

## Architecture

### Monorepo Structure

- **frontend/** - Vite + TypeScript frontend application
- **backend/** - Express.js + TypeScript backend API server
- **packages/** - Shared workspace packages:
  - `contracts/` - ts-rest API contracts defining the contract between frontend and backend
  - `schemas/` - Zod schemas for validation
  - `funbox/` - Test modifiers and special modes
  - `util/` - Shared utility functions
  - `typescript-config/` - Shared TypeScript configurations
  - `tsup-config/` - Shared build configurations
  - `oxlint-config/` - Shared linting configurations
  - `release/` - Release management utilities

### Frontend Architecture

Located in `frontend/src/ts/`:

- **test/** - Core typing test logic (test-logic.ts, test-ui.ts, test-input.ts, words-generator.ts, etc.)
- **controllers/** - Business logic controllers
- **components/** - UI components
- **elements/** - DOM element managers
- **modals/** - Modal dialog components
- **pages/** - Page-level components
- **utils/** - Utility functions
- **observables/** - Observable state management
- **states/** - Application state
- **ape/** - API client (using ts-rest)
- **db.ts** - IndexedDB wrapper for offline functionality
- **firebase.ts** - Firebase authentication integration

Key patterns:

- Uses custom `qs`, `qsa`, `qsr` helper functions instead of jQuery for DOM manipulation (in `utils/dom.ts`)
- Components use SolidJS for reactive UI in some areas
- Test logic is modular with separate concerns (input, stats, timer, UI, words generation)

### Backend Architecture

Located in `backend/src/`:

- **api/** - API layer:
  - `controllers/` - Request handlers
  - `routes/` - ts-rest route definitions
  - `ts-rest-adapter.ts` - Adapter for ts-rest with Express
- **dal/** - Data Access Layer for MongoDB collections (user.ts, result.ts, leaderboards.ts, etc.)
- **middlewares/** - Express middlewares (auth, rate-limiting, error handling)
- **utils/** - Utility functions
- **jobs/** - Scheduled jobs
- **queues/** - BullMQ queue definitions
- **workers/** - Background job workers
- **init/** - Initialization modules
- **services/** - Business logic services
- **anticheat/** - Anti-cheat detection logic

Key patterns:

- Uses ts-rest for type-safe API contracts shared with frontend
- DAL pattern for database operations
- Rate limiting with express-rate-limit and rate-limiter-flexible
- Redis for caching, daily leaderboards, and BullMQ job queues
- Firebase Admin SDK for authentication verification

### API Contract System

The project uses ts-rest to maintain type-safe API contracts:

- Contracts are defined in `packages/contracts/src/` (e.g., `users.ts`, `results.ts`, `leaderboards.ts`)
- Backend implements these contracts in `backend/src/api/routes/`
- Frontend consumes them via the API client in `frontend/src/ts/ape/`
- Changes to API contracts must be made in the contracts package and both frontend/backend must be updated accordingly

## Development Commands

### Project Root Commands

Use these for common operations across the monorepo:

**Building:**

```bash
pnpm build              # Build all workspaces
pnpm build-fe           # Build frontend only
pnpm build-be           # Build backend only
pnpm build-pkg          # Build packages only
```

**Development:**

```bash
pnpm dev                # Run frontend and backend in dev mode
pnpm dev-fe             # Run frontend dev server (port 3000)
pnpm dev-be             # Run backend dev server (port 5005)
```

**Testing:**

```bash
pnpm test               # Run all tests (unit + integration)
pnpm test-fe            # Run frontend tests only
pnpm test-be            # Run backend tests only (unit + integration)
pnpm test-pkg           # Run package tests only
```

**Linting:**

```bash
pnpm lint               # Lint all workspaces with oxlint (full, type-aware)
pnpm lint-fe            # Lint frontend only
pnpm lint-be            # Lint backend only
pnpm lint-fast          # Fast lint without type checking
pnpm lint-fast-fe       # Fast lint frontend
pnpm lint-fast-be       # Fast lint backend
```

**Formatting:**

```bash
pnpm format-check       # Check formatting with oxfmt
pnpm format-fix         # Auto-fix formatting with oxfmt
```

**Type Checking:**

```bash
pnpm ts-check           # Run TypeScript type checking across all workspaces
```

**Asset Validation:**

```bash
pnpm check-assets       # Validate JSON assets (languages, quotes, themes)
pnpm check-assets-quotes
pnpm check-assets-languages
pnpm check-assets-others
```

**Pre-commit:**

- Husky runs `pnpm pre-commit` which executes lint-staged
- lint-staged runs `oxfmt` and `oxlint --type-aware --type-check` on staged files

### Frontend-Specific Commands

From the `frontend/` directory:

```bash
pnpm dev                # Vite dev server
pnpm build              # Production build
pnpm start              # Preview production build
pnpm test               # Run vitest tests
pnpm test-coverage      # Run tests with coverage
pnpm lint               # oxlint with type checking
pnpm ts-check           # TypeScript type check
pnpm check-assets       # Validate JSON assets
pnpm docker             # Run frontend in Docker
```

### Backend-Specific Commands

From the `backend/` directory:

```bash
pnpm dev                # Development server with tsx watch + tsc watch + eslint watch
pnpm build              # Build TypeScript to dist/
pnpm start              # Run production build (dist/server.js)
pnpm test               # Run unit tests
pnpm integration-test   # Run integration tests
pnpm test-coverage      # Run tests with coverage
pnpm docker-db-only     # Run MongoDB + Redis in Docker
pnpm docker             # Run full backend stack in Docker
pnpm gen-docs           # Generate OpenAPI documentation
```

## Testing

### Frontend Tests

- Uses Vitest with three environments:
  - `unit` - happy-dom environment for most tests
  - `jsdom` - jsdom environment for DOM-heavy tests
  - `jsx` - SolidJS component tests
- Test files: `frontend/__tests__/**/*.spec.ts` (or `.spec.tsx`, `.jsdom-spec.ts`)
- Mocks are in `__tests__/__harness__/`

### Backend Tests

- Uses Vitest with three projects:
  - `unit` - Unit tests (`__tests__/**/*.spec.ts` excluding integration)
  - `integration` - Integration tests with shared test containers
  - `integration-isolated` - Isolated integration tests (run sequentially with `maxWorkers: 1`)
- Integration tests use testcontainers for MongoDB and Redis
- Test setup in `backend/__tests__/setup-tests.ts` and `backend/__tests__/__integration__/`

## Environment Setup

### Prerequisites

- Node.js 24.11.0 or 22.21.0 (use nvm: `nvm use`)
- pnpm 9.6.0 (`npm i -g pnpm@9.6.0`)

### Backend Services

The backend requires MongoDB and Redis:

**Option 1 - Docker (recommended):**

```bash
cd backend
pnpm docker-db-only
```

**Option 2 - Manual installation:**
Install MongoDB Community Edition and Redis locally

### Firebase Configuration

For authentication features:

1. Create a Firebase project
2. Enable Email/Password and Google authentication
3. Copy `frontend/src/ts/constants/firebase-config-example.ts` to `firebase-config.ts` and add your config
4. Copy `frontend/.firebaserc_example` to `.firebaserc` and set your project ID
5. For backend: Generate service account key and save to `backend/src/credentials/serviceAccountKey.json`

### Environment Files

- Backend: Copy `backend/example.env` to `backend/.env`
- Frontend: Create `frontend/.env` if accessing from network (set `BACKEND_URL`)

## Code Standards

### Formatting and Linting

- **Formatter:** oxfmt (OXC formatter)
- **Linter:** oxlint (OXC linter) with TypeScript plugin (oxlint-tsgolint)
- Configuration files: `.oxlintrc.json`, `.oxfmtrc.json`, `.prettierrc.json`
- Circular dependency checking with madge

### Commit Standards

Follow Conventional Commits format: `type(scope): description (@username)`

Types: `feat`, `impr`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`, `chore`

Examples:

- `feat: add new typing mode (@username)`
- `fix(leaderboard): correct ranking calculation (@username)`
- `impr(quotes): add German quotes (@username)`

### Code Style

- Migrating from jQuery to vanilla JS: Use `qs`, `qsa`, `qsr` helpers from `frontend/src/ts/utils/dom.ts`
- Avoid using jQuery `$()` in new code
- Use `export` statements before `const` in firebase config

## Common Tasks

### Adding a New API Endpoint

1. Define the contract in `packages/contracts/src/` using ts-rest
2. Add Zod schemas in `packages/schemas/src/` if needed
3. Implement the controller in `backend/src/api/controllers/`
4. Add the route in `backend/src/api/routes/`
5. Add DAL methods in `backend/src/dal/` if database access is needed
6. Update frontend API client in `frontend/src/ts/ape/endpoints/`

### Working with Database

- DAL files are in `backend/src/dal/` (e.g., `user.ts`, `result.ts`)
- MongoDB collections are accessed through the DAL pattern
- Use the existing DAL methods rather than direct MongoDB queries
- Integration tests use testcontainers for isolated database instances

### Modifying Test Assets

Test assets (languages, quotes, themes) are in `frontend/static/`:

- Add to the appropriate JSON file
- Update the corresponding `_list` file
- Run `pnpm check-assets` to validate
- Follow guidelines in `docs/CONTRIBUTING.md` for specific asset types

### Running Single Tests

Frontend:

```bash
cd frontend
pnpm vitest run <test-file-pattern>
```

Backend:

```bash
cd backend
pnpm vitest run <test-file-pattern> --project=unit
pnpm vitest run <test-file-pattern> --project=integration
```

### Debugging

Backend dev mode runs with `--inspect` flag for Node.js debugging on port 9229

## Additional Notes

- The project uses Git LFS for large files
- On Windows, run `git config --global core.autocrlf false` before cloning
- Package manager is enforced via preinstall script (only pnpm allowed)
- Build outputs: `dist/` for packages and backend, `dist/` or `build/` for frontend
- OpenAPI documentation is generated to `backend/dist/static/api/`
