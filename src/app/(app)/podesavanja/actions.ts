"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { normalizeDecimal, settingsSchema } from "@/lib/settings";
import { getSettings } from "@/lib/settings-repo";

export type SettingsState = { ok?: boolean; error?: string };

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Samo administrator može da menja podešavanja." };

  const parsed = settingsSchema.safeParse({
    maxOdds: normalizeDecimal(formData.get("maxOdds")),
    stakePerSelection: normalizeDecimal(formData.get("stakePerSelection")),
    maxRequestsPerScan: normalizeDecimal(formData.get("maxRequestsPerScan")),
    resultCheckMinutes: normalizeDecimal(formData.get("resultCheckMinutes")),
    oddsPapiResultChecksPerDay: normalizeDecimal(formData.get("oddsPapiResultChecksPerDay")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const before = await getSettings();
  const next = parsed.data;
  const keys = ["maxOdds", "stakePerSelection", "maxRequestsPerScan", "resultCheckMinutes", "oddsPapiResultChecksPerDay"] as const;
  if (keys.every((k) => before[k] === next[k])) return { ok: true };

  await prisma.$transaction([
    prisma.settings.update({ where: { id: 1 }, data: next }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        entityType: "Settings",
        entityId: "1",
        action: "UPDATE",
        oldValue: Object.fromEntries(keys.map((k) => [k, before[k]])),
        newValue: next,
      },
    }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true };
}
