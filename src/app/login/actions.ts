"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { loginLimiter } from "@/lib/rate-limit";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Unesite ispravnu email adresu."),
  password: z.string().min(1, "Unesite lozinku.").max(200),
});

// Hash koji se proverava kada nalog ne postoji, da vreme odgovora ne otkriva postojanje naloga.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("nepostojeci-nalog"));

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const emailRaw = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: emailRaw };

  const { email, password } = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  const key = `${ip}|${email}`;
  if (!loginLimiter.hit(key)) {
    return { error: "Previše pokušaja. Sačekajte 15 minuta pa probajte ponovo.", email };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return { error: "Pogrešan email ili lozinka.", email };

  loginLimiter.reset(key);
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
