const jobStatusEnum = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
const stepNameEnum = ["MODERATION", "SCRIPT", "VOICE", "IMAGE", "VIDEO", "QC"];
const stepStatusEnum = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"];
const assetTypeEnum = ["SCRIPT_JSON", "VOICE_TEACHER", "VOICE_STUDENT", "SCENE_IMAGE", "FINAL_VIDEO"];

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Animated Edu API",
    version: "0.0.1",
    description:
      "API for creating and managing animated educational video generation jobs.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/jobs": {
      post: {
        summary: "Create a new job",
        tags: ["Jobs"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["topic"],
                properties: {
                  topic: {
                    type: "string",
                    minLength: 3,
                    maxLength: 500,
                    description: "The educational topic to generate a video about",
                  },
                  language: {
                    type: "string",
                    minLength: 2,
                    maxLength: 2,
                    default: "en",
                    description: "Two-character language code",
                  },
                  targetDuration: {
                    type: "integer",
                    minimum: 30,
                    maximum: 300,
                    default: 60,
                    description: "Target video duration in seconds",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Job created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Job" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
              },
            },
          },
        },
      },
      get: {
        summary: "List jobs",
        tags: ["Jobs"],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            description: "Number of jobs to return",
          },
          {
            name: "cursor",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Cursor for pagination (job ID)",
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of jobs",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedJobs" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{id}": {
      get: {
        summary: "Get a job by ID",
        tags: ["Jobs"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Job ID",
          },
        ],
        responses: {
          "200": {
            description: "Job details with assets",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobWithAssets" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{id}/retry": {
      post: {
        summary: "Retry a failed job from a specific step",
        tags: ["Jobs"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Job ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["step"],
                properties: {
                  step: {
                    type: "string",
                    enum: stepNameEnum,
                    description: "The step to retry from (resets this and all subsequent steps)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Job retried",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Job" },
              },
            },
          },
          "400": {
            description: "Validation error or job not in FAILED state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Job not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Job: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          topic: { type: "string" },
          status: { type: "string", enum: jobStatusEnum },
          language: { type: "string" },
          targetDuration: { type: "integer" },
          triggerRunId: { type: "string", nullable: true },
          errorMessage: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          steps: {
            type: "array",
            items: { $ref: "#/components/schemas/JobStep" },
          },
        },
      },
      JobStep: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          jobId: { type: "string", format: "uuid" },
          step: { type: "string", enum: stepNameEnum },
          status: { type: "string", enum: stepStatusEnum },
          durationMs: { type: "integer", nullable: true },
          costCents: { type: "integer", nullable: true },
          attempts: { type: "integer" },
          errorMessage: { type: "string", nullable: true },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Asset: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          jobId: { type: "string", format: "uuid" },
          stepId: { type: "string", format: "uuid", nullable: true },
          type: { type: "string", enum: assetTypeEnum },
          storageKey: { type: "string" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer", nullable: true },
          metadata: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          url: { type: "string", description: "Signed URL for downloading the asset" },
        },
      },
      JobWithAssets: {
        allOf: [
          { $ref: "#/components/schemas/Job" },
          {
            type: "object",
            properties: {
              assets: {
                type: "array",
                items: { $ref: "#/components/schemas/Asset" },
              },
            },
          },
        ],
      },
      PaginatedJobs: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Job" },
          },
          nextCursor: { type: "string", format: "uuid", nullable: true },
          hasMore: { type: "boolean" },
        },
      },
      ValidationError: {
        type: "object",
        properties: {
          error: { type: "string", example: "Validation error" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
};
