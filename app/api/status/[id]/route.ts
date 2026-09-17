import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/higgsfield";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const status = await getJobStatus(id);
    return NextResponse.json(status);
  } catch (err) {
    console.error("Higgsfield status check failed", err);
    return NextResponse.json(
      { status: "failed", error: "Could not reach Higgsfield" },
      { status: 502 }
    );
  }
}
