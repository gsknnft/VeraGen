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
      <h1>loopface studio</h1>
      {isMockMode() && (
        <p className="mock-banner">
          Mock mode — no Higgsfield key configured, so generations use stock
          placeholder clips instead of real video. Set HF_API_KEY_ID /
          HF_API_KEY_SECRET to go live.
        </p>
      )}
      <StudioClient
        projectId={project.id}
        initialClips={project.clips}
        initialCharacters={project.characters}
        initialStyleLock={project.styleLock}
      />
    </main>
  );
}
