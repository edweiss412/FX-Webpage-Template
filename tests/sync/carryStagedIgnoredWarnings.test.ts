/**
 * tests/sync/carryStagedIgnoredWarnings.test.ts
 * (wizard-warning-ignore-controls spec §2.7 — Task 7)
 *
 * The two pipeline proofs in `stagedIgnoreCarry.test.ts` show the carry reaching Postgres
 * on both apply paths. This suite pins the property those cannot reach: what the carry
 * does when something goes WRONG.
 *
 * The failure mode worth naming is not a crash — it is a publish that looks completely
 * successful and quietly dropped the operator's dismissals. They would find out when every
 * warning they cleared reappeared on the published page, with nothing in the logs. So the
 * carry catches nothing, and refuses loudly when it cannot write at all.
 */
import { describe, expect, it, vi } from "vitest";
import {
  carryableIgnoreEntries,
  carryStagedIgnoredWarnings,
} from "@/lib/sync/carryStagedIgnoredWarnings";
import type { HoldPort } from "@/lib/sync/holds/holdPort";
import type { StagedIgnoreEntry } from "@/lib/admin/wizardWarningModel";

const entry = (over: Partial<StagedIgnoreEntry> = {}): StagedIgnoreEntry => ({
  fingerprint: "fp-1",
  code: "UNKNOWN_FIELD",
  ignored_by: "doug@fxav.com",
  ...over,
});

const okPort = () => ({ unsafe: vi.fn(async () => [] as unknown[]) }) satisfies HoldPort;

describe("carryableIgnoreEntries", () => {
  it("canonicalizes ignored_by so the durable table's CHECK can accept it", () => {
    // The staged column carries no CHECK; the durable table requires lower+trimmed+non-empty
    // (`supabase/migrations/20260702120000_ignored_warnings.sql:8-9`). A pass-through would
    // turn this row into a failed publish.
    expect(carryableIgnoreEntries([entry({ ignored_by: "  Doug.W@Example.COM " })])).toEqual([
      entry({ ignored_by: "doug.w@example.com" }),
    ]);
  });

  it("DROPS an entry whose ignored_by cannot be canonicalized, rather than failing the publish", () => {
    // Losing one dismissal is bad. Refusing to publish the show because of it is worse.
    expect(
      carryableIgnoreEntries([entry({ ignored_by: "   " }), entry({ fingerprint: "fp-2" })]),
    ).toEqual([entry({ fingerprint: "fp-2" })]);
  });

  it("drops entries without a usable fingerprint", () => {
    expect(
      carryableIgnoreEntries([
        entry({ fingerprint: "" }),
        entry({ fingerprint: 7 as unknown as string }),
        entry({ fingerprint: "fp-keep" }),
      ]),
    ).toEqual([entry({ fingerprint: "fp-keep" })]);
  });

  it("de-duplicates repeated fingerprints instead of leaning on the conflict clause", () => {
    expect(
      carryableIgnoreEntries([entry(), entry({ ignored_by: "someone.else@fxav.com" })]),
    ).toEqual([entry()]);
  });
});

describe("carryStagedIgnoredWarnings — fault posture (§2.7)", () => {
  it("inserts one row per carryable entry, with on-conflict-do-nothing", async () => {
    const port = okPort();
    await carryStagedIgnoredWarnings(port, {
      showId: "show-1",
      entries: [entry(), entry({ fingerprint: "fp-2" })],
    });
    expect(port.unsafe).toHaveBeenCalledTimes(2);
    const [sql, params] = port.unsafe.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/insert into public\.ignored_warnings/);
    expect(sql).toMatch(/on conflict \(show_id, fingerprint\) do nothing/);
    expect(params).toEqual(["show-1", "fp-1", "UNKNOWN_FIELD", "doug@fxav.com"]);
  });

  it("does NOT swallow a write fault — it propagates, exactly as the use-raw re-persist's does", async () => {
    // A caught-and-logged fault here is the silent-drop failure this whole suite exists for:
    // the apply would commit, the publish would report success, and the dismissals would be
    // gone. The rejection must reach the phase-2 transaction so the apply rolls back.
    const port: HoldPort = {
      unsafe: vi.fn(async () => {
        throw new Error("simulated ignored_warnings insert fault");
      }),
    };
    await expect(
      carryStagedIgnoredWarnings(port, { showId: "show-1", entries: [entry()] }),
    ).rejects.toThrow(/simulated ignored_warnings insert fault/);
  });

  it("REFUSES when there are entries to carry and no port to carry them with", async () => {
    // The tempting shape is `if (!port) return;`. That is a publish that dropped the
    // operator's decisions and reported success.
    await expect(
      carryStagedIgnoredWarnings(undefined, { showId: "show-1", entries: [entry()] }),
    ).rejects.toThrow(/holdPort/);
  });

  it("is a no-op with no port when there is nothing to carry", async () => {
    // The refusal above must not turn every port-less apply into a failure — only the ones
    // that would actually lose something.
    await expect(
      carryStagedIgnoredWarnings(undefined, { showId: "show-1", entries: [] }),
    ).resolves.toBeUndefined();
    // An all-dropped list is also a no-op, deliberately: those entries were already lost at
    // the coercion boundary above, so refusing here would fail the publish over something
    // the carry could never have written anyway.
    await expect(
      carryStagedIgnoredWarnings(undefined, {
        showId: "show-1",
        entries: [entry({ ignored_by: "  " })],
      }),
    ).resolves.toBeUndefined();
  });
});
