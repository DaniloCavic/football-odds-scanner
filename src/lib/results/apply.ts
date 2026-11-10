import type { PrismaClient } from "@prisma/client";
import { amountsFor, type TrackStatus } from "./settle-math";

const AUTO_FROM: Record<TrackStatus, TrackStatus[]> = {
  PENDING: [],
  LIVE: ["PENDING"],
  POSTPONED: ["PENDING", "LIVE"],
  WON: ["PENDING", "LIVE", "POSTPONED"],
  LOST: ["PENDING", "LIVE", "POSTPONED"],
  VOID: ["PENDING", "LIVE", "POSTPONED"],
  NEEDS_REVIEW: ["PENDING", "LIVE", "POSTPONED"],
};

export type Decision = {
  status: TrackStatus;
  home?: number | null;
  away?: number | null;
  source: string;
  reason?: string;
  /** Ručna ispravka administratora – dozvoljena iz bilo kog statusa, uz obrazloženje. */
  manual?: { userId: string };
};

/**
 * Menja status praćenog tipa i obračunava SVE njegove zapise u filterima.
 * Idempotentno: automatski obračun prolazi samo iz otvorenih statusa, pa isti tip nikad ne bude obračunat dvaput.
 */
export async function applyDecision(db: PrismaClient, trackedId: string, d: Decision): Promise<boolean> {
  if (d.manual && !d.reason?.trim()) throw new Error("Obrazloženje je obavezno za ručnu ispravku.");
  return db.$transaction(async (tx) => {
    const t = await tx.trackedSelection.findUnique({ where: { id: trackedId } });
    if (!t) return false;
    const from = t.status as TrackStatus;
    if (!d.manual && !AUTO_FROM[d.status].includes(from)) return false;
    if (from === d.status && !d.manual) return false;

    const final = d.status === "WON" || d.status === "LOST" || d.status === "VOID";
    const updated = await tx.trackedSelection.updateMany({
      where: { id: trackedId, status: from },
      data: {
        status: d.status,
        finalHomeScore: d.home ?? (final ? t.finalHomeScore : null),
        finalAwayScore: d.away ?? (final ? t.finalAwayScore : null),
        resultSource: d.source,
        settledAt: final ? new Date() : null,
      },
    });
    if (updated.count !== 1) return false; // neko drugi je već promenio – ne radimo ništa

    const entries = await tx.filterSetSelection.findMany({ where: { trackedSelectionId: trackedId } });
    for (const e of entries) {
      const a = amountsFor(d.status, e.stake, e.oddsSnapshot);
      await tx.filterSetSelection.update({
        where: { id: e.id },
        data: { settlementStatus: d.status, grossReturn: a.grossReturn, netProfit: a.netProfit },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: d.manual?.userId ?? null,
        entityType: "TrackedSelection",
        entityId: trackedId,
        action: d.manual ? "MANUAL_OVERRIDE" : "STATUS",
        oldValue: { status: from, home: t.finalHomeScore, away: t.finalAwayScore },
        newValue: { status: d.status, home: d.home ?? null, away: d.away ?? null, source: d.source },
        reason: d.reason ?? null,
      },
    });
    return true;
  });
}
