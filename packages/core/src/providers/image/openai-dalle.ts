import OpenAI, { toFile } from "openai";
import { logger } from "@animated-edu/config";
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
    // When reference images are provided, use gpt-image-1 images.edit
    // This gives character consistency by using the reference as style/content guide
    if (opts?.referenceImages && opts.referenceImages.length > 0) {
      return this.generateWithReference(prompt, opts.referenceImages, opts);
    }

    // Fallback: standard DALL-E 3 generation (no reference)
    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("DALL-E returned empty response");
    }

    return Buffer.from(b64, "base64");
  }

  private async generateWithReference(
    prompt: string,
    referenceImages: Buffer[],
    opts?: ImageGenerationOptions,
  ): Promise<Buffer> {
    logger.info("Generating image with gpt-image-1 using reference images");

    const imageFiles = await Promise.all(
      referenceImages.map((buf, i) =>
        toFile(buf, `reference-${i}.png`, { type: "image/png" }),
      ),
    );

    const response = await this.client.images.edit({
      model: "gpt-image-1",
      image: imageFiles.length === 1 ? imageFiles[0]! : imageFiles,
      prompt,
      n: 1,
      size: opts?.size ?? "1536x1024",
      quality: opts?.quality ?? "high",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("gpt-image-1 returned empty response");
    }

    return Buffer.from(b64, "base64");
  }
}
