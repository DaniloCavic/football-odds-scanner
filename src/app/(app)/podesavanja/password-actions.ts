"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken, SESSION_COOKIE } from "@/lib/auth/token";
import { log, maskEmail } from "@/lib/log";

export type PasswordState = { ok?: boolean; error?: string };

const schema = z.object({
  current: z.string().min(1, "Unesite trenutnu lozinku."),
  next: z.string().min(10, "Nova lozinka mora imati najmanje 10 znakova.").max(200),
  confirm: z.string(),
}).refine((d) => d.next === d.confirm, { message: "Nova lozinka i potvrda se ne poklapaju.", path: ["confirm"] })
  .refine((d) => d.next !== d.current, { message: "Nova lozinka mora biti drugačija od trenutne.", path: ["next"] });

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const p = schema.safeParse({ current: formData.get("current"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!p.success) return { error: p.error.issues[0].message };

  const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(p.data.current, db.passwordHash))) return { error: "Trenutna lozinka nije tačna." };

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(p.data.next) } }),
    // odjavi sve ostale uređaje, zadrži trenutnu sesiju
    prisma.session.deleteMany({ where: { userId: user.id, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) } }),
    prisma.auditLog.create({ data: { userId: user.id, entityType: "User", entityId: user.id, action: "PASSWORD_CHANGE" } }),
  ]);
  log.info("auth", "lozinka promenjena", { email: maskEmail(user.email) });
  return { ok: true };
}
