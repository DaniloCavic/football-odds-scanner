-- AlterTable
ALTER TABLE "RobotScan" ADD COLUMN     "comboSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "combosCreated" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "combineResultGoals" BOOLEAN NOT NULL DEFAULT true;
