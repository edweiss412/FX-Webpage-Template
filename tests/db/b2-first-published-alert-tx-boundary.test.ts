import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

// R3 (adversarial, HIGH) real-DB regression. The first-seen auto-publish apply tail emits
// SHOW_FIRST_PUBLISHED via lib/sync/applyStaged.ts's DEFAULT `firstPublishedTailDeps` writer. R2/R3
// were BOTH masked by the unit test injecting a tail spy (the mocked-only-tautology class): an injected
// mock never exercises the FK against a real, in-flight `shows` row. This real-DB test pins the contract
// that justifies the fix — the alert MUST be written in the show's OWN transaction.
//
// The bug: the tail wrote the alert through the standalone service-role client
// (createSupabaseServiceRoleClient), a SEPARATE DB session that cannot see the apply tx's uncommitted
// show. To that session the just-created show does not exist, so admin_alerts.show_id → shows.id
// FK-fails (or deadlocks against the apply tx that is itself blocked on the synchronous tail) — either
// way the whole approval rolls back. The fix routes the write through tx.queryOne on the apply tx.

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The EXACT statement applyStaged's default firstPublishedTailDeps writer runs (lib/sync/applyStaged.ts).
// Pinning the literal ties this regression to the production statement, not a paraphrase.
const UPSERT_ALERT_SQL =
  "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id";

// Mirrors tests/db/_b2Helpers.ts seedShow's column set (the known-minimal valid `shows` insert) plus the
// auto-publish unpublish_token pair persisted by applyShowSnapshot on a first-seen auto-publish.
function insertShowSql(showId: string, driveFileId: string): [string, string[]] {
  return [
    `insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
       archived, published, archived_at, requires_resync, picker_epoch,
       unpublish_token, unpublish_token_expires_at)
     values ($1::uuid, $2, $3, 'First Seen Show', 'Client', 'v1',
       false, true, null, false, 1,
       $4::uuid, now() + interval '24 hours')`,
    [showId, driveFileId, `slug-${showId.slice(0, 8)}`, randomUUID()],
  ];
}

describe("R3 — first-seen SHOW_FIRST_PUBLISHED alert must be written in the show's own transaction", () => {
  const clients: Sql[] = [];
  const conn = (): Sql => {
    const c = postgres(DB_URL, { max: 1, prepare: false });
    clients.push(c);
    return c;
  };
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.end({ timeout: 5 })));
  });

  it("a separate session cannot write the alert for a show it does not see → FK violation (the standalone-client bug)", async () => {
    // A separate service-role session, mid-apply, sees no committed `shows` row for the in-flight show —
    // it is in exactly the position modeled here: writing an alert for a show_id absent from its snapshot.
    // The FK rejects it. (Production additionally risks a deadlock against the blocked apply tx; both fatal.)
    const b = conn();
    const orphanShowId = randomUUID();
    await expect(
      b.unsafe(UPSERT_ALERT_SQL, [orphanShowId, "SHOW_FIRST_PUBLISHED", JSON.stringify({})]),
    ).rejects.toThrow(/foreign key|violates foreign key|admin_alerts/i);
  });

  it("the tx-bound writer (same tx as the show INSERT) succeeds; show + alert both persist on commit (the fix)", async () => {
    const a = conn();
    const showId = randomUUID();
    const driveFileId = `drive-${randomUUID()}`;

    const alertId = await a.begin(async (tx) => {
      const [sqlText, params] = insertShowSql(showId, driveFileId);
      await tx.unsafe(sqlText, params);
      // Same-tx alert write (matches applyStaged's default firstPublishedTailDeps writer): the show is
      // uncommitted but visible WITHIN this transaction, so the FK is satisfied.
      const rows = await tx.unsafe(UPSERT_ALERT_SQL, [
        showId,
        "SHOW_FIRST_PUBLISHED",
        JSON.stringify({ first_seen: true }),
      ]);
      return (rows[0] as unknown as { id: string }).id;
    });
    expect(alertId).toBeTruthy();

    // Post-commit: BOTH the show (carrying its auto-publish unpublish_token) AND the alert persist.
    const [show] = await a`select unpublish_token from public.shows where id = ${showId}::uuid`;
    expect(show?.unpublish_token).toBeTruthy();
    const [alert] =
      await a`select code, show_id from public.admin_alerts where id = ${alertId}::uuid`;
    expect(alert).toMatchObject({ code: "SHOW_FIRST_PUBLISHED", show_id: showId });

    await a`delete from public.shows where id = ${showId}::uuid`; // FK cascade removes the alert row
  });
});
