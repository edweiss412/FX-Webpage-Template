# DEFERRED.md — Crew page redesign Phase 2 (run-of-show / AGENDA)

Deferral discipline (per AGENTS.md): land-now vs DEFERRED (will do, concrete
trigger) vs BACKLOG (might do, speculative). Entries here are **will-do** with a
named trigger.

---

## DEF-P2-1 — `av="NONE"` renders as an emphasized AV badge (impeccable dual-gate, MEDIUM)

**Surface:** `components/crew/sections/ScheduleSection.tsx` — `RunOfShowEntry`, the
`[data-agenda-field="av"]` badge.

**Finding (impeccable critique, 2026-06-19 dual-gate on commits e5545d24 +
09797aa1):** The real East-Coast sheet uses the literal string `"NONE"` for
sessions with no AV. `"NONE"` is NOT in the generic-optional sentinel set
(`'' / TBD / N/A / TBA` — `lib/visibility/emptyState.ts`), so it survives
`resolveOptionalField` and renders as an uppercase grey AV pill identical in
weight to real AV values (`POD`, `FULL AV`). In a 20-row run-of-show day, `NONE`
pills repeat many times, giving "no AV needed" the same visual salience as the
sessions that actually require AV. For glanceable crew UX, a no-AV row should be
*quieter* (or carry no badge at all), so the eye lands on the rows that need
action.

**Why deferred, not fixed in the dual-gate pass:** This is a genuine
product/craft judgment, not an unambiguous defect:

- Suppressing the `NONE` badge at render time is **blocked by a ratified test**:
  `tests/components/crew/sections/ScheduleSection.agenda.test.tsx:50-65` scopes
  its `av` assertion to entry index `[1]` *specifically because* entry `[0]`'s
  `av="NONE"` is expected to render as a real `[data-agenda-field="av"]` element
  ("an unscoped querySelector would match entry 0's 'NONE' first"). The
  field-completeness structural guard
  (`tests/.../ScheduleSection.*field-completeness*`) pins the same contract.
  Hiding `NONE` would break both — that is a spec/test change, not craft polish.
- Whether `NONE` should read as **quiet-absence** (suppress badge) or
  **explicit-status** ("we have confirmed there is no AV for this session", which
  is operationally meaningful to an AV crew) is Doug's call. Both are defensible.

**Concrete trigger to resolve:** During M13 UX-validation with Doug, ask whether
a `NONE` AV value should (a) render no badge, (b) render a de-emphasized
"no AV" treatment distinct from real AV values, or (c) stay as-is. Whichever he
picks, update **(1)** the ratified agenda test's expectation for entry `[0]`,
**(2)** `RunOfShowEntry`'s av branch, and **(3)** — if `NONE` becomes a hide
value — a dedicated `shouldHideAvNone`-style predicate in
`lib/visibility/emptyState.ts` (the module's documented extension pattern: add a
third exported predicate rather than inlining a string check), NOT a broadening
of `shouldHideGenericOptional` (which would wrongly hide `N/A` etc. elsewhere).

**Interim state:** `NONE` renders as a quiet grey pill (same `bg-surface-sunken`
/ `text-text-subtle` as other AV badges). It is truthful and not a blocker; it is
noise, not a defect.
