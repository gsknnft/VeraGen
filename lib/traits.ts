// Deterministic, weighted trait selection for generative collections.
// The same (collectionId, mintNumber) must always pick the same traits —
// otherwise a mint could be silently "re-rolled" into something rarer
// after the fact, which defeats the point of a numbered drop.

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG. Good enough for trait
// selection; not cryptographic, and doesn't need to be.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TraitOptionInput {
  id: string;
  weight: number;
}

export interface TraitCategoryInput {
  id: string;
  options: TraitOptionInput[];
}

// Returns categoryId -> chosen optionId. Categories with no options are
// skipped (nothing to pick).
export function pickTraits(
  categories: TraitCategoryInput[],
  seed: string
): Record<string, string> {
  const rand = mulberry32(hashSeed(seed));
  const picks: Record<string, string> = {};

  for (const category of categories) {
    if (category.options.length === 0) continue;
    const totalWeight = category.options.reduce((sum, o) => sum + o.weight, 0);
    let roll = rand() * totalWeight;
    let chosen = category.options[category.options.length - 1];
    for (const option of category.options) {
      roll -= option.weight;
      if (roll <= 0) {
        chosen = option;
        break;
      }
    }
    picks[category.id] = chosen.id;
  }

  return picks;
}
