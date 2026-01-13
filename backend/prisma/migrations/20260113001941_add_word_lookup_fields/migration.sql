-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT DEFAULT 'dictionary';
