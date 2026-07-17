# DEVTIER-1 — Developer-toggle help copy (spec)

**Status:** design converged; autonomous ship (both user gates waived per AGENTS.md).
**Date:** 2026-07-17
**Deferral resolved:** `DEFERRED.md` DEVTIER-1 (Developer tier — impeccable gate, 2026-07-04, P2).

## Problem

The per-row Developer toggle (`components/admin/settings/DeveloperToggleButton.tsx`) renders only a bare "Developer" label (`:146` interactive arm / `:112` locked arm). Granting the developer bit unlocks:

- **Developer-only nav items** (Activity, etc.) — hidden for non-developers by `components/admin/nav/AdminNav.tsx:62` (`NAV.filter((item) => !item.developerOnly || viewerIsDeveloper)`; safe-default `viewerIsDeveloper = false` at `:38`).
- **The Dev-tools row** (Maintenance / Diagnostics entry) — `components/admin/settings/DevToolsRow.tsx:30` (`if (!DEV_PANEL_PRESENT || !isDeveloper) return null;`).
- **The power to promote/demote other admins' developer bit** — `setDeveloperAction` gated by `requireDeveloperIdentity()` (`app/admin/settings/admins/developerActions.ts:22`).

…with **no inline explanation of that blast radius**. The sibling privilege help on the same heading — the Administrators `HoverHelp` (`components/admin/settings/AdministratorsSection.tsx:86-97`) — says nothing about the Developer toggle. Surfaced as impeccable **critique P2** on branch `feat/developer-tier` (`DEFERRED.md` DEVTIER-1).

## Scope (single change)

Extend the **existing** developer-branch copy of the Administrators-heading `HoverHelp` with one sentence naming what the Developer toggle grants. No new UI element, no new component, no new testid, no per-row repetition, no DB/route/API change.

### Exact copy edit

`AdministratorsSection.tsx:93-95` — the ternary already forks on `viewerIsDeveloper`. Only the **developer** arm changes; the non-developer arm is untouched.

Before (developer arm, `:94`):

> People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own.

After:

> People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own. The Developer toggle grants full developer access: Activity, Maintenance, and Diagnostics, plus making other admins developers.

- Curly apostrophe `’` (U+2019) matches the existing string. No em dash (impeccable absolute ban); the sentence uses `:` and `,` only.
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

The two positive/absence tests assert the copy at **clause granularity**, not by prefix — a prefix-only match (`/The Developer toggle grants full developer access/`) would let an implementation drop the concrete privilege list and still pass, only partially closing DEVTIER-1 (Codex R1 finding). The blast-radius list IS the fix, so the test pins it.

Define one shared constant in the test module:

```
const GRANT_COPY =
  "The Developer toggle grants full developer access: Activity, Maintenance, and Diagnostics, plus making other admins developers.";
const GRANT_CLAUSES = ["Activity", "Maintenance", "Diagnostics", "making other admins developers"];
```

1. **Developer viewer → full grant sentence + every clause present.** `render(<AdministratorsSection … viewerIsDeveloper={true} />)`; the `HoverHelp` body stays in the DOM when closed (`HoverHelp.tsx` SR contract). Assert the **exact** full sentence resolves — locate the heading help paragraph (scope to `getByTestId("admins-help")`'s owned body, not the whole tree) and assert its `textContent` **contains `GRANT_COPY` verbatim**; then assert each of `GRANT_CLAUSES` appears in that same paragraph. Failure mode caught: wrong ternary arm, dropped sentence, OR a shortened sentence that omits a privilege (e.g. drops "Diagnostics" or "making other admins developers").
2. **Non-developer viewer → grant sentence + every clause ABSENT, non-developer copy present.** `viewerIsDeveloper={false}`; assert `queryByText((_, el) => el?.textContent?.includes(GRANT_COPY) ?? false)` is `null`, assert **none** of `GRANT_CLAUSES` appear via the developer sentence (scope the absence to the heading help paragraph so an unrelated "Activity" nav string elsewhere can't false-pass — clone/scope per the anti-tautology rule), AND the non-developer copy (`/Roster changes are managed by a developer/`) is present. Failure mode caught: the sentence (or any clause of it) leaks to the non-developer arm — violates the user-ratified developer-only constraint.

Both derive expected text from the single `GRANT_COPY`/`GRANT_CLAUSES` constants, and the implementation string in `AdministratorsSection.tsx:94` must equal `GRANT_COPY` — one source of truth, no drift between test and code.

## Also in this branch (housekeeping)

Mark `DEFERRED.md` **BELL-4** ✅ RESOLVED-STALE: the redesign (PR #343) already tokenized the panel max-heights (`--spacing-panel-max` / `--spacing-panel-max-mobile`, now 3 consumers — the "single consumer" premise is void) and the DevFooter number inputs already carry `min-h-tap-min` + `w-20` (a standard scale utility, not an arbitrary bracket). No code change; doc-only mark. Committed separately from the DEVTIER-1 change.

## Out of scope

- **DEVTIER-2** (ON-track accent fill contrast) — RESOLVED 2026-07-16 (accent-contrast token pass).
- Per-toggle adjacent help, persistent subtitle, column header — considered and rejected (per-row repetition / redundant second help mechanism on one heading). Single-source developer-arm extension chosen.
- Any change to `DeveloperToggleButton.tsx`, the toggle's `aria-label`, or the switch mechanics.
