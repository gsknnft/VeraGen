# loopface

A small video studio built on the [Higgsfield API](https://docs.higgsfield.ai/docs):
prompt in, clip out, arrange clips on a timeline, export a finished video.

See [SCOPE.md](./SCOPE.md) for the product bet, architecture, known
constraints, and 7-day plan.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `HF_API_KEY_ID` / `HF_API_KEY_SECRET` — from the Higgsfield Console.
- `DATABASE_URL` — any reachable Postgres (managed or self-hosted).
- `S3_*` — any S3-compatible bucket (AWS S3, R2, B2, or a self-hosted
  MinIO instance) for durably storing generated clips and exports.

Then:

```bash
pnpm db:push     # create tables from prisma/schema.prisma
pnpm dev
```

Open `http://localhost:3000` — it creates a project and drops you into
the studio at `/studio/[projectId]`.

## Developing the Remotion composition in isolation

```bash
pnpm remotion:studio
```

Opens Remotion's own preview tool against `remotion/index.ts`, useful for
iterating on the timeline composition without the rest of the app.

## Status

Studio scaffold, typechecked and building clean. Not yet run against a
real Higgsfield key, live Postgres, or real object storage — the model
endpoint name and image-input format in `lib/higgsfield.ts` are marked
unconfirmed and need verifying in the day-1 spike (see SCOPE.md).
