/**
 * SlidingWindowRateLimiter — Multi-key sliding-window rate limiter
 *
 * Chapter Ref: Day04 Ch08 — Brute-Force & Credential Stuffing defences
 *
 * Supports two independent key namespaces:
 *   • ip:<address>       — IP-level throttle (catches wide-net botnet spraying)
 *   • account:<email>    — Per-account throttle (catches targeted dictionary attacks)
 *
 * Sliding-window (vs. fixed-window) avoids the "boundary burst" attack where
 * a bot sends limit/2 requests just before a window resets and limit/2 just
 * after — doubling effective throughput for that slot.
 *
 * Memory: timestamps are stored per key.  For production use Redis ZADD/ZREMRANGEBYSCORE
 * so the limiter is shared across horizontal server replicas.
 */

import { config } from "../config/env.js";

export class SlidingWindowRateLimiter {
  /**
   * @param {number} limit      - Max allowed calls in the window
   * @param {number} windowMs   - Window duration in milliseconds
   */
  constructor(limit, windowMs) {
    this.limit    = limit;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} key → sorted array of call timestamps */
    this._buckets = new Map();
  }

  /**
   * Record one call attempt for a given key.
   *
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  attempt(key) {
    const now    = Date.now();
    const cutoff = now - this.windowMs;

    // Fetch or initialise the timestamp bucket
    let timestamps = this._buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this._buckets.set(key, timestamps);
    }

    // Evict timestamps that have fallen outside the sliding window
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.limit) {
      // Oldest timestamp tells us when the window will free a slot
      const retryAfterMs = this.windowMs - (now - timestamps[0]);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this.limit - timestamps.length, retryAfterMs: 0 };
  }

  /**
   * Clear rate-limit state for a key (e.g. after a successful login,
   * or after an admin unlocks an account).
   * @param {string} key
   */
  reset(key) {
    this._buckets.delete(key);
  }

  /** Purge all expired buckets (call periodically to prevent memory leaks) */
  prune() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this._buckets.entries()) {
      const live = ts.filter((t) => t >= cutoff);
      if (live.length === 0) this._buckets.delete(key);
      else this._buckets.set(key, live);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-configured limiters — thresholds come from .env so security posture can be
// tightened per environment without a code change (Ch09 12-Factor principle).
// ──────────────────────────────────────────────────────────────────────────────

/** Login attempts per IP address — catches wide-net botnet spraying. */
export const ipLoginLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.loginIpLimit,
  config.rateLimit.loginIpWindowMs
);

/** FAILED logins per target account — catches targeted dictionary attacks. */
export const accountLoginLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.loginAccountLimit,
  config.rateLimit.loginAccountWindowMs
);

/** Registration attempts per IP — blocks mass fake-account creation. */
export const registerIpLimiter = new SlidingWindowRateLimiter(
  config.rateLimit.registerIpLimit,
  config.rateLimit.registerIpWindowMs
);

/** Every limiter that must be pruned periodically by the maintenance timer. */
export const allLimiters = Object.freeze([
  ipLoginLimiter,
  accountLoginLimiter,
  registerIpLimiter,
]);
