-- AlterTable
ALTER TABLE "MarketSelection" ADD COLUMN     "manualOdds" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboCandidate" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "comboType" "MarketType" NOT NULL,
    "winnerOdds" DECIMAL(8,4) NOT NULL,
    "goalsOdds" DECIMAL(8,4) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComboCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboCandidate_matchId_idx" ON "ComboCandidate"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboCandidate_scanId_matchId_key" ON "ComboCandidate"("scanId", "matchId");

-- AddForeignKey
ALTER TABLE "ComboCandidate" ADD CONSTRAINT "ComboCandidate_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RobotScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboCandidate" ADD CONSTRAINT "ComboCandidate_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
