import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  runScriptGeneration,
  OpenAILLMProvider,
  R2StorageProvider,
} from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const generateScriptTask = schemaTask({
  id: "generate-script",
  schema: z.object({
    jobId: z.string().uuid(),
  }),
  retry: {
    maxAttempts: 3,
  },
  run: async ({ jobId }) => {
    const llm = new OpenAILLMProvider(env.OPENAI_API_KEY);
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    return runScriptGeneration(jobId, llm, storage);
  },
});
