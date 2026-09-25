-- Every category is a trait in metadata; kind says what the art is.
ALTER TABLE "TraitCategory" ALTER COLUMN "kind" SET DEFAULT 'feature';
UPDATE "TraitCategory" SET "kind" = 'feature' WHERE "kind" = 'trait';
