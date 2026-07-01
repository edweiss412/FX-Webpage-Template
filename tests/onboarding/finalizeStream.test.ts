import { describe, expect, test, vi } from "vitest";
import {
  handleOnboardingFinalize,
  handleOnboardingFinalizeStream,
  type FinalizeRouteDeps,
} from "@/app/api/admin/onboarding/finalize/route";
import { FakeFinalizeDb, pending, deps, request, json, W1 } from "./_finalizeFake";

const NDJSON = "application/x-ndjson";

async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// Streaming deps: inject a deterministic no-op source-anchor fetch so the first-seen apply
// never attempts a real Drive read (which the default would).
function streamDeps(
  db: FakeFinalizeDb,
  overrides: Partial<FinalizeRouteDeps> = {},
): FinalizeRouteDeps {
  return deps(db, { fetchOnboardingSourceAnchors: vi.fn(async () => ({})), ...overrides });
}

describe("handleOnboardingFinalizeStream", () => {
  test("streams listed + one row per sheet + terminal result equal to the non-streaming body", async () => {
    const seed = () => {
      const db = new FakeFinalizeDb();
      db.approved = [pending("sheet-a"), pending("sheet-b")];
      return db;
    };

    const res = await handleOnboardingFinalizeStream(request(), streamDeps(seed()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(NDJSON);

    const msgs = await readNdjson(res);
    const listed = msgs.filter((m) => m.type === "listed");
    const rows = msgs.filter((m) => m.type === "row");
    const results = msgs.filter((m) => m.type === "result");

    expect(listed).toEqual([{ type: "listed", total: 2 }]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.done)).toEqual([1, 2]);
    expect(rows.every((r) => r.total === 2)).toBe(true);
    expect(rows.map((r) => r.driveFileId)).toEqual(["sheet-a", "sheet-b"]);
    expect(rows[0]!.name).toBe("Show sheet-a"); // parsedShowTitle(parse_result)
    expect(results).toHaveLength(1);

    // Anti-tautology: the terminal body must equal the non-streaming body for an
    // identically-seeded fake — assert against the authoritative source, not a literal.
    // (The server emits `name: parsedShowTitle(...) ?? null`; the name→driveFileId fallback is a
    // client concern, covered in tests/components/admin/FinalizeButton.test.tsx.)
    const nonStream = await handleOnboardingFinalize(request(), streamDeps(seed()));
    const nonStreamBody = await json(nonStream);
    expect(results[0]!.body).toEqual(nonStreamBody);
    expect((results[0]!.body as { status: string }).status).toBe("all_batches_complete");
  });

  test("zero-row finish emits listed(0), no row events, then terminal all_batches_complete", async () => {
    const db = new FakeFinalizeDb();
    db.checkpoint = { wizard_session_id: W1, status: "all_batches_complete", batches_completed: 1 };
    db.approved = [];
    const msgs = await readNdjson(await handleOnboardingFinalizeStream(request(), streamDeps(db)));
    expect(msgs.filter((m) => m.type === "listed")).toEqual([{ type: "listed", total: 0 }]);
    expect(msgs.filter((m) => m.type === "row")).toHaveLength(0);
    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
    expect(results[0]!.body).toMatchObject({ status: "all_batches_complete", remaining_count: 0 });
  });

  test("precondition failure surfaces as a terminal result on a 200 stream; non-streaming returns 409", async () => {
    const seed = () => {
      const db = new FakeFinalizeDb();
      db.finalizeLocked = false; // → CONCURRENT_FINALIZE_IN_FLIGHT
      db.approved = [pending("x")];
      return db;
    };

    const res = await handleOnboardingFinalizeStream(request(), streamDeps(seed()));
    expect(res.status).toBe(200);
    const msgs = await readNdjson(res);
    expect(msgs.filter((m) => m.type === "listed")).toHaveLength(0);
    expect(msgs.filter((m) => m.type === "row")).toHaveLength(0);
    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
    expect(results[0]!.body).toEqual({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" });

    // The non-streaming function keeps the real HTTP 409 for the same inputs.
    const nonStream = await handleOnboardingFinalize(request(), streamDeps(seed()));
    expect(nonStream.status).toBe(409);
    expect(await json(nonStream)).toEqual({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" });
  });

  test("auth failure returns a NON-stream 403 JSON (pre-stream, mirrors scan)", async () => {
    const db = new FakeFinalizeDb();
    const res = await handleOnboardingFinalizeStream(
      request(),
      streamDeps(db, {
        requireAdminIdentity: vi.fn(async () => {
          throw { code: "ADMIN_FORBIDDEN" };
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).not.toBe(NDJSON);
    expect(await res.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
  });

  test("the extra listed/countRemainingCleanRows query fires ONLY on the streaming path", async () => {
    const countRemaining = (db: FakeFinalizeDb) => {
      let n = 0;
      const orig = db.query.bind(db);
      (db as unknown as { query: typeof db.query }).query = (async (
        sql: string,
        params?: readonly unknown[],
      ) => {
        if (sql.replace(/\s+/g, " ").includes("count(*)::int as remaining_count")) n++;
        return orig(sql, params);
      }) as typeof db.query;
      return () => n;
    };

    const dbNon = new FakeFinalizeDb();
    dbNon.approved = [pending("a")];
    const getNon = countRemaining(dbNon);
    await handleOnboardingFinalize(request(), streamDeps(dbNon));

    const dbStr = new FakeFinalizeDb();
    dbStr.approved = [pending("a")];
    const getStr = countRemaining(dbStr);
    await readNdjson(await handleOnboardingFinalizeStream(request(), streamDeps(dbStr)));

    expect(getNon()).toBe(1); // end-of-loop remaining count only
    expect(getStr()).toBe(2); // start `listed` + end
  });

  test("two-batch listed reconciliation: 2 (batch1 rows) + 1 (batch2 listed) === 3 (batch1 listed)", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("m-0"), pending("m-1"), pending("m-2")];
    const routeDeps = streamDeps(db, { batchCap: 2 });

    const m1 = await readNdjson(await handleOnboardingFinalizeStream(request(), routeDeps));
    const listed1 = (m1.find((m) => m.type === "listed") as { total: number }).total;
    const rows1 = m1.filter((m) => m.type === "row").length;
    const body1 = (m1.find((m) => m.type === "result") as { body: Record<string, unknown> }).body;
    expect(listed1).toBe(3);
    expect(rows1).toBe(2);
    expect(body1.status).toBe("batch_complete");
    expect(body1.remaining_count).toBe(1);

    const m2 = await readNdjson(await handleOnboardingFinalizeStream(request(), routeDeps));
    const listed2 = (m2.find((m) => m.type === "listed") as { total: number }).total;
    const rows2 = m2.filter((m) => m.type === "row").length;
    const body2 = (m2.find((m) => m.type === "result") as { body: Record<string, unknown> }).body;
    expect(listed2).toBe(1);
    expect(rows2).toBe(1);
    expect(body2.status).toBe("all_batches_complete");

    // The reconciliation identity the client relies on for a stable cross-batch grand total.
    expect(rows1 + listed2).toBe(listed1);
  });
});
