import { createRequire } from "node:module";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { logger } from "@animated-edu/config";
import { swaggerSpec } from "./swagger.js";
import { jobsRouter } from "./routes/jobs.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const require = createRequire(import.meta.url);
const pinoHttp = require("pino-http") as typeof import("pino-http").default;

const app = express();
const port = Number(process.env.PORT) || 3000;

// Middleware
app.use(pinoHttp({ logger }) as express.RequestHandler);
app.use(express.json({ limit: "1mb" }));

// Swagger UI
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/jobs", jobsRouter);

// Error handler
app.use(errorHandler);

const server = app.listen(port, () => {
  logger.info({ port }, "API server started");
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
