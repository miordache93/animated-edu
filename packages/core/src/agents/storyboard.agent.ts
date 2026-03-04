import { z } from "zod";
import type { LLMProvider } from "../providers/types.js";
import type { Script } from "./script.agent.js";

const storyboardSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  imagePrompt: z.string(),
});

export const storyboardSchema = z.object({
  styleGuide: z.string(),
  scenes: z.array(storyboardSceneSchema).min(1),
});

export type Storyboard = z.infer<typeof storyboardSchema>;

const STORYBOARD_PROMPT = `You are a visual consistency expert for animated educational videos. Given a script with scene descriptions, refine the image prompts to ensure visual consistency across all scenes.

Script title: "{title}"
Script summary: "{summary}"

Original scenes:
{scenes}

Create refined image prompts that:
- Maintain consistent character designs (same teacher and student appearance across all scenes)
- Use a cohesive color palette and art style throughout
- Include specific details about character positions, expressions, and backgrounds
- Specify the cartoon/illustration style (e.g., "flat vector illustration", "2D cartoon style")
- Include educational visual elements relevant to each scene's content

Respond with a JSON object containing:
- "styleGuide": a paragraph describing the overall visual style, character designs, and color palette
- "scenes": an array of objects, each with:
  - "sceneNumber": matching the original scene number
  - "imagePrompt": the refined, detailed image prompt for DALL-E generation

Respond ONLY with a valid JSON object.`;

export async function runStoryboardAgent(
  script: Script,
  llm: LLMProvider,
): Promise<Storyboard> {
  const scenesText = script.scenes
    .map(
      (s) =>
        `Scene ${s.sceneNumber}: ${s.imagePrompt} (${s.narration.substring(0, 100)}...)`,
    )
    .join("\n");

  const prompt = STORYBOARD_PROMPT.replace("{title}", script.title)
    .replace("{summary}", script.summary)
    .replace("{scenes}", scenesText);

  return llm.completeJSON(prompt, storyboardSchema, {
    temperature: 0.6,
    maxTokens: 3000,
  });
}
