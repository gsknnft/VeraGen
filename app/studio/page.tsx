import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { NavBar } from "@/components/NavBar";
import { StudioLibrary } from "@/components/StudioLibrary";
import { starterAvailable } from "@/lib/starter";
export const dynamic = "force-dynamic";
export default async function StudioEntry() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true, updatedAt: true } });
  return <main className="studio-main"><NavBar active="studio" /><p className="eyebrow">FROM IDEA TO READY TO POST</p><h1>Your social video studio.</h1><p>Bring your image, character, NFT artwork, or prompt. Generate a shot, add your brand, and export an MP4.</p><StudioLibrary projects={projects.map(p => ({ ...p, updatedAt: p.updatedAt.toISOString() }))} starterAvailable={await starterAvailable()} /></main>;
}

