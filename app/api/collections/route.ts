import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

/** Only this owner's collections. `findMany` with no filter listed everyone's. */
export const GET = withAccess(null, async (_request, _context, session) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(collections);
});

export const POST = withAccess(null, async (request, _context, session) => {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name this collection" }, { status: 400 });
  }
  const collection = await prisma.collection.create({
    data: { name: body.name.trim(), ownerId: session.user.id },
  });
  return NextResponse.json(collection);
});
