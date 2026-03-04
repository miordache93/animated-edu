import { Router } from "express";
import { z } from "zod";
import { StepName } from "@animated-edu/db";
import { validate } from "../middleware/validate.js";
import {
  createJob,
  listJobs,
  getJob,
  retryJob,
} from "../controllers/jobs.controller.js";

const router = Router();

router.post(
  "/",
  validate({
    body: z.object({
      topic: z.string().min(3).max(500),
      language: z.string().length(2).optional(),
      targetDuration: z.number().int().min(30).max(300).optional(),
    }),
  }),
  createJob,
);

router.get(
  "/",
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().uuid().optional(),
    }),
  }),
  listJobs,
);

router.get(
  "/:id",
  validate({
    params: z.object({
      id: z.string().uuid(),
    }),
  }),
  getJob,
);

router.post(
  "/:id/retry",
  validate({
    params: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({
      step: z.nativeEnum(StepName),
    }),
  }),
  retryJob,
);

export { router as jobsRouter };
