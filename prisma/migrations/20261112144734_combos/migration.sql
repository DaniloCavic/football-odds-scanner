-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarketType" ADD VALUE 'HOME_OVER_1_5';
ALTER TYPE "MarketType" ADD VALUE 'HOME_UNDER_3_5';
ALTER TYPE "MarketType" ADD VALUE 'AWAY_OVER_1_5';
ALTER TYPE "MarketType" ADD VALUE 'AWAY_UNDER_3_5';
