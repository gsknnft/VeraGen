import { requireUser } from "@/lib/session";
import { NavBar } from "@/components/NavBar";
import { MakeWizard } from "@/components/MakeWizard";
import { demoCollections } from "@/lib/demo-collections";
import { isMockMode } from "@/lib/higgsfield";
import { trialRemaining } from "@/lib/trial";
import { prisma } from "@/lib/db";
import { mintLabAllowed } from "@/lib/mint-lab";
import type { GenerationMode } from "@/components/GeneratePanel";

export const dynamic = "force-dynamic";

export default async function MakePage() {
  const user = await requireUser();
  const demos = demoCollections();

  const connected = !(await isMockMode());
  const freeLeft = connected ? 0 : await trialRemaining(user.id);
  const generation: GenerationMode = connected ? "own" : freeLeft > 0 ? { free: freeLeft } : "none";

  const [claimedMints, claimable] = await Promise.all([
    prisma.mint.findMany({
      where: { claimedById: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        mintNumber: true,
        status: true,
        imageUrl: true,
        videoUrl: true,
        collection: { select: { name: true } },
      },
    }),
    prisma.collection.findMany({
      where: {
        sponsoredPerDay: { gt: 0 },
        contractAddress: { not: null },
        chainNetwork: { not: null },
      },
      take: 20,
      select: {
        id: true,
        name: true,
        owner: { select: { email: true } },
      },
    }),
  ]);

  const claimLinks = claimable
    .filter((c) => mintLabAllowed(c.owner.email))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="studio-main">
      <NavBar active="make" />
      <p className="eyebrow">MAKE IT MOVE</p>
      <h1>Three ways to a shareable clip.</h1>
      <p>
        Hold a token, upload your own footage, or generate — every path ends on a public link that unfurls on Discord and X.
        Full editing stays in Studio.
      </p>
      <MakeWizard
        demoCollections={demos}
        generation={generation}
        claimedMints={claimedMints.map((m) => ({
          id: m.id,
          mintNumber: m.mintNumber,
          status: m.status as "processing" | "completed" | "failed",
          imageUrl: m.imageUrl,
          videoUrl: m.videoUrl,
          collectionName: m.collection.name,
        }))}
        claimLinks={claimLinks}
      />
    </main>
  );
}
