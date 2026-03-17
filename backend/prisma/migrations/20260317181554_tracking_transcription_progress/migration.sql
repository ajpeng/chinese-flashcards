-- AlterTable
ALTER TABLE "SubtitleJob" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "progressPct" INTEGER NOT NULL DEFAULT 0;
