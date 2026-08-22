# Control-outline forward guard: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

impeccable-gate: N/A — no UI surface

**Goal:** Ship Outcome C of the spec: a content-keyed, reasons-required residue census over every interactive element that carries `border-border` or `border-border-strong` on any render alternative, with the five closed escapes executed red and two control edits executed green as its acceptance floor, enrolled in the source-mutation registry, and the ledger row `BL-CONTROL-OUTLINE-FORWARD-GUARD` graduated on the three-outcome disposition.

**Spec:** `docs/superpowers/specs/2026-08-21-control-outline-forward-guard-design.md`. Every requirement below is quoted from it by section; where this plan restates a number, the spec's sentence is the source and the restatement carries the section.

**Architecture:** one new module in `tests/styles/` (`controlOutlineResidue`, importable, no side effects at import), one new deciding suite beside it (`_metaControlOutlineResidue`), one registry row plus its `EXPECTED_LEDGER_KINDS` entry, and the ledger closeout. No file under `app/`, `components/` or `DESIGN.md` changes (spec §1.1, AC-10).

**Tech stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing scanner `tests/styles/interactiveScanCore.ts` (`scanInteractiveElements`, `allStrings`, `ScanElement`), `tests/_shared/premise.ts` (`premise`, `premiseHolds`), the source-mutation registry `tests/mutation/source/registry.ts` and `tests/mutation/source/expectedLedgerKinds.ts`.

**Where the new suite runs:** `tests/styles/**/*.test.{ts,tsx}` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts`), so the suite is collected by the default unit project and gates merge through the required `unit-suite` contexts. No workflow edit is needed for the suite. The registry row is exercised by the non-required nightly `mutation-harness` workflow and by the path-filtered `pull_request` trigger on `tests/mutation/**`.

## What this plan does NOT build

- **No classifier.** Nothing decides whether an element is a track, a divider or a control (spec §1.4.2, §1.5 "What the bars do not decide"). A task that finds itself writing a predicate over arbitrary elements has left the plan.
- **No scanner change.** `interactiveScanCore.ts` is an enrolled surface at floor 0.9; editing it retires its score and is out of scope. The residue module only CONSUMES `scanInteractiveElements` and `allStrings`.
- **No `DESIGN.md` edit** (spec §1.6): the documented-limit record lives in spec §6, the module header, and the ledger archive entry.
- **No browser harness** (spec §1.2, rejected with its failure mode).
- **No edit to `tests/styles/controlOutlineScan.ts` or `_metaControlOutlineFill.test.ts`** (spec §3.7: the shipped pins stay byte-identical; the new suite cross-asserts against them by import).

## Global constraints

- Invariant 1 (TDD): Task 1 is one red-then-green cycle on one command, committed once at green. Tasks 2 and 3 are measurement and ledger tasks and sit OUTSIDE the red-contract region with stated acceptance (a registry edit or a docs move asserts a red rather than observing one).
- Invariants 2, 3, 4, 5, 9, 10: N/A. No DB, no RPC, no email, no sync cursor, no user-visible copy, no Supabase call, no mutation surface.
- Invariant 6: commits are `test(styles): …`, `chore(mutation): …`, `docs(backlog): …`.
- Invariant 7: the spec is canonical; a gap found here is repaired in the spec first, then restated.
- Invariant 8: the marker line at the top of this file is the N/A form; AC-10's empty diff is the proof that no UI surface is touched.
- Invariant 11: all work in `/Users/ericweiss/FX-worktrees/control-outline-forward-guard` on `docs/control-outline-forward-guard`.
- Invariant 12: the row is already `IN PROGRESS · Branch: docs/control-outline-forward-guard`; Task 3 takes it off in the closeout commit BEFORE whole-diff review, and the arming window rule governs auto-merge.

## Meta-test inventory

- **Creates** `_metaControlOutlineResidue` (a new vitest suite file under `tests/styles/`) (the deciding suite).
- **Extends** `tests/mutation/source/registry.ts` (`controlOutlineResidue` row) and `tests/mutation/source/expectedLedgerKinds.ts` (`controlOutlineResidue: {}`), which `tests/mutation/guardSurfaces.gates.test.ts` reconciles against the registry.
- **Reads, never edits:** `tests/styles/controlOutlineScan.ts` (`CENSUS`, `DIVIDERS`) for the cross-assertions of AC-8 and AC-12.
- **Not applicable:** advisory-lock topology, Supabase call-boundary registry, sentinel-hiding contract, admin-alert catalog.
- **Partition wiring (derived, not hand-listed):** the new suite lands under `tests/styles/**/*.test.{ts,tsx}`, already a member of `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:113`), so it runs in the merge-gating `unit-suite` with no `testMatch` or workflow path-filter edit; `tests/ci/_metaSpecRegistration.test.ts` reconciles the globs against the tree, so a file outside them would fail there rather than run nowhere. The scratch shard of Task 2 lives under `tests/mutation/` and is deleted before the closeout commit (2.5), so it never reaches a partition.
- **The oracle is a committed suite member, never a scratch script:** `loadOracle`, `classify`, `ownDeclarations` and `weakSides` ship inside the `controlOutlineResidue` module (1.1) and are exercised by the deciding suite at module scope (1.2, AC-15) and by every floor, cascade, form and key-membership case; the scratchpad prototypes this plan's transcripts cite (`oracle.proto.mts`, `probe-*.mts`) are drafting evidence and are not copied into the tree.
- **Layout-dimensions task: N/A.** No fixed-dimension parent and no UI file changes (AC-10); nothing renders.
- **Transition-audit task: N/A.** No component with a transition inventory is touched.
- **e2e harness-readiness checklist: N/A.** No Playwright is attached; spec §1.2 rejected the browser signal by measurement.
- **Typecheck of pasted snippets:** the plan embeds no test or implementation code blocks (its three fenced blocks are probe transcripts); the suite's type-level constraints are stated in prose per step and are checked by 1.13 (`pnpm typecheck`) before the commit.
- **Mutation-family closure:** the operator families are the registry's six (`OPERATOR_NAMES`, `tests/mutation/source/operators.ts`), enumerated up front in 2.1 to 2.3; a reviewer-proposed seventh family is admissible only with a live escaping mutant against the shipped module.

## Registry reconciliation (authored and run at plan time)

The mechanical diff of `tests/mutation/source/registry.ts` ids against `tests/mutation/source/expectedLedgerKinds.ts` keys on the branch, with the planned delta (2.1 adds the row, 2.2 adds the key; `tests/mutation/guardSurfaces.gates.test.ts` reconciles the two):

```
registry ids 41 | ledger-kind keys 41 | onlyRegistry [] | onlyKinds []
planned delta: +controlOutlineResidue on both sides -> 42 / 42; present today: registry=false kinds=false; neighbour controlOutlineScan: registry=true kinds=true
```

2.1 and 2.2 are therefore one addition on each side, `controlOutlineResidue`, placed after the `controlOutlineScan` row and key respectively; the closeout suite line runs the gates suite, which fails on any one-sided addition.

## Which check is which (lifetime)

- `_metaControlOutlineResidue` is a **standing gate**: derived population, content keys, equality both directions. Its drift sources are deliberate token edits only (spec §1.4.1).
- The observed-red protocol of Task 1 and the four pre-dispatch mutants are **acceptance instruments**: one dated run each, recorded in the commit message, never re-run as a gate.
- The mutation score of Task 2 is an acceptance instrument at closeout and a standing non-required nightly thereafter.

## Pre-draft verification transcript (run 2026-08-21 on `docs/control-outline-forward-guard`)

Every number below was produced by the command beside it; the prototype module is the scratchpad copy of spec §3 from which Task 1 is written.

```
$ npx tsx run-proto.ts            # spec §3 prototype over the live tree
universe 362 residue 12 distinct keys 12
OFF ring ratio border-strong vs surface-sunken: 1.43 1.75
$ npx tsx run-proto3.ts           # acceptance floor under the SORTED projection
[RED draft OFF fill->bg-surface]   RED as expected
[RED R1 third branch]              RED as expected
[RED R2 tokens-include]            RED as expected
[RED R5 nested span]               RED as expected
[RED NEW control]                  RED as expected
[GREEN control: padding-only edit] GREEN as expected
[GREEN control: R3 token reorder]  GREEN as expected
all as expected: true
F2a side-divider with bare border added => refused: border token outside the divider accept-set: border
F2c new max-sm control citing ShareHub's entry => refused: resolves but its entry does not name this file
F2d new control as filed-defect citing an unrelated entry => refused: resolves but its entry does not name this file
per-category counts: {"focus-state-chrome":2,"side-divider":5,"switch-track":3,"responsive-skin-filed":2}
$ npx tsx run-proto2.ts           # enumerateSites over the prototype, all six operators
mutation sites on prototype (after the r3 stem repair): 121 {"integer-literal":40,"relational-boundary":6,"logical-connector":18,"equality-flip":30,"statement-removal":27}
spec r3 probe (run-proto5, fresh roots pm5a-*/pm5b-*; exact-match predicate then the stem predicate):
  exact match: [NEW control at border-border-strong/50] GREEN (silent clear)  live residue=12 mutant residue=12; all eight modifier forms weak=false
  stem:        [NEW control at border-border-strong/50] RED  live residue=12 mutant residue=13; all eight modifier forms residue=true; run-proto3 floor: all as expected: true
  bars on a modifier (both predicates): switch-track fill bg-accent/50 -> "fills=0 outlines=1" refusal; outline border-accent-edge/50 -> "fills=1 outlines=0" refusal; side-divider border-t/50 -> "outside the divider accept-set: border-t/50" refusal; side-divider weak border-border/50 -> [] under the stem (accepted as the weak colour)
  live tokens carrying the stem, by utility: border-border 270, border-border-strong 81, nothing else

spec r5 probe (run-oracle.mts, the oracle prototype oracle.proto.mts; fresh roots po-*; this supersedes the grammar runs above for the floor):
  live admitted 362 tokens classified 323 non-compiling 2 residue 12
  [RED draft OFF fill->bg-surface] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface border border-border-strong"] 
  [RED R1 third branch] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface border border-border-strong || bg-surface-sunken border border-border-strong"] 
  [RED R2 tokens-include] RED as expected ["PublishedToggle.tsx bg-accent border border-accent-edge || bg-surface-sunken bg-warning-bg border border-border-strong"] 
  [RED R5 nested span] RED as expected ["PublishedToggle.tsx bg-surface border border-border-strong"] 
  [RED NEW control] RED as expected ["UnignoreButton.tsx bg-surface border border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
  [RED grammar: important] RED as expected ["UnignoreButton.tsx !border-border-strong bg-surface border"] winners: alt0:rest:top=!border-border-strong alt0:rest:right=!border-border-strong alt0:rest:bottom=!border-border-strong alt0:rest:left=!border-border-strong
  [RED grammar: opacity] RED as expected ["UnignoreButton.tsx bg-surface border border-border-strong/50"] winners: alt0:rest:top=border-border-strong/50 alt0:rest:right=border-border-strong/50 alt0:rest:bottom=border-border-strong/50 alt0:rest:left=border-border-strong/50
  [RED grammar: directional] RED as expected ["UnignoreButton.tsx bg-surface border border-t-border-strong"] winners: alt0:rest:top=border-t-border-strong
  [RED grammar: arbitrary value] RED as expected ["UnignoreButton.tsx bg-surface border border-[#cfcdc7]"] winners: alt0:rest:top=border-[#cfcdc7] alt0:rest:right=border-[#cfcdc7] alt0:rest:bottom=border-[#cfcdc7] alt0:rest:left=border-[#cfcdc7]
  [GREEN control: padding-only edit] GREEN as expected  
  [GREEN control: R3 token reorder] GREEN as expected  
  [cascade: strong then weak on one alternative] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
  [cascade: weak then strong on one alternative] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge border-border-strong"] winners: alt0:rest:top=border-border-strong alt0:rest:right=border-border-strong alt0:rest:bottom=border-border-strong alt0:rest:left=border-border-strong
  [cascade: weak important beside strong] RED (cascade) ["UnignoreButton.tsx !border-border-strong bg-surface border border-accent-edge"] winners: alt0:rest:top=!border-border-strong alt0:rest:right=!border-border-strong alt0:rest:bottom=!border-border-strong alt0:rest:left=!border-border-strong
  [cascade: strong at rest, weak on focus] RED (cascade) ["UnignoreButton.tsx bg-surface border border-accent-edge focus:border-border-strong"] winners: alt0:focus:top=focus:border-border-strong alt0:focus:right=focus:border-border-strong alt0:focus:bottom=focus:border-border-strong alt0:focus:left=focus:border-border-strong
  floor all as expected: true
  planted defect, theme without --color-border-strong: residue 7 (census equality against 12 rows => RED); border-border-strong compiles: false
  planted defect, oracle blind to the weak vars: residue 0 => RED
  order sample: border-accent-edge=0 border-border-strong=1 border-t-border-strong=2 focus:border-border-strong=3
  tailwind 4.2.4 total 5521 ms
  twenty-two spellings (probe-forms.mts): twenty residue=true; border-borde residue=false (compiles to nothing); border-text-faint/50 residue=false

spec r5 probe (probe-r5.mts, value classes; fresh roots pr5-*): live residue 12; live tokens with an unclassified border-colour value: (none)
  border-[#cfcdc7] / border-[rgb(207_205_199)] / border-[rgb(207,205,199)] / border-[hsl(40_8%_80%)] / border-[#000] / border-[oklch(0.5_0_0)] / border-current / border-(--custom-thing): residue=true class=unclassified
  border-[var(--color-border-strong)] / border-(--color-border-strong): residue=true class=weak
  border-transparent: residue=false class=none; border-text-faint/50, border-warning-text/60: residue=false class=strong
  run-oracle.mts re-run under value classes: floor all as expected: true; planted theme defect residue 7
literal-outline bar probe (probe-literal.mts, the r5 row-local form, SUPERSEDED by r6: that field was satisfiable by echoing the value):
  refusal, no whyNotAToken: ["components/admin/UnignoreButton.tsx: literal-outline requires whyNotAToken (the intended repair is a theme token; say why not)"]
  refusal, why does not name the value: ["components/admin/UnignoreButton.tsx: whyNotAToken must name the compiled value rgb(207 205 199)"]
  refusal, literal under filed-defect: ["components/admin/UnignoreButton.tsx: residue comes from an unclassified literal (rgb(207 205 199)); the category must be literal-outline, or, the intended repair, replace it with a theme token"]
  refusal, literal-outline without a literal: ["components/admin/UnignoreButton.tsx: literal-outline row has no unclassified border-colour value; not this category"]
  acceptance: []
  currentColor acceptance needs the compiled value: []
$ npx tsx run-proto4.ts           # r2 repairs: important markers and the duplicate-key occurrence
!border-border residue=true   border-border! residue=true   !border-border-strong residue=true   border-border-strong! residue=true
focus:!border-border residue=true   focus:border-border! residue=true   sm:border-border-strong residue=true   [&:hover]:border-border residue=true
help/errors residue elements: lines 70 and 82, same key: true
  element line 70: ring-on-this-element=true  => pass
  element line 82: ring-on-this-element=false => RED: focus-state-chrome element lacks a focus ring token
$ grep -n 'border-border-strong bg-surface-sunken' components/admin/PublishedToggle.tsx
305:        on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken",
$ grep -n 'export const CENSUS\|export const DIVIDERS' tests/styles/controlOutlineScan.ts
41:export const CENSUS: readonly CensusRow[] = [
165:export const DIVIDERS: readonly CensusRow[] = [
$ grep -n 'controlOutlineScan' tests/mutation/source/expectedLedgerKinds.ts
306:  controlOutlineScan: {},
$ git diff --name-only origin/main...HEAD -- app components DESIGN.md | wc -l
0
```

spec r6 probe (probe-r6.mts): compiled-only projection, and the ledger-backed literal-outline bar against a constructed ledger text
  extra=border-borde             compiles=false keyChanged(compiled-only projection)=false  residue=true
  extra=bg-bogus                 compiles=false keyChanged(compiled-only projection)=false  residue=true
  extra=border-border-strong!!   compiles=false keyChanged(compiled-only projection)=false  residue=true
  extra=bg-surface               compiles=true  keyChanged(compiled-only projection)=true  residue=true
  extra=border-2                 compiles=true  keyChanged(compiled-only projection)=true  residue=true
  refusal, echo-only reason, no backlogRef: ["components/admin/UnignoreButton.tsx: replace rgb(207 205 199) with a theme token, or file the literal as a BL-/DEF- entry and cite it (literal-outline requires backlogRef)"]
  refusal, ref resolves only in another entry's prose: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-9 does not resolve to a ledger heading"]
  refusal, entry names the file, not the value: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-1 resolves but its entry does not name the compiled value rgb(207 205 199)"]
  refusal, entry names the value, not the file: ["components/admin/UnignoreButton.tsx: backlogRef BL-LIT-1 resolves but its entry does not name this file"]
  refusal, literal under filed-defect: ["components/admin/UnignoreButton.tsx: replace rgb(207 205 199) with a theme token; a literal outline is registered only as literal-outline"]
  acceptance, entry names file and value: []

spec r7 probe (probe-r7.mts, probe-r7b.mts): key membership by compiled declaration versus token prefix; switch-track bar by declaration
  live unique tokens 323 | membership differs (prefix vs compiled-declaration): rounded-sm[border-radius] rounded-pill[border-radius] rounded[border-radius] sr-only[border-width] focus:rounded-md[border-radius] rounded-md[border-radius] rounded-lg[border-radius] rounded-full[border-radius] rounded-t-md[border-top-left-radius,border-top-right-radius] max-sm:rounded-sm[border-radius] rounded-[11px][border-radius]
  live residue 12 | keys identical under both projections for every residue element: false
  ![border-color:var(--color-border-strong)] props=border-color       keyChanged: prefix=false compiled=true  ON-alt weak winner=true classes=weak
  [border-color:var(--color-border-strong)]  props=border-color       keyChanged: prefix=false compiled=true  ON-alt weak winner=false classes=weak
  [background:red]                           props=background         keyChanged: prefix=false compiled=true  ON-alt weak winner=false classes=-
  [border-top-color:#cfcdc7]                 props=border-top-color   keyChanged: prefix=false compiled=true  ON-alt weak winner=true classes=unclassified
  [border:1px_solid_var(--color-border)]     props=border             keyChanged: prefix=false compiled=true  ON-alt weak winner=false classes=-
  divide-border                              props=                   keyChanged: prefix=false compiled=false  ON-alt weak winner=false classes=-
  ring-border                                props=                   keyChanged: prefix=false compiled=false  ON-alt weak winner=false classes=-
  outline-border                             props=                   keyChanged: prefix=false compiled=false  ON-alt weak winner=false classes=-
  shadow-sm                                  props=                   keyChanged: prefix=false compiled=false  ON-alt weak winner=false classes=-
  membership differs (prefix vs compiled-declaration, radii excluded): sr-only[border-width]
  live residue 12 | residue keys identical under both projections: false | elements whose key differs: app/help/errors/page.tsx:70 app/help/layout.tsx:50 components/admin/wizard/Step3Review.tsx:732 components/admin/wizard/Step3SheetCard.tsx:110
  live track, form bar by declaration: []
  ![border-color:var(--color-border-strong)] keyChanged(compiled)=true  ON-alt weak winner=true  form bar=["alternative must carry exactly one fill and one outline colour declaration, has fills=1 outlines=2 (![border-color:var(--color-border-strong)] bg-accent border border-accent-edge)"]
  [border-top-color:#cfcdc7]                 keyChanged(compiled)=true  ON-alt weak winner=true  form bar=["alternative must carry exactly one fill and one outline colour declaration, has fills=1 outlines=2 ([border-top-color:#cfcdc7] bg-accent border border-accent-edge)"]
  [background:red]                           keyChanged(compiled)=true  ON-alt weak winner=false form bar=[]
  rounded-full                               keyChanged(compiled)=false ON-alt weak winner=false form bar=[]
  sr-only                                    keyChanged(compiled)=true  ON-alt weak winner=false form bar=[]

spec r8 probe (probe-r8.mts): the one selector rule, ten variant forms on PublishedToggle's ON alternative; run-oracle.mts floor re-run under it: all as expected
  live residue 12
  in-hover:border-border-strong        selector=:where(*:hover) &                        inKey=true  keyChanged=true  ON-alt weak=true
  group-hover:border-border-strong     selector=&:is(:where(.group):hover *)             inKey=true  keyChanged=true  ON-alt weak=true
  peer-checked:border-border-strong    selector=&:is(:where(.peer):checked ~ *)          inKey=true  keyChanged=true  ON-alt weak=true
  hover:border-border-strong           selector=&:hover                                  inKey=true  keyChanged=true  ON-alt weak=true
  *:border-border-strong               selector=:is(& > *)                               inKey=false keyChanged=false ON-alt weak=false
  **:border-border-strong              selector=:is(& *)                                 inKey=false keyChanged=false ON-alt weak=false
  divide-border                        selector=:where(& > :not(:last-child))            inKey=false keyChanged=false ON-alt weak=false
  has-[:checked]:border-border-strong  selector=&:has(*:is(:checked))                    inKey=true  keyChanged=true  ON-alt weak=true
  [&>span]:border-border-strong        selector=&>span                                   inKey=false keyChanged=false ON-alt weak=false
  [&:hover]:border-border-strong       selector=&:hover                                  inKey=true  keyChanged=true  ON-alt weak=true

The live residue, as the seeding task will paste it (file, tag, sorted paint projection per alternative):

```
app/help/errors/page.tsx                        a        ["focus:bg-surface-raised focus:border focus:border-border-strong"]
app/help/layout.tsx                             a        ["focus:bg-surface-raised focus:border focus:border-border-strong"]
components/admin/BellPanel.tsx                  a        ["border-border border-t"]
components/admin/PublishedToggle.tsx            button   ["bg-accent border border-accent-edge","bg-surface-sunken border border-border-strong"]
components/admin/RecentAutoAppliedStrip.tsx     button   ["bg-surface-sunken hover:bg-surface","bg-surface-sunken border-b border-border hover:bg-surface"]
components/admin/settings/AutoPublishToggle.tsx button   ["bg-accent border border-accent-edge","bg-surface-sunken border border-border-strong"]
components/admin/settings/NotifyToggle.tsx      button   ["bg-accent border border-accent-edge","bg-surface-sunken border border-border-strong"]
components/admin/showpage/AttentionMenu.tsx     button   ["border-b border-border hover:bg-surface-sunken last:border-b-0"]
components/admin/showpage/ShareHub.tsx          button   (four alternatives; line 781, the CENSUS overlap row)
components/admin/showpage/ShareHub.tsx          button   (four alternatives; line 817)
components/admin/telemetry/EventFilters.tsx     button   ["","bg-text","border-border border-l","bg-text border-border border-l"]
components/crew/primitives/KeyTimesStrip.tsx    summary  ["border-border border-t"]
```

Line numbers are drafting-time locators; the census keys on content. The implementer re-derives every paint string by running the module's own printer (step 1.9), never by copying this block.

## Weaker implementations and the case that kills each (rule 17 obligations, one cell per row)

| # | Weaker implementation that passes a naive suite | Killing case in the suite | Spec |
| --- | --- | --- | --- |
| W1 | key on FILE only (the R5 registry) | floor case R5: outer control plain, recipe on a nested span, same file | §1.4.3 |
| W2 | key on LINE (file:line) | control case: a comment line inserted above `PublishedToggle`'s button shifts every line and must stay GREEN | §1.4.1 |
| W3 | whole-token match without the variant chain | paired fixture: `sm:border-border-strong` beside a bare `border-border-strong`, both residue | §3.2 |
| W4 | a typo reported as weak, or a modifier cleared | paired fixture: `border-borde` NOT residue (compiles to nothing) beside `border-border-strong/50` residue | §5.5(b) |
| W5 | no projection (whole class string as key) | control case: padding-only edit stays GREEN | §1.4.3 |
| W6 | projection over `border*` only, not `bg-*` | floor case draft: OFF fill `bg-surface-sunken` to `bg-surface` reds | §1.4.3 |
| W7 | projection order-sensitive | control case: token reorder stays GREEN | §3.3 |
| W8 | category bar accepts any non-blank reason | the eight AC-4 refusals | §1.5 |
| W9 | ratio typed, not recomputed | AC-5: a row stating 1.59:1 for the track tokens is refused; 1.43:1 accepted | §1.5 |
| W10 | `unresolved` elements exempted | paired fixture: an unresolvable className carrying a readable weak token IS residue | §1.4.1 |
| W11 | set instead of multiset | fixture with two identical weak buttons in one file: one row reds (count 1 ≠ 2), two rows green | §3.4 |
| W12 | `backlogRef` resolved by mention, not heading; or heading without file | AC-4: a ref that appears only in another entry's prose is refused; a heading whose body does not name the file is refused | §1.5 |
| W13 | focus-ring check read from the projection (cannot see ring tokens) | AC-4 acceptance: a skip link with the ring in its full string is accepted; a skip link whose ring token is removed is refused | §1.5 |
| W14 | projection normaliser without the important-marker strip, or variants cut at the last colon regardless of bracket depth (a leading `!` would hide a paint token from the key) | AC-13: `utilityOf` equals `normalizeToken` on every live residue token; the thirty-two forms are classified by the oracle, not by the normaliser | §3.3 |
| W15 | bar evaluated against the first element matching the key (`.find`) | AC-14: the duplicate-key scratch copy reds naming line 82 while line 70 passes | §3.4 |
| W16 | weak predicate by exact match, stem, or substring on token names (spec rounds 2 to 4: `!border-border-strong`, `border-border-strong/50`, `border-t-border-strong` each cleared silently under one of them) | floor cases 6 to 9: a new control at each grammar form reds (12 to 13) under the oracle | §3.2 |
| W17 | any spelling predicate at all in the module | review's class, named in both diff-review briefs (plan r2 showed a grep losing to three recognizer shapes); bounded behaviourally by AC-13's thirty-two forms and §3.3's twenty-one tokens, all by equality | §3.2 |
| W18 | cascade by class-attribute order (first or last token wins) | the two cascade cases with the tokens swapped both resolve to the weak token; the R3 reorder control stays GREEN | §3.2 |
| W19 | weak by variable reference only | floor case 9: `border-[#cfcdc7]` (a literal, no `var()`) reds | §3.2 |
| W20 | oracle loaded from a hand-written theme instead of `app/globals.css` | AC-16: the planted defect is a removed declaration in a COPY of the real file, so the theme the oracle loads is production's theme minus one line, never a fixture | §3.2 |
| W21 | non-compiling tokens treated as weak (fail-closed on typos) | `border-borde` and `group` are NOT residue (AC-13, AC-15); spec §3.2 justifies the non-report | §6 |
| W23 | `literal-outline` row accepted on a row-local reason (echo of the value, spec r6) | AC-4: the echo-only refusal (no `backlogRef`), the names-file-not-value refusal, the names-value-not-file refusal; the refusal of a literal registered as `filed-defect` | §1.5 |
| W26 | key and oracle reading the selector differently (spec r8: a textual where( exclusion in the key dropped `in-hover:border-border-strong`, `:where(*:hover) &`, while the oracle scanned it) | AC-13's fifth `it`, ten roots on PublishedToggle's ON alternative: `in-hover:`, `group-hover:`, `peer-checked:`, `hover:`, `has-[:checked]:`, `[&:hover]:` change the key AND make the ON alternative weak; `*:`, `**:`, `[&>span]:`, `divide-border` do neither; both answers asserted by equality per row, and the module exports exactly one `ownDeclarations` that both `classify` and `paintProjection` call (closeout gate: the parsed-source count, one declaration and two call sites) | §3.3, §6 |
| W25 | key membership by token PREFIX (`border`/`bg-`) rather than by compiled declaration (spec r7: `![border-color:var(--color-border-strong)]` on a track's ON alternative, weak and outside the key) | floor case 10 reds (key changed) and the switch-track bar refuses `fills=1 outlines=2`; AC-13's §3.3 probe set: `[border-top-color:#cfcdc7]` and `[background:red]` change the key, `rounded-full` does not, `sr-only` does (border-width: 0) | §3.3 |
| W24 | projection keyed on every paint-prefixed spelling, compiled or not (a typo beside a live recipe reds as unregistered plus stale, spec r6) | AC-13 co-location: `border-borde`, `bg-bogus`, `border-border-strong!!` appended to PublishedToggle's OFF alternative keep the key; `bg-surface` appended changes it | §3.3 |
| W22 | literals compared by value (a hex list, a colour parser) | AC-13: `border-[rgb(207_205_199)]`, `hsl`, `oklch`, `#000`, `currentColor`, `var(--custom-thing)` are all residue with class `unclassified`; `border-transparent` is `none`; the absence of a literal list is review's class (a hex grep missed `#000` in plan r2) | §3.2, §6 |

Every `it` in the suite carries a `// covers: W<n>` or `// covers: AC-<n>` comment naming the row it exists for, and one case asserts that every `it` title in the file maps to a row (no unmapped case, so the corpus cannot grow without a reason).

---

<!-- tasks: depth=2 red-contract -->

## Task 1: the residue module and its deciding suite, one cycle

<!-- task: red=`pnpm exec vitest run tests/styles/_metaControlOutlineResidue.test.ts` red-state=authored red-target=`components/admin/PublishedToggle.tsx:305` why=`this line's OFF alternative carries border-border-strong, it is residue, and no row registers it; the census-equality case lists it and eleven others by name, and the count pins read 0 against 12 and 3/5/2/2` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-11,AC-12,AC-13,AC-14,AC-15,AC-16,AC-17 -->

**One task, not two, because invariant 1 is per task.** The suite and the module land together; the RED is the suite run against a module whose `RESIDUE_CENSUS` is empty, which fails by VALUE (the unregistered keys listed by name, the literal count pins), never by a missing import or a crash. Seeding the twelve rows is the GREEN.

**Files:** `controlOutlineResidue` (a new TypeScript module under `tests/styles/`) (new), `_metaControlOutlineResidue` (a new vitest suite file under `tests/styles/`) (new). Nothing else.

### RED

- [ ] **1.1** Author `controlOutlineResidue` (a new TypeScript module under `tests/styles/`) exactly per spec §3.1 to §3.4: `utilityOf` (variants cut at the last depth-0 colon, then one leading or trailing `!`, the `normalizeToken` contract replicated with a comment naming it; never import `_childlessGrowableScan` from the module), `variantsOf` (leading `!` skipped, same depth walk), the ORACLE of spec §3.2 inside this same module (one enrolled surface, not a sibling): `WEAK_COLOURS = ["border", "border-strong"] as const`; `loadOracle(cssPath): Promise<Oracle>` (`__unstable__loadDesignSystem` imported from `tailwindcss`, the production `app/globals.css` as its input, a `loadStylesheet` callback resolving `tailwindcss` and its relative imports through `createRequire(import.meta.url)`, no literal list of any kind); `classifyValue(value): "weak" | "strong" | "none" | "unclassified"` (weak: references `var(--color-border)` or `var(--color-border-strong)`; strong: references any other `var(--color-…)`; none: the keyword `transparent` exactly; unclassified: everything else, spec §3.2) and `isWeakValue(value)` is `weak || unclassified` (fail-closed on literals, W22); `classify(oracle, tokens): Map<token, TokenPaint | null>` (`candidatesToCss` + `getClassOrder` on the unique tokens; per token the `border*-color` declarations mapped to physical sides through the eleven-property table, `important` from `!important` in the value, `order` from `getClassOrder`; `null` when Tailwind returns `null`); `weakSides(oracle, element, paint): string[]` (per alternative, group by the variant chain, `variantsOf(t)` joined with a colon, per side the winner by `important` then highest `order`, output one `alt<i>:<group|rest>:<side>=<token>` line per weak winner); `isResidue(element, paint)` is `weakSides(...).length > 0`. NO spelling predicate of any kind: no stem, no exact match, no suffix list (W17); `paintProjection(path, paint)` (SORTED tokens whose `TokenPaint.props` is non-empty: `classify` records, per token, the properties its OWN compiled rule declares that begin with `border` (radii excluded: `/^border(?!-[a-z-]*radius)/`) or `background`, read through `ownDeclarations(css)`, the ONE selector rule both the key and the oracle consume (spec §3.3, r8): walk the token's compiled CSS, keep the class rule's own declarations and every nested rule whose selector has `&` as its subject (no combinator after `&`: `&:hover`, `:where(*:hover) &`, `&:is(:where(.group):hover *)`, `&:has(…)`), drop every nested rule with a combinator after `&` (`:is(& > *)`, `:is(& *)`, `&>span`, `:where(& > :not(:last-child))`); `classify`'s side/weakness scan reads the SAME `ownDeclarations` output (W26); NO prefix test on the token string, spec §3.3 and r7; a typo compiles to nothing and has no props, W24), `residueKey(element, paint)` (its projection line is exactly `const projections = el.paths.map((p) => paintProjection(p, paint)).sort();`, the text Task 2's liveness control anchors on), `isResidue` (any readable string on any alternative, `unresolved` does not exempt), `residueOf(rootDir, oracle)` returning `{ elements, keys: Map<string, number>, universe, paint }`, `RESIDUE_CATEGORIES` (six, `literal-outline` included), the `ResidueRow` type (`backlogRef` required for three categories), `rowKey`, `unclassifiedValues(oracle, tokens)` (the compiled border-colour values `classifyValue` returns `unclassified` for, used by the `literal-outline` bar and by the printer's first two lines), `colourNames(css)` (every `--color-<c>:` declaration in `app/globals.css` that is not a `-runtime` alias), `validateRow(row, element, oracle, css, ledgerText)` with the six bars of spec §1.5 verbatim (the `switch-track` form bar counts fills and outlines by COMPILED DECLARATION: a fill token's own rule sets `background-color` referencing `var(--color-…)`, an outline-colour token's own rule sets any `border*-color`; never by `--color-<c>` name derivation from the token string, spec §1.5 r7; the `literal-outline` bar: residue from at least one unclassified value; `backlogRef` required, resolving to a `^## <id>` heading whose body names the row's file AND every unclassified value exactly as it compiles, the same resolver `filed-defect` uses; a literal under any other category refused with the message's first line naming the token repair; NO row-local reason field is read by this bar, spec §1.5; a row's weak tokens are the tokens `classify` marks weak on some side, never a spelling) (divider accept-set with default-deny; `backlogRef` resolving to a `^## <id>` heading whose body names `row.file`; focus ring read from the LIVE element's full strings), `recordedRatio(outline, fill, css)` reusing the six-line WCAG luminance form from `tests/styles/secondary-action-contrast.test.ts` (replicated, not exported from that suite: exporting from a test file would make a suite a module dependency), `printPasteReadyRow(element, oracle, paint)` (spec §3.6; when the residue comes from an unclassified value its FIRST line is `replace <value> with a theme token`, its second `or file it as a BL-/DEF- entry naming this file and <value>, and cite it`, and the row carries `category: "literal-outline"`, `backlogRef: TODO`; asserted by equality on the derived fields in a constructed-element case), and `RESIDUE_CENSUS: readonly ResidueRow[] = []` — EMPTY at this step. Header comment: the spec path, §5.2's "DO NOT grow a predicate here" sentence, and the §6 limit that trackness is a ruling the bars do not decide.
- [ ] **1.2** Author `_metaControlOutlineResidue` (a new vitest suite file under `tests/styles/`). Module scope, unconditional, with top-level `await` (vitest ESM test files allow it): `const ROOT = process.cwd()`, `const css = readFileSync("app/globals.css", "utf8")` (every `readFileSync` in the suite passes `"utf8"`; a Buffer has no `.replace`, which 1.7c needs, and `pnpm typecheck` would say so), `const oracle = await loadOracle(join(ROOT, "app/globals.css"))`, `const major = Number((JSON.parse(readFileSync("node_modules/tailwindcss/package.json", "utf8")) as { version: string }).version.split(".")[0])` (the suite is ESM with top-level `await`, so there is no `require`; the package file is read, never required), then `premise("tailwindcss major exceeds 3", major, 3)` (AC-17; `premise` is STRICTLY `actual > mustExceed`, `tests/_shared/premise.ts:26`, so an equality is written as exceeding the predecessor, never as `, 4`, which reds on 4.2.4; the exact-major assertion is a plain `expect(major).toBe(4)` in the same `it`), AC-15 as the next two statements (`const canon = classify(oracle, ["border-border-strong", "border-accent-edge", "group"])` and `premise("oracle classifies the canonical weak token on more than three sides", [...canon.get("border-border-strong")!.sides.values()].filter(Boolean).length, 3)` (strict `>` again; the four-sides equality is the `it` that follows), then one `it` asserting all three classifications by equality: four weak sides; four sides all `false`; `null`), `const LIVE = residueOf(ROOT, oracle)`, `premise("scanner reaches the component tree", LIVE.universe, 200)` (AC-7), `const ledger = readFileSync("BACKLOG.md", "utf8") + "\n" + readFileSync("DEFERRED.md", "utf8")`.
- [ ] **1.3** Census cases (AC-1, AC-11, spec §5.1 to §5.3): `RESIDUE_CENSUS.length` equals the literal `12`; per-category counts equal the literals `3 / 5 / 2 / 2 / 0 / 0` (one `it`, six `expect`s, each against a literal); every live residue key has a row and every row has a live key, compared as multisets in BOTH directions with the failure listing names (`expect(unregistered).toEqual([])`, `expect(stale).toEqual([])`), and the failure message for an unregistered key includes `printPasteReadyRow(element)`; every row passes `validateRow` against its LIVE element (not against the row alone).
- [ ] **1.4** Acceptance-floor cases (AC-2, AC-3, spec §1.4.3): a local `scratchCorpus(mutation)` helper copies `app`, `components`, `lib` and `tsconfig.json` into a fresh `mkdtemp` root PER CASE (the scanner's `sourceCache` keys on absolute path; one reused root returns the first mutant's result for every later one, spec §5.6), applies the edit with an exactly-once anchor assertion (`occurrences === 1`, else throw naming the anchor), and returns `residueOf(root).keys`. Twelve `it`s with the exact edits of spec §1.4.3: ten assert inequality AND the novel key's `file` by equality (`PublishedToggle.tsx` for draft/R1/R2/R5 and for r7's `![border-color:var(--color-border-strong)]` appended to the ON alternative; `UnignoreButton.tsx` for the new control and for the four grammar mutants `!border-border-strong`, `border-border-strong/50`, `border-t-border-strong`, `border-[#cfcdc7]`, each as the class of an appended `Extra` button exactly as §1.4.3's transcript shows); two assert equality (padding-only edit; token reorder). Plus the no-defect baseline (AC-3): an unmutated scratch copy equals `LIVE.keys`, run FIRST in the describe. Plus the cache case (spec §5.6): two roots, same relative path, different bytes, different residues. Plus the four CASCADE cases of spec §3.2 in their own `describe` (not floor cases): `border-accent-edge border-border-strong`, `border-border-strong border-accent-edge`, `border-accent-edge !border-border-strong`, `border-accent-edge focus:border-border-strong` on the appended button; each asserts `weakSides(oracle, extra, paint)` BY EQUALITY against the exact winner list in §1.4.3's transcript (four `alt0:rest:<side>=border-border-strong` lines; four with `!border-border-strong`; four `alt0:focus:<side>=focus:border-border-strong` lines), so the cascade is pinned by mechanism, and a fifth control `border-border-strong border-accent-edge` with the weak token moved to a `hover:` group asserts the rest group's winner is strong and the hover group's winner is weak.
- [ ] **1.5** Stale-row direction (AC-6): the draft scratch copy reds as both an unregistered key and a stale row, and the stale list names the registered `PublishedToggle` row.
- [ ] **1.6** Bar cases (AC-4, AC-5; `validateRow(row, element, oracle, css, ledger)` throughout): the twelve refusals and six acceptances of spec AC-4 (the four `literal-outline` refusals and its acceptance use a scratch root whose appended control carries `border-[rgb(207_205_199)]` and a constructed ledger text, so the bar reads a real compiled value against a real heading resolution; the refusals, exactly spec AC-4's four for this category: echo-only reason without `backlogRef`, entry naming the file but not `rgb(207 205 199)`, entry naming the value but not the file, and the literal registered as `filed-defect`; the prose-only-reference shape is already refused by the shared resolver under `responsive-skin-filed` and is not a thirteenth case), each asserting the FULL problem list by equality (`toEqual([...])`, never `toMatch`); the `filed-defect` acceptance passes a constructed ledger text whose `## BL-TEST-ROW` body names the row's file; AC-5 recomputes `recordedRatio("border-strong", "surface-sunken", css)` and asserts `1.43 ± 0.01` light and `1.75 ± 0.01` dark, and that a row stating `1.59:1 light / 1.60:1 dark` for those tokens is refused by the suite's ratio compare.
- [ ] **1.7** Paired fixtures (spec §5.4, §5.5, W3, W4, W10, W11): a local `scanFixture(source)` harness (the same six-line shape as `_metaControlOutlineFill.test.ts`, replicated on purpose); every fixture that expects an element NOT to be residue also contains an element that IS residue, one variable away, with `premise("fixture produced both elements", found.length, 1)` inside the case; fixtures for: `border-borde` (one character short of the stem) beside `border-border-strong/50` (spec §5.5(b), both edges of the prefix); token in a comment beside a live one; token in a `data-x` attribute beside a `className`; a `<div>` beside a `<button>`; a `false && "border-border-strong"` branch (residue, conservative direction, asserted); `sm:border-border-strong` beside bare; an unresolvable `className={cls}` whose readable string carries the token (residue); two identical weak buttons in one file (multiset count 2).
- [ ] **1.7a** Grammar pin (AC-13, W14): import `normalizeToken` from `./_childlessGrowableScan` IN THE SUITE ONLY (never in the module) and assert `utilityOf(t) === normalizeToken(t)` for every whitespace-split token of every live residue element; then thirty-two scratch roots, one per form of spec §3.2's two tables, then four roots for the co-location case (AC-13's fourth `it`: three non-compiling paint-prefixed tokens keep PublishedToggle's key by equality, `bg-surface` changes it), then eleven roots for §3.3's key-membership probe, ONE PER TOKEN so no token masks another (a fifth `it`, and a sixth with ten roots for the selector rule, W26: `![border-color:…]`, `[border-color:…]`, `[background:red]`, `[border-top-color:#cfcdc7]`, `[border:1px_solid_var(--color-border)]`, `sr-only` change the key; `rounded-full`, `divide-border`, `ring-border`, `outline-border`, `shadow-sm` do not; by equality on `keyChanged`) (twenty-eight residue forms expected residue, the four controls `border-borde`, `border-text-faint/50`, `border-transparent`, `border-warning-text/60` expected NOT residue, each asserted by equality on `isResidue`), plus a third `it` asserting `classifyValue` on each table's stated `value=` string equals its stated `class=` by equality. Every one of the thirty-two roots substitutes one form for `border-text-faint` in `components/admin/UnignoreButton.tsx` (anchor exactly once) and asserts `isResidue(el, paint)` BY EQUALITY against the table's stated value: `true` for the twenty-eight residue forms, `false` for the four controls (`border-borde`, `border-text-faint/50`, `border-transparent`, `border-warning-text/60`); for the residue forms that compile (every one but `border-borde`) it also asserts the raw form appears in the element's projection.
- [ ] **1.7c** Planted defect, different producer (AC-16, W16, W20): write `css.replace(/^\s*--color-border-strong:.*$/m, "")` to a file under `mkdtemp` (the oracle loads from a path; `premise("the declaration was removed", css.length - broken.length, 1)` guards against a silent no-op replace), `const blind = await loadOracle(brokenPath)`; assert `classify(blind, ["border-border-strong"]).get("border-border-strong")` is `null`; assert the residue of `ROOT` under `blind`, as sorted `file:line` strings, equals the seven `border-border` elements of §1.4.3's population table BY EQUALITY (the premise that the live scan produced 362 elements, 1.2, already rules out the absent-scan "seven"); and assert that `validateCensus(RESIDUE_CENSUS, residueUnderBlind)` names exactly the five `border-border-strong` rows stale. Pair it in 1.12 with `_metaControlOutlineFill` in the same invocation so the old path is observed green while this case exercises the defect.
- [ ] **1.7b** Duplicate-key evaluation (AC-14, W15): a scratch root giving `app/help/errors/page.tsx`'s jump-list anchor (`<a href={`#${family.id}`}>{family.title}</a>`, anchor exactly once) the className `focus:border focus:border-border-strong focus:bg-surface-raised focus-visible:outline-none`; assert two residue elements share the line-70 key and that evaluating the seeded skip-link row against each yields `[]` for line 70 and `["app/help/errors/page.tsx:82: focus-state-chrome element lacks a focus ring token"]` for line 82, by equality.
- [ ] **1.8** Cross-assertions against the shipped pins (AC-8, AC-12): import `CENSUS` and `DIVIDERS` from `./controlOutlineScan`; every `DIVIDERS` row resolves to a `side-divider` residue row; `residue ∩ CENSUS` (by `file` + `line` through `scanInteractiveElements`) equals exactly the ShareHub line-781 row and its category is `responsive-skin-filed`.
- [ ] **1.9** The coverage map: one case walks this test file's `it` titles and asserts each carries a `// covers:` comment naming a `W<n>` or `AC-<n>`; zero unmapped.
- [ ] **1.10** **The complete expected RED**, so a correct red is distinguishable from a broken one. `pnpm exec vitest run tests/styles/_metaControlOutlineResidue.test.ts`:
      - `holds exactly 12 rows`: FAIL, `expected 0 to be 12`.
      - per-category literals: FAIL, four of six (`0` against `3/5/2/2`; `filed-defect` and `literal-outline` `0` against `0` pass).
      - `every residue element has a row`: FAIL, twelve names listed, each followed by its paste-ready row.
      - `no stale row`: PASS (no rows registered, so none is stale).
      - the stale-row direction case of 1.5 (AC-6): FAIL at this step, `expected [] to contain` the PublishedToggle row, because the row it expects to be reported stale is not registered yet; it passes once 1.11 seeds the row (the draft scratch copy then reds as unregistered AND stale). A PASS here would mean the case reads the wrong list.
      - `every DIVIDERS row is a side-divider residue row` (AC-8): FAIL, five names.
      - the overlap pin (AC-12): FAIL (no `responsive-skin-filed` row exists yet).
      - the twelve floor cases, the four cascade cases, the baseline, the cache case, the stale-row case, the eighteen bar cases, the paired fixtures, the normaliser pin, the thirty-two forms, the four co-location roots and the eleven §3.3 key-membership roots, the oracle-alive case (AC-15), the ratio cases: PASS; the planted-defect case (1.7c) FAILS at this step only on its stale-row half (no rows yet to be stale) and passes its residue-of-seven half (they read the live tree and the module, not the census).
      - the duplicate-key case (1.7b): FAIL at this step only because the seeded row it evaluates does not exist yet; it lists line 82 once the row is seeded.
      A run where a floor case fails here means the anchor or the projection is wrong, not that the census is empty. A run that fails with an import error or a `TypeError` is a crash, not this red (rule: a red from a crash is not a red from the assertion). **Do not commit here.**

### GREEN

- [ ] **1.11** Seed `RESIDUE_CENSUS` with the twelve rows by pasting the printed rows from step 1.10's failure output (the module's own printer, never this plan's table), adding `category` and `reason` per spec §3.5: three `switch-track` rows citing `DESIGN.md §1.2a` and carrying `1.43:1 light / 1.75:1 dark`; five `side-divider` rows naming `border-t` / `border-b` / `border-l`; two `responsive-skin-filed` rows with `backlogRef: "BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT"`; two `focus-state-chrome` rows.
- [ ] **1.12** `pnpm exec vitest run tests/styles/_metaControlOutlineResidue.test.ts tests/styles/_metaControlOutlineFill.test.ts` in ONE invocation (AC-16's differential: the planted-defect case runs while the fill pins stay green in the same run; record the summary line): zero failures. Then `_metaControlOutlineFill` alone: zero failures, byte-identical file (`git diff --stat origin/main -- tests/styles/_metaControlOutlineFill.test.ts tests/styles/controlOutlineScan.ts` prints nothing).
- [ ] **1.13** `pnpm typecheck` and `pnpm exec eslint tests/styles/controlOutlineResidue.ts tests/styles/_metaControlOutlineResidue.test.ts` and `pnpm exec prettier --check tests/styles/controlOutlineResidue.ts tests/styles/_metaControlOutlineResidue.test.ts`: clean. The commit hook runs lint-staged, so run these BEFORE committing and re-run the suite AFTER the commit (a formatter pass is an edit after your verification).
- [ ] **1.14** Commit ONCE: `test(styles): residue census for weak control outlines, content-keyed and reasons-required`.

### Acceptance instruments, run AFTER the commit (restore-by-checkout needs a committed green baseline)

- [ ] **1.15** Observed-red for the floor cases: neutralise `isWeakValue` to `return false;` (both classes) (a condition, never an excision, so the module stays collectable), run the suite, observe the TEN inequality floor cases, the four cascade cases, AC-15 and the census-equality case red for the asserted reason (value assertions: `expected true to be false` on inequality, twelve stale rows on equality, `expected [] to equal [...]` on the cascade winners) while the two equality CONTROLS stay green (an empty residue equals an empty residue; they are controls for the key, not instruments for this mutant, and their staying green is recorded too), `git checkout -- tests/styles/controlOutlineResidue.ts`, re-run green. Record the observed failure lines in the commit message of the NEXT commit (Task 2), not by amending.
- [ ] **1.16** The four pre-dispatch mutants of spec §5.5 (a) to (d), each applied and restored byte-exact, each with its observed red line recorded the same way. Neutralise conditions; never delete blocks.
- [ ] **1.17** Thresh-perturbation on the premise: raise the `200` universe floor to `100000`, observe `Got 362`, restore. A premise that cannot be made to fail is a tautology.

<!-- tasks: end -->

## Task 2: enrol the surface and take the score (measurement task, outside the red contract)

**Acceptance:** the registry row and its `EXPECTED_LEDGER_KINDS` entry exist; `pnpm mutation:sites tests/styles/controlOutlineResidue.ts` lists the surface with a non-zero site count; a scored run lands with the score, the survivor set and the provenance pair recorded (AC-9).

- [ ] **2.1** Add to `tests/mutation/source/registry.ts`, after the `controlOutlineScan` row: `id: "controlOutlineResidue"`, `sourcePath: "tests/styles/controlOutlineResidue.ts"`, `suitePaths: ["tests/styles/_metaControlOutlineResidue.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.9` (raised to 1 in this same task if the first scored run reaches it with an empty accepted ledger), `control: { from: "const projections = el.paths.map((p) => paintProjection(p, paint)).sort();", to: "const projections = [] as string[];" }` (the exact line 1.1 writes in `residueKey(element, paint)`; a bare `.map(paintProjection)` would hand `Array.map`'s index as the second argument and fail `pnpm typecheck`, so the callback form is the anchor) (a liveness control on the key, not on the oracle: the oracle's own liveness is AC-15 at module scope) (verify the `from` text occurs exactly once with `grep -c -F`; a control keyed by text expires the moment the line is duplicated), `accepted: []`.
- [ ] **2.2** Add `controlOutlineResidue: {},` to `tests/mutation/source/expectedLedgerKinds.ts` beside `controlOutlineScan: {}`. Run `pnpm exec vitest run tests/mutation/guardSurfaces.gates.test.ts tests/mutation/_metaLedgerKindsDeclarationParity.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts`: green. (`_metaSourceShardIntegrity` pins the shard FILE set; the registry growth repacks the partition and is expected to pass.)
- [ ] **2.3** `pnpm mutation:sites tests/styles/controlOutlineResidue.ts`: paste the per-operator counts into the commit message. Expected shape from the prototype: five of six operators produce sites (149 across the two drafting-time prototype files, the residue module 121 and the oracle 28, merged into one module here); `regex-quantifier-bound` produces none.
- [ ] **2.4** Scored run, scoped: create the scratch shard `guardSurfaces-shardTMP` (a throwaway vitest file under `tests/mutation/`, spelled guardSurfaces.shardTMP.test.ts in the commands below) that filters `GUARD_SURFACES` to `controlOutlineResidue` before `registerSurfaceCases`, run `pnpm heavy pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shardTMP.test.ts` with `VITEST_INCLUDE_MUTATION_HARNESS=1`, in the FOREGROUND (a foreground Bash call caps at 600 s; at roughly 15 s per mutant over ~77 sites this is under the cap, but if it is not, `run_in_background` and poll the log), with the provenance pair printed INSIDE the invocation before and after (source, suite, registry, `expectedLedgerKinds.ts`, `operators.ts`, and `app/globals.css` plus `BACKLOG.md` and `DEFERRED.md`, which the suite READS). Then DELETE the temp file and prove the deletion load-bearing: `_metaSourceShardIntegrity` fails with it present and passes without it. `git ls-tree -r HEAD --name-only | grep shardTMP` must print nothing on every commit of the branch.
- [ ] **2.5** Triage survivors in the rule-20 order: delete dead code, totalise the predicate, add a case, and only then an `accepted` row with a premise and a falsifier. A survivor on a well-covered branch whose covering test shells out is a placement defect, not a gap. Re-measure after any source or suite edit; the number is retired the moment either moves. Derive the reported score through the shipped `score()` in `tests/mutation/source/ledger.ts`, never by hand.
- [ ] **2.6** Commit: `chore(mutation): enrol controlOutlineResidue` with the score, the survivor set, the provenance pair (before and after, identical), and the observed-red lines from 1.15 to 1.17 in the body.

## Task 3: ledger closeout, EARLY, before whole-diff review

**Acceptance:** the row is archived on the three-outcome disposition; no `IN PROGRESS` marker reaches main; set arithmetic holds; the round-economy filing exists if any stage reached four counted rounds at one base.

- [ ] **3.1** Move `## BL-CONTROL-OUTLINE-FORWARD-GUARD` from `BACKLOG.md` to the top of `BACKLOG-archive.md` in the same commit that removes its `**Status:** IN PROGRESS · **Branch:** …` marker (archives reject in-progress entries). The archive entry opens with the RE-SCOPED disposition, first thing a reader meets: the row asked whether a new signal was needed; the answer is no for the forward claim as bounded (spec §2) and yes for measured effective paint, which closes as a documented limit; Outcome C shipped at `<commit>`; the five-escape table is carried forward verbatim with a sixth row reading "C: content-keyed residue census: all five executed red, R5 file registry green on four, two controls green (spec §1.4.3)". The false `switch-track` row and the third-token limit are recorded here as documented limits with their re-file triggers (spec §6), not as new rows.
- [ ] **3.2** No new `BL-` rows are minted by this arc. Every peer the sweep did not fix is a documented limit in spec §6 with a stated trigger (the spec is the owning surface's limits record).
- [ ] **3.3** Set arithmetic, run and pasted: union of `^## (BL|DEF)-` ids across `BACKLOG.md` + `BACKLOG-archive.md` + `DEFERRED.md` before and after differs by exactly zero ids (one moved); `comm -12` of open versus archived ids is empty; in-progress marker count is 0. Anchor every check on `^## <id>` headings, never on mentions.
- [ ] **3.4** Commit the corpus rows: `git add docs/review-rounds/docs/control-outline-forward-guard/` (every completed dispatch's row) and, if any stage reached four counted rounds at one base, the base-sha filing (the first twelve characters of the merge-base sha, plus .md) with `## spec — N rounds` / `## plan — N rounds` headings, an `**Examined:**` line and a disposition line. `pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`: green.
- [ ] **3.5** Commit: `docs(backlog): archive BL-CONTROL-OUTLINE-FORWARD-GUARD on the three-outcome disposition`.
- [ ] **3.6** Ordering of the review records, stated so the reviewed diff is the diff that merges: the spec and plan rows are already committed on the branch; each diff round's row lands at that round's completion and is committed BEFORE the next dispatch, so every round but the last reviews a tree that carries the rows before it; the LAST round's row (the APPROVE) lands in one trailing `docs(review-rounds):` commit after the verdict, touching `docs/review-rounds/**` only, which is the corpus convention this repository already merges under (`#871`: `5eef1c7c8 docs(review-rounds): …` is the commit after the reviewed one). The merge gate for that exception is mechanical: `test -z "$(git diff --name-only <reviewed-sha>..HEAD | grep -v '^docs/review-rounds/')"` must hold, where `<reviewed-sha>` is the head the APPROVE names; anything else after the reviewed sha is a new round.

## Closeout block (dry-run at plan time; every line is enforced by exit code, never by a number beside it)

```sh
set -e
# AC-10: no UI surface in the diff (run against origin/main, not HEAD, on every commit)
test -z "$(git diff --name-only origin/main...HEAD -- app components DESIGN.md tailwind.config.ts)" || { echo FAIL ui-surface-touched; exit 1; }
# the shipped pins are byte-identical
test -z "$(git diff --name-only origin/main...HEAD -- tests/styles/controlOutlineScan.ts tests/styles/_metaControlOutlineFill.test.ts tests/styles/interactiveScanCore.ts)" || { echo FAIL shipped-pin-edited; exit 1; }
# no scratch shard on any commit
test -z "$(git log --format=%H origin/main..HEAD | xargs -I{} git ls-tree -r --name-only {} | grep shardTMP || true)" || { echo FAIL scratch-shard-committed; exit 1; }
# the module exists (a negated grep on a missing file exits 0 and would pass; this line makes absence a failure)
test -f tests/styles/controlOutlineResidue.ts || { echo FAIL module-missing; exit 1; }
# W26: exactly one ownDeclarations definition and exactly two call sites (classify, paintProjection), counted on the PARSED source, so comments and strings do not count
node -e 'const ts=require("typescript"),fs=require("fs");const p="tests/styles/controlOutlineResidue.ts";const sf=ts.createSourceFile(p,fs.readFileSync(p,"utf8"),ts.ScriptTarget.ES2022,true);let d=0,c=0;(function w(n){if(ts.isFunctionDeclaration(n)&&n.name&&n.name.text==="ownDeclarations")d++;if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==="ownDeclarations")c++;ts.forEachChild(n,w)})(sf);console.log("ownDeclarations decl="+d+" calls="+c);process.exit(d===1&&c===2?0:1)' || { echo FAIL own-declarations-sites; exit 1; }
# no in-progress marker at HEAD, by heading-anchored grep
test "$(grep -c '^\*\*Status:\*\* IN PROGRESS' BACKLOG.md DEFERRED.md | awk -F: '{s+=$2} END{print s}')" = 0 || { echo FAIL marker-present; exit 1; }
pnpm typecheck && pnpm exec eslint . && pnpm format:check
pnpm exec vitest run tests/styles tests/mutation/guardSurfaces.gates.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/docs
echo PASS closeout
```

At plan time the first two lines PASS (the diff touches docs only), the module-exists line FAILS (no module yet; plan round 2 showed a negated `grep` on a missing file exiting 0, which is why absence is its own line), the marker line FAILS for the asserted reason (`**Status:** IN PROGRESS` is present until Task 3), and the suite line passes. The W17 and W22 greps of round 1 are GONE: round 2 showed three recognizer shapes (a regex test for a border prefix, `WEAK_COLOURS.includes(token)`, `new Set([...]).has(token)`) and a three-digit hex passing them, and a grep over source is itself a recognizer that loses to the next spelling, the same lesson as spec rounds 2 to 4. The absence of a spelling predicate or a literal list is REVIEW'S CLASS, named in both diff-review briefs ("the module reads no token string except to split it and to read its variant chain; it compares no colour value"), and its damage is bounded behaviourally: any recognizer must reproduce the oracle on the thirty-two forms, the twenty-one tokens of §3.3's probes, the ten floor mutants and the four cascade cases, all by equality. The W26 gate counts on the parsed source; probed against constructed inputs (comment-and-string mentions only; a definition plus two calls plus a comment; a definition plus one call; a missing file):

```
own-comments.ts: ownDeclarations decl=0 calls=0
  exit=1
own-real.ts: ownDeclarations decl=1 calls=2
  exit=0
own-onecall.ts: ownDeclarations decl=1 calls=1
  exit=1
controlOutlineResidue.ts: FAIL module-missing tests/styles/controlOutlineResidue.ts
  exit=1
```


Then: push; read CI sha-keyed (`gh api "repos/edweiss412/FX-Webpage-Template/commits/<SHA>/check-runs?per_page=100"`, assert `(.check_runs|length) == .total_count`, twelve required contexts by name, plus `commits/<SHA>/status` for the commit-status vocabulary); whole-diff codex review (split CORE = module + suite, REGISTRY = registry + kinds + ledger, each brief naming the sibling) to APPROVE with the `GUARD SURFACE:` line carrying `MUTATION SCORE: <killed>/<total>` and "0 unaccepted survivors"; arm auto-merge only after the closeout commit is pushed AND review approves; `gh pr merge --merge`; fast-forward local main; `git rev-list --left-right --count main...origin/main` = `0 0` AND `git merge-base --is-ancestor <ship-head> main`.

## Acceptance criteria, each with its producing step and channel

| AC | Proof step | Channel |
| --- | --- | --- |
| AC-1 unmutated tree green at 12 rows | 1.12 | suite summary line |
| AC-2 twelve floor cases | 1.4 | twelve `it`s, file asserted by equality |
| AC-3 no-defect baseline | 1.4 | one `it`, run first |
| AC-4 twelve refusals, six acceptances | 1.6 | eighteen `it`s, problem lists by equality |
| AC-5 ratio recomputed | 1.6 | two `it`s |
| AC-6 stale-row direction | 1.5 | one `it` |
| AC-7 module-scope premise | 1.2, 1.17 | `premise` outside any `.each`; perturbation observed |
| AC-8 DIVIDERS cross-assertion | 1.8 | one `it` |
| AC-9 enrolment and score | 2.1 to 2.6 | registry diff, `mutation:sites` output, scored run with provenance pair |
| AC-10 no UI surface | closeout block line 1 | exit code |
| AC-11 per-category literals | 1.3 | one `it`, six literals |
| AC-12 CENSUS overlap pin | 1.8 | one `it` |
| AC-13 normaliser pin; twenty-eight residue forms, four controls not; value classes by equality; typo co-location keeps the key; §3.3's key-membership and selector probes | 1.7a | six `it`s, thirty-two plus four plus eleven plus ten scratch roots |
| AC-14 per-occurrence bar evaluation | 1.7b | one `it`, problem lists by equality |
| AC-15 oracle alive, canonical classifications | 1.2 | `premise` plus one `it` by equality |
| AC-16 planted defect in the theme, different producer | 1.7c, 1.12 | one `it` (seven names, five stale rows by equality) plus the paired invocation log |
| AC-17 Tailwind major pinned; upgrade reds the census | 1.2 | `premise` on the package version |

## Handoff notes for the implementation pane

- Stage 0 on arrival: overwrite the marker's `sessionId`, clear `blockedOn`, register your own cron, set the labels; verify the round-economy meta-test on arrival rather than trusting this handover.
- Never edit the tree while a codex dispatch or a scored run is live against it; the deciding suite READS `app/globals.css`, `BACKLOG.md` and `DEFERRED.md`, so those are frozen during a score too.
- Stage by path, never `git add -A`: the scratch shard and the scratch corpora are untracked by design.
- A red `source-shards` leg naming a DIFFERENT surface is inherited unless `origin/main`'s nightly shows it green; the standing red set on main is `rowScanOpener`, `destructiveFileAnalysis`, `shardBudget`.
