import { schemaTask, AbortTaskRunError } from "@trigger.dev/sdk";
import { z } from "zod";
import { runModeration, OpenAILLMProvider } from "@animated-edu/core";
import { env } from "@animated-edu/config";

export const moderateTopicTask = schemaTask({
  id: "moderate-topic",
  schema: z.object({
    jobId: z.string().uuid(),
  }),
  retry: {
    maxAttempts: 2,
  },
  run: async ({ jobId }) => {
    const llm = new OpenAILLMProvider(env.OPENAI_API_KEY);
    const result = await runModeration(jobId, llm);

    if (!result.approved) {
      throw new AbortTaskRunError(
        `Topic rejected: ${result.reason}`,
      );
    }

    return result;
  },
});
