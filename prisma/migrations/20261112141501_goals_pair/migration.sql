-- AlterTable
ALTER TABLE "MarketSelection" ADD COLUMN     "excludedReason" TEXT;

-- AlterTable
ALTER TABLE "RobotScan" ADD COLUMN     "pairsExcluded" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "excludeGoalsPair" BOOLEAN NOT NULL DEFAULT true;
