// Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §3.2, §5.3
//
// This test exists because of a specific tautology risk (lease-spec review R1
// finding 3): a DB test that runs COPIED SQL can pass while the production
// caller still supplies the old threshold, the wrong units, or the wrong
// fraction — and the DB-free suite can stay green against an obsolete fake.
// So it enters through the real `refreshWatchSubscriptions` + `PostgresWatchTx`
// path and asserts which folders that path actually decides to renew.
//
// Real DB (tests/db/** is the SERIAL project).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { setLogSink } from "@/lib/log";
import { assertLocalDbUrl } from "./_localDbUrl";
import {
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  SAMPLING_PERIOD_MS,
} from "@/lib/drive/watchErrors";

// This suite DELETEs rows in setup and teardown, so it is local-only by
// contract: resolve through LOCAL_TEST_DATABASE_URL and refuse a remote host
// before any client exists. TEST_DATABASE_URL is the validation project and is
// deliberately not consulted here.
const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

// The reap (spec §3.1.2) reads the DATABASE's `now()`, so a fixture dated
// against a JS constant is already expired by real database time and gets
// consumed before `listRenewalDue` runs. Read the database clock once and use
// THAT for both the injected JS clock and every fixture, so the two agree by
// construction — which is what the production code now requires of them.
let NOW = new Date("2026-07-25T12:00:00.000Z");
const HOUR = 3_600_000;

/** Insert an active channel with an explicit granted lifetime. */
async function insertActive(id: string, folderId: string, createdAt: Date, expiresAt: Date) {
  await sql`
    insert into public.drive_watch_channels
      (id, status, watched_folder_id, webhook_secret, resource_id, created_at, expires_at, activated_at)
    values (${id}, 'active', ${folderId}, ${"secret-" + id}, ${"resource-" + id},
            ${createdAt.toISOString()}, ${expiresAt.toISOString()}, ${createdAt.toISOString()})
  `;
}

/**
 * Which folders does the PRODUCTION refresh path decide to renew, given the rows
 * currently in the table? Drive is stubbed at the subscribe seam so nothing
 * leaves the process; everything below it — the transaction port, the SQL, the
 * caller's argument construction — is the real thing.
 */
async function foldersProductionWouldRenew(configuredFolderId: string): Promise<string[]> {
  const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
  const attempted: string[] = [];
  await refreshWatchSubscriptions({
    now: () => NOW,
    subscribeToWatchedFolder: async (folderId: string) => {
      attempted.push(folderId);
      return { outcome: "active" as const, channelId: `renewed-${folderId}`, attempt: null };
    },
    // §3.2 renews only the configured folder, so the harness must say which one
    // it is — otherwise this would perform the real service-role settings read
    // and the suite's behaviour would depend on ambient environment state.
    getActiveWatchedFolder: async () => ({ folderId: configuredFolderId, folderName: null }),
  });
  return attempted.sort();
}

/** Status of a seeded row after the production refresh path has run. */
async function statusAfterRefresh(id: string, folderId: string): Promise<string> {
  const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
  const attempted: string[] = [];
  await refreshWatchSubscriptions({
    now: () => NOW,
    subscribeToWatchedFolder: async (attemptedFolder: string) => {
      attempted.push(attemptedFolder);
      return { outcome: "active" as const, channelId: "x", attempt: null };
    },
    getActiveWatchedFolder: async () => ({ folderId, folderName: null }),
  });
  // A reaped row must not ALSO have been submitted for renewal. Asserting only
  // the final status lets both happen (whole-diff finding 6).
  expect(attempted).toEqual([]);
  const [row] = await sql<{ status: string }[]>`
    select status from public.drive_watch_channels where id = ${id}
  `;
  return row!.status;
}

describe("renewal predicate, through the production path (§3.2)", () => {
  // The production path resolves its own connection from TEST_DATABASE_URL
  // (lib/drive/watch.ts databaseUrl()). Point it at the SAME guarded local URL
  // for the duration of this suite, and restore afterwards — without this the
  // code under test would connect somewhere other than the rows we inserted.
  const priorTestDatabaseUrl = process.env.TEST_DATABASE_URL;
  beforeAll(async () => {
    process.env.TEST_DATABASE_URL = databaseUrl;
    const rows = await sql<{ now: Date }[]>`select now() as now`;
    NOW = new Date(rows[0]!.now);
  });
  afterAll(async () => {
    if (priorTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = priorTestDatabaseUrl;
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    setLogSink(() => {});
    await sql`delete from public.drive_watch_channels where watched_folder_id like 'renewpred-%'`;
  });

  afterEach(async () => {
    await sql`delete from public.drive_watch_channels where watched_folder_id like 'renewpred-%'`;
    setLogSink(() => {});
  });

  test("renews only rows inside their own renewal window", async () => {
    // A 24h lease: lead = max(2h, 25% of 24h) = 6h, so due at 18h elapsed.
    const dayLease = (elapsedH: number) => ({
      created: new Date(NOW.getTime() - elapsedH * HOUR),
      expires: new Date(NOW.getTime() + (24 - elapsedH) * HOUR),
    });

    const notYet = dayLease(17); // 7h remaining > 6h lead
    const due = dayLease(19); //   5h remaining < 6h lead
    await insertActive("rp-notyet", "renewpred-notyet", notYet.created, notYet.expires);
    await insertActive("rp-due", "renewpred-due", due.created, due.expires);

    // Run once per configured folder: with a single configured folder the new
    // filter would exclude the other row for the WRONG reason, so each is asked
    // separately and the renewal predicate remains what decides.
    expect(await foldersProductionWouldRenew("renewpred-due")).toEqual(["renewpred-due"]);
    expect(await foldersProductionWouldRenew("renewpred-notyet")).toEqual([]);
  });

  test("the absolute floor governs short leases the proportional term would miss", async () => {
    // A 6h lease: 25% is 1.5h, below the 2h floor, so the floor wins and the row
    // is due at 4h elapsed. Under a proportional-only predicate it would not be
    // due until 4.5h, i.e. noticed later and with less margin. (An earlier
    // comment claimed it would be sampled AFTER expiry — false even on the
    // idealised fixed-period model, where the next tick lands by 5.5h; R6 finding 3.)
    const created = new Date(NOW.getTime() - 4 * HOUR);
    const expires = new Date(NOW.getTime() + 2 * HOUR);
    await insertActive("rp-floor", "renewpred-floor", created, expires);

    expect(await foldersProductionWouldRenew("renewpred-floor")).toEqual(["renewpred-floor"]);

    // Pin that this row is governed by the FLOOR, not the proportional term:
    // the proportional lead for a 6h grant is strictly less than the floor.
    const grantedMs = expires.getTime() - created.getTime();
    expect(grantedMs * (1 - RENEWAL_LIFE_FRACTION)).toBeLessThan(RENEWAL_MIN_LEAD_MS);
  });

  test("a lease already past expiry is REAPED to `expired`, not renewed", async () => {
    // Inverted deliberately (spec §5). This test used to pin
    // BL-WATCH-EXPIRED-ACTIVE-ROW — a row that never left `status='active'` and
    // so was retried on every tick forever. §3.1.2 now reaps it out of the
    // renewal query before that query runs.
    const created = new Date(NOW.getTime() - 30 * HOUR);
    const expires = new Date(NOW.getTime() - 6 * HOUR);
    await insertActive("rp-expired", "renewpred-expired", created, expires);

    expect(await statusAfterRefresh("rp-expired", "renewpred-expired")).toBe("expired");
  });

  test("a zero-length or inverted lease already past `now` is reaped to `expired`", async () => {
    const created = new Date(NOW.getTime() + HOUR);
    const expires = new Date(NOW.getTime()); // expires_at <= created_at, and <= now
    await insertActive("rp-skew", "renewpred-skew", created, expires);

    expect(await statusAfterRefresh("rp-skew", "renewpred-skew")).toBe("expired");
  });

  test("an inverted lease expiring in the FUTURE is reaped to `superseded`, NOT `expired`", async () => {
    // The status is the assertion, not merely that the row left `active`
    // (spec §3.1.2). Its `expires_at` is 24h out, so Drive may still be
    // delivering on this channel — `superseded` is the status whose GC path
    // calls channels.stop. Routing it to `expired` would skip that call and
    // abandon a possibly-live channel with nothing left to stop it.
    const expires = new Date(NOW.getTime() + 24 * HOUR);
    const created = new Date(NOW.getTime() + 30 * HOUR); // created AFTER expiry
    expect(expires.getTime() - NOW.getTime()).toBeGreaterThan(RENEWAL_MIN_LEAD_MS);
    await insertActive("rp-inv-future", "renewpred-inv-future", created, expires);

    expect(await statusAfterRefresh("rp-inv-future", "renewpred-inv-future")).toBe("superseded");
  });

  test("non-active rows are never renewed regardless of expiry", async () => {
    const created = new Date(NOW.getTime() - 25 * HOUR);
    const expires = new Date(NOW.getTime() - HOUR);
    await insertActive("rp-super", "renewpred-super", created, expires);
    await sql`update public.drive_watch_channels set status = 'superseded' where id = 'rp-super'`;

    expect(await foldersProductionWouldRenew("renewpred-super")).toEqual([]);
  });

  test("NEGATIVE CONTROL: the retired threshold predicate would renew a row this one leaves alone", async () => {
    // The old predicate was `expires_at < now() + 24h`, which is true for every
    // row of a 24h lease from the moment it is created. If the production caller
    // silently reverted to it, the 17h-elapsed row above would be renewed too.
    // This asserts the discriminating case directly, so the suite fails on a
    // revert instead of passing on copied-but-unused SQL.
    const created = new Date(NOW.getTime() - 1 * HOUR);
    const expires = new Date(NOW.getTime() + 23 * HOUR);
    await insertActive("rp-fresh", "renewpred-fresh", created, expires);

    const oldPredicateWouldRenew = expires.getTime() < NOW.getTime() + 24 * HOUR;
    expect(oldPredicateWouldRenew).toBe(true);
    expect(await foldersProductionWouldRenew("renewpred-fresh")).toEqual([]);
  });

  test("the renewal lead always exceeds one sampling period", async () => {
    // Ordering the §2.1 heuristic depends on. Not a guarantee — nothing enforces
    // the execution budget — but a constant edit inverting this would make the
    // detector meaningless, and that should fail loudly here.
    expect(RENEWAL_MIN_LEAD_MS).toBeGreaterThan(SAMPLING_PERIOD_MS);
  });
});
