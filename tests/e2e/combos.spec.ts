import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

test("ručni unos spojenog tipa: kandidat → kvota → u filteru umesto pojedinačnih", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop tok");
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_ENV.ADMIN_EMAIL);
  await page.getByLabel("Lozinka").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/robot");
  await page.getByRole("radio", { name: /DEMO/ }).check();
  await page.getByRole("button", { name: "Narednih 7 dana", exact: true }).click();
  await page.getByRole("button", { name: /START ROBOT/ }).click();
  await expect(page.getByTestId("scan-status")).toHaveText("Radi");
  await expect(page.getByTestId("scan-status")).toHaveText("Završeno", { timeout: 60_000 });
  await expect(page.getByTestId("combo-skipped")).not.toHaveText("0");

  await page.goto("/filter");
  await page.getByRole("button", { name: "+ Novi filter" }).click();
  await page.getByLabel("Naziv novog filtera").fill("Spojeni E2E");
  await page.getByRole("button", { name: "Napravi" }).click();

  const box = page.getByTestId("combo-candidates");
  await expect(box).toBeVisible();
  const input = box.getByRole("textbox").first();
  await input.fill("1,55");
  await box.getByRole("button", { name: /^Dodaj spojeni/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Dodato" })).toContainText("@ 1.55");
  await expect(page.getByTestId("filter-list")).toContainText("&");
  await expect(page.getByTestId("filter-list").locator("[data-combo]").first()).toHaveText("1.55");
  await expect(box.getByLabel("Već u filteru").first()).toBeVisible();

  // počisti za sledeće testove (brojevi na dashboard-u)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Obriši filter" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Filter je obrisan." })).toBeVisible();
});
