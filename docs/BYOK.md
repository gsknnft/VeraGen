# User-funded generation

Every user supplies their own Higgsfield API key ID and secret through Connect Higgsfield. Generation requests use that account's API credits. Operator HF_API_KEY_ID / HF_API_KEY_SECRET variables are never read. A missing or expired connection blocks generation; it does not fall back to operator billing or silently return a sample clip.

Set VERAGEN_SESSION_SECRET to a random 32-byte hex value (see .env.example). Credentials are encrypted with AES-256-GCM in an HttpOnly, SameSite=Strict cookie, Secure in production, expiring after eight hours. They are not returned by the connection API, stored in localStorage, or persisted in Prisma. Connecting only saves credentials; it does not verify credentials, balance, or model access and does not make a generation request. Disconnect removes this browser's connection; it does not cancel provider jobs or revoke the key at Higgsfield.

Pending jobs are bound to a credential fingerprint. Reconnect the original key to resume polling after expiry. Legacy requests created before this change are not automatically reassigned to another account. Temporary status or storage errors preserve pending jobs.

Higgsfield authentication: https://docs.higgsfield.ai/docs/authentication

The adapter uses the documented api.higgsfield.ai host and Seedance 2.5 model routes. Real generation remains unverified until a user with funded API credentials deliberately tests it. No paid generation was run during implementation.

BYOK covers generation billing only. Hosting, storage and MP4 rendering remain application infrastructure costs. Project and collection routes now require a VeraGen session and enforce ownership. Provider credentials are also bound to that user and session; switching accounts cannot inherit a previous connection. Browser export is the default and does not start a server render. Deployment still needs the live checks in PUBLIC_LAUNCH.md.

The existing digital-ocean-storage-app describes Spaces configuration, but its AWS wrapper uses older SDK patterns. VeraGen already uses AWS SDK v3. Configure the regional Spaces S3 API endpoint separately from the public delivery URL. Do not use the ApeFathers bucket for initial tests; no existing bucket or Pi database was modified by this work.
