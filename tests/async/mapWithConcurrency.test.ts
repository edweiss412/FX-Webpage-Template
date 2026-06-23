import { describe, expect, test } from "vitest";
import { mapWithConcurrency } from "@/lib/async/mapWithConcurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("mapWithConcurrency", () => {
  test("preserves input order even when items finish out of order", async () => {
    const result = await mapWithConcurrency([10, 1, 5], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(result).toEqual(["0:10", "1:1", "2:5"]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (n) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return n;
      },
    );
    expect(maxActive).toBe(4);
  });

  test("runs all items in parallel when limit >= item count", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3], 16, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    });
    expect(maxActive).toBe(3);
  });

  test("returns [] for an empty input without spawning workers", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 4, async (n) => {
      calls += 1;
      return n;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  test("rejects with the first rejection and stops picking up new items", async () => {
    const started: number[] = [];
    const gate = deferred<void>();
    const promise = mapWithConcurrency([0, 1, 2, 3], 2, async (n) => {
      started.push(n);
      if (n === 0) {
        await gate.promise;
        throw new Error("boom");
      }
      await gate.promise;
      return n;
    });
    // Two workers start items 0 and 1. Release them; item 0 rejects.
    gate.resolve();
    await expect(promise).rejects.toThrow("boom");
    // Item 3 must never be picked up after the failure is observed.
    expect(started).not.toContain(3);
  });

  test("throws RangeError for a non-positive or non-integer limit", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toBeInstanceOf(RangeError);
    await expect(mapWithConcurrency([1], -1, async (n) => n)).rejects.toBeInstanceOf(RangeError);
    await expect(mapWithConcurrency([1], 1.5, async (n) => n)).rejects.toBeInstanceOf(RangeError);
  });

  test("fires onItemComplete once per item with a monotonic running done-count", async () => {
    const items = ["a", "b", "c", "d"];
    const seen: Array<{
      done: number;
      total: number;
      index: number;
      item: string;
      result: string;
    }> = [];
    const result = await mapWithConcurrency(
      items,
      2,
      async (s, i) => `${i}:${s}`,
      (info) => seen.push(info),
    );
    expect(result).toEqual(["0:a", "1:b", "2:c", "3:d"]);
    expect(seen).toHaveLength(items.length);
    // done is strictly 1..N regardless of completion order (derived from input length)
    expect(seen.map((s) => s.done)).toEqual(items.map((_, i) => i + 1));
    expect(seen.every((s) => s.total === items.length)).toBe(true);
    // every item + its result is reported exactly once
    expect(new Set(seen.map((s) => s.item))).toEqual(new Set(items));
    expect(new Set(seen.map((s) => s.result))).toEqual(new Set(["0:a", "1:b", "2:c", "3:d"]));
  });

  test("does not invoke onItemComplete for an empty input", async () => {
    let calls = 0;
    const result = await mapWithConcurrency(
      [],
      4,
      async (n) => n,
      () => {
        calls += 1;
      },
    );
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  test("a throwing onItemComplete neither rejects the map nor masks a real fn rejection", async () => {
    const ok = await mapWithConcurrency(
      [1, 2],
      2,
      async (n) => n,
      () => {
        throw new Error("cb boom");
      },
    );
    expect(ok).toEqual([1, 2]);
    await expect(
      mapWithConcurrency(
        [1, 2],
        2,
        async (n) => {
          if (n === 1) throw new Error("fn boom");
          return n;
        },
        () => {
          throw new Error("cb boom");
        },
      ),
    ).rejects.toThrow("fn boom");
  });

  test("omitting onItemComplete behaves exactly like the 3-arg form", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30]);
  });
});
