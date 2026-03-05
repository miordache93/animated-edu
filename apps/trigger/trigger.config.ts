import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { ffmpeg, additionalFiles } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_aiafsodslovtkpyuliak",
  dirs: ["./src/tasks"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
  maxDuration: 600,
  build: {
    extensions: [
      prismaExtension({
        schema: "../../packages/db/prisma/schema.prisma",
      }),
      ffmpeg({ version: "7" }),
      additionalFiles({ files: ["../../cats.jpeg"] }),
    ],
  },
});
