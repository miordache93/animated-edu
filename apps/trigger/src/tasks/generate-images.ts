import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  runImageGeneration,
  OpenAILLMProvider,
  OpenAIDalleImageProvider,
  R2StorageProvider,
  scriptSchema,
} from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const generateImagesTask = schemaTask({
  id: "generate-images",
  schema: z.object({
    jobId: z.string().uuid(),
    script: scriptSchema,
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
  },
  run: async ({ jobId, script }) => {
    const llm = new OpenAILLMProvider(env.OPENAI_API_KEY);
    const image = new OpenAIDalleImageProvider(env.OPENAI_API_KEY);
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    // Load character reference sheet for consistent character design
    const catsRefPath = resolve(process.cwd(), "cats.jpeg");
    let referenceImages: Buffer[] | undefined;
    try {
      const refBuffer = await readFile(catsRefPath);
      referenceImages = [refBuffer];
    } catch {
      // Fall back to no reference if file not found (e.g. local dev without the file)
    }

    return runImageGeneration(jobId, script, llm, image, storage, referenceImages);
  },
});
