import { describe, expect, it } from "vitest";
import { periodRange, zonedMidnight, zonedYmd } from "@/lib/time";

const ok = (r: ReturnType<typeof periodRange>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("vreme – Europe/Belgrade", () => {
  it("ponoć zimi je 23:00 UTC prethodnog dana, leti 22:00 UTC", () => {
    expect(zonedMidnight({ y: 2026, m: 11, d: 10 }).toISOString()).toBe("2026-11-09T23:00:00.000Z");
    expect(zonedMidnight({ y: 2026, m: 7, d: 1 }).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("dani prelaska na letnje/zimsko vreme", () => {
    expect(zonedMidnight({ y: 2026, m: 3, d: 29 }).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedMidnight({ y: 2026, m: 3, d: 30 }).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(zonedMidnight({ y: 2026, m: 10, d: 25 }).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedMidnight({ y: 2026, m: 10, d: 26 }).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
  it("posle 23:00 UTC u Beogradu je već sledeći dan", () => {
    expect(zonedYmd(new Date("2026-11-09T23:30:00Z"))).toEqual({ y: 2026, m: 11, d: 10 });
  });
});

describe("periodi robota", () => {
  const now = new Date("2026-11-09T21:00:00Z"); // 22:00 u Beogradu
  it("danas: od sada do ponoći", () => {
    const r = ok(periodRange("today", now));
    expect(r.from).toEqual(now);
    expect(r.to.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });
  it("sutra: ceo sutrašnji dan", () => {
    const r = ok(periodRange("tomorrow", now));
    expect(r.from.toISOString()).toBe("2026-11-09T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
  it("naredna 3 i 7 dana", () => {
    expect(ok(periodRange("next3", now)).to.toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(ok(periodRange("next7", now)).to.toISOString()).toBe("2026-11-15T23:00:00.000Z");
  });
  it("prilagođeni period: uključuje poslednji dan, ne počinje u prošlosti", () => {
    const r = ok(periodRange("custom", now, { from: "2026-11-09", to: "2026-11-10" }));
    expect(r.from).toEqual(now);
    expect(r.to.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
  it("prilagođeni period: greške", () => {
    expect("error" in periodRange("custom", now, { from: "x", to: "2026-11-10" })).toBe(true);
    expect("error" in periodRange("custom", now, { from: "2026-11-12", to: "2026-11-10" })).toBe(true);
    expect("error" in periodRange("custom", now, { from: "2026-11-01", to: "2026-11-05" })).toBe(true);
    expect("error" in periodRange("custom", now, { from: "2026-11-10", to: "2026-11-30" })).toBe(true);
    expect("error" in periodRange("custom", now, { from: "2026-02-30", to: "2026-03-01" })).toBe(true);
  });
});
