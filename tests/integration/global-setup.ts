import { execSync } from "child_process";

export default function setup() {
  const url = process.env.ITEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fos_itest";
  if (!new URL(url).pathname.slice(1).endsWith("_itest")) throw new Error("Integraciona baza mora da se zove *_itest.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
