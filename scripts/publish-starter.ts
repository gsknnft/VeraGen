/**
 * Publish one of YOUR projects as the "Try it now" example project.
 *
 *   pnpm starter:publish <projectId>             mark its clips (and logo) shared
 *   pnpm starter:publish <projectId> --unpublish revoke sharing
 *
 * Then set STARTER_PROJECT_ID=<projectId> and restart. Sharing is the only way
 * media becomes readable by other users, and this script is the only thing
 * that sets it — no route can. It refuses media that isn't owned by the
 * project's owner, so it can never publish someone else's files.
 *
 * Runs against whatever DATABASE_URL points at. For production, set it to the
 * production database explicitly for this one command.
 */
import { prisma } from "../lib/db";

const MEDIA_REF = /^\/api\/media\/([a-zA-Z0-9_-]+)$/;

async function main() {
  const [projectId, flag] = process.argv.slice(2);
  if (!projectId) throw new Error("Usage: pnpm starter:publish <projectId> [--unpublish]");
  const unpublish = flag === "--unpublish";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: { where: { status: "completed" }, orderBy: { order: "asc" } } },
  });
  if (!project) throw new Error(`No project ${projectId}.`);
  if (project.clips.length === 0) throw new Error("That project has no completed clips.");

  const ids = new Set<string>();
  for (const clip of project.clips) {
    const id = MEDIA_REF.exec(clip.videoUrl ?? "")?.[1];
    if (!id) throw new Error(`Clip "${clip.prompt}" is not in private media; it can't be published.`);
    ids.add(id);
  }
  const logo = project.brandLogoUrl ? MEDIA_REF.exec(project.brandLogoUrl)?.[1] : undefined;
  if (logo) ids.add(logo);

  const owned = await prisma.mediaAsset.count({ where: { id: { in: [...ids] }, ownerId: project.ownerId } });
  if (owned !== ids.size) throw new Error("Some of that project's media is not owned by the project's owner. Refusing.");

  const { count } = await prisma.mediaAsset.updateMany({ where: { id: { in: [...ids] } }, data: { shared: !unpublish } });
  console.log(`${unpublish ? "Unpublished" : "Published"} ${count} media file(s) from "${project.name}" (${project.clips.length} clip(s)${logo ? " + logo" : ""}).`);
  if (!unpublish) console.log(`\nNow set:\n  STARTER_PROJECT_ID=${project.id}\nand restart the app.`);
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
