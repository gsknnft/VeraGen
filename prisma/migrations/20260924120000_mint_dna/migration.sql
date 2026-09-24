-- AlterTable
ALTER TABLE "Mint" ADD COLUMN     "dna" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Mint_collectionId_dna_key" ON "Mint"("collectionId", "dna");

