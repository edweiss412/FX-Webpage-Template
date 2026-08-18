# Control Outlines at `border-border` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- Task 7 replaces this comment with the invariant-8 marker line in the §3.3 RAN grammar. -->

**Goal:** Ship the 2026-08-18 text-ramp ruling. 37 controls whose resting outline is `border-border` on a neutral or absent fill swap to `border-text-faint`; the hover inversion that swap causes at 21 of them is repaired in the same branch; five dividers and ShareHub's ratified mobile skin do not move; the census pin grows to 57 rows and gains a negation assertion that catches the half-swapped element the current pin cannot see.

**Architecture — three edit populations, counted separately because they differ:**

| Population | Elements | Files | Physical source edits |
| --- | --- | --- | --- |
| The token swap (`border-border` → `border-text-faint`) | 37 | 26 | **32** |
| The hover repair (spec §3.6) | 21 | 13 | **18** |

The swap's 37→32 reduction is four elements sharing `components/admin/NeedsAttentionInbox.tsx:31`, three sharing the `components/admin/dev/SwitcherControls.tsx` recipes, two sharing `components/crew/primitives/PersonRow.tsx:120`, and two sharing `components/admin/review/ShowReviewSurface.tsx`'s pair. The hover repair's 21→18 is 12 delete-elements collapsing to **8** physical occurrences, 6 raise-elements to **6**, and 3 accent-elements to **4** — four, not three, because `components/admin/dev/SwitcherControls.tsx:145` carries `hover:border-accent` AND `aria-expanded:border-accent` on one line and both must move.

Plus a `DESIGN.md` §1.2a paragraph rewrite, **three** new §1.2 contrast rows with their assertions, a census widened from 21 to 57 rows, a per-row negation with three fixtures, positive assertions for the hover outcomes and the divider exclusions, the invariant-8 dual gate, and the ledger work. No product logic, no new component, no new prop, no new colour token, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md` — ACCEPTED at spec round 5.
**Measurement record:** `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`
**Round-economy filing:** `docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.md`

## What this plan does NOT build

- **No classifier.** Nothing here decides whether an arbitrary element is a control, a divider, or a switch track. The census is a closed **57**-row set this PR defines (21 predecessor rows + 36 additions; the 37th swap-set element overlaps), and the divider assertions name five fixed identities. `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns the forward question with five closed escapes as its evidence. **An implementer who finds themselves writing a function that decides whether an arbitrary element is a control has left the plan.**
- **No `everyPathCarries` on the census loop.** Spec §5.2 records the probe that refuted it: a universal fails `components/admin/Mi11GateActions.tsx:69`, whose accent-filled branch has no outline by ratified design. The strengthening is the NEGATION.
- **No ShareHub swap.** Spec §3.5. `tests/styles/_metaControlOutlineFill.test.ts:156` stays byte-identical and passing.
- **No shared-constant extraction.** The recipes are heterogeneous; hoisting is a refactor this ruling did not authorise.

## Global Constraints

- Invariant 1 (TDD): every task in the red-contract region below is failing test → minimal implementation → passing test → commit. Each carries a `red=` command that fails before its implementation lands.
- Invariant 2 (advisory locks): **N/A** — no `pg_advisory*` surface, no RPC, no DB. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 3 (email canonicalization): N/A. Invariant 4 (no global sync cursor): N/A.
- Invariant 5 (no raw error codes in UI): N/A — no user-visible copy changes. Task 2 edits one source COMMENT (step 2.6).
- Invariant 6 (commit per task): conventional commits, `fix(styles)` / `test(styles)` / `docs(design)`.
- Invariant 8: **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 7 runs both halves and writes the marker in that same commit.
- Invariant 9: N/A. Invariant 10: N/A — no mutating route, no `"use server"` action.
- Invariant 11: all work in this worktree, never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` in-progress marker comes off in Task 8, and **step 8.9 verifies at merge time that Task 8 is still the PR's last commit** rather than assuming it.

### Heavy-phase discipline

`pnpm mutation:guards` (Task 6) and any full-suite run go under `pnpm heavy`. The scoped `red=`/`green=` vitest runs below are NOT wrapped.

### Meta-test inventory (declared)

| Test | Status | What it pins |
| --- | --- | --- |
| `tests/styles/controlOutlineScan.ts` | **EDITED** | `CENSUS` 21 → **57** rows (36 additions; the 37th swap-set element overlaps) |
| `tests/styles/_metaControlOutlineFill.test.ts` | **EDITED** | per row: carries `border-text-faint`; **new:** carries `border-border` on no path; **new:** the 6 `border-text-subtle` and 3 `border-accent-on-bg` hover outcomes are each POSITIVELY asserted; **new:** the five dividers still carry `border-border` AND are non-members |
| `tests/styles/secondary-action-contrast.test.ts` | **EDITED** | **new:** `--color-border` (before-state), `--color-text-subtle` and `--color-accent-on-bg` as OUTLINE across four grounds × both themes, plus the RELATION `hover > rest` per ground per theme |
| `tests/mutation/source/registry.ts` | unchanged rows, **re-scored** | `controlOutlineScan` at `scoreFloor: 1`, `accepted: []` |
| `tests/docs/_metaInvariant8Closeout.test.ts` | unchanged | this file's marker line grammar |
| `tests/docs/_metaLedgerInProgress.test.ts` | unchanged | the in-progress marker and its removal |
| `tests/docs/_metaLedgerMintBar.test.ts` | unchanged | **and it does NOT cover this arc's new row — see step 8.2** |

### Acceptance criteria (spec traceability)

Every cell names the step that PROVES the AC, not merely one that touches it.

| AC | Spec § | Proved by |
| --- | --- | --- |
| AC-1 | §4.3 | 1.2 (negation) red → 2.9 green: all 37 swap-set elements carry `border-text-faint` and `border-border` on no path; 36 are census additions |
| AC-2 | §3.4, §5.2 | 1.2 applied to the original 21; `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` red until 2.2, `components/admin/Mi11GateActions.tsx:69` green throughout (1.6) |
| AC-3 | §3.3 | **1.3** — each divider POSITIVELY still carries `border-border` **and** is absent from `CENSUS`. Absence alone does not prove AC-3 |
| AC-4 | §3.5 | **2.7a** — diffed against `origin/main`, which sees Task 1's COMMITTED edits; a plain `git diff` does not |
| AC-5 | §3.2, §5.4 | 2.7b — the five switch-track paths unchanged against `origin/main`, incl. `components/admin/telemetry/AutoRefreshControl.tsx:106` |
| AC-6 | §4.1, §4.2 | 4 (three contrast rows + the relation) and 5 (§1.2a rewrite) |
| AC-7 | §4.3 | 2.6 |
| AC-8 | §5.5 | 6 |
| AC-9 | §5.6 | 7 |
| AC-10 | §6 | **8.2** — an explicit field checklist, because `tests/docs/_metaLedgerMintBar.test.ts` CANNOT prove it |
| AC-11 | §3.6 | **3.2** — POSITIVE per-site assertions that the 6 carry `border-text-subtle` and the 3 carry `border-accent-on-bg` on both prefixes. The denylist in 3.1 is necessary and NOT sufficient |

### Plan-time probe record (run 2026-08-18 on the live tree)

| Claim | Probe result |
| --- | --- |
| Scanner universe | 362 elements; 13 `unresolved` |
| Elements carrying `border-border` (whole token, unprefixed) | 42 |
| Swap set | **37** elements, **36** census additions (`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is already a census row) |
| Census length after Task 1 | **57** (21 + 36), NOT 58 |
| Swap files / source edit lines | **26** / **32** |
| `border-border` occurrences in those 26 files | **63** = 32 control edits + **1** intentionally-updated comment + **30** untouched |
| Hover repair | **21** elements, **13** files, **18** physical edits (8 delete + 6 `text-subtle` + 4 `accent-on-bg`) |
| `components/admin/dev/SwitcherControls.tsx` accent occurrences | **4**, not 3 — `components/admin/dev/SwitcherControls.tsx:29`, `components/admin/dev/SwitcherControls.tsx:122`, and `components/admin/dev/SwitcherControls.tsx:145` twice (`hover:` and `aria-expanded:` on one line) |
| Union-vs-per-path hover misclassifications | **1** — `components/admin/showpage/PublishedReviewModal.tsx:964` |
| Dividers | 5; each RESOLVES, CARRIES `border-border`, and is absent from `CENSUS` |
| Ledger ids | branch **349**, `origin/main` **347**; Task 8 makes it **350** |
| `--color-text-subtle` as OUTLINE | 6.47/6.75 `bg`, 6.76/6.35 `surface`, 6.76/5.97 `raised`, 6.09/6.94 `sunken` |
| `--color-accent-on-bg` as OUTLINE | 5.34/9.39 `bg`, 5.57/8.84 `surface`, 5.57/8.30 `raised`, 5.02/9.65 `sunken` |
| `disabled:opacity-60` composite, PER GROUND | `bg` 1.90/2.18, `surface` 1.95/2.11, `raised` 1.95/2.03, `sunken` 1.83/2.21. **Do not restate as a band — it was stated as a band twice and was wrong twice** |

---

<!-- tasks: depth=2 red-contract -->

## Task 1: Widen the census, pin the negation and the dividers

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`tests/styles/controlOutlineScan.ts:46` why=`the negation and divider assertions do not exist yet; this task authors them` ac=AC-1,AC-2,AC-3 -->

**Files:** `tests/styles/controlOutlineScan.ts`, `tests/styles/_metaControlOutlineFill.test.ts`

- [ ] **1.1** Add **36** rows to `CENSUS`. The swap set is 37 elements but `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` IS ALREADY A CENSUS ROW (the half-swapped control of spec §3.4); adding it again breaks the identity-distinct assertion. Final length is **57**. Rows come from probe record §2 (class A, minus row 13) and spec §3.2's table (class B).
- [ ] **1.2** Add the per-row negation, mirroring the existing `border-border-strong` case at `tests/styles/_metaControlOutlineFill.test.ts:121`:
      ```ts
      it(`no longer carries border-border (${label})`, () => {
        expect(resolvedRow.element).not.toBeNull();
        expect(carries(resolvedRow.element as ScanElement, "border-border")).toBe(false);
      });
      ```
      Use the existing `carries` helper (`tests/styles/_metaControlOutlineFill.test.ts:46`) — it reads `allStrings`, which spans every render alternative, so the existential-negation IS the universal claim. **Do NOT introduce `everyPathCarries` here.**
- [ ] **1.3** **AC-3 needs TWO assertions per divider, not one.** For each of the five class C identities: it RESOLVES to a live element, it still CARRIES `border-border`, and it is ABSENT from `CENSUS`. *Failure mode caught:* absence alone stays green if a later arc deletes the token from a divider, which violates AC-3 while looking clean. Probed today — all five resolve and carry.
- [ ] **1.4** Update the census-length premise from 21 to **57** and the distinct-identity assertion to 57. If it reads 58, step 1.1 double-added the overlapping row.
- [ ] **1.5** Three fixtures, each with its own `premise("fixture parsed and produced an element", cover.length, 0)` **inside its own case**, so a fixture that fails to parse cannot pass vacuously:
      - **(a)** `border border-border bg-surface` → found by the scan, FAILS the negation. *Catches:* a negation that never runs.
      - **(b)** two ternary arms, one `border-text-faint`, one `border-border` → PASSES the pre-existing `carries(…,"border-text-faint")` check and FAILS the negation. *Catches:* the strengthening being cosmetic. This is the `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` shape.
      - **(c)** two ternary arms, one `border-text-faint`, one with NO border utility → PASSES both. *Catches:* collateral damage to a legitimately outline-free branch, the `components/admin/Mi11GateActions.tsx:69` shape.
- [ ] **1.6** **The complete expected RED, so a correct red is distinguishable from a broken one.** After 1.1–1.5 and before Task 2:
      - **36** failures from the PRE-EXISTING "carries border-text-faint" assertion — the 36 additions do not carry it yet.
      - **37** failures from the NEW negation — the 36 additions plus the already-present `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`.
      - **73 row-test failures in total.**
      - Fixtures (a), (b), (c) PASS; the five divider cases PASS; `components/admin/Mi11GateActions.tsx:69` PASSES.
      A run where `Mi11GateActions` fails means `everyPathCarries` crept in. A run showing 37 total failures means 1.1 was skipped.
- [ ] **1.7** Commit: `test(styles): widen the control-outline census to 57 and pin the border-border negation`

## Task 2: The token swap — 32 source edits

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/crew/primitives/PersonRow.tsx:120` why=`Task 1's negation stays red at 73 row tests until these 32 edits land` ac=AC-1,AC-2,AC-4,AC-5,AC-7 -->

**Files:** the 26 in the probe record, plus `components/layout/ThemeToggle.tsx` for its comment.

- [ ] **2.1** **Do NOT run a file-scoped find-and-replace.** `border-border` occurs **63** times across these 26 files: **32** are the control edits, **1** is the comment step 2.6 updates, and **30** must not be touched — card edges, panel outlines, popover shells, a dashed empty-state, the rotated tooltip caret at `components/admin/showpage/ShareHub.tsx:1148`, and dividers. Work element-by-element from the census, matching the **whole token**.
- [ ] **2.2** Swap class A's 29 elements. An element carrying the token in both arms of a ternary needs BOTH edited.
- [ ] **2.3** Swap class B's 8 elements. Four (`components/admin/NeedsAttentionInbox.tsx:101`, `components/admin/NeedsAttentionInbox.tsx:130`, `components/admin/NeedsAttentionInbox.tsx:198`, `components/admin/NeedsAttentionInbox.tsx:224`) share ONE occurrence at `components/admin/NeedsAttentionInbox.tsx:31`.
- [ ] **2.4** Do NOT touch the five class C dividers, and do NOT touch `components/admin/showpage/ShareHub.tsx` at all.
- [ ] **2.5** Do NOT touch `hover:border-border-strong` here — Task 3 owns every hover utility.
- [ ] **2.6** **Comment fidelity (AC-7).** `components/layout/ThemeToggle.tsx:41` documents the component's tokens as "`border-border`, `bg-surface`". Update it in this commit; leaving it ships a false citation.
- [ ] **2.7a** **AC-4 — compare against `origin/main`, not the working tree.** Task 1 already COMMITTED its edits to this file, so a plain `git diff` cannot see a weakened ShareHub pin:
      ```sh
      git diff origin/main...HEAD -- tests/styles/_metaControlOutlineFill.test.ts | grep -c 'max-sm:border-border'
      git diff origin/main...HEAD --stat -- components/admin/showpage/ShareHub.tsx
      ```
      Expect the printed count `0` and an EMPTY stat. `grep -c` exits **1** when it matches nothing, so that non-zero exit is the SUCCESS shape here — read the printed number, not `$?`.
- [ ] **2.7b** **AC-5 — the switch tracks.**
      ```sh
      git diff origin/main...HEAD --stat -- components/admin/PublishedToggle.tsx \
        components/admin/settings/AutoPublishToggle.tsx components/admin/settings/NotifyToggle.tsx \
        components/admin/settings/DeveloperToggleButton.tsx
      git diff origin/main...HEAD -- components/admin/telemetry/AutoRefreshControl.tsx
      ```
      The first must be EMPTY. The second is NOT — that file is edited at `components/admin/telemetry/AutoRefreshControl.tsx:119`. Read the hunk headers and confirm none reaches `components/admin/telemetry/AutoRefreshControl.tsx:106`, the switch-track path.
- [ ] **2.8** Confirm the untouched occurrences survive: `git diff origin/main...HEAD -U0 -- '*.tsx' | grep -c '^-.*border-border'` should equal **33** — the 32 control edits plus the one comment line.
- [ ] **2.9** `green=pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` — all **57** rows green, all three fixtures green, all five divider cases green.
- [ ] **2.10** Commit: `fix(styles): move border-border control outlines to the text ramp`

## Task 3: Repair the hover inversion — 18 edits across 13 files

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/admin/dev/SwitcherControls.tsx:145` why=`the denylist and the positive hover-outcome assertions do not exist yet; this task authors both` ac=AC-11 -->

Without this task the arc ships 21 controls whose outline reads LIGHTER on hover than at rest. It is a defect this diff CREATES (spec §3.6).

- [ ] **3.1** RED, part one — the denylist. Per census row among the 36 additions: no row carries `hover:border-border-strong`, and none carries bare `border-accent` **under any state prefix** (match the TOKEN, not one prefix — `hover:` and `aria-expanded:` both occur). Expect **21** failures.
- [ ] **3.2** RED, part two — **the positive assertions, without which AC-11 is unproven.** *Failure mode caught by 3.2 that 3.1 misses: deleting the required override, or replacing it with a third weak token, passes the denylist.* Assert per named site:
      - the **6** §3.6(b) sites carry `hover:border-text-subtle` — `app/me/meShowSections.tsx:174`, `app/me/meShowSections.tsx:213`, `app/me/meShowSections.tsx:258`, `components/agenda/AgendaEmbed.tsx:83`, `components/agenda/AgendaPdfViewer.tsx:198`, `components/admin/showpage/PublishedReviewModal.tsx:964`;
      - the **3** §3.6(c) sites carry `hover:border-accent-on-bg`, AND `components/admin/dev/SwitcherControls.tsx:142` also carries `aria-expanded:border-accent-on-bg`;
      - the **12** §3.6(a) sites carry NO `hover:border-*` token at all.
- [ ] **3.3** DELETE `hover:border-border-strong` at the 12 §3.6(a) sites — **8 physical occurrences** (the four `NeedsAttentionInbox` rows share `components/admin/NeedsAttentionInbox.tsx:31`; the two `PersonRow` rows share `components/crew/primitives/PersonRow.tsx:122`). **Verify PER RENDER PATH, not over the element's union of strings** — that distinction is what put `components/admin/showpage/PublishedReviewModal.tsx:964` in (b). For each path that carried the border-hover, another `hover:` utility must survive ON THAT PATH; a path left with zero means the classification was wrong — stop and re-probe.
- [ ] **3.4** RAISE to `hover:border-text-subtle` at the 6 §3.6(b) sites — **6 physical occurrences**.
- [ ] **3.5** RAISE to `border-accent-on-bg` at the 3 §3.6(c) sites — **4 physical occurrences**, at `components/admin/dev/SwitcherControls.tsx:29`, `components/admin/dev/SwitcherControls.tsx:122`, and `components/admin/dev/SwitcherControls.tsx:145` TWICE, because that line carries `hover:border-accent` AND `aria-expanded:border-accent`. Retargeting only the `hover:` twin leaves an expanded-but-not-hovered control at 2.10:1 light.
- [ ] **3.6** `green=pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` — 3.1 and 3.2 both green.
- [ ] **3.7** Commit: `fix(styles): keep the hover outline heavier than rest after the text-ramp swap`

<!-- tasks: end -->

## Task 4: Contrast rows and the relation pin

**TDD, but OUTSIDE the red-contract region, and the reason is a grammar limit rather than a waiver.** This task and Task 5 change `DESIGN.md`, a repo-ROOT file. `red-target=` rejects a path with no directory separator as bare-filename shorthand and rejects a dot-slash-qualified form as an illegal path, so the marker grammar cannot name this task's production surface. Writing a target that names some other file would be a false citation, which is worse than an honest omission. Both tasks still run failing-assertion-first below, and step 4.3 is the anti-tautology check that makes that real.

- [ ] **4.1** RED: add THREE outline assertions to `tests/styles/secondary-action-contrast.test.ts`, in the shape of the existing tinted-plate case at `tests/styles/secondary-action-contrast.test.ts:75` — `--color-border` (the before-state this arc moves away from), `--color-text-subtle`, and `--color-accent-on-bg`, each across all four neutral grounds in both themes. *Failure mode caught:* a future retune of `--color-border` silently reintroducing the weight this arc removed.
- [ ] **4.2** RED: assert the **RELATION**, not eight constants — `hover > rest` per ground, per theme, computed from the tokens. **Rationale, because it generalises:** eight pinned constants go stale the moment either token is retuned and a reviewer must re-derive whether the pair still reads correctly, whereas a relation pin fails loudly exactly when the retune breaks it and stays silent when it is harmless. Keep the absolute rows in `DESIGN.md` for the record; make the ASSERTION relational.
- [ ] **4.3** **Confirm the RED is not tautological.** The new cases must fail because `DESIGN.md` lacks the rows and the relation is unasserted — NOT because an expected number is wrong. Test it: correcting an expected NUMBER must not turn the case green. If it can, the assertion is measuring the test rather than the stylesheet, and it must be rewritten to compare `DESIGN.md`'s published rows against the runtime tokens.
- [ ] **4.4** Add the matching `DESIGN.md` §1.2 rows for all three tokens as outlines.
- [ ] **4.5** `green=pnpm exec vitest run tests/styles/secondary-action-contrast.test.ts`
- [ ] **4.6** Commit: `test(styles): pin the outline ratios and the hover-over-rest relation`

## Task 5: `DESIGN.md` §1.2a predicate rewrite

**Outside the red-contract region for the same grammar reason as Task 4, and additionally because this task has no genuine failing-test-first:** it is a prose rewrite whose verification is the doc meta-tests and `spec:lint` staying green. Claiming a RED for it would be the tautological shape invariant 1 exists to prevent.

- [ ] **5.1** Replace `DESIGN.md:227` through `DESIGN.md:233` per spec §4.1: record the 2026-08-18 ruling and that it was taken against a rendered mockup including the crew surfaces; state that `border-border` on a control's resting outline is now the text ramp; state the divider carve-out **in both directions**; point at the ShareHub filing rather than restating its numbers.
- [ ] **5.2** Cite no line numbers for the swept population — the census is the contract, and the stale `className=` anchors in the current text are exactly what drifted.
- [ ] **5.3** Pre-code mechanical checklist on all prose touched: em-dash ban in user-visible copy, apostrophe literals, no invented tokens.
- [ ] **5.4** `green=pnpm exec vitest run tests/docs/` and `pnpm spec:lint DESIGN.md`
- [ ] **5.5** Commit: `docs(design): §1.2a takes border-border control outlines onto the text ramp`

## Task 6: Mutation score before the round-1 diff dispatch

- [ ] **6.1** `pnpm heavy pnpm mutation:guards`. `tests/styles/controlOutlineScan.ts` is enrolled at `scoreFloor: 1` with `accepted: []` (`tests/mutation/source/registry.ts:1909`), and this arc edits it.
- [ ] **6.2** A census growing 21 → 57 adds **36** integer-literal mutation sites. **If any survives, the survivor IS the finding** — fix the guard, or record an `accepted` row with its reason. Do not lower `scoreFloor`.
- [ ] **6.3** Record the score and the unaccepted-survivor set; both go in the round-1 `--stage diff` brief's `GUARD SURFACE:` line as `MUTATION SCORE: <killed>/<total>` plus "0 unaccepted survivors". The wrapper exits 2 before dispatch without it.
- [ ] **6.4** Commit only if a registry row changed: `test(styles): re-score the control-outline census guard`

## Task 7: Invariant-8 impeccable dual-gate

- [ ] **7.1** Setup gates first: the impeccable context load (PRODUCT.md + DESIGN.md) → register reference read.
- [ ] **7.2** `/impeccable critique` on the diff.
- [ ] **7.3** `/impeccable audit` on the diff.
- [ ] **7.4** Fix P0/P1 findings, or defer each with a `DEFERRED.md` entry carrying an un-defer trigger.
- [ ] **7.5** **Expect a paired-weight finding and know its disposition in advance.** Moving 37 controls to 3.35:1 leaves non-interactive chrome beside some of them at 1.27:1 — the shape `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` already owns. A new instance JOINS that entry; it does not open a row and is not repaired here.
- [ ] **7.6** Record findings and dispositions in §12 below.
- [ ] **7.7** In the SAME commit write BOTH: (a) the marker line at the top of this file, replacing the explanatory comment, in the §3.3 RAN grammar — `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`, `dispositions=recorded` iff `p0 + p1 > 0` (the guard cross-checks; `RAN-DEGRADED` on a degraded run); and (b) the verbatim names of both gate halves in §12.
- [ ] **7.8** `pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts`
- [ ] **7.9** Commit: `docs(plan): record the invariant-8 dual-gate findings and dispositions`

## Task 8: Ledger — file ShareHub, archive the row, marker off LAST

**Files:** `BACKLOG.md` **and `BACKLOG-archive.md`** — archiving necessarily edits both.

- [ ] **8.1** File `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT` (spec §3.5) with `**Facing:** product`, `**Class-sweep exception:** (b)` naming BOTH ratifications (`spec 2026-07-24-strip-mobile-stacked-band §3 R3` and the executable pin `tests/styles/_metaControlOutlineFill.test.ts:156`), `**Reachability:** PROBED` with the 1.27:1 mobile and 3.35:1 desktop figures on the SAME control, and a first scheduled step.
- [ ] **8.2** **AC-10 is proved by THIS CHECKLIST, not by the meta-test.** `tests/docs/_metaLedgerMintBar.test.ts:58` gates its field checks on `MINT_BAR_CUTOFF = "2026-08-19"`; a row filed **2026-08-18** is grandfathered and the test never examines `Facing`. It also does not validate `Reachability`, `Class-sweep exception`, or the first scheduled step. Tick each field by hand and do not read a green suite as proof: `Status` ☐ · `Severity` ☐ · `Class` ☐ · `Effort` ☐ · `Filed` ☐ · `Facing` ☐ · `Class-sweep exception` ☐ · `Reachability` ☐ · first scheduled step ☐.
- [ ] **8.3** **Do NOT touch `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`.** An earlier draft added `components/admin/showpage/PublishedReviewModal.tsx:964` to it; that was a cross-path union error (spec §6). Scanner path 0 is `border-border` + `bg-surface-sunken`, scanner path 1 is `bg-warning-bg` with no outline token, so no render path carries both.
- [ ] **8.4** Add any new paired-chrome instance from Task 7 to `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`.
- [ ] **8.5** Archive `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL`, **removing its `**Status:** IN PROGRESS · **Branch:**` marker in the same commit** — archives categorically reject in-progress entries.
- [ ] **8.6** **Ledger-seam conflict is expected** — several arcs edit these files concurrently, and four PRs in a row conflicted on `BACKLOG.md` on 2026-08-18. Resolve with set arithmetic, and the expected numbers are stated so a wrong merge is visible:
      ```sh
      ids() { grep -ohE '^## (BL|DEF)-[A-Z0-9-]+' "$@" | sed 's/^## //' | sort -u; }
      comm -12 <(ids BACKLOG.md DEFERRED.md) <(ids BACKLOG-archive.md DEFERRED-archive.md)
      ids BACKLOG.md DEFERRED.md BACKLOG-archive.md DEFERRED-archive.md | wc -l
      ```
      The first must print NOTHING. The second must print **350**. Measured 2026-08-18: `origin/main` **347**, this branch **349** (two review-economy rows already filed), and 8.1's ShareHub row makes 350. Archiving MOVES a row between files and must not change the union count. If `origin/main` has advanced, recompute its count the same way rather than trusting 347.
- [ ] **8.7** `pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`
- [ ] **8.8** Commit: `docs(backlog): file the ShareHub mobile-skin weight and archive the border-token row`
- [ ] **8.9** **The marker must be gone in the PR's LAST commit, and Task 8 is not automatically last.** Whole-diff review and CI come after this task, and any repair they force makes 8.8 no longer final. Immediately before merge:
      ```sh
      git log --oneline origin/main..HEAD | head -1
      git show HEAD:BACKLOG.md | grep -c 'IN PROGRESS · \*\*Branch:\*\* fix/control-outline-border-token'
      ```
      The count must be `0` at the actual `HEAD`. If a post-8.8 commit reintroduced or preserved the marker, remove it in a final commit before merging. The invariant is "absent in the last commit", and this step is what makes it true rather than hoped.

---

## Layout-dimensions task — EXEMPTION CLAIMED

The writing-plans rule mandates a real-browser `getBoundingClientRect` task for any fixed-dimension parent with flex/grid children. **This plan does not owe one, and the exemption is on the record rather than omitted.**

Spec §8 enumerates every dimension relationship that could have moved and shows none does: the complete diff substitutes one colour custom property for another inside the SAME Tailwind `border` utility, and deletes or retargets `hover:border-*` COLOUR utilities. Border-width stays `1px` (the bare `border` utility is untouched everywhere), no padding, radius or font utility changes, no swapped control is a fixed-dimension parent, and the five dividers — the only elements whose rule position could shift — are excluded from the swap entirely. A colour class contributes nothing to layout, so the Tailwind v4 `align-items: stretch` trap is not reachable.

## Transition-audit task — EXEMPTION CLAIMED

Spec §9 enumerates every state pair against the MEASURED utilities (23 of 37 carry `transition-colors duration-fast`, 3 carry the transition without the duration, and 11 carry neither and are instant). No swapped site gains or loses a transition utility; where one exists the swap changes only the resting colour it interpolates TO, and the instant sites stay instant. There is no `AnimatePresence`, no new conditional render, and no new state. **The one state pair that DOES change is rest → hover at 21 sites, and it is not exempted — Task 3 repairs it and step 3.2 proves the outcome.**

## Pre-push gates (all of them, in order)

1. `pnpm exec vitest run tests/styles/ tests/docs/` — scoped, unwrapped.
2. `pnpm typecheck`
3. `pnpm exec eslint .`
4. `pnpm format:check`
5. `pnpm spec:lint docs/superpowers/plans/2026-08-18-control-outline-border-token.md --exec-red` — the red-contract region above must validate.
6. `pnpm heavy pnpm test` — full suite, wrapped.
7. `pnpm heavy pnpm mutation:guards` — re-run if anything changed after Task 6.
8. Real CI green — not just local (the local-passes-CI-fails bug class).

## 12. Invariant-8 gate findings and dispositions

_Filled by Task 7. Both gate halves named verbatim below is what makes this unit declare the gate._

### 12.1 Scores

| Gate half | Command | Result |
| --- | --- | --- |
| critique | `/impeccable critique` | _pending_ |
| audit | `/impeccable audit` | _pending_ |

### 12.2 Findings and dispositions

_pending_

### 12.3 Pre-code mechanical checklist, re-verified post-swap

| Check | Result |
| --- | --- |
| em-dash ban in user-visible copy | _pending_ |
| apostrophe literals | _pending_ |
| 44px tap targets (`min-h-tap-min` and companions) unchanged | _pending_ |
| canonical type/token classes | _pending_ |
| **Repurposed colour tokens carry contrast pins.** `--color-text-subtle` and `--color-accent-on-bg` are used as OUTLINES for the first time by Task 3, so BOTH owe a §1.2 row and an assertion (Task 4). **This is not a "no new or repurposed token" arc** | _pending_ |

### 12.4 What the gate confirmed rather than found

_pending_
