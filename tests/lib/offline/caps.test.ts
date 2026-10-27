import { describe, expect, test } from "vitest";
import {
  ASSET_MAX_BYTES,
  MAX_SAVED_SHOWS,
  SHOW_PREFETCH_MAX_BYTES,
  STATIC_RETENTION_MS,
  admitAsset,
  evictionVictims,
  staticEvictions,
  type EvictionCandidate,
} from "@/lib/offline/caps";
import type { StaticIndex } from "@/lib/offline/store";

// Spec 4.8: one asset over 25 MB is skipped; asset prefetch for one show stops
// past 75 MB; at most 10 saved shows, and an 11th evicts the least recently
// opened one; a static file is deleted only when no saved copy references it and
// it was stored more than 14 days ago. Every expected value below is written
// from those numbers, in plain units, never read back from the module.

const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

describe("the numbers", () => {
  test("are the spec's 25 MB, 75 MB, 10 shows and 14 days", () => {
    expect(ASSET_MAX_BYTES).toBe(25 * MB);
    expect(SHOW_PREFETCH_MAX_BYTES).toBe(75 * MB);
    expect(MAX_SAVED_SHOWS).toBe(10);
    expect(STATIC_RETENTION_MS).toBe(14 * DAY);
  });
});

describe("admitAsset", () => {
  test.each([
    { name: "an empty asset into an empty show", sofar: 0, length: 0, expected: "admit" },
    { name: "an asset of exactly 25 MB", sofar: 0, length: 25 * MB, expected: "admit" },
    {
      name: "an asset one byte over 25 MB is skipped",
      sofar: 0,
      length: 25 * MB + 1,
      expected: "skip",
    },
    { name: "a far larger asset is skipped", sofar: 0, length: 400 * MB, expected: "skip" },
    {
      name: "an asset that brings the show to exactly 75 MB",
      sofar: 50 * MB,
      length: 25 * MB,
      expected: "admit",
    },
    {
      name: "an asset that would bring the show one byte past 75 MB stops the prefetch",
      sofar: 50 * MB + 1,
      length: 25 * MB,
      expected: "stop",
    },
    {
      name: "a show already at exactly 75 MB still takes an empty asset",
      sofar: 75 * MB,
      length: 0,
      expected: "admit",
    },
    {
      name: "a show at exactly 75 MB takes no more bytes",
      sofar: 75 * MB,
      length: 1,
      expected: "stop",
    },
    {
      name: "a show already past 75 MB takes nothing",
      sofar: 75 * MB + 1,
      length: 0,
      expected: "stop",
    },
    {
      name: "an oversized asset is skipped, not a stop, even when it would also pass 75 MB",
      sofar: 60 * MB,
      length: 30 * MB,
      expected: "skip",
    },
  ] as const)("$name", ({ sofar, length, expected }) => {
    expect(admitAsset(sofar, length)).toBe(expected);
  });

  test("an unknown length is admitted, whatever the running total (the bytes read are checked afterwards)", () => {
    expect(admitAsset(0, null)).toBe("admit");
    expect(admitAsset(75 * MB, null)).toBe("admit");
  });

  test("a show already past 75 MB takes nothing, even of unknown length", () => {
    expect(admitAsset(75 * MB + 1, null)).toBe("stop");
  });

  test("re-checking an unknown-length asset against the bytes it turned out to hold", () => {
    // First call: the header said nothing. Second call: the body is read and its size is known.
    expect(admitAsset(10 * MB, null)).toBe("admit");
    expect(admitAsset(10 * MB, 30 * MB)).toBe("skip");
    expect(admitAsset(10 * MB, 25 * MB)).toBe("admit");
    expect(admitAsset(60 * MB, 20 * MB)).toBe("stop");
  });

  test("a length that is not a usable number is unknown, and a running total that is not usable stops the prefetch", () => {
    for (const length of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(admitAsset(0, length)).toBe("admit");
    }
    for (const sofar of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(admitAsset(sofar, 1)).toBe("stop");
      expect(admitAsset(sofar, null)).toBe("stop");
    }
  });

  test("a prefetch loop skips the oversized asset, keeps going, and stops at the one that would pass 75 MB", () => {
    // Sizes in MB, in list order. 20 + 25 + 25 = 70; the 6 would make 76, so it stops the show.
    const sizes = [20, 30, 25, 25, 6, 1].map((n) => n * MB);
    const taken: number[] = [];
    let total = 0;
    for (const size of sizes) {
      const verdict = admitAsset(total, size);
      if (verdict === "stop") break;
      if (verdict === "admit") {
        taken.push(size);
        total += size;
      }
    }
    expect(taken).toEqual([20, 25, 25].map((n) => n * MB));
    expect(total).toBe(70 * MB);
  });
});

describe("evictionVictims", () => {
  const SHOW = (n: number) => `show-${String(n).padStart(2, "0")}`;

  /** `n` copies, show-00 to show-(n-1). Opened order is the REVERSE of saved order, so the oldest-saved copy is the most recently opened. */
  function copies(n: number): EvictionCandidate[] {
    return Array.from({ length: n }, (_, i) => ({
      showId: SHOW(i),
      ordinal: i + 1,
      lastOpenedAt: 1_000_000 - i * 1000,
    }));
  }

  test("ten shows and an eleventh evict the least recently opened one, not the oldest saved", () => {
    const held = copies(10);
    // show-00 was saved first and opened last; show-09 was saved last and opened longest ago.
    const victims = evictionVictims(held, "show-new");
    expect(victims.map((v) => v.showId)).toEqual([SHOW(9)]);
    expect(victims.map((v) => v.showId)).not.toContain(SHOW(0));
  });

  test("returns the copies themselves, so the caller can read what they list", () => {
    const held = copies(10);
    const [victim] = evictionVictims(held, "show-new");
    expect(victim).toBe(held[9]);
  });

  test("replacing a show's own copy never grows the set: ten copies including the incoming show evict nothing", () => {
    for (const incoming of [SHOW(0), SHOW(5), SHOW(9)]) {
      expect(evictionVictims(copies(10), incoming)).toEqual([]);
    }
  });

  test.each([0, 1, 5, 9])("%i copies and a new show evict nothing", (n) => {
    expect(evictionVictims(copies(n), "show-new")).toEqual([]);
  });

  test("evicts as many as it takes to leave room: twelve shows and a new one evict the three least recently opened, oldest first", () => {
    const victims = evictionVictims(copies(12), "show-new");
    expect(victims.map((v) => v.showId)).toEqual([SHOW(11), SHOW(10), SHOW(9)]);
  });

  test("the incoming show's own copy is never a victim, even when it is the least recently opened", () => {
    // Eleven copies already held, show-10 the least recently opened and also the incoming show:
    // it is the one being replaced, so the victim is the next least recently opened.
    const held = copies(11);
    expect(held[10]?.lastOpenedAt).toBeLessThan(held[9]?.lastOpenedAt ?? 0);
    expect(evictionVictims(held, SHOW(10)).map((v) => v.showId)).toEqual([SHOW(9)]);
  });

  test("a copy that has just been committed (the incoming show is already in the list) counts toward the ten", () => {
    // The same answer whether the caller asks before or after the commit lands.
    const before = copies(10);
    const after = [...before, { showId: "show-new", ordinal: 99, lastOpenedAt: 0 }];
    expect(evictionVictims(after, "show-new").map((v) => v.showId)).toEqual(
      evictionVictims(before, "show-new").map((v) => v.showId),
    );
    expect(evictionVictims(after, "show-new").map((v) => v.showId)).toEqual([SHOW(9)]);
  });

  test("ties in lastOpenedAt fall to the older save, then the show id, so the answer is the same on every run", () => {
    const held: EvictionCandidate[] = [
      { showId: "b", ordinal: 2, lastOpenedAt: 100 },
      { showId: "a", ordinal: 2, lastOpenedAt: 100 },
      { showId: "c", ordinal: 1, lastOpenedAt: 100 },
      ...Array.from({ length: 8 }, (_, i) => ({
        showId: `later-${i}`,
        ordinal: 10 + i,
        lastOpenedAt: 500,
      })),
    ];
    expect(evictionVictims(held, "show-new").map((v) => v.showId)).toEqual(["c", "a"]);
  });

  test("a copy with no usable last-opened time is the first to go", () => {
    const held = copies(10);
    held[3] = { showId: SHOW(3), ordinal: 4, lastOpenedAt: Number.NaN };
    expect(evictionVictims(held, "show-new").map((v) => v.showId)).toEqual([SHOW(3)]);
  });

  test("does not reorder or change the list it is given", () => {
    const held = copies(12);
    const snapshot = structuredClone(held);
    evictionVictims(held, "show-new");
    expect(held).toEqual(snapshot);
  });

  test("an empty list evicts nothing", () => {
    expect(evictionVictims([], "show-new")).toEqual([]);
  });
});

describe("staticEvictions", () => {
  const NOW = 1_800_000_000_000;
  const index = (entries: Record<string, number>): StaticIndex => new Map(Object.entries(entries));

  test("an unreferenced file stored 15 days ago is evicted; one stored 13 days ago, and a referenced one stored 15 days ago, are kept", () => {
    const evicted = staticEvictions(
      index({
        "/_next/static/chunks/old-unreferenced.js": NOW - 15 * DAY,
        "/_next/static/chunks/recent-unreferenced.js": NOW - 13 * DAY,
        "/_next/static/chunks/old-referenced.js": NOW - 15 * DAY,
      }),
      new Set(["/_next/static/chunks/old-referenced.js"]),
      NOW,
    );
    expect(evicted).toEqual(["/_next/static/chunks/old-unreferenced.js"]);
  });

  test("exactly 14 days is not yet more than 14 days; one millisecond later it is", () => {
    const evicted = staticEvictions(
      index({
        "/fonts/at-limit.woff2": NOW - 14 * DAY,
        "/fonts/past-limit.woff2": NOW - 14 * DAY - 1,
      }),
      [],
      NOW,
    );
    expect(evicted).toEqual(["/fonts/past-limit.woff2"]);
  });

  test("the referenced set may be any iterable of URLs, and URLs it names that the index lacks change nothing", () => {
    const stale = index({
      "/a.js": NOW - 30 * DAY,
      "/b.js": NOW - 30 * DAY,
      "/c.js": NOW - 30 * DAY,
    });
    expect(staticEvictions(stale, ["/a.js", "/not-in-the-index.js"], NOW)).toEqual([
      "/b.js",
      "/c.js",
    ]);
    expect(staticEvictions(stale, new Set(["/b.js"]), NOW)).toEqual(["/a.js", "/c.js"]);
    expect(
      staticEvictions(
        stale,
        (function* () {
          yield "/c.js";
        })(),
        NOW,
      ),
    ).toEqual(["/a.js", "/b.js"]);
    expect(staticEvictions(stale, ["/a.js", "/b.js", "/c.js"], NOW)).toEqual([]);
  });

  test("answers in the index's own order", () => {
    const stale = index({
      "/z.js": NOW - 20 * DAY,
      "/a.js": NOW - 30 * DAY,
      "/m.js": NOW - 40 * DAY,
    });
    expect(staticEvictions(stale, [], NOW)).toEqual(["/z.js", "/a.js", "/m.js"]);
  });

  test("a stored-at time in the future (a clock that moved back) is not old", () => {
    expect(staticEvictions(index({ "/future.js": NOW + 30 * DAY }), [], NOW)).toEqual([]);
  });

  test("an unreferenced entry with no usable stored-at time is evicted, a referenced one is kept", () => {
    const broken = index({ "/nan.js": Number.NaN, "/kept-nan.js": Number.NaN });
    expect(staticEvictions(broken, ["/kept-nan.js"], NOW)).toEqual(["/nan.js"]);
  });

  test("with no usable clock nothing is evicted", () => {
    const stale = index({ "/a.js": 0 });
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(staticEvictions(stale, [], now)).toEqual([]);
    }
  });

  test("an empty index evicts nothing, and the index is not changed", () => {
    expect(staticEvictions(new Map(), [], NOW)).toEqual([]);
    const held = index({ "/a.js": NOW - 30 * DAY });
    staticEvictions(held, [], NOW);
    expect([...held]).toEqual([["/a.js", NOW - 30 * DAY]]);
  });
});
