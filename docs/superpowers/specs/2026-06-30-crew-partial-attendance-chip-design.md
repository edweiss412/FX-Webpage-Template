# Partial-attendance chip on the crew roster + review modal — Design Spec

**BL:** `BL-CREW-PARTIAL-ATTENDANCE-CHIP` (INFO-tab audit). **Routing:** UI → Opus + impeccable v3 dual-gate (invariant 8). **Class:** PARSED-NOT-RENDERED. **Render-only** — no parser / DB / projection change.

## Goal

A crew member written as `(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` / `***` in the sheet has that suffix stripped into a `date_restriction` that drives **their own** schedule, but no roster surface shows it to teammates — so the crew can't see who's only on-site some days. Render a small chip ("Oct 7 & 9 only") from `date_restriction` next to the role on (1) the crew roster (`CrewSection` → `PersonRow`) and (2) the Step-3 review modal (`CrewBreakdown`).

## Background / recon grounding

`DateRestriction` is a 3-kind union (`lib/parser/types.ts:24-27`):
- `{ kind: "explicit"; days: string[] }` — the restricted days.
- `{ kind: "unknown_asterisk"; days: null }` — `***` crew: restricted but dates unknown (`crew.ts:329-341`).
- `{ kind: "none" }` — unrestricted.

It lives on **both** shapes, with a key difference in `days`:
- **ParseResult** (the modal's data): `CrewMemberRow.date_restriction` (snake_case, `types.ts:83`); `explicit.days` are **raw `M/D` tokens** (e.g. `["10/7","10/9"]`, no year — `personalization.ts` `extractDateTokens`).
- **ShowForViewer** (the crew page's data): `crewMembers[].dateRestriction` (camelCase, `getShowForViewer.ts:138`); `explicit.days` are **normalized to ISO `YYYY-MM-DD`** via `normalizeDateRestriction` (`getShowForViewer.ts:413-420`).

**Every member's restriction is projected** — `readCrewMembers` selects the full roster by `show_id` with NO viewer filter (`getShowForViewer.ts:392-396`), each row carrying its own normalized `dateRestriction`. So a per-member chip can render for the whole roster (not just the viewer). The crew page already consumes ISO `dateRestriction.days` downstream (`agendaDisplay.ts:104-109`, `resolveKeyTimes.ts`, `rightNow.ts`).

## Resolved Decisions

1. **Render-only, both surfaces.** Crew roster (`CrewSection`/`PersonRow`) + Step-3 modal (`CrewBreakdown`). No parser/DB/projection change.

2. **Not viewer-gated.** Partial-attendance is a coordination aid (the BL: "show who is partial-attendance to **teammates**"). The chip renders for every roster member regardless of who's viewing — consistent with the roster being projected unfiltered. (It is not PII the way transport/budget is; it's "which days is this teammate here.")

3. **Shared label helper.** `lib/crew/partialAttendance.ts` → `partialAttendanceLabel(restriction, { humanize })`: one source of truth for both surfaces, differing only in day-formatting:
   - `kind === "none"` (or null/undefined) → `null` (no chip).
   - `kind === "unknown_asterisk"` → `"Partial (dates TBD)"`.
   - `kind === "explicit"` with ≥1 non-empty day → `"<list> only"`, where `<list>` = `humanizeDayList(days)` when `humanize` (crew, ISO days → "Oct 7 & 9") or `days.join(", ")` when not (modal, raw `M/D` tokens → "10/7, 10/9", shown as-parsed). `explicit` with empty/all-blank days → `null`.

4. **New date helper `humanizeDayList`.** `humanizeDayRange` (`humanize.ts:62-84`) collapses a list to a contiguous range using only first+last (`[Oct7,Oct9] → "Oct 7–9"`, falsely implying the 8th) — unusable for non-contiguous partial days. Add `humanizeDayList(isos)` that lists each day, repeating the month only when it changes, joined with `, ` and ` & ` before the last: `[2025-10-07,2025-10-09] → "Oct 7 & 9"`; `[…07,…09,…11] → "Oct 7, 9 & 11"`; cross-month `[…10-30,…11-02] → "Oct 30 & Nov 2"`; single → "Oct 7"; empty/all-malformed → `null` (malformed ISO entries skipped, like `humanizeDayRange`).

5. **Crew = chip (pill); modal = inline segment.** The crew roster uses `PersonRow`'s chip system (a new `partial` prop → a `CHIP_CLASS` pill beside You/Lead/Primary). The modal `CrewBreakdown` renders a plain inline `· <label>` segment matching its existing name·role·phone idiom (it's a dense as-parsed review list, not a `PersonRow`).

## Shared module — `lib/crew/partialAttendance.ts`

```ts
import type { DateRestriction } from "@/lib/parser/types";
import { humanizeDayList } from "@/lib/dates/humanize";

/**
 * Chip label for a crew member's partial-attendance restriction, or null when
 * there's nothing to show (kind "none"). One source of truth for the crew
 * roster (humanize=true — ISO days → "Oct 7 & 9 only") and the Step-3 review
 * modal (humanize=false — raw "M/D" tokens shown as-parsed → "10/7, 10/9 only").
 * (BL-CREW-PARTIAL-ATTENDANCE-CHIP)
 */
export function partialAttendanceLabel(
  restriction: DateRestriction | null | undefined,
  opts: { humanize: boolean },
): string | null {
  if (!restriction || restriction.kind === "none") return null;
  if (restriction.kind === "unknown_asterisk") return "Partial (dates TBD)";
  // explicit
  const days = (restriction.days ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  if (days.length === 0) return null;
  const list = opts.humanize ? humanizeDayList(days) : days.join(", ");
  return list ? `${list} only` : null;
}
```

## New helper — `lib/dates/humanize.ts` `humanizeDayList`

```ts
/**
 * List ISO show-days as a compact label, repeating the month only when it
 * changes: "Oct 7 & 9", "Oct 7, 9 & 11", "Oct 30 & Nov 2", "Oct 7". Malformed
 * entries are skipped; empty / all-malformed → null. (Distinct from
 * humanizeDayRange, which collapses to a first–last contiguous range.)
 */
export function humanizeDayList(
  isos: Array<string | null | undefined> | null | undefined,
): string | null {
  if (!Array.isArray(isos)) return null;
  const valid = isos.map(parseYmd).filter((v): v is Ymd => v !== null);
  if (valid.length === 0) return null;
  const parts: string[] = [];
  let prevMonth: number | null = null;
  for (const ymd of valid) {
    parts.push(ymd.month === prevMonth ? `${ymd.day}` : `${MONTHS[ymd.month - 1]} ${ymd.day}`);
    prevMonth = ymd.month;
  }
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}
```
(`parseYmd`, `Ymd`, `MONTHS` are the existing private helpers in `humanize.ts`.)

## Surface 1 — crew roster (`CrewSection` → `PersonRow`)

`PersonRow` (`components/crew/primitives/PersonRow.tsx`): add an optional `partial?: string` to the `Person` type (`:47-66`); when present, render a chip beside the You/Lead/Primary chips (`:154-166`) using the shared `CHIP_CLASS` (`:79-85`) with the neutral tone `"bg-surface-sunken text-text-subtle"` (same as Lead/Primary), and stamp a `data-partial="true"` hook on the `<li>` (`:135-137`).

```tsx
{partial ? (
  <span className={[CHIP_CLASS, "bg-surface-sunken text-text-subtle"].join(" ")}>{partial}</span>
) : null}
```

`CrewSection` (`components/crew/sections/CrewSection.tsx:175-184`): compute the label and pass it:
```tsx
const partial = partialAttendanceLabel(member.dateRestriction, { humanize: true });
// …in the person={{…}} object:
...(partial ? { partial } : {}),
```
(`member.dateRestriction` is the ISO-normalized projection; `humanize: true`.)

## Surface 2 — Step-3 review modal (`CrewBreakdown`)

`components/admin/wizard/Step3SheetCard.tsx` `CrewBreakdown` (`:397-422`) — the per-member `<li>` renders `name · role · phone` (PR #199). Add a partial segment after the phone, computed once in the map callback:
```tsx
const partial = partialAttendanceLabel(m.date_restriction, { humanize: false });
// …after the phone span:
{partial ? <span className="text-text-subtle"> · {partial}</span> : null}
```
(`m.date_restriction` is the raw-`M/D` ParseResult shape; `humanize: false` → as-parsed "10/7, 10/9 only", consistent with the modal's as-parsed contract.)

## Guard conditions (every input)

- `dateRestriction`/`date_restriction` `kind: "none"` (the fixture default) → `partialAttendanceLabel` returns null → no chip / no segment.
- `unknown_asterisk` (days null) → "Partial (dates TBD)" chip/segment (the `days ?? []` guard means the null `days` never throws).
- `explicit` with `days: []` or all-blank → null (no chip).
- Malformed ISO day on the crew surface (e.g. a bad token survived normalization) → `humanizeDayList` skips it; if all malformed → null → no chip.
- Modal raw tokens are shown verbatim (as-parsed) — no year completion, no humanization (a `"TBD"`-ish token would show as-is, matching the review surface).
- A member missing `dateRestriction` entirely (defensive — projection always sets it, default `{kind:"none"}`) → `!restriction` guard → null.

## Dimensional invariants

N/A. The crew chip is a `CHIP_CLASS` pill inside `PersonRow`'s existing `flex-wrap` chip row (`:154-166`) — the same primitive + container the You/Lead/Primary chips already use, with no new fixed-dimension parent. The modal segment is an inline `<span>` in the existing `<li>` flow. No new parent→child dimension relationship; nothing to assert with a real-browser layout test beyond what `PersonRow` already guarantees (`CHIP_CLASS` carries `max-w-full truncate` for the 390px narrow-column case).

## Transition inventory

N/A. Both surfaces are static server-rendered output; the chip's presence is a pure data-driven render (no client state, no `AnimatePresence`/ternary-animated/conditional-motion element added). Instant — no animation.

## Cross-cutting touchpoints

- **No new card-id / CARD_REGION_MAP / SourceLink** — the chip is a sub-element of an existing card/section, not a new card.
- **`_metaSentinelHidingContract`** — the chip label comes from `partialAttendanceLabel` (which already returns null for the empty case), NOT a raw optional string field; `PersonRow`/`CrewSection` add no new raw optional-text render that the sentinel meta-test would require to route through `shouldHideGenericOptional`. Confirm it stays green (the `partial` prop is a pre-computed label, not `member.someField` rendered raw). No `GENERIC_OPTIONAL_FIELDS` entry needed (the value is a derived label, not a sheet free-text field).
- **Affordance-matrix** (help-only) — N/A.
- **DESIGN.md** — add a short note to the Crew section / chip inventory documenting the partial-attendance chip (a new chip variant in the `PersonRow` chip family).
- **Invariant 8:** `/impeccable critique` + `/impeccable audit` on the diff (crew `components/` + admin modal are UI surfaces); HIGH/CRITICAL fixed or `DEFERRED.md`; dispositions in the PR description.

## Meta-test inventory

- **Creates** unit tests for `humanizeDayList` + `partialAttendanceLabel` (pure helpers). **No** structural meta-test created/extended (no auth/DB/advisory-lock/admin-alert/card-id surface). Advisory-lock / Supabase call-boundary: N/A.

## Test plan (anti-tautology; derive expectations from inputs, not hardcoded magic)

1. **`humanizeDayList`** (humanize unit test file): `["2025-10-07","2025-10-09"] → "Oct 7 & 9"`; `[…07,…09,…11] → "Oct 7, 9 & 11"`; cross-month `["2025-10-30","2025-11-02"] → "Oct 30 & Nov 2"`; single `["2025-10-07"] → "Oct 7"`; `[] → null`; `["garbage","2025-10-07"] → "Oct 7"` (one malformed skipped); **`["garbage"] → null` (ALL-malformed → null, Spec-R1)**; `null/undefined → null`. Failure mode caught: the non-contiguous-collapse bug `humanizeDayRange` has + the all-malformed guard.
2. **`partialAttendanceLabel`** (new unit test): explicit+humanize ISO → "Oct 7 & 9 only"; explicit+raw `["10/7","10/9"]` (humanize:false) → "10/7, 10/9 only"; `unknown_asterisk` → "Partial (dates TBD)" (both humanize modes); `none` → null; explicit `days:[]` → null; **explicit `days:[" ","\t"]` (all-blank) → null (Spec-R1)**; **explicit all-malformed ISO `days:["garbage"]` with humanize:true → null (humanizeDayList returns null → label null, Spec-R1)**; null restriction → null.
3. **Crew roster chip** (`CrewSection.test.tsx`): a member with `dateRestriction:{kind:"explicit",days:["2025-10-07","2025-10-09"]}` → the roster shows a chip containing "Oct 7 & 9 only" + the person-row carries `data-partial`; a `{kind:"none"}` member → no chip / no `data-partial`. Scope to the `crew-person-row`; derive the expected label from the fixture days, not a hardcoded string where avoidable.
4. **Modal chip segment** (`Step3Review.test.tsx`): a `crewMembers[]` member with `date_restriction:{kind:"explicit",days:["10/7","10/9"]}` → `…-breakdown-crew` contains "10/7, 10/9 only" (raw, as-parsed); an `unknown_asterisk` member → "Partial (dates TBD)"; a `{kind:"none"}` member → neither. Scope to the crew breakdown testId.

## Out of scope / deferred

- Year-completing the modal's raw `M/D` tokens (the modal is as-parsed; raw tokens are the honest review signal).
- Any change to how `date_restriction` drives the viewer's own schedule (unchanged).
- A cap/truncation on the day list — bounded by the show's day count (partial attendance is realistically 1–3 days); `CHIP_CLASS` already truncates in ultra-narrow columns, and the chip row wraps. No explicit `+N more`.
- `stage_restriction` (a separate restriction; not in this BL).
