-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rssUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Podcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastEpisode" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audioUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "durationSecs" INTEGER,
    "zhSubtitleJobId" TEXT,
    "enSrtContent" TEXT,
    "subtitleStatus" TEXT NOT NULL DEFAULT 'none',
    "subtitleError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodcastEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Podcast_userId_idx" ON "Podcast"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_userId_rssUrl_key" ON "Podcast"("userId", "rssUrl");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastEpisode_zhSubtitleJobId_key" ON "PodcastEpisode"("zhSubtitleJobId");

-- CreateIndex
CREATE INDEX "PodcastEpisode_podcastId_idx" ON "PodcastEpisode"("podcastId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastEpisode_podcastId_guid_key" ON "PodcastEpisode"("podcastId", "guid");

-- AddForeignKey
ALTER TABLE "Podcast" ADD CONSTRAINT "Podcast_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastEpisode" ADD CONSTRAINT "PodcastEpisode_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastEpisode" ADD CONSTRAINT "PodcastEpisode_zhSubtitleJobId_fkey" FOREIGN KEY ("zhSubtitleJobId") REFERENCES "SubtitleJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
