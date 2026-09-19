import path from "path";
import os from "os";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "../lib/db";
import { uploadBuffer, signedMediaUrl } from "../lib/storage";
import {
  claimNextExport,
  completeExport,
  failExport,
  MAX_ATTEMPTS,
  type ClaimedExport,
} from "../lib/render-queue";

/**
 * The render worker. Run it as its own process, on its own box if you like:
 *
 *   pnpm worker
 *
 * It makes only outbound connections — Postgres and object storage — so it
 * needs no open ports, no tunnel, and no public hostname. That is what lets
 * the web app and the renderer live on entirely different hardware without
 * the app knowing or caring where rendering happens.
 *
 * Concurrency is deliberately small and explicit. Each render drives a real
 * headless Chromium that wants 1–2 GB; the failure mode of running too many
 * is not slowness but the OOM killer taking down whatever else is on the box.
 */
const CONCURRENCY = Math.max(1, Number(process.env.RENDER_CONCURRENCY ?? 1));
const IDLE_POLL_MS = Number(process.env.RENDER_POLL_MS ?? 5000);

let stopping = false;
let active = 0;

/**
 * Remotion's bundle step is the slow part and does not depend on the job, so
 * it is built once per process and reused. Rebuilt on failure rather than
 * cached forever, so a broken bundle is not permanent.
 */
let serveUrlPromise: Promise<string> | null = null;
function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    }).catch((err) => {
      serveUrlPromise = null;
      throw err;
    });
  }
  return serveUrlPromise;
}

async function render(job: ClaimedExport): Promise<void> {
  const outputLocation = path.join(os.tmpdir(), `veragen-export-${randomUUID()}.mp4`);
  const inputProps = job.inputProps as unknown as import("../remotion/Composition").StudioCompositionProps & Record<string, unknown>;
  const project = await prisma.project.findUnique({ where: { id: job.projectId }, select: { ownerId: true } });
  // MAX_ATTEMPTS, not a literal: an unowned project will not fix itself on a
  // retry, so this should fail terminally however the retry budget changes.
  if (!project?.ownerId) { await failExport(job.id, MAX_ATTEMPTS, "Project owner is unavailable."); return; }

  try {
    inputProps.clips = await Promise.all(inputProps.clips.map(async clip => ({ ...clip, videoUrl: await signedMediaUrl(clip.videoUrl, project.ownerId!) })));
    if (inputProps.brand.logoUrl) inputProps.brand.logoUrl = await signedMediaUrl(inputProps.brand.logoUrl, project.ownerId);
    const serveUrl = await getServeUrl();
    const composition = await selectComposition({ serveUrl, id: "Studio", inputProps });
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps });

    const buffer = await fs.readFile(outputLocation);
    const videoUrl = await uploadBuffer(
      `exports/${job.projectId}/${randomUUID()}.mp4`,
      buffer,
      "video/mp4",
      project.ownerId,
    );

    await completeExport(job.id, job.attempts, videoUrl);
    console.log(`[worker] rendered ${job.id} (attempt ${job.attempts})`);
  } catch (err) {
    // The operator gets the real error; the job row gets a written message,
    // because the owner of the job reads that one.
    console.error(`[worker] export ${job.id} failed on attempt ${job.attempts}`);
    await failExport(
      job.id,
      job.attempts,
      "The render did not complete. It will be retried automatically.",
    );

  } finally {
    await fs.unlink(outputLocation).catch(() => {});
  }
}

async function loop() {
  console.log(`[worker] started — concurrency ${CONCURRENCY}, polling every ${IDLE_POLL_MS}ms`);

  while (!stopping) {
    if (active >= CONCURRENCY) {
      await sleep(250);
      continue;
    }

    let job: ClaimedExport | null = null;
    try {
      job = await claimNextExport();
    } catch (err) {
      // A database blip should slow the worker down, not kill it.
      console.error("[worker] could not claim a job");
      await sleep(IDLE_POLL_MS);
      continue;
    }

    if (!job) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    active++;
    void render(job).finally(() => {
      active--;
    });
  }

  // Let in-flight renders finish rather than orphaning rows as `rendering`
  // and making the next worker wait out CLAIM_TIMEOUT_MS to reclaim them.
  console.log(`[worker] draining ${active} in-flight render(s)…`);
  while (active > 0) await sleep(500);
  await prisma.$disconnect();
  console.log("[worker] stopped");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1); // Second signal: the operator means it.
    console.log(`[worker] ${signal} received, finishing current work…`);
    stopping = true;
  });
}

loop().catch((err) => {
  console.error("[worker] fatal worker failure");
  process.exit(1);
});
