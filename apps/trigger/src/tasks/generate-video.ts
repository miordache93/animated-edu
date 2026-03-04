import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  runVideoComposition,
  RunwayVideoAnimationProvider,
  FFmpegVideoComposer,
  R2StorageProvider,
  scriptSchema,
} from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const generateVideoTask = schemaTask({
  id: "generate-video",
  schema: z.object({
    jobId: z.string().uuid(),
    script: scriptSchema,
  }),
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 10000,
  },
  run: async ({ jobId, script }) => {
    const animator = new RunwayVideoAnimationProvider(env.RUNWAY_API_KEY);
    const composer = new FFmpegVideoComposer();
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    return runVideoComposition(jobId, script, animator, composer, storage);
  },
});
