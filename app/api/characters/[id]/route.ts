import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

export const DELETE = withAccess("character", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.character.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
