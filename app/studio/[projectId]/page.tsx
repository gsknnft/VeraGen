import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/higgsfield";
import { StudioClient } from "@/components/StudioClient";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      clips: { orderBy: { order: "asc" } },
      characters: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) notFound();

  return (
    <main className="studio-main">
      <NavBar active="studio" />
      <h1>{project.name || "Untitled project"}</h1>
      {(await isMockMode()) && (
        <p className="mock-banner">Connect your own Higgsfield account to generate. Your API credits pay for generation; VeraGen supplies no credits.</p>
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
      />
    </main>
  );
}
