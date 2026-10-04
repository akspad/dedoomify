import net from "node:net";

// A bounded, synchronous fallback for local use and warm functions. Production
// also uses a Vercel WAF rule, because processes/regions do not share this Map.
export function createRateLimiter({ limit = 30, windowMs = 60_000, maxKeys = 4096, now = Date.now, vercel = process.env.VERCEL === "1" } = {}) {
  const buckets = new Map();
  return (req) => {
    // Only Vercel's overwritten header is trusted there; local servers use the
    // socket, never caller-controlled forwarding headers.
    const raw = vercel ? req.headers?.["x-forwarded-for"] : req.socket?.remoteAddress;
    let key = typeof raw === "string" && net.isIP(raw.trim()) ? raw.trim().toLowerCase() : "unknown";
    if (key.startsWith("::ffff:") && net.isIPv4(key.slice(7))) key = key.slice(7);
    const time = now();
    for (const [ip, bucket] of buckets) if (bucket.reset <= time) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      // Do not evict live counters: key churn must not reset an attacker's quota.
      if (buckets.size >= maxKeys) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      bucket = { count: 0, reset: time + windowMs };
      buckets.set(key, bucket);
    }
    const retryAfter = Math.max(1, Math.ceil((bucket.reset - time) / 1000));
    if (bucket.count >= limit) return { allowed: false, retryAfter };
    bucket.count++;
    return { allowed: true, retryAfter: 0 };
  };
}
export const articleLimit = createRateLimiter();
export const imageLimit = createRateLimiter({ limit: 120 });
