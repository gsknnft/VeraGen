-- Public share links: unguessable token → poster + optional playable video.
-- Media stays private in the bucket; the token is the read capability.

CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "posterUrl" TEXT,
    "videoUrl" TEXT,
    "clipId" TEXT,
    "mintId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
CREATE INDEX "ShareLink_ownerId_idx" ON "ShareLink"("ownerId");
CREATE INDEX "ShareLink_clipId_idx" ON "ShareLink"("clipId");
CREATE INDEX "ShareLink_mintId_idx" ON "ShareLink"("mintId");

ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
