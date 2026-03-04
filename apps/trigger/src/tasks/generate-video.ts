import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  runVideoComposition,
  RemotionVideoProvider,
  R2StorageProvider,
  scriptSchema,
} from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const generateVideoTask = schemaTask({
  id: "generate-video",
  schema: z.object({
    jobId: z.string().uuid(),
    script: scriptSchema,
    imageAssetKeys: z.array(z.string()),
    voiceAssetKeys: z.array(z.string()),
  }),
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 10000,
  },
  run: async ({ jobId, script, imageAssetKeys, voiceAssetKeys }) => {
    const video = new RemotionVideoProvider();
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    return runVideoComposition(
      jobId,
      script,
      imageAssetKeys,
      voiceAssetKeys,
      video,
      storage,
    );
  },
});
