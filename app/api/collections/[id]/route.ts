import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { getAddress, isAddress } from "viem";
import { isNftNetwork } from "@/lib/nfts";

export const GET = withAccess("collection", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
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
});

export const PATCH = withAccess("collection", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string; styleLock?: string; description?: unknown; externalUrl?: unknown;
    chainNetwork?: unknown; contractAddress?: unknown; sponsoredPerDay?: unknown; mintMinValueWei?: unknown;
  };

  const data: {
    name?: string; styleLock?: string | null; description?: string | null; externalUrl?: string | null;
    chainNetwork?: string | null; contractAddress?: string | null; sponsoredPerDay?: number; mintMinValueWei?: string | null;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("styleLock" in body) data.styleLock = body.styleLock || null;
  // Collection lore and link: both travel in every mint's metadata.
  if ("description" in body) {
    data.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }
  if ("externalUrl" in body) {
    const raw = typeof body.externalUrl === "string" ? body.externalUrl.trim() : "";
    if (raw && !raw.startsWith("https://")) {
      return NextResponse.json({ error: "External link must start with https://" }, { status: 400 });
    }
    data.externalUrl = raw || null;
  }

  // Mint-funded claims. Each field is validated here rather than trusted,
  // because the claim route reads them to decide what counts as a paid mint.
  if ("chainNetwork" in body) {
    if (body.chainNetwork !== null && !isNftNetwork(body.chainNetwork)) return NextResponse.json({ error: "Unsupported network." }, { status: 400 });
    data.chainNetwork = body.chainNetwork;
  }
  if ("contractAddress" in body) {
    if (body.contractAddress !== null && (typeof body.contractAddress !== "string" || !isAddress(body.contractAddress))) {
      return NextResponse.json({ error: "That isn't a contract address." }, { status: 400 });
    }
    data.contractAddress = body.contractAddress === null ? null : getAddress(body.contractAddress);
  }
  if ("sponsoredPerDay" in body) {
    const n = body.sponsoredPerDay;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 10_000) return NextResponse.json({ error: "Sponsored generations per day must be 0–10000." }, { status: 400 });
    data.sponsoredPerDay = n;
  }
  if ("mintMinValueWei" in body) {
    const v = body.mintMinValueWei;
    if (v !== null && (typeof v !== "string" || !/^\d{1,40}$/.test(v))) return NextResponse.json({ error: "Minimum mint value must be a whole number of wei." }, { status: 400 });
    data.mintMinValueWei = v;
  }

  const collection = await prisma.collection.update({ where: { id }, data });
  return NextResponse.json(collection);
});
