# Animated-Edu

AI-powered backend for generating short educational cartoon videos. The system uses AI agents to moderate topics, generate scripts, synthesize voices, create images, and compose videos — orchestrated as a step-by-step pipeline with retry support.

![Cat characters — teacher and student](cats.jpeg)

## Architecture

```
apps/
  api/       → Express REST API (job management, status, retry)
  trigger/   → Trigger.dev task definitions (pipeline orchestration)
packages/
  config/    → Env validation (Zod) + structured logging (pino)
  db/        → Prisma schema + singleton client
  core/      → Domain logic: agents, providers, pipeline, storage
infra/
  docker-compose.yml → PostgreSQL for local dev
```

### Pipeline Steps

1. **Moderation** — AI reviews topic for appropriateness
2. **Script** — AI generates structured script with scenes, dialogue, and image prompts
3. **Voice** — ElevenLabs synthesizes teacher/student dialogue audio
4. **Image** — DALL-E 3 generates scene illustrations (refined by storyboard agent)
5. **Video** — Runway animates scene images, FFmpeg composes final video with audio
6. **QC** — AI reviews generated content for quality

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for PostgreSQL)
- Trigger.dev account (for pipeline orchestration)

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start PostgreSQL**

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Generate Prisma client and push schema**

   ```bash
   pnpm db:generate
   pnpm db:push
   ```

5. **Start development servers**

   ```bash
   pnpm dev
   ```

   The API starts on `http://localhost:3000`.

## API Reference

### Health Check

```
GET /health
```

### Create Job

```
POST /api/jobs
Content-Type: application/json

{
  "topic": "Fractions",
  "language": "en",        // optional, default: "en"
  "targetDuration": 60     // optional, 30-300 seconds, default: 60
}
```

### List Jobs

```
GET /api/jobs?limit=20&cursor=<uuid>
```

Cursor-based pagination. Returns `{ data, nextCursor, hasMore }`.

### Get Job

```
GET /api/jobs/:id
```

Returns job with all steps and assets (with signed URLs).

### Retry Job

```
POST /api/jobs/:id/retry
Content-Type: application/json

{
  "step": "SCRIPT"  // MODERATION | SCRIPT | VOICE | IMAGE | VIDEO | QC
}
```

Resets the specified step and all subsequent steps, then re-triggers the pipeline.

## Running Locally

### Quick Start (API only, no external services)

The API server can start with just a database connection — you don't need Trigger.dev, OpenAI, ElevenLabs, or R2 keys to run the server and hit endpoints. Pipeline steps will fail at execution time if keys are missing, but the API itself will serve requests.

```bash
# 1. Start PostgreSQL
docker compose -f infra/docker-compose.yml up -d

# 2. Set up environment (only DATABASE_URL is required to start the server)
cp .env.example .env

# 3. Install deps, generate Prisma client, push schema
pnpm install
pnpm db:generate
pnpm db:push

# 4. Start the API
pnpm dev
```

Verify it's running:

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

### Running Individual Apps

Turborepo's `pnpm dev` starts all apps concurrently. To run only the API:

```bash
pnpm --filter @animated-edu/api dev
```

To run only the Trigger.dev worker (requires `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF` in `.env`):

```bash
pnpm --filter @animated-edu/trigger dev
```

### Environment Variables

| Variable | Required to start API | Required for pipeline | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | Yes | PostgreSQL connection string |
| `PORT` | No (default: `3000`) | — | API server port |
| `NODE_ENV` | No (default: `development`) | — | `development` / `production` / `test` |
| `LOG_LEVEL` | No (default: `info`) | — | `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `TRIGGER_SECRET_KEY` | No | Yes | Trigger.dev API key |
| `TRIGGER_PROJECT_REF` | No | Yes | Trigger.dev project reference ID |
| `OPENAI_API_KEY` | No | Yes (moderation, script, image, QC steps) | OpenAI API key for GPT-4o and DALL-E 3 |
| `ELEVENLABS_API_KEY` | No | Yes (voice step) | ElevenLabs API key for TTS |
| `R2_ACCOUNT_ID` | No | Yes (asset storage) | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | No | Yes (asset storage) | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | Yes (asset storage) | R2 secret key |
| `R2_BUCKET_NAME` | No (default: `animated-edu`) | Yes (asset storage) | R2 bucket name |

### Database Management

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Push schema to database (development only — creates/alters tables directly)
pnpm db:push

# Open Prisma Studio to browse data
pnpm --filter @animated-edu/db exec prisma studio

# Reset database (drops all data, re-creates tables)
pnpm --filter @animated-edu/db exec prisma db push --force-reset
```

### Debugging

**Log levels:** Set `LOG_LEVEL=debug` in `.env` for verbose output. In development, logs are pretty-printed with colors via `pino-pretty`. In production (`NODE_ENV=production`), logs are JSON for machine consumption.

**Inspecting with Node debugger:** To attach a debugger (e.g. VS Code or Chrome DevTools):

```bash
# Start the API with --inspect
pnpm --filter @animated-edu/api exec tsx --inspect --env-file=../../.env src/server.ts
```

Then attach VS Code (Debug > "Attach to Node Process") or open `chrome://inspect` in Chrome.

**Database queries:** In development mode, Prisma logs all SQL queries to the console. To see them, ensure `NODE_ENV=development` is set.

**Testing endpoints with curl:**

```bash
# Create a job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"topic": "Fractions"}'

# List jobs
curl http://localhost:3000/api/jobs

# Get a specific job (replace <job-id> with a real UUID)
curl http://localhost:3000/api/jobs/<job-id>

# Retry a failed job from a specific step
curl -X POST http://localhost:3000/api/jobs/<job-id>/retry \
  -H "Content-Type: application/json" \
  -d '{"step": "SCRIPT"}'
```

### Building

```bash
# Build all packages and apps
pnpm build

# Type-check without emitting files
pnpm --filter @animated-edu/core exec tsc --noEmit
```

### Common Issues

**Port 5432 already in use:** Another PostgreSQL instance is running. Stop it or change the port mapping in `infra/docker-compose.yml`.

**`pnpm db:push` fails with connection error:** Make sure PostgreSQL is running (`docker compose -f infra/docker-compose.yml ps`) and that `DATABASE_URL` in `.env` matches the docker-compose credentials.

**Prisma Client not found / out of date:** Run `pnpm db:generate` after pulling changes that modify `packages/db/prisma/schema.prisma`.

**Build errors after adding dependencies:** Run `pnpm install` at the repo root to sync the lockfile, then `pnpm db:generate` before `pnpm build`.

## Key Design Decisions

| Decision | Why |
|----------|-----|
| 3 packages + 2 apps | Code that changes together lives together |
| Pipeline functions receive deps as args | Testable without mocking modules |
| `executeStep()` with upsert | Handles first-run and retry in one DB call |
| `storageKey` not `url` in Asset | URLs expire; signed URLs generated on demand |
| Sequential subtask execution | V1 simplicity; voices + images can parallelize later |
| pino structured logging | JSON logs enable aggregation and alerting in prod |
| Cursor-based pagination | Scales better than offset for growing datasets |
