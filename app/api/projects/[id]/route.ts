import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { BrandTemplate } from "@prisma/client";
import { withAccess } from "@/lib/access";

const VALID_TEMPLATES: BrandTemplate[] = ["none", "teaser", "productReveal", "announcement"];

export const GET = withAccess("project", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      clips: { orderBy: { order: "asc" } },
      characters: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
});

export const PATCH = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    styleLock?: string;
    ctaText?: string;
    template?: string;
  };

  const data: { name?: string; styleLock?: string | null; ctaText?: string | null; template?: BrandTemplate } = {};
  // Length is already bounded by validJsonInput in withAccess. A blank name is
  // ignored rather than stored, so a project always has something to show.
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("styleLock" in body) data.styleLock = body.styleLock || null;
  if ("ctaText" in body) data.ctaText = body.ctaText || null;
  if (typeof body.template === "string" && VALID_TEMPLATES.includes(body.template as BrandTemplate)) {
    data.template = body.template as BrandTemplate;
  }

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
});
