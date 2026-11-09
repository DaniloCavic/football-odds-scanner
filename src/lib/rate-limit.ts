/**
 * Jednostavan in-memory limiter (fiksni prozor). Dovoljan za jednu instancu servera;
 * pri više instanci treba ga prebaciti u Redis (faza 4 uvodi Redis).
 */
type Bucket = { count: number; resetAt: number };

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();
  return {
    /** Vraća true ako je pokušaj dozvoljen. */
    hit(key: string): boolean {
      const t = now();
      const b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      b.count += 1;
      return b.count <= limit;
    },
    reset(key: string) {
      buckets.delete(key);
    },
  };
}

// 5 pokušaja prijave na 15 minuta po (IP, email)
export const loginLimiter = createRateLimiter(5, 15 * 60 * 1000);
