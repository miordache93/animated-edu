import type { z } from "zod";

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMProvider {
  complete(prompt: string, opts?: LLMCompletionOptions): Promise<string>;
  completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    opts?: LLMCompletionOptions,
  ): Promise<T>;
}

export interface VoiceSynthesisOptions {
  stability?: number;
  similarityBoost?: number;
  model?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
}

export interface VoiceProvider {
  synthesize(
    text: string,
    voiceId: string,
    opts?: VoiceSynthesisOptions,
  ): Promise<Buffer>;
  listVoices(): Promise<VoiceInfo[]>;
}

export interface ImageGenerationOptions {
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  referenceImages?: Buffer[];
}

export interface ImageProvider {
  generate(prompt: string, opts?: ImageGenerationOptions): Promise<Buffer>;
}

export interface VideoAnimationInput {
  imageUrl: string;
  promptText: string;
  durationSeconds: 5 | 10;
  ratio?: "1280:768" | "768:1280";
}

export interface VideoAnimationResult {
  videoUrl: string;
}

export interface VideoAnimationProvider {
  animate(input: VideoAnimationInput): Promise<VideoAnimationResult>;
}

export interface SceneCompositionInput {
  sceneNumber: number;
  silentVideoUrl: string;
  teacherAudioUrl: string;
  studentAudioUrl: string;
  durationSeconds: number;
}

export interface VideoCompositionInput {
  scenes: SceneCompositionInput[];
}

export interface VideoComposer {
  compose(input: VideoCompositionInput): Promise<Buffer>;
}
