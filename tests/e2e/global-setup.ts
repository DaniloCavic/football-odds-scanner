import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_ENV } from "../../playwright.config";

// Čisti SAMO posebnu test bazu (ime mora da se završava na "_test").
export default async function globalSetup() {
  const dbName = new URL(E2E_ENV.DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`E2E baza mora da se zove *_test, a ne "${dbName}".`);

  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });

  const prisma = new PrismaClient({ datasourceUrl: E2E_ENV.DATABASE_URL });
  await prisma.$transaction([prisma.auditLog.deleteMany(), prisma.session.deleteMany(), prisma.user.deleteMany(), prisma.settings.deleteMany()]);
  await prisma.$disconnect();

  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
