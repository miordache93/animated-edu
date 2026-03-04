import type { StepName } from "@animated-edu/db";
import type { ImageProvider, LLMProvider, VoiceProvider, VideoProvider } from "../providers/types.js";
import type { StorageProvider } from "../storage/types.js";

export interface PipelineDependencies {
  llm: LLMProvider;
  voice: VoiceProvider;
  image: ImageProvider;
  video: VideoProvider;
  storage: StorageProvider;
}

export interface StepContext {
  jobId: string;
  step: StepName;
}

export interface StepResult<T = unknown> {
  data: T;
  durationMs: number;
}

export const STEP_ORDER: StepName[] = [
  "MODERATION",
  "SCRIPT",
  "VOICE",
  "IMAGE",
  "VIDEO",
  "QC",
];
