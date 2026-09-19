# VeraGen verification — 2026-09-19

Status: hardened beta implementation; **not a verified public launch**.

## Passed locally

- 32 tests: 27 Vitest cases plus 5 Node regression tests.
- TypeScript typecheck.
- Optimized Next.js production build.
- Production HTTP smoke: private APIs return 401 without a session, protected pages redirect to sign-in, security headers are present, and production ignores VERAGEN_DEV_USER. The smoke server used an unreachable loopback test database URL, never the Pi database.
- Production dependency audit: no known vulnerabilities reported.
- Prisma schema validation and application of every checked-in migration to isolated PGlite/Postgres. Quota concurrency is tested with actual SQL, not a simulated counter.
- Git whitespace check.

## Changes integrated and reviewed

Better Auth and ownership guards protect the API and server-rendered project/collection pages. Provider credentials are encrypted and bound to both user and login session. Project libraries are user-specific. Generation has no operator-funded fallback, and clip submission reserves an attempt before calling the billable provider.

Media is private with ownership-checked short-lived signing. Provider video downloads use an exact hostname allowlist, public-address validation, a pinned DNS result, redirect rejection and size/time bounds. Upload completion pins the inspected and copied object to the same ETag, makes the destination private and handles repeated completion without creating duplicate clips. Presigned PUTs explicitly sign Content-Type as well as Content-Length; this was checked against the installed AWS SDK, which otherwise omits Content-Type by default.

Browser export is the default. It uses the current edit, downloads signed sources before rendering, revokes temporary object URLs, and offers progress, cancellation, download and device sharing. Existing-clip uploads need no Higgsfield credits. Optional server exports require an explicit feature flag and quota; queue completion/failure is fenced by attempt number so a stale worker cannot overwrite a newer claim.

The Bittyverse lane remains a documented private experiment, aligned with care-before-mint and still-first identity. No collection contracts, minting authority or canon were changed.

## Still unverified or unconfigured

- No funded tester is available. No paid Higgsfield generation was executed.
- No connected browser was available, so browser MP4 encoding/playback and the interactive UI have not been observed end-to-end.
- OAuth callbacks and signed-in operation against a real deployed database need an integration test.
- Local preflight finds missing S3 endpoint/bucket/credentials, provider media-host allowlist, and OAuth configuration. The auth origin is still a local development origin and a development identity is configured. These are deployment setup items, not test passes.
- Private bucket policy, direct-upload CORS and pending-object lifecycle must be verified on the actual bucket.
- CI configuration is prepared, but no remote CI run is claimed here. Existing databases require review/backfill before the required-owner migration.

No deployment, DNS change, Pi migration, NFT-bucket change or social post was performed. No credits were purchased or spent. See PUBLIC_LAUNCH.md for the concrete funded and no-credit acceptance paths.
