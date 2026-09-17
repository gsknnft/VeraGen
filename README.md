# loopface

A small video studio built on the [Higgsfield API](https://docs.higgsfield.ai/docs):
prompt in, clip out, arrange clips on a timeline, export a finished video.
Also includes `/collections` — trait-based generative sets that mint a
unique, reproducible video per mint number (see SCOPE.md's "Bittyverse"
section).

See [SCOPE.md](./SCOPE.md) for the product bet, architecture, known
constraints, and 7-day plan.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Nothing above is required to start building — with no `HF_API_KEY_ID`/
`HF_API_KEY_SECRET` set, the app runs in **mock mode**: generations
resolve instantly against stock placeholder clips instead of calling the
(paid) Higgsfield API, and skip needing object storage configured too.
Only `DATABASE_URL` (any reachable Postgres) is required from day one.

Fill in `.env.local` as each piece comes online:

- `DATABASE_URL` — any reachable Postgres (managed or self-hosted).
- `HF_API_KEY_ID` / `HF_API_KEY_SECRET` — from the Higgsfield Console.
  Leave unset to stay in mock mode.
- `S3_*` — any S3-compatible bucket (AWS S3, R2, B2, or a self-hosted
  MinIO instance) for durably storing generated clips and exports. Not
  needed while in mock mode.

Then:

```bash
pnpm db:push     # create tables from prisma/schema.prisma
pnpm dev
```

Open `http://localhost:3000` — it creates a project and drops you into
the studio at `/studio/[projectId]`. Trait-based collections live at
`/collections`.

## Developing the Remotion composition in isolation

```bash
pnpm remotion:studio
```

Opens Remotion's own preview tool against `remotion/index.ts`, useful for
iterating on the timeline composition without the rest of the app.

## Status

Studio + collections scaffold, typechecked and building clean, runnable
in mock mode with just a Postgres connection. Not yet run against a real
Higgsfield key, live Postgres, or real object storage — the model
endpoint name and image-input format in `lib/higgsfield.ts` are marked
unconfirmed and need verifying in the day-1 spike (see SCOPE.md).
