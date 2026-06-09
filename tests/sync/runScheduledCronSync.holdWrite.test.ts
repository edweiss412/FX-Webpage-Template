/**
 * Phase 2 Task 2.3 — wire detect→write into the sync apply path (no nested lock).
 *
 * Drives runPhase2 with a real-postgres Phase2Tx (the same code path the cron/push orchestrator
 * uses, minus the Drive/lock shell). Asserts: an MI-11 sync writes the hold AND applies the rest
 * in the SAME txn, with the held email pinned. Plus the structural no-lock-taking-RPC guard.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { runPhase2 } from "@/lib/sync/phase2";

import {
  crew,
  parseResult,
  phase2Tx,
  readCrew,
  readHolds,
  seedCrew,
  seedShow,
} from "./_holdAwareTestkit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

const MT = "2026-06-08T12:00:00.000Z";

describe("Task 2.3 — wire mi11 hold write into the apply path", () => {
  it("an MI-11 sync writes the hold and still applies the rest of the parse in the SAME txn", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "a@old" }));
      await seedCrew(tx, showId, crew("Carl", { email: "c@old" }));

      // Next parse: Alice's email changed (MI-11) + Carl unchanged + an added Dana.
      const next = parseResult([
        crew("Alice", { email: "a@new" }),
        crew("Carl", { email: "c@old" }),
        crew("Dana", { email: "d@x" }),
      ]);

      const result = await runPhase2(phase2Tx(tx) as never, {
        driveFileId,
        mode: "cron",
        fileMeta: {
          driveFileId,
          name: "Sheet",
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: MT,
          parents: ["f"],
        },
        parseResult: next,
        binding: { bindingToken: "tok", modifiedTime: MT },
        verifyReelOnApply: false,
        mi11Items: [
          { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" },
        ],
      });
      expect(result.outcome).toBe("applied");

      // (a) Alice's hold exists.
      const holds = await readHolds(tx, showId);
      expect(holds.find((h) => h.entity_key === "Alice" && h.kind === "mi11_pending")).toBeDefined();

      const rows = await readCrew(tx, showId);
      // (c) Alice's email is STILL a@old (held) — proven by querying crew_members, not the parse.
      expect(rows.find((r) => r.name === "Alice")!.email).toBe("a@old");
      // The rest of the parse applied: Dana added, Carl present.
      expect(rows.find((r) => r.name === "Dana")).toBeDefined();
      expect(rows.find((r) => r.name === "Carl")).toBeDefined();
    });
  });

  it("no new migration in this phase defines a lock-taking RPC", () => {
    // Hold writes ride the existing JS show lock; this phase adds NO create-function with
    // pg_advisory_xact_lock in its body (mirrors tests/auth/advisoryLockRpcDeadlock.test.ts intent).
    // Only the 2.10b cutover migration contains pg_advisory_xact_lock, and it is a DO block, not a
    // create function — assert no create-function body in any phase-added migration takes the lock.
    const dir = "supabase/migrations";
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.startsWith("20260608")) continue; // this milestone's migrations
      // Strip SQL line-comments so prose mentioning "create function" / the lock does not match.
      const text = readFileSync(join(dir, file), "utf8")
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n");
      // A real lock-taking RPC: a `create ... function` whose body takes pg_advisory_xact_lock.
      if (/create\s+(or\s+replace\s+)?function[\s\S]*pg_advisory_xact_lock/i.test(text)) {
        offenders.push(file);
      }
    }
    // The 2.10b cutover migration takes the lock inside a DO block (NOT a create function), so it
    // is NOT a lock-taking RPC — it must NOT appear here.
    expect(offenders).toEqual([]);
  });
});
