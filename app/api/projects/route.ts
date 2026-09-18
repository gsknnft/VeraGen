import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

/** Only this owner's projects. Listing everyone's was the original leak. */
export const GET = withAccess(null, async (_request, _context, session) => {
  const projects = await prisma.project.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json(projects);
});

export const POST = withAccess(null, async (_request, _context, session) => {
  // Stamped at creation. A project created without an owner is invisible to
  // every session, which is the safe direction to fail.
  const project = await prisma.project.create({ data: { ownerId: session.user.id } });
  return NextResponse.json({ id: project.id });
});
