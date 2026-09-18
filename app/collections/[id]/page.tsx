import { requireUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/higgsfield";
import { CollectionClient } from "@/components/CollectionClient";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const collection = await prisma.collection.findFirst({
    where: { id, ownerId: user.id },
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

  if (!collection) notFound();

  return (
    <main className="studio-main">
      <NavBar active="collections" />
      <h1>{collection.name}</h1>
      <p className="mock-banner">
        Mint Lab — a playground, not a canon product surface. A real drop's
        mint lifecycle is care- and attestation-gated elsewhere; this is
        instant and for prototyping only.
      </p>
      {(await isMockMode()) && (
        <p className="mock-banner">Connect your own Higgsfield account to generate. Your API credits pay for generation; VeraGen supplies no credits.</p>
      )}
      <CollectionClient
        collectionId={collection.id}
        initialName={collection.name}
        initialStyleLock={collection.styleLock}
        initialCategories={collection.traitCategories}
        initialMints={collection.mints}
      />
    </main>
  );
}
