import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma, JobStatus, StepName, StepStatus } from "@animated-edu/db";
import { logger } from "@animated-edu/config";
import { STEP_ORDER, type Script } from "@animated-edu/core";
import { moderateTopicTask } from "./moderate-topic.js";
import { generateScriptTask } from "./generate-script.js";
import { generateVoicesTask } from "./generate-voices.js";
import { generateImagesTask } from "./generate-images.js";
import { generateVideoTask } from "./generate-video.js";
import { runQualityChecksTask } from "./run-quality-checks.js";

export const generateEpisodeTask = schemaTask({
  id: "generate-episode",
  schema: z.object({
    jobId: z.string().uuid(),
    startFromStep: z.nativeEnum(StepName).optional(),
  }),
  run: async ({ jobId, startFromStep }) => {
    logger.info({ jobId, startFromStep }, "Starting episode generation");

    // Update job to PROCESSING
    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.PROCESSING },
    });

    try {
      // Determine which steps to skip
      const startIndex = startFromStep
        ? STEP_ORDER.indexOf(startFromStep)
        : 0;

      // Load previous outputs if resuming
      let script: Script | undefined;

      if (startIndex > STEP_ORDER.indexOf(StepName.SCRIPT)) {
        const scriptStep = await prisma.jobStep.findUnique({
          where: { jobId_step: { jobId, step: StepName.SCRIPT } },
        });
        script = scriptStep?.output as unknown as Script | undefined;
      }

      // Execute steps sequentially
      for (let i = startIndex; i < STEP_ORDER.length; i++) {
        const step = STEP_ORDER[i]!;

        switch (step) {
          case StepName.MODERATION: {
            await moderateTopicTask.triggerAndWait({ jobId });
            break;
          }

          case StepName.SCRIPT: {
            const result = await generateScriptTask.triggerAndWait({ jobId });
            if (result.ok) {
              script = result.output;
            } else {
              throw new Error("Script generation failed");
            }
            break;
          }

          case StepName.VOICE: {
            if (!script) throw new Error("Script required for voice generation");
            const voiceResult = await generateVoicesTask.triggerAndWait({
              jobId,
              script,
            });
            if (!voiceResult.ok) {
              throw new Error("Voice generation failed");
            }
            break;
          }

          case StepName.IMAGE: {
            if (!script) throw new Error("Script required for image generation");
            const imageResult = await generateImagesTask.triggerAndWait({
              jobId,
              script,
            });
            if (!imageResult.ok) {
              throw new Error("Image generation failed");
            }
            break;
          }

          case StepName.VIDEO: {
            if (!script) throw new Error("Script required for video composition");
            await generateVideoTask.triggerAndWait({
              jobId,
              script,
            });
            break;
          }

          case StepName.QC: {
            await runQualityChecksTask.triggerAndWait({ jobId });
            break;
          }
        }
      }

      // Mark job as completed
      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED },
      });

      logger.info({ jobId }, "Episode generation completed");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMessage,
        },
      });

      logger.error({ jobId, error: errorMessage }, "Episode generation failed");
      throw error;
    }
  },
});
