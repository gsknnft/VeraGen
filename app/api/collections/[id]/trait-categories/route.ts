import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: collectionId } = await params;
  const body = (await req.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name this trait category" }, { status: 400 });
  }

  const last = await prisma.traitCategory.findFirst({
    where: { collectionId },
    orderBy: { sortOrder: "desc" },
  });

  const category = await prisma.traitCategory.create({
    data: {
      collectionId,
      name: body.name.trim(),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    include: { options: true },
  });
  return NextResponse.json(category);
}
