-- DropForeignKey
ALTER TABLE "Word" DROP CONSTRAINT "Word_articleId_fkey";

-- AlterTable
ALTER TABLE "Article" ALTER COLUMN "hskLevel" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Word" ALTER COLUMN "pinyin" DROP NOT NULL,
ALTER COLUMN "english" DROP NOT NULL,
ALTER COLUMN "hskLevel" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
