-- Make Word.articleId nullable (standalone HSK vocabulary words have no article)
ALTER TABLE "Word" ALTER COLUMN "articleId" DROP NOT NULL;

-- Add SM-2 spaced repetition fields to Flashcard
ALTER TABLE "Flashcard"
  ADD COLUMN "easeFactor"     DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN "interval"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repetitions"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextReviewAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

-- Index for efficiently fetching due cards per user
CREATE INDEX "Flashcard_userId_nextReviewAt_idx" ON "Flashcard"("userId", "nextReviewAt");
