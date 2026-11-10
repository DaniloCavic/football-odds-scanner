-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('PENDING', 'LIVE', 'WON', 'LOST', 'POSTPONED', 'VOID', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FilterSetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateTable
CREATE TABLE "TrackedSelection" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "marketSelectionId" TEXT NOT NULL,
    "marketType" "MarketType" NOT NULL,
    "selection" TEXT NOT NULL,
    "originalOdds" DECIMAL(8,4) NOT NULL,
    "status" "SelectionStatus" NOT NULL DEFAULT 'PENDING',
    "finalHomeScore" INTEGER,
    "finalAwayScore" INTEGER,
    "resultSource" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "status" "FilterSetStatus" NOT NULL DEFAULT 'ACTIVE',
    "stakePerSelection" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RSD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterSetSelection" (
    "id" TEXT NOT NULL,
    "filterSetId" TEXT NOT NULL,
    "trackedSelectionId" TEXT NOT NULL,
    "marketSelectionId" TEXT NOT NULL,
    "oddsSnapshot" DECIMAL(8,4) NOT NULL,
    "stake" DECIMAL(12,2) NOT NULL,
    "settlementStatus" "SelectionStatus" NOT NULL DEFAULT 'PENDING',
    "grossReturn" DECIMAL(14,2),
    "netProfit" DECIMAL(14,2),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "FilterSetSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedSelection_status_idx" ON "TrackedSelection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedSelection_matchId_marketType_key" ON "TrackedSelection"("matchId", "marketType");

-- CreateIndex
CREATE INDEX "FilterSet_status_createdAt_idx" ON "FilterSet"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FilterSetSelection_filterSetId_removedAt_idx" ON "FilterSetSelection"("filterSetId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FilterSetSelection_filterSetId_trackedSelectionId_key" ON "FilterSetSelection"("filterSetId", "trackedSelectionId");

-- AddForeignKey
ALTER TABLE "TrackedSelection" ADD CONSTRAINT "TrackedSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedSelection" ADD CONSTRAINT "TrackedSelection_marketSelectionId_fkey" FOREIGN KEY ("marketSelectionId") REFERENCES "MarketSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSet" ADD CONSTRAINT "FilterSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSetSelection" ADD CONSTRAINT "FilterSetSelection_filterSetId_fkey" FOREIGN KEY ("filterSetId") REFERENCES "FilterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSetSelection" ADD CONSTRAINT "FilterSetSelection_trackedSelectionId_fkey" FOREIGN KEY ("trackedSelectionId") REFERENCES "TrackedSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSetSelection" ADD CONSTRAINT "FilterSetSelection_marketSelectionId_fkey" FOREIGN KEY ("marketSelectionId") REFERENCES "MarketSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
