import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { runQualityChecks, OpenAILLMProvider } from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const runQualityChecksTask = schemaTask({
  id: "run-quality-checks",
  schema: z.object({
    jobId: z.string().uuid(),
  }),
  retry: {
    maxAttempts: 1,
  },
  run: async ({ jobId }) => {
    const llm = new OpenAILLMProvider(env.OPENAI_API_KEY);
    return runQualityChecks(jobId, llm);
  },
});
