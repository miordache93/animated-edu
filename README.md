# Animated-Edu

AI-powered backend for generating short educational cartoon videos. The system uses AI agents to moderate topics, generate scripts, synthesize voices, create images, and compose videos — orchestrated as a step-by-step pipeline with retry support.

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
5. **Video** — Remotion composes final video from images + audio
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
