-- AddPatreonId
ALTER TABLE "User" ADD COLUMN "patreonId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_patreonId_key" ON "User"("patreonId");

-- CreateIndex
CREATE INDEX "User_patreonId_idx" ON "User"("patreonId");