import { requireUser } from "@/lib/session";
import { NavBar } from "@/components/NavBar";
import { MakeWizard } from "@/components/MakeWizard";
import { demoCollections } from "@/lib/demo-collections";

export const dynamic = "force-dynamic";

export default async function MakePage() {
  await requireUser();
  const demos = demoCollections();
  return (
    <main className="studio-main">
      <NavBar active="make" />
      <p className="eyebrow">MAKE IT MOVE</p>
      <h1>Three steps to a shareable clip.</h1>
      <p>Link a wallet, pick any NFT you hold, choose a motion — get a public link that unfurls on Discord and X.</p>
      <MakeWizard demoCollections={demos} />
    </main>
  );
}
