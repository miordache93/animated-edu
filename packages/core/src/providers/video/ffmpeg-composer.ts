import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpeg from "fluent-ffmpeg";
import { logger } from "@animated-edu/config";
import type { VideoCompositionInput, VideoComposer } from "../types.js";

export class FFmpegVideoComposer implements VideoComposer {
  constructor() {
    // Respect env vars set by Trigger.dev ffmpeg extension
    if (process.env.FFMPEG_PATH) {
      ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
    }
    if (process.env.FFPROBE_PATH) {
      ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
    }
  }

  async compose(input: VideoCompositionInput): Promise<Buffer> {
    const workDir = join(tmpdir(), `video-compose-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    logger.info({ workDir, sceneCount: input.scenes.length }, "Starting FFmpeg video composition");

    try {
      // Download all remote assets to local temp files
      const sceneFiles = await Promise.all(
        input.scenes.map(async (scene) => {
          const prefix = `scene-${scene.sceneNumber}`;
          const silentPath = join(workDir, `${prefix}-silent.mp4`);
          const teacherPath = join(workDir, `${prefix}-teacher.mp3`);
          const studentPath = join(workDir, `${prefix}-student.mp3`);

          await Promise.all([
            downloadToFile(scene.silentVideoUrl, silentPath),
            downloadToFile(scene.teacherAudioUrl, teacherPath),
            downloadToFile(scene.studentAudioUrl, studentPath),
          ]);

          return { sceneNumber: scene.sceneNumber, silentPath, teacherPath, studentPath, durationSeconds: scene.durationSeconds };
        }),
      );

      // Sort scenes by sceneNumber
      sceneFiles.sort((a, b) => a.sceneNumber - b.sceneNumber);

      // Per-scene: concat teacher+student audio, overlay onto silent clip
      const composedPaths: string[] = [];
      for (const scene of sceneFiles) {
        const sceneAudioPath = join(workDir, `scene-${scene.sceneNumber}-audio.mp3`);
        const composedPath = join(workDir, `scene-${scene.sceneNumber}-composed.mp4`);

        // Concat teacher + student audio sequentially
        await concatAudio([scene.teacherPath, scene.studentPath], sceneAudioPath);

        // Overlay audio onto the silent video clip
        await overlayAudio(scene.silentPath, sceneAudioPath, composedPath);

        composedPaths.push(composedPath);
      }

      // Concatenate all composed scene clips into final video
      const finalPath = join(workDir, "final.mp4");
      await concatVideos(composedPaths, finalPath, workDir);

      const finalBuffer = await readFile(finalPath);
      logger.info({ sizeBytes: finalBuffer.length }, "FFmpeg composition complete");
      return finalBuffer;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch((err) => {
        logger.warn({ workDir, error: String(err) }, "Failed to clean up temp dir");
      });
    }
  }
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
}

function concatAudio(inputPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    for (const p of inputPaths) {
      cmd.input(p);
    }

    cmd
      .on("error", reject)
      .on("end", () => resolve())
      .complexFilter([
        `[0:a][1:a]concat=n=${inputPaths.length}:v=0:a=1[outa]`,
      ])
      .outputOptions(["-map", "[outa]"])
      .output(outputPath)
      .run();
  });
}

function overlayAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
      ])
      .on("error", reject)
      .on("end", () => resolve())
      .output(outputPath)
      .run();
  });
}

async function concatVideos(videoPaths: string[], outputPath: string, workDir: string): Promise<void> {
  // Write concat list file for ffmpeg
  const listContent = videoPaths.map((p) => `file '${p}'`).join("\n");
  const listPath = join(workDir, "concat-list.txt");
  await writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .on("error", reject)
      .on("end", () => resolve())
      .output(outputPath)
      .run();
  });
}
