// In-memory per-IP daily cap. Deliberately not Redis/Upstash — this is a
// single Vercel instance serving a 7-day demo, not a scaled service. If
// traffic actually shows up, swap this for Upstash before it matters.

const DAILY_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const hits = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}
