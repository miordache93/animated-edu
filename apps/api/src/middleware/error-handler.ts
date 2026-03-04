import type { Request, Response, NextFunction } from "express";
import { logger } from "@animated-edu/config";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");

  const isProduction = process.env.NODE_ENV === "production";

  res.status(500).json({
    error: "Internal server error",
    ...(isProduction ? {} : { message: err.message }),
  });
}
