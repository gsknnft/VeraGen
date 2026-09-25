-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "description" TEXT,
ADD COLUMN     "externalUrl" TEXT;

-- AlterTable
ALTER TABLE "TraitCategory" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'trait';

-- AlterTable
ALTER TABLE "TraitOption" ADD COLUMN     "lore" TEXT;

