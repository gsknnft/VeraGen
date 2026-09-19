-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "chainNetwork" TEXT,
ADD COLUMN     "contractAddress" TEXT,
ADD COLUMN     "mintMinValueWei" TEXT,
ADD COLUMN     "sponsoredPerDay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Mint" ADD COLUMN     "claimedById" TEXT;

-- CreateIndex
CREATE INDEX "Mint_claimedById_idx" ON "Mint"("claimedById");

-- AddForeignKey
ALTER TABLE "Mint" ADD CONSTRAINT "Mint_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

