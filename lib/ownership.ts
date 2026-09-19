/**
 * Every kind here must be a real Prisma model — `withAccess` indexes
 * `prisma[kind]` directly, so a phantom kind is a runtime crash rather than a
 * type error. Media records carry the same owner boundary as projects.
 *
 * `Project.ownerId` and `Collection.ownerId` are required (migration
 * `require_owner`), so every root resource has an owner and every child
 * inherits one through its parent relation.
 */
export type ResourceKind = "project" | "clip" | "character" | "collection" | "traitCategory" | "traitOption" | "mint" | "export" | "mediaAsset";
// Each child is authorized through its actual parent relation, never a caller-supplied parent ID.
export function ownerFilter(kind: ResourceKind, userId: string): Record<string, unknown> {
  if (!userId) throw new Error("Missing owner");
  switch (kind) {
    case "project": case "collection": case "mediaAsset": return { ownerId: userId };
    case "clip": case "character": case "export": return { project: { ownerId: userId } };
    case "traitCategory": return { collection: { ownerId: userId } };
    // A mint is reachable by its collection's owner, and by the holder who
    // claimed it with an on-chain mint proof (lib/mint-proof.ts).
    case "mint": return { OR: [{ collection: { ownerId: userId } }, { claimedById: userId }] };
    case "traitOption": return { category: { collection: { ownerId: userId } } };
  }
}
