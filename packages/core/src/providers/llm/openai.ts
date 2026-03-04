import OpenAI from "openai";
import type { z } from "zod";
import type { LLMCompletionOptions, LLMProvider } from "../types.js";

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async complete(prompt: string, opts?: LLMCompletionOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: opts?.model ?? this.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    return content;
  }

  async completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    opts?: LLMCompletionOptions,
  ): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: opts?.model ?? this.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as unknown;
    return schema.parse(parsed);
  }
}
