import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  const project = await prisma.project.create({ data: {} });
  return NextResponse.json({ id: project.id });
}
