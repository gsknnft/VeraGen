import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StudioClient } from "@/components/StudioClient";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: { orderBy: { order: "asc" } } },
  });

  if (!project) notFound();

  return (
    <main className="studio-main">
      <h1>loopface studio</h1>
      <StudioClient projectId={project.id} initialClips={project.clips} />
    </main>
  );
}
