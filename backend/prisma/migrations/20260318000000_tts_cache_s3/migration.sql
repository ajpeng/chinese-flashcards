-- Clear existing cache entries (they contain base64 audio that won't be valid after this migration)
TRUNCATE TABLE "TTSCache";

-- Replace audioData with s3Key
ALTER TABLE "TTSCache" DROP COLUMN "audioData";
ALTER TABLE "TTSCache" ADD COLUMN "s3Key" TEXT NOT NULL DEFAULT '';

-- Remove the default after adding the column
ALTER TABLE "TTSCache" ALTER COLUMN "s3Key" DROP DEFAULT;
