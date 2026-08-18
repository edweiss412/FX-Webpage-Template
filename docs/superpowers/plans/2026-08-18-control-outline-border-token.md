# Control Outlines at `border-border` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- Task 6 replaces this comment with the invariant-8 marker line in the §3.3 RAN grammar. -->

**Goal:** Ship the 2026-08-18 text-ramp ruling. 37 controls whose resting outline is `border-border` on a neutral or absent fill swap to `border-text-faint`; the hover inversion that swap causes at 21 of them is repaired in the same branch; five dividers and ShareHub's ratified mobile skin do not move; the census pin grows to 57 rows and gains a negation assertion that catches the half-swapped element the current pin cannot see.

**Architecture — three edit populations, counted separately because they differ:**

| Population | Elements | Files | Physical source edits |
| --- | --- | --- | --- |
| The token swap (`border-border` → `border-text-faint`) | 37 | 26 | **32** |
| The hover repair (spec §3.6) | 21 | 13 | **17** |

The swap's 37→32 reduction is four elements sharing `components/admin/NeedsAttentionInbox.tsx:31`, three sharing the `components/admin/dev/SwitcherControls.tsx` recipes, two sharing `components/crew/primitives/PersonRow.tsx:120`, and two sharing `components/admin/review/ShowReviewSurface.tsx`'s pair. The hover repair's 21→17 is 12 delete-elements collapsing to **8** physical occurrences, 6 raise-elements to **6**, and 3 accent-elements to **3** — one at `components/admin/dev/SwitcherControls.tsx:29` and two on the single line `components/admin/dev/SwitcherControls.tsx:145`, which carries `hover:border-accent` AND `aria-expanded:border-accent`. A fourth occurrence exists at `components/admin/dev/SwitcherControls.tsx:122` and is deliberately NOT edited: it belongs to a `<select>`, which the scanner does not admit, so it is in neither population (step 2.7).

Plus a `DESIGN.md` §1.2a paragraph rewrite, **three** new §1.2 contrast rows with their assertions, a census widened from 21 to 57 rows, a per-row negation with three fixtures, positive assertions for the hover outcomes and the divider exclusions, the invariant-8 dual gate, and the ledger work. No product logic, no new component, no new prop, no new colour token, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md` — ACCEPTED at spec round 5.
**Measurement record:** `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`
**Round-economy filing:** `docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.md`

## What this plan does NOT build

- **No classifier.** Nothing here decides whether an arbitrary element is a control, a divider, or a switch track. The census is a closed **57**-row set this PR defines (21 predecessor rows + 36 additions; the 37th swap-set element overlaps), and the divider assertions name five fixed identities. `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns the forward question with five closed escapes as its evidence. **An implementer who finds themselves writing a function that decides whether an arbitrary element is a control has left the plan.**
- **No `everyPathCarries` on the census loop.** Spec §5.2 records the probe that refuted it: a universal fails `components/admin/Mi11GateActions.tsx:69`, whose accent-filled branch has no outline by ratified design. The strengthening is the NEGATION.
- **No ShareHub swap.** Spec §3.5. the `keeps max-sm:border-border on BOTH ShareHub ternary arms` case stays byte-identical and passing (cite by NAME — Task 1 shifts its line).
- **No shared-constant extraction.** The recipes are heterogeneous; hoisting is a refactor this ruling did not authorise.

## Global Constraints

- Invariant 1 (TDD): every task in the red-contract region below is failing test → minimal implementation → passing test → commit. Each carries a `red=` command that fails before its implementation lands.
- Invariant 2 (advisory locks): **N/A** — no `pg_advisory*` surface, no RPC, no DB. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 3 (email canonicalization): N/A. Invariant 4 (no global sync cursor): N/A.
- Invariant 5 (no raw error codes in UI): N/A — no user-visible copy changes. Task 1 edits one source COMMENT (step 1.11).
- Invariant 6 (commit per task): conventional commits, `fix(styles)` / `test(styles)` / `docs(design)`.
- Invariant 8: **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 6 runs both halves and writes the marker in that same commit.
- Invariant 9: N/A. Invariant 10: N/A — no mutating route, no `"use server"` action.
- Invariant 11: all work in this worktree, never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` in-progress marker comes off **inside step 7.5, committed at 7.8, BEFORE whole-diff review** (Option A, ruled by the orchestrator 2026-08-18). Step 7.9 only VERIFIES it. An earlier revision said 7.9 removes it after CI as its own final commit; that is the REJECTED sequencing and following it would ship an unreviewed commit.

### Heavy-phase discipline

`pnpm mutation:guards` (Task 5) and any full-suite run go under `pnpm heavy`. The scoped `red=`/`green=` vitest runs below are NOT wrapped.

### Meta-test inventory (declared)

| Test | Status | What it pins |
| --- | --- | --- |
| `tests/styles/controlOutlineScan.ts` | **EDITED** | `CENSUS` 21 → **57** rows (36 additions; the 37th swap-set element overlaps) |
| `tests/styles/_metaControlOutlineFill.test.ts` | **EDITED** | per row: carries `border-text-faint`; **new:** carries `border-border` on no path; **new:** the 6 `border-text-subtle` and 3 `border-accent-on-bg` hover outcomes are each POSITIVELY asserted; **new:** the five dividers still carry `border-border` AND are non-members |
| `tests/styles/secondary-action-contrast.test.ts` | **EDITED** | **new:** `--color-border` (before-state), `--color-text-subtle` and `--color-accent-on-bg` as OUTLINE across four grounds × both themes, plus the RELATION `hover > rest` per ground per theme |
| `tests/mutation/source/registry.ts` | unchanged rows, **re-scored** | `controlOutlineScan` at `scoreFloor: 1`, `accepted: []` |
| `tests/docs/_metaInvariant8Closeout.test.ts` | unchanged | this file's marker line grammar |
| `tests/docs/_metaLedgerInProgress.test.ts` | unchanged | the in-progress marker and its removal |
| `tests/docs/_metaLedgerMintBar.test.ts` | unchanged | **and it does NOT cover this arc's new row — see step 7.2** |

### Acceptance criteria (spec traceability)

Every cell names the step that PROVES the AC, not merely one that touches it.

| AC | Spec § | Executable step that PROVES it | Channel the proof arrives on |
| --- | --- | --- | --- |
| AC-1 | §4.3 | 1.2 red (73 failures at 1.6) → 1.12 green | `vitest` exit status on `tests/styles/_metaControlOutlineFill.test.ts` |
| AC-2 | §3.4, §5.2 | 1.2 applied to the original 21; `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` red at 1.6, green at 1.12; `components/admin/Mi11GateActions.tsx:69` green at BOTH | per-row `vitest` case names |
| AC-3 | §3.3 | **1.3** — resolves, CARRIES `border-border`, and is absent from `CENSUS`, three assertions per divider | five named `vitest` cases |
| AC-4 | §3.5 | **1.13** (the pin and the source are unchanged) **AND 7.1** (the ShareHub row is FILED) — §3.5 is a two-part claim and 1.13 proves only the first | `diff` printing `IDENTICAL` plus an empty `--stat`; and the row present in `BACKLOG.md` with the 7.2 field checklist ticked |
| AC-5 | §3.2, §5.4 | **1.14** | empty `--stat` for four files; hunk headers read by eye for the fifth |
| AC-6 | §4.1, §4.2 | 3.1 red → 3.5 green (**all FIVE required contents** of the §1.2a paragraph); **4.1 red** → 4.5 green. **Only 4.1 is red** — the three missing `DESIGN.md` rows. 4.2's sixteen relations are GREEN the moment they are written (probed: all 16 hold today), so they are a REGRESSION pin, not a red | `vitest` on `tests/docs/capabilityClaimProse.test.ts` and on `tests/styles/secondary-action-contrast.test.ts` |
| AC-7 | §4.3 | **1.11**, verified by **1.15a** | a `-`/`+` pair for `components/layout/ThemeToggle.tsx:41` in `git diff origin/main`. 1.15's count of 33 is a corroborating total and is NOT the proof — it is substitutable |
| AC-8 | §5.5 | **5.1** | `pnpm mutation:guards` score plus the unaccepted-survivor set |
| AC-9 | §5.6 | **6.2 + 6.3**, and **6.10** re-runs both halves if a later commit touches a UI surface | the two skill reports, transcribed into §12, plus the marker line checked by `tests/docs/_metaInvariant8Closeout.test.ts` |
| AC-10 | §6 | **7.2** (the new row's fields) **AND 7.5** (the old row is ARCHIVED) **AND 7.9** (its marker is gone at the COMMITTED head) — three separate obligations | human tick-list for 7.2, **explicitly NOT a suite result**; `tests/docs/_metaLedgerInProgress.test.ts` for 7.5 — which runs at 7.7, BEFORE the 7.8 commit, so it cannot speak for 7.9; 7.9's channel is its own `git show HEAD:BACKLOG.md` count against the committed tree |
| AC-11 | §3.6 | **2.2** (the right token on every outline-bearing path) **AND 4.2** (that token is numerically heavier than rest on every ground in both themes) — the class assertion and the ratio claim are different halves and 2.2 proves only the first | `vitest` case per named site, plus the relation cases in `tests/styles/secondary-action-contrast.test.ts` |

**Every row above names a step and a channel because an AC whose proof channel is unnamed is decoration.** Four rows of an earlier draft named a step that would not in fact have proved the claim — AC-3 (absence is not presence), AC-4 (a working-tree diff cannot see a committed change), AC-10 (a grandfathered test proves nothing about the row), AC-11 (a denylist does not prove an outcome). AC-10's channel is a human checklist and says so, rather than borrowing a green suite's authority.

### Plan-time probe record (run 2026-08-18 on the live tree)

| Claim | Probe result |
| --- | --- |
| Scanner universe | 362 elements; 13 `unresolved` |
| Elements carrying `border-border` (whole token, unprefixed) | 42 |
| Swap set | **37** elements, **36** census additions (`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is already a census row) |
| Census length after Task 1 | **57** (21 + 36), NOT 58 |
| Swap files / source edit lines | **26** / **32** |
| `border-border` occurrences in those 26 files | **63** = 32 control edits + **1** intentionally-updated comment + **30** untouched |
| Hover repair | **21** elements, **13** files, **17** physical edits (8 delete + 6 `text-subtle` + 3 `accent-on-bg`) |
| `components/admin/dev/SwitcherControls.tsx` accent occurrences | **4 lexical, 3 in scope** — `components/admin/dev/SwitcherControls.tsx:29`, `components/admin/dev/SwitcherControls.tsx:145` twice; `components/admin/dev/SwitcherControls.tsx:122` belongs to a `<select>` the scanner does not admit (`tests/styles/interactiveScanCore.ts:789`) and is NOT edited |
| Union-vs-per-path hover misclassifications | **1** — `components/admin/showpage/PublishedReviewModal.tsx:964` |
| **Hover-derivation SCOPE — read this before filing a miss** | The 12/6/3 partition is derived over the **36 ADDITIONS**, not over all 57 census rows. Computed the other way it returns **22**, and the extra is `components/admin/ArchiveShowButton.tsx:365` carrying `hover:border-status-warn` — a row of the 2026-08-16 census whose override is a SEMANTIC escalation, not a weight cue, and correctly out of this arc's scope. A reviewer who scopes to 57 and files the difference as a missed site is computing a different set, not finding a gap. |
| Dividers | 5; each RESOLVES, CARRIES `border-border`, and is absent from `CENSUS` |
| Ledger ids | `origin/main` **347**, branch **350** (three review-economy/tooling rows filed on this branch); step 7.1's ShareHub row makes **351** |
| `--color-text-subtle` as OUTLINE | 6.47/6.75 `bg`, 6.76/6.35 `surface`, 6.76/5.97 `raised`, 6.09/6.94 `sunken` |
| `--color-accent-on-bg` as OUTLINE | 5.34/9.39 `bg`, 5.57/8.84 `surface`, 5.57/8.30 `raised`, 5.02/9.65 `sunken` |
| `disabled:opacity-60` composite, PER GROUND | `bg` 1.90/2.18, `surface` 1.95/2.11, `raised` 1.95/2.03, `sunken` 1.83/2.21. **Do not restate as a band — it was stated as a band twice and was wrong twice** |

---

<!-- tasks: depth=2 red-contract -->

## Task 1: Widen the census, pin the negation and the dividers, and swap the 37

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/crew/primitives/PersonRow.tsx:120` why=`the 36 additions rest at border-border on a neutral fill; the assertions that say so do not exist yet` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-7 -->

**One task, not two, because invariant 1 is per TASK.** An earlier draft committed the failing suite in one task and made it green in the next, which leaves a red commit on the branch and never completes a cycle (plan review R2 F1). RED, implementation and GREEN all land here, in one commit.

**Files:** `tests/styles/controlOutlineScan.ts`, `tests/styles/_metaControlOutlineFill.test.ts`, and the 26 swap files, plus `components/layout/ThemeToggle.tsx` for its comment.

### RED

- [ ] **1.1** Add **36** rows to `CENSUS`. The swap set is 37 elements but `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` IS ALREADY A CENSUS ROW (the half-swapped control of spec §3.4); adding it again breaks the identity-distinct assertion. Final length is **57**. Rows come from probe record §2 (class A, minus row 13) and spec §3.2's table (class B).
- [ ] **1.2** Add the per-row negation, mirroring the existing `border-border-strong` case at `tests/styles/_metaControlOutlineFill.test.ts:121`:
      ```ts
      it(`no longer carries border-border (${label})`, () => {
        expect(resolvedRow.element).not.toBeNull();
        expect(carries(resolvedRow.element as ScanElement, "border-border")).toBe(false);
      });
      ```
      Use the existing `carries` helper (`tests/styles/_metaControlOutlineFill.test.ts:46`) — it reads `allStrings`, which spans every render alternative, so the existential-negation IS the universal claim. **Do NOT introduce `everyPathCarries` here.**
- [ ] **1.3** **AC-3 needs THREE assertions per divider, not one.** For each of the five class C identities: it RESOLVES to a live element, it still CARRIES `border-border`, and it is ABSENT from `CENSUS`. *Failure mode caught:* absence alone stays green if a later arc deletes the token from a divider, which violates AC-3 while looking clean. Probed today — all five resolve and carry.
- [ ] **1.4** Update the census-length premise from 21 to **57** and the distinct-identity assertion to 57. If it reads 58, step 1.1 double-added the overlapping row.
- [ ] **1.5** Three fixtures, each with its own `premise("fixture parsed and produced an element", cover.length, 0)` **inside its own case**, so a fixture that fails to parse cannot pass vacuously:
      - **(a)** `border border-border bg-surface` → found by the scan, FAILS the negation. *Catches:* a negation that never runs.
      - **(b)** two ternary arms, one `border-text-faint`, one `border-border` → PASSES the pre-existing `carries(…,"border-text-faint")` check and FAILS the negation. *Catches:* the strengthening being cosmetic. This is the `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` shape.
      - **(c)** two ternary arms, one `border-text-faint`, one with NO border utility → PASSES both. *Catches:* collateral damage to a legitimately outline-free branch, the `components/admin/Mi11GateActions.tsx:69` shape.
- [ ] **1.6** **The complete expected RED, so a correct red is distinguishable from a broken one.** Run `pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts`:
      - **36** failures from the PRE-EXISTING "carries border-text-faint" assertion — the 36 additions do not carry it yet.
      - **37** failures from the NEW negation — the 36 additions plus the already-present `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`.
      - **73 row-test failures in total.**
      - Fixtures (a), (b), (c) PASS; the five divider cases PASS; `components/admin/Mi11GateActions.tsx:69` PASSES.
      A run where `Mi11GateActions` fails means `everyPathCarries` crept in. A run showing 37 total failures means 1.1 was skipped. **Do not commit here** — the cycle finishes below.

### IMPLEMENTATION — 32 source edits

- [ ] **1.7** **Do NOT run a file-scoped find-and-replace.** `border-border` occurs **63** times across these 26 files: **32** are the control edits, **1** is the comment step 1.11 updates, and **30** must not be touched — card edges, panel outlines, popover shells, a dashed empty-state, the rotated tooltip caret at `components/admin/showpage/ShareHub.tsx:1148`, and dividers. Work element-by-element from the census, matching the **whole token**.
- [ ] **1.8** Swap class A's 29 elements. An element carrying the token in both arms of a ternary needs BOTH edited.
- [ ] **1.9** Swap class B's 8 elements. Four (`components/admin/NeedsAttentionInbox.tsx:101`, `components/admin/NeedsAttentionInbox.tsx:130`, `components/admin/NeedsAttentionInbox.tsx:198`, `components/admin/NeedsAttentionInbox.tsx:224`) share ONE occurrence at `components/admin/NeedsAttentionInbox.tsx:31`.
- [ ] **1.10** Do NOT touch the five class C dividers, do NOT touch `components/admin/showpage/ShareHub.tsx` at all, and do NOT touch `hover:border-border-strong` — Task 2 owns every hover utility.
- [ ] **1.11** **Comment fidelity (AC-7).** `components/layout/ThemeToggle.tsx:41` documents the component's tokens as "`border-border`, `bg-surface`". Update it in this commit; leaving it ships a false citation.

### GREEN and the untouched-surface proofs

- [ ] **1.12** `pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` — all **57** rows green, all three fixtures green, all five divider cases green. **Zero failures**, which is the green half of this task's cycle.
- [ ] **1.13** **AC-4 — the ShareHub pin must be BYTE-IDENTICAL, and a token grep does not prove that** (plan review R4 F2). A one-edit mutant inside the pin — changing its `premise` threshold at `tests/styles/_metaControlOutlineFill.test.ts:162` — leaves the suite green and still prints `0` for any `max-sm:border-border` grep, while the range is no longer byte-identical. Hash the block instead, extracted by CONTENT so it survives the line shift Task 1 causes:
      ```sh
      block() { awk '/describe\("adjacent tokens survive the swap"/,/^\}\);$/' "$1"; }
      git show origin/main:tests/styles/_metaControlOutlineFill.test.ts > /tmp/arcF-sharehub-base.ts
      diff <(block /tmp/arcF-sharehub-base.ts) <(block tests/styles/_metaControlOutlineFill.test.ts) && echo IDENTICAL
      git diff origin/main --stat -- components/admin/showpage/ShareHub.tsx
      ```
      **Two-dot against `origin/main`, NOT the three-dot range against HEAD** — these steps run BEFORE this task's single commit at 1.16, so a three-dot range would see none of the work and pass vacuously (plan review R3 F1). `diff` must print nothing and echo `IDENTICAL`; the `--stat` must be empty.
- [ ] **1.14** **AC-5 — the switch tracks.**
      ```sh
      git diff origin/main --stat -- components/admin/PublishedToggle.tsx \
        components/admin/settings/AutoPublishToggle.tsx components/admin/settings/NotifyToggle.tsx \
        components/admin/settings/DeveloperToggleButton.tsx
      git diff origin/main -- components/admin/telemetry/AutoRefreshControl.tsx
      ```
      The first must be EMPTY. The second is NOT — that file is edited at `components/admin/telemetry/AutoRefreshControl.tsx:119`. Read the hunk headers and confirm none reaches `components/admin/telemetry/AutoRefreshControl.tsx:106`, the switch-track path.
- [ ] **1.15** Confirm the untouched occurrences survive: `git diff origin/main -U0 -- '*.tsx' | grep -c '^-.*border-border'` should equal **33** — the 32 control edits plus the one comment line.
- [ ] **1.15a** **AC-7 needs its own check, and it cannot be a diff grep** (plan review R3 F8, corrected at R4 F2). The count of 33 is substitutable. A `-`/`+` grep on `border-border` does not work either: a CORRECT replacement comment no longer contains that token, so no `+` line can carry it, while the file's unrelated `hover:border-border-strong` class line supplies a false `+`. Assert the END STATE of the comment block directly:
      ```sh
      sed -n '36,45p' components/layout/ThemeToggle.tsx | grep -c 'border-border'          # expect 0
      sed -n '36,45p' components/layout/ThemeToggle.tsx | grep -c 'border-text-faint'      # expect 1
      ```
      The comment block must no longer name the old token and must name the new one. Confirm the line range still covers the comment before trusting it — `components/layout/ThemeToggle.tsx:41` is its 2026-08-18 anchor and the block may move.
- [ ] **1.16** Commit ONCE: `fix(styles): move border-border control outlines to the text ramp`

## Task 2: Repair the hover inversion — 17 edits across 13 files

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/admin/dev/SwitcherControls.tsx:145` why=`21 controls keep a hover outline quieter than their new 3.35:1 rest; the assertions that say so do not exist yet` ac=AC-11 -->

Without this task the arc ships 21 controls whose outline reads LIGHTER on hover than at rest. It is a defect this diff CREATES (spec §3.6). RED, implementation and GREEN all land in one commit.

### RED

- [ ] **2.1** The denylist. Per census row among the 36 additions: no row carries `hover:border-border-strong`, and none carries bare `border-accent` **under any state prefix** (match the TOKEN, not one prefix — `hover:` and `aria-expanded:` both occur). Expect **21** failures.
- [ ] **2.2** **The positive assertions, and they must be PER RENDER PATH — a per-ELEMENT `carries` check is not sufficient and the mutant is known.** Plan review R4 F1 supplied it: relocate the new token to the other ternary arm of `components/admin/showpage/PublishedReviewModal.tsx:964` — remove `hover:border-border-strong` from path 0 and add `hover:border-text-subtle` to path 1 — and a per-element check reports `carries(text-subtle)=true` and `carries(border-border-strong)=false`, both green, while **the path that actually draws the outline has lost its hover cue entirely.**

      **This is the third time the union-versus-per-path shape has bitten this arc** (spec R2 F1 in the hover classification, spec R4 F3 in the tinted-plate claim, and now here), so the repair is a HELPER the assertions are written against rather than a third careful hand-check. Add to `tests/styles/_metaControlOutlineFill.test.ts`:
      ```ts
      /** The render alternatives that carry `token` — the unit every per-path claim is made in. */
      function pathsCarrying(element: ScanElement, token: string): string[][] {
        const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
        return element.paths.filter((path) => path.some((s) => whole.test(s)));
      }
      ```
      Then assert, per named site: **every path that carries `border-text-faint` also carries the site's required hover token**, and `pathsCarrying(element, "border-text-faint").length > 0` so the claim is never vacuous.
      - the **6** §3.6(b) sites require `hover:border-text-subtle` — `app/me/meShowSections.tsx:174`, `app/me/meShowSections.tsx:213`, `app/me/meShowSections.tsx:258`, `components/agenda/AgendaEmbed.tsx:83`, `components/agenda/AgendaPdfViewer.tsx:198`, `components/admin/showpage/PublishedReviewModal.tsx:964`;
      - the **3** §3.6(c) sites require `hover:border-accent-on-bg`, and `components/admin/dev/SwitcherControls.tsx:142` additionally requires `aria-expanded:border-accent-on-bg`;
      - the **12** §3.6(a) sites require that NO path carries any `hover:border-*` token.
      *Failure mode caught:* the relocation mutant above, and the simpler one where a required override is deleted or replaced with a third weak token — neither of which the 2.1 denylist can see.
- [ ] **2.3** **The complete expected RED is 42 failures, not 30** (plan review R3 F2). An earlier draft counted only the 9 retarget outcomes and forgot that the twelve §3.6(a) sites must ALSO fail their positive case, because each still carries the `hover:border-*` token that 2.2 asserts is absent:
      - **21** denylist failures (18 `hover:border-border-strong` + 3 `border-accent`);
      - **12** §3.6(a) positive failures ("carries NO `hover:border-*`" — false until 2.4 deletes them);
      - **6** §3.6(b) positive failures (`hover:border-text-subtle` not present yet);
      - **3** §3.6(c) positive failures (`hover:border-accent-on-bg` not present yet).
      **Do not commit here.**

### IMPLEMENTATION — 17 physical edits

- [ ] **2.4** DELETE `hover:border-border-strong` at the 12 §3.6(a) sites — **8 physical occurrences** (the four `NeedsAttentionInbox` rows share `components/admin/NeedsAttentionInbox.tsx:31`; the two `PersonRow` rows share `components/crew/primitives/PersonRow.tsx:122`). **Verify PER RENDER PATH, not over the element's union of strings** — that distinction is what put `components/admin/showpage/PublishedReviewModal.tsx:964` in (b). For each path that carried the border-hover, another `hover:` utility must survive ON THAT PATH; a path left with zero means the classification was wrong — stop and re-probe.
- [ ] **2.5** RAISE to `hover:border-text-subtle` at the 6 §3.6(b) sites — **6 physical occurrences**.
- [ ] **2.6** RAISE to `border-accent-on-bg` at the 3 §3.6(c) sites — **3 physical occurrences**, at `components/admin/dev/SwitcherControls.tsx:29` once and `components/admin/dev/SwitcherControls.tsx:145` TWICE, because that line carries `hover:border-accent` AND `aria-expanded:border-accent`. Retargeting only the `hover:` twin leaves an expanded-but-not-hovered control at 2.10:1 light.
- [ ] **2.7** **Do NOT edit `components/admin/dev/SwitcherControls.tsx:122`.** It is a fourth `hover:border-accent` occurrence in the same file, and an earlier draft counted it, giving 18 edits instead of 17 (plan review R2 F2 — the reviewer was right and this plan was wrong). It belongs to the `<select>` opening at `components/admin/dev/SwitcherControls.tsx:119`, and `tests/styles/interactiveScanCore.ts:789` admits only `button`, `a` and `summary` as intrinsic tags, so the scanner never sees it. It is therefore in NEITHER the 37 swap set nor the 21 hover set: editing it would ship a change no assertion in this arc guards. Its disposition is step 7.4a.
- [ ] **2.8** `pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` — 2.1 and 2.2 both green.
- [ ] **2.9** Commit ONCE: `fix(styles): keep the hover outline heavier than rest after the text-ramp swap`

<!-- tasks: end -->

## Task 3: `DESIGN.md` §1.2a predicate rewrite

**OUTSIDE the red-contract region, and this is the honest placement rather than a waiver.** Both this task and Task 4 are caused by `DESIGN.md`, a repo-ROOT file that `red-target=` cannot name (`BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE`). An earlier draft kept them inside the region with `red-target=` pointing at unrelated components, which is a false citation and also contradicted this branch's own backlog row (plan review R3 F3). Both tasks still run failing-assertion-first below; what they cannot do is carry a marker that names their real production surface.

**This task has a genuine failing-test-first, and it is not the tautological shape.** An earlier draft claimed no RED was possible here because the task is a prose rewrite (plan review R2 F1). That was wrong: the document makes a CHECKABLE claim, and after Tasks 1 and 2 that claim is false about the shipped tree.

- [ ] **3.1** RED: add a case to the EXISTING `tests/docs/capabilityClaimProse.test.ts` (it already reads `DESIGN.md`, so no new file and no new harness). **Assert all FIVE required contents, not two** — an earlier draft checked only the old sentence's absence plus a divider mention, and a one-edit mutant that deletes the paragraph and adds a divider sentence passed while omitting everything else spec §4.1 requires (plan review R3 F4). The case asserts §1.2a:
      1. no longer contains "Widening to `border-border` is a separate design decision this ruling did not make";
      2. records the **2026-08-18 ruling** by date;
      3. records that it was taken against a **rendered mockup including the crew surfaces**;
      4. states the **text-ramp rule for `border-border` resting outlines**;
      5. states the **divider carve-out in both directions** and points at the **ShareHub filing**.
      *Failure mode caught:* the swap ships while the design document still tells the next author the opposite rule, or tells them a partial one. Confirm it FAILS against the current `DESIGN.md`, and confirm each of the five sub-assertions fails independently — a single compound assertion would let four of the five be silently unenforced.
- [ ] **3.2** Replace `DESIGN.md`'s §1.2a `border-border` paragraph per spec §4.1: record the 2026-08-18 ruling and that it was taken against a rendered mockup including the crew surfaces; state that `border-border` on a control's resting outline is now the text ramp; state the divider carve-out **in both directions**; point at the ShareHub filing rather than restating its numbers.
- [ ] **3.3** Cite no line numbers for the swept population — the census is the contract, and the stale `className=` anchors in the current text are exactly what drifted.
- [ ] **3.4** Pre-code mechanical checklist on all prose touched: em-dash ban in user-visible copy, apostrophe literals, no invented tokens.
- [ ] **3.5** GREEN: `pnpm exec vitest run tests/docs/` and `pnpm spec:lint DESIGN.md`
- [ ] **3.6** Commit ONCE: `docs(design): §1.2a takes border-border control outlines onto the text ramp`

## Task 4: Contrast rows and the relation pin

**Outside the region for the same reason as Task 3.**

- [ ] **4.1** RED: add THREE outline assertions to `tests/styles/secondary-action-contrast.test.ts`, in the shape of the existing tinted-plate case at `tests/styles/secondary-action-contrast.test.ts:75` — `--color-border` (the before-state this arc moves away from), `--color-text-subtle`, and `--color-accent-on-bg`, each across all four neutral grounds in both themes. *Failure mode caught:* a future retune of `--color-border` silently reintroducing the weight this arc removed.
- [ ] **4.2** REGRESSION PIN (**not** red — see 4.3): assert the **RELATIONS** — plural, and **sixteen comparisons, not eight** (plan review R5 F4). §3.6 introduces TWO hover tokens, so there are two pairs, each over four grounds in both themes:
      - `border-text-subtle` > `border-text-faint` — 4 grounds × 2 themes = 8;
      - `border-accent-on-bg` > `border-text-faint` — 4 grounds × 2 themes = 8.
      Compute both sides from the runtime tokens rather than pinning constants. **Rationale, because it generalises:** pinned constants go stale the moment either token is retuned and force a reviewer to re-derive whether the pair still reads correctly, whereas a relation fails loudly exactly when a retune breaks it and stays silent when it is harmless.
      **These sixteen are GREEN the moment they are written** — probed, all sixteen already hold against today's tokens — so they are a REGRESSION pin, not this task's RED, and the plan says so rather than mislabelling them. Task 4's actual RED is 4.1's three missing `DESIGN.md` rows.
- [ ] **4.3** **Confirm the RED is not tautological.** The 4.1 cases must fail because `DESIGN.md` lacks the three rows — NOT because an expected number is wrong, and NOT because the relation was previously unasserted (the sixteen relations hold against today's tokens, so they can never be this task's red). Test it: correcting an expected NUMBER must not turn the case green. If it can, the assertion is measuring the test rather than the stylesheet, and it must be rewritten to compare `DESIGN.md`'s published rows against the runtime tokens.
- [ ] **4.4** Add the matching `DESIGN.md` §1.2 rows for all three tokens as outlines.
- [ ] **4.5** GREEN: `pnpm exec vitest run tests/styles/secondary-action-contrast.test.ts`
- [ ] **4.6** Commit ONCE: `test(styles): pin the outline ratios and the hover-over-rest relation`

## Task 5: Mutation score before the round-1 diff dispatch

- [ ] **5.1** `pnpm heavy pnpm mutation:guards`. `tests/styles/controlOutlineScan.ts` is enrolled at `scoreFloor: 1` with `accepted: []` (`tests/mutation/source/registry.ts:1909`), and this arc edits it.
- [ ] **5.2** A census growing 21 → 57 adds **36** integer-literal mutation sites. **If any survives, the survivor IS the finding** — fix the guard, or record an `accepted` row with its reason. Do not lower `scoreFloor`.
- [ ] **5.3** Record the score and the unaccepted-survivor set; both go in the round-1 `--stage diff` brief's `GUARD SURFACE:` line as `MUTATION SCORE: <killed>/<total>` plus "0 unaccepted survivors". The wrapper exits 2 before dispatch without it.
- [ ] **5.4** **Two mechanics from the 2026-08-16 batch that silently invalidate this score, both applying here:**
      - **`-t` does NOT bound the gate.** `runSurface` executes at module scope during collection (`tests/mutation/source/surfaceCases.ts:19`), so a name filter prunes only REPORTING — a "scoped" run still executes every surface. To genuinely scope, filter `GUARD_SURFACES` before `registerSurfaceCases` in a temporary `guardSurfaces.shard*.test.ts`, run, then DELETE that file (`_metaSourceShardIntegrity` pins the shard set).
      - **Score BEFORE closeout, never while holding a mergeable PR** — a re-merge supersedes the run and the recorded score then describes a tree that no longer exists. If the score cannot be obtained in time, an honestly-declared UNSCORED enrolment in the PR body is the accepted fallback (#829 precedent); a stale score is not.
      Run in the FOREGROUND under `pnpm heavy`. A backgrounded run crossing a turn boundary gets SIGTERM-killed (measured twice).
- [ ] **5.5** **RESULT, run 2026-08-18 BEFORE closeout:** `MUTATION SCORE: 65/65`, **0 unaccepted survivors**, `scoreFloor: 1`, `accepted: []`. The widened census (21 → 57 rows, +36 integer-literal sites) is fully killed. **This is the line the round-1 `--stage diff` brief's `GUARD SURFACE:` must carry**, and the wrapper exits 2 before dispatching without it.
      **How it was scoped, because `-t` cannot do it:** a temporary shard file under tests/mutation/ (named guardSurfaces.shardTMP.test.ts, deliberately never committed) filtering `GUARD_SURFACES` to `controlOutlineScan` BEFORE `registerSurfaceCases`, run under `pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation <file>`, then **DELETED** — `tests/mutation/_metaSourceShardIntegrity.test.ts` pins the shard set byte-for-byte, so leaving the file behind fails that guard (verified: 21/21 pass after removal). 118 seconds scoped, against a full `pnpm mutation:guards` that exceeds a ten-minute foreground budget — and the batch lesson forbids backgrounding a gate phase across a turn boundary, where it gets SIGTERM-killed.
- [ ] **5.6** Commit only if a registry row changed: `test(styles): re-score the control-outline census guard`

## Task 6: Invariant-8 impeccable dual-gate

- [ ] **6.1** Setup gates first: the impeccable context load (PRODUCT.md + DESIGN.md) → register reference read.
- [ ] **6.2** `/impeccable critique` on the diff.
- [ ] **6.3** `/impeccable audit` on the diff.
- [ ] **6.4** Fix P0/P1 findings, or defer each with a `DEFERRED.md` entry carrying an un-defer trigger.
- [ ] **6.4a** **If 6.4 changed anything under `app/**` (non-API), `components/**` or `DESIGN.md`, re-run 6.2 and 6.3 on the repaired diff before recording.** Otherwise §12 records reports about a diff that no longer exists, and step 6.10's baseline — the Task 6 commit — cannot see the difference because the repairs ride inside that same commit (plan review R3 F6). Loop 6.2–6.4a until a run produces no UI-surface repair.
- [ ] **6.5** **Expect a paired-weight finding and know its disposition in advance.** Moving 37 controls to 3.35:1 leaves non-interactive chrome beside some of them at 1.27:1 — the shape `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` already owns. A new instance JOINS that entry; it does not open a row and is not repaired here.
- [ ] **6.6** Record findings and dispositions in §12 below.
- [ ] **6.7** In the SAME commit write BOTH: (a) the marker line at the top of this file, replacing the explanatory comment, in the §3.3 RAN grammar — `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`, `dispositions=recorded` iff `p0 + p1 > 0` (the guard cross-checks; `RAN-DEGRADED` on a degraded run); and (b) the verbatim names of both gate halves in §12.
- [ ] **6.8** `pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts`
- [ ] **6.9** Commit: `docs(plan): record the invariant-8 dual-gate findings and dispositions`
- [ ] **6.10** **The gate goes STALE if anything after it touches a UI surface, and re-running is not optional** (plan review R2 F4). Task 7, whole-diff review and CI all follow this task, and any repair they force can change the very diff §12 records. Immediately before merge:
      ```sh
      git diff --name-only <task-6-commit-sha>..HEAD -- 'app/**' 'components/**' DESIGN.md ':!app/api/**'
      ```
      If that prints ANYTHING, both halves re-run on the updated diff and §12 plus the marker line are rewritten in a new commit. Invariant 8 is a claim about the diff that MERGES, not about a diff that existed midway.

## Task 7: Ledger — file ShareHub, archive the row, marker off BEFORE review (Option A)

**Files:** `BACKLOG.md` **and `BACKLOG-archive.md`** — archiving necessarily edits both.

- [ ] **7.1** File `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT` (spec §3.5) with `**Facing:** product`, `**Class-sweep exception:** (b)` naming BOTH ratifications (`spec 2026-07-24-strip-mobile-stacked-band §3 R3` and the executable pin — the case NAMED `keeps max-sm:border-border on BOTH ShareHub ternary arms` in `tests/styles/_metaControlOutlineFill.test.ts` (cite it BY NAME, never by line: Task 1 adds assertions to that file and shifted this case from :156 to :286, so a line citation filed at Task 7 would already be stale — plan review R6 F6)), `**Reachability:** PROBED` with the 1.27:1 mobile and 3.35:1 desktop figures on the SAME control, and a first scheduled step.
- [ ] **7.2** **AC-10 is proved by THIS CHECKLIST, not by the meta-test.** `tests/docs/_metaLedgerMintBar.test.ts:58` gates its field checks on `MINT_BAR_CUTOFF = "2026-08-19"`; a row filed **2026-08-18** is grandfathered and the test never examines `Facing`. It also does not validate `Reachability`, `Class-sweep exception`, or the first scheduled step. Tick each field by hand and do not read a green suite as proof: `Status` ☐ · `Severity` ☐ · `Class` ☐ · `Effort` ☐ · `Filed` ☐ · `Facing` ☐ · `Class-sweep exception` ☐ · `Reachability` ☐ · first scheduled step ☐.
- [ ] **7.3** **Do NOT touch `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`.** An earlier draft added `components/admin/showpage/PublishedReviewModal.tsx:964` to it; that was a cross-path union error (spec §6). Scanner path 0 is `border-border` + `bg-surface-sunken`, scanner path 1 is `bg-warning-bg` with no outline token, so no render path carries both.
- [ ] **7.4** Add any new paired-chrome instance from Task 6 to `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`.
- [ ] **7.4a** Record `components/admin/dev/SwitcherControls.tsx:119` on `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`, family A. It is a `<select>` carrying `border border-border bg-surface … hover:border-accent`, so it is inside §1.2a's words and outside the scanner's vocabulary in BOTH directions — the census will never flag it and never exempt it, which is exactly what that entry exists to hold. Add the site with its class string; do NOT open a new row and do NOT edit the file.
- [ ] **7.5** Archive `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` COMPLETELY — move the entry into `BACKLOG-archive.md` **and remove its `**Status:** IN PROGRESS · **Branch:**` line in this same commit**, leaving no stub. Archives categorically reject in-progress entries (`tests/docs/_metaLedgerInProgress.test.ts:77`), and the split-stub arrangement an earlier draft proposed would have put the id in BOTH ledgers at once, breaking 7.6's empty-intersection check (plan review R5 F1).
- [ ] **7.6** **Ledger-seam conflict is expected** — several arcs edit these files concurrently, and four PRs in a row conflicted on `BACKLOG.md` on 2026-08-18. Resolve with set arithmetic, and **every check below emits an explicit PASS/FAIL verdict rather than a bare number, because a bare pipeline FAILS OPEN**: probed, a missing ledger file makes `grep` error and `wc -l` still print `0` with exit status 0, so "prints 0" and "could not look" are indistinguishable (plan review R6 F2).
      ```sh
      set -o pipefail
      ids() { grep -ohE '^## (BL|DEF)-[A-Z0-9-]+' "$@" | sed 's/^## //' | sort -u; }
      LEDGERS="BACKLOG.md DEFERRED.md BACKLOG-archive.md DEFERRED-archive.md"
      for f in $LEDGERS; do [ -r "$f" ] || { echo "FAIL: $f unreadable"; exit 1; }; done

      # (i) no id may be both open and archived
      OVERLAP=$(comm -12 <(ids BACKLOG.md DEFERRED.md) <(ids BACKLOG-archive.md DEFERRED-archive.md) | wc -l | tr -d ' ')
      [ "$OVERLAP" = 0 ] && echo "PASS: no open/archive overlap" || { echo "FAIL: $OVERLAP id(s) in both"; exit 1; }

      # (ii) the RELATION, computed rather than asserted as a literal
      git show origin/main:BACKLOG.md > /tmp/m1 && git show origin/main:DEFERRED.md > /tmp/m2 \
        && git show origin/main:BACKLOG-archive.md > /tmp/m3 && git show origin/main:DEFERRED-archive.md > /tmp/m4 \
        || { echo "FAIL: could not read origin/main ledgers"; exit 1; }
      MAIN=$(ids /tmp/m1 /tmp/m2 /tmp/m3 /tmp/m4 | wc -l | tr -d ' ')
      HERE=$(ids $LEDGERS | wc -l | tr -d ' ')
      ADDS=$(git diff origin/main -- BACKLOG.md DEFERRED.md | grep -cE '^\+## (BL|DEF)-' || true)
      [ "$HERE" = "$((MAIN + ADDS))" ] \
        && echo "PASS: union relation holds ($HERE = $MAIN + $ADDS)" \
        || { echo "FAIL: union $HERE != main $MAIN + adds $ADDS"; exit 1; }
      ```
      **Verify the checks themselves before trusting them** — run (i) once against a deliberately duplicated id and confirm it prints `FAIL` and exits 1. A check that cannot fail is not a check.
      Three seam traps a row count cannot see: an entry-for-entry-correct union can still be wrong AT THE SEAM (final line flush against the next heading, no blank line); a correct resolution DROPS text from each side, because the archive clause is bidirectional; and a `registry.ts` conflict can split a row MID-BODY with both sides sharing the trailing `}, accepted: [], },` (TS1136). **Typecheck even after a clean `git` auto-merge.**
- [ ] **7.7** `pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` and `pnpm typecheck`.
- [ ] **7.8** Commit ONCE: `docs(backlog): file the ShareHub mobile-skin weight and archive the border-token row`
- [ ] **7.9** **The marker is now absent, and the whole ledger change sits INSIDE the reviewed diff.** This task runs BEFORE whole-diff review, so review and CI cover exactly what merges — the rule an after-review commit would break (`docs/agents/writing-plans.md`, final-diff ordering, caught independently in two arcs of the arc-A/B/C batch). Ruled 2026-08-18 after plan review R5 F1/F2 surfaced the conflict between this rule and invariant 12.

      **Why this satisfies invariant 12 rather than waiving it.** Its wording is "the marker comes off in the PRs last commit, before the merge, **so it never reaches main**" — the `so` clause names absence-at-merge as the PURPOSE and last-commit as the MECHANISM. Verify the purpose directly, immediately before merge:
      ```sh
      set -o pipefail
      MARKER='IN PROGRESS · \*\*Branch:\*\* fix/control-outline-border-token'
      git rev-parse --verify HEAD >/dev/null || { echo "FAIL: no HEAD"; exit 1; }
      BODY=$(git show HEAD:BACKLOG.md) || { echo "FAIL: cannot read BACKLOG.md at HEAD"; exit 1; }
      N=$(printf '%s' "$BODY" | grep -c "$MARKER" || true)
      [ "$N" = 0 ] && echo "PASS: marker absent at HEAD" || { echo "FAIL: marker present $N time(s)"; exit 1; }
      ```
      **`|| true` on the `grep -c` is deliberate and is NOT what makes this fail open** — `grep -c` exits 1 on zero matches, which is the SUCCESS case here. What makes it safe is that the read is checked separately: an unreadable `BACKLOG.md` or a bad `HEAD` exits 1 with `FAIL` before the count is taken. An earlier revision ran the pipeline bare, and probing it with an invalid git object printed `fatal: invalid object name` followed by `0` and exited 0 — indistinguishable from a pass (plan review R6 F2).
      It must print `0`. **Do NOT attempt to restore last-commit position by re-removing the marker** — it is already gone, so the edit is a no-op and `git log -S` still points at 7.8 (plan review R4 F4, R5 F1).

      **The displacement risk is handled by the ARMING WINDOW, not by sequencing.** Do not arm `gh pr merge --auto` until this commit is pushed AND whole-diff review has approved — PR #838 armed at push time, auto-merged mid-round-3, and shipped an in-progress marker to `main`. GitHub silently drops auto-merge on force-push and when merging stops being possible, so **re-arm after every push**. If a review or CI repair lands after 7.8, the marker is still absent and the purpose still holds; record the ordering in the PR body rather than papering over it.

---

## Layout-dimensions task — EXEMPTION CLAIMED

The writing-plans rule mandates a real-browser `getBoundingClientRect` task for any fixed-dimension parent with flex/grid children. **This plan does not owe one, and the exemption is on the record rather than omitted.**

Spec §8 enumerates every dimension relationship that could have moved and shows none does: the complete diff substitutes one colour custom property for another inside the SAME Tailwind `border` utility, and deletes or retargets `hover:border-*` COLOUR utilities. Border-width stays `1px` (the bare `border` utility is untouched everywhere), no padding, radius or font utility changes, no swapped control is a fixed-dimension parent, and the five dividers — the only elements whose rule position could shift — are excluded from the swap entirely. A colour class contributes nothing to layout, so the Tailwind v4 `align-items: stretch` trap is not reachable.

## Transition-audit task — EXEMPTION CLAIMED

Spec §9 enumerates every state pair against the MEASURED utilities (23 of 37 carry `transition-colors duration-fast`, 3 carry the transition without the duration, and 11 carry neither and are instant). No swapped site gains or loses a transition utility; where one exists the swap changes only the resting colour it interpolates TO, and the instant sites stay instant. There is no `AnimatePresence`, no new conditional render, and no new state. **The one state pair that DOES change is rest → hover at 21 sites, and it is not exempted — Task 2 repairs it and step 2.2 proves the outcome.**

## Pre-push gates (all of them, in order)

1. `pnpm exec vitest run tests/styles/ tests/docs/` — scoped, unwrapped.
2. `pnpm typecheck`
3. `pnpm exec eslint .`
4. `pnpm format:check`
5. `pnpm spec:lint docs/superpowers/plans/2026-08-18-control-outline-border-token.md --exec-red` — the red-contract region above must validate.
6. `pnpm heavy pnpm test` — full suite, wrapped.
7. `pnpm heavy pnpm mutation:guards` — re-run if anything changed after Task 6.
8. **Real CI green — and every signal below is one the 2026-08-16 batch measured LYING.** Not just local (the local-passes-CI-fails bug class).
   - **`gh pr view --json statusCheckRollup` has NO `isRequired` field.** Filtering on it matches zero rows and reports a false GREEN. Read the required contexts from branch protection and intersect BY NAME.
   - **Exit codes lie.** `gh pr view` exits 0 on OPEN; `git rev-list --left-right --count` exits 0 on `27 111`. **The COMPARISON is the assertion, never the command** — including the final `0  0`.
   - **Green can describe a union that no longer exists.** Compare each check's `startedAt` against `main`'s last merge time; conflict-free plus green is not evidence.
   - **A timed-out shard emits NO annotations** — that is silent, not green, and its recorded seconds are the timeout wall rather than a measurement. Read ANNOTATIONS, not leg numbers, since `shardBudget` reshuffles legs.
   - **`mutation-harness` and `mutation-browser` are not required checks — but this arc may NOT dismiss a red one.** This diff enrols `tests/styles/controlOutlineScan.ts`, so a failure there is very likely THIS arc's own surface.
   - If a CI-failure signal arrives with an empty summary and no run id, check `gh api rate_limit` FIRST (REST core hit 0/5000 while GraphQL sat at 4717) and use GraphQL for rollups.
9. **Conflict oracle: `git merge-tree --write-tree origin/main HEAD`.** Exit 0 means no conflict, so do NOT re-merge. Being behind `main` never blocks a merge; only CONFLICTING does. `gh pr view` reports CONFLICTING for up to a minute after a resolved conflict is pushed — re-poll rather than re-merging.
10. **Do NOT arm `--auto` until the ledger-closeout commit is pushed** and whole-diff review has approved. Auto-merge armed at push time merged a PR mid-round-3 and shipped an in-progress marker to `main` (#838). GitHub also silently drops auto-merge on force-push and when merging stops being possible, so RE-ARM AFTER EVERY PUSH.
11. **Re-derive state from `git` and `gh`, never from the worktree ship-state marker.** Four markers lied during the 2026-08-16 batch.

## 12. Invariant-8 gate findings and dispositions

_Filled by Task 6. Both gate halves named verbatim below is what makes this unit declare the gate._

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
| **Repurposed colour tokens carry contrast pins.** `--color-text-subtle` and `--color-accent-on-bg` are used as OUTLINES for the first time by Task 2, so BOTH owe a §1.2 row and an assertion (Task 4). **This is not a "no new or repurposed token" arc** | _pending_ |

### 12.4 What the gate confirmed rather than found

_pending_
