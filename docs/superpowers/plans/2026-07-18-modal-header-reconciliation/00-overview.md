# Modal Header Reconciliation — Implementation Plan Overview

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the published-show modal's header region in Step 3's frame — a header band carrying identity (title, sheet link, client/date subline, alert pill) and a separate control strip band below the seam carrying live controls (publish toggle, sync status, Re-sync, copy link).

**Spec (canonical):** `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md` — APPROVED by cross-model adversarial review (22 rounds, 2026-07-18). §4.1 / §4.2 / §4.3 are ratified decisions; do NOT relitigate in-plan (see Watchpoints below).

**Design mock:** `docs/superpowers/specs/2026-07-18-modal-header-reconciliation-mock/mock.html`, option `#1a` = the locked target. The two "Today" panels are before-state reference, NOT targets. The mock is dark-only and happy-path-only; spec §7 is the authority for every state it does not draw.

**Base:** worktree `/Users/ericweiss/FX-worktrees/modal-header-reconciliation`, branch `feat/modal-header-reconciliation`, off `origin/main` = `91149861a`. Spec §3.2's 103-row citation appendix was re-verified against this tree during the plan's pre-draft pass — see "Pre-draft verification results" below.

**Tech stack:** Next.js 16 App Router, Tailwind v4, vitest + RTL (jsdom), Playwright (real-browser assertions).

---

## Architecture / sequencing rationale

Bottom-up, so each commit leaves the tree green AND leaves the product coherent:

1. **Shell capability first** (Task 1) — the `subHeader` slot must exist before anything can mount into it, and the Step 3 baseline must be captured on the pre-change tree (§11.2).
2. **Strip prop deletions** (Task 2) — removes dead API and its harness coupling while the strip is still in its old mount site, so the type-check blast radius is isolated from the layout change.
3. **Band mount** (Task 3) — the strip moves out of `<header>` into the `subHeader` band. This is the structural pivot.
4. **Header content** (Tasks 4–5) — subline, then the alert relocation. The alert move is ATOMIC (remove from strip + add pill to header + fix `hasSignal` in ONE commit) because splitting it produces a commit where the alert count is invisible to the user despite a green test run.
5. **Copy variant migration** (Task 6) — all three call sites in one commit (§6.4; a partial migration fails `pnpm typecheck`).
6. **Re-sync cluster** (Tasks 7–9) — the separable, highest-risk piece (§14.5), kept as its own cluster per §11's scope note.
7. **Skeleton parity** (Task 10) — after the loaded modal's final band geometry exists to match against.
8. **Real-browser suites** (Tasks 11–13) — jsdom cannot assert any of it; run once the DOM is final.
9. **Close-out** (Task 14).

**Count pins are NOT a late task.** §9 requires each count literal to move in the SAME commit as the source change that moves it (the pin fails-by-default — that is its entire purpose). T-COUNTS is therefore distributed across Tasks 2, 3, 4, 5, 8 and 9, each of which re-runs the lexical scanner and updates `pageTransitions.test.tsx` in its own commit. Task 12 only re-verifies the final state.

---

## Global constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → green → commit. One task = one commit. Conventional commits, scope `admin` / `crew-page` / `review`.
- **No DB, RPC, migration, telemetry, or mutation-surface change** (spec §2). Re-sync's relocation moves a client trigger between render sites; `/api/admin/sync` and its auth are untouched. Invariants 2, 3, 4, 9, 10 are all N/A by construction — no `pg_advisory*`, no Supabase call, no email handling, no new/moved mutating route or `"use server"` action.
- **Invariant 5 (no raw error codes in UI)** applies and is actively at risk: Task 7 relocates `ReSyncButton`'s error branch, which must keep routing through `lib/messages/lookup.ts`. T-RESYNC-ERROR is the executable guard.
- **Invariant 8 (impeccable dual-gate)** applies — every task touches `components/` or `app/`. `/impeccable critique` AND `/impeccable audit` run at close-out (Task 14), before adversarial review, with P0/P1 findings fixed or explicitly deferred in `DEFERRED.md`.
- **Invariant 11 (worktree)** — already satisfied; all work stays in this worktree.
- **UI is Opus-only** (ROUTING.md hard rule): every file in this diff is under `components/` or `app/`. Do not route any implementation task to Codex.
- **`pnpm typecheck` is a required gate on Tasks 2, 6 and 7** — vitest strips types, so prop deletions and the `compact` → `variant` migration break at type-check only (§14.3).
- **Every new color / radius / spacing is a token class, never a ported hex** (§7.1). The mock's `:root` block is the dark-theme runtime values byte-for-byte; porting them breaks light mode.

## Meta-test inventory (declared per AGENTS.md writing-plans rules)

**Restating spec §12, plus three registries the spec does not enumerate (found in this plan's pre-draft pass — see drift D1–D3).**

- **Creates:** none.
- **Extends:**
  - `tests/components/admin/showpage/pageTransitions.test.tsx` — count literals (§9). Declared by the spec.
  - `tests/styles/accent-button-atom.test.ts` — **NOT in spec §12.** `MIGRATED_FILES` (`:52`) contains `ReSyncButton.tsx`, and sub-scan 2 (`:83-99`) asserts every listed file imports `AccentButton`. §6.7's accent→ghost demotion removes that import, so the row must be deleted in the same commit (Task 7) as a deliberate de-migration.
  - `tests/help/_uiLabelExceptions.ts` — **NOT in spec §12.** Row at `:180-184` pins the literal `"Re-sync from Drive"` against `ReSyncButton.tsx`. §6.7 shortens the idle label to `"Re-sync"` (Task 7).
  - `tests/styles/_metaDestructiveConfirm.test.ts` — **NOT in spec §12.** Row `:79` registers `ReSyncButton.tsx` as a `"panel"`-kind destructive confirm keyed on `admin-resync-accept`. §6.7 restructures that panel; re-verify the row still resolves (Task 7).
- **Not applicable, with reason** (verbatim from spec §12): Supabase call-boundary (`_metaInfraContract`) — no Supabase call added. Mutation-surface observability — no mutating route or action added or moved. `admin_alerts` catalog — no new alert code. Advisory-lock topology — no `pg_advisory*` in the diff. Email canonicalization — no email handling. §12.4 error-code catalog — no new code, no raw code reaches the UI. `validation-schema-parity` — no migration.

**Advisory-lock holder topology:** N/A — no `pg_advisory*` surface is touched by any task.

---

## Pre-draft verification results (mandatory pass — completed)

All 28 spot-checked rows of spec §3.2 resolve **byte-exact** at this tree, including every row this plan depends on: `ReviewModalShell.tsx:54,430,449`; `PublishedReviewModal.tsx:194,251,292`; `StatusStrip.tsx:154,202,244,261`; `Step3ReviewModal.tsx:289`; `sectionData.ts:28`; `publishedAdapter.ts:64`; `ReSyncButton.tsx:138,204`; `PublishedToggle.tsx:59`; `OverviewSection.tsx:127,133`; `ShareLinkCopyButton.tsx:65`; `ShareChip.tsx:44`; `ShareLinkBody.tsx:53`; `pageTransitions.test.tsx:124`; `statusStrip.test.tsx:400,408`; `globals.css:89,349`; `_showReviewModal.tsx:270`; `ShowReviewModalSkeleton.tsx:44`.

**Lexical scanner re-run against live source** (spec §9's exact regexes, not reasoned): `StatusStrip.tsx` = 8 (`:171,194,213,221,227,237,244,259`), `PublishedReviewModal.tsx` = 1 (`:263`), `OverviewSection.tsx` = 4 (`:110,127,138,158`). Every "before" figure in §9's target table confirmed.

**Token confirmed live:** `--color-status-review` exists (`globals.css:93`), light `#a87716` (`:298`) / dark `#e0b84e` (`:349`). §6.6's `bg-status-review` is a real token — do not port the mock hex.

### Drift found — three registries spec §12 does not list

| # | Finding | Where | Effect | Handled by |
| --- | --- | --- | --- | --- |
| **D1** | `accent-button-atom.test.ts` sub-scan 2 asserts `ReSyncButton.tsx` **imports `AccentButton`** | `tests/styles/accent-button-atom.test.ts:52`, `:83-99` | §6.7's demotion to a raw ghost `<button>` **hard-fails this meta-test**. Spec §11/§12 never mention it | Task 7 — delete the `"ReSyncButton.tsx"` row from `MIGRATED_FILES` in the same commit, with a comment recording the de-migration rationale |
| **D2** | Help-label registry pins the literal `"Re-sync from Drive"` | `tests/help/_uiLabelExceptions.ts:180-184` (note cites `ReSyncButton.tsx:99`; the literal actually lives at `:150` — the note's line ref is itself stale) | §6.7 shortens the idle label to `"Re-sync"`, so the help MDX (`app/help/admin/per-show-panel/page.mdx`) and this row drift | Task 8 — update MDX copy + the exception row together |
| **D3** | `_metaDestructiveConfirm` registers `ReSyncButton.tsx` as a `"panel"` confirm keyed `admin-resync-accept` | `tests/styles/_metaDestructiveConfirm.test.ts:79` | §6.7 restructures that panel (absolute positioning, `role="group"`, moved live-region role) | Task 7 — re-run the meta-test; keep the row, adjust only if the scan's structural assumption breaks |
| **D4** | e2e clicks `admin-resync-button` **scoped inside `overview-sheet-sync`** | `tests/e2e/admin-parse-panel.spec.ts:269-274` | The button leaves that container entirely; the scoped locator resolves to nothing | Task 13 — rescope to the strip band. **REWRITTEN, not retired** — the round-trip-and-render-catalog-copy intent survives the move |

**Could not verify:** nothing material. Two soft spots flagged for the implementer rather than blocking: (a) the exact light-mode contrast ratios in §7.1 are the spec's own measurements — T-CONTRAST re-measures them in-browser and is the authority; (b) `_metaDestructiveConfirm`'s scan internals were read but not executed against a hypothetical post-change `ReSyncButton`, so D3 is "re-verify", not "known-broken".

---

## Watchpoints — RATIFIED, do NOT relitigate

Pre-loading the reviewer per AGENTS.md's disagreement-loop preempt rule. Each carries its ratification citation; verify the contract there rather than re-deriving it.

1. **Sheet-link hit area stays 44px** (`size-tap-min`) — spec §4.1, `PublishedReviewModal.tsx:270`. The mock draws a 24px slot; the glyph is `size-4` in both, so only the hit rect differs. Ratified by the user 2026-07-18.
2. **No `chrome`-prop gating is needed** — spec §4.1. `StatusStrip` has exactly one production render site (`PublishedReviewModal.tsx:292`); `/admin/show/[slug]/page.tsx` is a 307 redirect stub. Restyle directly; the prop is deleted outright (§6.5).
3. **Re-sync MOVES to the strip** — spec §4.3, a ratified amendment to the consolidated-admin-show-page spec's "2 actions max" rule (quoted at `StatusStrip.tsx:7-9`). The budget becomes 3. Duplicating the control was explicitly rejected. In scope for review: whether the move is executed correctly (§6.7) and whether the removed Overview affordance leaves a hole (§7). NOT in scope: the placement decision.
4. **The alert stays an `<a href="#overview">`** — spec §4.1 / F1. The mock's inert `<span>` is a static-canvas fidelity artifact, not a decision to remove navigation. `overviewSection.test.tsx:71` pins the target's existence.
5. **Live-now keeps its accent hue** — spec §4.2. `bg-status-live` resolves to `var(--color-accent)` (`globals.css:89`). The rule is "the publish toggle is the only orange **control**; exactly one non-control element may be orange: the Live-now indicator." T-NO-ORANGE enumerates the exact set per state rather than asserting absence.
6. **`dateSummarySegments` does NOT move** — spec §6.3. The cross-domain import is already established (`PublishedReviewModal.tsx:41` imports from `step3ReviewSections`). Moving it drags `arr` away from ten callers.
7. **No eyebrow in the published header** — spec §6.2. The mock's markup is authoritative over its prose blurb. Do not invent eyebrow copy.
8. **The outline Copy border carries no contrast obligation** — spec §7.1, MEASURED at ~1.6:1 in BOTH themes. The visible label does the identifying work (17.21:1 light / 14.34:1 dark). A 3:1 border rule is unsatisfiable with the mandated token; do not "restore" one.
9. **The shrink-hold confirm gets NO neutral dismiss and NO outside-click-to-close** — spec §6.7. It is a pending decision about the show's data; "Keep current version" IS the safe exit. Error and success branches DO gain dismiss controls; the confirm does not.
10. **Success does not self-clear.** Verified at `ReSyncButton.tsx:121` (set) / `:93` (cleared only at the next POST). An earlier spec draft claimed otherwise; the correction is why the success branch gains a dismiss control.

---

## Task index

| # | Task | File |
|---|------|------|
| 1 | Shell `subHeader` slot + Step 3 baseline fixture | `01-shell-and-strip.md` |
| 2 | `StatusStrip` prop deletions (`renderTitle`/`chrome`/`title`/`alertCount`) + harness repair | `01-shell-and-strip.md` |
| 3 | Strip moves into the `subHeader` band | `01-shell-and-strip.md` |
| 4 | Header subline | `02-header.md` |
| 5 | Alert relocation (strip → header pill) + `hasSignal` fix — ATOMIC | `02-header.md` |
| 6 | `ShareLinkCopyButton` `variant` union — all three call sites | `02-header.md` |
| 7 | `ReSyncButton` restructure: ghost trigger + overlay result surfaces | `03-resync.md` |
| 8 | Re-sync mounts in the strip; Overview affordance removed | `03-resync.md` |
| 9 | Status line collapses to one row | `03-resync.md` |
| 10 | `ShowReviewModalSkeleton` three-band parity | `04-verification.md` |
| 11 | Real-browser suite A — layout, flush, tap, status row, width | `04-verification.md` |
| 12 | Real-browser suite B — overlay, bounds, contrast, focus order | `04-verification.md` |
| 13 | Existing e2e spec updates (rewrite vs retire) | `04-verification.md` |
| 14 | Close-out: source-scan pins, impeccable dual-gate, full suite, adversarial review | `04-verification.md` |

## §11 test-table coverage map — every T-* row is placed

| T-* | Task | T-* | Task |
| --- | --- | --- | --- |
| T-STEP3-INVARIANT | 1 | T-RESYNC-MOVED | 8 |
| T-SUBHEADER-SLOT | 1 | T-RESYNC-GUIDANCE | 8 |
| T-SUBHEADER-FALSEY | 1 | T-RESYNC-ARCHIVED | 8 |
| T-HARNESS | 2 | T-STATUS-INLINE-NO-EDITED | 9 |
| T-NO-H1 | 2 | T-STATUS-ERROR-BUCKET | 9 |
| T-ARCHIVED-BAND | 3 | T-SKELETON-BANDS | 10 |
| T-SUBLINE-CLIENT-NULL | 4 | T-LAYOUT | 11 |
| T-SUBLINE-DATES-EMPTY | 4 | T-COPY-FLUSH | 11 |
| T-ALERT-PILL-LINK | 5 | T-TAP | 11 |
| T-ALERT-PILL-ZERO | 5 | T-STATUS-INLINE | 11 |
| T-ALERT-CAP | 5 (+ 11 for the 375px clause) | T-RESYNC-WIDTH | 11 |
| T-ALERT-NOT-IN-STRIP | 5 | T-OVERLAY | 12 |
| T-DIVIDER-ALERT-ONLY | 5 | T-OVERLAY-BOUNDS | 12 |
| T-COPY-OUTLINE | 6 | T-CONTRAST | 12 |
| T-COPY-ACCENT-UNCHANGED | 6 | T-RESYNC-FOCUS-ORDER | 12 |
| T-RESYNC-GHOST | 7 (folded into T-NO-ORANGE) | T-NO-ORANGE | 12 |
| T-RESYNC-NO-WRAPPER | 7 | T-TOKENS | 14 |
| T-RESYNC-SHRINK | 7 | T-TRANSITIONS | 14 |
| T-RESYNC-ERROR | 7 | T-COUNTS | distributed: 2, 3, 4, 5, 8, 9; re-verified 14 |
| T-RESYNC-SUCCESS | 7 | | |
