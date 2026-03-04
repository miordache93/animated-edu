import OpenAI from "openai";
import type { ImageGenerationOptions, ImageProvider } from "../types.js";

export class OpenAIDalleImageProvider implements ImageProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(
    prompt: string,
    opts?: ImageGenerationOptions,
  ): Promise<Buffer> {
    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: opts?.size ?? "1024x1024",
      quality: opts?.quality ?? "standard",
      style: opts?.style ?? "vivid",
      response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("DALL-E returned empty response");
    }

    return Buffer.from(b64, "base64");
  }
}
