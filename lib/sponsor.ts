import { consumeQuota, refundQuota } from "./quota";

/**
 * Sponsored generation for verified mints: the holder didn't bring a key,
 * the mint paid, and the sponsor's key covers the generation.
 *
 * While claims are limited to the operator's own collections (MINT_LAB_USERS),
 * the sponsor key IS the operator key (VERAGEN_TRIAL_HF_KEY_*), and each
 * collection's `sponsoredPerDay` caps what its holders can draw from it in a
 * 24h window. Same atomic quota SQL and refund rules as the free trial.
 *
 * Collections bringing their own sponsor key (whitelabel) comes later: it
 * means storing a third party's credential server-side, encrypted at rest,
 * which BYOK deliberately never does today.
 */
const key = (collectionId: string) => `sponsor:collection:${collectionId}`;

export function sponsorKeyConfigured() {
  return !!process.env.VERAGEN_TRIAL_HF_KEY_ID && !!process.env.VERAGEN_TRIAL_HF_KEY_SECRET;
}

export async function reserveSponsored(collectionId: string, perDay: number): Promise<boolean> {
  if (!Number.isSafeInteger(perDay) || perDay <= 0 || !sponsorKeyConfigured()) return false;
  return consumeQuota(key(collectionId), perDay, 24 * 60 * 60);
}

/** Only refunded when no billable request could have reached the provider. */
export async function releaseSponsored(collectionId: string, { billable }: { billable: boolean }) {
  if (!billable) await refundQuota(key(collectionId));
}
