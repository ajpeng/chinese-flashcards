-- CreateTable
CREATE TABLE "TTSCache" (
    "id" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "audioData" TEXT NOT NULL,
    "timings" JSONB NOT NULL,
    "totalDuration" DOUBLE PRECISION NOT NULL,
    "segments" JSONB NOT NULL,
    "mappings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TTSCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TTSCache_textHash_key" ON "TTSCache"("textHash");

-- CreateIndex
CREATE INDEX "TTSCache_textHash_idx" ON "TTSCache"("textHash");

-- CreateIndex
CREATE INDEX "TTSCache_createdAt_idx" ON "TTSCache"("createdAt");

-- CreateIndex
CREATE INDEX "TTSCache_lastUsedAt_idx" ON "TTSCache"("lastUsedAt");
