# DEVTIER-1 — Developer-toggle help copy (spec)

**Status:** design converged; autonomous ship (both user gates waived per AGENTS.md).
**Date:** 2026-07-17
**Deferral resolved:** `DEFERRED.md` DEVTIER-1 (Developer tier — impeccable gate, 2026-07-04, P2).

## Problem

The per-row Developer toggle (`components/admin/settings/DeveloperToggleButton.tsx`) renders only a bare "Developer" label. Granting the developer bit gives that admin Activity nav + Maintenance + Diagnostics + the Dev-tools row + the power to promote/demote other admins' developer status — with **no inline explanation of that blast radius**. Sibling privilege surfaces carry help (the Administrators `HoverHelp` at `components/admin/settings/AdministratorsSection.tsx:86-97`, `NotifyToggle` description). Surfaced as impeccable **critique P2** on branch `feat/developer-tier`.

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
2. The Developer toggle it describes is itself developer-only (`AdministratorsSection.tsx:224-230`, gated on `viewerIsDeveloper`; safe-default `viewerIsDeveloper=false`, `:37/:47`), verified server-side absent for normal admins (`AdminNav:36`, `DevToolsRow:30`).

So only a viewer who can actually use the toggle ever sees the grant explanation. This is the core acceptance criterion.

## Guard conditions

- **`viewerIsDeveloper` false / omitted:** developer arm not rendered → grant sentence absent (asserted). Non-developer copy unchanged.
- **`result.kind === "infra_error"`:** the early-return branch (`:55-79`) renders the cataloged `ADMIN_EMAIL_LIST_FAILED` copy and never reaches the heading `HoverHelp` — unaffected.
- **Empty active list:** heading (and its `HoverHelp`) still render; grant copy still developer-gated. Unaffected.

## Invariant / contract check

- **Invariant 5 (no raw error codes in UI):** N/A — this is static UI chrome copy, not an error path; no code literal introduced.
- **Invariant 8 (impeccable dual-gate):** IN SCOPE — `AdministratorsSection.tsx` is under `components/`. `/impeccable critique` + `/impeccable audit` run on the diff; P0/P1 fixed or deferred. Copy-only, no visual/layout/token/transition change.
- **Dimensional invariants / Transition inventory:** N/A — no layout, no state machine, no animated element added (copy inside an existing `HoverHelp` body that already stays in-DOM).
- **DB / CHECK / enum / flag-lifecycle matrices:** N/A — no DB, config, or flag touched.
- **Meta-test inventory:** none created/extended. The no-inline-email and no-raw-codes scanners are unaffected (no email normalization, no code literal). Declared: "None applies — copy-only change to an existing developer-gated string."

## Tests (TDD)

New assertions in `tests/components/admin/settings/AdministratorsSection-developer.test.tsx` (has both `viewerIsDeveloper` true/false render helpers):

1. **Developer viewer → grant sentence present.** `render(<AdministratorsSection … viewerIsDeveloper={true} />)`; the `HoverHelp` body stays in the DOM when closed (`HoverHelp.tsx` SR contract), so assert `getByText(/The Developer toggle grants full developer access/)` resolves. Failure mode caught: someone edits the wrong ternary arm or drops the sentence.
2. **Non-developer viewer → grant sentence ABSENT.** `viewerIsDeveloper={false}`; assert `queryByText(/Developer toggle grants full developer access/)` is `null` AND the non-developer copy (`/Roster changes are managed by a developer/`) is present. Failure mode caught: the sentence leaks to the non-developer arm (violates the user-ratified developer-only constraint). This is the anti-tautology guard — it pins visibility to the audience, not just "text exists somewhere."

## Also in this branch (housekeeping)

Mark `DEFERRED.md` **BELL-4** ✅ RESOLVED-STALE: the redesign (PR #343) already tokenized the panel max-heights (`--spacing-panel-max` / `--spacing-panel-max-mobile`, now 3 consumers — the "single consumer" premise is void) and the DevFooter number inputs already carry `min-h-tap-min` + `w-20` (a standard scale utility, not an arbitrary bracket). No code change; doc-only mark. Committed separately from the DEVTIER-1 change.

## Out of scope

- **DEVTIER-2** (ON-track accent fill contrast) — RESOLVED 2026-07-16 (accent-contrast token pass).
- Per-toggle adjacent help, persistent subtitle, column header — considered and rejected (per-row repetition / redundant second help mechanism on one heading). Single-source developer-arm extension chosen.
- Any change to `DeveloperToggleButton.tsx`, the toggle's `aria-label`, or the switch mechanics.
