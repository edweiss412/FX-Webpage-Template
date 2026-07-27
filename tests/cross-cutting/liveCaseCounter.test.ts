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
function harness() {
  const registered: Array<{ name: string; fn: () => Promise<void> }> = [];
  const counter = makeLiveCaseCounter((name, fn) => registered.push({ name, fn }));
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
});
