import type { OddsProvider, ProviderInfo } from "../types";
import { demoProvider } from "./demo";
import { createOddsPapiProvider } from "./oddspapi";

const KEY_NAMES = ["ODDSPAPI_API_KEY", "ODDSPAPI_KEY", "ODDS_PAPI_API_KEY", "ODDSPAPI"];
export const oddsPapiKey = () => KEY_NAMES.map((n) => process.env[n]?.trim()).find(Boolean) || null;

export function availableProviders(): (ProviderInfo & { available: boolean; reason?: string })[] {
  const key = oddsPapiKey();
  return [
    { id: "oddspapi-soccerbet", name: "Soccerbet (preko OddsPapi)", sourceLabel: "Soccerbet · OddsPapi", isDemo: false, available: !!key, reason: key ? undefined : "ODDSPAPI_API_KEY nije podešen" },
    { id: demoProvider.id, name: demoProvider.name, sourceLabel: demoProvider.sourceLabel, isDemo: true, available: true },
  ];
}

export function getProvider(id: string): OddsProvider | null {
  if (id === demoProvider.id) return demoProvider;
  if (id === "oddspapi-soccerbet") {
    const key = oddsPapiKey();
    return key ? createOddsPapiProvider(key) : null;
  }
  return null;
}
