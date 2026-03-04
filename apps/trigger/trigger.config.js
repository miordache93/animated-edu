import { defineConfig } from "@trigger.dev/sdk/v3";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
export default defineConfig({
    project: process.env.TRIGGER_PROJECT_REF,
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
        ],
    },
});
//# sourceMappingURL=trigger.config.js.map