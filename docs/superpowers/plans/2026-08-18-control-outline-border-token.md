# Control Outlines at `border-border` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- Task 6 replaces this comment with the invariant-8 marker line in the §3.3 RAN grammar. -->

**Goal:** Ship the 2026-08-18 text-ramp ruling. 37 controls whose resting outline is `border-border` on a neutral or absent fill swap to `border-text-faint`; five dividers and ShareHub's ratified mobile skin do not; the census pin is widened to 58 rows and strengthened by a negation assertion that catches the half-swapped element the current pin cannot see.

**Architecture:** **32 source-token edits across 37 elements in 26 files, plus 21 hover-override edits at 21 of those same elements (spec §3.6) — 12 deletions and 9 retargets.** The count differs from the element count in both directions — four elements share one file-local constant, three share two recipes, two share one line, and an element carrying the token in both ternary arms needs two edits. Plus a `DESIGN.md` §1.2a paragraph rewrite, one new §1.2 contrast row with its assertion, a census widened from 21 to 58 rows, one new per-row assertion with three fixtures, and the invariant-8 dual gate. No product logic, no new component, no new prop, no new token, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md`
**Measurement record:** `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`

## What this plan does NOT build

- **No classifier.** Nothing here decides whether an arbitrary element is a control, a divider, or a switch track. The census is a closed 58-row set this PR defines; the five-row divider non-membership assertion (Task 1) is a fixed exclusion list, not a predicate. `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns the forward question with five closed escapes recorded as its evidence, and spec §6 restates why. **An implementer who finds themselves writing a function that decides whether an arbitrary element is a control has left the plan.**
- **No `everyPathCarries` on the census loop.** Spec §5.2 records the probe that refuted it: a universal "every render path carries the outline token" fails `components/admin/Mi11GateActions.tsx:69`, whose accent-filled branch has no outline by ratified design. The strengthening is the NEGATION.
- **No ShareHub swap.** Spec §3.5. `tests/styles/_metaControlOutlineFill.test.ts:156` stays byte-identical and passing.
- **No shared-constant extraction.** The recipes are heterogeneous; hoisting is a refactor this ruling did not authorise.

## Global Constraints

- Invariant 1 (TDD): every task in the red-contract region is failing test → minimal implementation → passing test → commit.
- Invariant 2 (advisory locks): **N/A** — no `pg_advisory*` surface, no RPC, no DB. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 3 (email canonicalization): N/A.
- Invariant 4 (no global sync cursor): N/A.
- Invariant 5 (no raw error codes in UI): N/A — no user-visible copy changes. Task 2 edits one source COMMENT (step 2.6).
- Invariant 6 (commit per task): conventional commits, `fix(styles)` / `test(styles)` / `docs(design)`.
- Invariant 8: **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 6 runs both halves and writes the marker in that same commit.
- Invariant 9: N/A — no Supabase call added or edited.
- Invariant 10: N/A — no mutating route, no `"use server"` action.
- Invariant 11: all work in this worktree, never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` in-progress marker comes off in **Task 7**, the PR's LAST commit, before the merge — never in a post-merge turn.

### Heavy-phase discipline

`pnpm mutation:guards` (Task 5) and any full-suite run are heavy phases and run under `pnpm heavy`. Scoped vitest runs with an explicit file list — every `red=`/`green=` command below — are NOT wrapped.

### Meta-test inventory (declared)

| Test | Status | What it pins |
| --- | --- | --- |
| `tests/styles/_metaControlOutlineFill.test.ts` | **EDITED** | census rows carry `border-text-faint`; **new:** no row carries `border-border` on any path; **new:** no NEW row carries `hover:border-border-strong` (§3.6); **new:** five dividers are non-members |
| `tests/styles/controlOutlineScan.ts` | **EDITED** | `CENSUS` 21 → 58 rows |
| `tests/styles/secondary-action-contrast.test.ts` | **EDITED** | **new:** `--color-border` as OUTLINE (before-state) and `--color-text-subtle` as OUTLINE (the §3.6b hover token), four grounds, both themes |
| `tests/mutation/source/registry.ts` | unchanged rows, **re-scored** | `controlOutlineScan` at `scoreFloor: 1`, `accepted: []` |
| `tests/docs/_metaInvariant8Closeout.test.ts` | unchanged | this file's marker line grammar |
| `tests/docs/_metaLedgerInProgress.test.ts` | unchanged | the in-progress marker and its removal |
| `tests/docs/_metaLedgerMintBar.test.ts` | unchanged | the new `BL-` row's `Facing:` + incident/exception |

### Acceptance criteria (spec traceability)

| AC | Spec § | Verified by |
| --- | --- | --- |
| AC-1 | §4.3 | Task 1 red → Task 2 green: 37 additions carry `border-text-faint`, `border-border` on no path |
| AC-2 | §3.4, §5.2 | Task 1 red on `ResetPickerEpochButton.tsx:178`; `Mi11GateActions.tsx:69` stays green throughout |
| AC-3 | §3.3 | Task 1 divider non-membership assertion |
| AC-4 | §3.5 | Task 2 step 2.7: `_metaControlOutlineFill.test.ts:156` byte-identical, passing |
| AC-5 | §3.2, §5.4 | Task 2 step 2.7: the five switch-track paths untouched, incl. `AutoRefreshControl.tsx:106` |
| AC-6 | §4.1, §4.2 | Task 3 (contrast row) + Task 4 (§1.2a rewrite) |
| AC-7 | §4.3 | Task 2 step 2.6 |
| AC-8 | §5.5 | Task 5 |
| AC-9 | §5.6 | Task 6 |
| AC-10 | §6 | Task 7 |
| AC-11 | §3.6 | Task 2b |

### Plan-time probe record (run 2026-08-18 on the live tree)

Reproduced here so the implementer starts from measurement. Full transcripts in the spec's probe record.

| Claim | Probe result |
| --- | --- |
| Scanner universe | 362 elements |
| Elements carrying `border-border` (whole token, unprefixed) | 42 |
| Published cover (token + neutral fill) | 30 |
| Swap set (A 29 + B 8) | **37** |
| Files touched | **26** |
| Distinct source-edit lines | **32** |
| `border-border` occurrences in those 26 files | **63** — so 31 must NOT be touched |
| Original 21 failing the NEW negation assertion today | **1** (`ResetPickerEpochButton.tsx:178`) |
| Original 21 failing a hypothetical `everyPathCarries` | **2** — the second (`components/admin/Mi11GateActions.tsx:69`) is a ratified exemption, which is why that form was rejected |
| Swap-set elements with a `hover:border-*` override | **21** — 12 delete, 6 raise to `text-subtle`, 3 raise to `accent-on-bg` |
| Union-vs-per-path hover misclassifications | **1** — `components/admin/showpage/PublishedReviewModal.tsx:964`; a derived `element.paths` re-run over all 21, so it stays correct if a site is added |
| Elements whose state utilities shift the outline's GROUND | **23** — every outline token this arc uses clears 3:1 on all four neutral grounds, so no shift crosses the floor; **7 of them do dip within a 3.35 → 3.02 light / 3.76 → 3.53 dark band**, which spec §9 records as the predecessor's ratified behaviour (20 of its own 21 share the shape) rather than as a defect |
| Original 21 with a `hover:border-*` override | **1** (`components/admin/ArchiveShowButton.tsx:365`, `hover:border-status-warn` — a semantic escalation, not a weight cue) |
| Original 21 already showing the fill-cue band | **20** of 21 — which is why §9 records the band rather than repairing it |
| `--color-text-subtle` as OUTLINE | 6.47/6.75 `bg`, 6.76/6.35 `surface`, 6.76/5.97 `surface-raised`, 6.09/6.94 `surface-sunken` |
| `--color-accent` as OUTLINE | 2.23/8.16 `bg`, 2.33/7.69 `surface`, **2.10/8.39 `surface-sunken`** — light is BELOW the 3.35 rest on every ground, which is why §3.6(c) raises rather than keeps it, on both the `hover:` and `aria-expanded:` occurrences |
| `--color-accent-on-bg` as OUTLINE | 5.34/9.39 `bg`, 5.57/8.84 `surface`, 5.57/8.30 `surface-raised`, 5.02/9.65 `surface-sunken` |
| `SwitcherControls` importers | 1 — `components/admin/dev/AttentionModalSwitcher.tsx`; NOT crew-reachable |

---

## Task 1: Widen the census and strengthen the pin (RED)

**Files:** `tests/styles/controlOutlineScan.ts`, `tests/styles/_metaControlOutlineFill.test.ts`

- [ ] **1.1** Add the 37 swap-set rows to `CENSUS`, taking `file` and `line` from the spec's probe record §2 table (class A, minus row 13) plus §3.2's table (class B). **Identity is `file` PLUS `line`** — twelve files contribute more than one row. Keep the existing 21 rows unchanged and in place.
- [ ] **1.2** Add the per-row assertion, mirroring the existing `border-border-strong` case at `tests/styles/_metaControlOutlineFill.test.ts:121`:
      ```ts
      it(`no longer carries border-border (${label})`, () => {
        expect(resolvedRow.element).not.toBeNull();
        expect(carries(resolvedRow.element as ScanElement, "border-border")).toBe(false);
      });
      ```
      Use the existing `carries` helper (`tests/styles/_metaControlOutlineFill.test.ts:46`) — it reads `allStrings`, which spans every render alternative, so this existential-negation IS the universal claim. **Do NOT introduce `everyPathCarries` here** (see "What this plan does NOT build").
- [ ] **1.3** Add the divider non-membership assertion: the five class C identities from spec §3.3 are NOT in `CENSUS`. A fixed five-row list compared against census identities — not a `border-t`/`border-b` predicate.
- [ ] **1.4** Update the census-length premise from 21 to 58, and the distinct-identity assertion to 58.
- [ ] **1.5** Three fixtures, each with its own `premise("fixture parsed and produced an element", cover.length, 0)` so a fixture that fails to parse cannot pass vacuously:
      - **(a)** `border border-border bg-surface` → found by the scan, FAILS the new assertion.
      - **(b)** two ternary arms, one `border-text-faint`, one `border-border` → PASSES the pre-existing `carries(…, "border-text-faint")` check and FAILS the new one. **This is the `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` shape and the executable proof the strengthening is not cosmetic.**
      - **(c)** two ternary arms, one `border-text-faint`, one with NO border utility → must PASS both. **This is the `Mi11GateActions.tsx:69` shape and pins that an outline-free branch is not collateral.**
- [ ] **1.6** Confirm RED for the right reason. `red=pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts`
      Expect failures on exactly the 37 new rows plus `ResetPickerEpochButton.tsx:178` = **38 failing "no longer carries border-border" cases**, fixture (a) and (b) passing (they assert the failure), fixture (c) passing, and **`Mi11GateActions.tsx:69` PASSING**. A run where `Mi11GateActions` fails means `everyPathCarries` crept in — revert to `carries`.
- [ ] **1.7** Commit: `test(styles): widen the control-outline census to 58 and pin the border-border negation`

## Task 2: The swap — 32 source edits (GREEN)

**Files:** the 26 in the spec's probe record; `components/layout/ThemeToggle.tsx` also for its comment.

- [ ] **2.1** **Do NOT run a file-scoped find-and-replace.** `border-border` occurs 63 times across these 26 files and only 32 belong to a swapped control. Work element-by-element from the census, matching the **whole token** `border-border` — never the prefix (`border-border-strong` must survive wherever it appears, including in `hover:` modifiers on swapped elements).
- [ ] **2.2** Swap class A's 29 elements. Watch the multi-arm cases: an element carrying the token in both arms of a ternary needs BOTH edited, or it ships a control whose outline changes with a prop.
- [ ] **2.3** Swap class B's 8 elements. Four of them (`components/admin/NeedsAttentionInbox.tsx:101`, `components/admin/NeedsAttentionInbox.tsx:130`, `components/admin/NeedsAttentionInbox.tsx:198`, `components/admin/NeedsAttentionInbox.tsx:224`) share ONE occurrence at `components/admin/NeedsAttentionInbox.tsx:31` — one edit moves four census rows.
- [ ] **2.4** Do NOT touch the five class C dividers, and do NOT touch `components/admin/showpage/ShareHub.tsx` at all.
- [ ] **2.5** Do NOT touch `hover:border-border-strong` modifiers. Several swapped elements carry one; it is a state cue and outside this ruling (spec §3.5's `hover:` note).
- [ ] **2.6** **Comment fidelity.** `components/layout/ThemeToggle.tsx:41` documents the component's tokens as "`border-border`, `bg-surface`". After the swap that names a token the control no longer wears. Update it in this commit — the predecessor arc hit the identical trap and an implementer who leaves it has shipped a false citation.
- [ ] **2.7** Verify the untouched surfaces explicitly:
      ```
      git diff --stat -- components/admin/showpage/ShareHub.tsx        # must be EMPTY
      git diff -- tests/styles/_metaControlOutlineFill.test.ts | grep -c 'max-sm:border-border'   # must be 0
      git diff --stat -- components/admin/PublishedToggle.tsx components/admin/settings/AutoPublishToggle.tsx \
        components/admin/settings/NotifyToggle.tsx components/admin/telemetry/AutoRefreshControl.tsx \
        components/admin/settings/DeveloperToggleButton.tsx
      ```
      The last is NOT empty — `components/admin/telemetry/AutoRefreshControl.tsx` is edited at `components/admin/telemetry/AutoRefreshControl.tsx:119` — so inspect it and confirm the diff does **not** reach `components/admin/telemetry/AutoRefreshControl.tsx:106`, the switch-track path.
- [ ] **2.8** `green=pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts` — all 58 rows green, all three fixtures green.
- [ ] **2.9** Commit: `fix(styles): move border-border control outlines to the text ramp`


## Task 2b: Repair the hover inversion the swap causes (spec §3.6)

**Files:** 21 of the 26 already open in Task 2.

Without this task the arc ships 21 controls whose outline reads LIGHTER on hover than at rest (18 at `hover:border-border-strong` 1.59:1, 3 at `hover:border-accent` 2.33:1 light). It is a defect this diff creates, not a pre-existing one — the predecessor's 21 contained exactly one `hover:border-*` override and it was a semantic escalation.

- [ ] **2b.1** RED first: extend `tests/styles/_metaControlOutlineFill.test.ts` with a per-census-row assertion that **no row carries `hover:border-border-strong`, and none carries bare `border-accent` under ANY state prefix** (`hover:`, `aria-expanded:`, or otherwise — match the token, not one prefix), scoped to the 37 new rows (the original 21 are unaffected — probed: only `components/admin/ArchiveShowButton.tsx:365` has a `hover:border-*` and it is `hover:border-status-warn`). Confirm 21 failures (18 `hover:border-border-strong` + 3 carrying `border-accent` under a state prefix). The assertion is per element; the 12/6 split inside the border-strong group is an implementation detail of 2b.2/2b.3, not a separate assertion.
- [ ] **2b.2** DELETE `hover:border-border-strong` at the 12 sites of spec §3.6(a). **Verify PER RENDER PATH, not over the element's union of strings** — that distinction is what put `components/admin/showpage/PublishedReviewModal.tsx:964` in (b) rather than (a) (spec review R2 F1). For each path that carried the border-hover, at least one other `hover:` utility must survive the edit ON THAT PATH; a path left with zero hover utilities means the classification was wrong for that site, so stop and re-probe rather than proceeding.
- [ ] **2b.3** RAISE to `hover:border-text-subtle` at the 6 sites of spec §3.6(b). The path carrying the border-hover has no other hover cue, so deletion would remove hover feedback outright — a regression, which is why raising is the only non-regressive option. Five are crew surfaces; the sixth is `components/admin/showpage/PublishedReviewModal.tsx:964`, whose path-1 fill is `bg-surface-sunken` (6.09 light / 6.94 dark against a 3.02 / 4.11 rest).
- [ ] **2b.4** RAISE to `border-accent-on-bg` at the 3 sites of spec §3.6(c) — `components/admin/dev/SwitcherControls.tsx:83`, `components/admin/dev/SwitcherControls.tsx:92`, `components/admin/dev/SwitcherControls.tsx:142` — on **BOTH** their `hover:` and `aria-expanded:` occurrences. `components/admin/dev/SwitcherControls.tsx:145` carries `aria-expanded:border-accent` alongside `aria-expanded:bg-surface-sunken`; retargeting only the `hover:` twin leaves an expanded-but-not-hovered control at 2.10:1 light (spec review R3 F2). This preserves the accent HUE while clearing the 3.35:1 rest in both themes (5.57 light / 8.84 dark on `surface`), and follows the rule `DESIGN.md:119` already states: plain `--color-accent` is decorative-only in light, and `--color-accent-on-bg` is the token for load-bearing accent.
- [ ] **2b.5** Add TWO newly-repurposed-as-OUTLINE tokens to `DESIGN.md` §1.2 and assert both in `tests/styles/secondary-action-contrast.test.ts`. Both exist as §1.2 rows for other roles but neither is pinned AS AN OUTLINE, so the pre-code rule requiring a contrast pin for any new or repurposed token APPLIES to both. **All four neutral grounds, BOTH themes, eight cells each — not one figure:**
      | Token as OUTLINE | `bg` | `surface` | `surface-raised` | `surface-sunken` |
      | --- | --- | --- | --- | --- |
      | `--color-text-subtle` | 6.47 / 6.75 | 6.76 / 6.35 | 6.76 / 5.97 | 6.09 / 6.94 |
      | `--color-accent-on-bg` | 5.34 / 9.39 | 5.57 / 8.84 | 5.57 / 8.30 | 5.02 / 9.65 |
      Every cell must exceed the rest figure for `border-text-faint` on the SAME ground, which is what makes the hover a step UP rather than an inversion.

      **Assert the RELATION, not the eight absolute numbers.** `hover > rest`, per ground, per theme, computed from the tokens rather than hardcoded. The rationale is worth stating because it generalises: eight pinned constants go stale the moment either token is retuned and a reviewer must then re-derive whether the pair still reads correctly, whereas a relation pin fails loudly at exactly the moment the retune breaks it and stays silent when the retune is harmless. A future change to `--color-text-faint`, `--color-text-subtle` or `--color-accent-on-bg` therefore cannot silently re-invert any hover pair. Keep the absolute rows in `DESIGN.md` §1.2 for the record; make the ASSERTION relational.
- [ ] **2b.6** `green=pnpm exec vitest run tests/styles/_metaControlOutlineFill.test.ts tests/styles/secondary-action-contrast.test.ts`
- [ ] **2b.7** Commit: `fix(styles): keep the hover outline heavier than rest after the text-ramp swap`

## Task 3: The contrast row (RED → GREEN)

**Files:** `DESIGN.md`, `tests/styles/secondary-action-contrast.test.ts`

- [ ] **3.1** Add the assertion FIRST: `--color-border` as an OUTLINE against all four neutral grounds, both themes, pinned to the measured figures (`bg` 1.22/1.35, `surface` 1.27/1.27, `surface-raised` 1.27/1.19, `surface-sunken` 1.15/1.38) with `toBeCloseTo(…, 2)`, in the same shape as the existing tinted-plate case at `tests/styles/secondary-action-contrast.test.ts:75`. This records the before-state so a future retune of `--color-border` cannot quietly reintroduce the weight this arc removed.
- [ ] **3.2** `red=` it against a deliberately wrong expected value first, to prove the case runs.
- [ ] **3.3** Add the matching `DESIGN.md` §1.2 rows.
- [ ] **3.4** `green=pnpm exec vitest run tests/styles/secondary-action-contrast.test.ts`
- [ ] **3.5** Commit: `test(styles): pin the border-border outline ratios as the recorded before-state`

## Task 4: `DESIGN.md` §1.2a predicate rewrite

**Files:** `DESIGN.md`

- [ ] **4.1** Replace `DESIGN.md:227` per spec §4.1: record the 2026-08-18 ruling and that it was taken against a rendered mockup including the crew surfaces; state that `border-border` on a control's resting outline is now the text ramp; state the divider carve-out **in both directions**; point at the ShareHub filing rather than restating its numbers.
- [ ] **4.2** Cite no line numbers for the swept population — the census is the contract, and the `components/admin/ArchiveShowButton.tsx:344` / `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266` anchors in the current text are exactly what drifted (spec §4.1).
- [ ] **4.3** Pre-code mechanical UI checklist on all prose touched: em-dash ban in user-visible copy (N/A — `DESIGN.md` is not user-visible, but the ban is checked anyway on any copy string in the diff), apostrophe literals, no invented tokens.
- [ ] **4.4** `pnpm exec vitest run tests/docs/` — the spec-lint and doc meta-tests must stay green.
- [ ] **4.5** Commit: `docs(design): §1.2a takes border-border control outlines onto the text ramp`

## Task 5: Mutation score before the round-1 diff dispatch

- [ ] **5.1** `pnpm heavy pnpm mutation:guards` — `tests/styles/controlOutlineScan.ts` is enrolled at `scoreFloor: 1` with `accepted: []` (`tests/mutation/source/registry.ts:1909`), and this arc edits it.
- [ ] **5.2** A census growing 21 → 58 adds 37 integer-literal mutation sites. **If any survives, the survivor IS the finding** — fix the guard, or record an `accepted` row with its reason. Do not lower `scoreFloor`.
- [ ] **5.3** Record the score and the unaccepted-survivor set; both go in the round-1 `--stage diff` brief's `GUARD SURFACE:` line as `MUTATION SCORE: <killed>/<total>` plus "0 unaccepted survivors". The codex-guard wrapper exits 2 before dispatching without it.
- [ ] **5.4** Commit only if a registry row changed: `test(styles): re-score the control-outline census guard`

## Task 6: Invariant-8 impeccable dual-gate

- [ ] **6.1** Setup gates first: the impeccable `context` script context load (PRODUCT.md + DESIGN.md) → register reference read (the brand register).
- [ ] **6.2** `/impeccable critique` on the diff.
- [ ] **6.3** `/impeccable audit` on the diff.
- [ ] **6.4** Fix P0 and P1 findings, or defer each with a `DEFERRED.md` entry carrying an un-defer trigger.
- [ ] **6.5** **Expect a paired-weight finding and know its disposition in advance.** Moving 37 controls to 3.35:1 will leave non-interactive chrome beside some of them at 1.27:1 — the same shape as `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`, which the predecessor arc filed for exactly this. A new instance joins that entry; it does not open a new row and it is not repaired here (the pairing rule is an unsettled design decision).
- [ ] **6.6** Record findings and dispositions in §12 below.
- [ ] **6.7** In the SAME commit, write BOTH: (a) the marker line at the top of this file, replacing the explanatory comment, in the §3.3 RAN grammar — `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`, where `dispositions=recorded` iff `p0 + p1 > 0` (the guard cross-checks; `RAN-DEGRADED` where the skill reports a degraded run); and (b) the verbatim names of both gate halves in §12, which is what makes this unit "declare" the gate.
- [ ] **6.8** `pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts`
- [ ] **6.9** Commit: `docs(plan): record the invariant-8 dual-gate findings and dispositions`

## Task 7: Ledger — file ShareHub, archive the row, remove the marker (LAST commit)

**Files:** `BACKLOG.md`

- [ ] **7.1** File `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT` (spec §3.5). It MUST carry:
      - `**Facing:** product` — the repair changes a boundary an admin observes on a phone.
      - `**Class-sweep exception:** (b)` — a ratified scope decision fences it, naming BOTH ratifications: `spec 2026-07-24-strip-mobile-stacked-band §3 R3` and the executable pin `tests/styles/_metaControlOutlineFill.test.ts:156`.
      - `**Reachability:** PROBED` — the 1.27:1 mobile figure and the 3.35:1 desktop figure on the SAME control.
      - **Mint bar:** `Facing: product` needs no `**Incident:**` field (that requirement is process-facing rows only). Confirm against `tests/docs/_metaLedgerMintBar.test.ts` rather than assuming.
      - First scheduled step: decide whether §1.2a's control-outline rule supersedes the §3 R3 mobile skin.
- [ ] **7.2** Add the new instance to `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`: `components/admin/showpage/PublishedReviewModal.tsx:964` carries `bg-warning-bg` on its other branch, so its swap puts one more element on that entry's surface (spec §6). Update the entry's site list and figure; do **not** open a new row.
- [ ] **7.3** Add any new paired-chrome instance from Task 6 to `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`.
- [ ] **7.4** Archive `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL`, **removing its `**Status:** IN PROGRESS · **Branch:**` marker in the same commit** — archives categorically reject in-progress entries, so the marker cannot ride along.
- [ ] **7.5** **Ledger-seam conflict is expected** — several arcs edit `BACKLOG.md` concurrently, and four PRs in a row conflicted on it on 2026-08-18. Resolve with set arithmetic, not by eyeballing the hunk. The four ledger files are `BACKLOG.md`, `DEFERRED.md`, `BACKLOG-archive.md`, `DEFERRED-archive.md` (walked from disk by `scripts/lib/ledger-fields.ts`'s `ledgerFiles`, so do not hardcode the list in any new check):
      ```sh
      ids() { grep -ohE '^## (BL|DEF)-[A-Z0-9-]+' "$@" | sed 's/^## //' | sort -u; }
      # No id may be BOTH open and archived. Must print nothing:
      comm -12 <(ids BACKLOG.md DEFERRED.md) <(ids BACKLOG-archive.md DEFERRED-archive.md)
      # The post-merge union must equal the pre-merge union plus this branch's adds
      # minus nothing (an archive MOVES a row, it does not drop it):
      ids BACKLOG.md DEFERRED.md BACKLOG-archive.md DEFERRED-archive.md | wc -l
      ```
      Compare that last count against `git show origin/main:BACKLOG.md` etc. through the same function; it must differ by exactly this branch's net adds. Then `pnpm typecheck`.
- [ ] **7.6** `pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`
- [ ] **7.7** Commit: `docs(backlog): file the ShareHub mobile-skin weight and archive the border-token row`

---

## Layout-dimensions task — EXEMPTION CLAIMED

The writing-plans rule mandates a real-browser `getBoundingClientRect` task for any fixed-dimension parent with flex/grid children. **This plan does not owe one, and the exemption is claimed on the record rather than left as an omission.**

Spec §8 enumerates every dimension relationship that could have moved and shows none does: the complete diff substitutes one colour custom property for another inside the SAME Tailwind `border` utility at every site. Border-width stays `1px` (the bare `border` utility is untouched), no padding, radius or font utility changes, no swapped control is a fixed-dimension parent, and the five dividers — the only elements whose rule position could shift — are excluded from the swap entirely. A colour class contributes nothing to layout, so the Tailwind v4 `align-items: stretch` trap is not reachable.

## Transition-audit task — EXEMPTION CLAIMED

Spec §9 enumerates every state pair against the MEASURED utilities (spec review round 1 refuted the draft's blanket `transition-colors duration-fast` claim: 23 of 37 carry both, 3 carry the transition without the duration, and 11 carry neither and are instant). No swapped site gains or loses a transition utility: where one exists the swap changes only the resting colour it interpolates TO, and the 11 instant sites stay instant. There is no `AnimatePresence`, no new conditional render, and no new state. **The one state pair that DOES change is rest → hover at 21 sites, and it is not exempted — Task 2b repairs it.** The one compound case — `components/layout/ThemeToggle.tsx:91` changing outline colour while the theme itself changes — has both endpoints pinned by §1.2's four ground rows in both themes.

## Pre-push gates (all of them, in order)

1. `pnpm exec vitest run tests/styles/ tests/docs/` — scoped, unwrapped.
2. `pnpm typecheck`
3. `pnpm exec eslint .`
4. `pnpm format:check`
5. `pnpm heavy pnpm test` — full suite, wrapped.
6. `pnpm heavy pnpm mutation:guards` — re-run if anything changed after Task 5.
7. Real CI green — not just local (the local-passes-CI-fails bug class).

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
| no new or repurposed colour token (so no new contrast pin owed beyond Task 3) | _pending_ |

### 12.4 What the gate confirmed rather than found

_pending_
