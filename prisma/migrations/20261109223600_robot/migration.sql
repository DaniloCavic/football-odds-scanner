-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('HOME', 'DRAW', 'AWAY', 'OVER_1_5', 'UNDER_3_5');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('RUNNING', 'COMPLETED', 'STOPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "maxRequestsPerScan" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "country" TEXT,
    "externalCompetitionId" TEXT,
    "kickoffTime" TIMESTAMP(3) NOT NULL,
    "sportType" TEXT NOT NULL DEFAULT 'FOOTBALL',
    "matchStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSelection" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "marketType" "MarketType" NOT NULL,
    "odds" DECIMAL(8,4) NOT NULL,
    "oddsTimestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "periodLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ScanStatus" NOT NULL DEFAULT 'RUNNING',
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "maxOddsUsed" DECIMAL(4,2) NOT NULL,
    "fixturesTotal" INTEGER,
    "fixturesScanned" INTEGER NOT NULL DEFAULT 0,
    "fixturesExcluded" INTEGER NOT NULL DEFAULT 0,
    "selectionsFound" INTEGER NOT NULL DEFAULT 0,
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_kickoffTime_idx" ON "Match"("kickoffTime");

-- CreateIndex
CREATE UNIQUE INDEX "Match_provider_externalId_key" ON "Match"("provider", "externalId");

-- CreateIndex
CREATE INDEX "MarketSelection_matchId_idx" ON "MarketSelection"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSelection_scanId_matchId_marketType_key" ON "MarketSelection"("scanId", "matchId", "marketType");

-- CreateIndex
CREATE INDEX "RobotScan_startedAt_idx" ON "RobotScan"("startedAt");

-- CreateIndex
CREATE INDEX "RobotScan_status_idx" ON "RobotScan"("status");

-- AddForeignKey
ALTER TABLE "MarketSelection" ADD CONSTRAINT "MarketSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSelection" ADD CONSTRAINT "MarketSelection_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RobotScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotScan" ADD CONSTRAINT "RobotScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
