import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

export const DELETE = withAccess("traitOption", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.traitOption.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

/**
 * Edit one option: its name, its rarity, the words that steer generation, and
 * its lore. These live on one row on purpose — the layer, the attribute and
 * the story are the same trait, and splitting them is how they drift.
 */
export const PATCH = withAccess("traitOption", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = (await req.json()) as { label?: unknown; promptFragment?: unknown; lore?: unknown; weight?: unknown };
  const data: { label?: string; promptFragment?: string; lore?: string | null; weight?: number } = {};

  if (body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim()) return NextResponse.json({ error: "Give this option a name." }, { status: 400 });
    data.label = body.label.trim();
  }
  if (body.promptFragment !== undefined) {
    if (typeof body.promptFragment !== "string" || !body.promptFragment.trim()) return NextResponse.json({ error: "The prompt fragment can't be empty." }, { status: 400 });
    data.promptFragment = body.promptFragment.trim();
  }
  // Lore is optional by design: not every trait has a story.
  if (body.lore !== undefined) {
    if (body.lore !== null && typeof body.lore !== "string") return NextResponse.json({ error: "Lore must be text." }, { status: 400 });
    data.lore = typeof body.lore === "string" && body.lore.trim() ? body.lore.trim() : null;
  }
  if (body.weight !== undefined) {
    if (typeof body.weight !== "number" || !Number.isSafeInteger(body.weight) || body.weight < 1 || body.weight > 1_000_000) {
      return NextResponse.json({ error: "Rarity weight must be a whole number of 1 or more." }, { status: 400 });
    }
    data.weight = body.weight;
  }

  return NextResponse.json(await prisma.traitOption.update({ where: { id }, data }));
});
