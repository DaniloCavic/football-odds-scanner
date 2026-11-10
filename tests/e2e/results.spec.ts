import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Lozinka").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("ceo tok: filter → utakmica završena → obračun, profit, ručna ispravka", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop tok");
  await login(page);

  // DEMO skeniranje i filter sa 3 tipa
  await page.goto("/robot");
  await page.getByRole("radio", { name: /DEMO/ }).check();
  await page.getByRole("button", { name: "Narednih 7 dana", exact: true }).click();
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Radi");
  await expect(page.getByTestId("scan-status")).toHaveText("Završeno", { timeout: 60_000 });
  await page.goto("/filter");
  await page.getByRole("button", { name: "+ Novi filter" }).click();
  await page.getByLabel("Naziv novog filtera").fill("Rezultati E2E");
  await page.getByRole("button", { name: "Napravi" }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^Dodaj (?!sve)/ }).first().click();
    await expect(page.getByTestId("filter-count")).toHaveText(String(i + 1));
  }

  // "Vreme prolazi": utakmice iz filtera pomeramo 3 sata u prošlost
  const db = new PrismaClient({ datasourceUrl: E2E_ENV.DATABASE_URL });
  const matches = await db.match.findMany({ where: { trackedSelections: { some: { filterEntries: { some: { removedAt: null, filterSet: { name: "Rezultati E2E" } } } } } } });
  for (const m of matches) await db.match.update({ where: { id: m.id }, data: { kickoffTime: new Date(Date.now() - 3 * 3600_000) } });
  const expected = await db.trackedSelection.count({ where: { matchId: { in: matches.map((m) => m.id) }, status: { in: ["PENDING", "LIVE"] } } });
  expect(expected).toBeGreaterThanOrEqual(3);

  // Aktivne selekcije: ručno pokretanje provere
  await page.goto("/aktivne");
  await page.getByRole("button", { name: "Proveri rezultate sada" }).click();
  await expect(page.getByRole("status")).toContainText(`obračunato ${expected}`);
  const mine = await db.trackedSelection.findMany({ where: { matchId: { in: matches.map((m) => m.id) } } });
  expect(mine.every((t) => t.status === "WON" || t.status === "LOST")).toBe(true);
  const statuses = await page.locator("[data-testid=tracked-table] [data-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  expect(statuses.filter((s) => s === "WON" || s === "LOST").length).toBeGreaterThanOrEqual(3);

  // Ponovna provera ne obračunava ponovo
  await page.getByRole("button", { name: "Proveri rezultate sada" }).click();
  await expect(page.getByRole("status")).toContainText("obračunato 0");

  // Filter: prošlo/palo, prolaznost i neto profit iz baze
  const entries = await db.filterSetSelection.findMany({ where: { filterSet: { name: "Rezultati E2E" } } });
  const net = entries.reduce((a, e) => a + Number(e.netProfit), 0);
  await page.goto("/filter");
  await expect(page.getByTestId("filter-summary")).toBeVisible();
  const netText = (await page.getByTestId("filter-net").textContent())!;
  expect(Number(netText.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."))).toBeCloseTo(net, 2);

  // Detalji + ručna ispravka sa obrazloženjem
  await page.goto("/aktivne");
  await page.getByRole("tab", { name: /Prošlo|Palo/ }).filter({ hasNotText: / 0$/ }).first().click();
  await page.locator("[data-testid=tracked-table] tbody tr").first().click();
  const dialog = page.getByRole("dialog", { name: "Detalji selekcije" });
  await expect(dialog.getByText("Istorija statusa")).toBeVisible();
  await expect(dialog.getByText(/DEMO/).first()).toBeVisible();
  await dialog.getByLabel("Novi status").selectOption("VOID");
  await dialog.getByLabel("Obrazloženje").fill("Utakmica poništena odlukom saveza");
  await dialog.getByRole("button", { name: "Sačuvaj ispravku" }).click();
  await expect(dialog.getByText("(ručno)")).toBeVisible();
  await expect(dialog.getByText("Utakmica poništena odlukom saveza")).toBeVisible();
  expect(await db.auditLog.count({ where: { action: "MANUAL_OVERRIDE" } })).toBe(1);

  // Dashboard pokazuje završene tipove i neto
  await page.goto("/");
  await expect(page.getByText("Završeni tipovi").locator("..").getByText("3", { exact: true })).toBeVisible(); // 3 tipa u aktivnom filteru
  await db.$disconnect();
});
