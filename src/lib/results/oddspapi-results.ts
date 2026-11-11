import type { MarketTypeCode } from "@/lib/odds";
import { OddsPapiClient, resolveOutcomeMap, type OddsPapiMarket, type OutcomeMap } from "@/lib/robot/providers/oddspapi";

/**
 * OddsPapi – rezervni izvor: /v4/settlements vraća WIN/LOSE po ishodu za tačnu utakmicu (isti ID kao kvote).
 * Troši 1 zahtev po utakmici, zato se koristi štedljivo.
 */
export type OpSettlement = Partial<Record<MarketTypeCode, "WON" | "LOST" | "VOID">>;

type Settlements = { markets?: Record<string, { outcomes?: Record<string, { players?: Record<string, { result?: string }> }> }> };

let mapCache: { at: number; map: OutcomeMap } | null = null;

export type OpResponse = { result: OpSettlement; rawMarketIds: string[] };

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
