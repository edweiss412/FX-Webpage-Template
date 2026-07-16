/**
 * tests/async/deferPostResponse.test.ts
 * Spec 2026-07-16-use-raw-bg-apply §4 test 9: the helper passes EXACTLY the
 * caller's task to Next's after() — same function reference, never invoked,
 * never awaited, void return. Failure mode caught: the helper awaiting or
 * invoking the task inline (reintroducing the blocking wait), or wrapping it
 * so after() receives a different callable. The same-reference pin is an
 * implementation detail required by the spec by design (plan-R4 A3).
 */
import { describe, expect, test, vi } from "vitest";

const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (fn: unknown) => afterMock(fn) }));

import { deferPostResponse } from "@/lib/async/deferPostResponse";

describe("deferPostResponse", () => {
  test("passes the exact task to after() without invoking or awaiting it", () => {
    const task = vi.fn(async () => {});
    const result = deferPostResponse(task) as unknown;
    expect(result).toBeUndefined();
    expect(afterMock).toHaveBeenCalledTimes(1);
    // Same reference — not a wrapper.
    expect(afterMock.mock.calls[0]![0]).toBe(task);
    expect(task).not.toHaveBeenCalled();
  });
});
