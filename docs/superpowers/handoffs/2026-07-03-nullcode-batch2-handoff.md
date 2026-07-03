# BL-NULLCODE-STAMP-BATCH-2 — Handoff / close-out

**Date:** 2026-07-03
**Branch:** `fix/nullcode-forensic-batch2`
**Spec:** `docs/superpowers/specs/2026-07-03-nullcode-forensic-batch2-design.md`
**Plan:** `docs/superpowers/plans/2026-07-03-nullcode-forensic-batch2-plan.md`

Stamps a forensic `code:` field on 35 null-code `log.error`/`log.warn` sites so they persist to `app_events` as queryable, groupable rows. Pure observability enrichment — each edit adds one `code:` field to an existing 2nd-arg fields object; zero behavior change. Registered in `NEW_FORENSIC_CODES`; proven by an AST guard that reads the same surface `lib/log/logger.ts` persists (top-level `code` of the 2nd argument) plus runtime emission spies.

## §12 — UI close-out (impeccable v3 dual-gate)

**Invariant 8** applies by path: 10 of the 35 sites live in `app/` non-api files (UI surface). The dual-gate was **run** on the affected diff (not asserted N/A) via the impeccable critique methodology's two independent, isolated assessments.

**Scope:** 10 sites across **3 `app/` non-api files**:
- `app/admin/actions.ts` — 1 site (`ADMIN_RESOLVE_CANONICAL_EMAIL_NULL`)
- `app/admin/show/[slug]/page.tsx` — 8 sites (`ADMIN_SHOW_*`)
- `app/show/[slug]/[shareToken]/_CrewShell.tsx` — 1 site (`CREW_PROJECTION_ALERT_UPSERT_FAILED`)

**Critique (design-director lens — visual hierarchy, AI-slop, cognitive load, Nielsen heuristics, typography, color, states, microcopy):**
- **Verdict: PASS — no HIGH/CRITICAL, no findings of any severity.**
- Every one of the 10 hunks adds a `code:` string to a server-side `log.error`/`log.warn` inside a data-loader/guard catch block. No JSX, DOM, CSS, design token, visible copy, component state, interaction, or accessibility is touched. Branches still throw (→ unchanged error boundary / catalog copy) or return a typed data result; the `code` field never reaches a component prop or the DOM. AI-slop verdict: N/A (no visual change). Invariant-5 (no raw codes in UI) not implicated — these codes go to `app_events`, not the screen.

**Audit (technical lens — a11y, performance, theming, code quality, responsive):**
- **Verdict: PASS — no HIGH/CRITICAL, no findings of any severity.**
- Accessibility: no surface touched (no ARIA/form/alt/contrast/DOM change). Performance: no render path/hooks/animation/client code altered; server catch-block logs never reach the client bundle. Theming: no colors/tokens/CSS/dark-mode. Code quality: net-positive additive telemetry, consistent `source`/`code`/`error` shape, SHOUTY_SNAKE codes matching the null-code-stamp convention; no logic/control-flow/contract change; fail-quiet/fail-open behavior preserved. Responsive: no layout/breakpoint change.
- These are async Server Component / Server Action catch-block logs (no `"use client"`), out of scope for a11y/perf/theming regressions by construction.

**Dispositions:** Both gates PASS with zero findings. No HIGH/CRITICAL to fix or `DEFERRED.md`-log. The clean result is the recorded disposition, consistent with the change being server-side observability plumbing with zero rendering delta. The two assessments were run independently and isolated per the critique methodology.

## BACKLOG (spec §9)
- `BL-SCAN-SSE-BODY-NULL-CODE` — `scan/route.ts` SSE result body emits a user-facing `code:null`; separate user-facing surface, deferred (needs a §12.4 code + 3-way).
- `BL-PICKER-TAMPER-ADMIN-ALERT` — whether `selectIdentity.ts:56` tamper breadcrumb should also raise an `admin_alerts` upsert (this batch is forensic-log-only).
