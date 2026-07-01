import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import type { TransportationRow } from "@/lib/parser/types";

// Real-DB round-trip for the cron write (replaceTransportation) + the Phase-1
// change-detection read-back (readShowForPhase1). Catches the exact failure mode
// a mocked test cannot: a dropped INSERT column (silent data loss) or a missing
// canonicalize on loadout_email. Skips gracefully when the local DB is down.
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

const row = (over: Partial<TransportationRow>): TransportationRow => ({
  driver_name: "Tracy Edwards",
  driver_phone: null,
  driver_email: null,
  loadout_name: null,
  loadout_phone: null,
  loadout_email: null,
  vehicle: null,
  license_plate: null,
  color: null,
  parking: null,
  schedule: [],
  notes: null,
  ...over,
});

describe("replaceTransportation — loadout_* round-trip (real DB)", () => {
  test.skipIf(!dbUp)(
    "persists loadout_name/phone, canonicalizes loadout_email, and the read-back returns all three",
    async () => {
      const driveFileId = `loadout-rt-${process.pid}-${Math.floor(performance.now())}`;
      let direct:
        | { loadout_name: string; loadout_phone: string; loadout_email: string }
        | undefined;
      let readback: TransportationRow | null | undefined;

      await sql!
        .begin(async (tx) => {
          const inserted = (await tx.unsafe(
            `insert into public.shows (drive_file_id, slug, title, client_label, template_version)
             values ($1, $2, $3, $4, $5) returning id`,
            [driveFileId, driveFileId, "Test Show", "Client", "v4"],
          )) as unknown as Array<{ id: string }>;
          const showId = inserted[0]!.id;

          const pipe = makeSyncPipelineTx(tx as unknown as PostgresTransaction);
          await pipe.replaceTransportation(
            showId,
            row({
              loadout_name: "Carlos Pineda",
              loadout_phone: "610-618-0111",
              loadout_email: "Carlos@X.COM", // mixed case → must canonicalize to lowercase
            }),
          );

          // (a) direct read-back — proves the INSERT actually wrote the three columns
          direct = (
            (await tx.unsafe(
              `select loadout_name, loadout_phone, loadout_email
                 from public.transportation where show_id = $1`,
              [showId],
            )) as unknown as Array<typeof direct>
          )[0];

          // (b) change-detection read-back — proves the Phase-1 SELECT includes the columns.
          // readShowForPhase1 nests the row under priorParseResult (§ return shape).
          const showForPhase1 = (await pipe.readShowForPhase1(driveFileId)) as {
            priorParseResult: { transportation: TransportationRow | null };
          } | null;
          readback = showForPhase1?.priorParseResult.transportation;

          throw new Error(ROLLBACK); // leave no residue
        })
        .catch((e: unknown) => {
          if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
        });

      // (a) direct persistence + canonicalization
      expect(direct?.loadout_name).toBe("Carlos Pineda");
      expect(direct?.loadout_phone).toBe("610-618-0111");
      expect(direct?.loadout_email).toBe("carlos@x.com"); // canonicalized at the write boundary

      // (b) the change-detection read-back returns the three (so a load-out-only edit is a real change)
      expect(readback?.loadout_name).toBe("Carlos Pineda");
      expect(readback?.loadout_phone).toBe("610-618-0111");
      expect(readback?.loadout_email).toBe("carlos@x.com");
    },
  );
});
