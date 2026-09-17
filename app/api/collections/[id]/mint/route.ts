import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitVideoJob } from "@/lib/higgsfield";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickTraits } from "@/lib/traits";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await getHiggsfieldCredentials())) return NextResponse.json({ error: "Connect your own Higgsfield account. Generation uses your API credits." }, { status: 401 });
  const { id: collectionId } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: { traitCategories: { include: { options: true } } },
  });
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  if (collection.traitCategories.length === 0) {
    return NextResponse.json(
      { error: "Add at least one trait category before minting" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    mintNumber?: number;
    walletAddress?: string;
    txHash?: string;
  };
  let mintNumber = body.mintNumber;
  if (!mintNumber) {
    const last = await prisma.mint.findFirst({
      where: { collectionId },
      orderBy: { mintNumber: "desc" },
    });
    mintNumber = (last?.mintNumber ?? 0) + 1;
  }

  const existing = await prisma.mint.findUnique({
    where: { collectionId_mintNumber: { collectionId, mintNumber } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Mint #${mintNumber} already exists in this collection` },
      { status: 409 }
    );
  }

  const walletAddress = body.walletAddress?.trim() || undefined;
  const txHash = body.txHash?.trim() || undefined;

  // Deterministic: this exact seed always yields this exact trait
  // combination — re-running it can't silently reroll rarity. Folding in a
  // wallet address / tx hash (when supplied) ties the roll to that specific
  // mint action instead of just a sequence number, so the platform can't
  // have picked a different combination for the same slot. This is seed
  // *input*, not identity — the Mint's own id/mintNumber is what's
  // authoritative, matching bittyverse's "persistent subject is a
  // characterId, not a wallet" rule.
  const seed = [collectionId, mintNumber, walletAddress, txHash].filter(Boolean).join(":");
  const picks = pickTraits(
    collection.traitCategories.map((c) => ({
      id: c.id,
      options: c.options.map((o) => ({ id: o.id, weight: o.weight })),
    })),
    seed
  );

  const chosenOptions = Object.values(picks)
    .map((optionId) =>
      collection.traitCategories.flatMap((c) => c.options).find((o) => o.id === optionId)
    )
    .filter((o): o is NonNullable<typeof o> => Boolean(o));

  const traitPrompt = chosenOptions.map((o) => o.promptFragment).join(", ");
  const prompt = collection.styleLock ? `${traitPrompt}. ${collection.styleLock}` : traitPrompt;

  try {
    const { requestId } = await submitVideoJob({ prompt });
    const mint = await prisma.mint.create({
      data: {
        collectionId,
        mintNumber,
        seed,
        walletAddress,
        txHash,
        prompt,
        status: "processing",
        higgsfieldRequestId: requestId,
        traits: {
          create: chosenOptions.map((o) => ({ traitOptionId: o.id })),
        },
      },
      include: { traits: { include: { traitOption: true } } },
    });
    return NextResponse.json(mint);
  } catch (err) {
    console.error("Mint generation failed to start", err);
    return NextResponse.json(
      { error: "Generation failed to start. Try again shortly." },
      { status: 502 }
    );
  }
}
