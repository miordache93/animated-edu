import { prisma, StepName, StepStatus, AssetType } from "@animated-edu/db";
import { logger } from "@animated-edu/config";
import type { LLMProvider } from "../providers/types.js";
import type { VoiceProvider } from "../providers/types.js";
import type { ImageProvider } from "../providers/types.js";
import type { VideoAnimationProvider, VideoComposer } from "../providers/types.js";
import type { StorageProvider } from "../storage/types.js";
import { runModerationAgent, type ModerationResult } from "../agents/moderation.agent.js";
import { runScriptAgent, type Script } from "../agents/script.agent.js";
import type { Scene } from "../agents/script.agent.js";
import { runStoryboardAgent } from "../agents/storyboard.agent.js";
import type { StepContext } from "./types.js";

export async function executeStep<T>(
  ctx: StepContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  await prisma.jobStep.upsert({
    where: { jobId_step: { jobId: ctx.jobId, step: ctx.step } },
    create: {
      jobId: ctx.jobId,
      step: ctx.step,
      status: StepStatus.RUNNING,
      attempts: 1,
      startedAt: new Date(),
    },
    update: {
      status: StepStatus.RUNNING,
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorMessage: null,
    },
  });

  try {
    const result = await fn();
    const durationMs = Date.now() - start;

    await prisma.jobStep.update({
      where: { jobId_step: { jobId: ctx.jobId, step: ctx.step } },
      data: {
        status: StepStatus.COMPLETED,
        durationMs,
        completedAt: new Date(),
      },
    });

    logger.info({ jobId: ctx.jobId, step: ctx.step, durationMs }, "Step completed");
    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await prisma.jobStep.update({
      where: { jobId_step: { jobId: ctx.jobId, step: ctx.step } },
      data: {
        status: StepStatus.FAILED,
        durationMs,
        errorMessage,
      },
    });

    logger.error(
      { jobId: ctx.jobId, step: ctx.step, durationMs, error: errorMessage },
      "Step failed",
    );
    throw error;
  }
}

export async function runModeration(
  jobId: string,
  llm: LLMProvider,
): Promise<ModerationResult> {
  return executeStep({ jobId, step: StepName.MODERATION }, async () => {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const result = await runModerationAgent(job.topic, llm);

    await prisma.jobStep.update({
      where: { jobId_step: { jobId, step: StepName.MODERATION } },
      data: { output: JSON.parse(JSON.stringify(result)) },
    });

    return result;
  });
}

export async function runScriptGeneration(
  jobId: string,
  llm: LLMProvider,
  storage: StorageProvider,
): Promise<Script> {
  return executeStep({ jobId, step: StepName.SCRIPT }, async () => {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const script = await runScriptAgent(
      job.topic,
      job.language,
      job.targetDuration,
      llm,
    );

    // Store script JSON in R2
    const scriptBuffer = Buffer.from(JSON.stringify(script, null, 2));
    const storageKey = `jobs/${jobId}/script.json`;
    await storage.upload(storageKey, scriptBuffer, "application/json");

    // Record asset
    const step = await prisma.jobStep.findUniqueOrThrow({
      where: { jobId_step: { jobId, step: StepName.SCRIPT } },
    });

    await prisma.asset.create({
      data: {
        jobId,
        stepId: step.id,
        type: AssetType.SCRIPT_JSON,
        storageKey,
        mimeType: "application/json",
        sizeBytes: scriptBuffer.length,
      },
    });

    await prisma.jobStep.update({
      where: { jobId_step: { jobId, step: StepName.SCRIPT } },
      data: { output: JSON.parse(JSON.stringify(script)) },
    });

    return script;
  });
}

export async function runVoiceGeneration(
  jobId: string,
  script: Script,
  voice: VoiceProvider,
  storage: StorageProvider,
  teacherVoiceId: string,
  studentVoiceId: string,
): Promise<string[]> {
  return executeStep({ jobId, step: StepName.VOICE }, async () => {
    const step = await prisma.jobStep.findUniqueOrThrow({
      where: { jobId_step: { jobId, step: StepName.VOICE } },
    });

    const assetKeys: string[] = [];

    for (const scene of script.scenes) {
      // Generate teacher voice
      if (scene.teacherDialogue) {
        const audioBuffer = await voice.synthesize(
          scene.teacherDialogue,
          teacherVoiceId,
        );
        const key = `jobs/${jobId}/voice/teacher-scene-${scene.sceneNumber}.mp3`;
        await storage.upload(key, audioBuffer, "audio/mpeg");

        await prisma.asset.create({
          data: {
            jobId,
            stepId: step.id,
            type: AssetType.VOICE_TEACHER,
            storageKey: key,
            mimeType: "audio/mpeg",
            sizeBytes: audioBuffer.length,
            metadata: { sceneNumber: scene.sceneNumber },
          },
        });
        assetKeys.push(key);
      }

      // Generate student voice
      if (scene.studentDialogue) {
        const audioBuffer = await voice.synthesize(
          scene.studentDialogue,
          studentVoiceId,
        );
        const key = `jobs/${jobId}/voice/student-scene-${scene.sceneNumber}.mp3`;
        await storage.upload(key, audioBuffer, "audio/mpeg");

        await prisma.asset.create({
          data: {
            jobId,
            stepId: step.id,
            type: AssetType.VOICE_STUDENT,
            storageKey: key,
            mimeType: "audio/mpeg",
            sizeBytes: audioBuffer.length,
            metadata: { sceneNumber: scene.sceneNumber },
          },
        });
        assetKeys.push(key);
      }
    }

    return assetKeys;
  });
}

export async function runImageGeneration(
  jobId: string,
  script: Script,
  llm: LLMProvider,
  image: ImageProvider,
  storage: StorageProvider,
): Promise<string[]> {
  return executeStep({ jobId, step: StepName.IMAGE }, async () => {
    // Refine prompts with storyboard agent for visual consistency
    const storyboard = await runStoryboardAgent(script, llm);

    const step = await prisma.jobStep.findUniqueOrThrow({
      where: { jobId_step: { jobId, step: StepName.IMAGE } },
    });

    const assetKeys: string[] = [];

    for (const scene of storyboard.scenes) {
      const imageBuffer = await image.generate(
        `${storyboard.styleGuide}\n\n${scene.imagePrompt}`,
      );
      const key = `jobs/${jobId}/images/scene-${scene.sceneNumber}.png`;
      await storage.upload(key, imageBuffer, "image/png");

      await prisma.asset.create({
        data: {
          jobId,
          stepId: step.id,
          type: AssetType.SCENE_IMAGE,
          storageKey: key,
          mimeType: "image/png",
          sizeBytes: imageBuffer.length,
          metadata: { sceneNumber: scene.sceneNumber },
        },
      });
      assetKeys.push(key);
    }

    return assetKeys;
  });
}

function buildMotionPrompt(scene: Scene): string {
  return `Gentle animation of educational cartoon scene. Characters have slight breathing motions and subtle idle movements. ${scene.narration.substring(0, 150)}. Smooth camera, child-friendly cartoon style.`;
}

export async function runVideoComposition(
  jobId: string,
  script: Script,
  animator: VideoAnimationProvider,
  composer: VideoComposer,
  storage: StorageProvider,
): Promise<string> {
  return executeStep({ jobId, step: StepName.VIDEO }, async () => {
    const step = await prisma.jobStep.findUniqueOrThrow({
      where: { jobId_step: { jobId, step: StepName.VIDEO } },
    });

    // Query assets from DB by type, index by sceneNumber
    const [imageAssets, teacherVoiceAssets, studentVoiceAssets] = await Promise.all([
      prisma.asset.findMany({ where: { jobId, type: AssetType.SCENE_IMAGE } }),
      prisma.asset.findMany({ where: { jobId, type: AssetType.VOICE_TEACHER } }),
      prisma.asset.findMany({ where: { jobId, type: AssetType.VOICE_STUDENT } }),
    ]);

    const imageByScene = new Map(
      imageAssets.map((a) => [(a.metadata as Record<string, unknown>)?.sceneNumber as number, a.storageKey]),
    );
    const teacherByScene = new Map(
      teacherVoiceAssets.map((a) => [(a.metadata as Record<string, unknown>)?.sceneNumber as number, a.storageKey]),
    );
    const studentByScene = new Map(
      studentVoiceAssets.map((a) => [(a.metadata as Record<string, unknown>)?.sceneNumber as number, a.storageKey]),
    );

    // For each scene: animate image → upload silent clip to R2
    const silentClipKeys = await Promise.all(
      script.scenes.map(async (scene) => {
        const imageKey = imageByScene.get(scene.sceneNumber);
        if (!imageKey) {
          throw new Error(`No image asset found for scene ${scene.sceneNumber}`);
        }

        const imageUrl = await storage.getSignedUrl(imageKey);
        const motionPrompt = buildMotionPrompt(scene);

        logger.info({ jobId, sceneNumber: scene.sceneNumber }, "Animating scene image with Runway");

        const result = await animator.animate({
          imageUrl,
          promptText: motionPrompt,
          durationSeconds: scene.durationSeconds <= 7 ? 5 : 10,
          ratio: "1280:768",
        });

        // Re-upload to R2 (Runway URLs expire)
        const response = await fetch(result.videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download Runway video: ${response.status}`);
        }
        const videoBuffer = Buffer.from(await response.arrayBuffer());
        const silentKey = `jobs/${jobId}/video/scene-${scene.sceneNumber}-silent.mp4`;
        await storage.upload(silentKey, videoBuffer, "video/mp4");

        return { sceneNumber: scene.sceneNumber, silentKey };
      }),
    );

    const silentByScene = new Map(silentClipKeys.map((s) => [s.sceneNumber, s.silentKey]));

    // Build composition input with signed URLs
    const compositionScenes = await Promise.all(
      script.scenes.map(async (scene) => {
        const silentKey = silentByScene.get(scene.sceneNumber)!;
        const teacherKey = teacherByScene.get(scene.sceneNumber);
        const studentKey = studentByScene.get(scene.sceneNumber);

        if (!teacherKey || !studentKey) {
          throw new Error(`Missing voice assets for scene ${scene.sceneNumber}`);
        }

        const [silentVideoUrl, teacherAudioUrl, studentAudioUrl] = await Promise.all([
          storage.getSignedUrl(silentKey),
          storage.getSignedUrl(teacherKey),
          storage.getSignedUrl(studentKey),
        ]);

        return {
          sceneNumber: scene.sceneNumber,
          silentVideoUrl,
          teacherAudioUrl,
          studentAudioUrl,
          durationSeconds: scene.durationSeconds,
        };
      }),
    );

    logger.info({ jobId, sceneCount: compositionScenes.length }, "Composing final video with FFmpeg");

    const videoBuffer = await composer.compose({ scenes: compositionScenes });
    const key = `jobs/${jobId}/video/final.mp4`;
    await storage.upload(key, videoBuffer, "video/mp4");

    await prisma.asset.create({
      data: {
        jobId,
        stepId: step.id,
        type: AssetType.FINAL_VIDEO,
        storageKey: key,
        mimeType: "video/mp4",
        sizeBytes: videoBuffer.length,
      },
    });

    return key;
  });
}

export async function runQualityChecks(
  jobId: string,
  llm: LLMProvider,
): Promise<{ passed: boolean; issues: string[] }> {
  return executeStep({ jobId, step: StepName.QC }, async () => {
    // Load the script from the SCRIPT step output
    const scriptStep = await prisma.jobStep.findUniqueOrThrow({
      where: { jobId_step: { jobId, step: StepName.SCRIPT } },
    });

    const script = scriptStep.output as unknown as Script | null;
    if (!script) {
      return { passed: false, issues: ["No script found for QC review"] };
    }

    const prompt = `You are a quality assurance reviewer for educational content. Review the following script and identify any issues.

Script: ${JSON.stringify(script)}

Check for:
1. Factual accuracy
2. Age-appropriateness
3. Clarity of explanations
4. Logical flow between scenes
5. Consistent tone and style

Respond with a JSON object:
- "passed": true if the content passes quality checks
- "issues": array of strings describing any issues found (empty if passed)

Respond ONLY with a valid JSON object.`;

    const qcSchema = (await import("zod")).z.object({
      passed: (await import("zod")).z.boolean(),
      issues: (await import("zod")).z.array((await import("zod")).z.string()),
    });

    const result = await llm.completeJSON(prompt, qcSchema, {
      temperature: 0.2,
    });

    await prisma.jobStep.update({
      where: { jobId_step: { jobId, step: StepName.QC } },
      data: { output: JSON.parse(JSON.stringify(result)) },
    });

    return result;
  });
}
