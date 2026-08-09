// Spec: docs/superpowers/specs/2026-08-09-watch-promotion-activation-race-fix-design.md
//
// The probe (docs/superpowers/specs/probes/2026-08-09-watch-race-forshare-probe.mjs)
// productionized: the same four interleavings, but against the REAL tables, the
// REAL `promoteSettings` statement shape, and the REAL subscribe/activation code
// instead of probe tables and hand-written SQL.
//
// EVERY assertion states the FIXED behavior, permanently. The RED phase is the
// step-2 mutant in the plan (`if (false && settings.length > 0 …)`), not a
// temporary stale-row-exists assertion that would have to flip later.
//
// Phase acknowledgements, never sleeps: a schedule passes only if the contended
// interleaving PROVABLY occurred — an ack after promotion's settings UPDATE
// returns, an ack after the guard's `for share` returns, and positive
// still-pending checks on the party that must be blocked.
//
// Real DB (tests/db/** is the SERIAL project).
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";
import { premiseHolds } from "../_shared/premise";
import { setLogSink } from "@/lib/log";

// This suite INSERTs, UPDATEs and DELETEs rows, so it is local-only by
// contract: resolve through LOCAL_TEST_DATABASE_URL and refuse a remote host
// before any client exists.
const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

// Every blocking wait is bounded by the server too, not only by the test
// runner: a schedule that deadlocked would otherwise hang until vitest's
// timeout with no indication of which statement was stuck.
const conn = () =>
  postgres(databaseUrl, { max: 1, prepare: false, connection: { statement_timeout: 5000 } });

const admin = conn();

const PREFIX = "watchrace-";
const FOLDER_A: string = `${PREFIX}folder-a`;
const FOLDER_B: string = `${PREFIX}folder-b`;
const WIZARD_SESSION = "11111111-2222-4333-8444-555555555555";

// ---------------------------------------------------------------------------
// State capture/restore.
//
// `promoteSettings`'s two channel statements are scoped by `is distinct from`
// the promoted folder, so they are GLOBAL over drive_watch_channels — running
// them would supersede or orphan any unrelated row this local stack happens to
// hold. The whole table is therefore captured and put back, not just the
// fixture rows. Same for the singleton settings row and the global
// WATCH_CHANNEL_ORPHANED alert row, which the real mismatch path upserts
// through `markWatchOrphanedWithTx`.
// ---------------------------------------------------------------------------

type Captured = {
  settings: postgres.JSONValue | null;
  channels: postgres.JSONValue[];
  alerts: postgres.JSONValue[];
};

async function captureAll(): Promise<Captured> {
  const settings = await admin<{ row: postgres.JSONValue }[]>`
    select to_jsonb(t) as row from public.app_settings t where id = 'default'
  `;
  const channels = await admin<{ row: postgres.JSONValue }[]>`
    select to_jsonb(t) as row from public.drive_watch_channels t
  `;
  const alerts = await admin<{ row: postgres.JSONValue }[]>`
    select to_jsonb(t) as row from public.admin_alerts t where code = 'WATCH_CHANNEL_ORPHANED'
  `;
  return {
    settings: settings[0]?.row ?? null,
    channels: channels.map((r) => r.row),
    alerts: alerts.map((r) => r.row),
  };
}

async function restoreAll(captured: Captured): Promise<void> {
  // ONE transaction: a restore that clears state and then fails to put it back
  // leaves the damage in place for every suite that runs after this one, and
  // the next capture reads the emptied table as the truth.
  await admin.begin(async (tx) => {
    await tx`delete from public.drive_watch_channels`;
    for (const row of captured.channels) {
      await tx`
        insert into public.drive_watch_channels
        select * from jsonb_populate_record(null::public.drive_watch_channels, ${admin.json(row)})
      `;
    }
    await tx`delete from public.admin_alerts where code = 'WATCH_CHANNEL_ORPHANED'`;
    for (const row of captured.alerts) {
      await tx`
        insert into public.admin_alerts
        select * from jsonb_populate_record(null::public.admin_alerts, ${admin.json(row)})
      `;
    }
    await tx`delete from public.app_settings where id = 'default'`;
    if (captured.settings !== null) {
      await tx`
        insert into public.app_settings
        select * from jsonb_populate_record(null::public.app_settings, ${admin.json(captured.settings)})
      `;
    }
  });
}

/** Wizard state promotion requires: watching A, with B staged to promote. */
async function seedPromotableSettings(): Promise<number> {
  const rows = await admin<{ id: string }[]>`
    insert into public.app_settings
      (id, watched_folder_id, watched_folder_name, pending_folder_id, pending_folder_name,
       pending_wizard_session_id, pending_folder_set_at)
    values ('default', ${FOLDER_A}, 'A', ${FOLDER_B}, 'B', ${WIZARD_SESSION}::uuid, now())
    on conflict (id) do update set
      watched_folder_id = excluded.watched_folder_id,
      watched_folder_name = excluded.watched_folder_name,
      watched_folder_set_by_email = null,
      watched_folder_set_at = now(),
      pending_folder_id = excluded.pending_folder_id,
      pending_folder_name = excluded.pending_folder_name,
      pending_folder_set_by_email = null,
      pending_wizard_session_id = excluded.pending_wizard_session_id,
      pending_folder_set_at = excluded.pending_folder_set_at
    returning id
  `;
  return rows.length;
}

async function seedPending(id: string, folderId: string): Promise<number> {
  const rows = await admin<{ id: string }[]>`
    insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
    values (${id}, 'pending', ${folderId}, 'secret') returning id
  `;
  return rows.length;
}

/**
 * The probe's stale predicate, against the real tables: an `active` channel
 * whose folder is not the configured one. Deliberately read from the DB rather
 * than from any in-process value the guard itself produced (anti-tautology).
 */
async function staleActiveCount(): Promise<number> {
  const rows = await admin<{ count: number }[]>`
    select count(*)::int as count
      from public.drive_watch_channels c, public.app_settings s
     where s.id = 'default'
       and c.status = 'active'
       and c.watched_folder_id is distinct from s.watched_folder_id
  `;
  return rows[0]?.count ?? -1;
}

async function statusOf(id: string): Promise<string | undefined> {
  const rows = await admin<{ status: string }[]>`
    select status from public.drive_watch_channels where id = ${id}
  `;
  return rows[0]?.status;
}

/**
 * `promoteSettings` (app/api/admin/onboarding/finalize-cas/route.ts, symbol
 * `promoteSettings`) reproduced statement-for-statement: the settings swap and
 * BOTH channel statements, in that order, in one transaction.
 *
 * `onAfterUpdate` is a PHASE ACKNOWLEDGEMENT — it fires only once the settings
 * UPDATE has returned, i.e. the row lock is provably held and the transaction
 * is still open. Schedules await it instead of sleeping and hoping.
 */
async function promotionTx(
  sql: postgres.Sql,
  opts: { holdUntil?: Promise<void>; onAfterUpdate?: () => void } = {},
): Promise<string | null> {
  return await sql.begin(async (tx) => {
    const rows = (await tx.unsafe(
      `
        update public.app_settings
           set watched_folder_id = pending_folder_id,
               watched_folder_name = pending_folder_name,
               watched_folder_set_by_email = pending_folder_set_by_email,
               watched_folder_set_at = pending_folder_set_at,
               pending_folder_id = null,
               pending_folder_name = null,
               pending_folder_set_by_email = null,
               pending_folder_set_at = null,
               pending_wizard_session_id = null,
               pending_wizard_session_at = null,
               updated_at = now()
         where id = 'default'
           and pending_wizard_session_id = $1::uuid
           and pending_folder_id is not null
        returning watched_folder_id
      `,
      [WIZARD_SESSION],
    )) as Array<{ watched_folder_id: string | null }>;
    opts.onAfterUpdate?.();
    const promoted = rows[0]?.watched_folder_id ?? null;
    if (promoted !== null) {
      await tx.unsafe(
        `
          update public.drive_watch_channels
             set status = 'superseded', superseded_at = now()
           where status = 'active' and watched_folder_id is distinct from $1
        `,
        [promoted],
      );
      await tx.unsafe(
        `
          update public.drive_watch_channels
             set status = 'orphaned'
           where status = 'pending' and watched_folder_id is distinct from $1
        `,
        [promoted],
      );
    }
    if (opts.holdUntil) await opts.holdUntil;
    return promoted;
  });
}

/**
 * Settles to "pending" if `p` has not settled within `ms`. A POSITIVE probe
 * that a task is genuinely blocked — the thing a sleep-then-measure cannot
 * establish.
 */
function settledWithin(p: Promise<unknown>, ms: number): Promise<"settled" | "pending"> {
  return Promise.race([
    p.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
  ]);
}

const watchStub = (channelId: string) => async () => ({
  id: channelId,
  resourceId: `resource-${channelId}`,
  expiration: new Date(Date.now() + 86_400_000).toISOString(),
});

/** `withTx` bound to one connection, mirroring production's `withDefaultTx`:
 *  each runTx call gets its own transaction over that connection. */
function withTxOn(sql: postgres.Sql) {
  return async <R>(fn: (tx: unknown) => Promise<R>): Promise<R> => {
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    return (await sql.begin(async (tx) => fn(createPostgresWatchTx(tx as never)))) as R;
  };
}

let captured: Captured = { settings: null, channels: [], alerts: [] };
let restoreSink: (() => void) | null = null;

beforeAll(async () => {
  captured = await captureAll();
  // The mismatch path's warn is PERSISTENT (it carries a code), so the default
  // sink would insert app_events rows. Prevent rather than clean: a silent,
  // persist-free sink for the whole suite means there is nothing to restore.
  setLogSink(() => {});
  restoreSink = () => setLogSink(() => {});
});

afterEach(async () => {
  await admin`delete from public.drive_watch_channels where watched_folder_id like ${PREFIX + "%"}`;
});

afterAll(async () => {
  restoreSink?.();
  await restoreAll(captured);
  await admin.end({ timeout: 5 });
});

describe("watch activation vs folder promotion — the four interleavings (spec §2, §5 test 1)", () => {
  test("S1 promotion commits first, then a subscriber holding the OLD folder activates: aborted, zero stale", async () => {
    premiseHolds("the two fixture folders differ", FOLDER_A !== FOLDER_B);
    premiseHolds(
      "the promotable settings seed wrote one row",
      (await seedPromotableSettings()) === 1,
    );

    // Promotion runs to completion. No channel row exists yet, so its two
    // channel statements catch nothing — this is exactly the window the
    // finalize-cas NOTE described as uncovered.
    expect(await promotionTx(admin)).toBe(FOLDER_B);

    const sub = conn();
    try {
      const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
      // The subscriber still holds FOLDER_A: it read the configured folder
      // before promotion committed.
      const result = await subscribeToWatchedFolder(FOLDER_A, {
        withTx: withTxOn(sub),
        uuid: () => `${PREFIX}s1`,
        webhookSecret: () => "secret",
        watchFolder: watchStub(`${PREFIX}s1`),
      } as unknown as Parameters<typeof subscribeToWatchedFolder>[1]);

      // The spec-named failure FIRST, and read from the DB rather than from any
      // in-process value the guard itself produced: with the guard disabled this
      // is 1 — one stale `active` channel delivering webhooks for an unwatched
      // folder for up to WATCH_TTL_MS.
      expect(await staleActiveCount()).toBe(0);
      expect(result.outcome).toBe("folder_changed");
      // The Drive channel WAS created, so the row must carry the resourceId GC
      // needs to stop it.
      expect(await statusOf(`${PREFIX}s1`)).toBe("orphaned");
    } finally {
      await sub.end({ timeout: 5 });
    }
  }, 20_000);

  test("S2 promotion holds the settings row: the guard BLOCKS, then wakes to the promoted folder and aborts", async () => {
    premiseHolds(
      "the promotable settings seed wrote one row",
      (await seedPromotableSettings()) === 1,
    );

    const sub = conn();
    const promo = conn();
    try {
      // The Drive stub is the gate: it acknowledges that the pending row is
      // committed and Drive has returned, then holds the subscriber right
      // before activation. That is the real shape of this race — the pending
      // row EXISTS when promotion runs, so promotion's own orphan statement
      // catches it, and activation is the only thing left to serialize.
      let proceed!: () => void;
      const activationGate = new Promise<void>((r) => (proceed = r));
      let ackDrive!: () => void;
      const driveReturned = new Promise<void>((r) => (ackDrive = r));

      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let ackUpdate!: () => void;
      const updated = new Promise<void>((r) => (ackUpdate = r));

      const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
      const subDone = subscribeToWatchedFolder(FOLDER_A, {
        withTx: withTxOn(sub),
        uuid: () => `${PREFIX}s2`,
        webhookSecret: () => "secret",
        watchFolder: async () => {
          ackDrive();
          await activationGate;
          return {
            id: `${PREFIX}s2`,
            resourceId: `resource-${PREFIX}s2`,
            expiration: new Date(Date.now() + 86_400_000).toISOString(),
          };
        },
      } as unknown as Parameters<typeof subscribeToWatchedFolder>[1]);

      await driveReturned; // PROOF: the pending row is committed
      premiseHolds(
        "the subscriber's pending row exists before promotion runs",
        (await statusOf(`${PREFIX}s2`)) === "pending",
      );

      const promoDone = promotionTx(promo, { holdUntil: gate, onAfterUpdate: ackUpdate });
      await updated; // PROOF: the settings UPDATE returned, so the row lock is held

      proceed();
      // "pending" = the subscriber is genuinely blocked, not merely slow.
      // Without this the schedule proves nothing about contention.
      expect(await settledWithin(subDone, 700)).toBe("pending");

      release();
      await promoDone;
      const result = await subDone;

      // The load-bearing claim: a `for share` that blocked on promotion's
      // uncommitted UPDATE re-reads the NEWEST committed row version on wake,
      // so the guard sees the promoted folder rather than the stale one.
      expect(result.outcome).toBe("folder_changed");
      expect(result).toMatchObject({ configuredFolderId: FOLDER_B });
      expect(await staleActiveCount()).toBe(0);
    } finally {
      await sub.end({ timeout: 5 });
      await promo.end({ timeout: 5 });
    }
  }, 20_000);

  test("S3 the subscriber commits first: promotion's own in-tx supersede catches it, zero stale", async () => {
    premiseHolds(
      "the promotable settings seed wrote one row",
      (await seedPromotableSettings()) === 1,
    );

    const sub = conn();
    try {
      const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
      const result = await subscribeToWatchedFolder(FOLDER_A, {
        withTx: withTxOn(sub),
        uuid: () => `${PREFIX}s3`,
        webhookSecret: () => "secret",
        watchFolder: watchStub(`${PREFIX}s3`),
      } as unknown as Parameters<typeof subscribeToWatchedFolder>[1]);

      // Settings still name A at guard time, so activation is correct here.
      expect(result.outcome).toBe("active");
      expect(await statusOf(`${PREFIX}s3`)).toBe("active");

      expect(await promotionTx(admin)).toBe(FOLDER_B);

      expect(await statusOf(`${PREFIX}s3`)).toBe("superseded");
      expect(await staleActiveCount()).toBe(0);
    } finally {
      await sub.end({ timeout: 5 });
    }
  }, 20_000);

  test("S4 overlap: the subscriber holds the share lock, promotion WAITS, both complete, zero stale", async () => {
    premiseHolds(
      "the promotable settings seed wrote one row",
      (await seedPromotableSettings()) === 1,
    );
    premiseHolds(
      "the pending fixture row was seeded",
      (await seedPending(`${PREFIX}s4`, FOLDER_A)) === 1,
    );

    const sub = conn();
    const promo = conn();
    try {
      let holdRelease!: () => void;
      const hold = new Promise<void>((r) => (holdRelease = r));
      let ackShare!: () => void;
      const shareHeld = new Promise<void>((r) => (ackShare = r));

      // The pause point is INTERNAL to `activatePending`, between its guard
      // select and its first channel UPDATE. This proxy reaches it without any
      // production-code hook: the SQL that runs is still the production
      // adapter's, verbatim — only the moment between two of its statements is
      // instrumented.
      const instrumented = (tx: postgres.TransactionSql) => {
        let paused = false;
        return {
          async unsafe(query: string, params: unknown[] = []) {
            const rows = (await tx.unsafe(query, params as never[])) as unknown[];
            if (!paused && query.includes("for share")) {
              paused = true;
              ackShare();
              await hold;
            }
            return rows;
          },
        };
      };

      const { createPostgresWatchTx } = await import("@/lib/drive/watch");
      const subDone = sub.begin(async (tx) =>
        createPostgresWatchTx(instrumented(tx) as never).activatePending({
          id: `${PREFIX}s4`,
          watchedFolderId: FOLDER_A,
          resourceId: "resource-s4",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      );
      await shareHeld; // PROOF: the share lock is held before promotion starts

      let ackUpdate!: () => void;
      const promoUpdated = new Promise<void>((r) => (ackUpdate = r));
      const promoDone = promotionTx(promo, { onAfterUpdate: ackUpdate });

      // Promotion's settings UPDATE must WAIT on the share lock. Lock order is
      // settings-then-channels on both sides, so it waits rather than deadlocks.
      expect(await settledWithin(promoUpdated, 700)).toBe("pending");

      holdRelease();
      await subDone;
      await promoDone; // completes: no deadlock (the 5s statement_timeout bounds it)
      await promoUpdated;

      // The subscriber activated against the folder that was configured when it
      // looked, and promotion's supersede then caught the now-committed row.
      expect(await statusOf(`${PREFIX}s4`)).toBe("superseded");
      expect(await staleActiveCount()).toBe(0);
    } finally {
      await sub.end({ timeout: 5 });
      await promo.end({ timeout: 5 });
    }
  }, 20_000);
});
