# VeraGen Production Audit — 2026-09-17

## Status
- **Version**: 0.1.0 (early prototype)
- **Design intent**: Single-user per session, no accounts in v1 (per SCOPE.md)
- **Current readiness**: NOT production multi-user ready
- **Auth setup**: better-auth configured but NOT integrated with API routes

## Critical Findings Summary
1. **NO AUTH on API routes** - All project/clip/character/collection endpoints unauthenticated
2. **NO ownership field** - Schema lacks `ownerId` on Project/Collection (ownership.ts expects it)
3. **Data leakage** - Anyone can access/modify any project by ID
4. **Collections exposed** - GET /api/collections lists entire instance
5. **No middleware** - No request-level identity checking
6. **Rate limiting** - In-memory per-IP, not per-user; doesn't protect write operations properly
7. **Export not gated** - Synchronous, no concurrency control, no per-user quota
8. **Higgsfield creds** - Per-session cookie, not per-user persistent

## Gap Priority List (for Multi-User)
1. Add ownerId to Project/Collection schema → migrate DB
2. Wrap ALL API routes with withAccess() (already defined but unused)
3. Enforce user session in studio page
4. Fix /api/projects POST to associate with current user
5. Gating/quota on export + generation
6. Per-user rate limits in access.ts
7. No hardcoded single-user code found (good)
8. CORS: origin check in access.ts is present
9. CSRF: better-auth has rate limiting enabled

## Implementation Path
- Phase 1: Add ownerId columns, migrate schema
- Phase 2: Connect auth to all routes via withAccess wrapper
- Phase 3: Add export quota/concurrency gating
- Phase 4: Per-user storage isolation (S3 key structure)
