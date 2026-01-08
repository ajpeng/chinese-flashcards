# Backend (Express + TypeScript + Prisma)

This backend is an Express server written in TypeScript. It exposes health-check endpoints and uses PostgreSQL via Prisma.

## Endpoints

- `GET /` – default Express index view (Jade).
- `GET /users` – sample users route.
- `GET /health` – JSON health/readiness info:

  ```json
  {
    "status": "ok",
    "timestamp": "2026-01-02T00:00:00.000Z",
    "uptime": 123.45,
    "env": "development"
  }
  ```

- `GET /test-db` – simple database connectivity check using the shared Postgres pool.

## Prerequisites

- Node.js and npm
- PostgreSQL (local or via `docker-compose.yml` in this directory)

If you use the provided `docker-compose.yml`, the default Postgres environment variables are:

- `DB_USER` — database user (matches `POSTGRES_USER`).
- `DB_PASSWORD` — database password (matches `POSTGRES_PASSWORD`).
- `DB_NAME` — database name (matches `POSTGRES_DB`).

Example:

```bash
export DB_USER=myuser
export DB_PASSWORD=mypassword
export DB_NAME=mydatabase
```

## Install dependencies

From the repository root:

```bash
cd backend
npm install
```

## Database setup

Run Prisma migrations and seed initial data (articles and words):

```bash
cd backend
npm run prisma:migrate
npm run prisma:seed    # or: npx prisma db seed
```

## Running the server

### Development (TypeScript directly)

```bash
cd backend
npm run dev
```

This uses `ts-node-dev` and reloads on changes.

### Production-style (compiled JavaScript)

First build:

```bash
cd backend
npm run build   # runs `prisma generate` then `tsc`, outputs to dist/
```

Then start the compiled server:

```bash
cd backend
PORT=3000 npm start
```

## Health and DB checks

- Health endpoint:

  ```bash
  curl -i http://localhost:3000/health
  ```

- Database connectivity check (requires `DB_USER`, `DB_PASSWORD`, `DB_NAME` to be set):

  ```bash
  curl -i http://localhost:3000/test-db
  ```

## Notes

- The `/health` endpoint is a lightweight readiness check. For production liveness/readiness probes (e.g. Kubernetes), you may want to extend it with deeper dependency checks (database, caches, external services).
- Prisma client code is generated into `src/generated/prisma` based on `prisma/schema.prisma` and consumed by the TypeScript seed script in `src/prisma/seed.ts`.
