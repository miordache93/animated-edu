# Architecture

## System Overview

Animated-Edu is an AI-powered pipeline that transforms a topic (e.g. "Fractions") into a short animated educational video featuring two cat characters: a teacher and a student. The system is a monorepo with two runtime apps and three shared packages, orchestrated by Trigger.dev.

```
                         User
                          |
                    POST /api/jobs
                          |
                     +---------+
                     |   API   |  Express REST server
                     +---------+
                          |
                  tasks.trigger("generate-episode")
                          |
                  +---------------+
                  |  Trigger.dev  |  Task orchestration (cloud)
                  +---------------+
                          |
        +-----------------+-----------------+
        |                 |                 |
   MODERATION          SCRIPT             ...
        |                 |
     GPT-4o            GPT-4o
                          |
        +-----------------+-----------------+
        |                                   |
      VOICE                              IMAGE
        |                                   |
   ElevenLabs                gpt-image-1 + cats.jpeg ref
   (teacher + student                       |
    per scene)                         Storyboard Agent
        |                            (prompt refinement)
        +-----------------+-----------------+
                          |
                        VIDEO
                          |
              +-----------+-----------+
              |                       |
         Runway Gen-3a            FFmpeg
         (image -> silent         (audio overlay +
          video per scene)         concatenation)
              |                       |
              +-----------+-----------+
                          |
                   final.mp4 -> R2
                          |
                         QC
                          |
                       GPT-4o
                   (quality review)
```

## Repository Structure

```
animated-edu/
  apps/
    api/                  Express REST API
      src/
        controllers/        Request handlers (create, list, get, retry)
        routes/             Route definitions with Zod validation
        middleware/          Error handler, request validation
        server.ts           Express app entry point
        swagger.ts          OpenAPI documentation

    trigger/              Trigger.dev task runner
      src/tasks/
        generate-episode.ts   Orchestrator — runs all steps sequentially
        moderate-topic.ts     Step 1: content moderation
        generate-script.ts    Step 2: script generation
        generate-voices.ts    Step 3: voice synthesis
        generate-images.ts    Step 4: image generation (with reference)
        generate-video.ts     Step 5: animation + composition
        run-quality-checks.ts Step 6: quality review
      trigger.config.ts     Build config (Prisma, FFmpeg, reference files)

  packages/
    config/               Environment & logging
      src/env.ts            Zod-validated env vars
      src/logger.ts         Pino structured logger

    db/                   Database layer
      prisma/schema.prisma  Data model (Job, JobStep, Asset)
      src/index.ts          Prisma client + enum re-exports

    core/                 Domain logic (framework-agnostic)
      src/
        agents/             AI agent prompts + Zod schemas
          moderation.agent.ts   Topic safety check
          script.agent.ts       Script generation (scenes, dialogue)
          storyboard.agent.ts   Visual prompt refinement for consistency
        providers/            External service integrations
          llm/openai.ts         GPT-4o (text + JSON completions)
          voice/elevenlabs.ts   ElevenLabs TTS
          image/openai-dalle.ts gpt-image-1 with reference image support
          video/runway.ts       Runway Gen-3a Turbo (image-to-video)
          video/ffmpeg-composer.ts  FFmpeg (audio overlay + concat)
          types.ts              Provider interfaces
        storage/
          r2.ts                 Cloudflare R2 (S3-compatible)
          types.ts              StorageProvider interface
        pipeline/
          episode.pipeline.ts   Step implementations
          types.ts              PipelineDependencies, StepContext

  infra/
    docker-compose.yml    Local PostgreSQL

  cats.jpeg               Character reference sheet
```

## Data Model

```
Job (jobs)
  |-- id              UUID primary key
  |-- topic           "Fractions", "Photosynthesis", etc.
  |-- status          PENDING -> PROCESSING -> COMPLETED | FAILED
  |-- language        "en" (default)
  |-- targetDuration  30-300 seconds
  |-- triggerRunId    Links to Trigger.dev run
  |
  |-- steps: JobStep[]
  |-- assets: Asset[]

JobStep (job_steps)
  |-- jobId + step    Composite unique key
  |-- step            MODERATION | SCRIPT | VOICE | IMAGE | VIDEO | QC
  |-- status          PENDING -> RUNNING -> COMPLETED | FAILED
  |-- output          JSON (step-specific result data)
  |-- durationMs      Execution time
  |-- attempts        Retry count
  |
  |-- assets: Asset[]

Asset (assets)
  |-- jobId           Parent job
  |-- stepId          Step that created it
  |-- type            SCRIPT_JSON | VOICE_TEACHER | VOICE_STUDENT
  |                   | SCENE_IMAGE | FINAL_VIDEO
  |-- storageKey      R2 object key (e.g. "jobs/{id}/video/final.mp4")
  |-- metadata        JSON (e.g. { sceneNumber: 1 })
```

Assets store `storageKey` (not URLs). Signed URLs are generated on-demand with 1-hour expiry since R2 presigned URLs are ephemeral.

## Pipeline Steps

### 1. MODERATION

- **Agent**: `moderation.agent.ts`
- **Model**: GPT-4o (temperature 0.1)
- **Input**: Job topic
- **Output**: `{ approved, reason, suggestedTopic? }`
- Rejects inappropriate, non-educational, or harmful topics

### 2. SCRIPT

- **Agent**: `script.agent.ts`
- **Model**: GPT-4o (temperature 0.8)
- **Input**: Topic, language, target duration
- **Output**: `{ title, summary, scenes[] }`
- Each scene has: `sceneNumber`, `narration`, `teacherDialogue`, `studentDialogue`, `imagePrompt`, `durationSeconds`
- Script JSON is stored as an asset in R2

### 3. VOICE

- **Provider**: ElevenLabs TTS
- **Input**: Script scenes, teacher/student voice IDs
- **Output**: 2 MP3 files per scene (teacher + student dialogue)
- Assets stored with `metadata.sceneNumber` for correct mapping in VIDEO step
- Storage pattern: `jobs/{id}/voice/teacher-scene-{N}.mp3`

### 4. IMAGE

- **Agent**: `storyboard.agent.ts` refines prompts for visual consistency
- **Provider**: OpenAI `gpt-image-1` via `images.edit`
- **Reference**: `cats.jpeg` — the character design reference sheet passed to every generation call
- **Character descriptions baked into storyboard prompt**:
  - Teacher: grey British Shorthair, yellow eyes, round glasses, wooden pointer
  - Student: cream Scottish Fold, blue eyes, folded ears, pink collar with flower charm
- **Output**: 1536x1024 PNG per scene at high quality
- Storage pattern: `jobs/{id}/images/scene-{N}.png`

### 5. VIDEO

The most complex step, combining three substeps:

```
For each scene (sequential):
  1. Runway Gen-3a Turbo: still image -> 5-10s silent video clip
     - Polls task status every 5s, 5-minute timeout
     - Re-uploads to R2 (Runway URLs expire in 24-48h)
     - Skips if silent clip already exists (retry-safe)

  2. FFmpeg per scene:
     teacher.mp3 + student.mp3 -> concat -> scene-audio.mp3
     silent-clip.mp4 + scene-audio.mp3 -> overlay -> scene-composed.mp4

Final concatenation:
  scene-1.mp4 + scene-2.mp4 + ... -> concat -> final.mp4
```

- **Task max duration**: 30 minutes (Runway takes 2-3 min per scene)
- **FFmpeg paths**: Set via `FFMPEG_PATH`/`FFPROBE_PATH` env vars locally; auto-configured by Trigger.dev `ffmpeg` build extension in cloud
- **Storage pattern**: `jobs/{id}/video/scene-{N}-silent.mp4`, `jobs/{id}/video/final.mp4`
- **Asset recorded**: `FINAL_VIDEO`

### 6. QC

- **Model**: GPT-4o (temperature 0.2)
- **Input**: Full script JSON
- **Output**: `{ passed, issues[] }`
- Checks: factual accuracy, age-appropriateness, clarity, logical flow, tone consistency

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/jobs` | Create job + trigger pipeline |
| `GET` | `/api/jobs` | List jobs (cursor pagination) |
| `GET` | `/api/jobs/:id` | Get job with steps + signed asset URLs |
| `POST` | `/api/jobs/:id/retry` | Retry from specific step |

### Retry Behavior

When retrying from step N:
1. Steps N through QC are reset to PENDING
2. Assets from those steps are deleted
3. Pipeline re-executes from step N
4. Earlier steps' outputs are loaded from DB (e.g. script from SCRIPT step's `output` JSON)
5. VIDEO step skips Runway for scenes that already have silent clips in R2

## External Services

| Service | Purpose | Auth |
|---------|---------|------|
| **OpenAI** | GPT-4o (agents), gpt-image-1 (images) | `OPENAI_API_KEY` |
| **ElevenLabs** | Text-to-speech synthesis | `ELEVENLABS_API_KEY` + voice IDs |
| **Runway** | Image-to-video animation (Gen-3a Turbo) | `RUNWAY_API_KEY` |
| **Cloudflare R2** | Asset storage (S3-compatible) | Account ID + access keys |
| **Trigger.dev** | Task orchestration, retries, heartbeats | `TRIGGER_SECRET_KEY` |
| **PostgreSQL** | Job/step/asset state | `DATABASE_URL` |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Pipeline functions receive providers as arguments | Testable without mocking modules; swap providers easily |
| `executeStep()` with upsert | Handles first-run and retry in a single DB call |
| Assets reference `storageKey` not URLs | URLs expire; signed URLs generated on demand |
| Voice assets indexed by `metadata.sceneNumber` | Avoids fragile positional array mapping (2 files per scene) |
| Sequential scene animation (not `Promise.all`) | Prevents Trigger.dev heartbeat timeout; reduces Runway API load |
| Silent clips cached in R2 | Retry doesn't re-charge Runway credits |
| `cats.jpeg` as reference for `gpt-image-1` | Character consistency across all scenes |
| `additionalFiles` in trigger config | Bundles reference image for cloud deployment |
| Storyboard agent before image generation | Refines per-scene prompts for cohesive visual style |
| Cursor-based pagination | Scales better than offset for growing job lists |
| Pino structured logging | JSON logs in production; pretty-printed in development |

## R2 Storage Layout

```
jobs/
  {jobId}/
    script.json                         Script output
    voice/
      teacher-scene-1.mp3               Teacher dialogue audio
      student-scene-1.mp3               Student dialogue audio
      teacher-scene-2.mp3
      student-scene-2.mp3
      ...
    images/
      scene-1.png                       Generated scene illustration
      scene-2.png
      ...
    video/
      scene-1-silent.mp4                Runway-animated clip (no audio)
      scene-2-silent.mp4
      ...
      final.mp4                         Composed video with audio
```
