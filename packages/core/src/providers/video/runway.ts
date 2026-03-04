import RunwayML from "@runwayml/sdk";
import { logger } from "@animated-edu/config";
import type { VideoAnimationInput, VideoAnimationResult, VideoAnimationProvider } from "../types.js";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 5 * 60 * 1_000; // 5 minutes

export class RunwayVideoAnimationProvider implements VideoAnimationProvider {
  private client: RunwayML;

  constructor(apiKey: string) {
    this.client = new RunwayML({ apiKey });
  }

  async animate(input: VideoAnimationInput): Promise<VideoAnimationResult> {
    logger.info(
      { durationSeconds: input.durationSeconds, ratio: input.ratio },
      "Starting Runway image-to-video animation",
    );

    const task = await this.client.imageToVideo.create({
      model: "gen3a_turbo",
      promptImage: input.imageUrl,
      promptText: input.promptText,
      duration: input.durationSeconds,
      ratio: input.ratio ?? "1280:768",
    });

    const taskId = task.id;
    logger.info({ taskId }, "Runway task created, polling for completion");

    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_MS) {
      await sleep(POLL_INTERVAL_MS);

      const status = await this.client.tasks.retrieve(taskId);

      switch (status.status) {
        case "SUCCEEDED": {
          const videoUrl = status.output?.[0];
          if (!videoUrl) {
            throw new Error(`Runway task ${taskId} succeeded but returned no output URL`);
          }
          logger.info({ taskId, videoUrl }, "Runway animation completed");
          return { videoUrl };
        }
        case "FAILED":
          throw new Error(
            `Runway task ${taskId} failed: ${status.failure ?? "unknown reason"}`,
          );
        case "CANCELLED":
          throw new Error(`Runway task ${taskId} was cancelled`);
        default:
          // PENDING, THROTTLED, RUNNING — keep polling
          logger.debug(
            { taskId, status: status.status, elapsed: Date.now() - startTime },
            "Runway task still processing",
          );
      }
    }

    throw new Error(
      `Runway task ${taskId} timed out after ${MAX_POLL_MS / 1000}s`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
