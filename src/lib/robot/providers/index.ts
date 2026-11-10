import type { OddsProvider, ProviderInfo } from "../types";
import { demoProvider } from "./demo";
import { createOddsPapiProvider, ODDSPAPI_BOOKMAKERS, OddsPapiClient } from "./oddspapi";

const KEY_NAMES = ["ODDSPAPI_API_KEY", "ODDSPAPI_KEY", "ODDS_PAPI_API_KEY", "ODDSPAPI"];
export const oddsPapiKey = () => KEY_NAMES.map((n) => process.env[n]?.trim()).find(Boolean) || null;

/** Stari ID iz prvih skeniranja. */
const LEGACY: Record<string, string> = { "oddspapi-soccerbet": "oddspapi:soccerbet.rs" };

export type ProviderOption = ProviderInfo & { available: boolean; reason?: string; bookmakerSlug?: string };

export function availableProviders(): ProviderOption[] {
  const key = oddsPapiKey();
  return [
    ...ODDSPAPI_BOOKMAKERS.map((b) => ({
      id: `oddspapi:${b.slug}`, name: b.name, sourceLabel: `${b.name} · OddsPapi`, isDemo: false, bookmakerSlug: b.slug,
      available: !!key, reason: key ? undefined : "ODDSPAPI_API_KEY nije podešen",
    })),
    { id: demoProvider.id, name: demoProvider.name, sourceLabel: demoProvider.sourceLabel, isDemo: true, available: true },
  ];
}

export function providerName(id: string): string {
  const real = LEGACY[id] ?? id;
  return availableProviders().find((p) => p.id === real)?.name ?? id;
}

export function getProvider(id: string): OddsProvider | null {
  const real = LEGACY[id] ?? id;
  if (real === demoProvider.id) return demoProvider;
  const book = ODDSPAPI_BOOKMAKERS.find((b) => `oddspapi:${b.slug}` === real);
  const key = oddsPapiKey();
  if (book && key) return createOddsPapiProvider(key, fetch, new OddsPapiClient(key), book);
  return null;
}
