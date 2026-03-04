import type { VideoCompositionInput, VideoProvider } from "../types.js";

export class RemotionVideoProvider implements VideoProvider {
  async compose(_input: VideoCompositionInput): Promise<Buffer> {
    // TODO: Implement Remotion video composition
    // This is the most infrastructure-dependent step and requires:
    // - Remotion project setup with composition templates
    // - Lambda or local rendering configuration
    // - Scene-to-frame mapping logic
    throw new Error(
      "RemotionVideoProvider is not yet implemented. " +
        "Video composition requires Remotion project setup.",
    );
  }
}
