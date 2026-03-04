import type { Request, Response, NextFunction } from "express";
import { prisma, StepName, StepStatus, JobStatus } from "@animated-edu/db";
import { tasks } from "@trigger.dev/sdk/v3";
import { R2StorageProvider, STEP_ORDER } from "@animated-edu/core";
import { env } from "@animated-edu/config";

export async function createJob(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { topic, language, targetDuration } = req.body as {
      topic: string;
      language?: string;
      targetDuration?: number;
    };

    // Create job with all steps initialized as PENDING
    const job = await prisma.job.create({
      data: {
        topic,
        language: language ?? "en",
        targetDuration: targetDuration ?? 60,
        steps: {
          createMany: {
            data: STEP_ORDER.map((step) => ({ step, status: StepStatus.PENDING })),
          },
        },
      },
      include: { steps: true },
    });

    // Trigger the episode generation pipeline
    const handle = await tasks.trigger("generate-episode", {
      jobId: job.id,
    });

    // Store the trigger run ID
    await prisma.job.update({
      where: { id: job.id },
      data: { triggerRunId: handle.id },
    });

    res.status(201).json({
      ...job,
      triggerRunId: handle.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function listJobs(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const cursor = req.query.cursor as string | undefined;

    const jobs = await prisma.job.findMany({
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: "desc" },
      include: {
        steps: {
          orderBy: { step: "asc" },
          select: {
            step: true,
            status: true,
            durationMs: true,
            attempts: true,
          },
        },
      },
    });

    const hasMore = jobs.length > limit;
    const results = hasMore ? jobs.slice(0, limit) : jobs;
    const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

    res.json({
      data: results,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJob(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id as string;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { step: "asc" } },
        assets: true,
      },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Generate signed URLs for assets
    const storage = new R2StorageProvider({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
    });

    const assetsWithUrls = await Promise.all(
      job.assets.map(async (asset) => ({
        ...asset,
        url: await storage.getSignedUrl(asset.storageKey),
      })),
    );

    res.json({
      ...job,
      assets: assetsWithUrls,
    });
  } catch (error) {
    next(error);
  }
}

export async function retryJob(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id as string;
    const { step } = req.body as { step: string };

    const job = await prisma.job.findUnique({
      where: { id },
      include: { steps: true },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== JobStatus.FAILED) {
      res.status(400).json({ error: "Only failed jobs can be retried" });
      return;
    }

    const stepName = step as StepName;
    const stepIndex = STEP_ORDER.indexOf(stepName);

    if (stepIndex === -1) {
      res.status(400).json({ error: `Invalid step: ${step}` });
      return;
    }

    // Reset this step and all subsequent steps to PENDING
    const stepsToReset = STEP_ORDER.slice(stepIndex);
    await prisma.jobStep.updateMany({
      where: {
        jobId: id,
        step: { in: stepsToReset },
      },
      data: {
        status: StepStatus.PENDING,
        errorMessage: null,
        durationMs: null,
        startedAt: null,
        completedAt: null,
      },
    });

    // Delete assets from reset steps
    const stepRecords = await prisma.jobStep.findMany({
      where: {
        jobId: id,
        step: { in: stepsToReset },
      },
    });

    await prisma.asset.deleteMany({
      where: {
        stepId: { in: stepRecords.map((s) => s.id) },
      },
    });

    // Reset job status
    await prisma.job.update({
      where: { id },
      data: { status: JobStatus.PENDING, errorMessage: null },
    });

    // Trigger new run with startFromStep
    const handle = await tasks.trigger("generate-episode", {
      jobId: id,
      startFromStep: stepName,
    });

    await prisma.job.update({
      where: { id },
      data: { triggerRunId: handle.id },
    });

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id },
      include: { steps: { orderBy: { step: "asc" } } },
    });

    res.json({
      ...updatedJob,
      triggerRunId: handle.id,
    });
  } catch (error) {
    next(error);
  }
}
