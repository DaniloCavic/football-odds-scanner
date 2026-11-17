-- DropForeignKey
ALTER TABLE "ComboCandidate" DROP CONSTRAINT "ComboCandidate_matchId_fkey";

-- DropForeignKey
ALTER TABLE "ComboCandidate" DROP CONSTRAINT "ComboCandidate_scanId_fkey";

-- AlterTable
ALTER TABLE "RobotScan" DROP COLUMN "comboSkipped",
DROP COLUMN "combosCreated",
DROP COLUMN "pairsExcluded";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "combineResultGoals",
DROP COLUMN "comboFallback",
DROP COLUMN "excludeGoalsPair";

-- DropTable
DROP TABLE "ComboCandidate";


-- Samo pobednik meča (1 i 2): otvoreni tipovi 2+, 0–3 i spojeni tipovi se uklanjaju iz filtera.
-- Završeni (WON/LOST/VOID) ostaju u bazi kao istorija; statistika ih više ne računa.
UPDATE "FilterSetSelection" fss
SET "removedAt" = NOW()
FROM "TrackedSelection" t
WHERE fss."trackedSelectionId" = t.id
  AND fss."removedAt" IS NULL
  AND fss."settlementStatus" NOT IN ('WON', 'LOST', 'VOID')
  AND t."marketType" NOT IN ('HOME', 'AWAY');
