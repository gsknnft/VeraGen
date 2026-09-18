/**
 * Every kind here must be a real Prisma model — `withAccess` indexes
 * `prisma[kind]` directly, so a phantom kind is a runtime crash rather than a
 * type error. `mediaAsset` was listed and has no model; removed rather than
 * left as a trap.
 *
 * `Project.ownerId` and `Collection.ownerId` are nullable while existing rows
 * are backfilled. A null owner matches no session, so an un-backfilled row is
 * invisible rather than public — the safe direction to fail.
 */
export type ResourceKind = "project" | "clip" | "character" | "collection" | "traitCategory" | "traitOption" | "mint" | "export" | "mediaAsset";
// Each child is authorized through its actual parent relation, never a caller-supplied parent ID.
export function ownerFilter(kind: ResourceKind, userId: string): Record<string, unknown> {
  if (!userId) throw new Error("Missing owner");
  switch (kind) {
    case "project": case "collection": case "mediaAsset": return { ownerId: userId };
    case "clip": case "character": case "export": return { project: { ownerId: userId } };
    case "traitCategory": case "mint": return { collection: { ownerId: userId } };
    case "traitOption": return { category: { collection: { ownerId: userId } } };
  }
}
