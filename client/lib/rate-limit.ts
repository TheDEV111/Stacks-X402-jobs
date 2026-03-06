/**
 * In-memory sliding-window rate limiter for Next.js App Router.
 *
 * Each limiter instance tracks requests per IP in a Map.
 * Entries auto-expire after the window elapses.
 *
 * For multi-instance production deployments, swap to Redis
 * (e.g. @upstash/ratelimit). For a single-instance / Vercel
 * serverless deployment this is efficient and sufficient.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSec: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Periodic cleanup to prevent memory leaks (every 60s)
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const store of stores.values()) {
      for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
      }
    }
  }, 60_000).unref();
}

/**
 * Create a named rate limiter.
 *
 * Usage:
 * ```ts
 * const limiter = createRateLimiter("skills", { maxRequests: 20, windowSec: 60 });
 * const result = limiter.check(ip);
 * if (!result.allowed) return result.response;
 * ```
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name)!;
  scheduleCleanup();

  return {
    /**
     * Check whether a request from `identifier` (typically IP) is allowed.
     * Returns `{ allowed: true, remaining }` or `{ allowed: false, response }`.
     */
    check(
      identifier: string
    ):
      | { allowed: true; remaining: number }
      | { allowed: false; remaining: 0; response: Response } {
      const now = Date.now();
      const entry = store.get(identifier);

      // First request or window expired → reset
      if (!entry || entry.resetAt < now) {
        store.set(identifier, {
          count: 1,
          resetAt: now + config.windowSec * 1000,
        });
        return { allowed: true, remaining: config.maxRequests - 1 };
      }

      // Within window
      if (entry.count < config.maxRequests) {
        entry.count++;
        const remaining = config.maxRequests - entry.count;
        return { allowed: true, remaining };
      }

      // Over limit
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        response: new Response(
          JSON.stringify({
            error: "rate_limited",
            message: `Too many requests. Try again in ${retryAfter}s.`,
            retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(config.maxRequests),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
            },
          }
        ),
      };
    },
  };
}

/**
 * Extract the client IP from a Request.
 * Works on Vercel (x-forwarded-for), Cloudflare (cf-connecting-ip),
 * and bare Node (falls back to "unknown").
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
