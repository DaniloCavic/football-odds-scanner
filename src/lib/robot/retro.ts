import type { PrismaClient } from "@prisma/client";

/**
 * Jednokratno primenjuje pravilo „2+ i 0–3 zajedno“ na stara skeniranja:
 * - oba tipa takve utakmice (u istom skeniranju) dobijaju excludedReason = GOALS_PAIR
 * - njihovi zapisi u filterima se uklanjaju iz prikaza (removedAt), a statistika ih ne računa
 * - brojke skeniranja se preračunavaju; sve se upisuje u audit log
 * Idempotentno – drugo pokretanje ne menja ništa.
 */
export async function retroExcludeGoalsPairs(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const marked = await tx.$executeRaw`
      UPDATE "MarketSelection" ms SET "excludedReason" = 'GOALS_PAIR'
      WHERE ms."excludedReason" IS NULL AND ms."marketType" IN ('OVER_1_5', 'UNDER_3_5')
        AND EXISTS (
          SELECT 1 FROM "MarketSelection" o
          WHERE o."scanId" = ms."scanId" AND o."matchId" = ms."matchId" AND o.id <> ms.id
            AND o."marketType" IN ('OVER_1_5', 'UNDER_3_5') AND o."marketType" <> ms."marketType"
        )`;
    const removed = await tx.$executeRaw`
      UPDATE "FilterSetSelection" f SET "removedAt" = now()
      FROM "MarketSelection" ms
      WHERE f."marketSelectionId" = ms.id AND ms."excludedReason" = 'GOALS_PAIR' AND f."removedAt" IS NULL`;
    if (marked > 0) {
      await tx.$executeRaw`
        UPDATE "RobotScan" s SET
          "selectionsFound" = (SELECT count(*) FROM "MarketSelection" m WHERE m."scanId" = s.id AND m."excludedReason" IS NULL),
          "pairsExcluded" = (SELECT count(DISTINCT m."matchId") FROM "MarketSelection" m WHERE m."scanId" = s.id AND m."excludedReason" = 'GOALS_PAIR')
        WHERE EXISTS (SELECT 1 FROM "MarketSelection" m WHERE m."scanId" = s.id AND m."excludedReason" = 'GOALS_PAIR')`;
      await tx.auditLog.create({
        data: {
          entityType: "Rule", entityId: "GOALS_PAIR", action: "RETRO_EXCLUDE",
          newValue: { selectionsExcluded: marked, filterEntriesRemoved: removed },
          reason: "Utakmice sa 2+ i 0–3 do maks. kvote izbačene iz starih skeniranja, filtera i statistike.",
        },
      });
    }
    return { selectionsExcluded: marked, filterEntriesRemoved: removed };
  });
}
