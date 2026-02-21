-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET DEFAULT '';

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" INTEGER NOT NULL,
    "simplified" TEXT NOT NULL,
    "traditional" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "english" TEXT NOT NULL,

    CONSTRAINT "ExampleSentence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExampleSentence_simplified_idx" ON "ExampleSentence"("simplified");
