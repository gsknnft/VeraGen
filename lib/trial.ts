import { consumeQuota, quotaUsed, refundQuota } from "./quota";

/**
 * Free trial generations, paid for by the operator.
 *
 * BYOK is still the model: after the trial, users connect their own
 * Higgsfield account. The trial exists because asking a first-time visitor
 * to go fund an API key before they have seen one generation is a wall
 * almost nobody climbs.
 *
 * OFF unless all four are set. Nothing here can spend money by default:
 *   TRIAL_GENERATIONS_PER_USER   free generations per account, lifetime
 *   TRIAL_DAILY_LIMIT            free generations across ALL accounts per
 *                                24h window — the actual spending cap, since
 *                                OAuth accounts are cheap to create
 *   VERAGEN_TRIAL_HF_KEY_ID      the operator's Higgsfield key. Deliberately
 *   VERAGEN_TRIAL_HF_KEY_SECRET  not HF_API_KEY_*: BYOK.md promises those
 *                                legacy names are never read.
 *
 * Worst-case daily spend = TRIAL_DAILY_LIMIT × the provider's price for one
 * 5-second 720p clip.
 */

const LIFETIME_SECONDS = 10 * 365 * 24 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const userKey = (userId: string) => `trial:user:${userId}`;
const GLOBAL_KEY = "trial:global";

function positiveInt(value: string | undefined) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function trialConfig() {
  const perUser = positiveInt(process.env.TRIAL_GENERATIONS_PER_USER);
  const daily = positiveInt(process.env.TRIAL_DAILY_LIMIT);
  const hasKey = !!process.env.VERAGEN_TRIAL_HF_KEY_ID && !!process.env.VERAGEN_TRIAL_HF_KEY_SECRET;
  return { enabled: perUser > 0 && daily > 0 && hasKey, perUser, daily };
}

export type TrialReservation = "ok" | "off" | "used" | "paused";

/**
 * Take one trial slot, atomically, from both the user's allowance and the
 * global daily cap. Call only after every other check has passed, immediately
 * before the billable request — a typo must never cost someone their free
 * generation.
 */
export async function reserveTrial(userId: string): Promise<TrialReservation> {
  const { enabled, perUser, daily } = trialConfig();
  if (!enabled) return "off";
  if (!(await consumeQuota(userKey(userId), perUser, LIFETIME_SECONDS))) return "used";
  if (!(await consumeQuota(GLOBAL_KEY, daily, DAY_SECONDS))) {
    // The user did not get a generation, so they keep their slot.
    await refundQuota(userKey(userId));
    return "paused";
  }
  return "ok";
}

/**
 * Undo a reservation. `billable` says whether a request may have reached the
 * provider: if it might have, the operator may have been charged, so the
 * global slot stays spent even though the user gets theirs back.
 */
export async function releaseTrial(userId: string, { billable }: { billable: boolean }) {
  await refundQuota(userKey(userId));
  if (!billable) await refundQuota(GLOBAL_KEY);
}

/** Free generations this user has left, or 0 when the trial is off. */
export async function trialRemaining(userId: string) {
  const { enabled, perUser } = trialConfig();
  if (!enabled) return 0;
  return Math.max(0, perUser - (await quotaUsed(userKey(userId))));
}
