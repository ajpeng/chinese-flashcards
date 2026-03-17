-- CreateTable
CREATE TABLE "SubtitleJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "filename" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "srtContent" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubtitleJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubtitleJob_createdAt_idx" ON "SubtitleJob"("createdAt");
