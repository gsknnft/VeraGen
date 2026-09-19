/**
 * Who may generate mint videos while identity is being proven.
 *
 * Mint generation stays on the operator's own collections (Bittyverse /
 * BittyDragons) until image-conditioned identity holds there. If a character
 * drifts on dragons we control, it will drift on everyone's, and opening it
 * to other collections first would put that failure in front of them.
 *
 *   MINT_LAB_USERS=you@example.com,other@example.com
 *
 * Empty or unset means NOBODY — the gate fails closed, so a deploy that
 * forgets the variable does not quietly open minting to every account.
 */
export function mintLabAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.MINT_LAB_USERS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

type LayerCheck = { name: string; options: { label: string; layerImageUrl: string | null }[] };

/**
 * Every option that could be rolled must have art. Checked before anything is
 * spent: a roll that lands on an art-less option has no identity to animate,
 * and falling back to the prompt is exactly the drift this replaces.
 */
export function missingLayers(categories: readonly LayerCheck[]): string[] {
  return categories.flatMap(c => c.options.filter(o => !o.layerImageUrl).map(o => `${c.name}: ${o.label}`));
}

/**
 * Image-to-video is told to MOVE the character, not describe it. The traits
 * stay in the prompt as grounding, but the image carries the identity.
 */
export function mintMotionPrompt(traitFragments: readonly string[], styleLock: string | null): string {
  const traits = traitFragments.filter(Boolean).join(", ");
  return [
    "Bring this exact character to life. Keep its appearance, colors and proportions unchanged",
    traits ? `(${traits})` : "",
    styleLock ? `. ${styleLock}` : "",
  ].join(" ").replace(/\s+\./g, ".").replace(/\s+/g, " ").trim();
}
