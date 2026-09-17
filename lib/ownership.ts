export type ResourceKind = "project" | "clip" | "character" | "collection" | "traitCategory" | "traitOption" | "mint" | "mediaAsset";
// Each child is authorized through its actual parent relation, never a caller-supplied parent ID.
export function ownerFilter(kind: ResourceKind, userId: string): Record<string, unknown> {
  if (!userId) throw new Error("Missing owner");
  switch (kind) {
    case "project": case "collection": case "mediaAsset": return { ownerId: userId };
    case "clip": case "character": return { project: { ownerId: userId } };
    case "traitCategory": case "mint": return { collection: { ownerId: userId } };
    case "traitOption": return { category: { collection: { ownerId: userId } } };
  }
}
