# loopface — scope

## The bet

Higgsfield opened its API and is reselling 50+ frontier video/image models
at cost. Nobody wins by re-implementing those models — Higgsfield already
did that work and will out-scale any clone on price and model breadth.
The only defensible angle is a **thin, opinionated product wrapped around
one workflow that's annoying to do today**, built on their API.

Workflow: **one face photo in → a short, consistent-character video out.**
No prompt engineering, no model picker, no timeline editor. Pick a face,
pick a vibe, get a clip you'd actually post.

Non-goals: multi-model marketplace, credits/billing UI, teams/auth,
timeline editing, anything that turns this into "Higgsfield but worse."

## User flow (v1)

1. Upload one face photo (drag/drop or camera capture on mobile).
2. Pick a vibe from ~6 preset prompts (cinematic pan, dance loop, talking
   head, action hero, retro film, product-hold) — no free-text prompt box
   in v1, presets remove the blank-page problem.
3. Hit generate. Server submits the job to Higgsfield, client polls status.
4. Result: a looping video preview + download button + a pre-filled
   "post this" share card (so trying it and posting it are the same
   action — this is how it gets QT'd).

## Architecture

- **Next.js (App Router, TS)**, deployed on Vercel. One repo, no backend
  service to babysit.
- `app/page.tsx` — upload + preset picker + result view, client component.
- `app/api/generate/route.ts` — server route. Holds the Higgsfield API key
  (`HF_API_KEY_ID` / `HF_API_KEY_SECRET`, never sent to the client),
  uploads the face image, submits the job, returns a `request_id`.
- `app/api/status/[id]/route.ts` — server route the client polls for job
  status; proxies Higgsfield's job state so the key never touches the
  browser.
- `lib/higgsfield.ts` — thin fetch wrapper: `Authorization: Key
  ${ID}:${SECRET}` header, submit-job / get-job calls. Deliberately not
  the official SDK at first — one file, no dependency risk, easy to read
  during a 7-day sprint. Swap in `@higgsfield/client` later if it earns
  its keep.
- No database in v1. Job state lives in Higgsfield; the browser tab is
  the only state. Add persistence (so a result survives a refresh) only
  if real usage shows people need it.

### Higgsfield integration (confirm exact endpoint/model names against
current docs before shipping — API is one day old as of this scope):

- Auth header: `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`
- Async job lifecycle: POST to a model endpoint (e.g.
  `/v1/image2video/dop`) with `{ model, prompt, input_images: [{ type:
  "image_url", image_url }] }` → returns `request_id` → poll (or
  webhook) until `status: "completed"` → `video.url`.
- v1 targets whichever Higgsfield model does face-conditioned
  image-to-video most reliably (their announcement calls out Seedance 2.5
  with face inputs specifically) — pin the exact model string during
  day-1 spike, don't guess it here.

## Guardrails for a public, unauthenticated demo

- Rate-limit by IP (in-memory token bucket is fine for a 7-day demo；
  move to Upstash/Redis only if traffic actually shows up).
- Cap upload size and reject non-face-looking images client-side
  (basic dimension/format check; don't over-engineer moderation for v1).
- Strip EXIF/location metadata from uploaded photos server-side before
  they're ever sent onward.
- Set a hard per-IP daily generation cap so one bad actor can't burn the
  whole API budget Higgsfield is fronting.

## 7-day plan

- **Day 1** — repo scaffold (this), Higgsfield API spike: auth working,
  one manual `curl` job submitted and polled to a finished video.
- **Day 2** — upload UI, preset picker, `/api/generate` wired end-to-end.
- **Day 3** — polling + result view, loading/error states, mobile layout.
- **Day 4** — rate limiting, EXIF strip, upload validation, abuse caps.
- **Day 5** — share card (auto-generated OG image/video + pre-filled
  tweet text), visual polish, dark theme.
- **Day 6** — deploy to Vercel, real device testing (especially mobile
  camera capture), fix whatever breaks.
- **Day 7** — buffer day, then QT the original post with the live demo
  link.

## Definition of done for the bounty

A public URL, no login wall, where a stranger uploads one face photo and
gets a shareable video back in under a couple minutes — with the share
step doing half the marketing for you.
