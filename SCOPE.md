# loopface — scope

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
is proven), multi-project management UI, audio tracks, burned-in
captions, multi-track compositing (picture-in-picture, layered video) —
single video track only.

## Architecture

- **Next.js (App Router, TS)**. Server routes hold all secrets
  (Higgsfield key, storage credentials); nothing sensitive reaches the
  client.
- **Postgres via Prisma** (`prisma/schema.prisma`) — `Project` (holds the
  style lock) → `Clip` (ordered, with trim window + transition type,
  optionally linked to a `Character`) and `Character` (saved face
  reference) → `Export`. Points at any reachable Postgres, managed or
  self-hosted (`DATABASE_URL`). A committed placeholder `.env` exists
  only so `prisma generate` (which runs on every `pnpm install`) has a
  syntactically valid `DATABASE_URL` to parse — it never connects at
  generate time; real credentials go in `.env.local`, which overrides it.
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
- **No auth yet**: the export cap and rate limiting are IP-based, not
  account-based, because there's no login. A tiered payment structure
  needs accounts before it can gate anything per-user.

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
