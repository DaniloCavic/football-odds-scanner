import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken, newSessionToken } from "@/lib/auth/token";
import { createRateLimiter } from "@/lib/rate-limit";

describe("lozinke", () => {
  it("hash nije lozinka i proverava se ispravno", async () => {
    const h = await hashPassword("tajna-lozinka");
    expect(h).not.toContain("tajna-lozinka");
    expect(await verifyPassword("tajna-lozinka", h)).toBe(true);
    expect(await verifyPassword("pogresna", h)).toBe(false);
  });
});

describe("tokeni sesije", () => {
  it("su nasumični i u bazu ide samo hash", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});

describe("rate limiter", () => {
  it("dozvoljava limit pokušaja, blokira sledeći i resetuje se posle prozora", () => {
    let t = 0;
    const rl = createRateLimiter(3, 1000, () => t);
    expect([rl.hit("k"), rl.hit("k"), rl.hit("k")]).toEqual([true, true, true]);
    expect(rl.hit("k")).toBe(false);
    expect(rl.hit("drugi")).toBe(true);
    t = 1001;
    expect(rl.hit("k")).toBe(true);
  });
  it("reset briše brojač", () => {
    const rl = createRateLimiter(1, 1000, () => 0);
    rl.hit("k");
    rl.reset("k");
    expect(rl.hit("k")).toBe(true);
  });
});
