import "server-only";
import { prisma } from "@/lib/db";

export async function getSettings() {
  const s = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return {
    maxOdds: s.maxOdds.toNumber(),
    stakePerSelection: s.stakePerSelection.toNumber(),
    currency: s.currency,
    timezone: s.timezone,
    maxRequestsPerScan: s.maxRequestsPerScan,
    resultCheckMinutes: s.resultCheckMinutes,
    apiFootballDailyCap: s.apiFootballDailyCap,
    oddsPapiResultChecksPerDay: s.oddsPapiResultChecksPerDay,
    excludeGoalsPair: s.excludeGoalsPair,
    combineResultGoals: s.combineResultGoals,
    comboFallback: s.comboFallback as "SKIP" | "WINNER_ONLY" | "BOTH_SINGLE",
    updatedAt: s.updatedAt,
  };
}
