import { z } from "zod";

const envSchema = z.object({
  // Database (required — server can't start without it)
  DATABASE_URL: z.string().url(),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Trigger.dev (required for pipeline execution, not for API startup)
  TRIGGER_SECRET_KEY: z.string().default(""),
  TRIGGER_PROJECT_REF: z.string().default(""),

  // OpenAI (required for LLM/image generation steps)
  OPENAI_API_KEY: z.string().default(""),

  // ElevenLabs (required for voice generation step)
  ELEVENLABS_API_KEY: z.string().default(""),
  ELEVENLABS_TEACHER_VOICE_ID: z.string().default(""),
  ELEVENLABS_STUDENT_VOICE_ID: z.string().default(""),

  // Cloudflare R2 (required for asset storage)
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET_NAME: z.string().default("animated-edu"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
