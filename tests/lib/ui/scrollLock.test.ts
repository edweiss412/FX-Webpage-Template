// @vitest-environment jsdom
/**
 * lib/ui/scrollLock.ts — every release order of three holders restores the
 * page exactly once, after the last release.
 */
import { afterEach, describe, expect, it } from "vitest";
import { acquireScrollLock } from "@/lib/ui/scrollLock";

const ORIGINAL = "scroll";

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("acquireScrollLock", () => {
  const orders = permutations([0, 1, 2]);

  it("enumerates all six release orders", () => {
    // PREMISE: the loop below is only as strong as the orders it walks.
    expect(new Set(orders.map((o) => o.join(""))).size).toBe(6);
  });

  for (const order of orders) {
    it(`release order ${order.join(",")} keeps the lock until the last release, then restores the original`, () => {
      document.body.style.overflow = ORIGINAL;
      const releases = [acquireScrollLock(), acquireScrollLock(), acquireScrollLock()];
      expect(document.body.style.overflow).toBe("hidden");

      order.forEach((index, step) => {
        releases[index]!();
        const last = step === order.length - 1;
        expect(document.body.style.overflow).toBe(last ? ORIGINAL : "hidden");
      });
    });
  }

  it("ignores a second release from the same holder", () => {
    document.body.style.overflow = ORIGINAL;
    const first = acquireScrollLock();
    const second = acquireScrollLock();
    first();
    first();
    // The double release must not count as the second holder's release.
    expect(document.body.style.overflow).toBe("hidden");
    second();
    expect(document.body.style.overflow).toBe(ORIGINAL);
  });

  it("saves the value present when the first holder arrives, not an older one", () => {
    document.body.style.overflow = ORIGINAL;
    acquireScrollLock()();
    document.body.style.overflow = "auto";
    const release = acquireScrollLock();
    release();
    expect(document.body.style.overflow).toBe("auto");
  });
});
