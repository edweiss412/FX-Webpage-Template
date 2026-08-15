/**
 * tests/cross-cutting/liveCaseCounter.test.ts
 *
 * Behavioural cover for the live-case counter. An adversarial round showed the
 * inline version could have its `fn()` call DELETED with every guard still
 * green: each case incremented the counter while running zero queries and zero
 * assertions. A source scan cannot catch that; running the wrapper can.
 */
import { describe, expect, it } from "vitest";

import { makeLiveCaseCounter } from "./_liveCaseCounter";

/** Captures what the wrapper registers, standing in for vitest's `test`. */
function harness(observe?: () => number) {
  const registered: Array<{ name: string; fn: () => Promise<void> }> = [];
  const counter = makeLiveCaseCounter((name, fn) => registered.push({ name, fn }), observe);
  return { registered, ...counter };
}

describe("makeLiveCaseCounter", () => {
  it("registers under the given name and DELEGATES to the body", async () => {
    const h = harness();
    let ran = 0;
    h.liveCase("a case", () => {
      ran += 1;
    });
    expect(h.registered.map((r) => r.name)).toEqual(["a case"]);
    // The mutation that motivated this file: dropping `fn()` from the wrapper.
    expect(ran, "body must not have run before the case executes").toBe(0);
    await h.registered[0]!.fn();
    expect(ran, "the wrapper must call the body").toBe(1);
  });

  it("counts only AFTER the body completes, and awaits an async body", async () => {
    const h = harness();
    let resolveBody: (() => void) | undefined;
    h.liveCase("async case", () => new Promise<void>((r) => (resolveBody = r)));
    const running = h.registered[0]!.fn();

    // Mid-flight: the body has not settled, so it must not be counted. The
    // original wrapper took `() => void`, discarded the promise, and counted
    // immediately — vitest never waited for the one async case.
    await Promise.resolve();
    expect(h.count(), "must not count an unsettled body").toBe(0);

    resolveBody!();
    await running;
    expect(h.count()).toBe(1);
  });

  it("does not count a body that threw", async () => {
    const h = harness();
    h.liveCase("failing case", () => {
      throw new Error("assertion failed");
    });
    await expect(h.registered[0]!.fn()).rejects.toThrow(/assertion failed/);
    expect(h.count(), "a failed case proves nothing and must not count").toBe(0);
  });

  it("counts each registered case independently", async () => {
    const h = harness();
    h.liveCase("one", () => {});
    h.liveCase("two", () => {});
    await h.registered[0]!.fn();
    expect(h.count()).toBe(1);
    await h.registered[1]!.fn();
    expect(h.count()).toBe(2);
  });

  it("rejects a case that issued NO query, naming it", async () => {
    // Per-case attribution. An aggregate total does not attribute: six queries
    // in one case with five empty ones satisfied the old check, so the count is
    // now snapshotted around each case.
    let queries = 0;
    const h = harness(() => queries);
    h.liveCase("queries the database", () => {
      queries += 1;
    });
    h.liveCase("touches nothing", () => {});

    await h.registered[0]!.fn();
    expect(h.count()).toBe(1);
    await expect(h.registered[1]!.fn()).rejects.toThrow(
      /"touches nothing" issued NO database query/,
    );
    expect(h.count(), "a case that queried nothing must not count").toBe(1);
  });

  it("enforces a DECLARED per-case query floor, naming the case", async () => {
    // A multi-query case (the all-nine firing smoke: one census fetch + one
    // smoke per canonical job) declares its floor; issuing fewer queries than
    // declared is the same defect as issuing none — some legs silently did not
    // run. Without this, a 10-query case that ran only its first leg passed.
    let queries = 0;
    const h = harness(() => queries);
    h.liveCase(
      "nine smokes",
      () => {
        queries += 3;
      },
      { queries: 10 },
    );
    await expect(h.registered[0]!.fn()).rejects.toThrow(
      /"nine smokes" issued 3 database quer(y|ies) but declares 10/,
    );
    expect(h.count()).toBe(0);
  });

  it("exposes the declared-floor SUM so the aggregate backstop has zero slack", async () => {
    // The vacuity backstop compares total queries to this sum. Against
    // liveCaseCount() alone, one multi-query case donated slack that hid an
    // inert case once per-case attribution was deleted (the mutant the
    // pgCronCiVacuity aggregate case plants).
    const h = harness();
    h.liveCase("plain", () => {});
    h.liveCase("multi", () => {}, { queries: 10 });
    h.liveCase("also plain", () => {});
    expect(h.expectedQueries(), "defaults 1 per case; declared floors add").toBe(12);
  });

  it("does not attribute another case's queries to an empty one", async () => {
    // The exact bypass: one case issues several queries, the next issues none.
    let queries = 0;
    const h = harness(() => queries);
    h.liveCase("busy", () => {
      queries += 3;
    });
    h.liveCase("idle", () => {});
    await h.registered[0]!.fn();
    await expect(h.registered[1]!.fn()).rejects.toThrow(/issued NO database query/);
  });
});
