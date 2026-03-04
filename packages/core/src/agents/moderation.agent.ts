import { z } from "zod";
import type { LLMProvider } from "../providers/types.js";

export const moderationResultSchema = z.object({
  approved: z.boolean(),
  reason: z.string(),
  suggestedTopic: z.string().optional(),
});

export type ModerationResult = z.infer<typeof moderationResultSchema>;

const MODERATION_PROMPT = `You are an educational content moderation agent. Your job is to evaluate whether a topic is appropriate for creating an animated educational video for children and young learners.

Videos can range from 30 seconds to 5 minutes. Even simple or narrow topics are perfectly fine — short, focused videos are encouraged.

Evaluate the following topic and respond with a JSON object:
- "approved": true if the topic is educational, age-appropriate, and can be explained in an animated video
- "reason": a brief explanation of your decision
- "suggestedTopic": (optional) if the topic is too broad or slightly off, suggest a refined version

Reject topics ONLY if they are:
- Not educational or factual
- Inappropriate for children
- Promoting harmful content, violence, or discrimination
- Commercial or promotional in nature

Do NOT reject a topic just because it seems simple or short. Simple topics make great short videos.

Topic to evaluate: "{topic}"

Respond ONLY with a valid JSON object.`;

export async function runModerationAgent(
  topic: string,
  llm: LLMProvider,
): Promise<ModerationResult> {
  const prompt = MODERATION_PROMPT.replace("{topic}", topic);

  return llm.completeJSON(prompt, moderationResultSchema, {
    temperature: 0.1,
  });
}
