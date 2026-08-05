// BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT — the exhausted-rebuild escalation
// is emitted from inside the outer finalize transaction.
//
// `ONBOARDING_SHADOW_REBUILD_EXHAUSTED` is emitted in the per-row loop of
// `runFinalizeCas`. That loop runs while `deps.withTx` is still open, which is
// where `tryFinalizeLock` and the `app_settings FOR UPDATE` row are held — so
// the emit happens INSIDE the locked transaction. Invariant 10 says outcome
// emits are POST-COMMIT and outside the advisory-lock tx, and the route's own
// two sibling emits (role-flags notices, unlanded renames) already obey it via
// the `DeferredApplyEmits` accumulator flushed in each handler's `finally`. This
// one was left behind.
//
// Spec §4.5 item 1 ratifies the shape: the event ALWAYS emits, including when
// the outer finalize rolls back — accumulator-and-`finally`.
//
// ANTI-TAUTOLOGY, and this is the whole design of the suite. "The event was
// emitted" is TRUE TODAY on the rollback path, because the inline emit fires
// before the outer throw — a test asserting only occurrence is green against the
// defect and proves nothing. What is actually wrong is WHERE it fires, so every
// case below asserts ORDER: the emit must land after `withTx` has settled. Both
// handlers are driven independently, because the streaming handler does its
// post-commit work inside the `ReadableStream` `start()` body and a fix applied
// to one finalizer leaves the other silently inside the lock.
import { beforeEach, describe, expect, test, vi } from "vitest";

const outcomes: Array<{ code: string; at: number }> = [];
let clock = 0;
const tick = (): number => ++clock;

vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: vi.fn(async (entry: { code: string }) => {
    outcomes.push({ code: entry.code, at: tick() });
  }),
}));

const { handleOnboardingFinalizeCas, handleOnboardingFinalizeCasStream } =
  await import("@/app/api/admin/onboarding/finalize-cas/route");
const { FakeFinalizeCasDb, deps, request, shadowPayload, W1 } =
  await import("../onboarding/_finalizeCasFake");

const EXHAUSTED = "ONBOARDING_SHADOW_REBUILD_EXHAUSTED";

/**
 * A shadow row whose rebuild has already been exhausted, so the escalation flips.
 *
 * The payload must be genuinely CORRUPT: the escalation lives on the
 * `parseShadowPayloadForApply` refusal branch, and a well-formed payload takes
 * the apply path instead and never reaches it. `parse_result: null` is the
 * `parse_result_absent` refusal (lib/onboarding/shadowPayload.ts:173).
 * `attempts` must be at or over `REBUILD_ATTEMPT_CAP` with `escalationLogged`
 * still false, which is what makes the in-txn claim match a row.
 */
function exhaustedDb(): InstanceType<typeof FakeFinalizeCasDb> {
  const db = new FakeFinalizeCasDb();
  db.shadowRows = [
    {
      wizard_session_id: W1,
      drive_file_id: "exhausted-1",
      show_id: "show-1",
      applied_by_email: "doug@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: shadowPayload({ parse_result: null }),
    } as never,
  ];
  db.rebuildAttempts.set("exhausted-1", { attempts: 99, escalationLogged: false });
  return db;
}

/** `withTx` that settles, records WHEN it settled, then rolls the outer tx back. */
function rollingBackDeps(db: InstanceType<typeof FakeFinalizeCasDb>, settled: { at: number }) {
  return deps(db, {
    withTx: async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        return await fn(db);
      } finally {
        settled.at = tick();
      }
    },
  } as never);
}

beforeEach(() => {
  outcomes.length = 0;
  clock = 0;
});

describe("the exhausted-rebuild escalation is emitted outside the locked transaction", () => {
  test("non-streaming handler emits AFTER withTx settles", async () => {
    const settled = { at: 0 };
    const db = exhaustedDb();
    await handleOnboardingFinalizeCas(request(), rollingBackDeps(db, settled)).catch(() => {
      /* the outer path's own outcome is not this test's subject */
    });

    const emit = outcomes.find((o) => o.code === EXHAUSTED);
    expect(emit, `${EXHAUSTED} never emitted`).toBeDefined();
    expect(settled.at, "withTx never settled").toBeGreaterThan(0);
    // The assertion the inline emit fails: it fires DURING fn(db), so its tick
    // precedes the one `withTx` records on the way out.
    expect(emit!.at).toBeGreaterThan(settled.at);
  });

  test("streaming handler emits AFTER withTx settles", async () => {
    // Driven separately on purpose: the streaming handler's post-commit work runs
    // inside the ReadableStream start() body, so a fix applied only to the
    // non-streaming finalizer leaves this path emitting from inside the lock
    // while the test above glows green.
    const settled = { at: 0 };
    const db = exhaustedDb();
    const res = await handleOnboardingFinalizeCasStream(
      request(),
      rollingBackDeps(db, settled),
    ).catch(() => null);
    // Drain the stream so start() runs to completion before asserting.
    if (res && res.body) await new Response(res.body).text();

    const emit = outcomes.find((o) => o.code === EXHAUSTED);
    expect(emit, `${EXHAUSTED} never emitted on the streaming path`).toBeDefined();
    expect(settled.at, "withTx never settled").toBeGreaterThan(0);
    expect(emit!.at).toBeGreaterThan(settled.at);
  });

  test("emits exactly once per exhausted row, on both paths", async () => {
    // A move from an inline emit to an accumulator is exactly where a double
    // emit appears — push in the loop, forget to remove the original.
    for (const drive of [handleOnboardingFinalizeCas, handleOnboardingFinalizeCasStream]) {
      outcomes.length = 0;
      clock = 0;
      const settled = { at: 0 };
      const res = await drive(request(), rollingBackDeps(exhaustedDb(), settled)).catch(() => null);
      if (res && res.body) await new Response(res.body).text();
      expect(outcomes.filter((o) => o.code === EXHAUSTED)).toHaveLength(1);
    }
  });
});
