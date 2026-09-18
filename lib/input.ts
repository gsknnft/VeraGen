export function validJsonInput(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const limits: Record<string, number> = { name: 120, styleLock: 4000, ctaText: 240, caption: 240, label: 120, promptFragment: 2000, walletAddress: 256, txHash: 256, template: 30, transitionIn: 20, aspect: 10, id: 512, secret: 512 };
  for (const [key, value] of Object.entries(body)) {
    if (key in limits && value !== null && (typeof value !== "string" || value.length > limits[key])) return false;
    if (["order", "mintNumber", "weight"].includes(key) && (typeof value !== "number" || !Number.isSafeInteger(value) || value < (key === "order" ? 0 : 1) || value > 1000000)) return false;
    if (["trimStart", "trimEnd"].includes(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 600)) return false;
  }
  return true;
}
