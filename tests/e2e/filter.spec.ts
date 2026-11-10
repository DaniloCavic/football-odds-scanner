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

async function demoScan(page: Page) {
  await page.goto("/robot");
  await page.getByRole("radio", { name: /DEMO/ }).check();
  await page.getByRole("button", { name: "Narednih 7 dana", exact: true }).click();
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Radi");
  await expect(page.getByTestId("scan-status")).toHaveText("Završeno", { timeout: 60_000 });
}

const count = (page: Page) => page.getByTestId("filter-count");

test("desktop: prevlačenje, +, bez duplikata, trajno čuvanje, uklanjanje i čišćenje", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop tok");
  await login(page);
  await demoScan(page);
  await page.goto("/filter");

  await page.getByRole("button", { name: "+ Novi filter" }).click();
  await page.getByLabel("Naziv novog filtera").fill("E2E vikend");
  await page.getByRole("button", { name: "Napravi" }).click();
  await expect(page.getByLabel("Izabrani filter")).toContainText("E2E vikend");
  await expect(count(page)).toHaveText("0");

  // 1) dugme +
  const firstAdd = page.getByRole("button", { name: /^Dodaj (?!sve)/ }).first();
  await firstAdd.click();
  await expect(count(page)).toHaveText("1");
  await expect(page.getByLabel("Već u filteru").first()).toBeVisible();

  // 2) prevlačenje mišem
  const chip = page.locator("[data-testid^=chip-]").filter({ has: page.locator("svg") }).first();
  const zone = page.getByTestId("drop-zone");
  const a = (await chip.boundingBox())!;
  const b = (await zone.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(count(page)).toHaveText("2");

  // kvote u filteru poštuju pravilo
  const odds = await page.locator("[data-testid=filter-list] [data-odds]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-odds"))));
  expect(odds.every((o) => o > 1 && o <= 1.3)).toBe(true);

  // 3) duplikat preko API-ja se odbija
  const setId = await page.getByLabel("Izabrani filter").inputValue();
  const entries = await (await page.request.get(`/api/filter-sets/${setId}/entries`)).json();
  const dup = await page.request.post(`/api/filter-sets/${setId}/entries`, { data: { marketSelectionId: entries[0].marketSelectionId } });
  expect(dup.status()).toBe(409);

  // 4) trajno: refresh, pa odjava/prijava
  await page.reload();
  await expect(count(page)).toHaveText("2");
  await page.getByRole("button", { name: "Odjava" }).click();
  await login(page);
  await page.goto("/filter");
  await expect(count(page)).toHaveText("2");

  // 5) dashboard broji aktivne selekcije
  await page.goto("/");
  await expect(page.getByText("Aktivne selekcije").locator("..").getByText("2", { exact: true })).toBeVisible();

  // 6) uklanjanje jednog, pa čišćenje uz potvrdu
  await page.goto("/filter");
  await page.getByRole("button", { name: /^Ukloni / }).first().click();
  await expect(count(page)).toHaveText("1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Očisti filter" }).click();
  await expect(count(page)).toHaveText("0");

  // 7) dodaj sve – uz potvrdu, preskače ono što je već u filteru
  await page.getByRole("button", { name: /^Ukloni / }).count();
  await page.getByRole("button", { name: /^Dodaj (?!sve)/ }).first().click();
  await expect(count(page)).toHaveText("1");
  await page.getByRole("button", { name: "2+", exact: true }).click();
  const bulk = page.getByRole("button", { name: /Dodaj sve u filter/ });
  const n = Number((await bulk.textContent())!.match(/\((\d+)\)/)![1]);
  expect(n).toBeGreaterThan(0);
  page.once("dialog", (d) => d.accept());
  await bulk.click();
  await expect(page.getByRole("status").filter({ hasText: "Dodato" })).toContainText(`Dodato ${n} tipova`);
  await expect(bulk).toHaveText("Dodaj sve u filter (0)");
  await page.getByRole("button", { name: "2+", exact: true }).click();

  // 8) preimenovanje i brisanje filtera uz potvrdu
  await page.getByRole("button", { name: "Preimenuj" }).click();
  await page.getByLabel("Novi naziv").fill("E2E preimenovan");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByLabel("Izabrani filter")).toContainText("E2E preimenovan");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Obriši filter" }).click();
  await expect(page.getByText("Nemate filter")).toBeVisible();
});

test("telefon: dodavanje dugmetom + i nema horizontalnog skrola", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobilni tok");
  await login(page);
  await page.goto("/filter");
  await page.getByRole("button", { name: "+ Novi filter" }).click();
  await page.getByRole("button", { name: "Napravi" }).click();
  await page.getByRole("button", { name: /^Dodaj (?!sve)/ }).first().click();
  await expect(count(page)).toHaveText("1");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
