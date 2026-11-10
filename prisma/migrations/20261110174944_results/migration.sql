-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "apiFootballId" INTEGER,
ADD COLUMN     "finalAwayScore" INTEGER,
ADD COLUMN     "finalHomeScore" INTEGER,
ADD COLUMN     "resultMatchConfidence" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "oddsPapiResultChecksPerDay" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "resultCheckMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "ResultUpdate" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "matchStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ResultUpdate_matchId_fetchedAt_idx" ON "ResultUpdate"("matchId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "ResultUpdate" ADD CONSTRAINT "ResultUpdate_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
