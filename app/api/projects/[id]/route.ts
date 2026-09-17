import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { BrandTemplate } from "@prisma/client";

const VALID_TEMPLATES: BrandTemplate[] = ["none", "teaser", "productReveal", "announcement"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    styleLock?: string;
    ctaText?: string;
    template?: string;
  };

  const data: { styleLock?: string | null; ctaText?: string | null; template?: BrandTemplate } = {};
  if ("styleLock" in body) data.styleLock = body.styleLock || null;
  if ("ctaText" in body) data.ctaText = body.ctaText || null;
  if (typeof body.template === "string" && VALID_TEMPLATES.includes(body.template as BrandTemplate)) {
    data.template = body.template as BrandTemplate;
  }

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}
