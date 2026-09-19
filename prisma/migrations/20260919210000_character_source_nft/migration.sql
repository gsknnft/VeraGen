-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "sourceNft" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Character_projectId_sourceNft_key" ON "Character"("projectId", "sourceNft");

