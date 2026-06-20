# Crew Page Mock-Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **UI work is Opus-only (hard rule); dispatch Opus subagents for every task here.**

**Goal:** Bring the 6 crew sections to fidelity with the DesignSync "FXAV Crew Pages" mock — colored avatars, Schedule date badges, icon-only contact buttons, mini-icon fact rows, travel itinerary rows, split-wide column ratios, and a gated Today run-of-show — without touching projection/parser/data.

**Architecture:** Pure presentational changes in `components/crew/**` + `components/atoms/Avatar.tsx`, a `DESIGN.md` avatar amendment, and one shared-module extraction (`lib/crew/agendaDisplay.ts` + `components/crew/primitives/RunOfShowList.tsx`) that single-sources the run-of-show displayable-entry predicate so the new Today surface can't drift from Schedule's privacy contract. TDD per task; Opus subagents; impeccable dual-gate + Codex whole-branch + CI before merge.

**Tech Stack:** Next.js 16 RSC (synchronous Server Components), Tailwind v4 `@theme`, Vitest + jsdom (unit), Playwright (real-browser layout).

**Spec (Codex-APPROVED R5):** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-crew-mock-fidelity.md`. **Mock ground truth:** DesignSync project `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd` (`crew/sections.jsx`, `crew/components.jsx`, `crew/styles.css`).

## Global Constraints

- **UI-only.** `components/crew/**`, `components/atoms/Avatar.tsx`, `lib/crew/**`, `DESIGN.md`, crew tests. NO projection/parser/sync/migration/API change.
- **Synchronous Server Components.** No `'use client'`, no `async`, no `new Date()` inside a section (the frozen `today: Date` prop is threaded from `CrewShell`).
- **Tailwind v4 stretch trap (DESIGN §7):** `.flex` does NOT default to `align-items:stretch`; every split-wide grid carries `min-[720px]:items-stretch` + each column `min-w-0` + each `SectionCard` is `h-full`.
- **Breakpoint:** the project uses `min-[720px]:` arbitrary variants (NOT `md:` — intentionally absent, `app/globals.css:190-196`).
- **Sentinel-hiding** routes through `shouldHideGenericOptional` (`lib/visibility/emptyState`) at the READ site (the `_metaSentinelHidingContract` test walks `components/crew/`).
- **Avatar palette (DESIGN.md-defined, AA-measured, ALL ≥6:1 on white):** orange `#9A4A00` (6.26), green `#1B6B43` (6.50), blue `#2657B0` (6.83), violet `#6A40C0` (6.76), rose `#A1322C` (6.98), teal `#136B6B` (6.28), amber `#86591A` (6.07), slate `#515763` (7.26, also the blank-name fallback).
- **Commit per task**, conventional commits (`feat(crew):`/`refactor(crew):`/`test(crew):`/`docs(design):`).
- **Re-verify every subagent test claim yourself** (the fresh-worktree-hallucination lesson — node_modules IS installed here).

## Meta-test inventory

- `tests/components/tiles/_metaSentinelHidingContract.test.ts` — must keep passing (walks `components/crew/`; restructured DayCard/PersonRow/FactRows keep field access at the read site).
- **NEW** `tests/crew/agendaDisplay-single-source.test.ts` — asserts both `ScheduleSection` and `TodaySection` import the displayable-entry predicate + `RunOfShowList` from the shared module (no duplicated predicate).
- **NEW** real-browser `tests/e2e/crew-layout-dimensions.spec.ts` — all split-wide sections incl. Today Mode A.
- No new §12.4 codes; no DB/RPC/advisory-lock surface (N/A).

## Test paths (LIVE-VERIFIED 2026-06-19 — use these EXACT paths; they SUPERSEDE any inline path elsewhere in this plan)

The repo's test naming is **case-sensitive** (CI is Linux) and not uniform — verified via `rg --files`. Use exactly:
- **avatarColor** (Task 1): `tests/crew/avatarColor.test.ts` (the `tests/crew/` dir exists, e.g. `tests/crew/resolveKeyTimes.test.ts`). ✓
- **agenda-display single-source** (Task 3): `tests/crew/agendaDisplay-single-source.test.ts`. ✓
- **Avatar** (Task 2): `tests/components/atoms/Avatar.test.tsx` (NOT `tests/atoms/`). EXISTING — extend it.
- **Schedule** (Task 3/4): the live Schedule suites are `tests/components/crew/sections/ScheduleSection.test.tsx` + `.agenda` + `.anchorFloor` + `.caps` + `.fieldGuards` (NOT a `components/.../__tests__/` dir). Run them all to confirm the §9 contracts stay green.
- **DayCard + KeyValueRows** (Task 4/6): tested in the COMBINED `tests/components/crew/primitives.test.tsx` — UPDATE the DayCard cases there for the new badge structure (the old vertical-card assertions will change) + add the badge cases there (or a new `tests/components/crew/dayCard.test.tsx` stated as new — camelCase; do NOT use a PascalCase `DayCard.test.tsx`).
- **PersonRow** (Task 5): `tests/components/crew/personRow.test.tsx` (camelCase, EXISTING — extend; NOT `PersonRow.test.tsx`).
- **FactRows** (Task 6, new): `tests/components/crew/factRows.test.tsx` (camelCase, new).
- **CrewSubNav** (Task 8.5): `tests/components/crew/crewSubNav.test.tsx` (camelCase, EXISTING — extend; NOT `CrewSubNav.test.tsx`).
- **Travel/Crew/Venue/Today sections** (Task 7/8/9): `tests/components/crew/sections/{TravelSection,CrewSection,VenueSection,TodaySection}.test.tsx` (EXISTING). The Today Mode-A NEW tests: `tests/components/crew/sections/TodaySection.modeA.test.tsx`.
- **date-badge** (Task 4, if a `dayBadgeParts` unit test): `tests/format/` (the `tests/format/` dir holds the date helper tests).
- **layout-dimensions** (Task 10): `tests/e2e/crew-layout-dimensions.spec.ts` (Playwright project).
- **jest-dom convention (CONFIRMED Task 2 — `globals: false`):** the project runs Vitest with `globals: false`, so the bare `import "@testing-library/jest-dom"` throws `expect is not defined`. Match the EXISTING crew test convention (e.g. `tests/components/crew/personRow.test.tsx:1`): start each `.test.tsx` with `// @vitest-environment jsdom`, then `import "@testing-library/jest-dom/vitest";` (the vitest entrypoint), and `afterEach(cleanup)`. Do NOT use the bare `@testing-library/jest-dom` import the inline snippets below show — use the `/vitest` entrypoint + the environment comment.

Every task's `git add` + `pnpm vitest run` command MUST use the path from this table. Before committing each task, the implementer runs `rg --files | rg <name>` to confirm.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `DESIGN.md` | §1 avatar carve-out + palette | Modify |
| `lib/crew/avatarColor.ts` | deterministic name→swatch | **Create** |
| `components/atoms/Avatar.tsx` | colored 40px avatar | Modify |
| `lib/crew/agendaDisplay.ts` | `isDisplayableEntry`/`displayableEntries`/`RUN_OF_SHOW_DISPLAY_CAP` | **Create** (move from ScheduleSection) |
| `components/crew/primitives/RunOfShowList.tsx` | `RunOfShowList`/`RunOfShowEntry` | **Create** (move from ScheduleSection) |
| `components/crew/sections/ScheduleSection.tsx` | import the shared module; date-badge DayCard | Modify |
| `components/crew/primitives/DayCard.tsx` | horizontal date badge + phase dot + Today pill | Modify |
| `components/crew/primitives/PersonRow.tsx` | icon-only 44px contact buttons | Modify |
| `components/crew/primitives/FactRows.tsx` | horizontal mini-icon `.kvrow` fact list | **Create** |
| `components/crew/sections/VenueSection.tsx` | FactRows + mini-icons + 2-line address | Modify |
| `components/crew/sections/TravelSection.tsx` | travelrows + split-wide ratio | Modify |
| `components/crew/sections/CrewSection.tsx` | split-wide ratio | Modify |
| `components/crew/sections/TodaySection.tsx` | gated Today Mode A | Modify |
| `components/crew/CrewSubNav.tsx` | desktop centering + per-section icons; mobile icons | Modify |
| `components/crew/icons/` (verify) | phone/mail/dock/car/wifi + section (home/calendar/mapPin/plane/users/box/receipt) glyphs | Verify/Create |

---

## Task 1: DESIGN.md avatar amendment + `avatarColor` + contrast test

**Files:** Modify `DESIGN.md`; Create `lib/crew/avatarColor.ts`, `tests/crew/avatarColor.test.ts`.

**Interfaces — Produces:** `avatarColor(name: string): string` (a hex from the 8-swatch palette, deterministic per normalized name; blank → slate `#515763`). `AVATAR_PALETTE: readonly string[]` (the 8 hexes). Consumed by Task 2.

- [ ] **Step 1: Write the failing tests** (`tests/crew/avatarColor.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { avatarColor, AVATAR_PALETTE } from "@/lib/crew/avatarColor";

// WCAG relative-luminance contrast vs #FFFFFF white avatar text.
function contrastVsWhite(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  return 1.05 / (L + 0.05);
}

describe("avatarColor", () => {
  it("every palette swatch clears WCAG AA (>=4.5:1) on white text", () => {
    expect(AVATAR_PALETTE).toHaveLength(8);
    for (const hex of AVATAR_PALETTE) {
      expect(contrastVsWhite(hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("is deterministic per name (stable across calls)", () => {
    expect(avatarColor("John Carleo")).toBe(avatarColor("John Carleo"));
  });
  it("varies by name (not all the same swatch)", () => {
    const names = ["John Carleo", "Alex Rodrigues", "Doug Larson", "Kari Rose", "Eric Weiss"];
    expect(new Set(names.map(avatarColor)).size).toBeGreaterThan(1);
  });
  it("is case/space-insensitive (same person, same color)", () => {
    expect(avatarColor("  john   carleo ")).toBe(avatarColor("John Carleo"));
  });
  it("blank/whitespace name → slate fallback", () => {
    expect(avatarColor("")).toBe("#515763");
    expect(avatarColor("   ")).toBe("#515763");
  });
  it("returns a member of the palette", () => {
    expect(AVATAR_PALETTE).toContain(avatarColor("Anybody"));
  });
});
```

- [ ] **Step 2: Run — verify it fails.** `pnpm vitest run tests/crew/avatarColor.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `lib/crew/avatarColor.ts`:

```ts
/**
 * lib/crew/avatarColor.ts — deterministic per-name avatar swatch.
 *
 * DESIGN.md §1 amendment (2026-06-19): identity avatars (crew/contacts) carry a
 * per-person color from this fixed palette; the single-orange accent rule still
 * governs all other chrome. Every swatch is pre-measured ≥4.5:1 against #FFFFFF
 * white avatar text (the avatarColor.test.ts contrast assertion is the CI guard).
 * The color is derived from the NAME (stable per person across renders/sessions),
 * never from a render index. Blank/whitespace → the slate swatch.
 */
export const AVATAR_PALETTE = [
  "#9A4A00", // orange  6.26
  "#1B6B43", // green   6.50
  "#2657B0", // blue    6.83
  "#6A40C0", // violet  6.76
  "#A1322C", // rose    6.98
  "#136B6B", // teal    6.28
  "#86591A", // amber   6.07
  "#515763", // slate   7.26 (also the blank-name fallback)
] as const;

const SLATE = "#515763";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function avatarColor(name: string): string {
  const n = normalize(name);
  if (n.length === 0) return SLATE;
  // FNV-1a-ish stable string hash → palette index.
  let h = 2166136261;
  for (let i = 0; i < n.length; i += 1) {
    h ^= n.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}
```

- [ ] **Step 4: Run — verify pass.** `pnpm vitest run tests/crew/avatarColor.test.ts` → PASS.

- [ ] **Step 5: Amend `DESIGN.md` §1.** Add an explicit carve-out paragraph after the single-accent rule: identity avatars (crew/contacts) use a deterministic per-name color from the 8-swatch palette above (list the hexes + the AA ratios); the single-orange accent still governs buttons/pills/links/focus/hero/all other chrome; `lib/crew/avatarColor.ts` is the single source + `tests/crew/avatarColor.test.ts` is the AA guard. (Do NOT prettier the surrounding DESIGN.md.)

- [ ] **Step 6: Commit.**

```bash
git add DESIGN.md lib/crew/avatarColor.ts tests/crew/avatarColor.test.ts
git commit -m "feat(crew): deterministic AA avatar palette + DESIGN.md identity-avatar amendment"
```

---

## Task 2: Colored 40px `Avatar`

**Files:** Modify `components/atoms/Avatar.tsx`; Modify/extend `tests/components/atoms/Avatar.test.tsx` (or create if absent).

**Interfaces — Consumes:** `avatarColor` (Task 1). Avatar gains a colored background + white text + 40px size; `name` prop unchanged. **First verify** Avatar's consumers: `grep -rl "components/atoms/Avatar" components/ app/` — if `CrewTile`/`ContactsTile` still exist (not deleted), they also consume it; the size bump to 40px applies to PersonRow's context — if shared consumers need 32px, add an optional `size?: 32 | 40` prop defaulting to 40 and pass 32 from any legacy consumer. (Most likely the legacy tiles were deleted in the Phase-1/4 migration — verify with the grep; if Avatar is crew-only, bump directly to 40px.)

- [ ] **Step 1: Write the failing test** — assert the rendered avatar has the per-name color as an inline `background-color` style and white text, and renders the initials:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Avatar } from "@/components/atoms/Avatar";
import { avatarColor } from "@/lib/crew/avatarColor";

describe("Avatar — colored", () => {
  it("applies the deterministic per-name background color", () => {
    const { getByTestId } = render(<Avatar name="John Carleo" />);
    const el = getByTestId("avatar");
    expect(el).toHaveStyle({ backgroundColor: avatarColor("John Carleo") });
    expect(el.textContent).toBe("JC");
  });
  it("blank name → slate fallback + '?'", () => {
    const { getByTestId } = render(<Avatar name="" />);
    expect(getByTestId("avatar")).toHaveStyle({ backgroundColor: "#515763" });
    expect(getByTestId("avatar").textContent).toBe("?");
  });
});
```

(Note: this test file needs `import "@testing-library/jest-dom"` — `tests/setup.ts` does NOT import jest-dom globally; add the import at the top of the test file, matching the existing crew component tests.)

- [ ] **Step 2: Run — verify it fails.** `pnpm vitest run tests/components/atoms/Avatar.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — change the Avatar body: `size-10` (40px, or the verified size prop), `text-white`, drop `bg-surface-sunken`/`text-text-strong`/`border`, and set `style={{ backgroundColor: avatarColor(name ?? "") }}`. Keep `aria-hidden`, `deriveInitials`, `data-testid="avatar"`. Import `avatarColor`. (The white-on-color is AA per Task 1; no border needed since the color is a distinct surface.)

```tsx
import { avatarColor } from "@/lib/crew/avatarColor";
// ... in Avatar():
  const initials = deriveInitials(name);
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      style={{ backgroundColor: avatarColor(name ?? "") }}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-sm font-semibold text-white"
    >
      {initials}
    </span>
  );
```

- [ ] **Step 4: Run — verify pass + no avatar regressions.** `pnpm vitest run tests/components/atoms/Avatar.test.tsx` + any `tests/components/crew/**` that snapshot the avatar. Re-run the sentinel meta-test: `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts`.

- [ ] **Step 5: Commit.**

```bash
git add components/atoms/Avatar.tsx tests/components/atoms/Avatar.test.tsx
git commit -m "feat(crew): color avatars per-name + 40px (mock fidelity)"
```

---

## Task 3: Shared-module extraction (the Today-trust-boundary structural defense)

**Files:** Create `lib/crew/agendaDisplay.ts`, `components/crew/primitives/RunOfShowList.tsx`, `tests/crew/agendaDisplay-single-source.test.ts`; Modify `components/crew/sections/ScheduleSection.tsx`.

**Interfaces — Produces (moved verbatim from `ScheduleSection.tsx`):** `lib/crew/agendaDisplay.ts` exports `isDisplayableEntry(entry: AgendaEntry): boolean`, `displayableEntries(entries: AgendaEntry[] | undefined): AgendaEntry[]`, `RUN_OF_SHOW_DISPLAY_CAP = 20`, the small field helpers (`resolveOptionalField`), AND `aggregateDays(dates: ShowRow["dates"]): ScheduleDay[]` + the `ScheduleDay`/`SchedulePhase` types (moved from `ScheduleSection.tsx:190-217` — Today's Task-9 show-day membership check reuses `aggregateDays` so both sections key off the SAME day aggregate). `components/crew/primitives/RunOfShowList.tsx` exports `RunOfShowList({ entries, isoDate })`. Both `ScheduleSection` (Task 3) and `TodaySection` (Task 9) import them. **Pure move — behavior identical.**

- [ ] **Step 1: Write the single-source guard test** (`tests/crew/agendaDisplay-single-source.test.ts`) — fails until both sections import from the shared module:

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const SHARED = "@/lib/crew/agendaDisplay";
const RENDERER = "@/components/crew/primitives/RunOfShowList";

function src(p: string): string {
  return readFileSync(p, "utf8");
}

describe("agenda-display single source (Today/Schedule privacy-contract drift guard)", () => {
  it("the shared module exports the predicate + cap", () => {
    const m = src("lib/crew/agendaDisplay.ts");
    expect(m).toMatch(/export function isDisplayableEntry/);
    expect(m).toMatch(/export function displayableEntries/);
    expect(m).toMatch(/export const RUN_OF_SHOW_DISPLAY_CAP/);
  });
  it("ScheduleSection imports the predicate from the shared module (no local copy)", () => {
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).toContain(SHARED);
    expect(s).not.toMatch(/function isDisplayableEntry/); // moved out, not redefined
  });
  it("TodaySection imports the SAME predicate + renderer from the shared module", () => {
    const t = src("components/crew/sections/TodaySection.tsx");
    expect(t).toContain(SHARED);
    expect(t).toContain(RENDERER);
    expect(t).not.toMatch(/function isDisplayableEntry/);
  });
});
```

(Note: the TodaySection assertion will fail until Task 9 — that's expected; this task makes the first two pass and Task 9 makes the third pass. State this dependency in the commit. To keep Task 3 green-on-commit, scope THIS task's test to the first two `it`s and add the TodaySection `it` in Task 9. Implementer: include only the Schedule + shared-module assertions here.)

- [ ] **Step 2: Run — verify it fails.** `pnpm vitest run tests/crew/agendaDisplay-single-source.test.ts` → FAIL.

- [ ] **Step 3: Create `lib/crew/agendaDisplay.ts`** — move `isDisplayableEntry`, `displayableEntries`, `RUN_OF_SHOW_DISPLAY_CAP`, `resolveOptionalField`, `TITLE_TRUNCATE_AT`, AND `aggregateDays` + the `ScheduleDay`/`SchedulePhase` types verbatim from `ScheduleSection.tsx:54-88,190-217` (exporting `isDisplayableEntry`, `displayableEntries`, `RUN_OF_SHOW_DISPLAY_CAP`, `aggregateDays`, `ScheduleDay`, `SchedulePhase`). Keep imports (`AgendaEntry`, `ShowRow`, `shouldHideGenericOptional`, `stripAgendaUrls`). The single-source guard test (Step 1) also asserts `export function aggregateDays`.

- [ ] **Step 4: Create `components/crew/primitives/RunOfShowList.tsx`** — move `RunOfShowEntry` + `RunOfShowList` verbatim from `ScheduleSection.tsx:95-188`, importing `displayableEntries`/`RUN_OF_SHOW_DISPLAY_CAP`/`resolveOptionalField`/`TITLE_TRUNCATE_AT` from `@/lib/crew/agendaDisplay`. Export `RunOfShowList`.

- [ ] **Step 5: Refactor `ScheduleSection.tsx`** — delete the moved symbols (`isDisplayableEntry`/`displayableEntries`/`RUN_OF_SHOW_DISPLAY_CAP`/`resolveOptionalField`/`TITLE_TRUNCATE_AT`/`RunOfShowEntry`/`RunOfShowList`/`aggregateDays`/`ScheduleDay`/`SchedulePhase`); import `displayableEntries` + `aggregateDays` + `ScheduleDay` from `@/lib/crew/agendaDisplay` + `RunOfShowList` from the new primitive. The render at `:272,320-322` calls the imported `aggregateDays`/`displayableEntries`/`RunOfShowList` unchanged.

- [ ] **Step 6: Run — verify Schedule is unregressed (the §9 contract tests 32+34 + the new guard's first two `it`s).**

Run: `pnpm vitest run tests/crew/agendaDisplay-single-source.test.ts tests/components/crew/sections/ScheduleSection*.test.tsx` (use the actual Schedule test path) + `pnpm tsc --noEmit`.
Expected: PASS (pure move; date-restriction + today-pin contracts intact).

- [ ] **Step 7: Commit.**

```bash
git add lib/crew/agendaDisplay.ts components/crew/primitives/RunOfShowList.tsx components/crew/sections/ScheduleSection.tsx tests/crew/agendaDisplay-single-source.test.ts
git commit -m "refactor(crew): extract run-of-show predicate+renderer to a shared module (Today drift guard)"
```

---

## Task 4: Schedule `DayCard` → horizontal date badge

**Files:** Modify `components/crew/primitives/DayCard.tsx`, `components/crew/sections/ScheduleSection.tsx` (pass the ISO + phase as today); Create/extend `tests/components/crew/dayCard.test.tsx`.

**Interfaces — Consumes:** the ISO date string + `phase` ("Travel In"|"Set"|"Show"|"Travel Out") + `today` boolean. **Produces:** a horizontal badge row. ScheduleSection passes `day={day.date}` (the ISO) — DayCard derives the badge parts via a new `formatIsoDate(iso, "day-badge")` mode OR an inline UTC splitter (matching `lib/format/date.ts` UTC handling). Define a `dayBadgeParts(iso): { dow: string; dnum: string }` in `lib/format/date.ts` (UTC, weekday short + numeric day) so the TZ handling is single-sourced.

- [ ] **Step 1: Write the failing tests** (`tests/components/crew/dayCard.test.tsx`) — assert the badge (dow + dnum), the phase-tone dot, and the Today pill:

```tsx
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayCard } from "@/components/crew/primitives/DayCard";

describe("DayCard — date badge", () => {
  it("renders a stacked weekday + day-number badge from the ISO date (UTC)", () => {
    const { getByTestId } = render(<DayCard day="2026-06-12" phase="Travel In" today={false} />);
    const badge = getByTestId("day-card-date");
    expect(badge.textContent).toContain("FRI"); // 2026-06-12 is a Friday (UTC)
    expect(badge.textContent).toContain("12");
  });
  it("Show phase gets the accent tone dot; today gets the Today pill + data-today", () => {
    const { getByTestId, getByText } = render(<DayCard day="2026-06-14" phase="Show" today={true} />);
    expect(getByTestId("day-card")).toHaveAttribute("data-today", "true");
    expect(getByText("Today")).toBeInTheDocument();
    expect(getByTestId("day-card-phase-dot")).toHaveAttribute("data-tone", "show");
  });
  it("Travel phase → travel tone; no Today pill when not today", () => {
    const { getByTestId, queryByText } = render(<DayCard day="2026-06-12" phase="Travel Out" today={false} />);
    expect(getByTestId("day-card-phase-dot")).toHaveAttribute("data-tone", "travel");
    expect(queryByText("Today")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm vitest run tests/components/crew/dayCard.test.tsx` → FAIL.

- [ ] **Step 3: Add `dayBadgeParts` to `lib/format/date.ts`:**

```ts
export function dayBadgeParts(iso: string): { dow: string; dnum: string } {
  if (iso === "") return { dow: "", dnum: "" };
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { dow: "", dnum: iso };
  return {
    dow: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }).toUpperCase(),
    dnum: d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" }),
  };
}
```

- [ ] **Step 4: Rewrite `DayCard`** to the mock's horizontal form (`.day` = date badge | vline | phase+meta | Today pill). Map phase→tone (`travel`/`set`/`show`). Use `@theme` tokens; the set tone `#caa53a` is an inline style (no token). Full component:

```tsx
import type { ReactNode } from "react";
import { dayBadgeParts } from "@/lib/format/date";

type DayCardProps = { day: string; phase: "Travel In" | "Set" | "Show" | "Travel Out"; today: boolean; meta?: ReactNode };

const TONE: Record<DayCardProps["phase"], "travel" | "set" | "show"> = {
  "Travel In": "travel", "Travel Out": "travel", Set: "set", Show: "show",
};

export function DayCard({ day, phase, today, meta }: DayCardProps) {
  const { dow, dnum } = dayBadgeParts(day);
  const tone = TONE[phase];
  return (
    <div
      data-testid="day-card"
      {...(today ? { "data-today": "true" } : {})}
      className={[
        "flex items-center gap-4 rounded-md border p-3",
        today ? "border-accent bg-stale-tint" : "border-border bg-surface",
      ].join(" ")}
    >
      <div data-testid="day-card-date" className="flex w-[50px] shrink-0 flex-col items-center">
        <span className={["text-xs font-bold uppercase tracking-eyebrow", today ? "text-accent-on-bg" : "text-text-faint"].join(" ")}>{dow}</span>
        <span className="mt-0.5 text-[23px] font-extrabold leading-none -tracking-[0.03em] text-text-strong">{dnum}</span>
      </div>
      <span className="h-full w-px self-stretch bg-border" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-text-strong">
          <span
            data-testid="day-card-phase-dot"
            data-tone={tone}
            aria-hidden="true"
            className={["size-[7px] shrink-0 rounded-full", tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong"].join(" ")}
            style={tone === "set" ? { backgroundColor: "#caa53a" } : undefined}
          />
          {phase}
        </span>
        {meta != null ? <span data-slot="day-card-meta" className="text-xs text-text-subtle">{meta}</span> : null}
      </div>
      {today ? <span className="shrink-0 rounded-pill bg-accent-wash px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-accent-on-bg">Today</span> : null}
    </div>
  );
}
```

(Verify `bg-accent-wash` exists in `@theme`; if absent, use `bg-stale-tint` or add the token. The implementer confirms via grep before committing — undefined tokens silently fall back, caught only by the impeccable real-browser gate.)

- [ ] **Step 5:** ScheduleSection already passes `day={day.date}` (ISO) + `phase={day.phase}` + `today={isToday}` (`:315`) — confirm the `phase` union type matches; no day-card call-site change beyond the prop type.

- [ ] **Step 6: Schedule right column → "Daily call times" SectionCard (Codex plan R2 MEDIUM — a spec delta).** The right column is currently a NAKED `<KeyTimesStrip anchors={anchors} />` + the rooms-error tile (`ScheduleSection.tsx:330-337`). Per the spec, wrap the key-times in a `SectionCard title="Daily call times"` so it reads as the mock's `Tile "Daily call times"` card (and the split-wide equal-height invariant holds — a bare strip vs a card breaks the `items-stretch` parity). Preserve the empty-anchor behavior: when `KeyTimesStrip` returns null (all anchors absent), render NO card (no empty "Daily call times" shell). **Class-sweep with the Crew one-sided fix (Codex plan R2):** when the right column would have NO content (no "Daily call times" card AND no rooms-error tile), collapse the section to a single full-width days column (don't render the 2-track grid with a blank right track) — same rule as Task 8. Do NOT invent the mock's separate "Heads up" card (fixture-only — no real data source). Write failing tests first: (a) anchors present → the right column renders a `SectionCard` titled "Daily call times" containing the key-times; (b) all anchors absent + no rooms error → no card AND the grid collapses to single-column (no blank right track); the existing §9 tests (which use shows WITH anchors) stay green.

- [ ] **Step 7: Run — verify pass + Schedule unregressed.** `pnpm vitest run tests/components/crew/dayCard.test.tsx <ScheduleSection test>` + `pnpm tsc --noEmit`.

- [ ] **Step 8: Commit.**

```bash
git add components/crew/primitives/DayCard.tsx lib/format/date.ts components/crew/sections/ScheduleSection.tsx tests/components/crew/dayCard.test.tsx
git commit -m "feat(crew): Schedule date badge + phase dot + Today pill + Daily-call-times card"
```

---

## Task 5: `PersonRow` icon-only 44px contact buttons

**Files:** Modify `components/crew/primitives/PersonRow.tsx`; extend `tests/components/crew/personRow.test.tsx`.

**Interfaces:** unchanged props. The Call/Email anchors become **icon-only** 44px-square tap targets (the mock `.cbtn`): keep the `aria-label` (already present) + the `tel:`/`mailto:` href + the sentinel gate; remove the visible "Call"/"Email" text spans; swap the unicode `☎`/`✉` for the project's phone/mail SVG icons (**verify the icon source**: `grep -rl "phone\|mail" components/icons components/atoms 2>/dev/null` — if a crew/shared SVG icon set exists, use it; else keep the unicode glyph but sized + centered in the 44px square. Do NOT invent an icon import that doesn't exist).

- [ ] **Step 1: Write the failing test** — assert each contact control is a 44px-square icon-only button with an accessible name + the right href, and no visible "Call"/"Email" text:

```tsx
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PersonRow } from "@/components/crew/primitives/PersonRow";

describe("PersonRow — icon-only contact buttons", () => {
  it("renders icon-only phone + email controls with accessible names and no visible label text", () => {
    const { getByLabelText, container } = render(
      <ul><PersonRow person={{ name: "Jane Doe", phone: "610-456-0711", email: "jane@x.com" }} /></ul>,
    );
    const call = getByLabelText("Call Jane Doe");
    const email = getByLabelText("Email Jane Doe");
    expect(call).toHaveAttribute("href", "tel:6104560711");
    expect(email).toHaveAttribute("href", "mailto:jane@x.com");
    // icon-only: no literal "Call"/"Email" text node
    expect(container.textContent).not.toContain("Call");
    expect(container.textContent).not.toContain("Email");
  });
  it("dead/sentinel contacts render no control (unchanged gate)", () => {
    const { queryByLabelText } = render(
      <ul><PersonRow person={{ name: "X", phone: "TBD", email: "N/A" }} /></ul>,
    );
    expect(queryByLabelText(/Call/)).toBeNull();
    expect(queryByLabelText(/Email/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm vitest run tests/components/crew/personRow.test.tsx` → FAIL (current renders "Call"/"Email" text).

- [ ] **Step 3: Implement** — change `ACTION_CLASS` to a 44px square (`size-tap-min` / `h-tap-min w-tap-min`, `justify-center`, `rounded-[11px]`) and the anchors to render ONLY the glyph (drop `<span className="truncate">Call</span>`/`Email`), keeping `aria-label`. Use the verified icon (SVG component sized ~18px, or the unicode glyph centered). Example anchor:

```tsx
<a href={`tel:${digitsOnly(person.phone ?? "")}`}
   className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-[11px] border border-border bg-surface text-text-subtle transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken hover:text-accent-on-bg"
   aria-label={`Call ${actionTarget}`}>
  <PhoneIcon className="size-[18px]" aria-hidden="true" />
</a>
```

(`size-tap-min` = 44px if a `--spacing-tap-min` utility resolves to `size-`; else use `h-[44px] w-[44px]`. Verify.)

- [ ] **Step 4: Run — verify pass + sentinel meta-test.** `pnpm vitest run tests/components/crew/personRow.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts`.

- [ ] **Step 5: Commit.**

```bash
git add components/crew/primitives/PersonRow.tsx tests/components/crew/personRow.test.tsx
git commit -m "feat(crew): icon-only 44px contact buttons (mock .cbtn)"
```

---

## Task 6: `FactRows` primitive + Venue mini-icon fact rows

**Files:** Create `components/crew/primitives/FactRows.tsx`, `tests/components/crew/FactRows.test.tsx`; Modify `components/crew/sections/VenueSection.tsx`. Verify/create dock/car/wifi SVG icons.

**Interfaces — Produces:** `FactRows({ rows }: { rows: { k: string; v: string; sub?: string; icon?: ReactNode }[] })` — the mock's horizontal `.kvrow`: a bordered list where each row is `k` (with an optional 28px sunken mini-icon square + label) on the LEFT and `v` (+ optional `sub` below) RIGHT-aligned. Sentinel-gated like `KeyValueRows`. **This is the horizontal counterpart to the existing vertical `KeyValueRows`** (the mock uses both — `.kv` grid for compact pairs, `.kvrow` for icon+sub fact lists). Consumed by Venue here; Schedule's "Daily call times" + Travel hotel may adopt it in their tasks if the reviewer flags the vertical form as a fidelity gap (keep this task scoped to Venue + the primitive).

- [ ] **Step 1: Write the failing test** (`tests/components/crew/FactRows.test.tsx`): assert a row renders k-label + value + sub, the mini-icon square is present when `icon` is passed, and a sentinel value omits the row. (Model on `KeyValueRows.test.tsx`.)

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement `FactRows`** mirroring the mock `.kvrow`: `<dl>` with rows `flex items-center justify-between gap-3.5 border-b border-border py-3` (first `pt-0`, last `border-b-0 pb-0`); `.k` = `flex items-center gap-2.5 text-sm text-text-subtle` with the mini-icon in a `size-7 rounded-md bg-surface-sunken grid place-items-center text-text-subtle` square (glyph 15px); `.v` = `text-sm font-semibold text-text text-right` with `.sub` = `block text-xs text-text-faint`. Sentinel-filter via `shouldHideGenericOptional(row.v)`.

- [ ] **Step 4: Verify/create the dock/car/wifi icons** — `grep` the icon set; create minimal SVG glyph components if absent (matching the mock's `crew/components.jsx` `dock`/`car`/`wifi` paths).

- [ ] **Step 5: Rewrite VenueSection's Parking + venue-status fact rows** to a single `FactRows` (Loading dock / Parking / Crew Wi-Fi / power, each with its mini-icon + sub where the data provides one), and the Address to a 2-line form (street line 1, city muted line 2). Preserve the sentinel gates + the COI special row. Keep the `[1.6fr_1fr]` grid (already correct).

- [ ] **Step 6: Run — verify pass + Venue section test + sentinel meta-test + tsc.**

- [ ] **Step 7: Commit.**

```bash
git add components/crew/primitives/FactRows.tsx components/crew/sections/VenueSection.tsx components/crew/icons/ tests/components/crew/FactRows.test.tsx
git commit -m "feat(crew): mock .kvrow FactRows + Venue mini-icon fact rows"
```

---

## Task 7: Travel travelrows + split-wide ratio

**Files:** Modify `components/crew/sections/TravelSection.tsx`; extend its test.

**Interfaces:** the "Getting there" driver/vehicle/leg rows render as the mock's `.travelrow` (a 34px sunken mini-icon + a `tcol` of `tlabel`/`tprimary`/`tmeta`/`tconf`); the 2-col grid ratio `min-[720px]:grid-cols-2` → `min-[720px]:grid-cols-[1.6fr_1fr]` (`:369`, getting-there wide-left, hotel narrow-right). The hotel card already uses `KeyValueRows` + name/address (`:257-333`) — confirm it matches the mock's structured form (name 17px + address + check-in/out/room/confirmation); only restyle if a real gap (the screenshot run-on was stale-deploy). The full-width flight block (DEF-FLIGHT-1) above the grid stays.

- [ ] **Step 1: Write the failing test** — assert a getting-there leg renders a `.travelrow`-shaped node (a mini-icon + a primary line + a meta line), and that the 2-col grid uses the 1.6fr/1fr classes (assert the wrapper className). Model on the existing TravelSection test.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — wrap each driver/vehicle/leg into a `travelrow` (mini icon by mode: flight→plane, ground→car; `tlabel` = the stage eyebrow, `tprimary` = the date/primary, `tmeta` = time/with-names, `tconf` = confirmation/sub, tabular-nums). Change the grid class to `min-[720px]:grid-cols-[1.6fr_1fr]`.

- [ ] **Step 4: Run — verify pass + tsc + sentinel meta-test.**

- [ ] **Step 5: Commit.** `feat(crew): Travel itinerary rows + split-wide ratio (mock .travelrow)`

---

## Task 8: Crew split-wide ratio

**Files:** Modify `components/crew/sections/CrewSection.tsx`; extend its test.

**Interfaces:** the 2-col wrapper `min-[720px]:flex-row` (50/50 flex, `:131`) → a split-wide grid, **but conditional on BOTH columns being present** (Codex plan R2 MEDIUM). Crew can render with only roster (`hasCrew`) OR only contacts (`hasContacts`) — the current branch suppresses the wrapper only when BOTH are empty, so each column renders independently. A fixed `grid-cols-[1.6fr_1fr]` with one child would occupy the left 1.6fr track and leave a BLANK right column at ≥720px. So: `const bothColumns = hasCrew && hasContacts;` and the wrapper class is `bothColumns ? "grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-stretch" : "flex flex-col gap-4"` (single full-width column when only one side has data). Each grid child is `min-w-0` (drop `flex-1` in the two-column case). Avatars are colored via Task 2 (no change here).

- [ ] **Step 1: Write the failing tests** — (1) BOTH columns present → wrapper uses `grid-cols-[1.6fr_1fr]` (not `flex-row`); (2) crew-only fixture (contacts empty) → wrapper is NOT a 2-track grid (no `grid-cols-[1.6fr_1fr]`), the single Show-crew column renders full-width; (3) contacts-only fixture → same single-column treatment. (Class-level asserts; the real-browser one-sided check is added in Task 10's fixtures.)
- [ ] **Step 2: Run — verify fail.**
- [ ] **Step 3: Implement** the conditional wrapper (`bothColumns` branch). Keep each column's existing `hasCrew`/`hasContacts` gate + `min-w-0`.
- [ ] **Step 4: Run — verify pass + tsc + sentinel meta-test.**
- [ ] **Step 5: Commit.** `feat(crew): Crew split-wide ratio (two-sided) with full-width fallback for one-sided data`

---

## Task 8.5: Sub-nav chrome — desktop centering + per-section icons, mobile icons

**Files:** Modify `components/crew/CrewSubNav.tsx`; Create/verify section icon glyphs (`components/crew/icons/`); extend `tests/components/crew/crewSubNav.test.tsx`.

**Interfaces:** the desktop `<nav>` (`CrewSubNav.tsx:116-121`) gains a centered inner container that **matches the actual `_CrewShell` page container** (`app/show/[slug]/[shareToken]/_CrewShell.tsx:316` = `mx-auto w-full max-w-300 px-4 sm:px-8` on `[data-testid="page-container"]`) — NOT the mock's literal `1120px` (`max-w-300` = the project's 1200px-class container token). Source the SAME utility string (`mx-auto w-full max-w-300 px-4 sm:px-8`), or extract a shared `CREW_PAGE_CONTAINER` class constant that both `_CrewShell` and the nav import, so the first tab's left edge aligns with the section content's left edge. Each tab gains a 16px (desktop) / 22px (mobile) per-section icon. **Produces:** `SECTION_ICON: Record<SectionId, (props) => JSX.Element>` — Today→`home`, Schedule→`calendar`, Venue→`mapPin`, Travel→`plane`, Crew→`users`, Gear→`box`, Budget→a receipt/dollar glyph. **Preserve** the URL allow-list (`navigate`, `:65-79`), `aria-current="page"`, the 44px tap floor, `data-testid="crew-sub-nav"` + `data-section`, the `min-[720px]:` pivot. Icons `aria-hidden="true"`.

- [ ] **Step 1: Verify/create the section icons.** `grep -rln "mapPin\|plane\|users\|calendar" components/ 2>/dev/null` — if the project has a shared icon set with these glyphs, reuse it; else create minimal SVG glyph components in `components/crew/icons/sectionIcons.tsx` from the mock's `crew/components.jsx` paths (I have them: home/calendar/mapPin/plane/users(=people)/box; Budget→a `receipt`/`dollar` glyph). Each is a `({ className }) => <svg viewBox="0 0 24 24" stroke="currentColor" …/>`.

- [ ] **Step 2: Write the failing tests** (extend `tests/components/crew/crewSubNav.test.tsx`):
  1. the desktop nav row is wrapped in a centered container using the REAL `_CrewShell` page-container utilities — assert the wrapper carries `max-w-300` (and `mx-auto`/`px-4`/`sm:px-8`), OR, if the shared `CREW_PAGE_CONTAINER` constant is extracted, assert the wrapper className equals that constant. **Do NOT assert `max-w-[1120px]`** (that is the mock's literal, not the impl container — asserting it would force the wrong implementation back in).
  2. each desktop tab renders an icon (an `svg`) before its label.
  3. each mobile tab renders an icon above its label (the icon `svg` present in the mobile `flex-col` tab).
  4. (regression) the existing URL allow-list + `aria-current` tests still pass (don't modify them).

- [ ] **Step 3: Run — verify fail.**

- [ ] **Step 4: Implement.** Add the centered container to the desktop `<nav>`: wrap the tab row in `<div className="mx-auto flex w-full max-w-300 px-4 sm:px-8 …">` (the verbatim `_CrewShell.tsx:316` container utils — `max-w-300 px-4 sm:px-8`; do NOT use `max-w-[1120px]` or a clamp). Better: extract the shared container util into a `CREW_PAGE_CONTAINER` constant in a shared module and import it in both `_CrewShell` and `CrewSubNav` so they can't drift. Add `SECTION_ICON[id]` to each tab: desktop = 16px icon before the label (`size-4`), active → `text-accent-on-bg`; mobile = 22px icon (`size-[22px]`) above the label, active → `text-accent`. Keep every existing class/attr.

- [ ] **Step 5: Run — verify pass + the full CrewSubNav suite + tsc + screenshots note.** `pnpm vitest run tests/components/crew/crewSubNav.test.tsx` + `pnpm tsc --noEmit`. (Real-browser centering is asserted in Task 10.)

- [ ] **Step 6: Commit.** `feat(crew): center desktop sub-nav + per-section icons (desktop 16px, mobile 22px)`

---

## Task 9: Today Mode A — gated run-of-show (reuses the shared module)

**Files:** Modify `components/crew/sections/TodaySection.tsx`; Create `tests/components/crew/sections/TodaySection.modeA.test.tsx`; extend the single-source guard (Task 3's third `it`).

**Interfaces — Consumes:** `resolveViewerContext` (`@/lib/data/viewerContext` — already imported in TodaySection), `todayIsoInShowTimezone` (`@/lib/visibility/packList`), `displayableEntries` + `RunOfShowList` (`@/lib/crew/agendaDisplay` + the new primitive, Task 3). TodaySection already receives `today: Date` (currently unused) + `data`/`viewer`/`showId`. **No `new Date()`.**

**The gate (exact contract from `ScheduleSection.tsx`):**
- `const { dateRestriction } = resolveViewerContext(viewer, data)` (already have `ctx`).
- `dateRestriction.kind === "unknown_asterisk"` → **Mode B** (current stack; NO timeline).
- `const todayIso = todayIsoInShowTimezone(data.show, today)`.
- **Show-day membership (Codex plan R1 HIGH — required precondition).** `const isShowDay = aggregateDays(data.show.dates).some((d) => d.date === todayIso)`. Uses the SAME `aggregateDays` source Schedule uses (extracted to the shared module in Task 3). This guards against a stale/malformed `runOfShow` key whose date is NOT one of THIS show's days (travelIn/set/showDays/travelOut) — without it a `none` viewer would render a run-of-show for any `runOfShow[todayIso]` key.
- eligible = `dateRestriction.kind === "none"` OR (`kind === "explicit"` AND `new Set(dateRestriction.days).has(todayIso)`).
- `const todays = displayableEntries(data.runOfShow?.[todayIso])`.
- **Mode A** iff `isShowDay && eligible && todays.length > 0` → render `min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-stretch`: LEFT a `SectionCard` "Run of show" containing `<RunOfShowList entries={data.runOfShow![todayIso]!} isoDate={todayIso} />`; RIGHT the existing Tonight/Where/Need-something cards STACKED (`flex flex-col gap-3`). Else **Mode B** (the current full-width stack, unchanged).
- Fail-closed: any ambiguity (not a show day, ineligible, unresolved restriction, empty filter) → Mode B.

- [ ] **Step 1: Write the failing tests** (`tests/components/crew/sections/TodaySection.modeA.test.tsx`) — build a `ShowForViewer` fixture (via the typed `makeShowForViewer` builder in `tests/fixtures/showForViewer.ts`) with `runOfShow[todayIso]` populated:
  1. **unknown_asterisk timeline-leak test (scoped to THIS change):** viewer `unknown_asterisk`, today is a show day with a populated `runOfShow[todayIso]` INCLUDING hotel check-in/out dates in the fixture → Today renders Mode B with **NO run-of-show timeline** — assert absent `[data-testid="run-of-show-<iso>"]` and NO `[data-testid="agenda-entry"]` nodes (the agenda/timeline never renders for `unknown_asterisk`). **Scope note (Codex plan R3 HIGH):** the test asserts the TIMELINE/agenda does not leak — it does NOT assert "no date text anywhere," because the EXISTING Mode B Tonight card already renders `firstHotel.check_in`/`check_out` (`TodaySection.tsx:164-165`) for all viewers including `unknown_asterisk`. That pre-existing hotel-date exposure is a SEPARATE, broader privacy question NOT introduced by this UI-fidelity pass — **file `BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES`** (BACKLOG.md, same commit) for a dedicated review of whether `unknown_asterisk` should also suppress the Tonight/Where date rows; do NOT silently expand this pass's scope to change the existing Tonight-card contract.
  2. **eligible Mode A:** `none` viewer, today ∈ show days with displayable entries → the `run-of-show-<todayIso>` container renders left, the quick-cards render right; the split-wide grid class present.
  3. **TZ boundary:** a fixture where UTC date ≠ show-tz date (evening America/Chicago show already "tomorrow" UTC) + a frozen `today` → Mode A/B keys off the SHOW-tz ISO (assert the rendered run-of-show is today's show-tz day, not the UTC day).
  4. **wrapped/empty:** no `runOfShow` → Mode B.
  5. **non-show-day key (Codex plan R1 HIGH):** a `none` viewer where `runOfShow[todayIso]` is POPULATED with displayable entries but `todayIso` is NOT in `aggregateDays(data.show.dates)` (a stale/off-aggregate key) → Today stays Mode B (no `run-of-show-<iso>` container; the off-aggregate agenda never renders).

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** the gate + the two-mode render. Resolve `dateRestriction` + `todayIso` at the top of the render closure; branch Mode A/B. Reuse `RunOfShowList`. Add the `RunOfShowList`/`agendaDisplay` imports.

- [ ] **Step 4: Extend Task 3's guard** — add the TodaySection `it` (imports the shared module, no local predicate) to `tests/crew/agendaDisplay-single-source.test.ts`.

- [ ] **Step 5: Run — verify pass + the full Today + Schedule + sentinel suite + tsc.**

- [ ] **Step 6: Commit.** `feat(crew): Today gated run-of-show Mode A (shared predicate, show-tz, fail-closed)`

---

## Task 10: Real-browser layout-dimensions gate (all split-wide incl. Today Mode A)

**Files:** Create `tests/e2e/crew-layout-dimensions.spec.ts` (Playwright). **Real browser — jsdom is NOT sufficient.**

**Interfaces:** renders each crew section (via the crew preview route / a seeded data-rich show with an eligible viewer + populated `runOfShow[todayIso]`) at **≥720px** and **390px**, and asserts via `getBoundingClientRect()`:
- For each split-wide section (Schedule, Venue, Travel, Crew, **Today Mode A**): at ≥720px the left column width ≈ 1.6 × right column (±2px) AND both columns equal height (items-stretch); at 390px both columns stack (single column, full width, no horizontal overflow / no clip).
- The Schedule date badge `[data-testid="day-card-date"]` is 50px wide; an `[data-testid="avatar"]` is 40px square.
- **Sub-nav centering (Task 8.5):** at ≥720px, measure the desktop sub-nav's first `[data-section]` tab's left edge and assert it aligns (±2px) with the LEFT content edge of `[data-testid="page-container"]` (the real `_CrewShell` container, `max-w-300 px-4 sm:px-8`) — NOT a hardcoded 1120px — the "off-center" fix. And each tab contains an `svg` icon (assert at desktop ≥720px and mobile 390px).

- [ ] **Step 1: Write the spec** — use the existing crew screenshot/e2e harness pattern (`tests/e2e/screenshots-help-setup.ts` crew arm / the preview route with a picker-cookie crew session; reuse the `ENABLE_TEST_AUTH` fixture). Derive expected ratios from the rendered rects (no hardcoded px beyond the 50/40 badge/avatar + the ±2px tolerance). The Today Mode A fixture must seed an eligible viewer + `runOfShow[todayIso]` so Mode A actually mounts.

- [ ] **Step 2: Run** against a real browser (Playwright project): `pnpm exec playwright test tests/e2e/crew-layout-dimensions.spec.ts`. Iterate until green. (If the harness can't easily seed Mode A, render the section component directly in a Playwright component-test or a minimal route — the assertion MUST run in a real browser, per DESIGN §7 + the jsdom-insufficiency rule.)

- [ ] **Step 3: Commit.** `test(crew): real-browser layout-dimensions gate (split-wide incl. Today Mode A)`

---

## Task 11: Self-review → Adversarial review (cross-model) → impeccable dual-gate → Execution handoff

- [ ] **Self-review** (this checklist, inline): spec coverage (every spec §-delta → a task), placeholder scan, type consistency (the `phase` union, `avatarColor` signature, the shared-module exports match across Tasks 3/4/9), and confirm every cited `file:line` still resolves (re-grep).
- [ ] **Adversarial review (cross-model, MANDATORY).** Invoke the Codex adversarial review on the whole plan; iterate to APPROVE before execution.
- [ ] **impeccable dual-gate** (invariant 8) runs at CLOSE-OUT on the implemented diff (critique AND audit, v3 preflight incl. the DESIGN.md avatar amendment) — BEFORE the Codex whole-branch impl review + before merge. The real-browser render also confirms the stale-deploy `&#10;`/ISO are NOT present in current code.
- [ ] **Execution handoff:** subagent-driven, Opus subagents per task (UI hard rule), TDD per task, re-verify each subagent's test claims yourself; then close-out: impeccable → Codex whole-branch → CI (x1/x2/structural/screenshots-drift — NOTE: this touches crew render surfaces, so **screenshots-drift baselines must regenerate** via the amd64 docker per the byte-comparison discipline) → merge → sync main.

## Out of scope (tracked separately)

The `&#10;` literal entity + raw ISO dates on the validation deploy are **stale-deploy/stale-data artifacts** (current code decodes at `lib/parser/blocks/_helpers.ts:60` + formats at `lib/format/date.ts`). Resolution = re-sync the validation show + redeploy, then re-screenshot. NOT a code change in this plan.
