# FleetOps API

Backend API for **FleetOps**, a B2B fleet management platform, built with NestJS and TypeScript.

The project is developed incrementally. The current phase provides the application foundation: bootstrap, configuration, versioned routing, global validation, and a health check.

## Technology Stack

- [NestJS](https://nestjs.com/) 12 (Express adapter)
- TypeScript (strict mode, native ES modules)
- `@nestjs/config` for environment configuration
- `class-validator` / `class-transformer` for validation
- Jest + Supertest for testing
- ESLint (typescript-eslint) + Prettier

## Requirements

- Node.js >= 22 (developed on Node 24)
- npm >= 10

## Installation

```bash
npm install
cp .env.example .env
```

## Environment Configuration

Configuration is read from environment variables (a `.env` file is loaded in local development). Values are validated at startup, and the application refuses to start if they are invalid.

| Variable   | Description                                  | Default       |
| ---------- | -------------------------------------------- | ------------- |
| `NODE_ENV` | `development`, `production`, or `test`       | `development` |
| `PORT`     | HTTP port the API listens on (1–65535)       | `3000`        |

`.env` is git-ignored. Commit changes to `.env.example` only.

## Running the Application

```bash
# development (watch mode)
npm run start:dev

# development (single run)
npm run start

# production
npm run build
npm run start:prod
```

## Running Tests

```bash
# unit tests
npm run test

# end-to-end tests (boots the full app in-process)
npm run test:e2e

# coverage
npm run test:cov
```

Jest runs in native ESM mode (`--experimental-vm-modules`), because NestJS 12 ships as ES modules.

## Running Lint

```bash
npm run lint        # check
npm run lint:fix    # auto-fix
npm run format      # Prettier
```

## API Endpoints

All routes are served under the `/api` prefix with URI versioning (default version `v1`).

| Method | Path             | Description                     |
| ------ | ---------------- | ------------------------------- |
| GET    | `/api/v1`        | Confirms the API is running     |
| GET    | `/api/v1/health` | Health check (liveness)         |

Example:

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "status": "ok",
  "service": "fleetops-api",
  "timestamp": "2026-10-01T14:17:36.120Z"
}
```
