import { NextResponse } from "next/server";
import { withAccess } from "@/lib/access";
import { createStarterProject } from "@/lib/starter";

export const runtime = "nodejs";

/** Create this user's own copy of the example project. See lib/starter.ts. */
export const POST = withAccess(null, async (_request, _context, session) => {
  const project = await createStarterProject(session.user.id);
  if (!project) return NextResponse.json({ error: "No example project is set up yet." }, { status: 404 });
  return NextResponse.json(project);
});
