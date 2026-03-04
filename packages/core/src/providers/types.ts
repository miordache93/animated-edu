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
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

export interface ImageProvider {
  generate(prompt: string, opts?: ImageGenerationOptions): Promise<Buffer>;
}

export interface VideoCompositionInput {
  scenes: {
    imageUrl: string;
    audioUrl: string;
    durationSeconds: number;
  }[];
}

export interface VideoProvider {
  compose(input: VideoCompositionInput): Promise<Buffer>;
}
