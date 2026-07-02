import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

// DQIGNORE-3: on apply (parse_warnings full-replace), prune ignored_warnings rows whose
// content fingerprint is no longer present in the new parse — a warning that was ignored and
// has since been fixed/removed. Runs in the SAME locked apply tx (single-holder). A still-present
// warning keeps its fingerprint, so its ignore SURVIVES (recurrence preserved). Real DB: a mocked
// test cannot prove the DELETE targets exactly the orphaned fingerprints. Skips if the DB is down.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 2,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

const ROLLBACK = "ROLLBACK_SENTINEL";
const financials = { po: null, proposal: null, invoice: null, invoice_notes: null };
const warn = (code: string, rawSnippet: string): ParseWarning => ({
  severity: "warn",
  code,
  message: `${code} warning`,
  rawSnippet,
});

async function seedShow(tx: postgres.TransactionSql, driveFileId: string): Promise<string> {
  const inserted = (await tx.unsafe(
    `insert into public.shows (drive_file_id, slug, title, client_label, template_version)
     values ($1, $2, $3, $4, $5) returning id`,
    [driveFileId, driveFileId, "Test Show", "Client", "v4"],
  )) as unknown as Array<{ id: string }>;
  return inserted[0]!.id;
}

describe("upsertShowsInternal — DQIGNORE-3 orphan ignored_warnings GC (real DB)", () => {
  test.skipIf(!dbUp)(
    "prunes an ignore whose fingerprint vanished from the new parse; keeps a still-present one",
    async () => {
      const driveFileId = `dqignore3-${process.pid}-${Math.floor(performance.now())}`;
      const present = warn("UNKNOWN_FIELD", "Storage | dock");
      const fpPresent = warningFingerprint(present)!;
      const fpOrphan = warningFingerprint({
        code: "UNKNOWN_SECTION_HEADER",
        rawSnippet: "Removed Section",
      })!;
      let survivors: string[] = [];

      await sql!
        .begin(async (tx) => {
          const showId = await seedShow(tx, driveFileId);
          // Two standing ignores: one whose warning still fires, one now orphaned.
          await tx.unsafe(
            `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
             values ($1, $2, $3, $4), ($1, $5, $6, $4)`,
            [showId, fpPresent, "UNKNOWN_FIELD", "admin@x.com", fpOrphan, "UNKNOWN_SECTION_HEADER"],
          );
          const pipe = makeSyncPipelineTx(tx as unknown as PostgresTransaction);
          // The new parse still emits `present` but NOT the orphan.
          await pipe.upsertShowsInternal(showId, {
            financials,
            parse_warnings: [present],
            raw_unrecognized: [],
            run_of_show: null,
          });
          survivors = (
            (await tx.unsafe(
              `select fingerprint from public.ignored_warnings where show_id = $1 order by fingerprint`,
              [showId],
            )) as unknown as Array<{ fingerprint: string }>
          ).map((r) => r.fingerprint);
          throw new Error(ROLLBACK);
        })
        .catch((e: unknown) => {
          if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
        });

      expect(survivors).toContain(fpPresent); // still-present warning → ignore preserved (recurrence)
      expect(survivors).not.toContain(fpOrphan); // vanished warning → ignore pruned
      expect(survivors).toHaveLength(1);
    },
  );

  test.skipIf(!dbUp)(
    "prunes ALL ignores for the show when the new parse emits no ignorable warnings",
    async () => {
      const driveFileId = `dqignore3-empty-${process.pid}-${Math.floor(performance.now())}`;
      const fp = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" })!;
      let remaining = -1;

      await sql!
        .begin(async (tx) => {
          const showId = await seedShow(tx, driveFileId);
          await tx.unsafe(
            `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
             values ($1, $2, $3, $4)`,
            [showId, fp, "UNKNOWN_FIELD", "admin@x.com"],
          );
          const pipe = makeSyncPipelineTx(tx as unknown as PostgresTransaction);
          await pipe.upsertShowsInternal(showId, {
            financials,
            parse_warnings: [],
            raw_unrecognized: [],
            run_of_show: null,
          });
          remaining = Number(
            (
              (await tx.unsafe(
                `select count(*)::int as n from public.ignored_warnings where show_id = $1`,
                [showId],
              )) as unknown as Array<{ n: number }>
            )[0]!.n,
          );
          throw new Error(ROLLBACK);
        })
        .catch((e: unknown) => {
          if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
        });

      expect(remaining).toBe(0);
    },
  );
});
