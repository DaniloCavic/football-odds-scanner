-- AlterTable
ALTER TABLE "RobotScan" ADD COLUMN     "diagnostics" JSONB NOT NULL DEFAULT '{}';
