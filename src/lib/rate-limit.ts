type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

/** In-memory sliding window. Per-instance only: on serverless each instance has its own counters. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - b.hits[0])) / 1000)) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
