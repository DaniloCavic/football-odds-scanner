import type { PrismaClient } from "@prisma/client";

/** Jednostavno zaključavanje posla u bazi (radi i ako postoji više instanci servera). */
export async function tryLock(db: PrismaClient, name: string, ttlMs: number, now = new Date()): Promise<boolean> {
  const key = `lock:${name}`;
  const until = new Date(now.getTime() + ttlMs).toISOString();
  try {
    await db.jobState.create({ data: { key, value: { until } } });
    return true;
  } catch {
    // postoji – preuzmi samo ako je isteklo
    const rows = await db.$executeRaw`UPDATE "JobState" SET "value" = jsonb_build_object('until', ${until}::text), "updatedAt" = now()
      WHERE "key" = ${key} AND ("value"->>'until')::timestamptz < ${now.toISOString()}::timestamptz`;
    return rows === 1;
  }
}

export async function unlock(db: PrismaClient, name: string) {
  await db.jobState.deleteMany({ where: { key: `lock:${name}` } });
}

export async function getState<T>(db: PrismaClient, key: string, fallback: T): Promise<T> {
  const row = await db.jobState.findUnique({ where: { key } });
  return (row?.value as T) ?? fallback;
}

export async function setState(db: PrismaClient, key: string, value: unknown) {
  await db.jobState.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

/** Dnevni brojač (npr. potrošeni zahtevi). Resetuje se kada se promeni datum (UTC). */
export async function dailyCount(db: PrismaClient, name: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const s = await getState<{ day: string; count: number }>(db, `count:${name}`, { day, count: 0 });
  return s.day === day ? s.count : 0;
}

export async function incDaily(db: PrismaClient, name: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const count = (await dailyCount(db, name, now)) + 1;
  await setState(db, `count:${name}`, { day, count });
  return count;
}
