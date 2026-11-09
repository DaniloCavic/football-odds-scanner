import { describe, expect, it } from "vitest";
import { isRealFootball } from "@/lib/robot/football";

const m = (over: Partial<Parameters<typeof isRealFootball>[0]> = {}) =>
  isRealFootball({ sport: "football", homeTeam: "Arsenal", awayTeam: "Chelsea", competition: "Premier League", country: "England", ...over });

describe("samo pravi fudbal", () => {
  it("pravi fudbal prolazi", () => {
    expect(m()).toBe(true);
    expect(m({ homeTeam: "FC 08 Homburg", competition: "Regionalliga Südwest" })).toBe(true);
    expect(m({ homeTeam: "Arsenal (W)", awayTeam: "Chelsea (W)", competition: "WSL" })).toBe(true);
    expect(m({ homeTeam: "Crvena zvezda", awayTeam: "Partizan", competition: "Super liga" })).toBe(true);
  });
  it("drugi sportovi se izbacuju", () => expect(m({ sport: "other" })).toBe(false));
  it("virtuelni fudbal, e-sport i simulacije se izbacuju", () => {
    expect(m({ competition: "Virtual Football League" })).toBe(false);
    expect(m({ competition: "Esoccer Battle - 8 mins play" })).toBe(false);
    expect(m({ competition: "E-Football GT Leagues" })).toBe(false);
    expect(m({ homeTeam: "Arsenal SRL", awayTeam: "Chelsea SRL" })).toBe(false);
    expect(m({ competition: "Cyber Live Arena" })).toBe(false);
    expect(m({ competition: "FIFA 24 Volta" })).toBe(false);
    expect(m({ competition: "Simulated Reality League" })).toBe(false);
    expect(m({ competition: "Virtuelni fudbal" })).toBe(false);
    expect(m({ competition: "EA Sports FC 25 Champions League" })).toBe(false);
  });
});
