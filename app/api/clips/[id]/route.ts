import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { TransitionType } from "@prisma/client";

interface PatchBody {
  order?: number;
  trimStart?: number;
  trimEnd?: number;
  transitionIn?: TransitionType;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as PatchBody;

  const data: PatchBody = {};
  if (typeof body.order === "number") data.order = body.order;
  if (typeof body.trimStart === "number") data.trimStart = body.trimStart;
  if (typeof body.trimEnd === "number") data.trimEnd = body.trimEnd;
  if (body.transitionIn === "cut" || body.transitionIn === "crossfade") {
    data.transitionIn = body.transitionIn;
  }

  const clip = await prisma.clip.update({ where: { id }, data });
  return NextResponse.json(clip);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.clip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
