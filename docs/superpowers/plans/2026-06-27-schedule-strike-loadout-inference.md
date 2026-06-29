# Schedule SET / Strike / Load-Out inference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a SET day, per-room Strike entries, and a Load-Out entry in the per-day Schedule (run-of-show), derived from already-parsed data, on both the admin Step-3 review and the crew Schedule/Today sections.

**Architecture:** A single pure derivation `deriveScheduleBookends(runOfShow, dates, transportation, rooms, contextYear)` synthesizes three kinds of entries from existing parsed fields — SET `Load In`/`Setup` from `dates.loadIn`/`setupTime`, per-room `Strike` from `rooms[].strike_time`, and `Load Out` from the transport `Pick Up Venue` stage — and appends them to the merged run-of-show in the parser pipeline. The crew read-model projection is widened from show-days to the aggregate-day domain so SET/travel-day entries reach crew; the load-out entry is per-viewer transport-gated at render. One new data-quality warning flags strikes dated off the show's schedule.

**Tech Stack:** TypeScript, Next.js 16 App Router (synchronous Server Components), Vitest, Playwright, Supabase (read-only here — JSONB `shows_internal.run_of_show`, no migration).

**Spec:** `docs/superpowers/specs/2026-06-27-schedule-strike-loadout-inference-design.md` (APPROVED, 17 adversarial rounds). Cite it for rationale; this plan carries the code.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. One commit per task, conventional-commits (`feat(parser):`, `test(crew-page):`, etc.).
- **No new DB column, no migration, no advisory lock, no RPC.** `run_of_show` is existing JSONB. `rooms.strike_time` already parsed/persisted.
- **No raw error codes in UI** (invariant 5): the new warning renders via `lib/messages/lookup.ts` catalog copy, never the raw code.
- **UI quality gate** (invariant 8): UI files (`components/**`, no `app/` page changes here) ship only after `/impeccable critique` + `/impeccable audit` (Task 16) with HIGH/CRITICAL fixed or `DEFERRED.md`'d, before the cross-model whole-diff review.
- **§12.4 catalog lockstep** (3 + regen): master spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row + `pnpm gen:internal-code-enums`, all in the Task-6 commit; the `x1-catalog-parity` gate (`tests/messages/codes.test.ts`) enforces it.
- **Three entry kinds** exactly: `agenda` (default/absent), `strike`, `loadout`. SET `Load In`/`Setup` entries are `kind` absent (agenda).
- **Meta-test inventory:** no new structural meta-test (declared in spec §14b); the new warning is guarded by the existing `x1-catalog-parity` gate. Advisory-lock topology: N/A (no `pg_advisory*`).
- **Run the FULL suite before the cross-model review** (`pnpm vitest run`) — a new warning-code PREFIX must already map in `app/help/errors/_families.ts` (the `SCHEDULE` prefix is pre-mapped; no families edit), and `tests/help/errors-grouping.test.tsx` fails CI-only otherwise.

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `lib/parser/types.ts` | `AgendaEntryKind` + `AgendaEntry.kind?` | 1 |
| `lib/data/decodeRunOfShow.ts` | validate `kind` (enum allow-list) on decode | 1 |
| `lib/parser/blocks/scheduleTimes.ts` | export shared `extractFirstClock` | 2 |
| `lib/parser/blocks/scheduleBookends.ts` | **new** — `deriveScheduleBookends` + `parseRoomTimeCell` + `roomKindFallback` | 3,4,5 |
| `lib/parser/blocks/agendaWarnings.ts` | `strikeDateOffSchedule` warning helper | 6 |
| `lib/parser/dataGaps.ts` | add code to `OPERATOR_ACTIONABLE_ANCHORED` | 6 |
| `lib/drive/showDayTimeAnchors.ts` | region-anchor dispatch for the new code | 6 |
| `docs/superpowers/specs/2026-04-30-…-v1.md` + `lib/messages/catalog.ts` + `__generated__/*` | §12.4 catalog lockstep | 6 |
| `lib/parser/index.ts` | call `deriveScheduleBookends` after the merge | 7 |
| `lib/data/getShowForViewer.ts` | widen `run_of_show` key projection to aggregate domain | 8 |
| `lib/crew/resolveKeyTimes.ts` | anchor fallback skips synthetic entries | 9 |
| `lib/crew/agendaDisplay.ts` | `scheduleEntriesForViewer` (load-out transport gate) | 10 |
| `components/crew/primitives/RunOfShowList.tsx` | `kind` badge + cap-exemption partition | 11 |
| `components/crew/sections/ScheduleSection.tsx` | transportVisible + gate + SET meta suppression | 12 |
| `components/crew/sections/TodaySection.tsx` | route through `scheduleEntriesForViewer` | 13 |
| `components/admin/wizard/Step3SheetCard.tsx` | `kind` badge + entry/day cap-exemption | 14 |
| `DEFERRED.md` | deferred multi-entry SET run-of-show | 15 |

Dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7 (parser complete) → 8,9,10 (data/helpers) → 11 → 12,13,14 (UI) → 15 (layout) → 16 (transition audit) → 17 (DEFERRED) → 18 (impeccable) → 19 (self-review) → 20 (adversarial) → 21 (handoff).

---

### Task 1: `AgendaEntry.kind` + decoder allow-list

**Files:**
- Modify: `lib/parser/types.ts` (AgendaEntry, ~335-342)
- Modify: `lib/data/decodeRunOfShow.ts` (`decodeEntries`, ~13-63)
- Test: `tests/data/decodeRunOfShow.test.ts`

**Interfaces:**
- Produces: `type AgendaEntryKind = "agenda" | "strike" | "loadout"`; `AgendaEntry.kind?: AgendaEntryKind`.

- [ ] **Step 1: Write the failing decoder tests**

Add to `tests/data/decodeRunOfShow.test.ts`:

```ts
it("preserves kind 'strike' and 'loadout' on decode", () => {
  const raw = {
    "2026-05-06": { entries: [
      { start: "4:30 PM", title: "Strike — General Session", kind: "strike" },
      { start: "6:00 PM", title: "Load Out", kind: "loadout" },
    ], showStart: null, window: null },
  };
  const { value, corrupt } = decodeRunOfShow(raw);
  expect(corrupt).toBe(false);
  expect(value!["2026-05-06"].entries.map((e) => e.kind)).toEqual(["strike", "loadout"]);
});

it("coerces an unknown kind to absent (agenda), not corrupt", () => {
  const raw = {
    "2026-05-06": { entries: [{ start: "1 PM", title: "X", kind: "banana" }], showStart: null, window: null },
  };
  const { value, corrupt } = decodeRunOfShow(raw);
  expect(corrupt).toBe(false); // unknown kind is dropped like a bad optional field, not corrupting
  expect(value!["2026-05-06"].entries[0].kind).toBeUndefined();
});

it("decodes a legacy entry without kind unchanged", () => {
  const raw = { "2026-05-06": { entries: [{ start: "1 PM", title: "X" }], showStart: null, window: null } };
  const { value } = decodeRunOfShow(raw);
  expect(value!["2026-05-06"].entries[0].kind).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/data/decodeRunOfShow.test.ts -t kind`
Expected: FAIL (kind not preserved / type error).

- [ ] **Step 3: Add the type**

In `lib/parser/types.ts`, replace the `AgendaEntry` type:

```ts
export type AgendaEntryKind = "agenda" | "strike" | "loadout";
export type AgendaEntry = {
  start: string;
  finish?: string;
  trt?: string;
  title: string;
  room?: string;
  av?: string;
  kind?: AgendaEntryKind; // absent ⇒ "agenda"
};
```

- [ ] **Step 4: Validate `kind` in the decoder**

In `lib/data/decodeRunOfShow.ts`, inside `decodeEntries`, after the `OPTIONAL_FIELDS` copy loop builds `decoded` (and before `validEntries.push(decoded)`), add an enum allow-list for `kind` (do NOT add `"kind"` to `OPTIONAL_FIELDS` — that list does a blind string copy):

```ts
const k = entry["kind"];
if (k === "strike" || k === "loadout") {
  decoded.kind = k;
}
// any other value (absent, "agenda", non-string, "banana") ⇒ no kind field; not corrupt.
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run tests/data/decodeRunOfShow.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 6: Commit**

```bash
git add lib/parser/types.ts lib/data/decodeRunOfShow.ts tests/data/decodeRunOfShow.test.ts
git commit --no-verify -m "feat(parser): AgendaEntry.kind enum + decoder allow-list"
```

---

### Task 2: `extractFirstClock` shared helper

**Files:**
- Modify: `lib/parser/blocks/scheduleTimes.ts` (export a clock extractor reusing the existing `CLOCK_RE` semantics)
- Test: `tests/parser/blocks/scheduleTimes.test.ts`

**Interfaces:**
- Produces: `export function extractFirstClock(text: string): string | null` — returns the first token that is a real clock (has `:MM` OR an AM/PM suffix), preserved verbatim; else null.

- [ ] **Step 1: Write the failing test**

Add to `tests/parser/blocks/scheduleTimes.test.ts`:

```ts
import { extractFirstClock } from "@/lib/parser/blocks/scheduleTimes";

describe("extractFirstClock", () => {
  it.each([
    ["4:30pm", "4:30pm"],
    ["1PM", "1PM"],
    ["6:00 PM", "6:00 PM"],
    ["8 PM", "8 PM"],
    ["@ 5:00 PM (tentative)", "5:00 PM"],
  ])("extracts a clock from %s", (input, out) => {
    expect(extractFirstClock(input)).toBe(out);
  });
  it.each(["AM", "morning", "TBD", "8", "", "Room 5"])("rejects non-clock %s", (input) => {
    expect(extractFirstClock(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts -t extractFirstClock`
Expected: FAIL ("extractFirstClock is not a function").

- [ ] **Step 3: Implement, reusing the module's `CLOCK_RE` + minutes-or-ampm rule**

In `lib/parser/blocks/scheduleTimes.ts`, export a helper that walks `CLOCK_RE` and returns the first match that has minutes (group 2) or an AM/PM suffix (group 3), normalized with the existing `normClock`:

```ts
/**
 * First real clock token in `text` (has :MM or AM/PM), returned VERBATIM (the
 * operator's exact text — we don't reformat crew-facing clock display, spec §7.2);
 * null if none. (Distinct from the show-day tokenizer's normClock display path.)
 */
export function extractFirstClock(text: string): string | null {
  CLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLOCK_RE.exec(text)) !== null) {
    if (!m[2] && !m[3]) continue; // bare integer, not a clock
    return m[0].trim(); // verbatim — e.g. "4:30pm", "1PM", "6:00 PM", "8 PM"
  }
  return null;
}
```

> Verbatim (not `normClock`) is deliberate: the tests below and spec §7.2 require the operator's exact clock text. Do NOT route this through `normClock` (which uppercases AM/PM and strips the leading-zero hour) — that's the show-day *display* path, not this extractor.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleTimes.ts tests/parser/blocks/scheduleTimes.test.ts
git commit --no-verify -m "feat(parser): shared extractFirstClock helper"
```

---

### Task 3: `parseRoomTimeCell` + `roomKindFallback` (in new `scheduleBookends.ts`)

**Files:**
- Create: `lib/parser/blocks/scheduleBookends.ts`
- Test: `tests/parser/blocks/scheduleBookends.test.ts`

**Interfaces:**
- Produces: `parseRoomTimeCell(raw, contextYear): { date: string | null; time: string | null }` — leading `M/D[/YY]` date (year-resolved, calendar-validated via `normalizeDate`) + first real clock from the tail (`extractFirstClock`). `roomKindFallback(kind): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/blocks/scheduleBookends.test.ts`:

```ts
import { parseRoomTimeCell } from "@/lib/parser/blocks/scheduleBookends";

describe("parseRoomTimeCell", () => {
  it("parses date @ clock", () => {
    expect(parseRoomTimeCell("10/9 @ 4:30pm", "2025")).toEqual({ date: "2025-10-09", time: "4:30pm" });
  });
  it("parses date - clock (v1 dash separator)", () => {
    expect(parseRoomTimeCell("5/15 - 1PM", "2024")).toEqual({ date: "2024-05-15", time: "1PM" });
  });
  it("uses explicit year over context", () => {
    expect(parseRoomTimeCell("3/25/26 @ 12:30pm", "2099")).toEqual({ date: "2026-03-25", time: "12:30pm" });
  });
  it("bare TBD → no date", () => {
    expect(parseRoomTimeCell("TBD", "2025")).toEqual({ date: null, time: null });
  });
  it("date + sentinel/non-clock time → date present, time null", () => {
    expect(parseRoomTimeCell("5/14 @ TBD", "2025")).toEqual({ date: "2025-05-14", time: null });
    expect(parseRoomTimeCell("5/14 @ AM", "2025")).toEqual({ date: "2025-05-14", time: null });
  });
  it("yearless with null context → no date", () => {
    expect(parseRoomTimeCell("10/9 @ 4:30pm", null)).toEqual({ date: null, time: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `lib/parser/blocks/scheduleBookends.ts`:

```ts
import { presence, normalizeDate } from "./_helpers";
import { extractFirstClock } from "./scheduleTimes";
import type { RoomKind } from "../types";

const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  gs: "General Session",
  breakout: "Breakout",
  additional: "Room",
};
export function roomKindFallback(kind: RoomKind): string {
  return ROOM_KIND_LABEL[kind];
}

/** Leading M/D[/YY] date (year-resolved) + first real clock from the tail. */
export function parseRoomTimeCell(
  raw: string | null,
  contextYear: string | null,
): { date: string | null; time: string | null } {
  if (presence(raw) === null) return { date: null, time: null };
  const cell = raw!.trim();
  const m = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(cell);
  if (!m) return { date: null, time: null };
  const explicitYear = m[3];
  const cellYear = /\b(20\d\d)\b/.exec(cell)?.[1];
  const year = explicitYear ?? cellYear ?? contextYear;
  if (!year) return { date: null, time: null };
  const date = normalizeDate(`${m[1]}/${m[2]}/${year}`);
  if (!date) return { date: null, time: null };
  const tail = cell.slice(m[0].length);
  return { date, time: extractFirstClock(tail) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleBookends.ts tests/parser/blocks/scheduleBookends.test.ts
git commit --no-verify -m "feat(parser): parseRoomTimeCell + roomKindFallback"
```

---

### Task 4: `deriveScheduleBookends` — strike derivation + off-schedule warning

**Files:**
- Modify: `lib/parser/blocks/scheduleBookends.ts`
- Modify: `lib/parser/blocks/agendaWarnings.ts` (add the `strikeDateOffSchedule` helper here)
- Test: `tests/parser/blocks/scheduleBookends.test.ts`

> Split rationale: the `strikeDateOffSchedule` warning *helper* (a `ParseWarning` factory) lands in THIS task because the strike derivation emits it. Task 6 does the separate §12.4 catalog lockstep + operator-surfacing for the same code. The code literal `"SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"` is identical in both.

**Interfaces:**
- Produces: `deriveScheduleBookends(runOfShow, dates, transportation, rooms, contextYear): { runOfShow: Record<string, ScheduleDay> | undefined; warnings: ParseWarning[] }`. Appends `kind:"strike"` entries; emits `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` for off-schedule strike dates.

- [ ] **Step 1: Write the failing strike tests**

Add to `tests/parser/blocks/scheduleBookends.test.ts` (fixtures derived from the survey; build minimal `RoomRow[]`/`dates`):

```ts
import { deriveScheduleBookends } from "@/lib/parser/blocks/scheduleBookends";
const room = (name: string, kind: any, strike_time: string | null) =>
  ({ kind, name, dimensions: null, floor: null, setup: null, set_time: null, show_time: null,
     strike_time, audio: null, video: null, lighting: null, scenic: null, power: null,
     digital_signage: null, other: null, notes: null });
const dates = (o: Partial<any> = {}) =>
  ({ travelIn: null, set: null, showDays: [], travelOut: null, loadIn: null, setupTime: null, ...o });

it("collapses identical (date,time) into one 'all rooms' iff every striking room", () => {
  const d = dates({ showDays: ["2025-05-14"] });
  const rooms = [room("GS", "gs", "5/14 @ 5:00 PM"), room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
                 room("Walton", "breakout", "5/14 @ 5:00 PM")];
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
  const e = runOfShow!["2025-05-14"].entries.filter((x) => x.kind === "strike");
  expect(e).toHaveLength(1);
  expect(e[0].title).toBe("Strike — all rooms");
});

it("partial simultaneous group names rooms; a TBD sibling blocks 'all rooms'", () => {
  const d = dates({ showDays: ["2025-05-14"] });
  const rooms = [room("GS", "gs", "5/14 @ 5:00 PM"), room("Lasalle", "breakout", "5/14 @ 5:00 PM"),
                 room("Walton", "breakout", "TBD")];
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
  const e = runOfShow!["2025-05-14"].entries.find((x) => x.kind === "strike")!;
  expect(e.title).toBe("Strike — GS, Lasalle"); // sorted; Walton (TBD) blocks "all rooms"
});

it("places strikes on each room's own date (breakouts earlier than GS)", () => {
  const d = dates({ showDays: ["2026-03-24", "2026-03-25"] });
  const rooms = [room("GS", "gs", "3/25 @ 12:30pm"), room("State A", "breakout", "3/24 @ 12:15pm")];
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2026");
  expect(runOfShow!["2026-03-24"].entries.some((e) => e.kind === "strike" && e.start === "12:15pm")).toBe(true);
  expect(runOfShow!["2026-03-25"].entries.some((e) => e.kind === "strike" && e.start === "12:30pm")).toBe(true);
});

it("timeless/non-clock strike → no entry, still blocks all-rooms", () => {
  const d = dates({ showDays: ["2025-05-14"] });
  const rooms = [room("GS", "gs", "5/14 @ TBD"), room("Lasalle", "breakout", "5/14 @ 5:00 PM")];
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
  const e = runOfShow!["2025-05-14"].entries.filter((x) => x.kind === "strike");
  expect(e).toHaveLength(1);
  expect(e[0].title).toBe("Strike — Lasalle"); // GS has no clock → no entry; intent count 2 ≠ group 1
});

it("off-schedule strike date → warning + entry still present (admin-visible)", () => {
  const d = dates({ travelIn: "2025-05-12", set: "2025-05-13", showDays: ["2025-05-14"], travelOut: "2025-05-15" });
  const rooms = [room("GS", "gs", "5/20 @ 5:00 PM")]; // 5/20 ∉ aggregate
  const { runOfShow, warnings } = deriveScheduleBookends(undefined, d, null, rooms, "2025");
  expect(runOfShow!["2025-05-20"].entries.some((e) => e.kind === "strike")).toBe(true);
  expect(warnings.some((w) => w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
});

it("does not mutate the input runOfShow", () => {
  const d = dates({ showDays: ["2025-05-14"] });
  const input = {} as Record<string, any>;
  deriveScheduleBookends(input, d, null, [room("GS", "gs", "5/14 @ 5:00 PM")], "2025");
  expect(Object.keys(input)).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts -t deriveScheduleBookends`
Expected: FAIL.

- [ ] **Step 3: Add the warning helper + strike derivation**

In `lib/parser/blocks/agendaWarnings.ts` add:

```ts
export function strikeDateOffSchedule(iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
    message: `A room strike date (${iso}) is not one of the show's scheduled days; it shows in the admin review but not on crew schedules until corrected`,
    blockRef: { kind: "rooms", iso },
  };
}
```

In `lib/parser/blocks/scheduleBookends.ts` add (imports: `ScheduleDay, AgendaEntry, ParseWarning, ShowRow, TransportationRow, RoomRow` from `../types`; `strikeDateOffSchedule` from `./agendaWarnings`):

```ts
const STRIKE_ROOM_NAME_CAP = 3;

function appendEntry(ros: Record<string, ScheduleDay>, iso: string, entry: AgendaEntry): void {
  const day = ros[iso] ?? { entries: [], showStart: null, window: null };
  ros[iso] = { ...day, entries: [...day.entries, entry] };
}

export function deriveScheduleBookends(
  rosIn: Record<string, ScheduleDay> | undefined,
  dates: ShowRow["dates"],
  transportation: TransportationRow | null,
  rooms: RoomRow[],
  contextYear: string | null,
): { runOfShow: Record<string, ScheduleDay> | undefined; warnings: ParseWarning[] } {
  const ros: Record<string, ScheduleDay> = {};
  for (const [k, v] of Object.entries(rosIn ?? {})) ros[k] = { ...v, entries: [...v.entries] };
  const warnings: ParseWarning[] = [];

  const scheduleDateSet = new Set(
    [dates.travelIn, dates.set, ...dates.showDays, dates.travelOut].filter(Boolean) as string[],
  );

  // ── STRIKE ──
  const strikeIntentCount = rooms.filter((r) => presence(r.strike_time) !== null).length;
  const groups = new Map<string, { iso: string; time: string; rooms: string[] }>();
  for (const r of rooms) {
    const { date, time } = parseRoomTimeCell(r.strike_time, contextYear);
    if (date == null || time == null) continue;
    const name = presence(r.name) ?? roomKindFallback(r.kind);
    const key = `${date}|${time}`;
    const g = groups.get(key) ?? { iso: date, time, rooms: [] };
    if (!g.rooms.includes(name)) g.rooms.push(name);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort(
    (a, b) => a.iso.localeCompare(b.iso) || a.time.localeCompare(b.time) || a.rooms.join().localeCompare(b.rooms.join()),
  );
  for (const g of sorted) {
    let title: string;
    if (g.rooms.length === 1) title = `Strike — ${g.rooms[0]}`;
    else if (g.rooms.length === strikeIntentCount) title = "Strike — all rooms";
    else if (g.rooms.length <= STRIKE_ROOM_NAME_CAP) title = `Strike — ${[...g.rooms].sort().join(", ")}`;
    else title = `Strike — ${g.rooms.length} rooms`;
    appendEntry(ros, g.iso, { start: g.time, title, kind: "strike" });
    if (!scheduleDateSet.has(g.iso)) warnings.push(strikeDateOffSchedule(g.iso));
  }

  // (Load-Out + SET added in Task 5.)

  return { runOfShow: Object.keys(ros).length ? ros : rosIn, warnings };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleBookends.ts lib/parser/blocks/agendaWarnings.ts tests/parser/blocks/scheduleBookends.test.ts
git commit --no-verify -m "feat(parser): deriveScheduleBookends strike derivation + off-schedule warning"
```

---

### Task 5: `deriveScheduleBookends` — Load-Out + SET synthesis

**Files:**
- Modify: `lib/parser/blocks/scheduleBookends.ts`
- Test: `tests/parser/blocks/scheduleBookends.test.ts`

**Interfaces:**
- Produces (extends Task 4): `kind:"loadout"` entry from transport Pick Up Venue; `kind` absent `"Load In"`/`"Setup"` entries on `dates.set`.

- [ ] **Step 1: Write the failing tests**

```ts
const transport = (schedule: any[]) =>
  ({ driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null,
     color: null, parking: null, schedule, notes: null });

it("synthesizes Load Out from Pick Up Venue (clock required)", () => {
  const d = dates({ showDays: ["2026-05-06"] });
  const t = transport([{ stage: "Pick Up Venue", date: "2026-05-06", time: "6:00 PM", assigned_names: [] }]);
  const { runOfShow } = deriveScheduleBookends(undefined, d, t, [], "2026");
  const e = runOfShow!["2026-05-06"].entries.find((x) => x.kind === "loadout")!;
  expect(e).toMatchObject({ start: "6:00 PM", title: "Load Out", kind: "loadout" });
});

it("no Load Out when Pick Up Venue time is non-clock", () => {
  const d = dates({ showDays: ["2026-05-06"] });
  const t = transport([{ stage: "Pick Up Venue", date: "2026-05-06", time: "TBD", assigned_names: [] }]);
  const { runOfShow } = deriveScheduleBookends(undefined, d, t, [], "2026");
  expect(runOfShow?.["2026-05-06"]?.entries.some((x) => x.kind === "loadout") ?? false).toBe(false);
});

it("synthesizes SET Load In/Setup from dates (label-before-clock fixture)", () => {
  const d = dates({ set: "2025-05-12", showDays: ["2025-05-13"], loadIn: "7:00 PM", setupTime: "8:30 PM" });
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
  const e = runOfShow!["2025-05-12"].entries;
  expect(e).toEqual([
    { start: "7:00 PM", title: "Load In" },
    { start: "8:30 PM", title: "Setup" },
  ]);
});

it("no SET entry when loadIn null (no-colon/AFTER 8PM)", () => {
  const d = dates({ set: "2024-05-13", showDays: ["2024-05-14"], loadIn: null });
  const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2024");
  expect(runOfShow?.["2024-05-13"]).toBeUndefined();
});

it("SET appends, does not overwrite a pre-existing day", () => {
  const d = dates({ set: "2025-05-12", showDays: ["2025-05-13"], loadIn: "7:00 PM" });
  const input = { "2025-05-12": { entries: [{ start: "2 PM", title: "Session" }], showStart: null, window: null } };
  const { runOfShow } = deriveScheduleBookends(input, d, null, [], "2025");
  expect(runOfShow!["2025-05-12"].entries.map((e) => e.title)).toEqual(["Session", "Load In"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts -t "Load Out\|SET"`
Expected: FAIL.

- [ ] **Step 3: Implement (replace the `// (Load-Out + SET added in Task 5.)` line)**

```ts
  // ── LOAD OUT (transport Pick Up Venue) ──
  const puv = transportation?.schedule.find((s) => /pick\s*up\s*venue/i.test(s.stage.trim()));
  const puvClock = puv ? extractFirstClock(puv.time ?? "") : null;
  if (puv && puv.date != null && puvClock != null) {
    appendEntry(ros, puv.date, { start: puvClock, title: "Load Out", kind: "loadout" });
  }

  // ── SET load-in / setup (synthesized from dates; appended; kind absent = agenda) ──
  if (dates.set) {
    if (presence(dates.loadIn)) appendEntry(ros, dates.set, { start: dates.loadIn!, title: "Load In" });
    if (presence(dates.setupTime)) appendEntry(ros, dates.set, { start: dates.setupTime!, title: "Setup" });
  }
```

Add `import { extractFirstClock } from "./scheduleTimes";` if not already present (it is, from Task 3).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleBookends.ts tests/parser/blocks/scheduleBookends.test.ts
git commit --no-verify -m "feat(parser): deriveScheduleBookends load-out + SET synthesis"
```

---

### Task 6: Off-schedule warning — catalog lockstep + operator surfacing

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 add a row)
- Run: `pnpm gen:spec-codes`, `pnpm gen:internal-code-enums` (regenerate `lib/messages/__generated__/spec-codes.ts`, `internal-code-enums.ts`)
- Modify: `lib/messages/catalog.ts` (add the matching row)
- Modify: `lib/parser/dataGaps.ts` (`OPERATOR_ACTIONABLE_ANCHORED` += the code)
- Modify: `lib/drive/showDayTimeAnchors.ts` (`attachSourceCellAnchors` region dispatch)
- Modify: `tests/parser/operatorActionableWarnings.test.ts` (exact-membership pin array — add the code)
- Test: `tests/messages/codes.test.ts` (x1 gate, existing), `tests/parser/dataGaps.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/parser/parseWarningDeepLinkRender.test.tsx`

**Interfaces:**
- Consumes: `strikeDateOffSchedule` (Task 4). Produces: the code surfaced via `operatorActionableWarnings` with a `rooms`-region `sourceCell`.

- [ ] **Step 1: Add the §12.4 catalog row (spec prose)**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 table, add a row for `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` modeled **exactly** on the `SCHEDULE_TIME_UNPARSED` row (same columns the table uses): when-it-fires, operator-facing copy, follow-up, help anchor. Operator copy: "A room's strike time is dated on a day that isn't part of _<sheet-name>_'s schedule, so it shows in your review but not on crew pages. Fix the date in the room's Strike Time cell so it matches a show day."

- [ ] **Step 2: Regenerate + add catalog row matching the real `MessageEntry` schema**

```bash
pnpm gen:spec-codes && pnpm gen:internal-code-enums
```
Then add the matching row to `lib/messages/catalog.ts` using the **same field set as the `SCHEDULE_TIME_UNPARSED` entry** (`catalog.ts:1208-1220`): `code`, `dougFacing`, `crewFacing` (null), `followUp` ("Doug → check sheet"), `helpfulContext`, and `helpHref: "/help/errors#SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"` — **CODE-shape anchor** (catalog `helpHref` is always `/help/errors#<CODE>`, e.g. `#SCHEDULE_TIME_UNPARSED` at `catalog.ts:1219`; the `RefAnchor` `VALID_ID` regex is SCREAMING_SNAKE, so kebab would not resolve). Copy the exact field names from the sibling row; do not invent `title`.

- [ ] **Step 3: Run the x1 catalog-parity gate to verify it fails before the catalog row, passes after**

Run: `pnpm vitest run tests/messages/codes.test.ts`
Expected: PASS (catalog ↔ §12.4 ↔ generated all aligned). If FAIL, the three layers drifted — reconcile.

- [ ] **Step 4: Surface via operator-actionable path (failing test first)**

Add to `tests/parser/dataGaps.test.ts`:

```ts
import { operatorActionableWarnings, OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
it("SCHEDULE_STRIKE_DATE_OFF_SCHEDULE is operator-actionable", () => {
  expect(OPERATOR_ACTIONABLE_ANCHORED.has("SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
  const out = operatorActionableWarnings([
    { severity: "warn", code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE", message: "x", blockRef: { kind: "rooms", iso: "2025-05-20" } },
  ]);
  expect(out).toHaveLength(1);
});
```

- [ ] **Step 5: Add the code to the set + region-anchor dispatch + update the exact-membership pin**

In `lib/parser/dataGaps.ts`, add `"SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"` to `OPERATOR_ACTIONABLE_ANCHORED`.
In `lib/drive/showDayTimeAnchors.ts` `attachSourceCellAnchors`, add a branch resolving this code to `sources.region[w.blockRef!.kind]` (= `region["rooms"]`, a valid `RegionId`) — mirroring the `FIELD_UNREADABLE` region branch.
**MANDATORY:** `tests/parser/operatorActionableWarnings.test.ts` asserts the **exact membership** of `OPERATOR_ACTIONABLE_ANCHORED` (`expect([...OPERATOR_ACTIONABLE_ANCHORED].sort()).toEqual([ … ])`, and `showDayTimeAnchors.ts` documents this pin). Add `"SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"` to that expected array (keep sorted) — otherwise the full suite fails. Also check `tests/parser/parseWarningDeepLinkRender.test.tsx` (it iterates the set and resolves each code's anchor) — the new code must resolve to a non-null `rooms` region anchor there, which Step 5's dispatch provides.

- [ ] **Step 6: Run the relevant suites**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx tests/messages/codes.test.ts tests/help/errors-grouping.test.tsx tests/drive/showDayTimeAnchors.test.ts`
Expected: PASS (the `SCHEDULE` prefix is pre-mapped in `_families.ts`; errors-grouping + the membership pin stay green).

- [ ] **Step 7: Commit (all lockstep layers together)**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/ lib/parser/dataGaps.ts lib/drive/showDayTimeAnchors.ts tests/
git commit --no-verify -m "feat(messages): SCHEDULE_STRIKE_DATE_OFF_SCHEDULE catalog + operator surfacing"
```

---

### Task 7: Wire `deriveScheduleBookends` into the parser pipeline

**Files:**
- Modify: `lib/parser/index.ts` (after the merge block, ~447; before the return ~480)
- Test: `tests/parser/parseSheet*.test.ts` (or a new `tests/parser/scheduleBookendsIntegration.test.ts`)

**Interfaces:**
- Consumes: `deriveScheduleBookends` (Tasks 4-5), `inferShowYear` (`_helpers`), `mergedRunOfShow`, `dates`, `transportation`, `rooms`.

- [ ] **Step 1: Write the failing integration test**

A `parseSheet` fixture (markdown) with a SET row (`11:00 AM LOAD IN`), a GS room `Strike Time` (`5/6 @ 6:00 PM`-style on a show day), and a transport `Pick Up Venue` row → assert `parseSheet(md).runOfShow` contains the SET `Load In` entry, the strike entry, and the load-out entry; and an off-schedule strike fixture yields the warning in `.warnings`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/parser/scheduleBookendsIntegration.test.ts`
Expected: FAIL (entries absent).

- [ ] **Step 3: Wire it in `index.ts`**

After the `mergedRunOfShow` block (~447), before the return:

```ts
const bookendYear = inferShowYear(markdown);
const bookends = deriveScheduleBookends(mergedRunOfShow, dates, transportation, rooms, bookendYear);
mergedRunOfShow = bookends.runOfShow;
agg.warnings.push(...bookends.warnings);
```

Add imports: `deriveScheduleBookends` from `./blocks/scheduleBookends`; `inferShowYear` is already imported via `_helpers` in sibling blocks — import it in `index.ts` if not present.

- [ ] **Step 4: Run to verify pass + full parser suite**

Run: `pnpm vitest run tests/parser/`
Expected: PASS (no regression in existing parser tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/index.ts tests/parser/scheduleBookendsIntegration.test.ts
git commit --no-verify -m "feat(parser): wire deriveScheduleBookends into parseSheet pipeline"
```

---

### Task 8: Widen the crew `run_of_show` read-model projection

**Files:**
- Modify: `lib/data/getShowForViewer.ts` (~669-695)
- Test: `tests/data/getShowForViewerRunOfShow.test.ts`

**Interfaces:**
- Consumes: `aggregateDays` (`@/lib/crew/agendaDisplay`).

- [ ] **Step 1: Write the failing test**

```ts
it("keeps SET + aggregate keys for a none-restriction viewer; drops off-aggregate", () => {
  // stored run_of_show has set-day key, a show-day strike, and an off-aggregate key
  // → none viewer sees set + show day; off-aggregate dropped.
});
it("explicit viewer: SET key present iff restriction.days includes the set date", () => { /* ... */ });
it("unknown_asterisk → null", () => { /* ... */ });
```

(Build the `getShowForViewer` projection input per the existing test's harness; assert `data.runOfShow` keys.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts`
Expected: FAIL (SET key dropped).

- [ ] **Step 3: Implement**

In `getShowForViewer.ts`, import `aggregateDays`; replace the `showDaySet` allowed-key computation:

```ts
const aggregateSet = new Set(aggregateDays(show.dates).map((d) => d.date));
let allowed: Set<string>;
if (activeRestriction.kind === "unknown_asterisk") allowed = new Set<string>();
else if (activeRestriction.kind === "explicit")
  allowed = new Set(activeRestriction.days.filter((d) => aggregateSet.has(d)));
else allowed = aggregateSet; // none / admin
```

- [ ] **Step 4: Run to verify pass + existing run-of-show tests**

Run: `pnpm vitest run tests/data/`
Expected: PASS (existing `getShowForViewer*` tests still green — verify the showDays-only test was updated to aggregate expectations).

- [ ] **Step 5: Commit**

```bash
git add lib/data/getShowForViewer.ts tests/data/getShowForViewerRunOfShow.test.ts
git commit --no-verify -m "feat(crew-page): widen run_of_show projection to aggregate-day domain"
```

---

### Task 9: `resolveKeyTimes` anchor skips synthetic entries

**Files:**
- Modify: `lib/crew/resolveKeyTimes.ts` (~135)
- Test: `tests/crew/resolveKeyTimes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("does not use a synthetic strike/loadout as a show anchor", () => {
  const runOfShow = { "2025-05-14": { entries: [{ start: "6:00 PM", title: "Load Out", kind: "loadout" }], showStart: null, window: null } };
  const anchors = resolveKeyTimes({ dates: { showDays: ["2025-05-14"] } as any }, [], runOfShow as any, { kind: "none" });
  // no room show_time, only a synthetic entry → no show anchor for that day
  expect(anchors.shows?.some((s) => s.time === "6:00 PM")).toBeFalsy();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/crew/resolveKeyTimes.test.ts -t synthetic`
Expected: FAIL (6:00 PM picked).

- [ ] **Step 3: Implement**

In `resolveKeyTimes.ts` line ~135, change the candidate cascade's entry fallback:

```ts
for (const cand of [day.showStart, day.window?.start,
  day.entries.find((e) => e.kind !== "strike" && e.kind !== "loadout")?.start]) {
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/crew/resolveKeyTimes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crew/resolveKeyTimes.ts tests/crew/resolveKeyTimes.test.ts
git commit --no-verify -m "fix(crew-page): resolveKeyTimes show anchor skips synthetic entries"
```

---

### Task 10: `scheduleEntriesForViewer` — load-out transport gate helper

**Files:**
- Modify: `lib/crew/agendaDisplay.ts`
- Test: `tests/crew/agendaDisplay.test.ts`

**Interfaces:**
- Produces: `scheduleEntriesForViewer(entries, { transportVisible }): AgendaEntry[]` — `displayableEntries` minus `kind:"loadout"` when `!transportVisible`.

- [ ] **Step 1: Write the failing test**

```ts
import { scheduleEntriesForViewer } from "@/lib/crew/agendaDisplay";
const entries = [
  { start: "9 AM", title: "Registration" },
  { start: "5 PM", title: "Strike — GS", kind: "strike" },
  { start: "6 PM", title: "Load Out", kind: "loadout" },
] as any;
it("drops loadout when transport not visible", () => {
  expect(scheduleEntriesForViewer(entries, { transportVisible: false }).map((e) => e.title))
    .toEqual(["Registration", "Strike — GS"]);
});
it("keeps loadout when transport visible", () => {
  expect(scheduleEntriesForViewer(entries, { transportVisible: true })).toHaveLength(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/crew/agendaDisplay.test.ts -t scheduleEntriesForViewer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function scheduleEntriesForViewer(
  entries: AgendaEntry[] | undefined,
  opts: { transportVisible: boolean },
): AgendaEntry[] {
  return displayableEntries(entries).filter((e) => e.kind !== "loadout" || opts.transportVisible);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/crew/agendaDisplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crew/agendaDisplay.ts tests/crew/agendaDisplay.test.ts
git commit --no-verify -m "feat(crew-page): scheduleEntriesForViewer load-out transport gate"
```

---

### Task 11: `RunOfShowList` — kind badge + cap-exemption (UI — Opus)

**Files:**
- Modify: `components/crew/primitives/RunOfShowList.tsx`
- Test: `tests/components/...RunOfShowList.test.tsx`

- [ ] **Step 1: Write the failing test** — a `strike`/`loadout` entry renders a distinct uppercase badge (`STRIKE`/`LOAD OUT`); synthetic entries render even when agenda entries exceed `RUN_OF_SHOW_DISPLAY_CAP`.

```tsx
it("renders a STRIKE badge and keeps synthetic entries cap-exempt", () => {
  const agenda = Array.from({ length: 21 }, (_, i) => ({ start: `${i}:00`, title: `S${i}` }));
  const entries = [...agenda, { start: "6 PM", title: "Load Out", kind: "loadout" }] as any;
  render(<RunOfShowList entries={entries} isoDate="2025-05-14" />);
  expect(screen.getByText("Load Out")).toBeInTheDocument(); // not hidden behind cap
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run <test>` Expected: FAIL.

- [ ] **Step 3: Implement** — partition `displayableEntries` into agenda (`kind` absent/`"agenda"`) and synthetic (`strike`/`loadout`); cap only agenda at `RUN_OF_SHOW_DISPLAY_CAP`; always render synthetic after; overflow stub counts agenda only. Synthetic entries get an uppercase badge reusing the `av`-badge classes (`rounded-sm bg-surface-sunken px-1.5 py-0.5 font-medium uppercase tracking-eyebrow`) reading `STRIKE` / `LOAD OUT`, inside the title cell.

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run <test>` Expected: PASS.

- [ ] **Step 5: Commit.** `git commit --no-verify -m "feat(crew-page): RunOfShowList strike/loadout badge + cap-exemption"`

---

### Task 12: Crew `ScheduleSection` integration (UI — Opus)

**Files:** Modify `components/crew/sections/ScheduleSection.tsx`; Test the §9 schedule test.

- [ ] **Step 1: Failing test** — SET day renders its synthesized `Load In`/`Setup` entries (meta suppressed); a strike shows on its day; an unassigned-crew viewer does NOT see the load-out (transport-gated); admin/assigned do. Assert entry `start` against `data.show.dates.loadIn` (source), not the container.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — (a) import `transportTileVisible`; compute `transportVisible = transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })`; (b) replace both per-day `displayableEntries(sd?.entries)` uses (mode gate `:286` + `RunOfShowList entries=` `:287`) with `scheduleEntriesForViewer(sd?.entries, { transportVisible })`; (c) in the `isSetDay` branch, suppress the `"Setup {setupTime}"` meta when `scheduleEntriesForViewer(sd?.entries, { transportVisible }).length > 0`.
- [ ] **Step 4: Run → PASS** (+ existing §9 ScheduleSection tests green).
- [ ] **Step 5: Commit.** `feat(crew-page): ScheduleSection renders SET/strike/load-out (transport-gated load-out)`

---

### Task 13: Crew `TodaySection` integration (UI — Opus)

**Files:** Modify `components/crew/sections/TodaySection.tsx`; Test the Today test.

- [ ] **Step 1: Failing test** — when today is the set day, the Today run-of-show shows `Load In`; an unassigned viewer doesn't see a load-out on today.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — route the today run-of-show entries through `scheduleEntriesForViewer(todays, { transportVisible })` (`transportVisible` already computed at `:281`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `feat(crew-page): TodaySection load-out transport gate`

---

### Task 14: Admin `Step3SheetCard` ScheduleBreakdown (UI — Opus)

**Files:** Modify `components/admin/wizard/Step3SheetCard.tsx`; Test the Step3 test.

- [ ] **Step 1: Failing tests** — (a) admin shows the SET day + strike + load-out entries (admin = `isAdmin`, all kinds); (b) `kind` badge on `ScheduleDayRow`; (c) entry cap-exemption: a day with >`SCHEDULE_ENTRIES_CAP`(6) agenda entries + a load-out shows the load-out WITHOUT "Show all"; (d) day cap-exemption: a synthetic-bearing day past `SCHEDULE_DAYS_CAP`(14) is still rendered.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — in `ScheduleDayRow`, partition entries into agenda vs synthetic; cap only agenda at `SCHEDULE_ENTRIES_CAP`; always-render synthetic after (cap-exempt); badge synthetic titles inside the `1fr` title cell (preserve the `grid-cols-[auto_1fr] items-baseline` invariant). In `ScheduleBreakdown`, `shownDays` = first `SCHEDULE_DAYS_CAP` day keys ∪ every day whose entries contain a `strike`/`loadout`; the "…and N more days" note counts dropped non-synthetic days only.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `feat(admin): Step3 schedule breakdown shows SET/strike/load-out with cap-exemption`

---

### Task 15: Layout-dimensions assertion (real-browser; mandatory for fixed-dimension parents)

**Files:** Test only — a Playwright (or chrome-devtools `evaluate_script`) assertion.

Dimensional invariant (from spec §13): admin `ScheduleDayRow` grid is `grid-cols-[auto_1fr] items-baseline`; a synthetic entry's `start` sits in the `auto` time track and its title (+badge) in the `1fr` title track — the badge must NOT introduce a third column.

- [ ] **Step 1: Write the real-browser test** — render a Step3 card whose day contains a synthetic `Load Out` entry; `getBoundingClientRect()` on every `…-sched-time` and `…-sched-title` cell in that day; assert all time cells share one left edge and all title cells share one left edge (±0.5px), identical to the agenda rows. jsdom is NOT sufficient.
- [ ] **Step 2: Run → FAIL** (before the badge is correctly placed) — or confirm it guards the invariant by temporarily moving the badge to a 3rd column and seeing it fail.
- [ ] **Step 3:** (Implementation already in Task 14; this task pins it.)
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `test(crew-page): real-browser layout assertion for synthetic schedule rows`

---

### Task 16: Transition audit + impeccable dual-gate (UI — Opus, invariant 8)

**Files:** No code unless findings; `DEFERRED.md` if any HIGH/CRITICAL deferred; handoff notes.

Transition inventory (spec §13): all affected components are synchronous Server Components (no animation); the admin `ScheduleDayRow` `showAll` toggle is instant and synthetic entries are cap-exempt (outside the toggled agenda slice), so toggling never adds/removes a synthetic row. No `AnimatePresence` added.

- [ ] **Step 1: Transition audit** — list every conditional render in the touched components; confirm each is deliberately instant (server-rendered) or the pre-existing `showAll` toggle; confirm the compound case (toggle `showAll` while synthetic entries present) does not move synthetic rows.
- [ ] **Step 2: `/impeccable critique`** on the UI diff (`RunOfShowList`, `ScheduleSection`, `TodaySection`, `Step3SheetCard`) with v3 preflight gates (PRODUCT.md, DESIGN.md, register). Record findings.
- [ ] **Step 3: `/impeccable audit`** on the same diff. Record findings.
- [ ] **Step 4:** Fix HIGH/CRITICAL or add a `DEFERRED.md` entry with rationale. Record dispositions in the handoff notes.
- [ ] **Step 5: Commit** any fixes. `chore(crew-page): impeccable critique+audit dispositions for schedule bookends`

---

### Task 17: DEFERRED.md — rich multi-entry SET run-of-show

**Files:** Modify `DEFERRED.md`.

- [ ] **Step 1:** Add an entry: "Rich multi-entry SET run-of-show (cell-derived titles via a SET-specific label-before-clock tokenizer)" — deferred per spec §6; current behavior is a 2-entry `Load In`/`Setup` synthesis from `dates.loadIn`/`setupTime`. Trigger to revisit: a real SET cell needs >2 distinct times or precise non-"Setup" labels. (Use `printf`, not `echo >>`, and verify the file.)
- [ ] **Step 2: Commit.** `docs(handoff): DEFERRED entry for multi-entry SET run-of-show`

---

### Task 18: Self-review

- [ ] Run the FULL suite: `pnpm vitest run` (catches the families/errors-grouping CI-only class). Expected: green.
- [ ] Spec-coverage sweep: each spec section (§5–§14) maps to a task; no placeholder; types consistent across tasks (`AgendaEntryKind`, `deriveScheduleBookends` signature, `scheduleEntriesForViewer`). Fix inline.
- [ ] Anti-tautology check on every new test: graphic-vs-source assertions read the data source; DOM scans clone+strip siblings; expected values derived from fixtures.

---

### Task 19: Adversarial review (cross-model)

- [ ] Invoke `adversarial-review` (Codex) on the whole implementation diff. Iterate to APPROVE (no round budget). Reviewer is REVIEWER ONLY. Class-sweep each finding; structural defense after 3+ same-vector rounds. Do not proceed to handoff until APPROVE.

---

### Task 20: Execution handoff

- [ ] Per the autonomous pipeline: after Codex APPROVE, push → real CI green → `gh pr merge --merge` → fast-forward local `main` (`git rev-list --left-right --count main...origin/main` == `0  0`).
