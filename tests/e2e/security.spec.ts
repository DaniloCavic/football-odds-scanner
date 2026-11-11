import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

test.describe.configure({ mode: "serial" });

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Lozinka").fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

test("sigurnosna zaglavlja", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("API bez prijave vraća 401, a izmene sa tuđe adrese 403", async ({ request, baseURL }) => {
  for (const path of ["/api/stats", "/api/tracked", "/api/filter-sets", "/api/export?format=json", "/api/robot/source-status"]) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  const foreign = await request.post("/api/filter-sets", { data: { name: "x" }, headers: { origin: "https://zli-sajt.example" } });
  expect(foreign.status()).toBe(403);
  const noOrigin = await request.post("/api/tracker/run");
  expect(noOrigin.status()).toBe(403);
  const same = await request.post("/api/tracker/run", { headers: { origin: baseURL! } });
  expect(same.status()).toBe(401); // ista adresa, ali bez prijave
});

test("običan korisnik ne može administratorske akcije; promena lozinke radi", async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, "desktop tok");
  const db = new PrismaClient({ datasourceUrl: E2E_ENV.DATABASE_URL });
  const email = `korisnik${Date.now()}@example.com`;
  await db.user.create({ data: { email, passwordHash: await bcrypt.hash("obicna-lozinka-1", 12), role: "USER" } });

  await loginAs(page, email, "obicna-lozinka-1");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const h = { origin: baseURL! };
  expect((await page.request.post("/api/tracker/run", { headers: h })).status()).toBe(403);
  expect((await page.request.get("/api/export?format=json")).status()).toBe(403);
  const anyTracked = await db.trackedSelection.findFirst();
  if (anyTracked) {
    expect((await page.request.post(`/api/tracked/${anyTracked.id}/override`, { headers: h, data: { status: "WON", reason: "pokušaj bez prava" } })).status()).toBe(403);
  }

  // promena lozinke
  await page.goto("/podesavanja");
  await page.getByLabel("Trenutna lozinka").fill("pogresna");
  await page.getByLabel("Nova lozinka (min. 10 znakova)").fill("nova-lozinka-123");
  await page.getByLabel("Potvrda nove lozinke").fill("nova-lozinka-123");
  await page.getByRole("button", { name: "Promeni lozinku" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("Trenutna lozinka nije tačna");
  await page.getByLabel("Trenutna lozinka").fill("obicna-lozinka-1");
  await page.getByLabel("Nova lozinka (min. 10 znakova)").fill("nova-lozinka-123");
  await page.getByLabel("Potvrda nove lozinke").fill("nova-lozinka-123");
  await page.getByRole("button", { name: "Promeni lozinku" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lozinka je promenjena" })).toBeVisible();
  await page.getByRole("button", { name: "Odjava" }).click();
  await loginAs(page, email, "obicna-lozinka-1");
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("Pogrešan email ili lozinka");
  await loginAs(page, email, "nova-lozinka-123");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(await db.auditLog.count({ where: { action: "PASSWORD_CHANGE" } })).toBeGreaterThanOrEqual(1);
  await db.$disconnect();
});

test("izvoz: CSV i JSON (administrator)", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop tok");
  await loginAs(page, E2E_ENV.ADMIN_EMAIL, E2E_ENV.ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const csv = await page.request.get("/api/export?format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toContain(".csv");
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toContain("Filter;Filter obrisan");
  const json = await (await page.request.get("/api/export?format=json")).json();
  expect(json).toHaveProperty("filterSets");
  expect(json).toHaveProperty("entries");
  expect(JSON.stringify(json)).not.toContain("passwordHash");
});
