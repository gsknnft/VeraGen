import { prisma } from "./db";

/**
 * "Try it now": a new user gets a ready-made project of real example clips
 * to trim, brand and export — no key, no upload, no spend.
 *
 * The examples are clips the operator generated for real and published with
 * `pnpm starter:publish <projectId>`, then pointed at with STARTER_PROJECT_ID.
 * Each user's copy references the same shared media; nothing is duplicated
 * and nothing counts against the user's storage.
 *
 * Labelled as examples throughout (project name, clip label). The mock mode
 * this replaces passed stock footage off as the result of the user's prompt;
 * this never implies the user generated anything.
 */

const MEDIA_REF = /^\/api\/media\/([a-zA-Z0-9_-]+)$/;

async function loadSource() {
  const id = process.env.STARTER_PROJECT_ID;
  if (!id) return null;
  const source = await prisma.project.findUnique({
    where: { id },
    include: { clips: { where: { status: "completed", videoUrl: { not: null } }, orderBy: { order: "asc" } } },
  });
  if (!source || source.clips.length === 0) return null;

  // Every referenced asset must be published. If one is not, users would get
  // a project full of broken clips, so refuse and tell the operator why.
  const refs = source.clips.map(c => MEDIA_REF.exec(c.videoUrl ?? "")?.[1]);
  const logo = source.brandLogoUrl ? MEDIA_REF.exec(source.brandLogoUrl)?.[1] : undefined;
  if (refs.some(r => !r)) {
    console.warn("[veragen] Starter project has clips outside private media; re-run pnpm starter:publish.");
    return null;
  }
  const shared = await prisma.mediaAsset.count({ where: { id: { in: refs as string[] }, shared: true } });
  if (shared !== new Set(refs).size) {
    console.warn("[veragen] Starter project has unpublished clips; run pnpm starter:publish " + id);
    return null;
  }
  const logoShared = logo ? (await prisma.mediaAsset.count({ where: { id: logo, shared: true } })) === 1 : false;
  return { source, logoShared };
}

export async function starterAvailable() {
  return (await loadSource()) !== null;
}

export async function createStarterProject(userId: string) {
  const loaded = await loadSource();
  if (!loaded) return null;
  const { source, logoShared } = loaded;
  return prisma.project.create({
    data: {
      ownerId: userId,
      name: `Example — ${source.name}`,
      styleLock: source.styleLock,
      ctaText: source.ctaText,
      template: source.template,
      brandLogoUrl: logoShared ? source.brandLogoUrl : null,
      clips: {
        create: source.clips.map(c => ({
          order: c.order,
          prompt: c.prompt,
          vibe: "example",
          status: "completed" as const,
          videoUrl: c.videoUrl,
          durationSeconds: c.durationSeconds,
          trimStart: c.trimStart,
          trimEnd: c.trimEnd,
          transitionIn: c.transitionIn,
          caption: c.caption,
        })),
      },
    },
    select: { id: true },
  });
}
