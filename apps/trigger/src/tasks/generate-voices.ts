import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  runVoiceGeneration,
  ElevenLabsVoiceProvider,
  R2StorageProvider,
  scriptSchema,
} from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const generateVoicesTask = schemaTask({
  id: "generate-voices",
  schema: z.object({
    jobId: z.string().uuid(),
    script: scriptSchema,
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
  },
  run: async ({ jobId, script }) => {
    const voice = new ElevenLabsVoiceProvider(env.ELEVENLABS_API_KEY);
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    return runVoiceGeneration(jobId, script, voice, storage);
  },
});
