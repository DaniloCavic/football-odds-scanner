import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Lozinka").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/robot");
});

test("bez API ključa OddsPapi je isključen, a DEMO izabran", async ({ page }) => {
  await expect(page.getByRole("radio", { name: /OddsPapi/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /DEMO/ })).toBeChecked();
  await expect(page.getByText("API ključ nije podešen")).toBeVisible();
});

test("STOP zaustavlja robota", async ({ page, isMobile }) => {
  test.skip(isMobile, "dovoljno na desktopu");
  await page.getByRole("button", { name: "Narednih 7 dana", exact: true }).click();
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Radi");
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Zaustavljeno", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /START ROBOT/ })).toBeVisible();
});

test("DEMO skeniranje: samo kvote do 1.30, virtuelni fudbal izbačen, DEMO oznaka", async ({ page }) => {
  await page.getByRole("button", { name: "Narednih 7 dana", exact: true }).click();
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Radi");
  await expect(page.getByTestId("scan-status")).toHaveText("Završeno", { timeout: 60_000 });

  const found = Number(await page.getByTestId("found").textContent());
  expect(found).toBeGreaterThan(0);
  await expect(page.getByText("Izbačeno (virtuelno i sl.)").locator("..").locator("dd")).not.toHaveText("0");

  const odds = await page.locator("[data-testid=selections] [data-odds]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-odds"))));
  expect(odds.length).toBe(found);
  for (const o of odds) {
    expect(o).toBeGreaterThan(1);
    expect(o).toBeLessThanOrEqual(1.3);
  }
  expect(odds).toContain(1.3); // 1.30 se prihvata
  await expect(page.getByText("Virtual")).toHaveCount(0);
  await expect(page.locator("[data-testid=selections]").getByText("DEMO", { exact: true }).first()).toBeVisible();

  // filter po tipu i sortiranje po kvoti
  await page.getByRole("button", { name: "2+", exact: true }).click();
  const labels = await page.locator("[data-testid=selections] [data-odds]").count();
  expect(labels).toBeGreaterThan(0);
  expect(labels).toBeLessThan(found);
  await page.getByLabel("Sortiranje").selectOption("odds");
  const sorted = await page.locator("[data-testid=selections] td[data-odds]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-odds"))));
  expect(sorted).toEqual([...sorted].sort((a, b) => a - b));

  // dashboard pokazuje poslednje skeniranje
  await page.goto("/");
  await expect(page.getByText("Narednih 7 dana")).toBeVisible();
});

test("prilagođeni period u prošlosti se odbija", async ({ page, isMobile }) => {
  test.skip(isMobile, "dovoljno na desktopu");
  await page.getByRole("button", { name: "Prilagođeni period", exact: true }).click();
  await page.getByLabel("Od", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Do", { exact: true }).fill("2020-01-02");
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("Period je već prošao");
});
