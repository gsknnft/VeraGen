// Deliberately not `server-only`, unlike its neighbours: this module is
// shared with `worker/render-worker.ts`, which is a plain Node process and
// would throw on that import. Nothing here is client-reachable regardless —
// it is imported only by route handlers and the worker.
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * A Postgres-backed render queue.
 *
 * Deliberately not Redis/BullMQ and not an in-process pool. Postgres is
 * already here, the job rows are already something the UI polls, and a render
 * that takes minutes has to survive a deploy. `packages/workers` solves the
 * other half of this problem — bounding concurrency inside one process — but
 * its queue lives in memory, so a crash loses every in-flight job with no
 * record that it was ever asked for.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, which is the whole reason this works
 * without a lock service: two workers running the same query take two
 * different rows instead of blocking on each other or racing to the same one.
 */

/**
 * A worker that dies mid-render leaves its row `rendering` forever. Anything
 * claimed longer ago than this is treated as abandoned and re-queued.
 * Comfortably longer than the slowest legitimate render.
 */
export const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

/** Give up after this many attempts rather than retrying a poisoned job forever. */
export const MAX_ATTEMPTS = 3;

export type ClaimedExport = {
  id: string;
  projectId: string;
  aspect: string;
  durationSeconds: number;
  inputProps: Prisma.JsonValue;
  attempts: number;
};

export async function enqueueExport(args: {
  projectId: string;
  aspect: string;
  durationSeconds: number;
  inputProps: Prisma.InputJsonValue;
}) {
  return prisma.export.create({
    data: {
      projectId: args.projectId,
      aspect: args.aspect,
      durationSeconds: args.durationSeconds,
      inputProps: args.inputProps,
      status: "queued",
    },
    select: { id: true, status: true, createdAt: true },
  });
}

/**
 * Atomically take the oldest eligible job, or return null if there is none.
 *
 * Eligible means queued, or rendering but abandoned past `CLAIM_TIMEOUT_MS`.
 * The UPDATE and the SELECT are one statement so there is no window between
 * seeing a row and owning it.
 */
export async function claimNextExport(): Promise<ClaimedExport | null> {
  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);

  const rows = await prisma.$queryRaw<ClaimedExport[]>`
    UPDATE "Export" SET
      "status" = 'rendering',
      "claimedAt" = NOW(),
      "attempts" = "Export"."attempts" + 1,
      "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id" FROM "Export"
      WHERE ("status" = 'queued' OR ("status" = 'rendering' AND "claimedAt" < ${cutoff}))
        AND "attempts" < ${MAX_ATTEMPTS}
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "projectId", "aspect", "durationSeconds", "inputProps", "attempts"`;

  return rows[0] ?? null;
}

export async function completeExport(id: string, videoUrl: string) {
  await prisma.export.update({
    where: { id },
    data: { status: "completed", videoUrl, errorMessage: null, claimedAt: null },
  });
}

/**
 * Put a failed job back in the queue unless it is out of attempts.
 *
 * `message` is for the operator reading logs and for the owner of the job —
 * never a provider error or a stack trace, which is why the caller passes a
 * written message rather than the caught error.
 */
export async function failExport(id: string, attempts: number, message: string) {
  const exhausted = attempts >= MAX_ATTEMPTS;
  await prisma.export.update({
    where: { id },
    data: {
      status: exhausted ? "failed" : "queued",
      errorMessage: message,
      claimedAt: null,
    },
  });
  return { requeued: !exhausted };
}

/** Jobs ahead of this one, so the UI can say something truer than "working…". */
export async function queuePosition(id: string, createdAt: Date) {
  return prisma.export.count({
    where: { status: "queued", createdAt: { lt: createdAt }, NOT: { id } },
  });
}
