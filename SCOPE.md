> Historical prototype scope. The user has since authorized a multi-user platform. Accounts, private ownership, browser export and direct clip imports supersede conflicting v1 assumptions below. See README.md and docs/PUBLIC_LAUNCH.md for the current implementation.

# VeraGen — scope

## The bet

Higgsfield opened its API and is reselling 50+ frontier video/image models
at cost. Nobody wins by re-implementing those models — Higgsfield already
did that work and will out-scale any clone on price and model breadth.
The defensible angle is a **product built on top of their API**: a small,
opinionated video studio — prompt in, clip out, arrange clips on a
timeline, export a finished video — with none of the model-picker /
credits-dashboard baggage of a general-purpose tool.

## What it is

A browser-based video studio, single project per session (no accounts in
v1):

1. **Generate** — write a prompt (or start from a vibe preset that
   fills the prompt box), attach a face photo or pick a saved character,
   hit "Add clip." Higgsfield renders it; it lands in the clip bin.
2. **Arrange** — drag clips into order on the timeline, trim each one's
   in/out points, choose a hard cut or crossfade into the next clip.
3. **Preview** — the arrangement plays live, in the browser, as you edit
   it — not a static list of separate video files.
4. **Export** — render the arranged, trimmed, transitioned sequence into
   one downloadable MP4.

**Characters and the style lock** are what turn "a demo" into "a world":

- A **Character** (`prisma/schema.prisma` → `Character`) is a saved face
  reference — name + reference photo — scoped to a project. Pick one in
  the generate panel instead of re-uploading a photo every time, and the
  same face stays consistent across every clip that uses it. This is
  the single highest-leverage feature for repeat use: a one-off face
  swap is a novelty tried once; a character you can keep generating new
  content with is a reason to come back.
- A project's **style lock** (free text, e.g. "shot on 35mm,
  teal-and-orange grade, neon rim light") gets silently appended to
  every clip's prompt generated in that project. It's what makes clips
  generated hours apart, with different prompts, still read as one
  world instead of unrelated outputs — the "collection" cohesion,
  without building a separate multi-project brand-kit system nobody
  would discover in a 7-day window.

Non-goals for v1: accounts/login, characters/style-locks shared *across*
projects (a project is the current unit of "world"; promoting Character
to a cross-project entity is natural phase-2 once one project's version
is proven), multi-project management UI, audio tracks, multi-track
compositing (picture-in-picture, layered video) — single video track
only.

## Brand kit, templates, multi-aspect export, captions

The business-facing layer — what turns an edit into something that reads
as a real post instead of a demo, all as Remotion sequences wrapped
around the existing clip timeline, no new services:

- **Brand kit** (`Project.brandLogoUrl` / `ctaText` / `template`) — a
  logo uploaded once (`POST /api/projects/[id]/brand-logo`, stripped and
  normalized through `sharp` same as any other image) shows as a small
  corner watermark for the whole video (`remotion/BrandWatermark.tsx`),
  and an end-card CTA line (`remotion/TitleCard.tsx`, reused for both
  intro and outro with different props) closes it out.
- **Templates** (`BrandTemplate`: `none` / `teaser` / `productReveal` /
  `announcement`) decide which cards wrap the clips, not the pacing of
  the clips themselves (that's still the user's own trim/transition
  choices): `none` adds nothing, `teaser` adds only a CTA outro,
  `productReveal` adds a logo intro + CTA outro, `announcement` adds a
  headline intro (the project's own name) + CTA outro.
  `remotion/durationUtils.ts`'s `introFrames`/`outroFrames` are the only
  place template → card-presence logic lives, and `Root.tsx`'s
  `calculateMetadata`, `PreviewPlayer`, and the export route all compute
  total duration through the same `totalDurationInFramesWithBrand` so
  none of the three can silently disagree on how long the video actually
  is — the same discipline the crossfade math already had.
- **Multi-aspect export** — the editor/preview always works in 9:16;
  export offers `9:16` / `1:1` / `16:9` (`ASPECTS` in durationUtils.ts),
  resolved through `Root.tsx`'s `calculateMetadata` returning a
  `width`/`height` matching the requested aspect. Every clip renders
  through `object-fit: cover` inside an `AbsoluteFill`, so re-exporting at
  a different aspect crops instead of stretching or letterboxing — no
  re-editing needed per platform.
- **Captions** (`Clip.caption`, optional per clip) — a lower-third text
  overlay burned into that clip's segment, both in the live preview and
  the final export. Deliberately not a subtitle track or auto-transcription
  — one line, whatever the user types, same mechanism a title card uses.
- **Not built/verified**: this sandbox's network policy blocks Remotion's
  own headless-Chromium download (same wall hit and documented earlier
  building the BittyDragons placeholder clips), so none of this could be
  render-verified end-to-end here — typechecks and builds clean, and the
  duration arithmetic (`Series` children summing to exactly what
  `calculateMetadata` declares) was checked by hand, but the first real
  export attempt is the actual test.

## No key? Bring your own clips

Mock mode is gone: it returned stock sample clips, which made the product look like it worked when no generation had happened. Generation now requires the user's own funded Higgsfield key (see BYOK.md) and never falls back to operator billing or sample footage.

Someone without a key is not locked out. **Upload your own clip** (`components/UploadClip.tsx`) puts their own MP4/MOV on the timeline, so the editor, brand kit and browser export all work from the first minute. It costs nothing to generate. The video goes browser → bucket on a presigned PUT and never passes through the app server. See `lib/storage.ts`, "Direct uploads", for why it is two-phase (`veragen/pending/` → verified → `veragen/users/`).

Worth asking before paying for a key: the original bounty post (@gpumaxxer) said Higgsfield "will even power it". Asking them directly for bounty-participant API credits is a real option.
## Mint Lab — trait-based generative sets (`/collections`)

**This is explicitly a playground, not the BittyDragons/Bittyverse canon
product.** SigilNet's `docs/BITTYVERSE_ENTRY_AND_MINT.md` states the real
rule plainly: *"A Bitty is not minted from a button... care may weight a
mint only once that care is attested."* A real drop's traits come from a
care lifecycle gated on a signed attestation, never an instant roll, and
*"a mint determined by spend"* is explicitly called out as something it
must never become. What lives here — hit a button, get a weighted-random
mint immediately — is the opposite of that on purpose: a fast way to
prototype a trait vocabulary and rarity curve, or generate one-off cards
for something that's genuinely fine being purchasable per ADR-009's own
carve-out (see below). It's named "Mint Lab" instead of anything
collection-specific for exactly this reason, and both `/collections`
pages carry an explicit disclaimer banner.

- `TraitCategory` (e.g. "Element", "Wings", "Aura") holds `TraitOption`s,
  each an integer `weight` (rarity) and a `promptFragment` — the actual
  text that gets woven into the generation prompt when that option is
  picked ("iridescent scales, faint ember glow along the spine").
- Minting (`POST /api/collections/[id]/mint`) builds a seed from
  `collectionId:mintNumber`, optionally extended with a supplied
  `walletAddress`/`txHash`, and runs it through `lib/traits.ts` to pick
  one weighted option per category. **`lib/traits.ts` deliberately mirrors
  SigilNet's `packages/weighted-roll`** (`@gsknnft/weighted-roll` —
  `rollFrom` FNV-1a hash + `pickWeighted` cumulative-weight walk) rather
  than a second invented algorithm. That package is itself an extraction:
  the same "weighted deterministic pick" logic used to live separately in
  both `packages/art-engine` (DNA generation) and `packages/bittyverse`
  (the maturation resolver) before being pulled into one shared home —
  `bittyverse` now consumes it rather than hosting it, which is exactly
  the shape VeraGen's copy should eventually collapse into too. VeraGen
  is a standalone repo outside the SigilNet pnpm workspace, so it can't
  `workspace:*`-depend on it directly. If VeraGen ever moves into the
  SigilNet monorepo, or `@gsknnft/weighted-roll` gets published, delete
  this file for the real import. Until then the two must be kept in sync
  by hand — a real, acknowledged tradeoff, not an oversight.
- Wallet/tx-hash as seed input is deliberate, and deliberately *not*
  identity: `ADR-009` (SigilNet) is explicit that *"the persistent
  economic subject is a canonical Bitty `characterId`, not an owner
  wallet."* Folding a wallet address or tx hash into the seed ties a roll
  to that specific action (can't be silently redone for a better result)
  without making the wallet the record's identity — the `Mint`'s own id
  stays authoritative; `walletAddress`/`txHash` are persisted as
  provenance on the `seed` used, nothing more.
- **The "buy an outcome" line has a real carve-out, and it matters where
  it's drawn.** ADR-009 separates a Bitty's own visual/trait identity
  (never purchasable) from items *minted to* its ERC-6551 account —
  Threadbound cards, support items, artifacts. The dragon's own traits
  must stay care-gated; a random item pack going *into* its inventory is
  a legitimate, separate economic surface. Mint Lab's mechanism (weighted,
  seeded, reproducible) is the right primitive for both — it just must
  never be pointed at a Bitty's own core identity as a paid instant-mint.
- The collection's own **style lock** (same mechanism as a project's)
  gets appended to every mint's assembled prompt, so the whole set —
  hundreds of mints, generated over weeks — reads as one consistent art
  style instead of drifting.
- Each mint currently generates a short **video** clip, reusing the
  entire existing Higgsfield/storage/status-polling pipeline as-is
  (`app/api/mints/[id]/status/route.ts` mirrors the clip status route
  almost exactly), from a text-only prompt — no image reference yet.
  **Known gap, called out directly rather than glossed over:** the video
  is not currently guaranteed to visually match the traits it was rolled
  from ("one bitty and a video of another" is a real failure mode, not a
  hypothetical). The fix is to composite the chosen traits into a still
  image first (art-engine's compositor, or a lighter in-repo one) and
  pass *that* as the Higgsfield face/image reference for the video call,
  so the animated clip is provably the same entity as the still. Not
  built yet. Relatedly: video-per-mint vs. a still image by default with
  video as a separate unlock (tying back to the free-tier export cap
  below) is still an open product decision, not defaulted.
- Non-goals for this pass: linking a Collection's mints back into a
  video-studio timeline (they're separate systems for now), any
  on-chain/mint-contract integration — this only generates the media
  asset, it doesn't touch a mint transaction.

## Architecture

- **Next.js (App Router, TS)**. Server routes hold all secrets
  (Higgsfield key, storage credentials); nothing sensitive reaches the
  client.
- **Postgres via Prisma** (`prisma/schema.prisma`) — two independent
  trees off the same database: `Project` (style lock) → `Clip` (ordered,
  trim window, transition type, optionally linked to a `Character`) and
  `Character` (saved face reference) → `Export` for the video studio;
  `Collection` (style lock) → `TraitCategory` → `TraitOption` and
  `Collection` → `Mint` → `MintTrait` for generative collections. Points
  at any reachable Postgres, managed or self-hosted (`DATABASE_URL`). A
  committed placeholder `.env` exists only so `prisma generate` (which
  runs on every `pnpm install`) has a syntactically valid `DATABASE_URL`
  to parse — it never connects at generate time; real credentials go in
  `.env.local`, which overrides it.
- **S3-compatible object storage** (`lib/storage.ts`, via
  `@aws-sdk/client-s3` with path-style addressing) — works unchanged
  against AWS S3, R2, B2, or a self-hosted MinIO instance. Every
  Higgsfield result gets re-hosted here (`persistRemoteVideo`) because
  their result URLs aren't guaranteed to stay valid indefinitely, and the
  render step needs a stable source.
- **Higgsfield API** (`lib/higgsfield.ts`) — one thin fetch wrapper, no
  SDK dependency. `submitVideoJob` (face image optional) + `getJobStatus`.
  Model endpoint/name and the image-input format (data URI vs. hosted
  URL) are flagged as TODOs — confirm both in the day-1 spike, this is
  a two-day-old API.
- **Remotion** (`remotion/`) is the actual editor engine:
  - `remotion/Composition.tsx` builds the arranged sequence from ordered,
    trimmed clips using `@remotion/transitions`' `TransitionSeries` — hard
    cuts are just adjacent sequences, crossfades insert a `Transition`.
  - `remotion/durationUtils.ts` is the single source of truth for
    frame/duration math, shared by the Remotion root's
    `calculateMetadata`, the in-browser `<Player>` preview
    (`components/PreviewPlayer.tsx`), and the export route — so the
    preview never drifts from what actually renders.
  - Export (`app/api/projects/[id]/export/route.ts`) bundles the
    composition and calls `renderMedia` server-side, then uploads the
    result to storage. This runs on the Node runtime with a raised
    `maxDuration` — real CPU time, not a fire-and-forget call.
- **Timeline UI** (`components/Timeline.tsx`) — `@dnd-kit` for
  drag-reorder, numeric in/out fields for trim, a per-clip transition
  picker. Optimistic local updates, debounced PATCH to persist.

## Guardrails

- Rate-limit clip generation by IP (in-memory, resets daily —
  `lib/rate-limit.ts`). Fine for a single-instance demo; move to
  Redis/Upstash if real traffic shows up.
- Strip EXIF (including GPS) from every uploaded face photo before it's
  sent anywhere, by re-encoding through `sharp`.
- **Export is capped at 15 seconds of final timeline** for the free tier
  (`lib/config.ts` → `FREE_EXPORT_MAX_SECONDS`). Longer exports are a
  phase-2 paid tier — the cap is the single gate to raise once that
  billing layer exists (accounts + Stripe checkout + a per-account
  entitlement, not built yet).

## Two layers, one repo

Per SigilNet's ADR-011, this repo holds **two layers that must not merge**.

**The studio is the universal layer.** Prompts, characters, style locks,
timeline, render, export. It knows nothing about collections, chains, tokens or
economies, and nothing about which API made the pixels — `lib/higgsfield.ts` is
an adapter, and swapping it is one file, not a rewrite. Anything describable
can be generated by it. This layer is worth having with no chain attached at
all, and stays useful if every ecosystem it serves changes.

**Mint Lab is a lane.** A lane connects a deterministic generation spec to one
ecosystem's contracts: SigilNet/Bittyverse is one, another collection or chain
is another, and no chain is equally valid. Lanes must stay collection-agnostic
and chain-agnostic — no hardcoded collection id, no chain assumption, no
economic law leaking into the studio.

What may cross the seam is narrow: a deterministic spec and evidence of output
go out to the lane; an identity to generate *for* comes back in. What the
studio must never learn is what that identity is worth, who holds it, or where
it settles.

Two rules follow, and both are already stated elsewhere rather than invented
here:

- **Instant weighted rolls may not be pointed at a Bitty's own traits.**
  ADR-010 governs those — attested care sets the odds, the attested root picks.
  The same primitive is legitimate for items minted *into* a character's
  account (cards, artifacts, support items), which ADR-009 separates from the
  character's own identity. Mint Lab is the right mechanism pointed at the
  right target.
- **The still image is the identity.** It is what mints and what provenance
  anchors to; video is derived from it. This is why "video generated from text
  alone" is a correctness bug and not a polish item — an animated clip that
  didn't come from the composited still is not provably the same entity.

## Access control

**Wired.** Every data route goes through `withAccess` (`lib/access.ts`);
`/api/auth/[...all]` is better-auth's own handler and is the one deliberate
exception.

`withAccess` runs, in order: session check (401 if absent), origin check on
writes against `BETTER_AUTH_URL`, body-size bounds including chunked bodies,
field validation (`lib/input.ts`), per-user write quota, ownership lookup, then
the handler — with `private, no-store` on the response and no provider error
ever serialized to a client. A resource owned by someone else returns **404,
not 403**: existence is itself information.

Routes must not re-check the origin themselves. `withAccess` compares against
`BETTER_AUTH_URL`; comparing against `req.nextUrl.origin` instead breaks behind
any TLS-terminating proxy (Cloudflare Tunnel to `http://localhost:3000`), where
that value is `http://…` and every write would 403.

Ownership resolves through real relations, never a caller-supplied parent id
(`ownerFilter` in `lib/ownership.ts`). `Project.ownerId` and
`Collection.ownerId` are **required**; clips, characters and exports are owned
through their project, trait data and mints through their collection, media
directly.

`VERAGEN_DEV_USER` (see `.env.example`) stands in for a signed-in user during
local development. `NODE_ENV=production` disables it first, and no variable can
override that.

## Database

Migrations, not `db push`: `prisma/migrations/` is the source of truth, applied
with `pnpm exec prisma migrate deploy`. CI fails if `schema.prisma` and the
migrations disagree, and the database test applies every migration in order to
an in-process Postgres (PGlite).

Two databases on the droplet, both owned by `prisma_user`:

| Database      | Used by                                | Contents                  |
| ------------- | -------------------------------------- | ------------------------- |
| `veragen_db`  | production                             | kept empty until launch   |
| `veragen_dev` | local development (`.env`, `.env.local`) | dev user, test projects |

Local dev must never point at `veragen_db`: the dev bypass creates a real user
row in whatever it is connected to.

The droplet's Postgres listens on **loopback only**. A `DATABASE_URL` with the
droplet's public IP can never connect from a laptop, whatever the password.
Develop through the tunnel:

```bash
pnpm db:tunnel   # 127.0.0.1:5433 -> droplet 127.0.0.1:5432, auto-reconnects
```

Creating a migration: `prisma migrate dev` needs a shadow database it can
terminate connections on, which `prisma_user` is not allowed to do. Diff the
dev database (at the latest migration) against the schema instead, review the
SQL, then deploy:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
```

Still open: a dedicated `veragen_user` role, so VeraGen and ApeFathers stop
sharing `prisma_user`. `prisma_user` cannot create roles, so this needs a
Postgres superuser (root on the droplet).

## Known constraints worth knowing about before shipping

- **Remotion's license**: rendering with Remotion is free for
  individuals/small teams under their current terms, but a paid company
  license is required past certain team-size/funding thresholds. If this
  turns into a real funded product, check current terms before scaling
  usage — https://www.remotion.dev/license.
- **Serverless render time**: `renderMedia` is bundling + actually
  encoding video — on Vercel this needs a paid plan's longer function
  duration (Hobby's default limit is too short for anything beyond a
  couple of very short clips). The 15s export cap keeps v1 inside a
  reasonable window; treat that cap as a technical constraint as much as
  a monetization lever for now.
- **Quotas are per-account**: writes, generations and uploads are rate-limited
  on the signed-in user id, so a tiered payment structure has a real subject
  to gate on. Nothing is billed yet: generation is BYOK, export runs in the
  browser, and storage is capped at 512 MB per user.

## Deploying: Vercel + a custom subdomain

Straightforward and free on Vercel's Hobby tier: import the GitHub repo,
add a subdomain (e.g. `studio.gsknnft.com`) under Project Settings →
Domains, and point a CNAME at the hostname Vercel gives you (or an A/ALIAS
record if the registrar requires one at the root) — no paid plan needed
for a custom domain itself.

The one piece that genuinely doesn't fit a standard serverless deploy is
**export** (`renderMedia`, in `app/api/projects/[id]/export/route.ts`):
it drives a real headless Chromium instance, and Remotion's own docs
steer people away from running that in a vanilla serverless function
toward Remotion Lambda or a self-hosted render step — the Chromium
binary is large enough to strain serverless function size/cold-start
limits, independent of Vercel's pricing tier. (Concretely hit a version
of this while building: the sandbox here downloads Remotion's headless
Chromium from a host outside its network allowlist and the download was
refused outright — a different cause than Vercel's limits, but the same
underlying shape of problem: this render step assumes it can pull down
and run a real browser, and any locked-down environment will balk at
that somewhere.)

Given self-hosted Postgres and MinIO are already the plan, the
consistent choice is to run **export** — or the whole app — on that same
hardware rather than Vercel, and it's worth deciding deliberately:

- **App on Vercel, export self-hosted**: cleanest URLs and zero-cost
  hosting for everything except rendering, but means splitting the
  export route into its own small service the Vercel app calls out to —
  real, if modest, added complexity.
- **Everything self-hosted**: one deploy target, no split, export "just
  works" since it's a normal Node process on hardware you control — costs
  a bit of ops (process manager, reverse proxy for the domain, keeping it
  updated) instead.

Generation, the timeline, and preview (the in-browser Remotion `<Player>`
runs in the visitor's own browser, not server-side) work fine on Vercel
either way — only the final render step is in question.

## 7-day plan

- **Day 1** — repo + studio scaffold (this), Higgsfield API spike:
  confirm the real image2video/text2video endpoint names and image-input
  format, submit and poll one real job to a finished video.
- **Day 2** — generation flow end-to-end against the real API (swap in
  whatever the spike found), clip bin populates, EXIF-stripped uploads.
- **Day 3** — timeline: drag reorder, trim, transition picker, all
  persisting via PATCH.
- **Day 4** — live preview matches the timeline exactly (verify
  crossfade overlap math against real rendered output, not just frame
  counts on paper).
- **Day 5** — export pipeline working end-to-end against real storage;
  confirm render time on the target deploy host stays inside its
  function-duration limit for a 15s timeline.
- **Day 6** — deploy, mobile layout pass, real-device testing (camera
  capture, touch drag-reorder).
- **Day 7** — buffer, then QT the original post with a live studio link
  and an exported clip.

## Definition of done for the bounty

A public URL where a stranger can write a prompt, optionally drop in a
face photo, generate a few clips, arrange and trim them on a timeline,
watch the arrangement play back live, and export a finished video —
without an account, in one sitting.
