import type { MarketTypeCode } from "@/lib/odds";
import { OddsPapiClient, resolveOutcomeMap, type OddsPapiMarket, type OutcomeMap } from "@/lib/robot/providers/oddspapi";

/**
 * OddsPapi – rezervni izvor: /v4/settlements vraća WIN/LOSE po ishodu za tačnu utakmicu (isti ID kao kvote).
 * Troši 1 zahtev po utakmici, zato se koristi štedljivo.
 */
export type OpSettlement = Partial<Record<MarketTypeCode, "WON" | "LOST" | "VOID">>;

type Settlements = { markets?: Record<string, { outcomes?: Record<string, { players?: Record<string, { result?: string }> }> }> };

let mapCache: { at: number; map: OutcomeMap } | null = null;

export type OpResponse = { result: OpSettlement; rawMarketIds: string[]; score?: { home: number; away: number } | null };

type Scores = { scores?: { periods?: Record<string, { participant1Score?: number | null; participant2Score?: number | null }> } };

/** Rezultat posle 90 minuta iz /v4/scores (period "fulltime"). */
export function parseScores(data: Scores): { home: number; away: number } | null {
  const ft = data.scores?.periods?.fulltime;
  if (!ft || typeof ft.participant1Score !== "number" || typeof ft.participant2Score !== "number") return null;
  return { home: ft.participant1Score, away: ft.participant2Score };
}

/**
 * Prvo /scores (mali odgovor, daje rezultat posle 90 min). Ako tamo nema "fulltime", tek onda /settlements.
 * Najčešće troši 1 zahtev po utakmici.
 */
export async function fetchOddsPapiResult(client: OddsPapiClient, fixtureId: string): Promise<OpResponse> {
  const scores = await client.get<Scores>("/scores", { fixtureId });
  const score = parseScores(scores);
  if (score) return { result: {}, rawMarketIds: Object.keys(scores.scores?.periods ?? {}), score };
  return fetchOddsPapiSettlement(client, fixtureId);
}

export async function fetchOddsPapiSettlement(client: OddsPapiClient, fixtureId: string): Promise<OpResponse> {
  if (!mapCache || Date.now() - mapCache.at > 24 * 3600_000) {
    mapCache = { at: Date.now(), map: resolveOutcomeMap(await client.get<OddsPapiMarket[]>("/markets", { language: "en" })) };
  }
  const data = await client.get<Settlements>("/settlements", { fixtureId });
  return { result: parseSettlement(data, mapCache.map), rawMarketIds: Object.keys(data.markets ?? {}).slice(0, 40) };
}

export function parseSettlement(data: Settlements, map: OutcomeMap): OpSettlement {
  const out: OpSettlement = {};
  for (const [type, refs] of Object.entries(map) as [MarketTypeCode, { marketId: string; outcomeId: string }[]][]) {
    for (const ref of refs) {
      const r = data.markets?.[ref.marketId]?.outcomes?.[ref.outcomeId]?.players?.["0"]?.result?.toUpperCase();
      if (r === "WIN") out[type] = "WON";
      else if (r === "LOSE" || r === "LOSS") out[type] = "LOST";
      else if (r === "VOID" || r === "PUSH" || r === "CANCELLED") out[type] = "VOID";
      if (out[type]) break;
    }
  }
  return out;
}
