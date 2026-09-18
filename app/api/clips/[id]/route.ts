import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { TransitionType } from "@prisma/client";
import { withAccess } from "@/lib/access";

interface PatchBody {
  order?: number;
  trimStart?: number;
  trimEnd?: number;
  transitionIn?: TransitionType;
  caption?: string | null;
}

export const PATCH = withAccess("clip", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = (await req.json()) as PatchBody;

  const existing = await prisma.clip.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const start = body.trimStart ?? existing.trimStart;
  const end = body.trimEnd ?? existing.trimEnd ?? existing.durationSeconds;
  if (end !== null && (end <= start || (existing.durationSeconds !== null && end > existing.durationSeconds))) return NextResponse.json({ error: "Trim must fit within the source clip." }, { status: 400 });
  const data: PatchBody = {};
  if (typeof body.order === "number") data.order = body.order;
  if (typeof body.trimStart === "number") data.trimStart = body.trimStart;
  if (typeof body.trimEnd === "number") data.trimEnd = body.trimEnd;
  if (body.transitionIn === "cut" || body.transitionIn === "crossfade") {
    data.transitionIn = body.transitionIn;
  }
  if ("caption" in body) data.caption = body.caption || null;

  const clip = await prisma.clip.update({ where: { id }, data });
  return NextResponse.json(clip);
});

export const DELETE = withAccess("clip", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.clip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
