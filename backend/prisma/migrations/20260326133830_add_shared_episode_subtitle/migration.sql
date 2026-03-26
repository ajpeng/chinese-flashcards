-- CreateTable
CREATE TABLE "SharedEpisodeSubtitle" (
    "id" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "zhSrtContent" TEXT,
    "enSrtContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'none',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedEpisodeSubtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedEpisodeSubtitle_audioUrl_key" ON "SharedEpisodeSubtitle"("audioUrl");

-- CreateIndex
CREATE INDEX "SharedEpisodeSubtitle_status_idx" ON "SharedEpisodeSubtitle"("status");
