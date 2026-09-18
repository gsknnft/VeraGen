import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

export const DELETE = withAccess("traitCategory", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.traitCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
