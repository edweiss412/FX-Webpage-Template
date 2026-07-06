# Phase 1 — Parser + context (crew page redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every task here (failing test → run-to-fail → minimal implementation → run-to-pass → commit). This repo uses **Vitest**, not Jest: `pnpm vitest run <path>`. Read `00-overview.md` first (shared contracts + verified-facts digest are binding). Honor the shared-contract TypeScript signatures **verbatim** — do not re-derive them. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four no-UI data-layer changes that the rest of the redesign sits on: (1) the dates-parser `loadIn` capture into the existing `dates` jsonb (no DDL), (2) the shared `resolveKeyTimes(show, rooms)` helper with deterministic GS-room selection + `dates.loadIn` precedence + embedded-sentinel guard, (3) `ProjectedRoomRow` projection passthrough (`ShowForViewer.rooms` typed `RoomRow & { id }`, `dates.loadIn` passes through), (4) `buildRightNowContext` re-sourced from `rooms` (new signature, drop `contacts`, drop the always-empty `event_details` time reads). Covers §9 tests **3, 4, 20**.

**⚠️ EXECUTION ORDER (R1-HIGH-2 — dependency-correct, NOT topical):** implement **Task 1 → Task 2 → Task 4 (`ProjectedRoomRow` projection passthrough) → Task 3 (`buildRightNowContext`)**. The passthrough (Task 4) **must land before** the `buildRightNowContext` signature change (Task 3): Task 3's new signature requires `rooms: ProjectedRoomRow[] | null`, and its **sole** call site (`_ShowBody.tsx:122-127`) passes `data.rooms`, which is only `ProjectedRoomRow[]` (assignable) **after** Task 4 widens `ShowForViewer.rooms`. Doing Task 3 before Task 4 yields a broken `tsc` before Task 3 can commit. (The tasks are numbered topically below but executed 1→2→4→3.)

**Scope guards (do not cross):**
- Do **not** create `_CrewShell.tsx`, any `components/crew/` file, `loading.tsx`, or touch `app/show/**` / `app/admin/**` — those are Phases 2–4.
- **The ONE exception (unavoidable, tsc-mandated):** Task 3 changes the `buildRightNowContext` **signature**, so its single call site `_ShowBody.tsx:122-127` MUST be reconciled in the same Task-3 commit — a **one-line mechanical type-fix** (`contacts: data.contacts` → `rooms: data.rooms`), NOT a UI/markup change (the `_ShowBody`→`_CrewShell` body swap is Phase 2). This compiles cleanly because Task 4 (done first) already typed `data.rooms` as `ProjectedRoomRow[]`. Leaving the call site broken to "avoid touching `_ShowBody`" is not an option — you cannot change a function signature and leave its only caller red.
- The shared parser `RoomRow` type is **unchanged** (wp per §4.4): only `ShowForViewer.rooms` becomes `ProjectedRoomRow[]`.

---

### Task 1: `dates.loadIn` capture in the dates parser

Captures the load-in clock time from the DATES **TIME** column (currently discarded, `dates.ts:178` reads only `row[1]` label + `row[3]` date) into a new optional `dates.loadIn: string | null`, for set-bearing rows only (`set` + `travel_set`). Covers **§9 test 4** (all sub-cases). Spec §4.4 change 2, §6a, wp-8/wp-23.

**Files:**
- Modify: `lib/parser/types.ts` (`ShowRow.dates` gains `loadIn?: string | null`)
- Modify: `lib/parser/blocks/dates.ts` (`parseV2V4Dates` captures `row[4]`; `parseV1Dates` best-effort; new `extractClockTime` helper; init `result.loadIn`)
- Test: `tests/parser/blocks/dates.test.ts` (extend the existing file — add a `parseDates — loadIn capture` describe block)

**Steps:**

- [ ] **Add the type field first** (a one-line type change so the test compiles). In `lib/parser/types.ts`, inside the `ShowRow.dates` object literal (`:94-99`), add `loadIn` after `travelOut`:
  ```typescript
  dates: {
    travelIn: string | null;
    set: string | null;
    showDays: string[];
    travelOut: string | null;
    loadIn?: string | null; // free-text load-in clock time from the DATES TIME column (set/travel_set rows). §4.4
  };
  ```
- [ ] **Write the failing test.** Append to `tests/parser/blocks/dates.test.ts`. Build minimal inline markdown DATES tables (the existing tests use `parseTableRows`-compatible pipe tables — mirror the 5-col v2/v4 shape `| DATES | label | DAY | DATE | TIME |`). Expected values are derived from the TIME cell literal in each fixture, never hardcoded independently.
  ```typescript
  // ── dates.loadIn capture (§9 test 4) ─────────────────────────────────────────
  // _Catches:_ row[4] discarded; combined TRAVEL/SET row dropped; SHOW/TRAVEL row
  // misclassified as load-in; clock-extraction position-dependent; false capture
  // from a no-clock TIME cell; absent TIME column not tolerated; v1 not tolerated.
  describe("parseDates — loadIn capture (§9 test 4)", () => {
    // 5-col v4 DATES table. Helper builds the pipe table the parser expects;
    // each row is | DATES | <label> | <DAY> | <DATE> | <TIME> |.
    function datesTable(rows: Array<[string, string, string, string]>): string {
      const header = "| DATES | | | | |\n| --- | --- | --- | --- | --- |";
      const body = rows
        .map(([label, day, date, time]) => `| | ${label} | ${day} | ${date} | ${time} |`)
        .join("\n");
      return `${header}\n${body}\n`;
    }

    it("captures TIME from a plain SET row (time-first 'LOAD IN' suffix)", () => {
      // TIME cell literal: "11:00 AM LOAD IN" → extracted clock "11:00 AM".
      const time = "11:00 AM LOAD IN";
      const md = datesTable([
        ["TRAVEL IN", "Mon", "3/22/26", ""],
        ["SET", "Tue", "3/23/26", time],
        ["SHOW DAY 1", "Wed", "3/24/26", ""],
      ]);
      const d = parseDates(md, "v4");
      // Expected derived from the TIME cell, not a standalone literal:
      expect(d.loadIn).toBe(time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0]);
      expect(d.loadIn).toBe("11:00 AM");
      expect(d.set).toBe("2026-03-23");
    });

    it("captures TIME label-first ('Load In: 7:00 PM') — extraction is not position-dependent", () => {
      const time = "Load In: 7:00 PM";
      const md = datesTable([["SET", "Tue", "3/23/26", time]]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBe(time.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0]);
      expect(d.loadIn).toBe("7:00 PM");
    });

    it("captures TIME from the time-first live variant '12:30 PM LOAD IN'", () => {
      const time = "12:30 PM LOAD IN";
      const md = datesTable([["SET", "Tue", "3/23/26", time]]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBe("12:30 PM");
    });

    it("captures TIME from a combined TRAVEL / SET row (travel_set classification)", () => {
      const time = "9:00 AM LOAD IN";
      const md = datesTable([
        ["TRAVEL / SET", "Mon", "3/22/26", time],
        ["SHOW DAY 1", "Tue", "3/23/26", ""],
      ]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBe("9:00 AM");
      // travel_set still populates set + travelIn fallback (unchanged behavior):
      expect(d.set).toBe("2026-03-22");
    });

    it("explicit SET row wins over a TRAVEL / SET row when both carry a TIME", () => {
      const md = datesTable([
        ["TRAVEL / SET", "Mon", "3/22/26", "8:00 AM LOAD IN"],
        ["SET", "Tue", "3/23/26", "10:30 AM LOAD IN"],
      ]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBe("10:30 AM"); // the explicit set row's TIME, per §4.4
    });

    it("a SHOW row's TIME does NOT populate loadIn (only set-bearing rows)", () => {
      const md = datesTable([
        ["SET", "Tue", "3/23/26", ""],
        ["SHOW DAY 1", "Wed", "3/24/26", "2:00 PM DOORS"],
      ]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBeNull();
    });

    it("a plain TRAVEL row's TIME does NOT populate loadIn", () => {
      const md = datesTable([
        ["TRAVEL", "Mon", "3/22/26", "6:00 AM DEPART"],
        ["SET", "Tue", "3/23/26", ""],
      ]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBeNull();
    });

    it("a TIME cell with no recognizable clock time → null (no false capture)", () => {
      const md = datesTable([["SET", "Tue", "3/23/26", "LOAD IN"]]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBeNull();
    });

    it("a coarse free-text TIME with no clock ('AFTER 8PM') → null", () => {
      // "AFTER 8PM" has no HH:MM, so it is not a captured clock time (live-data §3).
      const md = datesTable([["SET", "Tue", "3/23/26", "AFTER 8PM"]]);
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBeNull();
    });

    it("absent TIME column (4-col row) → null", () => {
      const header = "| DATES | | | |\n| --- | --- | --- | --- |";
      const md = `${header}\n| | SET | Tue | 3/23/26 |\n`;
      const d = parseDates(md, "v4");
      expect(d.loadIn).toBeNull();
    });

    it("v1 fixture tolerates null loadIn (no TIME column in v1 shape)", () => {
      const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
      const version = detectVersion(md);
      const d = parseDates(md, version!);
      // v1/v1-shaped DATES blocks have no dedicated TIME column → null is fine.
      expect(d.loadIn ?? null).toBeNull();
    });
  });
  ```
- [ ] **Run-to-fail:** `pnpm vitest run tests/parser/blocks/dates.test.ts -t "loadIn capture"` → **FAIL** (`d.loadIn` is `undefined`, not the extracted clock string / not `null`; `extractClockTime` does not exist).
- [ ] **Minimal implementation.** In `lib/parser/blocks/dates.ts`:
  1. Init the field in `parseDates`'s `result` literal (`:54-59`): add `loadIn: null,`.
  2. Add the clock-extraction helper near the bottom (next to `extractAllDates`, `:242`). It matches an `HH:MM` (with optional AM/PM) anywhere in the cell — position-independent — so `"12:30 PM LOAD IN"` and `"Load In: 7:00 PM"` both yield the clock and `"LOAD IN"`/`"AFTER 8PM"` yield null:
     ```typescript
     /**
      * Extract a clock time (HH:MM with optional AM/PM) from a free-text TIME cell.
      * Position-independent: "12:30 PM LOAD IN" and "Load In: 7:00 PM" both match;
      * cells with no HH:MM ("LOAD IN", "AFTER 8PM") → null. §4.4 / §9 test 4.
      */
     function extractClockTime(raw: string): string | null {
       const c = clean(raw);
       if (!c) return null;
       const m = c.match(/\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/);
       if (!m) return null;
       // Normalize the captured AM/PM to uppercase, single space.
       return m[0].replace(/\s+/g, " ").replace(/([AaPp][Mm])$/, (s) => s.toUpperCase()).trim();
     }
     ```
  3. In `parseV2V4Dates`, after computing `kind` (`:181`), capture the TIME cell (`row[4]`) for set-bearing rows. Add a local `loadInFromSet`/`loadInFromTravelSet` so the explicit `set` row wins (§4.4: "if both a `travel_set` and a separate `set` row carry a TIME, the explicit `set` row wins"). Inside the `switch` add to the `set` and `travel_set` cases:
     ```typescript
     case "travel_set": {
       const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
       result.set = iso;
       if (!result.travelIn) result.travelIn = iso;
       const t = extractClockTime(row[4] ?? "");
       if (t && !result.loadIn) result.loadIn = t; // travel_set fills loadIn only if unset
       break;
     }

     case "set": {
       result.set = presence(rawDate) ? normalizeDate(rawDate) : null;
       const t = extractClockTime(row[4] ?? "");
       if (t) result.loadIn = t; // explicit SET row overrides any travel_set value
       break;
     }
     ```
     Note: order in the sheet may put `travel_set` before or after `set`; the explicit `set` case assigns unconditionally (overriding `travel_set`), while `travel_set` only assigns when `result.loadIn` is still unset — so the explicit `set` row always wins regardless of row order.
  4. In `parseV1Dates`, leave `loadIn` at its initialized `null` (best-effort; v1 has no TIME column). No change needed — the init in step 1 covers it.
- [ ] **Run-to-pass:** `pnpm vitest run tests/parser/blocks/dates.test.ts` → all green (the new block + the existing corpus/per-fixture assertions). `pnpm typecheck` → clean.
- [ ] **Commit:** `feat(parser): capture DATES TIME load-in into dates.loadIn (set/travel_set rows)`

---

### Task 2: `resolveKeyTimes` shared helper

The shared anchor resolver consumed by `buildRightNowContext` (Task 3) and, later, `KeyTimesStrip` + Schedule. Deterministic GS-room selection, `dates.loadIn` Set precedence, embedded-`TBD`/`N/A`/`TBA` guard. Covers **§9 test 20** (determinism). Shared-contract signature from `00-overview.md` — copy verbatim. Spec §4.4, §4.8, wp-23.

**Files:**
- Create: `lib/crew/resolveKeyTimes.ts`
- Test: `tests/crew/resolveKeyTimes.test.ts`

**Steps:**

- [ ] **Write the failing test.** Create `tests/crew/resolveKeyTimes.test.ts`. Fixtures supply rooms in varying array order; expected anchors derive from the fixture room whose times we set — never hardcoded blind. The `id` field is the DB-PK tiebreaker (`ProjectedRoomRow = RoomRow & { id }`).
  ```typescript
  import { describe, it, expect } from "vitest";
  import { resolveKeyTimes, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
  import type { ShowRow } from "@/lib/parser/types";

  // A complete ProjectedRoomRow from partial overrides (all non-time fields are inert here).
  function room(overrides: Partial<ProjectedRoomRow>): ProjectedRoomRow {
    return {
      id: "00000000-0000-0000-0000-000000000000",
      kind: "gs",
      name: "",
      dimensions: null,
      floor: null,
      setup: null,
      set_time: null,
      show_time: null,
      strike_time: null,
      audio: null,
      video: null,
      lighting: null,
      scenic: null,
      power: null,
      digital_signage: null,
      other: null,
      notes: null,
      ...overrides,
    };
  }
  function dates(overrides: Partial<ShowRow["dates"]> = {}): Pick<ShowRow, "dates"> {
    return { dates: { travelIn: null, set: null, showDays: [], travelOut: null, ...overrides } };
  }

  describe("resolveKeyTimes — determinism (§9 test 20)", () => {
    // _Catches:_ anchor times varying with DB return order or duplicate room
    // names (rooms query has no ORDER BY); flaky screenshot baselines.

    it("(a) multiple gs rooms in varying order → name-sorted-first gs room's times, identically", () => {
      const alpha = room({ id: "id-a", name: "Alpha GS", kind: "gs", set_time: "9:00 AM", show_time: "1:00 PM", strike_time: "8:00 PM" });
      const zulu = room({ id: "id-z", name: "Zulu GS", kind: "gs", set_time: "7:00 AM", show_time: "11:00 AM", strike_time: "6:00 PM" });
      const forward = resolveKeyTimes(dates(), [alpha, zulu]);
      const reversed = resolveKeyTimes(dates(), [zulu, alpha]);
      // Name-sorted first gs = "Alpha GS"; expected derived from that room's literals:
      expect(forward).toEqual({ set: alpha.set_time, show: alpha.show_time, strike: alpha.strike_time });
      expect(forward).toEqual(reversed); // order-independent
    });

    it("(b) no gs room → name-sorted-first room (kind rank gs<breakout<additional, then name)", () => {
      const breakout = room({ id: "id-b", name: "Breakout B", kind: "breakout", show_time: "2:00 PM" });
      const additional = room({ id: "id-x", name: "Aux A", kind: "additional", show_time: "3:00 PM" });
      const r = resolveKeyTimes(dates(), [additional, breakout]);
      // breakout outranks additional → "Breakout B" picked even though "Aux A" sorts first by name.
      expect(r.show).toBe(breakout.show_time);
    });

    it("(c) gs room with blank times → all anchors absent → empty object (strip omitted)", () => {
      const blank = room({ id: "id-c", name: "GS", kind: "gs" }); // all *_time null
      const r = resolveKeyTimes(dates(), [blank]);
      expect(r).toEqual({}); // no keys → KeyTimesStrip omitted (§4.8)
    });

    it("(d) two gs rooms same name, different times → id-tiebroken pick, identical across orderings", () => {
      const lowId = room({ id: "id-1", name: "Main GS", kind: "gs", show_time: "1:00 PM" });
      const highId = room({ id: "id-2", name: "Main GS", kind: "gs", show_time: "5:00 PM" });
      const forward = resolveKeyTimes(dates(), [lowId, highId]);
      const reversed = resolveKeyTimes(dates(), [highId, lowId]);
      // id "id-1" < "id-2" → lowId wins; expected derived from that room's literal:
      expect(forward.show).toBe(lowId.show_time);
      expect(forward).toEqual(reversed);
    });

    it("dates.loadIn takes Set precedence over GS set_time", () => {
      const gs = room({ id: "id-g", name: "GS", kind: "gs", set_time: "9:00 AM", show_time: "1:00 PM" });
      const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), [gs]);
      expect(r.set).toBe("8:30 AM"); // dates.loadIn wins
      expect(r.show).toBe(gs.show_time);
    });

    it("dates.loadIn renders Set even when rooms is empty/null (rooms-independent, wp-23)", () => {
      const r = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), []);
      expect(r).toEqual({ set: "8:30 AM" }); // Show/Strike absent, Set present
      const rNull = resolveKeyTimes(dates({ loadIn: "8:30 AM" }), null);
      expect(rNull).toEqual({ set: "8:30 AM" });
    });

    it("embedded TBD/N/A/TBA token → anchor absent (live-data §3)", () => {
      const gs = room({ id: "id-t", name: "GS", kind: "gs", set_time: "TBD", show_time: "10/20 @ TBD", strike_time: "8:00 PM" });
      const r = resolveKeyTimes(dates(), [gs]);
      // set_time "TBD" and show_time "10/20 @ TBD" are sentinel-bearing → absent;
      // strike_time "8:00 PM" is clean → present. Partial strip (Strike only).
      expect(r).toEqual({ strike: gs.strike_time });
    });

    it("partial strip: GS with set+strike but no show_time → Show omitted (the common live case)", () => {
      const gs = room({ id: "id-e", name: "GS", kind: "gs", set_time: "9:00 AM", show_time: null, strike_time: "8:00 PM" });
      const r = resolveKeyTimes(dates(), [gs]);
      expect(r).toEqual({ set: gs.set_time, strike: gs.strike_time }); // Show absent
    });
  });
  ```
- [ ] **Run-to-fail:** `pnpm vitest run tests/crew/resolveKeyTimes.test.ts` → **FAIL** (cannot resolve `@/lib/crew/resolveKeyTimes` — module does not exist).
- [ ] **Minimal implementation.** Create `lib/crew/resolveKeyTimes.ts`. Signature copied verbatim from `00-overview.md` shared contracts.
  ```typescript
  import type { RoomRow, ShowRow } from "@/lib/parser/types";

  /** ShowForViewer.rooms element type: a parsed RoomRow plus its DB PK. */
  export type ProjectedRoomRow = RoomRow & { id: string };

  /** Present keys only; an absent anchor is simply not a key (strip omits it). */
  export type KeyTimeAnchors = { set?: string; show?: string; strike?: string };

  const ROOM_KIND_RANK: Record<RoomRow["kind"], number> = { gs: 0, breakout: 1, additional: 2 };

  /**
   * True when a free-text time value should be treated as ABSENT: empty, or it
   * contains a bare TBD/N/A/TBA token (e.g. "10/20 @ TBD", a breakout literal
   * "TBD"). Live-data guard (§3/§4.4) — these must not render as a real time.
   */
  function isAbsentTime(value: string | null | undefined): boolean {
    if (value == null) return true;
    const v = value.trim();
    if (v.length === 0) return true;
    return /\b(?:TBD|N\/A|TBA)\b/i.test(v);
  }

  /** Stable total order: kind rank, then normalized name, then DB id. */
  function compareRooms(a: ProjectedRoomRow, b: ProjectedRoomRow): number {
    const rk = ROOM_KIND_RANK[a.kind] - ROOM_KIND_RANK[b.kind];
    if (rk !== 0) return rk;
    const an = a.name.trim().toLowerCase();
    const bn = b.name.trim().toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Resolve the Set/Show/Strike anchors for the Today KeyTimesStrip, Schedule
   * "Daily times", and buildRightNowContext. Deterministic regardless of DB
   * return order (the rooms query has no ORDER BY).
   *
   * Set precedence: dates.loadIn (non-sentinel) ?? selected-room set_time ?? omit.
   * Show/Strike: selected-room show_time/strike_time (sentinel-guarded).
   * Set is rooms-INDEPENDENT (wp-23): a present dates.loadIn renders even when
   * rooms is null/empty.
   */
  export function resolveKeyTimes(
    show: Pick<ShowRow, "dates">,
    rooms: ProjectedRoomRow[] | null,
  ): KeyTimeAnchors {
    const anchors: KeyTimeAnchors = {};

    // Deterministic room pick: gs preferred via kind rank; else first in total order.
    const sorted = (rooms ?? []).slice().sort(compareRooms);
    const selected = sorted[0] ?? null; // total order already prefers gs (rank 0)

    // Set: dates.loadIn wins, else selected room's set_time, else omit.
    const loadIn = show.dates.loadIn;
    if (!isAbsentTime(loadIn)) {
      anchors.set = (loadIn as string).trim();
    } else if (selected && !isAbsentTime(selected.set_time)) {
      anchors.set = (selected.set_time as string).trim();
    }

    // Show / Strike: selected room only (rooms-dependent).
    if (selected && !isAbsentTime(selected.show_time)) {
      anchors.show = (selected.show_time as string).trim();
    }
    if (selected && !isAbsentTime(selected.strike_time)) {
      anchors.strike = (selected.strike_time as string).trim();
    }

    return anchors;
  }
  ```
- [ ] **Run-to-pass:** `pnpm vitest run tests/crew/resolveKeyTimes.test.ts` → green. `pnpm typecheck` → clean.
- [ ] **Commit:** `feat(crew-page): add resolveKeyTimes shared anchor resolver (deterministic GS pick + dates.loadIn precedence + sentinel guard)`

---

### Task 3: `buildRightNowContext` rooms-sourcing

Re-source the Right-Now hero's time anchors from `rooms` via `resolveKeyTimes`, drop the unused `contacts` param, and drop the always-empty `event_details.{call_time,load_in_time,strike_time,first_show_room}` reads entirely (NOT a fallback). New signature from `00-overview.md` shared contracts. Covers **§9 test 3**. Spec §4.4 change 1, §7.1 (wp-1), wp-23.

**Files:**
- Modify: `components/right-now/buildRightNowContext.ts` (new signature; rooms-sourced anchors; drop `event_details` time reads)
- Test: `tests/components/buildRightNowContext.test.ts` (new file)

**Field mapping (the `RightNowContext` SHAPE is unchanged — only the source of each anchor changes; `RightNowCard.tsx:254-283` still consumes these names):**
- `loadInTime` ← resolved **Set** anchor (`resolveKeyTimes(...).set`, i.e. `dates.loadIn ?? GS set_time`)
- `callTime` ← resolved **Show** anchor (`.show`) — the `show_day_n` "Call:" line
- `strikeTime` ← resolved **Strike** anchor (`.strike`)
- `roomName` ← **`null`** (dropped: `event_details.first_show_room` is the only source and it is always empty §7.1; no rooms-derived replacement is in Phase-1 scope — `RightNowCard.tsx:276` already guards `ctx.roomName` falsy)
- `hotelName` / `hotelCheckInTime` / `hotelCheckOutTime` ← unchanged (from `hotelReservations[0]`; check-in/out are DATES per wp-3)
- `venueName` / `dates` / `dateRestriction` / `showTitle` / `timezone` ← unchanged

**Steps:**

- [ ] **Write the failing test.** Create `tests/components/buildRightNowContext.test.ts`. Build a minimal `ProjectedRoomRow[]` + `event_details` carrying DIFFERENT legacy time values, and assert the context comes from rooms (proving the `event_details` path is dropped, not a fallback). Expected values derive from the room fixture literals.
  ```typescript
  import { describe, it, expect } from "vitest";
  import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
  import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
  import type { ShowRow } from "@/lib/parser/types";

  function room(overrides: Partial<ProjectedRoomRow>): ProjectedRoomRow {
    return {
      id: "r0", kind: "gs", name: "GS", dimensions: null, floor: null, setup: null,
      set_time: null, show_time: null, strike_time: null, audio: null, video: null,
      lighting: null, scenic: null, power: null, digital_signage: null, other: null, notes: null,
      ...overrides,
    };
  }
  function show(overrides: Partial<Pick<ShowRow, "dates" | "title" | "venue" | "event_details">> = {}) {
    return {
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      title: "Test Show",
      venue: { name: "Venue Hall", address: "1 Main St" },
      event_details: {},
      ...overrides,
    };
  }

  describe("buildRightNowContext — rooms-sourcing (§9 test 3)", () => {
    // _Catches:_ regression to the always-empty event_details path; missing
    // empty-rooms guard; a known load-in time hidden when rooms absent/errored;
    // embedded-TBD rendering as a real time; missing-show_time not degrading.

    it("sources Set/Show/Strike from the GS room (event_details time path is DROPPED, not a fallback)", () => {
      const gs = room({ set_time: "9:00 AM", show_time: "1:00 PM", strike_time: "8:00 PM" });
      const ctx = buildRightNowContext({
        show: show({
          // legacy event_details time keys set to DIFFERENT values — must be ignored:
          event_details: { load_in_time: "99:99 ZZ", strike_time: "00:00 ZZ", call_time: "11:11 ZZ", first_show_room: "GHOST ROOM" },
        }),
        dateRestriction: { kind: "none" },
        hotelReservations: [],
        rooms: [gs],
      });
      expect(ctx.loadInTime).toBe(gs.set_time);   // from rooms, not event_details
      expect(ctx.callTime).toBe(gs.show_time);
      expect(ctx.strikeTime).toBe(gs.strike_time);
      expect(ctx.roomName).toBeNull();            // first_show_room dropped (§7.1)
    });

    it("no gs room → first room in total order supplies Show/Strike", () => {
      const breakout = room({ kind: "breakout", name: "B", show_time: "2:00 PM" });
      const ctx = buildRightNowContext({
        show: show(), dateRestriction: { kind: "none" }, hotelReservations: [], rooms: [breakout],
      });
      expect(ctx.callTime).toBe(breakout.show_time);
    });

    it("rooms: [] with NO dates.loadIn → all three null", () => {
      const ctx = buildRightNowContext({
        show: show(), dateRestriction: { kind: "none" }, hotelReservations: [], rooms: [],
      });
      expect(ctx.loadInTime).toBeNull();
      expect(ctx.callTime).toBeNull();
      expect(ctx.strikeTime).toBeNull();
    });

    it("rooms: [] WITH dates.loadIn → Set renders (loadInTime), Show/Strike null (wp-23)", () => {
      const ctx = buildRightNowContext({
        show: show({ dates: { travelIn: null, set: null, showDays: [], travelOut: null, loadIn: "8:30 AM" } }),
        dateRestriction: { kind: "none" }, hotelReservations: [], rooms: [],
      });
      expect(ctx.loadInTime).toBe("8:30 AM"); // Set still renders, rooms-independent
      expect(ctx.callTime).toBeNull();
      expect(ctx.strikeTime).toBeNull();
    });

    it("rooms: null behaves like empty rooms (errored projection)", () => {
      const ctx = buildRightNowContext({
        show: show(), dateRestriction: { kind: "none" }, hotelReservations: [], rooms: null,
      });
      expect(ctx.loadInTime).toBeNull();
      expect(ctx.callTime).toBeNull();
      expect(ctx.strikeTime).toBeNull();
    });

    it("embedded-TBD show_time + present set/strike → partial (Show null, the live East Coast case)", () => {
      const gs = room({ set_time: "9:00 AM", show_time: "10/20 @ TBD", strike_time: "8:00 PM" });
      const ctx = buildRightNowContext({
        show: show(), dateRestriction: { kind: "none" }, hotelReservations: [], rooms: [gs],
      });
      expect(ctx.loadInTime).toBe(gs.set_time);
      expect(ctx.callTime).toBeNull();        // "10/20 @ TBD" → absent
      expect(ctx.strikeTime).toBe(gs.strike_time);
    });

    it("hotel name + check-in DATE pass through unchanged (wp-3: dates, never a clock time)", () => {
      const ctx = buildRightNowContext({
        show: show(), dateRestriction: { kind: "none" },
        hotelReservations: [{ ordinal: 1, hotel_name: "The Grand", hotel_address: null, names: [], confirmation_no: null, check_in: "2026-03-22", check_out: "2026-03-26", notes: null }],
        rooms: [],
      });
      expect(ctx.hotelName).toBe("The Grand");
      expect(ctx.hotelCheckInTime).toBe("2026-03-22"); // a DATE, not a clock
    });
  });
  ```
- [ ] **Run-to-fail:** `pnpm vitest run tests/components/buildRightNowContext.test.ts` → **FAIL** (the function does not accept `rooms`; it still reads `event_details` time keys, so `loadInTime`/`callTime`/`strikeTime` come from the legacy keys — and the test passes `rooms` which TS rejects against the old signature).
- [ ] **Minimal implementation.** Rewrite `components/right-now/buildRightNowContext.ts`'s signature + body:
  ```typescript
  import type { DateRestriction, HotelReservationRow, ShowRow } from "@/lib/parser/types";
  import { resolveShowTimezone } from "@/lib/time/showTimezone";
  import { resolveKeyTimes, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";

  // ... keep the RightNowContext type EXACTLY as-is (shape unchanged) ...

  export function buildRightNowContext(opts: {
    show: Pick<ShowRow, "dates" | "title" | "venue" | "event_details">;
    dateRestriction: DateRestriction;
    hotelReservations: HotelReservationRow[];
    rooms: ProjectedRoomRow[] | null; // NEW — replaces the dropped `contacts` param
  }): RightNowContext {
    const { show, dateRestriction, hotelReservations, rooms } = opts;
    const firstHotel = hotelReservations[0] ?? null;

    // Time anchors are rooms-sourced via the shared resolver (§4.4). The old
    // event_details.{call_time,load_in_time,strike_time,first_show_room} reads
    // are DROPPED ENTIRELY (always empty for real shows, §7.1) — not a fallback.
    const anchors = resolveKeyTimes(show, rooms);
    const loadInTime = anchors.set ?? null;   // Set anchor (dates.loadIn ?? GS set_time)
    const callTime = anchors.show ?? null;     // Show anchor
    const strikeTime = anchors.strike ?? null; // Strike anchor
    const roomName = null;                      // first_show_room dropped (§7.1); no Phase-1 source

    const timezone = resolveShowTimezone(show.venue);

    return {
      dates: show.dates,
      dateRestriction,
      showTitle: show.title,
      hotelName: firstHotel?.hotel_name ?? null,
      hotelCheckInTime: firstHotel?.check_in ?? null,
      hotelCheckOutTime: firstHotel?.check_out ?? null,
      venueName: show.venue?.name ?? null,
      loadInTime,
      callTime,
      roomName,
      strikeTime,
      timezone,
    };
  }
  ```
  Also delete the now-unused `event_details` destructuring (`ed`, `:72-82`) and the `ContactRow` import.
- [ ] **Reconcile the existing call site (do NOT change `_ShowBody`'s behavior).** The old call site at `_ShowBody.tsx:122-127` passes `{ show, dateRestriction, hotelReservations, contacts }`. Since Phase 1 must NOT touch UI and must keep `_ShowBody` compiling, update **only** the call site's argument object (a mechanical type-fix, not a UI change): replace `contacts: data.contacts` with `rooms: data.rooms` at `_ShowBody.tsx:122-127`. `data.rooms` is already `ProjectedRoomRow[]` after Task 4 (run Task 4 before this step, or temporarily cast). This is the minimum to keep `tsc` green; the full `_ShowBody`→`_CrewShell` swap is Phase 2. Add an inline note at the call site: `// rooms-sourced anchors (§4.4); call site migrates to _CrewShell in Phase 2`.
  - **Dependency note for the orchestrator:** Task 4 (`ProjectedRoomRow` projection) must land **before** this reconciliation compiles cleanly, because `data.rooms` must already be `ProjectedRoomRow[]`. Sequence: Task 4 → Task 3 reconciliation. (Tasks 1–2 are independent.)
- [ ] **Run-to-pass:** `pnpm vitest run tests/components/buildRightNowContext.test.ts` → green. Re-run the existing recovery test that builds a `RightNowContext` directly (no signature dependency): `pnpm vitest run tests/components/RightNowCardRecovery.test.tsx` → still green. `pnpm typecheck` → clean.
- [ ] **Commit:** `feat(crew-page): re-source buildRightNowContext anchors from rooms via resolveKeyTimes (drop event_details time reads + contacts param)`

---

### Task 4: `ProjectedRoomRow` projection passthrough

`ShowForViewer.rooms` becomes `ProjectedRoomRow[]` (`RoomRow & { id }`); the rooms projection maps the DB `id`; `dates.loadIn` passes through (jsonb decode is already generic). No UI, no DDL. Spec §4.4 (ProjectedRoomRow), §6a, §9 test 3/20 (consumes this type).

**Files:**
- Modify: `lib/data/getShowForViewer.ts` (`ShowForViewer.rooms` type → `ProjectedRoomRow[]`; rooms map adds `id`; import `ProjectedRoomRow`)
- Test: `tests/data/getShowForViewer-rooms-projection.test.ts` (new file — narrow projection-shape test)

**Note on `dates.loadIn` passthrough:** `getShowForViewer` decodes `dates` via the generic `decodeJsonbColumn` (`:250-280`), so a `loadIn` key already round-trips with no code change. The passthrough is proven by the dates-parser round-trip (Task 1) + the type widening here; this task's test focuses on the `id` projection (the load-bearing new behavior).

**Steps:**

- [ ] **Write the failing test.** Create `tests/data/getShowForViewer-rooms-projection.test.ts`. Mock the Supabase client so `from('rooms').select('*').eq(...)` returns rows carrying an `id`, and assert the projected `rooms[i].id` matches the DB row `id`. Expected `id` derives from the mock row, not hardcoded blind. (Match the existing `getShowForViewer` test's mock-client style — grep `tests/data/` for the established `createMockSupabase`/builder helper and reuse it; if none exists, build a minimal chainable stub returning `{ data, error }` per the Supabase call-boundary contract, invariant 9.)
  ```typescript
  // _Catches:_ the rooms projection dropping the DB id, breaking resolveKeyTimes'
  // id-tiebreaker (§9 test 20 case d) and making screenshot baselines flaky.
  it("projects each room's DB id into ProjectedRoomRow", async () => {
    const roomId = "11111111-1111-1111-1111-111111111111";
    // ... wire the mock so from('rooms') resolves { data: [{ id: roomId, kind: 'gs', name: 'GS', set_time: '9:00 AM', /* ...nullable cols... */ }], error: null }
    const out = await getShowForViewer(showId, viewer);
    expect(out.rooms[0]?.id).toBe(roomId);      // expected from the mock row
    expect(out.rooms[0]?.set_time).toBe("9:00 AM");
  });
  ```
  Also add a **pure compile-time** assertion (R10-MEDIUM-2 — a runtime cast like `(null as unknown as ShowForViewer).rooms` would evaluate `null.rooms` at module load and throw `TypeError` before any test runs, masking the regression; type assertions are erased). Use a conditional type that touches NO object:
  ```typescript
  import type { ShowForViewer } from "@/lib/data/getShowForViewer";
  import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
  // Compile-time only (no runtime evaluation): fails `tsc` if ShowForViewer.rooms is not ProjectedRoomRow[].
  type _RoomsCarryId = ShowForViewer["rooms"] extends ProjectedRoomRow[] ? true : never;
  const _assertRoomsCarryId: _RoomsCarryId = true; // `never` (→ tsc error) until rooms is widened to ProjectedRoomRow[]
  ```
- [ ] **Run-to-fail:** `pnpm vitest run tests/data/getShowForViewer-rooms-projection.test.ts` → **FAIL** (`out.rooms[0].id` is `undefined` — the current map at `:380-399` omits `id`). And `pnpm typecheck` FAILS on `const _assertRoomsCarryId: _RoomsCarryId = true` because `_RoomsCarryId` resolves to `never` while `ShowForViewer.rooms` is still `RoomRow[]` (no `id`).
- [ ] **Minimal implementation.** In `lib/data/getShowForViewer.ts`:
  1. Import the type: add `import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";` near the other type imports (`~:58`).
  2. Change the `ShowForViewer.rooms` field type (`:121`): `rooms: ProjectedRoomRow[];`.
  3. Change the local accumulator (`:374`): `let rooms: ProjectedRoomRow[] = [];`.
  4. In the row map (`:380-399`), add `id` as the first mapped field:
     ```typescript
     rooms = (roomRes.data ?? []).map((row) => ({
       id: row.id as string,
       kind: row.kind as RoomRow["kind"],
       // ... all existing fields unchanged ...
     }));
     ```
  - Do **not** change the rooms query (`.select("*")` already returns `id`; no `ORDER BY` is added — determinism lives in `resolveKeyTimes`, not the query, per §4.4).
- [ ] **Run-to-pass:** `pnpm vitest run tests/data/getShowForViewer-rooms-projection.test.ts` → green. Re-run the existing projection tests: `pnpm vitest run tests/data/` → still green. `pnpm typecheck` → clean.
- [ ] **Commit:** `feat(crew-page): type ShowForViewer.rooms as ProjectedRoomRow[] and project the DB id`

---

## Phase exit criteria

All must be true before Phase 2 begins:

- [ ] **§9 test 3** green — `buildRightNowContext` rooms-sourcing + sentinel guard (`tests/components/buildRightNowContext.test.ts`): GS-sourced Set/Show/Strike; `event_details` time path dropped (not a fallback); no-gs → first room; `rooms: []` with/without `dates.loadIn`; embedded-`TBD` → partial.
- [ ] **§9 test 4** green — dates-parser load-in (`tests/parser/blocks/dates.test.ts`): time-first + label-first extraction; TRAVEL/SET combined row; SHOW/plain-TRAVEL does NOT populate; no-clock TIME → null; absent column → null; v1 → null tolerated.
- [ ] **§9 test 20** green — `resolveKeyTimes` determinism (`tests/crew/resolveKeyTimes.test.ts`): multi-gs varying order; no-gs name-sorted-first; blank → omitted; same-name id-tiebreak.
- [ ] `pnpm typecheck` clean across the repo (the `ShowForViewer.rooms` widening + the `buildRightNowContext` signature change + the `_ShowBody` call-site reconciliation all compile).
- [ ] **No UI touched** — no file under `app/` (the `_ShowBody.tsx` change is a mechanical call-site type-fix, NOT a UI/markup change), no file under `components/crew/` (none created), no `loading.tsx`, no CSS/token change. `RoomRow` in `lib/parser/types.ts` is unchanged (only `ShowRow.dates` gained `loadIn?`).
- [ ] Existing suites still green: `pnpm vitest run tests/parser/blocks/dates.test.ts tests/components/RightNowCardRecovery.test.tsx tests/data/`.
- [ ] Four commits landed, one per task, conventional-commits scoped (`feat(parser):` × 1, `feat(crew-page):` × 3).
