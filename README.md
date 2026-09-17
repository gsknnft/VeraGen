# loopface

One face photo in, a shareable video out — no prompt engineering, no model
picker. Built on the [Higgsfield API](https://docs.higgsfield.ai/docs).

See [SCOPE.md](./SCOPE.md) for the product bet, architecture, and 7-day plan.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in HF_API_KEY_ID / HF_API_KEY_SECRET
pnpm dev
```

## Status

Day-1 scaffold. The Higgsfield model endpoint/name in `lib/higgsfield.ts`
and the image-input format (data URI vs. hosted URL) are marked as
unconfirmed — verify both against current docs before the first real
generation.
