import { requireUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/higgsfield";
import { trialRemaining } from "@/lib/trial";
import { StudioClient } from "@/components/StudioClient";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    include: {
      clips: { orderBy: { order: "asc" } },
      characters: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) notFound();

  const connected = !(await isMockMode());
  const freeLeft = connected ? 0 : await trialRemaining(user.id);

  return (
    <main className="studio-main">
      <NavBar active="studio" />
      <h1>{project.name || "Untitled project"}</h1>
      {!connected && (
        <p className="mock-banner">
          {freeLeft > 0
            ? `You have ${freeLeft} free generation${freeLeft === 1 ? "" : "s"} on us. After that, connect your own Higgsfield account or upload your own clips.`
            : "Connect your own Higgsfield account to generate, or upload your own clips. Generation uses your Higgsfield API credits."}
        </p>
      )}
      <StudioClient
        projectId={project.id}
        projectName={project.name}
        initialClips={project.clips}
        initialCharacters={project.characters}
        initialStyleLock={project.styleLock}
        initialBrandLogoUrl={project.brandLogoUrl}
        initialCtaText={project.ctaText}
        initialTemplate={project.template}
        generation={connected ? "own" : freeLeft > 0 ? { free: freeLeft } : "none"}
      />
    </main>
  );
}
