# VeraGen public beta

The product: turn a product image, character, NFT artwork, brand, or prompt into a finished branded social MP4. This release does not claim a successful funded user test.

## Hosting and cost

Default export runs on the visitor's device with WebCodecs. Next.js serves the UI, OAuth, private metadata and short provider requests. There is no automatic paid server-render fallback. ENABLE_SERVER_EXPORTS is off unless explicitly set to true. The Postgres render worker is optional.

For an initial low-cost test the 8 GB Pi 5 can serve the app and Postgres without video rendering. Home Wi-Fi, upstream bandwidth, power and router availability remain dependencies; this is a beta hosting choice, not an uptime guarantee. Run a production build behind Cloudflare Tunnel with no router port forwarding, a dedicated database/user and filesystem/service account. Bind the app to loopback. Do not expose Postgres to the internet.

For a more dependable public frontend, use Vercel and Cloudflare DNS with the exact DNS records Vercel supplies. Start DNS-only; avoid caching authenticated pages, API responses or signed URLs. Vercel Hobby is restricted to personal/non-commercial use: https://vercel.com/docs/limits/fair-use-guidelines . Evaluate the plan against this product rather than assuming public commercial hosting is free. A Vercel frontend still depends on the home network if its database remains on the Pi. Normal HTTP proxying of gsknnft.com does not provide a Postgres connection. Put an authenticated HTTP backend in front of a private home DB, or choose a reachable isolated database before moving the frontend.

Remotion 4's free-license eligibility includes individuals and organizations with up to three employees; check applicability as the project changes: https://www.remotion.dev/license . Browser rendering does not imply that every software license or storage bill disappears.

## Deployment configuration

- Set BETTER_AUTH_URL to https://veragen.gsknnft.com and supply independent random BETTER_AUTH_SECRET and VERAGEN_SESSION_SECRET values.
- Configure Google or GitHub OAuth. Register the exact callback /api/auth/callback/google or /api/auth/callback/github on that origin.
- Remove VERAGEN_DEV_USER from public environments. Never expose next dev through a public tunnel. Production ignores the development bypass.
- Use a dedicated PRIVATE bucket or separately enforced private bucket policy and restricted credentials. Do not repurpose the public ApeFathers NFT bucket for user source images.
- DigitalOcean Spaces uses the regional S3 endpoint, for example https://nyc3.digitaloceanspaces.com, and region nyc3. S3_PUBLIC_BASE_URL is no longer used.
- Configure bucket CORS for the exact VeraGen origin, GET/HEAD, Range requests and exposed Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag headers. Browser rendering needs cross-origin media access. Signed URLs expire in ten minutes; they are temporary bearer links and must not be cached or logged.
- **Direct uploads need two more bucket rules.** "Upload your own clip" PUTs video straight from the browser to the bucket on a presigned URL, so CORS must also allow PUT with a Content-Type request header from the VeraGen origin. And add a lifecycle rule expiring objects under the `veragen/pending/` prefix after 1 day. Uploads land there first and are copied to `veragen/users/` only after the server verifies size, type and file signature. Without the lifecycle rule, abandoned uploads stay in the bucket and cost you storage; with it they clean themselves up. Never apply that rule to `veragen/users/`.
- HIGGSFIELD_MEDIA_HOSTS is a comma-separated exact allowlist of the provider's actual output CDN hosts. No wildcard, arbitrary URL fetch or redirect is allowed. Confirm the hostname from the provider response before configuring it. Do not guess or allow every domain.
- Browser export currently supports up to 60 seconds. An unsupported MP4/audio codec gives a useful error, not a paid fallback. Keep the tab open during export.
- Run node scripts/preflight.mjs using deployment environment variables. The script prints missing setting names only and contacts no services.

## Database migration

The checked-in platform_baseline migration creates the complete schema for a NEW dedicated VeraGen database. It is tested against an isolated Postgres engine. It includes auth, tenant ownership, private media, quotas, submission deduplication and optional export jobs.

For a new empty database: run pnpm exec prisma migrate deploy, then pnpm exec prisma generate. No migration was applied to the home Pi during this work.

For an EXISTING database, do not run the create-all baseline directly or blindly mark it applied. Back up the database, compare its actual schema against prisma/schema.prisma, prepare/apply a reviewed additive migration, then baseline only after the schemas agree. Existing exports need explicit completed status and valid snapshots where relevant. The require_owner migration intentionally fails if any existing projects/collections have null ownerId. Backfill each record to its real owner before applying it; do not bulk-assign all records to a newly registered user. There is no public claim-existing-project endpoint.

Old publicly hosted asset URLs are rejected by new private-media signing. Import owned files into the private bucket and update references deliberately; changing app code cannot make previously published URLs private or remove Git history. Previously tracked environment secrets should be rotated if the repository was shared.

## Acceptance test: a person other than the builder

1. Sign in as tester A through OAuth. Create a named project. Sign out and confirm it disappears; tester B must receive 404 for A's project, clips, characters, collection, export and media IDs.
2. A connects their OWN funded Higgsfield API credentials. A creates one five-second shot from a product/character image or prompt. Observe the provider request in A's account. Record model, request ID, time, result, and actual credit debit without sharing credentials.
3. Refresh while the generation is processing. Confirm it resumes. Repeat the same request ID/attempt and confirm it does not submit a second generation. Disconnect/reconnect and verify another user cannot inherit the key.
4. Trim, caption, reorder and add logo/closing message. Export a portrait branded MP4 on the tester's device. Check first/last frame, caption, logo, audio, duration and aspect ratio. Repeat square/widescreen.
5. Download and open the MP4 in another player. Use the device Share button where supported, otherwise manually upload the MP4 to a social app. VeraGen does not automatically post to accounts.
6. Record the tester's outcome and friction. The end-to-end claim remains unverified until this succeeds.

## Current verification boundary

Unit tests exercise access guards, provider-key ownership, request validation and URL allowlisting. Database tests apply the full SQL schema and exercise the real atomic quota SQL with concurrent requests. These do not replace a live OAuth callback test, actual private bucket policy/CORS test, browser export playback check or funded Higgsfield test.


## No-credit validation path

Until a funded tester is available, use Upload your own clip to test sign-in, private storage, timeline edits, branding, browser MP4 export and sharing. This does not prove the Higgsfield generation step. Keep the two results separate.
