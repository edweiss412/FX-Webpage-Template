# Plan: theme the finalize progress bar, and settle the three decisions around it

**Rows:** `FINALIZE-PROGRESSBAR-UNTHEMED-1`, `FINALIZE-COMPACT-COUNT-NOUN-1`, `FINALIZE-CAS-PROGRESS-AFFORDANCE-1`, `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1` (all `DEFERRED.md`).
**Branch:** `fix/finalize-progress-polish`. **Base:** `47e9544e6`. **Worktree:** `/Users/ericweiss/FX-worktrees/finalizeprog`.
**Amends:** `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` (invariant 7: the spec is canonical, so the code and the spec move together).
**Out of scope:** a forced-colors arc will touch `app/globals.css` after this branch lands; this plan adds no `forced-colors` block.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. Each marker's `red=` is the command that must fail before the implementation and pass after.

Two of the four rows were decision-fenced when this plan was drafted. **Eric lifted both fences on 2026-08-31**, taking the impeccable critique's recommendation whole, so all four rows are unconditional and every task below ships. Nothing here is contingent on a ruling.

## Pre-draft code-verification pass

Run on `47e9544e6` before drafting. Six things it caught, recorded because they are why the pass is mandatory.

- **The row says six selectors. There are eight.** `app/globals.css` carries `wizard-step2-progressbar` at `app/globals.css:688`, `app/globals.css:696`, `app/globals.css:700`, `app/globals.css:704`, `app/globals.css:717`, `app/globals.css:730`, `app/globals.css:756` and `app/globals.css:757`. `FINALIZE-PROGRESSBAR-UNTHEMED-1` counts the six top-level rules and omits the `prefers-reduced-motion` pair at `app/globals.css:756-757`, which is one comma-grouped rule holding two of the occurrences. A widening that trusts the row's count leaves the finalize bar's reduced-motion behaviour unwidened.
- **That reduced-motion rule does not apply in Chromium or WebKit, and never has.** It mixes `progress::-webkit-progress-bar` and `progress::-moz-progress-bar` in one selector list. A selector list is invalid as a whole if any selector in it is invalid, and an unknown vendor pseudo-element is invalid. Probe below. This is a live accessibility defect on step 2 today, and widening the rule unrepaired would ship the same dead guarantee to the finalize bar.
- **`casPhaseLabel(null)` returns `""`, and React renders that as ZERO child nodes**, so `element:empty` matches and DESIGN.md §7a's `empty:hidden` is available for row 3. Probe below. The critique's wording ("drop the `<p>` entirely") and the house rule reach the same pixels; §7a is ratified and its wrapper-keeping form wins.
- **The compact count's sibling heading has no `truncate` and no `shrink-0`.** `components/admin/wizard/Step3ReviewWithFinalize.tsx:256-262` is the heading; `components/admin/wizard/Step3ReviewWithFinalize.tsx:263-267` is the count, and the count is the one carrying `shrink-0`. So in a squeeze the HEADING is what yields, silently, exactly the shape DESIGN.md §7a's section-header note describes. This is why row 2 is a measurement and not a copy edit.
- **A shipped test pins the bare count.** `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335` asserts `not.toContain("1 of 2 shows")` and its body records the bare form as deliberate. That test is row 2's RED, and it is only rewritten if the measurement licenses it.
- **One row-4 citation has drifted by one line.** The row cites `components/admin/FinalizeButton.tsx:1016`; the fifth `aria-hidden` is at `components/admin/FinalizeButton.tsx:1015`. The other nine (`components/admin/FinalizeButton.tsx:976`, `components/admin/FinalizeButton.tsx:993`, `components/admin/FinalizeButton.tsx:1004`, `components/admin/FinalizeButton.tsx:1022`; `Step3ReviewWithFinalize.tsx:259`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:264`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:281`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:289`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:292`) are exact. The claim itself holds: every visible string in both renderers is `aria-hidden`.

### Probe 1 — a mixed-vendor selector list is dropped in two of three engines

Run against `@playwright/test`'s bundled browsers, three rules on one page: `#a` pure webkit, `#b` a webkit+moz list, `#c` pure moz. Reported from `document.styleSheets`, so it reports what each engine PARSED rather than what it painted.

```
=== chromium
  selectorText="progress#a::-webkit-progress-bar"
=== webkit
  selectorText="progress#a::-webkit-progress-bar"
=== firefox
  selectorText="progress#a::-webkit-progress-bar"
  selectorText="progress#b::-webkit-progress-bar, progress#b::-moz-progress-bar"
  selectorText="progress#c::-moz-progress-bar"
```

Chromium and WebKit keep only the pure-webkit rule: the mixed list `#b` is gone. Firefox keeps all three, because it aliases `progress::-webkit-progress-bar` for web compatibility. So `app/globals.css:756-757` reduces motion in Firefox alone, and Doug is on a phone, which is WebKit.

Repo-wide sweep for the shape, derived rather than enumerated. The command and its ACTUAL output, run on this base:

```
$ git ls-files -z '*.css' '*.ts' '*.tsx' | xargs -0 grep -n '::-webkit-progress\|::-moz-progress\|::-ms-fill' | wc -l
24
$ ... | cut -d: -f1 | sort | uniq -c
  10 app/globals.css
  14 tests/styles/progressShimmerPseudoElements.test.ts
```

Twenty-four lines across two files. Of the ten in `app/globals.css`, three are prose inside the comment block at `app/globals.css:708-716` and seven are rule selectors; the fourteen in the guard are `String.raw` fragments, not CSS. Every rule selector is single-vendor except the pair at `app/globals.css:756-757`, which is the one comma-grouped mixed-vendor list. **One instance, repaired in this branch; the class is closed by the sweep, not by a list.**

An earlier draft of this paragraph said "ten lines, four of them prose". Both numbers were wrong: ten was the count AFTER a `grep -v` that dropped the guard file, and the comment lines are three. Recorded rather than silently corrected, because the authored-and-run sweep rule exists precisely so a described sweep cannot stand in for a run one, and this paragraph described one.

### Probe 3 — the reduced-motion assertion needs a CSSOM oracle, not computed style

An earlier draft asserted AC-3 by reading the indeterminate track's computed
`animation-name` in Chromium. That assertion cannot work, and only a CONTROL read at
`no-preference` revealed it:

```
=== chromium
  CONTROL  no-preference : wk="none"          <- the shimmer IS applied here
  grouped  reduce        : wk="none"
  split    reduce        : wk="none"
=== webkit
  CONTROL  no-preference : wk=""  mz=""       <- exposes neither pseudo
=== firefox
  CONTROL  no-preference : mz="shim"
  grouped  reduce        : mz="none"
  split    reduce        : mz="none"
```

Chromium reports `none` on `progress::-webkit-progress-bar` even while the shimmer is
applied; WebKit exposes nothing for either pseudo. So in the two engines this repair is
FOR, a computed-style assertion reads `none` whether the override worked, the rule was
dropped, or the shimmer never applied. It is vacuous three ways. Firefox is the only
engine that answers, and Firefox is the one engine where the grouped rule already works,
so that assertion could only ever speak where the bug is absent.

**The oracle is therefore the CSSOM**, which is what probe 1 used: a rule absent from
`document.styleSheets` cannot apply, and presence is exactly what the mixed selector
list decides. AC-3 asserts that in Chromium and in WebKit a reduced-motion rule exists
whose `selectorText` carries the webkit track pseudo and the finalize testid. Today none
is parsed in either engine. After the split, one is.

The first run of this probe had no control, every cell read `none`, and that reads as
success. The premise rule in `docs/agents/writing-plans.md` is what caught it, on the
second run rather than the first.

### Probe 2 — React's empty string leaves no text node

jsdom, `@testing-library/react`, three sibling `<p>` elements:

```
empty-string: childNodes=0 matches(:empty)=true  html=""
null-child:   childNodes=0 matches(:empty)=true  html=""
nonempty:     childNodes=1 matches(:empty)=false html="Applying your edits…"
```

`{""}` and `{null}` are indistinguishable in the DOM, so `empty:hidden` suppresses the CAS phase-label element exactly when `casPhaseLabel` returns `""`, with no conditional in the JSX.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md`, which accepts "none applies" only with a declared reason.

**This plan creates no structural meta-test. It EXTENDS two registries and REWRITES one guard's claim.**

1. `tests/docs/_metaDeferralLedgerGraduation.test.ts:72` holds `GRADUATED`, the DEFERRED-side registry. Task 9 adds each of the four rows. Row 3 spans tasks 5, 6 and 7, so it graduates only when all three have shipped: archiving a row whose receipt or bar is unresolved is the ledger asserting a completion the code contradicts.
2. `tests/docs/designSevenAEmptyHiddenSites.test.ts` walks `components/**` for `empty:hidden` and fails when DESIGN.md §7a's "Current sites" list does not name every component using it. Task 7 adds `empty:hidden` to two components, so §7a's list gains both names in the same commit. It is a COMPANION assertion there, not the red: keying the red on it would be green before the change, red only after adding the class, and green again through a documentation edit, which is implementation-before-red.
3. `tests/styles/progressShimmerPseudoElements.test.ts` is REWRITTEN by task 1 and comes out strictly stronger. Case `(c)` today requires the comma-grouped reduced-motion rule BY NAME, so it asserts the defect; the rewrite requires two single-vendor rules instead. Beyond that it gains what the original never had: both testids required at every one of the eight selector occurrences, closing a hole where deleting the finalize selector from the Mozilla rules survives every assertion AND is invisible to a Chromium-only Playwright run. Its `firstBlock` helper becomes selector-list aware rather than the cases being loosened, proved by a planted mutant. This is the one place in the plan where a test changes shape, and it changes because its claim about browsers is false.

The five registries the writing-plans rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call, no DB write, no advisory lock, no `admin_alerts` row and no email path, so none gains a member.

**No new meta-test is proposed for the vendor-pseudo shape.** The obvious candidate is a walker asserting no selector list mixes vendor prefixes. Its population is one file, its done condition is a property of the walker, and the 2026-08-25 process mint freeze declines exactly that. The contract is held instead by task 1's rewritten source guard, which pins every rule's selector list, and by task 2's CSSOM assertion, which measures what the engine actually parsed. Probe 3 refuted the computed-animation oracle an earlier draft named here.

## Mutation enrolment

`grep -n sourcePath tests/mutation/source/registry.ts` on this base lists 68 enrolled surfaces. None is `app/globals.css`, `components/admin/FinalizeButton.tsx` or `components/admin/wizard/Step3ReviewWithFinalize.tsx`. **No enrolled surface is touched, no score is owed, and none is enrolled under review pressure.**

## Test harness

The three real-browser obligations (row 1's paint, row 1's reduced-motion repair, row 2's measurement) share one harness, built on the repo's live-entry pattern rather than a new dev route.

`tests/e2e/standalone.config.ts` starts no server and needs no database: each spec boots its own `node:http` server on port 0. `testMatch` is an explicit allow-list, so a new spec runs nowhere until its filename is added. `tests/e2e/helpers/liveEntryToolchain.ts` bundles a real component tree with esbuild and compiles `app/globals.css` through Tailwind with an `@source` pointing at the component, which is what makes the CSS under test the shipped CSS. Dark mode is `page.evaluate` setting `data-theme` on the root, the form used at `tests/e2e/section-header-visual.spec.ts:168`.

No existing e2e reaches the finalize RUNNING state. The state is reached in jsdom at `tests/components/admin/finalizeTransitionAudit.test.tsx:116-146` by pushing `{type:"listed",total}` then `{type:"row",done,total,name}` into a controllable NDJSON stream from `tests/components/admin/_finalizeStreamHarness.ts`. The live entry replays that same sequence from the host page.

## Acceptance criteria

- AC-1 — The finalize progressbar paints the resolved accent token on its filled track in Chromium, in both themes, and does not paint the UA default.
- AC-2 — Each of the eight step-2 selector occurrences also matches `wizard-finalize-progressbar`, proved at the SOURCE for all eight and in the browser for the ones an engine will report.
- AC-3 — In Chromium AND in WebKit, a `prefers-reduced-motion: reduce` rule carrying the webkit track pseudo and the finalize testid is present in the parsed CSSOM. Both engines are reached because task 2 adds a WebKit project scoped to this spec; without it the standalone config runs Chromium only. Firefox is NOT asserted in CI, and AC-3 makes no CI claim about it: there is no Firefox project, the Mozilla rules are unobservable from the engines that are, and the Firefox behaviour is established by probe 1 plus task 1's source guard.
- AC-4 — `ProgressPanel`'s docstring makes no claim the code contradicts.
- AC-5 — The compact heading occupies exactly one line at 375px at ANY count width, guaranteed structurally rather than by the counts that were measured, and the footer's height is unchanged across the measured ladder.
- AC-6 — The compact count names what it counts, singular at a total of one.
- AC-7 — In the CAS phase the settled batch count persists as a receipt, an indeterminate bar reads as working, and no element is rendered while its phase label is empty.
- AC-8 — Each of the three CAS sub-phases is announced, entry into CAS is announced once, and nothing is announced after the run ends.
- AC-9 — Every graduating row is archive-only, names its branch, carries no IN PROGRESS marker, and the diff the whole-diff review examined is the diff that merges.

## Dimensional invariants

The compact readout sits in the sticky footer, whose height is load-bearing (`components/admin/wizard/Step3ReviewWithFinalize.tsx:159-164` records the layout shift Doug flagged). The 2026-08-29 spec §3.3 states three relationships. This arc adds the fourth, and it is the one that decides row 2.

| Parent to child | Relationship | Guaranteed by |
| --- | --- | --- |
| `wizard-step3-footer-center` (`min-h-12 w-full max-w-md`) to `wizard-step3-tracking` | The tracking block never exceeds the reserved 48px, so the footer is the same height running as idle | The reserved `min-h-12` plus every line inside the tracking block being exactly one line |
| Heading row (`flex items-baseline justify-between gap-2`) to the heading span | The heading occupies exactly one line at 375px **at any count width** | `min-w-0 truncate`, added by task 4. Before it: nothing. The span carried neither, so it was the flexible item and wrapped once the count grew, which is why a measured ladder could not authorize the noun |
| Heading row to the count span | The count never shrinks or wraps | `shrink-0 tabular-nums` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:264`), unchanged |
| `wizard-step3-tracking` to the subline | One line at any name length | `truncate` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:273`), unchanged |
| CAS heading row to its receipt | Same one-line guarantee as the batch heading row, same shape | Inherited from task 4's `min-w-0 truncate` on the heading, applied to the CAS row's heading too |

Tailwind v4 here does not default `.flex` to `align-items: stretch`; this plan introduces no new flex parent.

## Transition inventory

The rulings make CAS three states rather than two text lines. **A** batch (determinate bar, count, subline), **B** CAS entry (indeterminate bar, receipt, phase element suppressed), **C** CAS with a sub-phase (indeterminate bar, receipt, phase element painted). Three states, three pairs.

| Pair | Treatment |
| --- | --- |
| A to B | Instant. The subtree is replaced on the phase change. The bar switches from determinate to indeterminate in the same commit the receipt appears, because both read state set by one `setState` at `components/admin/FinalizeButton.tsx:400`. |
| B to C | Instant. The phase element goes from suppressed to painted, which is a `display` change and is not animatable. |
| C to C | Instant text swap inside one persistent node, as the sub-phase advances. |
| A to C | Does not occur directly: CAS is always entered before the first phase event, so A reaches C through B. |

Compound: a phase event arriving in the same commit as the batch-to-CAS transition passes through B within one commit rather than painting it, so the element is never painted empty even for a frame. There is no `AnimatePresence` and no `motion.*` in either renderer and none is added; `tests/components/admin/finalizeTransitionAudit.test.tsx` walks both renderers times both phases and gains the B-to-C pair in task 7.

## Guard conditions

| Input | Rendered |
| --- | --- |
| `casPhase: null` | No phase-label element at all (`element:empty` matches, `empty:hidden` applies, task 7). The receipt and the bar still render. |
| `settledTotal: 0` | No receipt. Reached by the non-stream path (`components/admin/FinalizeButton.tsx:201-204`, which returns zero rows processed and never sets either ref) and by a zero-row finish. The bar still renders; it reports activity, not a count. |
| Finish mode (checkpoint resume) | No receipt, and this is the case that matters. `runLoop` resets both accumulators every attempt (`components/admin/FinalizeButton.tsx:325-326`) and `mode === "finish"` skips the batch loop entirely (`components/admin/FinalizeButton.tsx:330`), so CAS is reached with both refs at zero. Correct, since there is no batch in THIS session to report, but deliberate rather than incidental: this is the flow an operator lands in after reloading mid-finalize, which is the outcome the row exists to prevent. Its own case, because an implementation seeding the receipt from a checkpoint would pass every other case and print a count for work this run did not do. |
| `settledTotal: 1` | `1 of 1 show set up`, singular, per `components/admin/FinalizeButton.tsx:1006`. |
| `total: 0` in the batch phase | No count and no noun. The existing `state.total > 0` guard (`components/admin/wizard/Step3ReviewWithFinalize.tsx:263`) is unchanged, so task 5 adds no new empty-string case. |
| `total: 1` in the batch phase | `1 of 1 show`, singular. Covered by its own case, because a suite testing only the plural lets `1 of 1 shows` regress silently. |
| `done > total` | Existing `Math.min` clamp, unchanged. |
| A count wider than any measured rung | One line regardless. Task 4 makes the guarantee structural (`min-w-0 truncate`), so it holds for totals nobody sampled. This is the guard the measured ladder could not provide. |
| `prefers-reduced-motion: reduce` | Indeterminate track paints a static centred accent hint, no animation, in every engine. Today: in Firefox only. |
| Run ends (any terminal state) | The announcer says nothing. `liveMessage` stays empty for every non-running state, pinned by its own case in task 9. |

## Invariants

| Invariant | Bearing |
| --- | --- |
| 1 TDD per task | Every task is failing test first. Task 4 is a measurement whose recorded numbers are its deliverable, and its assertion is written against them. |
| 2 Advisory lock | Untouched. No lock acquired, released or nested. |
| 5 No raw error codes in UI | No new codes, no `lib/messages` change. |
| 7 Spec is canonical | The 2026-08-29 spec's §3.2 unchanged-list, §3.3 dimensional table and §5's "No Playwright task" line all move with the code, in the commits that move it. |
| 8 UI quality gate | `components/**` and `app/globals.css` touched, so the impeccable pair runs before the whole-diff review and the closeout marker line is written by task 9. |
| 9 Supabase call boundary | No new Supabase call sites. |
| 10 Mutation-surface observability | No mutating route or action on the diff. |
| 11 Worktree | `/Users/ericweiss/FX-worktrees/finalizeprog`, branched off `origin/main` at `47e9544e6`. |
| 12 Ledger | Four rows claimed at Stage 0 and pushed; graduating rows archived in the PR's last commit. |

## Spec amendments (invariant 7)

The 2026-08-29 spec is canonical, so every claim this arc falsifies moves in the commit that falsifies it. An earlier draft named only §3.2, §3.3 and §5, which left three canonical sections asserting things the code now contradicts.

| Section | What goes stale | Lands with |
| --- | --- | --- |
| §1.1, the resolved-scope row reading "The `N of M` count, the progress bar, the CAS-phase copy, and the idle button label are unchanged" | Three of its four clauses. The bar is themed (task 1) and gains a CAS instance (task 7); the count gains a noun (task 5); CAS copy gains a receipt (task 6) and its assistive copy changes (task 9). The idle button label is genuinely untouched. | Each clause with its own task; the row is rewritten once, in task 1, then narrowed as each lands |
| §3.2's "Unchanged:" line | The `N of M` count (task 4); the CAS sub-label's ELEMENT, though the `casPhaseLabel` function really is untouched (task 7); the progress bar geometry in the CAS phase (task 6) | Tasks 4, 6, 7 |
| §3.2's "No client state is added" | False from task 5: the CAS state variant gains `settledDone` and `settledTotal`. The sentence is about the SUBLINE reading `state.lastName` alone, which stays true, so the amendment narrows it to that claim rather than deleting it | Task 5 |
| §3.3's dimensional table | Gains the heading-row relationship and the `min-w-0 truncate` that guarantees it | Task 3 |
| §3.3's "No element is added or removed; only the text content of existing nodes changes" | False from tasks 5 to 7: a receipt and a progress element are added, and a phase element is suppressed. This is the sentence the whole footer-height proof rests on, so the amendment restates the proof over the new children rather than striking the line | Tasks 5, 6, 7 |
| §3.4's transition inventory | CAS becomes three states; the inventory is restated over them | Task 6, extended by task 7 |
| §5's test plan, including "No Playwright task" | This arc introduces exactly what that sentence said did not exist: a geometry claim not carried by an unchanged `truncate`. The sentence is superseded and dated, not deleted, so the original judgement stays legible | Task 1 |
| §7's out-of-scope fence | Records Eric's 2026-08-31 lift for the settled receipt, with the publish-count fence otherwise intact. Both halves, because a fence recording only its lift reads as repealed | Task 5 |

Line anchors in §3.2 drift as tasks 4 through 8 edit `components/admin/FinalizeButton.tsx` above them. Per `docs/agents/spec-self-review.md` a drifted anchor on an otherwise-correct claim is not a finding and no refresh commit is owed; anchors are re-verified only where this arc puts the CLAIM in question, which is the rows above.

## Do not relitigate

| Decision | Ratified at |
| --- | --- |
| The batch phase's `<progress>` plus `FinalizeAnnouncer` split is sound; the perceivability defect is CAS-phase only. Do not add double-announcement to the batch phase. | `DEFERRED.md` `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1`; `components/admin/FinalizeButton.tsx:459-469` records why completion goes through the channel and not the local announcer. |
| `casPhaseLabel(null)` returning `""` is deliberate, not a bug. Row 3 suppresses the ELEMENT, never changes the function. | `components/admin/FinalizeButton.tsx:122-125`. |
| The bare compact count is the current correct state. The earlier fix was reverted and the revert stands until a measurement licenses otherwise. | `tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335`. |
| No per-row publish claim on the progress stream; no publish count on the CAS phase. | `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` §2.1, §7. |
| Rows 3 and 4 were Eric's calls and they are MADE: both fences lifted 2026-08-31, the critique's recommendation taken whole. Review the implementation, not the product decision. | Ruling relayed by bl-orch, 2026-08-31 |
| The receipt is a set-up count, not a publish count, so the 2026-08-29 spec §7 fence stands. Nothing counts publishes during CAS. | bl-orch ratification, 2026-08-31, in reply to this arc's flag |
| This arc files no new ledger row of any facing. Unrepairable peers go in the PR body under "Unfixed peers". | the common arc brief; AGENTS.md process mint freeze, 2026-08-25. |

## Red coverage matrix

**This is the class-level repair for the defect behind nine of the twenty-two findings across three review rounds** (r1 finding 1; r2 findings 1, 3, 4, 8; r3 all four): a task's `red=` command does not transitively execute every assertion the task body promises. Patching instances was not converging, so the rule is stated once and the table is DERIVED from the markers rather than transcribed.

**Rule one: every assertion a task promises lives in a suite that task's own `red=` runs.**

**Rule two: a command naming more than one suite must run all of them.** Round 3 executed task 9's command and found it exited before Vitest ever started, because an `&&` after a failing shell gate short-circuits. `spec:lint` emits `RED_CONJUNCTION` as an advisory for exactly this; under this plan's own closed criterion it is blocking. Every multi-suite command therefore collects each result and decides the exit only after all have run:

```
sh -c 'a=0; b=0; <first> || a=1; <second> || b=1; echo "first=$a second=$b"; [ "$a" = 0 ] && [ "$b" = 0 ]'
```

Verified: with the first failing and the second passing it still runs the second and reports `first=1 second=0`, exit 1. A multi-file `vitest run` needs no wrapper, since Vitest runs every named file and fails if any does.

| Task | red-state | Suites the command runs | Why that set |
| --- | --- | --- | --- |
| 1 | authored | shimmer guard, e2e spec, `_metaSpecRegistration`, webkit wiring | Source, browser, and BOTH registration guards. A stale standalone baseline or an unwired WebKit project otherwise passes silently while AC-3 promises two engines. |
| 2 | authored | shimmer guard | The docstring assertion pairs a comment with the stylesheet, so it sits beside the stylesheet's other assertions. |
| 3 | authored | e2e spec | Real layout. jsdom computes none. |
| 4 | authored | `Step3ReviewWithFinalize.test.tsx` | The count is rendered by the compact renderer only. |
| 5 | authored | `FinalizeButton` + `Step3ReviewWithFinalize` | **Two suites: the receipt is implemented twice.** |
| 6 | authored | `FinalizeButton` + `Step3ReviewWithFinalize` | Same: the CAS bar is added to both renderers. |
| 7 | authored | e2e spec, transition audit, DESIGN.md sites guard | Three, because this task promises assertions in all three. The geometry oracle needs real layout; the audit gains the B-to-C pair; §7a's list gains two names. |
| 8 | authored | `FinalizeButton.test.tsx` | **One is correct, and the asymmetry with 5 and 6 is the point.** `liveMessage` is computed once in `useFinalizeRun` and both renderers mount the SAME announcer, so the string is shared, not duplicated. Duplicated MARKUP needs both suites; a shared computed value needs one. |
| 9 | live | graduation + in-progress ledger suites | The shell gate alone passes if the four rows are DELETED rather than archived. |

Three defects this matrix caught with no reviewer involved, across the rounds it has existed:

- **A `red-state=live` claim on a suite that passes today.** `pnpm vitest run tests/styles/progressShimmerPseudoElements.test.ts` reports 6 passed on this base, so the claim was false; that marker now reads `authored`.
- **The one-suite-versus-two question had a principled answer**, recorded in the table: duplicated markup needs both, a shared computed value needs one. Before stating it the choice was being made per task by eye, which is how a task ended up running half its promise.
- **A task with no valid red at all.** Round 3 found that a separately-numbered harness task could never be red, since a newly authored spec passes the moment the production code is already correct. Tasks 1 and 2 merged: the two halves prove different things about the same defect, so they share its cycle.

<!-- tasks: depth=2 red-contract -->

## Task 1 — both wizard bars are themed, proved at the source and in two engines

<!-- task: red=`sh -c 'g=0; b=0; pnpm vitest run tests/styles/progressShimmerPseudoElements.test.ts || g=1; pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts || b=1; pnpm vitest run tests/ci/_metaSpecRegistration.test.ts tests/ci/standalone-webkit-a11y-wiring.test.ts || b=1; echo "guard=$g browser_and_wiring=$b"; [ "$g" = 0 ] && [ "$b" = 0 ]'` red-state=authored red-target=`app/globals.css:688` why=`app/globals.css styles wizard-step2-progressbar alone and holds one comma-grouped mixed-vendor reduced-motion list, so BOTH halves fail on the production stylesheet: the rewritten source guard because no rule carries the finalize testid and the override is not two single-vendor rules, and the browser spec because the finalize bar paints the UA default. Every conjunct RUNS and reports before any decides the exit, so both are observed reds rather than one short-circuiting the other. The SAME command greens when the CSS change lands` ac=AC-1,AC-2,AC-3 -->

**Why the source guard and the browser harness are ONE task.** An earlier draft split them, and review round 3 was right that the second half then had no valid red: once the CSS is correct and both components already emit the testid, a newly authored browser spec passes the moment it exists. A missing test file is not a production failure. The two halves prove different things about the SAME defect, so they share its cycle: the guard proves the stylesheet says it (including the Mozilla rules, which no engine the standalone suite runs can observe), the browser proves an engine agrees and that the shipped elements wear it.

**The red command runs every suite this task promises, and none short-circuits.** Three earlier drafts named suites in prose that the command never executed, which is the class round 3 closed. The shell form collects each result and decides the exit only after all have run, so a failure in the first does not hide the third.

### RED, part one: rewrite `tests/styles/progressShimmerPseudoElements.test.ts`

Strictly stronger in four ways, because a rewrite that only relaxes is how a guard stops guarding:

1. A CSS scanner replaces the per-assertion regexes. The old `firstBlock` matched a selector immediately followed by `{`, so appending a second selector breaks cases `(a)`, `(b)` and the determinate coverage while the CSS is correct.
2. Every rule must carry BOTH testids. The old regexes were built from a constant naming only the step-2 form, so deleting the finalize selector from the Mozilla rules survived every assertion.
3. Case `(c)` inverts. It required the comma-grouped reduced-motion rule BY NAME, which is the defect: a selector list is invalid as a whole when any selector in it is, so a list holding both vendor track pseudo-elements is dropped by every engine knowing only one. It now requires two single-vendor rules and asserts neither carries the other vendor's pseudo.
4. The scanner gets its own cases. It strips comments from the WHOLE source before scanning, because a CSS comment can contain a comma and a per-selector strip runs after the split has already torn it in half; and it counts selector OCCURRENCES, not rules. Both were bugs in the first draft of this file, found by running the scanner against the real stylesheet. A count case pins that the scanner reaches the block at all, so a later `@layer` wrapper cannot make every assertion vacuous.

### RED, part two: the live-entry harness

Create tests/e2e/_step3FinalizeProgressLiveEntry.tsx and tests/e2e/step3-finalize-progress.layout.spec.ts per `tests/e2e/blocked-row-resolver-transitions.spec.ts:65-125`. `test` and `expect` come from `./helpers/fontFidelityFixture`.

**One renderer per page load**, selected by a query parameter: both renderers emit `data-testid="wizard-finalize-progressbar"` (`components/admin/FinalizeButton.tsx:983`, `components/admin/wizard/Step3ReviewWithFinalize.tsx:270`), so mounting both makes every locator for it ambiguous, and both would POST the finalize route against a `ReadableStream` that is read once.

**Readiness gate**: the host awaits the bundle's window hook, then the renderer's testid, then after each stream push the element whose text it changes. Never `networkidle`.

**A bundle-free page** carries four bare progress elements with unique ids, two per testid, one determinate and one indeterminate, sized by a style attribute rather than Tailwind utilities so it does not depend on which files the compiler was told to scan.

**AC-1 and what the theme dimension discriminates.** `--color-accent-runtime` is identical in all three theme blocks (`app/globals.css:388`, `app/globals.css:450`, `app/globals.css:502`), so asserting the fill twice proves nothing about theming. The TRACK varies (`app/globals.css:368`, `app/globals.css:439`, `app/globals.css:491`), and that is what the row complained about. The fill must equal the accent and NOT change across themes; the track MUST change. Each compared property carries its own premise that the value is not the UA default.

**AC-3 through the CSSOM, in two engines.** Computed style is vacuous here: Chromium reports `animation-name: none` on the webkit track pseudo even while the shimmer is applied, and WebKit exposes neither pseudo. The spec walks the parsed stylesheet for a reduce rule whose `selectorText` carries the webkit track pseudo and the finalize testid, and asserts it carries no Mozilla pseudo. The premise ranges over the WHOLE sheet, never over the progress rules, or it swallows the red it guards.

**A WebKit project, scoped to this spec**, following `standalone-webkit-load-eligibility` (`tests/e2e/standalone.config.ts:115`) and its reasoning: the evidence would otherwise be Chromium-only for a claim that is empirical per engine, on the engine Doug uses.

**The WebKit wiring guard is generalized, and that closes a gap this arc did not open.** `tests/ci/standalone-webkit-a11y-wiring.test.ts:25` pins ONE project by name, so `standalone-webkit-load-eligibility` is unguarded today and a third project would make two. The walk asserts the general property over every project resolving to WebKit: it launches WebKit, and it resolves at least one test. Verified feasible before adopting it, by listing both existing projects (5 tests and 1 test respectively), so the generalization drags in no pre-existing breakage. The a11y project KEEPS its exactly-one-test case, which is a specific claim about the joined-title grep trap; replacing it with the general property would be a relaxation dressed as a generalization.

Registration, all three or the unit suite reds: add the escaped alternative for this spec's stem to the `testMatch` alternation at `tests/e2e/standalone.config.ts:86`; regenerate the standalone baseline with `node scripts/check-standalone-baseline.mjs --write` and commit it; no workflow edit, since `.github/workflows/standalone-e2e.yml:70-71` runs the whole config. **Both registration guards are in this task's red command**, because a stale baseline or an unwired project otherwise passes silently.

The entry must live inside the repo: esbuild resolves `node_modules` from the entry file's directory. Bundle with the `next/navigation` and `node:crypto` aliases. Compile the CSS into the served workDir, because the helper appends the Inter face with a bare sibling src and `fontFidelityFixture` fails a page that falls off Inter.

### GREEN: the CSS change

Pre-computed and validated with the same scanner the guard ships:

```
before: 7 rules,  8 selector occurrences, one mixed-vendor reduced-motion list
after:  8 rules, 16 selector occurrences, two single-vendor reduced-motion rules
```

Widen all eight occurrences (`app/globals.css:688`, `app/globals.css:696`, `app/globals.css:700`, `app/globals.css:704`, `app/globals.css:717`, `app/globals.css:730`, `app/globals.css:756`, `app/globals.css:757`) so each rule's list carries both testids, and split the reduce block into one webkit rule and one Mozilla rule with the same declarations. Update the block's leading comment and record why the split is load-bearing rather than stylistic.

## Task 2 — the panel docstring claims something the code contradicts

<!-- task: red=`pnpm vitest run tests/styles/progressShimmerPseudoElements.test.ts` red-state=authored red-target=`components/admin/FinalizeButton.tsx:955` why=`the case does not exist yet, so this is authored rather than live: the suite passes today (6 passed, run at plan time). The new case asserts the ProgressPanel docstring makes no unqualified same-tokens claim, and :955 says the panel "mirrors <Step2Verify>'s scan panel (same tokens, same native bar)" while the two panels demonstrably differ in padding and surface tokens; that is false before this arc and still false after it, so the case fails on the shipped comment independently of what any other task did to the stylesheet; the SAME command greens when the sentence is rewritten to claim only the shared bar` ac=AC-4 -->

An earlier draft keyed this red on the stylesheet naming only one testid, which task 1 has already fixed by the time this task runs, so the stated condition was false and the red was invalid. The durable defect is different and is independent of task order: the panel does NOT use the same tokens as the step-2 scan panel. It sits on `bg-surface-sunken` with `p-tile-pad` (`components/admin/FinalizeButton.tsx:968`); the claim is wrong on the token half whatever happens to the bar half.

Rewrite the sentence to say what is true: the two wizard progress surfaces share the BAR's styling through `app/globals.css`, and the panel's container tokens are its own.

**Four pre-dispatch mutants, because this is a string-presence guard.** Record each result in the commit: (a) the sentence emptied; (b) the sentence with an appended suffix; (c) the sentence present but not live, moved into a neighbouring comment block so it exists in the file and not on the symbol the assertion reads; (d) the assertion's discriminating parameter varied, asserted against a different symbol's docstring. A guard that survives (c) or (d) is reading the file rather than the symbol.

## Task 3 — the compact heading holds one line at ANY count, not just measured ones

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts` red-state=authored red-target=`components/admin/wizard/Step3ReviewWithFinalize.tsx:256` why=`the new case renders the compact tracking at 375px with a deliberately extreme count and asserts the heading occupies exactly one line; the heading span at :256 carries neither min-w-0 nor truncate, so it is the flexible item in a justify-between row and it wraps, failing on the production markup; the SAME command greens when the span gains min-w-0 and truncate` ac=AC-5 -->

**The measurement alone cannot authorize the noun, which is why this task changes the guarantee rather than reporting one.** `state.total` is an unrestricted number accumulated across batches (`components/admin/FinalizeButton.tsx:220`), so five sampled rungs authorize nothing about the sixth. A plan that measured a ladder and then shipped the noun for every larger count would be asserting a bound it never established.

So the one-line guarantee becomes STRUCTURAL. The heading span gains `min-w-0` and `truncate`: `min-w-0` because a flex item defaults to `min-width: auto` and will not shrink below its content, and `truncate` because the heading is fixed copy while the count is the variable one, so the heading is the correct thing to yield. The count keeps `shrink-0` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:264`). The footer's height is then independent of the count's width at every total, and the 2026-08-29 spec's invariant holds for inputs nobody measured.

**The ladder is still run, as evidence rather than as authorization.** Samples at 1 of 2, 9 of 12, 12 of 12, 99 of 120, 120 of 120 and one deliberately extreme rung, each bare and with the noun, measured in one `page.evaluate` per sample (never two `Locator` reads: actionability scrolls between them). The table is recorded in this section and reported to bl-orch.

**Premises, on each case's own inputs.** The sample must be in the running batch phase with a total above zero, and the bare and noun-bearing texts must actually DIFFER. Without the second, a harness bug that renders the bare count twice reports equal heights and passes; asserting it once up front would not do, because each rung must prove its own render.

## Task 4 — the count says what it counts

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` red-state=authored red-target=`components/admin/wizard/Step3ReviewWithFinalize.tsx:265` why=`the new cases assert the compact count reads "1 of 2 shows" at a total of two and "1 of 1 show" at a total of one, while :265 renders the bare form with no noun at either total, so both fail on the production render; the SAME command greens when the noun lands with the singular rule. The existing case at :322-335 asserting the noun is absent is REPLACED here and its ratification comment rewritten to cite task 4` ac=AC-6 -->

Unconditional, because task 4 made the one-line guarantee structural rather than measured.

Append the noun at `components/admin/wizard/Step3ReviewWithFinalize.tsx:265`, matching the panel's singular rule at `components/admin/FinalizeButton.tsx:1006`. **Both totals are covered**: a suite testing only the plural lets `1 of 1 shows` regress silently, and the singular is a declared branch of this behaviour.

`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:322-335` pins the bare form and its body is a ratification record, so the replacement states what changed: the plan settled the bare form without a measurement because that worktree could not start a dev server, this arc took the measurement AND made the guarantee structural, and here are the numbers. A test comment that records a decision is rewritten when the decision changes, never quietly deleted.

## Task 5 — the settled batch count persists into CAS as a receipt

<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` red-state=authored red-target=`components/admin/FinalizeButton.tsx:108` why=`the new cases drive BOTH renderers into the CAS phase and assert a receipt naming the settled counts, at zero, one and many; the CAS state variant at :108 carries no counts at all, so neither render has a source for them and both suites fail on the production reducer; the SAME command greens when the variant carries settledDone and settledTotal and both branches render them. BOTH suites are named because the receipt is implemented twice, in two components, and a command running only the panel suite leaves the compact branch with no red at all` ac=AC-7 -->

Eric's ruling, 2026-08-31. One of three separate changes to this phase, each its own task and its own commit.

The counts are already tracked and readable synchronously at the transition: `completedRef` (`components/admin/FinalizeButton.tsx:184`, accumulated at `components/admin/FinalizeButton.tsx:382`) and `grandTotalRef` (`components/admin/FinalizeButton.tsx:185`, set at `components/admin/FinalizeButton.tsx:220`). The CAS variant gains both, set at the single transition site (`components/admin/FinalizeButton.tsx:400`). The phase-event reducer at `components/admin/FinalizeButton.tsx:289` already spreads the prior state, so it preserves them unedited.

**Guard conditions, all three covered by cases.** A settled total of zero renders no receipt: the non-stream path (`components/admin/FinalizeButton.tsx:201-204`) returns zero rows processed and never sets either ref, and a zero-row finish behaves the same. That is correct rather than a gap, since the run produced no per-row progress to report. Singular follows the rule at `components/admin/FinalizeButton.tsx:1006`.

**Scope fence, ratified, do not relitigate.** The 2026-08-29 spec §7 lists "A publish count on the CAS phase" as out of scope. The receipt is not one: that spec's finding was that the batch claimed to be PUBLISHING while it creates every show Held, which is why the copy became "Setting up your shows…", and the receipt carries that same ratified verb forward over work the batch already did and displayed. Nothing counts publishes during CAS. bl-orch ratified this reading on 2026-08-31 in reply to this arc's flag. §7 is amended in this commit to record the lift for this line only, fence otherwise intact.

**The receipt is implemented TWICE and therefore tested twice.** `components/admin/FinalizeButton.tsx` renders the panel form and `components/admin/wizard/Step3ReviewWithFinalize.tsx:283` the compact one; they are two components that independently render the same claim, which is exactly how one gets fixed and the other silently keeps the old shape. Each renderer gets the zero, singular and plural cases, not one renderer's three standing in for six.

The compact receipt inherits task 4's structural one-line guarantee, since it sits in the same heading-row shape.

## Task 6 — the CAS phase reads as working

<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` red-state=authored red-target=`components/admin/FinalizeButton.tsx:1017` why=`the new cases drive both renderers into the CAS phase and assert a progressbar element is present and indeterminate there; the CAS branch at :1017-1023 renders two text elements and no progress element at all, so both fail on the production markup; the SAME command greens when each branch renders an indeterminate bar` ac=AC-7 -->

The bar carries no `value` attribute, which is what makes it indeterminate, and reuses `wizard-finalize-progressbar`: it is the same element in a later phase, so it inherits task 1's theming and needs no third selector. `grep -rn 'wizard-finalize-progressbar' tests/` shows no assertion that the bar is absent during CAS, so nothing existing contradicts it. It reuses the accessible name `Show setup progress` so the group's name does not change across the phase boundary, which the 2026-08-29 spec §3.2 ratified deliberately.

**This is what makes task 2 a prerequisite rather than a tidy-up.** The CAS bar is indeterminate, so it takes the shimmer path, and the shimmer's reduced-motion override is exactly the rule probe 1 showed is dead in Chromium and WebKit. Without task 2 this ruling ships an unstoppable animation on the highest-stakes screen.

## Task 7 — no element is rendered while its label is empty

<!-- task: red=`sh -c 'a=0; b=0; pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-finalize-progress.layout.spec.ts || a=1; pnpm vitest run tests/components/admin/finalizeTransitionAudit.test.tsx tests/docs/designSevenAEmptyHiddenSites.test.ts || b=1; echo "geometry=$a audit_and_sites=$b"; [ "$a" = 0 ] && [ "$b" = 0 ]'` red-state=authored red-target=`components/admin/FinalizeButton.tsx:1021` why=`the geometry case compares the PARENT column's height against its height with the phase element removed from the DOM; today they differ by one gap because a zero-height in-flow item still charges its parent's gap, so it fails on the production markup. Asserting the CHILD contributes no extent would NOT be red: an empty block already has zero height. The transition audit and the DESIGN.md sites guard are in the SAME command because this task promises assertions in both and a command running only Playwright leaves them unexecuted; every conjunct runs before any decides the exit` ac=AC-7 -->

The behavioural assertion is the red, per the marker contract: keying it on `tests/docs/designSevenAEmptyHiddenSites.test.ts` would be green before the change, red only after adding the class, and green again through a documentation edit, which is implementation-before-red.

**The oracle is the PARENT's geometry, not the child's.** An earlier draft asserted the phase element "contributes no extent", which the current markup already satisfies: an empty block has zero height. The defect is that a zero-height in-flow item still charges its parent's `gap`, so the column is one gap taller than its content. The discriminating comparison is the column's height with the empty element present against its height with that element removed from the DOM; they differ by exactly one gap today and must be equal after. Measured with the element's own removal rather than a hardcoded gap value, so a later spacing-token change cannot silently make it pass.

`casPhaseLabel` returns an empty string before the first phase event (`components/admin/FinalizeButton.tsx:122-125`) and React leaves zero child nodes for it, so `element:empty` matches (probe 2). DESIGN.md §7a is the ratified idiom and prefers keeping the documented slot over collapsing it into a conditional.

§7a's "Current sites" list gains both component names in the same commit, in the "Current sites:" sentence itself (`DESIGN.md:843`). Both basenames are unique under `components/`, so a plain basename satisfies the guard; the guard's search window extends past that sentence to the next heading, so a name parked in a neighbouring paragraph would also pass, which is exactly the stale-list shape it exists to prevent. Do not narrow the guard's walk.

**Transition-audit obligation.** `tests/components/admin/finalizeTransitionAudit.test.tsx` already walks both renderers times both phases and is this plan's transition-audit task. It gains the pair from the inventory: with CAS entered and no phase event, the element is suppressed; when the first event arrives it paints, instant on both sides. Its two documented limits are unchanged and not reopened.

## Task 8 — every CAS sub-step is spoken

<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx` red-state=authored red-target=`components/admin/FinalizeButton.tsx:481` why=`the new cases drive the CAS phase to applying, then publishing, then subscribing and assert the announcer names each one, while liveMessage at :481 keys on phase alone and returns the constant "Finishing setup" for all three, so all three fail on the production reducer; the SAME command greens when the sub-phases fold in` ac=AC-8 -->

**All FOUR cadence branches are covered.** Three sub-phases plus the null-phase CAS entry, and a suite missing any of them is satisfied by an implementation that violates AC-8:

- Only `applying` tested: an implementation announcing that one and leaving `publishing` and `subscribing` silent passes.
- The null phase untested: an implementation returning an empty string for a null `casPhase` and the three strings afterwards passes every sub-phase case while never announcing entry into CAS at all, which AC-8 requires happen once.

The three sub-phase cases are DERIVED from the phase union rather than written out, so a fourth `FinalizeCasPhase` added later fails here instead of arriving uncovered.

Fold the sub-phase into `liveMessage` (`components/admin/FinalizeButton.tsx:481-486`), keeping the phase-alone message for a null `casPhase` so entry into CAS still announces once. UP TO four utterances per run, per the ruling. Not exactly four: the non-stream path and an early terminal state both end a run before every sub-phase arrives, so a plan promising four would be asserting a floor the code does not provide.

**The announcer strings are stated explicitly, not derived from the visible copy.** The precedent is two lines away in the same reducer: the batch phase's visible heading is `Setting up your shows…` while its `liveMessage` is `Setting up your shows` with no ellipsis (`components/admin/FinalizeButton.tsx:481-486` against `components/admin/FinalizeButton.tsx:974`). The ellipsis is a visual affordance, not speech. So the sub-phases are announced as `Applying your edits`, `Making shows live` and `Connecting your folder`. A regex turning display copy into speech copy breaks the next time someone edits either.

**A fourth case pins silence after the run.** `liveMessage` must stay empty for every non-running state. The existing completion assertion (`tests/components/admin/FinalizeButton.test.tsx:1044-1055`) only forbids the completion sentence in the local announcer, so a fold that returned a stale sub-phase after the run would pass it while the announcer spoke a finished step. That case does not exist today and the repair is exactly what would introduce it.

Two fences: completion goes through the channel and never the local announcer (`components/admin/FinalizeButton.tsx:459-469`), and the batch phase's split stays as it is.

## Task 9 — close out, BEFORE the whole-diff review

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-31-finalize-progress-polish.md; a=0; b=0; c=0; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" "$P" || a=1; grep -qE "^\\*\\*Status:\\*\\* IN PROGRESS" DEFERRED.md && b=1; pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts || c=1; echo "marker_missing=$a in_progress_present=$b ledger_suites_failed=$c"; [ "$a" = 0 ] && [ "$b" = 0 ] && [ "$c" = 0 ]'` red-state=live red-target=`docs/superpowers/plans/2026-08-31-finalize-progress-polish.md:1` why=`all THREE conditions are evaluated and printed before any decides the exit. An earlier form conjoined the vitest run with && after the shell gate, so the gate's own non-zero exit meant the suites never ran at all: review round 3 executed the command and confirmed it exited before Vitest started. The shell gate alone passes if the four rows are DELETED rather than archived, which is what the two ledger suites are here to catch, so they must actually execute` ac=AC-9 -->

**Order, and why it is not the usual one.** This task runs after the impeccable pair and BEFORE the whole-diff Codex review. An earlier draft put it after, which would have meant the reviewed diff and the merged diff were different documents: this commit edits the plan, archives ledger rows and extends a registry. The handoff rule is that the diff the final review examined is the diff that merges, so closeout comes first and the review sees everything.

Every row whose tasks shipped moves from `DEFERRED.md` to `DEFERRED-archive.md`, its archived section naming this branch, and its id joins `GRADUATED` at `tests/docs/_metaDeferralLedgerGraduation.test.ts:72`.

**Deleting the four entries would satisfy the shell gate and nothing else**, which is why the graduation suite is part of this task's command rather than left to the full run. That suite requires every id in `GRADUATED` to be present in the archive and absent from the open queue (`tests/docs/_metaDeferralLedgerGraduation.test.ts:853-859`), so an id registered but not archived reds, and an id archived but not registered leaves the registry stale. Branch provenance on the DEFERRED side is carried by the archived section's own prose, written here. **A row graduates only when ALL of its tasks shipped.** Row 3 spans tasks 6, 7 and 8; a partial implementation leaves it in the open queue with its marker removed, because archiving a row whose receipt or bar is unresolved is the ledger asserting a completion the code contradicts, which is the defect the row above it already records.

Every remaining IN PROGRESS marker for this branch comes off here, before the merge: a marker that reaches main names a branch the merge deleted and reds `tests/docs/_metaLedgerInProgress.test.ts`.

The `impeccable-gate:` marker line is written here and nowhere earlier: `tests/docs/_invariant8Closeout.ts:49` treats any non-conforming line as malformed and one malformed line reds the unit, so a placeholder is worse than nothing.

<!-- tasks: end -->

## Impeccable dispositions

The invariant-8 pair ran on the UI diff (`app/globals.css`, `components/admin/FinalizeButton.tsx`, `components/admin/wizard/Step3ReviewWithFinalize.tsx`, `DESIGN.md`) before the closeout commit and before the whole-diff review.

**Critique: dual-agent.** Assessment A (design review) and Assessment B (detector plus static evidence) ran as two isolated sub-agents and did not see each other's output, so this is not a degraded run. **One step was skipped: browser visualization**, because a fleet-wide hold on heavy phases was in force for the whole gate. The detector itself is a plain node script and DID run: `detect.mjs --json` on both changed components returned exit 0 with zero findings.

Three claims the e2e specs assert could therefore not be re-verified inside the gate. All three were measured in a browser earlier in this arc, before the hold, and their numbers are in the commits that made them: the footer flat at 54.6px across the count ladder at 375px, the empty CAS label charging exactly 4px of gap, and the accent paint sampled from rendered pixels.

**Audit: 17/20, Strong, no AI tells.** Accessibility 3, Performance 3, Theming 4, Responsive 3, Anti-patterns 4. It read the shimmer guard as exemplary and confirmed the diff REMOVES a pre-existing footer jolt at the phase boundary. Its skipped steps are the same browser-dependent ones, under the same hold.

**Audit, RE-RUN 2026-09-01 WITH the browser steps, after bl-orch lifted the hold and ordered exactly that.** The re-run drove both renderers through both phases from the arc's own live-entry harness (the real component tree, the real compiled `app/globals.css`) across theme times viewport times phase, sixteen scenes, plus dedicated reduced-motion, keyboard and paint probes. It is the half of the pair the first pass could only reason about, and it did not agree with the reasoning:

- **Contrast, measured rather than inferred:** every text node in every scene clears its WCAG AA floor. The arc's own strings measure 6.09 to 6.94 on the subtle token and 15.5 to 18.4 on the strong one. Nothing is below floor anywhere.
- **Tap targets at 375px:** the only sub-44px hits are `wizard-step3-select-all` and the row checkbox, both the census-registered visually-hidden-input pattern where the `<label>` row carries the floor (`tests/styles/tapTargetCensus.ts:230`). Neither is on this arc's surface.
- **Horizontal overflow:** none, in any of the sixteen scenes.
- **Keyboard:** the running group takes focus programmatically, is `tabIndex=-1` by design (it is a focus TARGET, not a tab stop), carries `role="group"`, its `aria-label` and `aria-busy`, and keeps its five `focus-visible:ring-*` classes. The tab order around it is unchanged.
- **One new P1, fixed here** (the indeterminate bar's resting frame), and **one owed P2 settled** (the CAS receipt at 375px). Both are below.

The browser steps are what found the P1, and no amount of re-reading the CSS would have: the defect is that a rule Chromium accepts is a rule Chromium does not RUN.

### Fixed in this arc

| Finding | Severity | Disposition |
| --- | --- | --- |
| The receipt could overclaim: `settledDone` and `settledTotal` are fed by different events, so a stream whose row events disagree with its `listed` total drives them apart. Reproduced as "5 of 1 show set up". | P2 | FIXED. Clamped, matching every peer count in these renderers. The case parses the fraction rather than matching a literal, after a first draft asserted "2 of 1" and passed against a render of "5 of 1". |
| The announcement dropped the denominator the screen shows: visible "2 of 3 shows set up", announced "2 shows set up". The clamp above proves the two accumulators diverge, so the partial case is real and "of 3" is information rather than a formality. Plural also keyed on the done count in speech and the total on screen. | P2 | FIXED. Both now key on the total. The case's own premise caught its first fixture: matching totals rendered "3 of 3", where the two forms would have agreed by accident. |
| The group reported no state. Every visible string is `aria-hidden` and the CAS bar carries no value, so a virtual-cursor user re-reading the group between utterances found a named group with nothing perceivable in it. | P3 | FIXED. `aria-busy` answers "is it still working?" without adding speech; the panel only mounts while the run is live, so it is unconditional. |
| The reassurance was sighted-only: the receipt is `aria-hidden`, so a screen-reader operator heard four verbs across the CAS phase and never a number. The same gap `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1` is about, reintroduced by the commit that added the receipt. | P1 | FIXED. The count rides the CAS-entry utterance once. Not per sub-step: four numbers where one is the reassurance is the chattiness this announcer is built against. |
| **The indeterminate bar painted no accent at rest, and on Chromium and WebKit "at rest" is all there is.** The `animation` declared on `::-webkit-progress-bar` does not run on those engines, so `background-position` is the permanent painted state rather than a starting frame. It was `-40%`, which parks the 40%-wide gradient entirely off the left edge: sampled across the full width, flat track with one faint bleed column at the far left (light `rgb(255,218,182)`, dark `rgb(101,65,32)`) and nothing else, in both themes. The reduced-motion override pins `50%` and painted a clean centred accent, so the user who asked for LESS motion was getting MORE signal than the user who asked for nothing. `FINALIZE-CAS-PROGRESS-AFFORDANCE-1`'s repair, an indeterminate bar for the CAS phase, did not visually land at all. | P1 | FIXED, resting position now `50%` on both indeterminate rules. Proved rather than argued, because "the animation does not run" is the kind of claim a headless environment fakes: two screenshots 260ms apart were byte-identical, `getAnimations({subtree:true})` returned zero entries, and a control `<div>` carrying the IDENTICAL `@keyframes` on the same page in the same run produced four distinct frames and reported one entry. Firefox is unaffected: it runs the animation and the keyframes name -40% and 140% explicitly at both ends, so they override the base for the whole cycle. Class-swept to a derivation rather than a list, because both bars are one declaration: step 2's scan bar had the same dead resting frame from the day the shimmer shipped and is repaired by the same line, which is why the new case is written over both ids. |
| **The CAS receipt string at 375px**, owed by the first pass and left owed rather than assumed safe: the ladder had measured the BATCH string, and the receipt is about nine characters longer with the same unshrinking-heading-beside-a-`shrink-0`-count shape. | P2 | SETTLED, no change needed. Measured on the real component at 375px across `1 of 1` through `999999 of 999999 shows set up`: the heading holds one line at every rung (`scrollWidth <= clientWidth` throughout), the receipt stays a single 20px row, and the group is flat at 30.3px with the phase label suppressed and 54.6px once a phase lands. That 30.3 to 54.6 step is the same `empty:hidden` dip the P3 below already records, measured from the other side. |

### Not fixed here, and why. None is filed as a ledger row.

Per the arc brief this arc files no new `BL-`/`DEF-` row of any facing; unfixed peers go to the PR body and the readiness message, and bl-orch decides whether any earns a row.

| Finding | Severity | Why it is not fixed here |
| --- | --- | --- |
| **The bar rewinds at the batch-to-CAS boundary.** React reconciles both ternary branches by position and type, and both fragments open with a heading then a `<progress>`, so it is literally the same DOM node snapping from a full fill to an empty shimmer. Progress appearing to regress is the canonical progress anti-pattern, and this arc introduced it. | P1 | The reviewer's preferred repair is a monotonic bar (batch 0-80%, the three enumerated CAS phases 80-100%; `FinalizeCasPhase` is a closed three-value union, so a percentage IS knowable). That contradicts Eric's 2026-08-31 ruling of an INDETERMINATE bar for the CAS phase. Changing a ruled design decision is bl-orch's call to route, not this arc's to take. |
| **The non-stream path plus CAS entry reads as hung.** `empty:hidden` removes the phase label until the first event; on the non-stream path `settledTotal` is 0 so no receipt renders; and in the panel composition the trigger is replaced, so there is no spinner. Net: a heading and a motionless bar, indefinitely. | P1 | The repair the reviewer proposes (render all three sub-steps as a static list with the current one marked) is new design on a surface the ruling already settled, so routing it is bl-orch's call. **The re-run corrected this finding's own premise and made it WIDER.** The critique scoped it to `prefers-reduced-motion` users, on the reading that the shimmer moves for everyone else. It does not move for anyone on Chromium or WebKit: the animation on `::-webkit-progress-bar` never runs there, proved by control below. So the motionless bar is the DEFAULT experience on the engines Doug uses, not a narrow intersection, and "narrow is not a defence" is not even the argument that applies. What the P1 fix below changes is the bar's information content, not its motion: it now rests showing a centred accent instead of an empty track, so the screen is no longer indistinguishable from a determinate bar at zero. The hang reading survives that and is carried to bl-orch. |
| **The accent fill on the raised track is 2.33:1 in light mode**, below the 3:1 SC 1.4.11 non-text floor, and §1.2 carries no row for the pairing. | P2 | Inherited from the step-2 selector set and predates this diff; what is new is that the bar is now a site where it is the sole graphical activity signal. Meaning never rests on it alone (the "Finishing setup…" heading always renders), and DESIGN.md already concedes the brand orange is decorative-only at this ratio. Repairing it changes a ratified brand token across two wizard steps. |
| **Polite live regions coalesce, and the audit sharpened this onto the fix made here.** The settled count now rides the CAS-entry utterance, which the first phase event overwrites; screen readers debounce polite regions roughly 100-500ms and commonly read only the latest value. So the one number this arc added specifically to reach assistive tech is also the likeliest to be swallowed, and the same mechanism means "every sub-step is spoken" is queued rather than guaranteed. | P1 | NOT FIXED. The repairs on offer are a minimum-dwell hold or appending the count to the first sub-phase utterance; the first is timing machinery in a reducer, and neither can be verified against a real screen reader under the fleet hold. The change is not WORSE than before (there was no count at all), so it stands as a partial improvement with the limit stated rather than being reverted or overclaimed. |
| **The shimmer repaints inside a `position: fixed` layer.** `background-position` is paint-per-frame rather than composited, and the compact renderer is the first site to put this bar inside the fixed footer, so it can repaint that layer while Doug scrolls the review list on a phone. | P3 | Small area, and the same posture as the inherited accent-contrast peer: a new SITE for an existing mechanism rather than a new mechanism. |
| **A 6px dip at CAS entry.** `empty:hidden` drops the phase slot before the first event, so the column is 30px then 54px once a phase lands. Largely absorbed by the `min-h-12` floor. | P3 | Noted for the tension it creates with this arc's own height-invariance argument. §7a is correctly applied and correctly documented. |
| **Duplicated accessible name**: the group and the progress element are both "Show setup progress". | P3 | No fix. Both names are valid, it is not a 1.3.1 or 4.1.2 failure, and stripping either is worse: an unnamed focus target announces nothing and an unnamed progressbar is its own smell. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=5 dispositions=recorded

Five P1s. The critique's three (the bar rewinding at the phase boundary, the non-stream screen that reads as hung, the reassurance being sighted-only), the first audit pass's one (the settled count racing the first phase event into a polite region), and the ordered re-run's one (the indeterminate bar resting off-canvas). **Two are fixed here**, the sighted-only reassurance and the resting frame. Three are dispositioned above and carried to bl-orch as unfixed peers: each repair either contradicts a ruled design decision or needs a real-screen-reader verification no browser probe can stand in for. No P0 in either half.

Both halves of the pair have now run with their browser steps, so nothing in this section is owed. The re-run is worth its own sentence for whoever reads this next: it found a P1 on a surface that had already passed a critique, an audit and a whole-diff adversarial round, and the reason all three missed it is that they were all reading the stylesheet. The rule is valid CSS, it cascades correctly, the reduced-motion override that guards it is the one this arc went to some trouble to prove single-vendor, and the shipped bar was still blank. Only pixels say so.

## Round economy

Rounds restart at 1 on this branch, keyed by `git merge-base origin/main HEAD`. Cap is four per stage. At the cap the filing goes in the branch directory under `docs/review-rounds/fix/finalize-progress-polish/`, and any later brief states the closed criterion only.

## Self-review record

### Round 1 findings and their dispositions

**Task numbers in this table and the next are as of THAT round.** Tasks have since been merged and renumbered twice, and these are dated records of what a finding referred to when it was raised. Correcting them would make each finding cite a task it was not about.

Codex returned BLOCKING with 10 findings. **All ten are accepted; none is disputed.** Four were repairs to claims this plan made about itself, which is the expensive kind.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Four RED contracts invalid | Task 3's red re-keyed onto the docstring's false "same tokens" claim, which is wrong before AND after task 1 and so is order-independent. Task 4's placeholder expectation deleted; its red is now the structural one-line assertion against a real production line. Task 8's red moved from the docs guard to the behavioural browser assertion. Task 10's gate rewritten to evaluate and print BOTH conditions before either decides the exit. |
| 2 | Premises do not close all tautologies | AC-2 now carries a per-property premise rather than one covering the filled track alone. Task 4 additionally asserts the bare and noun-bearing texts DIFFER, without which a harness bug rendering the bare count twice reports equal heights and passes. |
| 3 | AC-2 and the guard do not prove all eight widenings | The structural guard now requires both testids at all eight selector occurrences, which is the engine-independent half; the browser proves only what an engine will report, and the plan says so. `firstBlock` made selector-list aware with a planted mutant, since appending a selector breaks cases `(a)`, `(b)` and the determinate coverage while the CSS is correct. |
| 4 | The sweep record is factually wrong | Corrected: 24 lines, not 10, across two files; three comment lines, not four. The old numbers were a filtered count reported as an unfiltered one. The conclusion survives; the record did not. |
| 5 | The ladder does not bound the input it authorizes | Accepted in full, and it changed the design rather than the prose. `total` is unbounded, so five rungs authorize nothing about the sixth. Task 4 now makes the one-line guarantee STRUCTURAL (`min-w-0 truncate`), the ladder becomes evidence, and task 5 stops being measurement-gated. |
| 6 | Two declared branches lack coverage | Singular totals covered in tasks 5 and 6; all three CAS sub-phases covered in task 9, plus a fourth case pinning silence after the run. |
| 7 | Partial-ruling mapping | The premise is moot (the ruling took all three recommendations) but the substance stands: task 6 was three changes in one task. Split into tasks 6, 7 and 8, one commit each, and task 10 graduates row 3 only when all three shipped. |
| 8 | The amendment list misses stale canonical sections | §1.1, §3.4 and §5's test plan added. The full table is the new "Spec amendments" section. |
| 9 | The final review does not cover what merges | Closeout moved BEFORE the whole-diff review. It edits the plan, archives rows and extends a registry, so running it after would mean the reviewed diff and the merged diff are different documents. |
| 10 | Harness readiness gate omitted | Stated in task 1: the window hook, then the renderer's testid, then the element each push mutates. Never `networkidle`. |

### Round 2 findings and their dispositions

Codex returned BLOCKING with 8 findings. **All eight accepted; none disputed.**

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Task 1 widened selectors before their red existed; task 2's browser assertion was not in its own red command | The two tasks swapped and were re-scoped. The SOURCE guard leads, because it is engine-independent and is the only thing that can ever be red for the Mozilla rules; the browser confirms afterwards. |
| 2 | AC-3 named three engines; the assertion reached one | Task 2 adds a WebKit project scoped to this spec, following the `standalone-webkit-load-eligibility` precedent and its reasoning. AC-3 now claims Chromium and WebKit only, and says plainly that Firefox is established by probe and source rather than by CI. The stale computed-animation oracle in the meta-test inventory is gone. |
| 3 | Task 6 never ran the compact renderer's suite | Both suites are in its red command, and each renderer gets the zero, singular and plural cases. The receipt is implemented twice, so it is tested twice. |
| 4 | Task 8's red was not guaranteed red | Correct and sharp: an empty block already has zero height, so "contributes no extent" passes today. The oracle is now the PARENT column's height with the empty element present versus removed, which differ by exactly one gap. |
| 5 | Task 9 left the null-phase entry branch untested, and "four utterances" contradicted the owner's "up to four" | Fourth case added; the prose now says up to four and names why a floor of four would be wrong. |
| 6 | Two more canonical assertions go stale (§3.2 "No client state is added", §3.3 "no element is added or removed") | Both added to the amendment table, each narrowed rather than struck, since each has a true residue. |
| 7 | Four obsolete task references survived the renumbering | All four corrected. |
| 8 | Task 10's red passes if the rows are merely deleted | The graduation and in-progress suites are conjoined into its command; the shell gate alone could never see the difference between archived and deleted. |

**Five of the thirteen findings across two rounds are one class**, so it gets a class-level repair rather than a sixth patch: see the "Red coverage matrix" section, which states the rule, derives the table from the markers, and records the two defects writing it caught on its own.

### Round 3 findings and their dispositions

Codex returned BLOCKING with 4 findings, down from 10 and 8. **All four accepted.** It also confirmed two axes closed: no unnamed canonical assertion remains in the amendment table, no false `red-state=live` classification remains, and the parent-geometry oracle is valid.

All four were the SAME class the Red coverage matrix was written for, which is the finding that matters most: the matrix stated the rule and the commands did not implement it.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | The harness task had no valid RED at all | Correct, and structural. Once the CSS is right and both components already emit the testid, a newly authored spec passes the moment it exists; a missing test file is not a production failure. Merged into task 1, whose two halves prove different things about the same defect and therefore share its cycle. |
| 2 | That task did not execute its WebKit wiring or baseline-registration assertions | Both are now in its command. A stale standalone baseline or an unwired WebKit project otherwise passes silently while AC-3 promises two engines. |
| 3 | The `empty:hidden` task omitted two promised suites | The transition audit and the DESIGN.md sites guard are now in its command alongside the geometry spec. |
| 4 | The closeout command short-circuited before its suites ran | The reviewer EXECUTED it and reported `marker_missing=1 in_progress_present=1` with Vitest never starting. `spec:lint` emits `RED_CONJUNCTION` as an advisory for exactly this shape; under this plan's own closed criterion it is blocking. Every multi-suite command now collects each result before deciding the exit, verified on a three-way case. |

### What this pass caught on its own

- **Probe 3 refuted this plan's own AC-3 assertion.** Reading computed `animation-name` in Chromium is vacuous: the control at `no-preference` reads `none` while the shimmer is applied. The oracle moved to the CSSOM. The first run of that probe had no control and looked like a clean pass, which is the exact failure the premise rule exists to catch, caught on the second run rather than the first.
- **Both renderers emit one testid**, so a harness mounting both would have ambiguous locators and two consumers of a single-read stream. One renderer per page load.
- **The live entry must live inside the repo**: esbuild resolves `node_modules` from the entry file's directory.
- **`fontFidelityFixture` fails any page falling off Inter**, which is why the compiled stylesheet must be written into the served directory.
- **The existing completion assertion would not catch a stale sub-phase announcement**, so task 9 adds a case the suite does not have and the repair is what would introduce.

Lint: `pnpm spec:lint` on this plan reports 0 hard. The advisories are `CITATION_SYMBOL_UNMATCHED` on range citations naming a region rather than a symbol, `NUMERIC_NOUN_MISMATCH` on ordinary English words the recogniser pairs with numbers, and one `COPY_STRAIGHT_APOSTROPHE` inside a verbatim quotation of `components/admin/FinalizeButton.tsx:955`. That last is deliberate: correcting it would misquote the line the task is about.
