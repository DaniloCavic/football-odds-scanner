import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD nisu postavljeni – preskačem pravljenje admin naloga.");
    return;
  }
  if (password.length < 8) throw new Error("[seed] ADMIN_PASSWORD mora imati najmanje 8 znakova.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Admin nalog ${email} već postoji – ne menjam ga.`);
    return;
  }
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" } });
  console.log(`[seed] Napravljen admin nalog ${email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
