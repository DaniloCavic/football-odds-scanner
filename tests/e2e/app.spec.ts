import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Lozinka").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

const PAGES = [
  ["Robot", "/robot"],
  ["Filter", "/filter"],
  ["Aktivne selekcije", "/aktivne"],
  ["Statistika", "/statistika"],
  ["Istorija skeniranja", "/istorija"],
  ["Podešavanja", "/podesavanja"],
  ["Dashboard", "/"],
] as const;

test("privatne stranice traže prijavu", async ({ page }) => {
  for (const [, path] of PAGES) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("lažni cookie ne daje pristup", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "fos_session", value: "lazni-token", url: baseURL! }]);
  await page.goto("/robot");
  await expect(page).toHaveURL(/\/login$/);
});

test("pogrešna lozinka prikazuje grešku", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Lozinka").fill("pogresna-lozinka");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText("Pogrešan email ili lozinka.");
});

test("prijava, navigacija kroz sve stranice i odjava", async ({ page, isMobile }) => {
  await login(page);
  for (const [label, path] of PAGES) {
    if (isMobile) await page.getByRole("button", { name: "Otvori meni" }).click();
    await page.getByRole("navigation").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}$`));
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
  }
  // nema horizontalnog skrolovanja
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  if (isMobile) await page.getByRole("button", { name: "Otvori meni" }).click();
  await page.getByRole("button", { name: "Odjava" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("podešavanja: 1.31 se odbija, 1.30 i ulog se čuvaju trajno", async ({ page, isMobile }) => {
  test.skip(isMobile, "dovoljno na desktopu");
  await login(page);
  await page.goto("/podesavanja");
  const odds = page.getByLabel("Maksimalna kvota");
  const stake = page.getByLabel("Ulog po tipu (RSD)");

  await odds.fill("1.31");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("ne može biti veća od 1.30");

  await odds.fill("1,25");
  await stake.fill("500");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByRole("status")).toHaveText("Sačuvano.");
  await page.reload();
  await expect(odds).toHaveValue("1.25");
  await expect(stake).toHaveValue("500.00");

  await odds.fill("1.30");
  await stake.fill("1000");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByRole("status")).toHaveText("Sačuvano.");
});

test("health endpoint", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
});
