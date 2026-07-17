# DEVTIER-1 — Developer-toggle help copy (spec)

**Status:** design converged; autonomous ship (both user gates waived per AGENTS.md).
**Date:** 2026-07-17
**Deferral resolved:** `DEFERRED.md` DEVTIER-1 (Developer tier — impeccable gate, 2026-07-04, P2).

## Problem

The per-row Developer toggle (`components/admin/settings/DeveloperToggleButton.tsx`) renders only a bare "Developer" label (`:146` interactive arm / `:112` locked arm). Granting the developer bit unlocks:

- **The developer-only "Telemetry" nav item** — hidden for non-developers by `components/admin/nav/AdminNav.tsx:62` (`NAV.filter((item) => !item.developerOnly || viewerIsDeveloper)`; the item is labeled "Telemetry" at `components/admin/nav/navConfig.ts:42`; safe-default `viewerIsDeveloper = false` at `AdminNav.tsx:38`).
- **The developer-only "Maintenance" and "Diagnostics" settings sections** — `app/admin/settings/page.tsx:237` and `:292` (both gated on the developer bit).
- **The "Developer tools" row** — `components/admin/settings/DevToolsRow.tsx:43` (`<h3>Developer tools</h3>`), runtime-gated at `:30` (`if (!DEV_PANEL_PRESENT || !isDeveloper) return null;`).
- **The power to promote/demote other admins' developer bit** — `setDeveloperAction` gated by `requireDeveloperIdentity()` (`app/admin/settings/admins/developerActions.ts:22`).

…with **no inline explanation of that blast radius**. The sibling privilege help on the same heading — the Administrators `HoverHelp` (`components/admin/settings/AdministratorsSection.tsx:86-97`) — says nothing about the Developer toggle. Surfaced as impeccable **critique P2** on branch `feat/developer-tier` (`DEFERRED.md` DEVTIER-1).

## Scope (single change)

Extend the **existing** developer-branch copy of the Administrators-heading `HoverHelp` with one sentence naming what the Developer toggle grants. No new UI element, no new component, no new testid, no per-row repetition, no DB/route/API change.

### Exact copy edit

`AdministratorsSection.tsx:93-95` — the ternary already forks on `viewerIsDeveloper`. Only the **developer** arm changes; the non-developer arm is untouched.

Before (developer arm, `:94`):

> People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own.

After:

> People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own. The Developer toggle grants developer access, including the Telemetry, Maintenance, Diagnostics, and Developer tools areas, plus making other admins developers.

- The four surface names are the **actual UI labels** the developer sees: nav item "Telemetry" (`components/admin/nav/navConfig.ts:42`), settings sections "Maintenance" (`app/admin/settings/page.tsx:237`) and "Diagnostics" (`:292`), and the "Developer tools" row (`components/admin/settings/DevToolsRow.tsx:43`). "…making other admins developers" is the `setDeveloperAction` promote/demote power.
- Curly apostrophe `’` (U+2019) matches the existing string. No em dash (impeccable absolute ban); the sentence uses commas only.
- Non-developer arm (`:95`) unchanged: "…Roster changes are managed by a developer."

## Developer-only visibility (the user-ratified constraint)

The extended copy renders **only for developers**. Two independent gates guarantee it:

1. The sentence lives in the `viewerIsDeveloper ? … : …` **developer arm** (`:93-94`), so the string is not even in the tree for a non-developer viewer.
2. The Developer toggle it describes is itself developer-only (`AdministratorsSection.tsx:224-230`, gated on `viewerIsDeveloper`; safe-default `viewerIsDeveloper = false` at `:37`, prop declared `:47`), and the whole developer surface is absent for normal admins (`AdminNav.tsx:62` nav filter, `DevToolsRow.tsx:30` runtime gate).

So only a viewer who can actually use the toggle ever sees the grant explanation. This is the core acceptance criterion.

## Guard conditions

- **`viewerIsDeveloper` false / omitted:** developer arm not rendered → grant sentence absent (asserted). Non-developer copy unchanged.
- **`result.kind === "infra_error"`:** the early-return branch (`:52`) renders the cataloged `ADMIN_EMAIL_LIST_FAILED` copy and never reaches the heading `HoverHelp` — unaffected.
- **Empty active list:** heading (and its `HoverHelp`) still render; grant copy still developer-gated. Unaffected.

## Invariant / contract check

- **Invariant 5 (no raw error codes in UI):** N/A — this is static UI chrome copy, not an error path; no code literal introduced.
- **Invariant 8 (impeccable dual-gate):** IN SCOPE — `AdministratorsSection.tsx` is under `components/`. `/impeccable critique` + `/impeccable audit` run on the diff; P0/P1 fixed or deferred. Copy-only, no visual/layout/token/transition change.
- **Dimensional invariants / Transition inventory:** N/A — no layout, no state machine, no animated element added (copy inside an existing `HoverHelp` body that already stays in-DOM).
- **DB / CHECK / enum / flag-lifecycle matrices:** N/A — no DB, config, or flag touched.
- **Meta-test inventory:** none created/extended. The no-inline-email and no-raw-codes scanners are unaffected (no email normalization, no code literal). Declared: "None applies — copy-only change to an existing developer-gated string."

## Tests (TDD)

New assertions in `tests/components/admin/settings/AdministratorsSection-developer.test.tsx` (has both `viewerIsDeveloper` true/false render helpers):

The two positive/absence tests assert the copy at **clause granularity**, not by prefix — a prefix-only match (`/The Developer toggle grants developer access/`) would let an implementation drop the concrete privilege list and still pass, only partially closing DEVTIER-1 (Codex R1 finding). The blast-radius list IS the fix, so the test pins it. The copy says "including …" (not "full") — deliberately non-exhaustive: it names the principal developer-only surfaces, not every minor developer-gated behavior (e.g. the bell DevFooter or the AppHealthIndicator deep-link), so the claim stays accurate without enumerating trivia (Codex plan-R1 finding).

Define one shared constant in the test module:

```
const GRANT_COPY =
  "The Developer toggle grants developer access, including the Telemetry, Maintenance, Diagnostics, and Developer tools areas, plus making other admins developers.";
const GRANT_CLAUSES = ["Telemetry", "Maintenance", "Diagnostics", "Developer tools", "making other admins developers"];
```

**Scope target:** `HoverHelp` renders its body as `${testId}-body` (`components/admin/HoverHelp.tsx:182`); with `testId="admins-help"` (`AdministratorsSection.tsx:88`) the copy `<p>` lives in `data-testid="admins-help-body"` (the wrapper is `rootTestId="help-affordance--settings-administrators--tooltip"` at `:89` / `HoverHelp.tsx:154`). There is NO bare `admins-help` node — all assertions read `screen.getByTestId("admins-help-body")`. The body stays in the DOM when closed (`HoverHelp.tsx` SR contract), so no interaction is needed.

1. **Developer viewer → full grant sentence + every clause present.** `render(<AdministratorsSection … viewerIsDeveloper={true} />)`; `const body = screen.getByTestId("admins-help-body")`. Assert `body.textContent` **contains `GRANT_COPY` verbatim**; then assert each of `GRANT_CLAUSES` appears in `body.textContent`. Failure mode caught: wrong ternary arm, dropped sentence, OR a shortened sentence that omits a privilege (e.g. drops "Diagnostics" or "making other admins developers").
2. **Non-developer viewer → grant sentence + every clause ABSENT, non-developer copy present.** `viewerIsDeveloper={false}`; `const body = screen.getByTestId("admins-help-body")` (the heading + help still render in the non-developer arm). Assert `body.textContent` does NOT include `GRANT_COPY` and includes **none** of `GRANT_CLAUSES` — scoping the absence to `admins-help-body` (not the whole document) so an unrelated "Activity"/"Maintenance" string elsewhere in the tree can't false-pass (anti-tautology rule). AND assert `body.textContent` includes the non-developer copy (`Roster changes are managed by a developer`). Failure mode caught: the sentence (or any clause of it) leaks to the non-developer arm — violates the user-ratified developer-only constraint.

Both derive expected text from the single `GRANT_COPY`/`GRANT_CLAUSES` constants, and the implementation string in `AdministratorsSection.tsx:94` must equal `GRANT_COPY` — one source of truth, no drift between test and code.

## Also in this branch (housekeeping)

Mark `DEFERRED.md` **BELL-4** ✅ RESOLVED-STALE: the redesign (PR #343) already tokenized the panel max-heights (`--spacing-panel-max` / `--spacing-panel-max-mobile`, now 3 consumers — the "single consumer" premise is void) and the DevFooter number inputs already carry `min-h-tap-min` + `w-20` (a standard scale utility, not an arbitrary bracket). No code change; doc-only mark. Committed separately from the DEVTIER-1 change.

## Out of scope

- **DEVTIER-2** (ON-track accent fill contrast) — RESOLVED 2026-07-16 (accent-contrast token pass).
- Per-toggle adjacent help, persistent subtitle, column header — considered and rejected (per-row repetition / redundant second help mechanism on one heading). Single-source developer-arm extension chosen.
- Any change to `DeveloperToggleButton.tsx`, the toggle's `aria-label`, or the switch mechanics.
