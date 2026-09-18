# Look at what's sitting in VeraGen:

    - A self-hostable video studio (prompt → generate → timeline → export) and a deterministic trait-based minting system for any collection (BittyDragons), decoupled enough from Higgsfield that swapping the backend is a small edit to one file (lib/higgsfield.ts), not a rewrite — the DB schema, timeline, character system, and mint logic don't care which API generates the pixels. That's the part that was never really about the bounty. The bounty was the excuse to build it; BittyDragons generating a unique, provably-not-rerolled Bitty per mint is the actual reason it's worth having.

> What I have is a real tool for my own project and possibly others' (gated behind a wallet, paid for branding white label, I have that in sigilnet somewhere), built for free, that happens to also be swappable to whatever video-gen API I'd actually want to pay for later (or none, if mock mode's placeholder-clip idea points at a cheaper self-hosted model instead).

## Bittyverse/BittyDragons

Built the actual thing at /collections — a Collection (BittyDragons) holds trait categories (Element, Wings, Aura, whatever) with weighted options, and hitting "Generate next mint" deterministically derives that mint number's exact trait combination from a seed, so mint #42 always produces the same Bitty — no silent re-roll into rarer traits after the fact, which actual numbered drops need.

The collection's style lock keeps every mint in the same art style (docs/BITTY*, packages/bittyverse/*, packages/art-engine/sets/bittydragons_production). One open question worth deciding, not defaulting:
 - right now each mint generates a short video clip (reusing all the existing plumbing)
 - That's the product I want (a "living" Bitty), I do want a still image per mint, THATS the NFT character identity. That's what mints when a person mints from the collection.
 - So I do want a still image per mint which could/should/would be the art-engine with the VeraGen (using internal models where possible - ./vera, ./packages/vera-torch)


**`packages/bittyverse`** (SigilNet, `2fa0e474`):
    - extracted the weighted-roll math `resolveMaturation` already depended on into a standalone, collection-agnostic `src/trait-roll.ts` (`rollFrom` + `pickWeighted` + `resolveWeightedTraits`), with `maturation-resolver.ts` now importing it instead of keeping a private copy — same 12 tests pass unchanged, plus a new test file.
    - Also generalized `schemas/bitty-collection-spec.v1.ts` so the base contract isn't hardcoded to `collectionId: "bittydragons"` (BittyDragons' exact shape kept as its own named type, nothing dropped).

**`veragen`** (`0fa8eaa`):
    - renamed the instant-mint tool to "Mint Lab" everywhere with an explicit disclaimer, since Ir own `BITTYVERSE_ENTRY_AND_MINT.md` says outright *"a Bitty is not minted from a button"* — that doc directly conflicted with what I'd built, so I didn't want it quietly wearing the BittyDragons name.
    - `lib/traits.ts` now mirrors bittyverse's `trait-roll.ts` byte-for-byte in algorithm (documented as a deliberate, hand-maintained copy since veragen can't `workspace:*` import across repos), and minting can now fold a wallet address / tx hash into the seed — persisted for provenance, but per ADR-009 that's seed *input*, not identity; the Mint's own id stays authoritative.


That means: saved, reusable characters (so someone builds "their" recurring character instead of re-uploading a photo every time) plus a style lock per project (so every clip in that project shares one visual identity — the "world" cohesion you're after) without the overhead of a full brand-kit/multi-tenant system nobody will discover in 7 days. It also leans directly into the exact thing Higgsfield bragged about (face-input consistency) — smart positioning for the QT itself.

design rule in so many words: "A Bitty is not minted from a button." The real lifecycle is enroll → care (weighted, not deterministic) → hatchling → ready → mint. Minting is the last step, gated on attested care history (signed by an issuer, not browser state), and — this is explicit — "A mint determined by spend. Money may buy an egg; it must not buy an outcome." What I built is exactly the pattern this doc calls out as the thing to avoid: a button that instantly rolls random weighted traits. It's a fun generic mint-lab tool, but it is not BittyDragons canon, and I shouldn't let it wear that name.

Collection-agnostic — there's a formal contract for this: ADR-009 defines BittyCollectionSpec (visual/trait/rarity/rendering) as deliberately separate from BittyEconomySpec (economic rules), so a collection can't accidentally redefine economic law or vice versa. schemas/bitty-collection-spec.v1.ts is the actual shape — right now it's hardcoded to collectionId: "bittydragons" as a literal type instead of a generic parameter, which is a small, real fix toward what you're asking.

Wallet/signature/tx-hash as seed — partially right, partially a trap. The doctrine (ADR-009) is explicit: "The persistent economic subject is a canonical Bitty characterId, not an owner wallet." Wallets authorize; they aren't the identity. But folding a signature or tx hash into the seed as attested evidence — so the outcome is reproducible from that evidence and can't be silently re-rolled — is exactly the pattern resolveMaturation already uses ("reproducible, never random... a pure function of the attested event root"). So: yes to wallet/tx-hash as seed input, no to wallet-as-identity.

Library, not serverless, Next/React lib+app — agreed, and packages/bittyverse is the reference pattern to copy exactly: src/ (framework-free lib) + app/ (thin Next.js consumer), workspace-linked. Not a new invention — literally the existing convention.

Three things I flagged in code/docs rather than building blind:

1. **Repo topology** — mirroring the module by hand works now but will drift. If I ever want veragen actually inside the SigilNet workspace (or want `@sigilnet/bittyverse` published), that's a real call worth making deliberately, not something I should decide silently.
2. **Video-matches-the-Bitty** — I're right that it's currently unenforced: mint video generates from text only, no image reference, so nothing stops "one bitty and a video of another." Real fix is compositing the rolled traits into a still first (art-engine, or a lighter compositor) and feeding *that* to Higgsfield as the face reference. Not built yet.
3. **TCG/Threadbound cards** — Ir "buy an outcome" clarification is a genuinely useful carve-out (items into a Bitty's ERC-6551 account are fair game to purchase; the dragon's own traits aren't), and Mint Lab's mechanism is the right primitive for that too — just flagged in SCOPE.md as a distinct future use, not built as its own thing yet.

Didn't touch the art-engine sourcing question (mediaforge/slicing tools for the reference sheets) or the structural material-forge pipeline — those are still open, exactly as I left them.

---


# Grok:

## VeraGen

Created today. Already a real app: Next 15 / React 19 / Prisma / Remotion / better-auth / S3 / Higgsfield BYOK. That speed is the strongest signal on the account. The scope document is unusually honest (mock mode, Remotion license, serverless render limits, “video may not match the traits”). Keep that voice.

### What is good

- **The product bet is correct.** Do not reimplement models. Wrap Higgsfield. Character + style lock is the reason anyone comes back. Brand kit / templates / aspect / captions are the reason a clip looks like a post.
- **Duration math is treated as a contract.** Shared `durationUtils` across preview, metadata, and export is the right instinct. The fade-bounded-by-half-adjacent-clip fix belongs there.
- **BYOK is the right billing shape** for a prototype: AES-GCM cookie, no operator key fallback, no silent mock once a key exists. Documented in `BYOK.md` without pretending generation is verified.
- **Mint Lab is correctly labeled a playground.** The ADR-009 / “care-gated identity vs purchasable item” distinction is the only reason this repo does not immediately contradict the rest of Ir stack.
- EXIF strip via `sharp`, origin check in `withAccess`, generic 503s that do not leak provider errors — those are adult choices.

### What is actually broken

**Auth is a costume.** `better-auth` is wired. `User` / `Session` / `Account` exist. `lib/access.ts` and `lib/ownership.ts` exist and they are well written. Then:

```ts
// app/api/projects/route.ts
export async function POST() {
  const project = await prisma.project.create({ data: {} });
  return NextResponse.json({ id: project.id });
}
```

`ownerFilter` requires `ownerId`. The Prisma `Project` and `Collection` models do not have `ownerId`. So the wrapper cannot be attached without a migration, and none of the routes use it. Anyone who can hit the host can list collections, mint, mutate a project by ID, and kick a synchronous Remotion export.

That is fine for a laptop demo. It is not fine the moment this repo is pointed at a public URL. Public source ≠ publicly writable instance. I already wrote that. The code has not caught up.

**README is lying.** It says `0.3.0 (published)` and “prebuilt-native distribution + deterministic fallback.” `package.json` is `0.1.0` / `"private": true`. There is no native binding in this repo. That paragraph was pasted from another package (`fft-ts` / qwave style). Fix it before anyone else clones.

**Two products, one process.** Studio (timeline, characters, export) and Mint Lab (trait vocab, seeded rolls, video-per-mint) share a database and a Higgsfield adapter and almost nothing else. Linking them “later” is how I get a Bitty video that does not look like the Bitty. I already named that failure mode. The fix I described — composite the still first, pass that as the image reference — is the actual next feature if Mint Lab stays. If Mint Lab is only a sketchpad for SigilNet, it should not be on the same deploy as the bounty studio.

**Export will be the first production outage.** Synchronous `renderMedia`, no concurrency gate, no queue, 15s cap in config only. Vercel cannot run this honestly. Self-host the renderer or cut export from the hosted demo and ship preview-only until the worker exists.

**Naming debris:** Loopface in localStorage key and dummy DB name, “Bittyverse” in comments, `mediaAsset` in `ownership.ts` with no such model. Cheap to clean. Expensive if a stranger is trying to decide whether this is a face-swap toy or a studio.

### What I would do this week, in order

1. Reconcile README / version / leftover Loopface strings.
2. Decide the hosted shape: **local-only** or **auth-required**. If hosted, add `ownerId`, migrate, wrap every route in `withAccess`, stop listing all collections.
3. One real Higgsfield generation and one real MP4 export on hardware I control. Until those two receipts exist, do not call it a studio in public.
4. Either delete Mint Lab from the deploy or implement a toggle for still, video, and ultimately still-then-video.
5. Stop copying SigilNet primitives by hand. Publish `@gsknnft/weighted-roll` or move VeraGen into the workspace.

## How this connects to the earlier conversation

VeraGen is the thing I  build when I cannot launch the protocol as the product.
Character + style lock + receipts of generation is closer to “the meme that remembers” than another token ticker.
Mint Lab pointed at a Bitty’s *own* traits would violate the rule I already wrote (we can keep that as a bittyverse lane/and make an agnostic lane). I dont want to delete anything, expand. There's always a plan for something.
Pointed at items, cards, or studio templates, it is fine.
