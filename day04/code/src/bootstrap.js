import { config, logger } from "./config/env.js";
import { seedUsers, userStore } from "./db/user.store.js";
import { seedNotes } from "./db/note.store.js";
import { refreshStore } from "./services/token.service.js";
import { allLimiters } from "./services/rate-limiter.service.js";

/**
 * Bootstrap — preparing an auth service to serve traffic
 *
 * Chapter Ref: Ch09 — the request pipeline assumed the process is already wired
 *              correctly; this module is that wiring.
 *
 * Separated from server.js so tests can boot the SAME world (seeded users, notes,
 * stores) without binding a TCP port. That is the difference between an
 * integration test you trust and one that reaches into globals.
 */

/**
 * Seeds demo data and validates the seed contract.
 * Idempotent: re-running (e.g. `node --watch`) never duplicates records.
 *
 * @returns {Promise<{ users: number, notes: number }>}
 */
export async function bootstrapData() {
  const users = await seedUsers();

  let notes = 0;
  if (config.seedDemoData) {
    const aminul = userStore.findByEmail("aminul@example.com");
    const bob    = userStore.findByEmail("bob@example.com");
    const alice  = userStore.findByEmail("alice@example.com");

    if (!aminul || !bob || !alice) {
      throw new Error("Demo user seeding failed — cannot seed notes without owners");
    }

    notes = seedNotes(aminul.id, bob.id, alice.id);
  } else {
    logger.info("demo note seeding skipped", { reason: "SEED_DEMO_DATA=false" });
  }

  return { users, notes };
}

/**
 * Periodic housekeeping — the in-memory stand-in for Redis TTLs and cron jobs.
 *
 * Each sweep is O(n) over tiny maps; a real deployment would let Redis expire
 * keys itself and run these as a nightly job instead of in-process.
 *
 * @returns {NodeJS.Timeout} the interval handle (kept so shutdown can clear it)
 */
export function startMaintenanceJobs() {
  const timer = setInterval(() => {
    const prunedTokens = refreshStore.prune();
    for (const limiter of allLimiters) limiter.prune();

    if (prunedTokens > 0) {
      logger.info("maintenance sweep", { prunedRefreshTokens: prunedTokens });
    }
  }, 10 * 60 * 1000); // every 10 minutes

  // Never hold the event loop open just for housekeeping.
  timer.unref();
  return timer;
}

/**
 * @param {NodeJS.Timeout} timer
 */
export function stopMaintenanceJobs(timer) {
  if (timer) clearInterval(timer);
}

export default bootstrapData;
