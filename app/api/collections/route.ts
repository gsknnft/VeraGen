import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const collections = await prisma.collection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(collections);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name this collection" }, { status: 400 });
  }
  const collection = await prisma.collection.create({ data: { name: body.name.trim() } });
  return NextResponse.json(collection);
}
