import type { MarketTypeCode } from "@/lib/odds";

export type ProviderOdds = { price: number; changedAt: Date };

export type ProviderFixture = {
  externalId: string;
  sport: "football" | "other";
  homeTeam: string;
  awayTeam: string;
  competition: string;
  country: string | null;
  externalCompetitionId: string | null;
  kickoffTime: Date;
  /** Šifre tržišta koje izvor ima za ovu utakmicu (samo za dijagnostiku). */
  rawMarketIds?: string[];
  /** Kvote koje provajder trenutno nudi (bez ikakvog filtriranja). */
  odds: Partial<Record<MarketTypeCode, ProviderOdds>>;
};

export type ScanContext = {
  /** Da li je korisnik kliknuo STOP. */
  shouldStop: () => Promise<boolean>;
  setTotal: (n: number) => Promise<void>;
  /** Poziva se pri svakom (naplativom) zahtevu ka API-ju. */
  countRequest: () => Promise<void>;
  maxRequests: number;
  warn: (msg: string) => Promise<void>;
  diagnostic?: (data: Record<string, unknown>) => Promise<void>;
};

export type ProviderInfo = {
  id: string;
  name: string;
  /** Tekst izvora koji se čuva uz svaku kvotu. */
  sourceLabel: string;
  isDemo: boolean;
};

export interface OddsProvider extends ProviderInfo {
  scan(range: { from: Date; to: Date }, ctx: ScanContext): AsyncGenerator<ProviderFixture>;
}

/** Greška koju treba prikazati korisniku kao razlog prekida skeniranja. */
export class ProviderError extends Error {
  constructor(message: string, public readonly code: string = "PROVIDER_ERROR") {
    super(message);
  }
}

/** Robot je stao jer je dostigao limit zahteva po skeniranju. */
export class RequestLimitReached extends Error {
  constructor(limit: number) {
    super(`Dostignut limit od ${limit} API zahteva po skeniranju (Podešavanja). Sačuvano je ono što je pronađeno do tada.`);
  }
}
