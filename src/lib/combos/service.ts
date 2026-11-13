import { Prisma, type PrismaClient } from "@prisma/client";
import { COMBO_PARTS, MARKET_LABELS, type ComboTypeCode } from "@/lib/odds";
import { addEntry, FilterError } from "@/lib/filter/service";

export const MANUAL_SOURCE = "AdmiralBet · ručni unos";

export async function listCandidates(db: PrismaClient, scanId: string) {
  const rows = await db.comboCandidate.findMany({
    where: { scanId },
    include: { match: true },
    orderBy: { match: { kickoffTime: "asc" } },
  });
  const manual = await db.marketSelection.findMany({
    where: { scanId, manualOdds: true, matchId: { in: rows.map((r) => r.matchId) } },
  });
  return rows.map((r) => {
    const type = r.comboType as ComboTypeCode;
    const [w, g] = COMBO_PARTS[type];
    const entered = manual.find((m) => m.matchId === r.matchId && m.marketType === r.comboType);
    return {
      id: r.id,
      matchId: r.matchId,
      comboType: type,
      label: MARKET_LABELS[type],
      legs: `${MARKET_LABELS[w]} @ ${r.winnerOdds.toNumber().toFixed(2)} + ${MARKET_LABELS[g]} @ ${r.goalsOdds.toNumber().toFixed(2)}`,
      homeTeam: r.match.homeTeam,
      awayTeam: r.match.awayTeam,
      competition: r.match.competition,
      country: r.match.country,
      kickoffTime: r.match.kickoffTime.toISOString(),
      enteredOdds: entered?.odds.toNumber() ?? null,
      marketSelectionId: entered?.id ?? null,
    };
  });
}
export type CandidateDto = Awaited<ReturnType<typeof listCandidates>>[number];

/** Kvota sa sajta: broj veći od 1.00, najviše 100, najviše 2 decimale (prihvata i zarez). */
export function parseManualOdds(raw: unknown): number {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 1 || n > 100) throw new FilterError("Unesite kvotu veću od 1.00 (npr. 1.48).");
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) throw new FilterError("Kvota može imati najviše dve decimale.");
  return Math.round(n * 100) / 100;
}

/**
 * Ručno unet spojeni tip: čuva kvotu sa sajta kladionice i dodaje spojeni tip u filter.
 * Pojedinačni tipovi iste utakmice u tom filteru se uklanjaju (spojeni tip ih zamenjuje – nema duplog igranja).
 */
export async function addManualCombo(db: PrismaClient, input: { filterSetId: string; candidateId: string; odds: unknown; maxOdds: number; now?: Date }) {
  const now = input.now ?? new Date();
  const odds = parseManualOdds(input.odds);
  const cand = await db.comboCandidate.findUnique({ where: { id: input.candidateId }, include: { match: true } });
  if (!cand) throw new FilterError("Kandidat ne postoji.", 404);
  if (cand.match.kickoffTime <= now) throw new FilterError("Utakmica je već počela – spojeni tip ne može da se doda.");

  const key = { scanId_matchId_marketType: { scanId: cand.scanId, matchId: cand.matchId, marketType: cand.comboType } };
  const existing = await db.marketSelection.findUnique({ where: key, include: { _count: { select: { filterEntries: true } } } });
  let msId: string;
  if (existing) {
    const same = Math.abs(existing.odds.toNumber() - odds) < 1e-9;
    if (!same && existing._count.filterEntries > 0) {
      throw new FilterError(`Kvota za ovaj spojeni tip je već uneta (${existing.odds.toNumber().toFixed(2)}) i koristi se u filteru.`, 409);
    }
    if (!same) await db.marketSelection.update({ where: { id: existing.id }, data: { odds: new Prisma.Decimal(odds), oddsTimestamp: now } });
    msId = existing.id;
  } else {
    msId = (await db.marketSelection.create({
      data: { matchId: cand.matchId, scanId: cand.scanId, marketType: cand.comboType, odds: new Prisma.Decimal(odds), oddsTimestamp: now, source: MANUAL_SOURCE, manualOdds: true },
    })).id;
  }

  // spojeni tip zamenjuje pojedinačne tipove iste utakmice u ovom filteru
  const replaced = await db.filterSetSelection.updateMany({
    where: { filterSetId: input.filterSetId, removedAt: null, trackedSelection: { matchId: cand.matchId, marketType: { in: ["HOME", "AWAY", "OVER_1_5", "UNDER_3_5"] } } },
    data: { removedAt: now },
  });
  const entryId = await addEntry(db, { filterSetId: input.filterSetId, marketSelectionId: msId, maxOdds: input.maxOdds, now });
  return { entryId, replaced: replaced.count, odds };
}
