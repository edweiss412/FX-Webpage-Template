# Modal Header Reconciliation — Implementation Plan Overview

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the published-show modal's header region in Step 3's frame — a header band carrying identity (title, sheet link, client/date subline, alert pill) and a separate control strip band below the seam carrying live controls (publish toggle, sync status, Re-sync, copy link).

**Spec (canonical):** `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md` — APPROVED by cross-model adversarial review (22 rounds, 2026-07-18). §4.1 / §4.2 / §4.3 are ratified decisions; do NOT relitigate in-plan (see Watchpoints below).

**Design mock:** `docs/superpowers/specs/2026-07-18-modal-header-reconciliation-mock/mock.html`, option `#1a` = the locked target. The two "Today" panels are before-state reference, NOT targets. The mock is dark-only and happy-path-only; spec §7 is the authority for every state it does not draw.

**Base:** worktree `/Users/ericweiss/FX-worktrees/modal-header-reconciliation`, branch `feat/modal-header-reconciliation`, off `origin/main` = `91149861a`. Spec §3.2's 103-row citation appendix was re-verified against this tree during the plan's pre-draft pass.

**Tech stack:** Next.js 16 App Router, Tailwind v4, vitest + RTL (jsdom), Playwright (real-browser assertions).

---

## Two structural rules this plan is built around

### Rule 1 — NO known-red commits. Every task ends with the FULL suite green.

A task that breaks an existing spec **also updates that spec, in the same commit**. There is no "known-red, fixed later" state anywhere in this plan. Where two changes genuinely cannot be split without a red intermediate, they are **merged into one task** and the task body says why.

Consequences, applied concretely:

- **Task 2** deletes `chrome`, which `tests/e2e/statusStripToggleLayout.spec.ts` consumes through the harness's `stripProps()` — so Task 2 owns that spec's rewrite.
- **Task 3** moves the strip out of `<header>`, which breaks `published-review-modal.layout.spec.ts:169-198` (`header + main === panel.clientHeight` — verified live) and dissolves the premise of `:221-232` (header rhythm) — so Task 3 owns both rewrites.
- **Task 7** is a MERGE of the former Tasks 7 + 8. `ReSyncButton`'s restructure alone leaves an overlay-shaped component mounted in Overview's `flex-col` with its panels anchored to the panel instead of the band, breaks `accent-button-atom` sub-scan 2 (drift D1), and strands `admin-parse-panel.spec.ts`'s Overview-scoped locator. The strip mount is what makes all three coherent. **Genuinely inseparable — merged.**
- The **alert relocation** (Task 5) was already atomic for the same reason, and stays so.
- **Former Task 13 (existing-spec repair) is DISSOLVED.** Every rewrite it held is pushed into the task that causes the break. Its RETIRE-vs-REWRITE disposition table survives intact, redistributed and reproduced in full in `04-verification.md` as a cross-reference index.

### Rule 2 — Real-browser assertions live in the feature task they police, written FIRST.

The former Tasks 11–12 (two trailing real-browser suites) are **DISSOLVED**. Writing T-LAYOUT, T-COPY-FLUSH, T-TAP, T-OVERLAY, T-CONTRAST, T-RESYNC-FOCUS-ORDER and T-NO-ORANGE *after* Tasks 3–10 had already built the DOM meant a correct implementation produced **no red phase at all** — the history could not prove those assertions would have caught the pre-change layout. Each now belongs to the task that makes it pass, and each task states **what makes it genuinely red on the pre-change tree**.

The final task (Task 10) adds **no new assertions** — it is cross-cutting close-out only: full suite, count re-verify, source scans, impeccable dual-gate, adversarial review.

**Three assertions are NOT genuinely red, and are declared as such rather than dressed up** (the honest-declaration precedent is spec §11.2's own baseline table):

| Assertion | Task | Why it cannot be red |
| --- | --- | --- |
| T-STEP3-INVARIANT | 1 | A regression guard by construction — green before AND after. Spec §11.2 declares this explicitly; the task's red comes from T-SUBHEADER-SLOT (the new capability) |
| T-TAP, sheet-link 44px clause | 5 | The sheet link is already `size-tap-min` today (`PublishedReviewModal.tsx:270`) and is ratified unchanged (Watchpoint 1). It passes pre- and post-change. It rides along as a guard against the header restructure dropping it. The genuinely-red T-TAP clauses are the alert pill (Task 5) and the Re-sync trigger + dismiss controls (Task 7) — none of which exist pre-change |
| T-COPY-ACCENT-UNCHANGED | 6 | An invariance guard on the shared accent arm (§F3) — green before and after by design. Task 6's red comes from T-COPY-OUTLINE, whose subject (`variant="outline"`) does not exist pre-change |

Everywhere else, the red is real and named in the task body.

---

## Architecture / sequencing

1. **Shell capability** (Task 1) — the `subHeader` slot must exist before anything mounts into it, and the Step 3 baseline must be captured on the pre-change tree (§11.2).
2. **Strip prop deletions** (Task 2) — removes dead API + its harness/e2e coupling while the strip is still in its old mount site, isolating the type-check blast radius from the layout change.
3. **Band mount** (Task 3) — the structural pivot, carrying its own real-browser band assertions and the layout-spec rewrites.
4. **Header content** (Tasks 4–5) — subline, then the atomic alert relocation.
5. **Copy variant migration** (Task 6) — all three call sites in one commit.
6. **Re-sync cluster** (Task 7, merged) — the separable, highest-risk piece (§14.5).
7. **Status collapse** (Task 8).
8. **Skeleton parity** (Task 9) — after the loaded modal's final band geometry exists to match against.
9. **Close-out** (Task 10).

**Count pins are distributed, not a late task.** §9 requires each count literal to move in the SAME commit as the source change that moves it (the pin fails-by-default — that is its purpose). T-COUNTS therefore lives in Tasks 2, 3, 4, 5, 7 and 8; Task 10 only re-verifies the final state.

### Sequencing re-verification (the check performed)

After restructuring, each task was walked against what exists at its commit, asking: *does anything in the tree assert a contract this commit just broke, and does this commit fix it?* The specific check was a `rg` over `tests/` for each symbol the task touches (`chrome=`, `renderTitle`, `show-status-strip`, `strip-title`, `ReSyncButton`, `admin-resync`, `overview-sheet-sync`, `ShareLinkCopyButton`, `compact`), cross-referenced against the disposition index in `04-verification.md`.

| Task | Breaks | Fixed in the same commit? |
| --- | --- | --- |
| 1 | nothing (additive optional prop; Step 3 suites must pass unmodified — that IS the acceptance signal) | n/a |
| 2 | `statusStrip.test.tsx:197,400,408`, `_statusStripToggleHarness.tsx:62-127`, `statusStripToggleLayout.spec.ts`, `pageTransitions:124` | **Yes** — all five listed in Task 2's files |
| 3 | `published-review-modal.layout.spec.ts:169-198` + `:221-232`, `publishedReviewModal.test.tsx:323` | **Yes** |
| 4 | `pageTransitions:124` only | **Yes** |
| 5 | `statusStrip.test.tsx` alert cases, `pageTransitions` ×2 literals | **Yes**; `overviewSection.test.tsx:71` (`#overview` target) must still PASS — verified as a keep-green, not a break |
| 6 | share-panel / share-chip / strip copy suites | **Yes**; `pnpm typecheck` is the completeness gate |
| 7 | `ReSyncButton.test.tsx`, `overviewSection.test.tsx` Re-sync cases, `accent-button-atom:52` (D1), `_uiLabelExceptions:180` (D2), `_metaDestructiveConfirm:79` (D3), `admin-parse-panel.spec.ts:269` (D4), `pageTransitions` | **Yes — all six, which is exactly why 7 and 8 merged** |
| 8 | `statusStrip.test.tsx` status cases | **Yes** |
| 9 | nothing (skeleton has no external consumers) | n/a |
| 10 | nothing (adds no assertions) | n/a |

`step3-review-modal.layout.spec.ts:222` and `publishedReviewModal.test.tsx:270` (no `<h1>`) are **keep-green throughout** — they must pass unmodified at every commit, and their passing untouched is the Step-3-invariance and single-title signal respectively.

---

## Global constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → green → commit. One task = one commit. Conventional commits, scope `admin` / `crew-page` / `review`. **Every task ends with the full suite green** (Rule 1).
- **No DB, RPC, migration, telemetry, or mutation-surface change** (spec §2). Invariants 2, 3, 4, 9, 10 are N/A by construction — no `pg_advisory*`, no Supabase call, no email handling, no new/moved mutating route or `"use server"` action.
- **Invariant 5 (no raw error codes in UI)** applies and is actively at risk: Task 7 relocates `ReSyncButton`'s error branch, which must keep routing through `lib/messages/lookup.ts`. T-RESYNC-ERROR is the executable guard.
- **Invariant 8 (impeccable dual-gate)** — every task touches `components/` or `app/`. `/impeccable critique` AND `/impeccable audit` run at close-out (Task 10), before adversarial review, P0/P1 fixed or explicitly deferred in `DEFERRED.md`.
- **Invariant 11 (worktree)** — satisfied; all work stays in this worktree.
- **`pnpm typecheck` is a required gate on Tasks 2, 6 and 7** — vitest strips types, so prop deletions and the `compact` → `variant` migration break at type-check only (§14.3).
- **Every new color / radius / spacing is a token class, never a ported hex** (§7.1).
- **UI is Opus-only** (ROUTING.md hard rule): every file in this diff is under `components/` or `app/`.

## Meta-test inventory (declared per AGENTS.md writing-plans rules)

**Restating spec §12, plus three registries the spec does not enumerate (found in this plan's pre-draft pass — drifts D1–D3).**

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

**Additional live reads made during the restructure** (these drive the red-phase claims in Tasks 2, 3 and 6):
- `StatusStrip.tsx:161-164` — the `modal-header` arm is `"flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"`. **No `w-full` today.** This is what makes T-COPY-FLUSH genuinely red.
- `StatusStrip.tsx:259-263` — `strip-copy-link` **already carries `ml-auto shrink-0`**. So T-COPY-FLUSH is not testing `ml-auto`'s presence; it tests that `ml-auto` resolves against a full-band-width row, which requires `w-full` + the band. Do not "fix" a red T-COPY-FLUSH by re-adding `ml-auto` — it is already there.
- `published-review-modal.layout.spec.ts:169-198` — asserts `header + main (+grab) === panel.clientHeight ±0.5px`, with an explicit non-vacuity check and a `no footer element` assertion. **This fails the instant the third band lands.** Task 3 owns it.
- `statusStripToggleLayout.spec.ts:1-55` — a standalone harness spec measuring strip geometry at 390px across `card` / inline / error states built from `stripProps()`. Coupled to the deleted props. Task 2 owns it.

**Token confirmed live:** `--color-status-review` exists (`globals.css:93`), light `#a87716` (`:298`) / dark `#e0b84e` (`:349`). §6.6's `bg-status-review` is a real token — do not port the mock hex.

### Drift found — four registries/specs spec §11–§12 do not enumerate

| # | Finding | Where | Effect | Handled by |
| --- | --- | --- | --- | --- |
| **D1** | `accent-button-atom.test.ts` sub-scan 2 asserts `ReSyncButton.tsx` **imports `AccentButton`** | `tests/styles/accent-button-atom.test.ts:52`, `:83-99` | §6.7's demotion to a raw ghost `<button>` **hard-fails this meta-test**. Spec §11/§12 never mention it | Task 7 — delete the `"ReSyncButton.tsx"` row from `MIGRATED_FILES` in the same commit, with a comment recording the de-migration rationale |
| **D2** | Help-label registry pins the literal `"Re-sync from Drive"` | `tests/help/_uiLabelExceptions.ts:180-184` (note cites `ReSyncButton.tsx:99`; the literal actually lives at `:150` — the note's line ref is itself stale) | §6.7 shortens the idle label to `"Re-sync"`, so the help MDX and this row drift | Task 7 — update MDX copy + the exception row together |
| **D3** | `_metaDestructiveConfirm` registers `ReSyncButton.tsx` as a `"panel"` confirm keyed `admin-resync-accept` | `tests/styles/_metaDestructiveConfirm.test.ts:79` | §6.7 restructures that panel (absolute positioning, `role="group"`, moved live-region role) | Task 7 — re-run the meta-test; keep the row, adjust only if the scan's structural assumption breaks |
| **D4** | e2e clicks `admin-resync-button` **scoped inside `overview-sheet-sync`** | `tests/e2e/admin-parse-panel.spec.ts:269-274` | The button leaves that container entirely; the scoped locator resolves to nothing | Task 7 — rescope to the strip band. **REWRITTEN, not retired** — the round-trip-and-render-catalog-copy intent survives |

**Could not verify:** nothing material. Two soft spots flagged for the implementer rather than blocking: (a) the exact light-mode contrast ratios in §7.1 are the spec's own measurements — T-CONTRAST re-measures them in-browser and is the authority; (b) `_metaDestructiveConfirm`'s scan internals were read but not executed against a hypothetical post-change `ReSyncButton`, so D3 is "re-verify", not "known-broken".

---

## Watchpoints — RATIFIED, do NOT relitigate

Pre-loading the reviewer per AGENTS.md's disagreement-loop preempt rule. Each carries its ratification citation.

1. **Sheet-link hit area stays 44px** (`size-tap-min`) — spec §4.1, `PublishedReviewModal.tsx:270`. The mock draws a 24px slot; the glyph is `size-4` in both, so only the hit rect differs. Ratified by the user 2026-07-18.
2. **No `chrome`-prop gating is needed** — spec §4.1. `StatusStrip` has exactly one production render site (`PublishedReviewModal.tsx:292`); `/admin/show/[slug]/page.tsx` is a 307 redirect stub. The prop is deleted outright (§6.5).
3. **Re-sync MOVES to the strip** — spec §4.3, a ratified amendment to the consolidated-admin-show-page spec's "2 actions max" rule (quoted at `StatusStrip.tsx:7-9`). The budget becomes 3. Duplicating the control was explicitly rejected. In scope for review: whether the move is executed correctly (§6.7) and whether the removed Overview affordance leaves a hole (§7). NOT in scope: the placement decision.
4. **The alert stays an `<a href="#overview">`** — spec §4.1 / F1. The mock's inert `<span>` is a static-canvas fidelity artifact, not a decision to remove navigation. `overviewSection.test.tsx:71` pins the target's existence.
5. **Live-now keeps its accent hue** — spec §4.2. `bg-status-live` resolves to `var(--color-accent)` (`globals.css:89`). The rule: "the publish toggle is the only orange **control**; exactly one non-control element may be orange: the Live-now indicator." T-NO-ORANGE enumerates the exact set per state rather than asserting absence.
6. **`dateSummarySegments` does NOT move** — spec §6.3. The cross-domain import is already established (`PublishedReviewModal.tsx:41`). Moving it drags `arr` away from ten callers.
7. **No eyebrow in the published header** — spec §6.2. The mock's markup is authoritative over its prose blurb.
8. **The outline Copy border carries no contrast obligation** — spec §7.1, MEASURED at ~1.6:1 in BOTH themes. The visible label does the identifying work (17.21:1 light / 14.34:1 dark). A 3:1 border rule is unsatisfiable with the mandated token; do not "restore" one.
9. **The shrink-hold confirm gets NO neutral dismiss and NO outside-click-to-close** — spec §6.7. "Keep current version" IS the safe exit. Error and success branches DO gain dismiss controls; the confirm does not.
10. **Success does not self-clear.** Verified at `ReSyncButton.tsx:121` (set) / `:93` (cleared only at the next POST). An earlier spec draft claimed otherwise; the correction is why the success branch gains a dismiss control.

---

## Task index — 10 tasks

| # | Task | File |
|---|------|------|
| 1 | Shell `subHeader` slot + Step 3 baseline fixture | `01-shell-and-strip.md` |
| 2 | `StatusStrip` prop deletions + harness **and `statusStripToggleLayout.spec.ts`** repair | `01-shell-and-strip.md` |
| 3 | Strip moves into the `subHeader` band **+ T-LAYOUT / T-COPY-FLUSH + layout-spec rewrites** | `01-shell-and-strip.md` |
| 4 | Header subline | `02-header.md` |
| 5 | Alert relocation (strip → header pill) + `hasSignal` fix **+ T-TAP pill probe + T-ALERT-CAP 375px** — ATOMIC | `02-header.md` |
| 6 | `ShareLinkCopyButton` `variant` union, all three call sites **+ T-CONTRAST (Copy label)** | `02-header.md` |
| 7 | **MERGED:** `ReSyncButton` restructure + strip mount + Overview removal + all Re-sync real-browser pins + D1–D4 | `03-resync.md` |
| 8 | Status line collapses to one row **+ T-STATUS-INLINE** | `03-resync.md` |
| 9 | `ShowReviewModalSkeleton` band parity (re-specified — achievable invariant) | `04-verification.md` |
| 10 | Close-out: count re-verify, source scans, impeccable dual-gate, full suite, adversarial review (**adds no new assertions**) | `04-verification.md` |

**Dissolved:** former Task 11 (real-browser suite A) and Task 12 (suite B) → redistributed into Tasks 3, 5, 6, 7, 8. Former Task 13 (existing-spec repair) → redistributed into Tasks 2, 3, 5, 7. Former Task 8 (Re-sync strip mount) → **merged into Task 7**.

## §11 test-table coverage map — every T-* row is placed

| T-* | Task | Genuinely red pre-change? |
| --- | --- | --- |
| T-SUBHEADER-SLOT | 1 | **Yes** — prop does not exist |
| T-SUBHEADER-FALSEY | 1 | **Yes** — prop does not exist |
| T-STEP3-INVARIANT | 1 | **No — declared** (regression guard; §11.2) |
| T-HARNESS | 2 | **Yes** — harness builds deleted props |
| T-NO-H1 | 2 | **No — keep-green guard** (`publishedReviewModal.test.tsx:270` passes today; the strip's dead `<h1>` branch is unreachable in production) |
| T-LAYOUT | 3 | **Yes** — no `-subheader` element exists; the panel is two bands |
| T-COPY-FLUSH | 3 | **Yes** — strip root has no `w-full` (`:161-164` verified) and no band exists, so Copy's right edge ≠ band content-box right edge |
| T-ARCHIVED-BAND | 3 | **Yes** — no band |
| T-SUBLINE-CLIENT-NULL | 4 | **Yes** — no subline |
| T-SUBLINE-DATES-EMPTY | 4 | **Yes** — no subline |
| T-ALERT-PILL-LINK | 5 | **Yes** — no header pill |
| T-ALERT-PILL-ZERO | 5 | **Yes** — no header pill |
| T-ALERT-CAP (incl. 375px) | 5 | **Yes** — no cap today; `StatusStrip.tsx:255` renders `{alertCount}` uncapped |
| T-ALERT-NOT-IN-STRIP | 5 | **Yes** — alert IS in the strip today (`:244`) |
| T-DIVIDER-ALERT-ONLY | 5 | **Yes** — `hasSignal` includes `alertCount > 0` today (`:154` verified) |
| T-TAP (alert pill probe) | 5 | **Yes** — pill does not exist |
| T-TAP (sheet link 44px) | 5 | **No — declared** (already `size-tap-min`; ratified unchanged) |
| T-COPY-OUTLINE | 6 | **Yes** — `variant="outline"` does not exist |
| T-CONTRAST (Copy label) | 6 | **Yes** — the outline arm does not exist |
| T-COPY-ACCENT-UNCHANGED | 6 | **No — declared** (invariance guard, §F3) |
| T-RESYNC-NO-WRAPPER | 7 | **Yes** — root is `<div className="flex flex-col gap-3">` (`:136-137`) |
| T-RESYNC-GHOST → folded into T-NO-ORANGE | 7 | **Yes** — trigger is `AccentButton` today |
| T-NO-ORANGE | 7 | **Yes** — the accent Re-sync is a third accent-resolving element |
| T-RESYNC-SHRINK / -ERROR / -SUCCESS | 7 | **Yes** — panels are in-flow, no dismiss controls |
| T-OVERLAY / T-OVERLAY-BOUNDS | 7 | **Yes** — no absolute panels; geometry assertion cannot resolve |
| T-RESYNC-WIDTH | 7 | **Yes** — `"Re-sync from Drive"` vs `"Syncing…"` differ in width, no reservation |
| T-RESYNC-FOCUS-ORDER | 7 | **Yes** — Re-sync is not in the strip |
| T-RESYNC-MOVED / -ARCHIVED / -GUIDANCE | 7 | **Yes** |
| T-CONTRAST (ghost label) | 7 | **Yes** — ghost trigger does not exist |
| T-STATUS-INLINE | 8 | **Yes** — `flex-col` stack today (`:235`); tops differ |
| T-STATUS-INLINE-NO-EDITED | 8 | **Yes** |
| T-STATUS-ERROR-BUCKET | 8 | **Partly — declared.** The bucket behavior exists today (`:128-133`); the assertion is a keep-green guard against the collapse hardcoding "Synced". Its red comes from the single-row structural clause it shares with T-STATUS-INLINE |
| T-SKELETON-BANDS | 9 | **Yes** — skeleton renders no `-subheader` band |
| T-TOKENS / T-TRANSITIONS | 10 | Source scans over the finished diff — declared as close-out verification, not TDD |
| T-COUNTS | 2, 3, 4, 5, 7, 8; re-verified 10 | **Yes at each** — the pin fails-by-default |


---

## Implementation findings (appended during Stage 3)

Mismatches between this plan / the spec and the live code, found while executing
and reported rather than routed around.

| # | Task | Finding | Disposition |
| --- | --- | --- | --- |
| M1 | 3 | The plan (00-overview:118, Task 3 Step 4) called `w-full` on the strip root "the invariant that makes right-flush reachable". It is not — T-COPY-FLUSH passes with `w-full` removed, because the band is a block-level non-flex container and a block-level flex row already fills it. | Kept `w-full` as a defensive guard (it matters if the band ever becomes flex again), corrected the source comment and spec §6.1. The assertion is still real: `w-fit` fails it by ~470px at 1280. |
| M2 | 1 | T-SUBHEADER-FALSEY was marked "genuinely red". Its RUNTIME clause is vacuously green pre-change — no band exists either way. Only the compile clause is red. | Declared in the commit body and spec §11. Not a fake red phase; the test still earns its place via the type check. |
| M3 | 3 | `_publishedReviewModalHarness.tsx` justified `initialToken: null` on the grounds that `resolveOrigin` "reads window". It does not — it is env-only. | Flipped the token; without it T-COPY-FLUSH would have been silently vacuous (no Copy button to flush). |

**Environmental notes (not defects in this diff):**
- `tests/db/advisory-lock.test.ts` intermittently fails with `deadlock detected`
  when a sibling worktree shares the local Postgres. Passes in isolation; no DB
  code in this diff.
- `tests/e2e/step3-review-modal.layout.spec.ts` needs an ambient
  `HASH_FOR_LOG_PEPPER` — pre-existing; unlike its sibling it never sets one for
  the harness subprocess.
