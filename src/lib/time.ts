export const TZ = "Europe/Belgrade";

type Ymd = { y: number; m: number; d: number };

/** Razlika (ms) između lokalnog vremena u zoni i UTC-a za dati trenutak. */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Ponoć datog dana u zoni (npr. Beograd) kao UTC trenutak. Ispravno i kod letnjeg računanja vremena. */
export function zonedMidnight({ y, m, d }: Ymd, tz = TZ): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  const off2 = tzOffsetMs(new Date(t), tz);
  t = guess - off2;
  return new Date(t);
}

export function zonedYmd(date: Date, tz = TZ): Ymd {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date).split("-").map(Number);
  return { y, m, d };
}

export function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function parseYmd(s: string): Ymd | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return null;
  const v = { y: +mt[1], m: +mt[2], d: +mt[3] };
  const back = addDays(v, 0);
  return back.y === v.y && back.m === v.m && back.d === v.d ? v : null;
}

export const ymdToString = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const PERIODS = {
  today: "Danas",
  tomorrow: "Sutra",
  next3: "Naredna 3 dana",
  next7: "Narednih 7 dana",
  custom: "Prilagođeni period",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export const MAX_CUSTOM_DAYS = 14;

export type PeriodRange = { from: Date; to: Date; label: string };

/** Period skeniranja u beogradskom vremenu. "to" je isključivo (ponoć posle poslednjeg dana). */
export function periodRange(period: PeriodKey, now: Date, custom?: { from?: string; to?: string }): PeriodRange | { error: string } {
  const today = zonedYmd(now);
  const mid = (n: number) => zonedMidnight(addDays(today, n));
  const fromNow = (d: Date) => (d < now ? now : d);
  switch (period) {
    case "today": return { from: now, to: mid(1), label: PERIODS.today };
    case "tomorrow": return { from: mid(1), to: mid(2), label: PERIODS.tomorrow };
    case "next3": return { from: now, to: mid(3), label: PERIODS.next3 };
    case "next7": return { from: now, to: mid(7), label: PERIODS.next7 };
    case "custom": {
      const f = parseYmd(custom?.from ?? "");
      const t = parseYmd(custom?.to ?? "");
      if (!f || !t) return { error: "Unesite ispravne datume (od i do)." };
      const fromD = zonedMidnight(f);
      const toD = zonedMidnight(addDays(t, 1));
      if (toD <= fromD) return { error: "Datum „do“ mora biti isti ili posle datuma „od“." };
      if (toD <= now) return { error: "Period je već prošao. Robot traži samo utakmice koje tek počinju." };
      const days = Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(f.y, f.m - 1, f.d)) / 86400000) + 1;
      if (days > MAX_CUSTOM_DAYS) return { error: `Period može biti najviše ${MAX_CUSTOM_DAYS} dana.` };
      return { from: fromNow(fromD), to: toD, label: `${ymdToString(f)} – ${ymdToString(t)}` };
    }
  }
}
