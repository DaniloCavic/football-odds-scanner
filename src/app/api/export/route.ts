import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { MARKET_LABELS, type MarketTypeCode } from "@/lib/odds";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // zaštita od CSV/Excel formula injekcije
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * Izvoz podataka (samo administrator).
 * ?format=csv  – svi tipovi iz filtera (za Excel; separator ';')
 * ?format=json – kompletna rezervna kopija (filteri, tipovi, utakmice, rezultati, podešavanja)
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Niste prijavljeni." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Samo administrator." }, { status: 403 });
  const format = new URL(req.url).searchParams.get("format") ?? "csv";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  if (format === "json") {
    const [settings, filterSets, entries, tracked, matches, results, audit] = await Promise.all([
      prisma.settings.findMany(),
      prisma.filterSet.findMany(),
      prisma.filterSetSelection.findMany(),
      prisma.trackedSelection.findMany(),
      prisma.match.findMany({ where: { trackedSelections: { some: {} } } }),
      prisma.resultUpdate.findMany(),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, settings, filterSets, entries, tracked, matches, results, audit }, null, 1);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="fos-backup-${stamp}.json"` } });
  }

  const rows = await prisma.filterSetSelection.findMany({
    include: { filterSet: true, trackedSelection: { include: { match: true } }, marketSelection: true },
    orderBy: [{ filterSet: { createdAt: "asc" } }, { addedAt: "asc" }],
  });
  const header = ["Filter", "Filter obrisan", "Uklonjen iz filtera", "Početak (Beograd)", "Država", "Takmičenje", "Domaćin", "Gost", "Tip", "Kvota", "Ulog", "Status", "Rezultat", "Isplata", "Neto", "Izvor kvote", "Izvor rezultata", "DEMO"];
  const fmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", dateStyle: "short", timeStyle: "short" });
  const lines = rows.map((r) => {
    const t = r.trackedSelection, m = t.match;
    return [
      r.filterSet.name, r.filterSet.status === "DELETED" ? "da" : "", r.removedAt ? "da" : "", fmt.format(m.kickoffTime), m.country, m.competition,
      m.homeTeam, m.awayTeam, MARKET_LABELS[t.marketType as MarketTypeCode], r.oddsSnapshot.toFixed(2).replace(".", ","), r.stake.toFixed(2).replace(".", ","),
      r.settlementStatus, t.finalHomeScore != null ? `${t.finalHomeScore}:${t.finalAwayScore}` : "", r.grossReturn?.toFixed(2).replace(".", ",") ?? "",
      r.netProfit?.toFixed(2).replace(".", ",") ?? "", r.marketSelection.source, t.resultSource ?? "", r.marketSelection.isDemo ? "da" : "",
    ].map(csvCell).join(";");
  });
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="fos-tipovi-${stamp}.csv"` } });
}
