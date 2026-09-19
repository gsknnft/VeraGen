-- CreateTable
CREATE TABLE "LinkedWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedWallet_address_key" ON "LinkedWallet"("address");

-- CreateIndex
CREATE INDEX "LinkedWallet_userId_idx" ON "LinkedWallet"("userId");

-- AddForeignKey
ALTER TABLE "LinkedWallet" ADD CONSTRAINT "LinkedWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

