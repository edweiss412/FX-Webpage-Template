import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  BAR_STATES,
  OLD_COPY_MS,
  deriveBarView,
  isSheetUnavailable,
  type BarInputs,
  type BarMode,
  type BarState,
  type BarView,
} from "@/lib/offline/barState";

const TZ = "America/New_York";
const LA = "America/Los_Angeles";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SIX_HOURS = 6 * HOUR;

/**
 * One fixed clock. 2025-10-26 15:00 UTC is Sunday 11:00 AM in New York (EDT until
 * Nov 2), so every expected {time} below is a literal read off that offset.
 */
const NOW_MS = Date.parse("2025-10-26T15:00:00.000Z");

function savedAgo(ageMs: number): string {
  return new Date(NOW_MS - ageMs).toISOString();
}

function inputs(over: Partial<BarInputs> = {}): BarInputs {
  return {
    mode: "live",
    online: true,
    savedAt: savedAgo(30 * MINUTE),
    nowMs: NOW_MS,
    sheetUnavailable: false,
    updating: false,
    justUpdated: false,
    ...over,
  };
}

/** The view without its parts: the copy as one string, which the cases below pin exactly. */
const view = (
  over: Partial<BarInputs> = {},
  timeZone: string | undefined = TZ,
): Omit<BarView, "parts"> => {
  const { parts: _parts, ...copy } = deriveBarView(inputs(over), timeZone);
  return copy;
};

// Tone tokens and copy are literals here, never imported from the module under test.
const INFO = "bg-info-bg";
const STALE = "bg-stale-tint";
const WARNING = "bg-warning-bg text-warning-text";
const POSITIVE = "bg-surface text-status-positive-text";

const SHEET_LEAD = "Doug's sheet for this show isn't available in Google Drive anymore.";

/** Every lead the saved states can carry. The mode picks the lead; `online` only matters on a live page. */
const SAVED_LEADS: ReadonlyArray<{
  label: string;
  over: Partial<BarInputs>;
  lead: string;
}> = [
  {
    label: "offline, device offline",
    over: { mode: "offline", online: false },
    lead: "No signal.",
  },
  { label: "offline, device online", over: { mode: "offline", online: true }, lead: "No signal." },
  { label: "slow, device online", over: { mode: "slow", online: true }, lead: "Slow connection." },
  {
    label: "slow, device offline",
    over: { mode: "slow", online: false },
    lead: "Slow connection.",
  },
  {
    label: "server-error, device online",
    over: { mode: "server-error", online: true },
    lead: "Couldn't load the latest version.",
  },
  {
    label: "server-error, device offline",
    over: { mode: "server-error", online: false },
    lead: "Couldn't load the latest version.",
  },
  { label: "live page, device offline", over: { mode: "live", online: false }, lead: "No signal." },
];

describe("OLD_COPY_MS", () => {
  test("is six hours", () => {
    expect(OLD_COPY_MS).toBe(21_600_000);
  });
});

describe("deriveBarView: exact copy, one case per state per lead", () => {
  test("hidden: a live, online page with nothing to say renders nothing", () => {
    expect(view()).toEqual({ state: "hidden", tone: null, icon: null, lead: null, body: "" });
  });

  test.each(SAVED_LEADS)("saved-fresh, $label", ({ over, lead }) => {
    expect(view(over)).toEqual({
      state: "saved-fresh",
      tone: INFO,
      icon: "signal-off",
      lead,
      body: "Showing your saved copy from 10:30 AM (30 min ago).",
    });
  });

  test.each(SAVED_LEADS)("saved-old, $label", ({ over, lead }) => {
    expect(view({ ...over, savedAt: savedAgo(7 * HOUR) })).toEqual({
      state: "saved-old",
      tone: STALE,
      icon: "clock",
      lead,
      body: "Your saved copy is from 4:00 AM (7 hr ago). Things may have changed since then.",
    });
  });

  test("ended", () => {
    expect(view({ mode: "ended" })).toEqual({
      state: "ended",
      tone: STALE,
      icon: "clock",
      lead: "This show has ended.",
      body: "You're seeing the last version, from 10:30 AM.",
    });
  });

  test.each([
    { label: "online", online: true },
    { label: "offline", online: false },
  ])("sheet-gone on a live page, $label", ({ online }) => {
    expect(view({ mode: "live", online, sheetUnavailable: true })).toEqual({
      state: "sheet-gone",
      tone: WARNING,
      icon: "alert",
      lead: SHEET_LEAD,
      body: "You're seeing the last version we have. Check with Doug before relying on it.",
    });
  });

  test.each(["offline", "slow", "server-error"] as const)("sheet-gone-saved, mode %s", (mode) => {
    expect(view({ mode, online: false, sheetUnavailable: true })).toEqual({
      state: "sheet-gone-saved",
      tone: WARNING,
      icon: "alert",
      lead: SHEET_LEAD,
      body: "This is the last version we have, from 10:30 AM. Check with Doug before relying on it.",
    });
  });

  test("updating", () => {
    expect(view({ updating: true })).toEqual({
      state: "updating",
      tone: INFO,
      icon: "sync",
      lead: "Signal's back.",
      body: "Loading the latest version.",
    });
  });

  test("updated", () => {
    expect(view({ justUpdated: true })).toEqual({
      state: "updated",
      tone: POSITIVE,
      icon: "check",
      lead: null,
      body: "Updated. You're on the latest version.",
    });
  });

  test("a live page with sheetUnavailable and online false is sheet-gone, not a saved state", () => {
    const result = view({ mode: "live", online: false, sheetUnavailable: true });
    expect(result.state).toBe("sheet-gone");
    expect(result.body).not.toContain("saved");
  });

  test("mode offline with sheetUnavailable is sheet-gone-saved, not sheet-gone", () => {
    expect(view({ mode: "offline", online: false, sheetUnavailable: true }).state).toBe(
      "sheet-gone-saved",
    );
  });
});

describe("deriveBarView: age, clock and zone", () => {
  test("age exactly OLD_COPY_MS is saved-old; one millisecond under is saved-fresh", () => {
    premiseHolds(
      "the two fixtures sit either side of the six-hour line",
      NOW_MS - Date.parse(savedAgo(SIX_HOURS - 1)) < SIX_HOURS &&
        NOW_MS - Date.parse(savedAgo(SIX_HOURS)) === SIX_HOURS,
    );
    expect(view({ mode: "offline", online: false, savedAt: savedAgo(SIX_HOURS) })).toEqual({
      state: "saved-old",
      tone: STALE,
      icon: "clock",
      lead: "No signal.",
      body: "Your saved copy is from 5:00 AM (6 hr ago). Things may have changed since then.",
    });
    expect(view({ mode: "offline", online: false, savedAt: savedAgo(SIX_HOURS - 1) })).toEqual({
      state: "saved-fresh",
      tone: INFO,
      icon: "signal-off",
      lead: "No signal.",
      body: "Showing your saved copy from 5:00 AM (5 hr ago).",
    });
  });

  test("a saved time in the future reads just now and counts as fresh", () => {
    expect(view({ mode: "offline", online: false, savedAt: savedAgo(-5 * MINUTE) })).toEqual({
      state: "saved-fresh",
      tone: INFO,
      icon: "signal-off",
      lead: "No signal.",
      body: "Showing your saved copy from 11:05 AM (just now).",
    });
  });

  test("a save from an earlier day carries its weekday and date", () => {
    expect(view({ mode: "slow", savedAt: savedAgo(30 * HOUR) }).body).toBe(
      "Your saved copy is from Sat Oct 25, 5:00 AM (30 hr ago). Things may have changed since then.",
    );
  });

  test("the time zone argument decides {time}", () => {
    const over = { mode: "offline", online: false } as const;
    expect(view(over, TZ).body).toBe("Showing your saved copy from 10:30 AM (30 min ago).");
    expect(view(over, LA).body).toBe("Showing your saved copy from 7:30 AM (30 min ago).");
  });

  test("sheet-gone, updating and updated read no time, so a bad savedAt changes nothing for them", () => {
    for (const over of [
      { sheetUnavailable: true },
      { updating: true },
      { justUpdated: true },
    ] as const) {
      expect(view({ ...over, savedAt: null })).toEqual(view({ ...over }));
    }
  });
});

describe("deriveBarView: an unknown saved time drops the time and age (spec guard row)", () => {
  /** Missing, empty, not a date, and a usable date read against a clock that is not a time. */
  const UNKNOWN: ReadonlyArray<{ label: string; over: Partial<BarInputs> }> = [
    { label: "savedAt null", over: { savedAt: null } },
    { label: "savedAt empty", over: { savedAt: "" } },
    { label: "savedAt not a date", over: { savedAt: "not a date" } },
    { label: "nowMs NaN", over: { nowMs: Number.NaN } },
  ];

  describe.each(UNKNOWN)("$label", ({ over }) => {
    test.each(SAVED_LEADS)("saved state keeps its lead and reads as an old copy, $label", (row) => {
      expect(view({ ...row.over, ...over })).toEqual({
        state: "saved-old",
        tone: STALE,
        icon: "clock",
        lead: row.lead,
        body: "Showing your saved copy.",
      });
    });

    test("ended", () => {
      expect(view({ mode: "ended", ...over })).toEqual({
        state: "ended",
        tone: STALE,
        icon: "clock",
        lead: "This show has ended.",
        body: "You're seeing the last version.",
      });
    });

    test("sheet-gone-saved", () => {
      expect(view({ mode: "offline", online: false, sheetUnavailable: true, ...over })).toEqual({
        state: "sheet-gone-saved",
        tone: WARNING,
        icon: "alert",
        lead: SHEET_LEAD,
        body: "This is the last version we have. Check with Doug before relying on it.",
      });
    });
  });
});

describe("deriveBarView: the body's parts", () => {
  /** One input set per state, every saved lead included, plus the unknown-time forms. */
  const EVERY_VIEW: ReadonlyArray<{ label: string; over: Partial<BarInputs> }> = [
    { label: "hidden", over: {} },
    ...SAVED_LEADS.map((row) => ({ label: `saved-fresh, ${row.label}`, over: row.over })),
    ...SAVED_LEADS.map((row) => ({
      label: `saved-old, ${row.label}`,
      over: { ...row.over, savedAt: savedAgo(7 * HOUR) },
    })),
    { label: "saved-old, no time", over: { mode: "offline", savedAt: null } },
    { label: "ended", over: { mode: "ended" } },
    { label: "ended, no time", over: { mode: "ended", savedAt: null } },
    { label: "sheet-gone", over: { sheetUnavailable: true } },
    { label: "sheet-gone-saved", over: { mode: "slow", sheetUnavailable: true } },
    {
      label: "sheet-gone-saved, no time",
      over: { mode: "slow", sheetUnavailable: true, savedAt: null },
    },
    { label: "updating", over: { updating: true } },
    { label: "updated", over: { justUpdated: true } },
  ];

  test("the cases reach every state", () => {
    const reached = new Set(EVERY_VIEW.map(({ over }) => deriveBarView(inputs(over), TZ).state));
    expect([...reached].sort()).toEqual([...BAR_STATES].sort());
  });

  test.each(EVERY_VIEW)("$label: the parts read, in order, as the body", ({ over }) => {
    const result = deriveBarView(inputs(over), TZ);
    expect(result.parts.map((part) => part.text).join("")).toBe(result.body);
    // No empty run: an empty span would be a node with nothing to read.
    for (const part of result.parts) expect(part.text.length).toBeGreaterThan(0);
  });

  test("saved-fresh: the time and the relative age are their own parts", () => {
    expect(deriveBarView(inputs({ mode: "offline", online: false }), TZ).parts).toEqual([
      { kind: "text", text: "Showing your saved copy from " },
      { kind: "time", text: "10:30 AM" },
      { kind: "age", text: " (30 min ago)" },
      { kind: "text", text: "." },
    ]);
  });

  test("saved-old: the time and the relative age are their own parts", () => {
    expect(deriveBarView(inputs({ mode: "slow", savedAt: savedAgo(7 * HOUR) }), TZ).parts).toEqual([
      { kind: "text", text: "Your saved copy is from " },
      { kind: "time", text: "4:00 AM" },
      { kind: "age", text: " (7 hr ago)" },
      { kind: "text", text: ". Things may have changed since then." },
    ]);
  });

  test("ended and sheet-gone-saved carry their time as a part, and no age", () => {
    expect(deriveBarView(inputs({ mode: "ended" }), TZ).parts).toEqual([
      { kind: "text", text: "You're seeing the last version, from " },
      { kind: "time", text: "10:30 AM" },
      { kind: "text", text: "." },
    ]);
    expect(deriveBarView(inputs({ mode: "slow", sheetUnavailable: true }), TZ).parts).toEqual([
      { kind: "text", text: "This is the last version we have, from " },
      { kind: "time", text: "10:30 AM" },
      { kind: "text", text: ". Check with Doug before relying on it." },
    ]);
  });

  test("only the two saved states carry a relative age", () => {
    const withAge = EVERY_VIEW.map(({ over }) => deriveBarView(inputs(over), TZ))
      .filter((result) => result.parts.some((part) => part.kind === "age"))
      .map((result) => result.state);
    premise("the saved cases carry an age", withAge.length, 0);
    expect([...new Set(withAge)].sort()).toEqual(["saved-fresh", "saved-old"]);
  });
});

describe("isSheetUnavailable", () => {
  test("is true for exactly the status the sync writes", () => {
    expect(isSheetUnavailable("sheet_unavailable")).toBe(true);
  });

  test.each([
    "ok",
    "pending",
    "pending_review",
    "drive_error",
    "parse_error",
    "",
    "SHEET_UNAVAILABLE",
    " sheet_unavailable",
    "sheet_unavailable ",
    "sync_sheet_unavailable",
    "sheet_unavailable_soon",
  ])("is false for %j", (status) => {
    expect(isSheetUnavailable(status)).toBe(false);
  });

  test("is false for null and undefined", () => {
    expect(isSheetUnavailable(null)).toBe(false);
    expect(isSheetUnavailable(undefined)).toBe(false);
  });
});

/**
 * Precedence, derived. The states come from the module's own list, each state's
 * "when" condition below is written from spec 4.7.2's table (independently of the
 * module), and every pair of states is classified from that, so a ninth state with
 * no condition, no precedence row or no exclusion reason fails here instead of
 * silently falling outside the comparison.
 */
describe("deriveBarView: precedence, every pair of states", () => {
  type AgeClass = "fresh" | "old" | "unknown";
  type Case = {
    mode: BarMode;
    online: boolean;
    age: AgeClass;
    sheetUnavailable: boolean;
    updating: boolean;
    justUpdated: boolean;
  };

  const MODES: readonly BarMode[] = ["live", "offline", "slow", "server-error", "ended"];
  const FLAGS = [false, true] as const;
  const AGES: readonly AgeClass[] = ["fresh", "old", "unknown"];
  const SAVED_MODES: readonly BarMode[] = ["offline", "slow", "server-error"];

  /** Each age class is a savedAt the test builds itself: well under the line, exactly on it, and missing. */
  const SAVED_AT: Record<AgeClass, string | null> = {
    fresh: savedAgo(HOUR),
    old: savedAgo(SIX_HOURS),
    unknown: null,
  };

  const SPACE: Case[] = MODES.flatMap((mode) =>
    FLAGS.flatMap((online) =>
      AGES.flatMap((age) =>
        FLAGS.flatMap((sheetUnavailable) =>
          FLAGS.flatMap((updating) =>
            FLAGS.map((justUpdated) => ({
              mode,
              online,
              age,
              sheetUnavailable,
              updating,
              justUpdated,
            })),
          ),
        ),
      ),
    ),
  );

  function inputsOf(c: Case): BarInputs {
    return {
      mode: c.mode,
      online: c.online,
      savedAt: SAVED_AT[c.age],
      nowMs: NOW_MS,
      sheetUnavailable: c.sheetUnavailable,
      updating: c.updating,
      justUpdated: c.justUpdated,
    };
  }

  const describeCase = (c: Case) => JSON.stringify(c);

  const isSavedContext = (c: Case) =>
    SAVED_MODES.includes(c.mode) || (c.mode === "live" && !c.online);

  /** The "When" column of spec 4.7.2, one predicate per state, before precedence is applied. */
  const APPLIES: Record<BarState, (c: Case) => boolean> = {
    hidden: (c) => c.mode === "live" && c.online && !c.sheetUnavailable && !c.justUpdated,
    "saved-fresh": (c) => isSavedContext(c) && c.age === "fresh",
    // An unknown age reads as an old copy (spec guard row).
    "saved-old": (c) => isSavedContext(c) && c.age !== "fresh",
    ended: (c) => c.mode === "ended",
    "sheet-gone": (c) => c.sheetUnavailable && c.mode === "live",
    "sheet-gone-saved": (c) => c.sheetUnavailable && SAVED_MODES.includes(c.mode),
    updating: (c) => c.updating,
    updated: (c) => c.justUpdated,
  };

  /** Spec 4.7.2, highest first. saved-old and saved-fresh share a rank and never both apply. */
  const PRECEDENCE: readonly BarState[] = [
    "ended",
    "updating",
    "sheet-gone-saved",
    "sheet-gone",
    "saved-old",
    "saved-fresh",
    "updated",
    "hidden",
  ];

  /** Pairs no input can satisfy, each with the reason, declared rather than skipped. */
  const EXCLUSIVE: ReadonlyArray<readonly [BarState, BarState, string]> = [
    [
      "hidden",
      "saved-fresh",
      "hidden needs a live, online page; a saved state needs another mode or online false",
    ],
    [
      "hidden",
      "saved-old",
      "hidden needs a live, online page; a saved state needs another mode or online false",
    ],
    ["hidden", "ended", "hidden needs mode live; ended is mode ended"],
    ["hidden", "sheet-gone", "hidden needs sheetUnavailable false"],
    ["hidden", "sheet-gone-saved", "hidden needs sheetUnavailable false"],
    ["hidden", "updated", "hidden needs justUpdated false; updated is justUpdated"],
    [
      "saved-fresh",
      "saved-old",
      "one age decides: fresh is under six hours, old is six hours or more or unknown",
    ],
    [
      "saved-fresh",
      "ended",
      "a saved state needs mode offline, slow, server-error or live; ended is mode ended",
    ],
    [
      "saved-old",
      "ended",
      "a saved state needs mode offline, slow, server-error or live; ended is mode ended",
    ],
    ["ended", "sheet-gone", "ended is mode ended; sheet-gone is mode live"],
    [
      "ended",
      "sheet-gone-saved",
      "ended is mode ended; sheet-gone-saved is mode offline, slow or server-error",
    ],
    [
      "sheet-gone",
      "sheet-gone-saved",
      "sheet-gone is mode live; sheet-gone-saved is mode offline, slow or server-error",
    ],
  ];

  const pairKey = (a: BarState, b: BarState) => [a, b].sort().join(" | ");

  const ALL_PAIRS: Array<readonly [BarState, BarState]> = BAR_STATES.flatMap((a, i) =>
    BAR_STATES.slice(i + 1).map((b) => [a, b] as const),
  );

  const exclusiveKeys = new Set(EXCLUSIVE.map(([a, b]) => pairKey(a, b)));

  test("the module's state list, the precedence rows and the conditions name the same states", () => {
    expect([...PRECEDENCE].sort()).toEqual([...BAR_STATES].sort());
    expect(Object.keys(APPLIES).sort()).toEqual([...BAR_STATES].sort());
    expect(new Set(BAR_STATES).size).toBe(BAR_STATES.length);
  });

  test("the declared exclusions name distinct, real states and none is listed twice", () => {
    for (const [a, b, reason] of EXCLUSIVE) {
      expect(a).not.toBe(b);
      expect(BAR_STATES).toContain(a);
      expect(BAR_STATES).toContain(b);
      expect(reason.length).toBeGreaterThan(0);
    }
    expect(exclusiveKeys.size).toBe(EXCLUSIVE.length);
  });

  test("the input space is the full cross product and each age class lands where it claims", () => {
    premiseHolds(
      "5 modes x 2 online x 3 ages x 2 sheet x 2 updating x 2 justUpdated = 240",
      SPACE.length === 240,
    );
    premiseHolds(
      "fresh is under six hours old, old is exactly six hours old, unknown has no time",
      NOW_MS - Date.parse(SAVED_AT.fresh as string) < SIX_HOURS &&
        NOW_MS - Date.parse(SAVED_AT.old as string) === SIX_HOURS &&
        SAVED_AT.unknown === null,
    );
  });

  test("the pairs reconcile: constructible plus exclusive is all 28", () => {
    expect(ALL_PAIRS).toHaveLength(28);
    const constructible = ALL_PAIRS.filter(
      ([a, b]) =>
        !exclusiveKeys.has(pairKey(a, b)) && SPACE.some((c) => APPLIES[a](c) && APPLIES[b](c)),
    );
    // A generator that builds nothing finds nothing; this reds before the count below can pass by accident.
    premise(
      "constructible pairs the generator found",
      constructible.length,
      ALL_PAIRS.length - EXCLUSIVE.length - 1,
    );
    expect(constructible.length + EXCLUSIVE.length).toBe(28);
  });

  test.each(ALL_PAIRS.map(([a, b]) => ({ a, b })))("$a / $b", ({ a, b }) => {
    const both = SPACE.filter((c) => APPLIES[a](c) && APPLIES[b](c));

    if (exclusiveKeys.has(pairKey(a, b))) {
      // "No input satisfies both" means something only if each side is satisfiable alone.
      premise(`inputs where ${a} applies`, SPACE.filter(APPLIES[a]).length, 0);
      premise(`inputs where ${b} applies`, SPACE.filter(APPLIES[b]).length, 0);
      expect(both.map(describeCase)).toEqual([]);
      return;
    }

    const winner = PRECEDENCE.indexOf(a) < PRECEDENCE.indexOf(b) ? a : b;
    const outranking = PRECEDENCE.slice(0, PRECEDENCE.indexOf(winner));
    // Only inputs where nothing outranks the pair's winner can show the pair's own order.
    const decisive = both.filter((c) => outranking.every((state) => !APPLIES[state](c)));
    premise(
      `inputs where both ${a} and ${b} apply and nothing outranks ${winner}`,
      decisive.length,
      0,
    );
    for (const c of decisive) {
      expect(deriveBarView(inputsOf(c), TZ).state, describeCase(c)).toBe(winner);
    }
  });

  test("every input lands on the highest-precedence state that applies, and every state is reachable", () => {
    const reached = new Set<BarState>();
    for (const c of SPACE) {
      const applicable = PRECEDENCE.filter((state) => APPLIES[state](c));
      expect(applicable.length, `no state applies to ${describeCase(c)}`).toBeGreaterThan(0);
      const actual = deriveBarView(inputsOf(c), TZ).state;
      expect(actual, describeCase(c)).toBe(applicable[0]);
      reached.add(actual);
    }
    expect([...reached].sort()).toEqual([...BAR_STATES].sort());
  });
});
