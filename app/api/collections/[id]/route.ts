import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      traitCategories: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { label: "asc" } } },
      },
      mints: {
        orderBy: { mintNumber: "asc" },
        include: { traits: { include: { traitOption: true } } },
      },
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  return NextResponse.json(collection);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; styleLock?: string };

  const data: { name?: string; styleLock?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("styleLock" in body) data.styleLock = body.styleLock || null;

  const collection = await prisma.collection.update({ where: { id }, data });
  return NextResponse.json(collection);
}
