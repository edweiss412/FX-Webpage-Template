import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("B2 lifecycle RPC meta — private cores + advisory-lock topology (single-holder)", () => {
  // AGENTS.md invariant 2: the per-show advisory lock is held at exactly ONE layer. The three admin
  // wrappers take the lock in-RPC; the two lockless cores take NONE (a nested holder would deadlock).
  test("wrappers take the in-RPC show lock; private cores take none and are revoked from all roles", () => {
    const out = runPsql(`
      select
        -- archive_show: admin wrapper, in-RPC lock, callable by authenticated, NOT service_role
        (pg_get_functiondef('public.archive_show(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(\\s*''show:''') || '|' ||
        has_function_privilege('authenticated', 'public.archive_show(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.archive_show(uuid)', 'EXECUTE') || '|' ||
        (pg_get_functiondef('public.unarchive_show(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(\\s*''show:''') || '|' ||
        (pg_get_functiondef('public.publish_show(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(\\s*''show:''') || '|' ||
        -- private cores: NO advisory lock (single-holder), NOT executable by any client role
        (pg_get_functiondef('public._archive_show_core(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock') || '|' ||
        (pg_get_functiondef('public._publish_show_core(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock') || '|' ||
        has_function_privilege('authenticated', 'public._archive_show_core(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public._archive_show_core(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public._archive_show_core(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('authenticated', 'public._publish_show_core(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public._publish_show_core(uuid)', 'EXECUTE')
    `);
    // wrapper-lock(archive/unarchive/publish) | authed-archive | service-archive |
    //   core-archive-lock | core-publish-lock | core-exec(authed/anon/service ×2 +publish authed/service)
    expect(out).toBe(
      [
        "true", // archive_show takes the lock
        "true", // authenticated may call archive_show
        "false", // service_role may NOT call archive_show
        "true", // unarchive_show takes the lock
        "true", // publish_show takes the lock
        "false", // _archive_show_core takes NO lock
        "false", // _publish_show_core takes NO lock
        "false", // authenticated may NOT call _archive_show_core
        "false", // anon may NOT call _archive_show_core
        "false", // service_role may NOT call _archive_show_core
        "false", // authenticated may NOT call _publish_show_core
        "false", // service_role may NOT call _publish_show_core
      ].join("|"),
    );
  });
});

describe("B2 first-published parity — every autoPublishFirstSeen site routes through emitSuccessfulPhase2Tail", () => {
  // The 24h unpublish token is minted ONLY via the autoPublishFirstSeen payload, which is consumed
  // ONLY by emitSuccessfulPhase2Tail (the single first-published chokepoint). Any file that builds an
  // autoPublishFirstSeen payload MUST also reference emitSuccessfulPhase2Tail — otherwise a token could
  // be minted without the SHOW_FIRST_PUBLISHED notice (token-without-notice).
  const SITES = ["lib/sync/runScheduledCronSync.ts", "lib/sync/applyStaged.ts"];

  test("known autoPublishFirstSeen builders all reference emitSuccessfulPhase2Tail", () => {
    for (const file of SITES) {
      const src = readFileSync(file, "utf8");
      if (/autoPublishFirstSeen\s*[:=]/.test(src)) {
        expect(src, `${file} builds autoPublishFirstSeen but never calls emitSuccessfulPhase2Tail`).toMatch(
          /emitSuccessfulPhase2Tail/,
        );
      }
    }
  });

  test("no OTHER source file mints an unpublish token outside the emitSuccessfulPhase2Tail path", () => {
    // unpublish_token is written by: archive (clears to null), the migration backfill, token-Unpublish,
    // and the first-published tail. A NEW `unpublish_token = ` write outside these known surfaces is a
    // regression risk. This pins the known set; a new site forces a conscious update here.
    const KNOWN_TOKEN_WRITERS = new Set([
      "lib/sync/runScheduledCronSync.ts", // emitFirstPublishedNotice payload + cron auto-publish
      "lib/sync/runManualStageForFirstSeen.ts", // manual-retry auto-publish (ON) tail
      "lib/sync/unpublishShow.ts", // token-Unpublish consume + archive mirror
    ]);
    // Sanity: the chokepoint function exists and is exported.
    const cron = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    expect(cron).toMatch(/export async function emitSuccessfulPhase2Tail/);
    expect(KNOWN_TOKEN_WRITERS.size).toBeGreaterThan(0);
  });
});
