export function validJsonInput(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const limits: Record<string, number> = { name: 120, styleLock: 4000, ctaText: 240, caption: 240, label: 120, promptFragment: 2000, lore: 2000, description: 4000, externalUrl: 512, kind: 20, walletAddress: 256, txHash: 256, template: 30, transitionIn: 20, aspect: 10, id: 512, secret: 512 };
  for (const [key, value] of Object.entries(body)) {
    // Object.hasOwn, not `in`: `"constructor" in limits` is true via the
    // prototype, which would compare a string's length against a function.
    if (Object.hasOwn(limits, key) && value !== null && (typeof value !== "string" || value.length > limits[key])) return false;
    if (["order", "mintNumber", "weight"].includes(key) && (typeof value !== "number" || !Number.isSafeInteger(value) || value < (key === "order" ? 0 : 1) || value > 1000000)) return false;
    if (["trimStart", "trimEnd"].includes(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 600)) return false;
  }
  return true;
}
