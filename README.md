# VeraGen

![VeraGen](public/brand/veragen-logo.png)

**Turn a product image, character, NFT artwork, brand, or idea into a finished branded social video.**

Sign in, bring an existing clip or generate with your own Higgsfield API account, edit the timeline, add captions and branding, then export a portrait, square or widescreen MP4 on your device. Download it or use your device's share sheet. VeraGen does not post to social accounts automatically.

## Current status

Multi-user beta code with Better Auth, owned projects, private media, bounded uploads and per-user quotas. Build/test results are recorded in [the verification report](docs/VERIFICATION_2026-09-19.md). A real funded Higgsfield → edit → branded export completed by an independent user is **not yet verified**. No funded tester is currently available.

Generation uses the user's API credentials; the app never falls back to an operator key. Importing an existing clip requires no Higgsfield credits. Storage and hosting still have their own costs.

## Run locally

Use Node 24 and pnpm 11.

1. Install with `pnpm install --frozen-lockfile`.
2. Configure the values in `.env.example` using an untracked local environment file. Prisma CLI and Next must use the SAME isolated VeraGen database. Prisma reads `.env`; Next also reads `.env.local`, which takes precedence.
3. For a NEW, EMPTY database, run `pnpm exec prisma migrate deploy` and `pnpm exec prisma generate`. Existing databases require the migration procedure in [PUBLIC_LAUNCH.md](docs/PUBLIC_LAUNCH.md).
4. Configure Google or GitHub OAuth and private S3-compatible storage, then run `pnpm dev`. Local-only development can use the explicit development identity described in `.env.example`; never expose the dev server publicly.
5. Open `http://localhost:3000`. The studio requires sign-in and shows only the current user's projects.

No mock generation or operator-funded credit mode is enabled. A missing Higgsfield connection blocks generation; users can still upload their own clips.

## Validation

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm audit --prod
pnpm preflight
```

Preflight checks deployment settings without contacting the database, bucket or provider. Tests use isolated fixtures and Postgres-in-WASM; they do not use the Pi database or purchase generations.

## Deploy and test

[Public launch guide](docs/PUBLIC_LAUNCH.md) covers OAuth callbacks, migrations, private bucket policy/CORS, Cloudflare/Vercel/Pi choices and the independent user acceptance test. Browser export is the default. The optional Postgres render worker is disabled at the API unless `ENABLE_SERVER_EXPORTS=true`; enabling it requires intentional capacity planning.

[BYOK](docs/BYOK.md) explains credential ownership. [Brand assets](docs/BRAND_ASSETS.md) lists usable logos, favicon and social artwork.

## Collection experiments

Mint Lab is an authenticated prototype for generic trait experiments. It is not a chain mint and does not enforce Bittyverse canon. The private [Bittyverse lane proposal](docs/BITTYVERSE_LANE.md) describes how still-first identity, hatch surprise and derived media can consume VeraGen without making the public studio depend on Bitty Dragons. Nothing in that proposal deploys a contract, creates NFTs or changes canon.
