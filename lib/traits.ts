// Deterministic, weighted trait selection — mirrors the canonical
// implementation in SigilNet's packages/weighted-roll (@gsknnft/weighted-roll,
// the one-shot half: rollFrom + pickWeighted + resolveWeightedTraits) rather
// than inventing a second algorithm. That package exists specifically so
// this logic has exactly one home instead of being copy-pasted per
// consumer — it's what packages/art-engine's DNA generation and
// packages/bittyverse's maturation resolver both depend on. loopface is a
// standalone repo outside the SigilNet pnpm workspace, so it can't
// `workspace:*`-depend on it directly; this is a deliberate copy, not a
// drift-prone reinvention. If loopface ever moves into the SigilNet
// monorepo (or @gsknnft/weighted-roll gets published), this file should be
// deleted in favor of the real import — keep the two in sync until then.
//
// The same seed must always resolve to the same trait combination —
// otherwise a mint could be silently "re-rolled" into something rarer
// after the fact, which defeats the point of a numbered, provable drop.

/** A uniform value in [0, 1) derived from `seed`. FNV-1a; reproducibility, not cryptographic unpredictability. */
export function rollFrom(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash / 0x100000000;
}

export interface TraitOptionInput {
  id: string;
  weight: number;
}

export function pickWeighted<T extends { weight: number }>(entries: readonly T[], roll: number): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = roll * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) return entry;
  }
  return entries[entries.length - 1]!;
}

export interface TraitCategoryInput {
  id: string;
  options: TraitOptionInput[];
}

// Returns categoryId -> chosen optionId. Categories with no options are
// skipped (nothing to pick). Each category gets its own sub-seed so
// reweighting or adding one category never perturbs another's outcome
// under the same top-level seed.
export function pickTraits(
  categories: TraitCategoryInput[],
  seed: string
): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const category of categories) {
    if (category.options.length === 0) continue;
    const roll = rollFrom(`${seed}:${category.id}`);
    picks[category.id] = pickWeighted(category.options, roll).id;
  }
  return picks;
}
