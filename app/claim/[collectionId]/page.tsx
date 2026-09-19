import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { NavBar } from "@/components/NavBar";
import { ClaimClient } from "@/components/ClaimClient";
import { mintLabAllowed } from "@/lib/mint-lab";

export const dynamic = "force-dynamic";

/**
 * The holder's page for a sponsored collection: link the minting wallet,
 * paste the mint transaction, watch the token come to life. Only what a
 * holder needs is loaded — never the collection's traits, layers or owner.
 */
export default async function ClaimPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const user = await requireUser();
  const { collectionId } = await params;
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, name: true, sponsoredPerDay: true, contractAddress: true, chainNetwork: true, owner: { select: { email: true } } },
  });
  if (!collection || collection.sponsoredPerDay <= 0 || !collection.contractAddress || !collection.chainNetwork || !mintLabAllowed(collection.owner.email)) notFound();

  const [wallets, claims] = await Promise.all([
    prisma.linkedWallet.findMany({ where: { userId: user.id }, select: { address: true } }),
    prisma.mint.findMany({
      where: { collectionId, claimedById: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, mintNumber: true, status: true, imageUrl: true, videoUrl: true, errorMessage: true },
    }),
  ]);

  return (
    <main className="studio-main">
      <NavBar active="studio" />
      <p className="eyebrow">YOUR MINT, IN MOTION</p>
      <h1>{collection.name}</h1>
      <p>Minted on {collection.chainNetwork}? Your mint includes a video of your token. Link the wallet you minted with and paste your mint transaction.</p>
      <ClaimClient
        collectionId={collection.id}
        network={collection.chainNetwork}
        contract={collection.contractAddress}
        initialWallets={wallets.map(w => w.address)}
        initialClaims={claims}
      />
    </main>
  );
}
