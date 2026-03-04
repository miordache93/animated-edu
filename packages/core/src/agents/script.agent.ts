import { z } from "zod";
import type { LLMProvider } from "../providers/types.js";

export const sceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  narration: z.string(),
  teacherDialogue: z.string(),
  studentDialogue: z.string(),
  imagePrompt: z.string(),
  durationSeconds: z.number().positive(),
});

export const scriptSchema = z.object({
  title: z.string(),
  summary: z.string(),
  scenes: z.array(sceneSchema).min(1),
});

export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;

const SCRIPT_PROMPT = `You are an expert educational scriptwriter for animated cartoon videos. Create a script for a short educational video about the following topic.

Topic: "{topic}"
Language: {language}
Target duration: {targetDuration} seconds

The script should:
- Be engaging and fun for young learners (ages 8-14)
- Include a teacher character who explains concepts clearly
- Include a student character who asks questions children might have
- Break the content into logical scenes
- Each scene should have narration, teacher dialogue, student dialogue, and a detailed image prompt
- Image prompts should describe cartoon-style educational illustrations
- Total duration of all scenes should approximate the target duration

Respond with a JSON object containing:
- "title": a catchy title for the video
- "summary": a 1-2 sentence summary
- "scenes": an array of scene objects, each with:
  - "sceneNumber": integer starting from 1
  - "narration": narrator text for the scene
  - "teacherDialogue": what the teacher says
  - "studentDialogue": what the student says
  - "imagePrompt": detailed description for generating the scene illustration
  - "durationSeconds": estimated duration for this scene

Respond ONLY with a valid JSON object.`;

export async function runScriptAgent(
  topic: string,
  language: string,
  targetDuration: number,
  llm: LLMProvider,
): Promise<Script> {
  const prompt = SCRIPT_PROMPT.replace("{topic}", topic)
    .replace("{language}", language)
    .replace("{targetDuration}", String(targetDuration));

  return llm.completeJSON(prompt, scriptSchema, {
    temperature: 0.8,
    maxTokens: 4000,
  });
}
