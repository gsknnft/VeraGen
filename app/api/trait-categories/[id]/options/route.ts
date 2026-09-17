import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params;
  const body = (await req.json()) as {
    label?: string;
    promptFragment?: string;
    weight?: number;
  };

  if (!body.label?.trim() || !body.promptFragment?.trim()) {
    return NextResponse.json(
      { error: "Give the option a label and a prompt fragment" },
      { status: 400 }
    );
  }

  const option = await prisma.traitOption.create({
    data: {
      categoryId,
      label: body.label.trim(),
      promptFragment: body.promptFragment.trim(),
      weight: Number.isFinite(body.weight) && (body.weight as number) > 0 ? Math.round(body.weight!) : 1,
    },
  });
  return NextResponse.json(option);
}
