/**
 * Hybrid-lifecycle (spec 2026-07-16 §3.4) — REAL-Postgres matrix for
 * resolveUnreadableAlertIfHealed. Drives the PRODUCTION helper directly against
 * a rollback-wrapped real transaction and asserts on the row's `resolved_at`
 * (never on "helper called") so a broken healing predicate flips the test RED.
 *
 * DB convention mirrors tests/sync/def1-cron-resync-clear.db.test.ts: module-top
 * probe so `it.skipIf(!dbUp)` is accurate at collection time, rollback per case,
 * no cleanup / no env mutation.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  resolveUnreadableAlertIfHealed,
  type ResolveSql,
} from "@/lib/adminAlerts/resolveOnboardingSheetUnreadable";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let sql: Sql | null = null;
let dbUp = false;
try {
  const probe = postgres(DB_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as Sql).end().catch(() => {});
  sql = null;
  dbUp = false;
}

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 }).catch(() => {});
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql!.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

const FOLDER = "folder-heal-x";
const MODIFIED = "2026-06-21T12:00:00.000Z";
const OLDER = "2026-06-20T00:00:00.000Z";

async function seedOpenAlert(
  tx: Sql,
  context: Record<string, unknown>,
): Promise<string> {
  // Clear any pre-existing open global row (seed data / other tests) so the
  // one-unresolved unique index does not collide and our row is THE open one.
  await tx`
    update public.admin_alerts set resolved_at = now()
     where code = 'ONBOARDING_SHEET_UNREADABLE' and show_id is null and resolved_at is null`;
  const [row] = await tx`
    insert into public.admin_alerts (show_id, code, context)
    values (null, 'ONBOARDING_SHEET_UNREADABLE', ${tx.json(context as Parameters<typeof tx.json>[0])})
    returning id`;
  return row!.id as string;
}

async function readResolvedAt(tx: Sql, id: string): Promise<string | null> {
  const [row] = await tx`select resolved_at from public.admin_alerts where id = ${id}`;
  return (row!.resolved_at as string | null) ?? null;
}

async function setWizardPending(tx: Sql, sessionId: string | null): Promise<void> {
  await tx`update public.app_settings set pending_wizard_session_id = ${sessionId} where id = 'default'`;
}

async function seedRegisteredShow(tx: Sql, driveFileId: string): Promise<void> {
  await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${driveFileId}, ${`sh-${randomUUID().slice(0, 8)}`}, 'T', 'c', 'v')`;
}

async function seedStaged(tx: Sql, driveFileId: string, stagedModifiedTime: string): Promise<void> {
  await tx`
    insert into public.pending_syncs
      (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id)
    values (${driveFileId}, ${stagedModifiedTime}::timestamptz, ${tx.json({ show: { title: "x" } })},
            'cron', '', null)`;
}

function call(tx: Sql, activeFolderId: string, listedFiles: Map<string, string>) {
  return resolveUnreadableAlertIfHealed(
    { activeFolderId, listedFiles },
    tx as unknown as ResolveSql,
  );
}

describe("resolveUnreadableAlertIfHealed — real DB matrix (hybrid §3.4)", () => {
  it.skipIf(!dbUp)("all ids removed from folder -> resolves (resolved_at set)", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const id = await seedOpenAlert(tx, {
        folder_id: FOLDER,
        failed_drive_file_ids: ["d-gone-1", "d-gone-2"],
      });
      expect(await readResolvedAt(tx, id)).toBeNull();
      const r = await call(tx, FOLDER, new Map()); // none listed => all removed
      expect(r).toEqual({ kind: "ok", resolved: true });
      expect(await readResolvedAt(tx, id)).not.toBeNull();
    });
  });

  it.skipIf(!dbUp)("all ids registered as shows -> resolves", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const driveId = `d-reg-${randomUUID()}`;
      await seedRegisteredShow(tx, driveId);
      const id = await seedOpenAlert(tx, { folder_id: FOLDER, failed_drive_file_ids: [driveId] });
      const r = await call(tx, FOLDER, new Map([[driveId, MODIFIED]]));
      expect(r).toEqual({ kind: "ok", resolved: true });
      expect(await readResolvedAt(tx, id)).not.toBeNull();
    });
  });

  it.skipIf(!dbUp)("all ids current-revision staged -> resolves", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const driveId = `d-staged-${randomUUID()}`;
      await seedStaged(tx, driveId, MODIFIED);
      const id = await seedOpenAlert(tx, { folder_id: FOLDER, failed_drive_file_ids: [driveId] });
      const r = await call(tx, FOLDER, new Map([[driveId, MODIFIED]]));
      expect(r).toEqual({ kind: "ok", resolved: true });
      expect(await readResolvedAt(tx, id)).not.toBeNull();
    });
  });

  it.skipIf(!dbUp)("one still-failing id (listed, unregistered, unstaged) -> stays open", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const driveId = `d-fail-${randomUUID()}`;
      const id = await seedOpenAlert(tx, { folder_id: FOLDER, failed_drive_file_ids: [driveId] });
      const r = await call(tx, FOLDER, new Map([[driveId, MODIFIED]]));
      expect(r).toEqual({ kind: "ok", resolved: false });
      expect(await readResolvedAt(tx, id)).toBeNull();
    });
  });

  it.skipIf(!dbUp)("stale-staged (older staged_modified_time than listing) -> stays open (R1-1)", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const driveId = `d-stale-${randomUUID()}`;
      await seedStaged(tx, driveId, OLDER); // staged at an OLDER revision than the listing
      const id = await seedOpenAlert(tx, { folder_id: FOLDER, failed_drive_file_ids: [driveId] });
      const r = await call(tx, FOLDER, new Map([[driveId, MODIFIED]]));
      expect(r).toEqual({ kind: "ok", resolved: false });
      expect(await readResolvedAt(tx, id)).toBeNull();
    });
  });

  it.skipIf(!dbUp)("folder mismatch -> resolves without inspecting ids", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const id = await seedOpenAlert(tx, {
        folder_id: "some-other-folder",
        failed_drive_file_ids: ["d-anything"],
      });
      const r = await call(tx, FOLDER, new Map([["d-anything", MODIFIED]]));
      expect(r).toEqual({ kind: "ok", resolved: true });
      expect(await readResolvedAt(tx, id)).not.toBeNull();
    });
  });

  it.skipIf(!dbUp)("wizard pending -> stays open even when all ids satisfied", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, randomUUID());
      const id = await seedOpenAlert(tx, {
        folder_id: FOLDER,
        failed_drive_file_ids: ["d-gone"],
      });
      const r = await call(tx, FOLDER, new Map()); // id removed => would heal, but wizard pending
      expect(r).toEqual({ kind: "ok", resolved: false });
      expect(await readResolvedAt(tx, id)).toBeNull();
    });
  });

  it.skipIf(!dbUp)("empty failed_drive_file_ids -> stays open", async () => {
    await inRollback(async (tx) => {
      await setWizardPending(tx, null);
      const id = await seedOpenAlert(tx, { folder_id: FOLDER, failed_drive_file_ids: [] });
      const r = await call(tx, FOLDER, new Map());
      expect(r).toEqual({ kind: "ok", resolved: false });
      expect(await readResolvedAt(tx, id)).toBeNull();
    });
  });
});
