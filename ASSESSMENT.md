# Repository Assessment — Animated-Edu

_Assessed: 2026-07-03_

## What this project aims to do

Animated-Edu is an **AI-powered backend that turns a topic string (e.g. "Fractions") into a short educational cartoon video** starring two cat characters — a teacher and a student. A user submits a topic via a REST API; the system then runs a six-step generative pipeline and produces a final `.mp4` stored in object storage.

It is a backend/service project only — there is no frontend. The deliverable is the pipeline and the API that drives it.

### The pipeline

| # | Step | Provider / Model | Output |
|---|------|------------------|--------|
| 1 | MODERATION | OpenAI GPT-4o | Approve/reject the topic |
| 2 | SCRIPT | OpenAI GPT-4o | Structured script (title, scenes, dialogue, image prompts) |
| 3 | VOICE | ElevenLabs TTS | Teacher + student MP3 per scene |
| 4 | IMAGE | OpenAI `gpt-image-1` + `cats.jpeg` reference | One scene illustration per scene |
| 5 | VIDEO | Runway Gen-3a (image→video) + FFmpeg (audio overlay + concat) | `final.mp4` |
| 6 | QC | OpenAI GPT-4o | Quality review of the script |

## Architecture

A clean **pnpm + Turborepo monorepo**:

- `apps/api` — Express REST API (create / list / get / retry jobs) with Zod validation and Swagger docs.
- `apps/trigger` — Trigger.dev v4 task definitions; `generate-episode` orchestrates the steps sequentially via `triggerAndWait`.
- `packages/core` — framework-agnostic domain logic: agents (prompts + Zod schemas), providers (LLM/voice/image/video/storage), and the pipeline step implementations.
- `packages/db` — Prisma schema (`Job`, `JobStep`, `Asset`) + singleton client.
- `packages/config` — Zod-validated env vars + pino structured logging.
- `infra` — docker-compose for local PostgreSQL.

State lives in PostgreSQL (job/step/asset rows); binary assets live in Cloudflare R2, referenced by `storageKey` with signed URLs generated on demand.

## Strengths

- **Well-structured and idiomatic.** Clear separation between transport (API), orchestration (Trigger.dev), and domain logic (core). Provider interfaces are injected as arguments, making the pipeline testable and providers swappable.
- **Excellent documentation.** `README.md` and `ARCHITECTURE.md` are thorough, accurate, and match the actual code — including data model, storage layout, and design-decision rationale.
- **Thoughtful state modeling.** `executeStep()` uses an upsert so first-run and retry share one code path; per-step status/attempts/duration are tracked; assets are indexed by `metadata.sceneNumber` rather than fragile array positions.
- **Retry-aware & cost-conscious.** Retry resets a step and everything after it; the VIDEO step skips Runway for scenes whose silent clip already exists in R2, avoiding re-charging credits.
- **Good operational hygiene.** Structured logging, graceful shutdown, cursor-based pagination, request body size limits, and Zod validation at the API boundary.
- **Sensible failure handling.** Moderation rejection uses `AbortTaskRunError` to halt the run; the orchestrator marks the job `FAILED` and records the error message.

## Weaknesses & risks

1. **No tests.** There is no test suite anywhere in the repo despite the code being deliberately structured for testability (injected providers). This is the biggest gap for a pipeline with many external integrations.
2. **No API authentication/authorization.** Any caller can create, list, retry, and read any job (including signed asset URLs). Fine for a prototype, not for production.
3. **QC reviews the script, not the final video.** The QC step (`runQualityChecks`) only inspects the SCRIPT JSON. It says nothing about the actual audio/images/video that were produced — the last mile the user actually receives is unchecked.
4. **QC result is not enforced.** The orchestrator runs QC but never checks `passed`; a job is marked `COMPLETED` even if QC reports issues. QC is effectively advisory/logged only.
5. **`createJob` trigger failure leaves an orphan job.** The job row is created before `tasks.trigger(...)`. If the trigger call throws, the job persists in `PENDING` with no run attached and no compensating cleanup.
6. **Silent env misconfiguration.** `packages/config/src/env.ts` defaults every non-DB secret to `""`. Missing keys don't fail fast at boot — they surface as opaque failures mid-pipeline at execution time.
7. **Minor code smell in QC step.** `runQualityChecks` does repeated inline `await import("zod")` calls instead of a top-level import — awkward and needless.
8. **Per-request provider instantiation.** `getJob` constructs a new `R2StorageProvider` on every request rather than reusing a shared instance.
9. **Sequential-only pipeline.** Voices and images are generated one scene at a time. Acknowledged as a V1 simplification in the docs, but it makes end-to-end latency scale linearly with scene count.

## Maturity verdict

This is a **well-engineered V1 prototype / portfolio-grade project**: the architecture, documentation, and state modeling are notably above average, and the design decisions are deliberate and well-justified. What separates it from production-ready is the operational maturity layer — automated tests, API auth, fail-fast configuration, and closing the loop on quality checks against the actual rendered output rather than just the script.
