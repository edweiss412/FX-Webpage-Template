# Timing scan: resolve identifier delays against their binding — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory. The spec is `docs/superpowers/specs/ci/2026-08-16-timing-scan-binding-resolution-design.md`; its probe record is `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md`. This plan carries its own adversarial-review gate below.

**Goal:** delete the global name filter in `scanRepo` and resolve every identifier reference — timer delays and timing-named property values alike — against the DECLARATION it binds to, graduating `BL-TIMING-SCAN-NAME-VS-BINDING`.

**Architecture:** one branch, `fix/timing-scan-scope-resolution`, off `origin/main` (worktree + claim already created by the authoring session). Tasks in order; TDD per task; conventional commits; cross-model diff review; real CI green; merge; `0  0`.

**Date:** 2026-08-16 · **Spec:** `docs/superpowers/specs/ci/2026-08-16-timing-scan-binding-resolution-design.md` · **Status:** plan-APPROVED by SUBSTITUTE review (codex-guard returned no_verdict — OpenAI usage limit to 2026-08-22; independent fresh-eyes subagents acknowledged and never reported; the gate that actually ran is the hostile self-review pass documented in spec §7, which changed the design twice)

## Global constraints

- AGENTS.md invariants bind; exercised here: 1 (TDD per task), 6 (conventional commits), 11 (worktree-only), 12 (ledger claim already declared and pushed). No UI surface, no `DESIGN.md` edit of any kind (spec AC-6 — §5.5 stays byte-identical; an edit would flip the invariant-8 gate), no DB, no advisory locks, no §12.4 rows, no invariant-9/10 registry rows.
- **Base-version gate (spec §1.1 item 5).** PR #827 (`fix/scanner-scope-totality`) edits the subject file and was unmerged when this plan was written. Task 0 blocks on that merge: `git merge origin/main`, then re-verify every citation in the spec and in this plan against the merged file BEFORE Task 1 writes a line. Two writers on one file is invariant 11's hazard.
- Heavy-slot discipline: `pnpm heavy` wraps `pnpm mutation:guards` and any full-suite run; the scoped single-file vitest runs in the task bodies stay unwrapped.
- Guard-premise rule (`tests/_shared/premise.ts`, `premise` at :26, `premiseHolds` at :36) applies to every new fixture case whose discriminating power rests on a constructed universe.

## Pre-draft verification pass (run at plan time; no task re-derives these)

- **The twelve probes behind the spec** are recorded in full with transcripts at `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md`. Load-bearing results: 311 universe files; 24 `named-constant` sites over 23 distinct names; 35 sites suppressed by the name filter (18 same-file, 17 cross-file imports, all 17 specifiers resolving to the declaring file); the pinned `noResolve`+`noLib` program costs 254-502 ms cold and 160-220 ms warm; zero delta against the name filter across 367 identifier references.
- **Consumers of the scanner's exports** — the complete set, from `rg`: `scripts/scan-interaction-timings.cli.ts:14` (`inventoryRows`, `scanRepo`), `tests/docs/interactionTimingScan.test.ts:30`, `tests/docs/_metaInteractionTimingInventory.test.ts:25`. No other file imports the module, so the blast radius of a signature change is those three.
- **Whole-repo `scanRepo` call count** (the §2.4 cost claim): six `scanRepo(REPO_ROOT)` in `tests/docs/_metaInteractionTimingInventory.test.ts`, one `scanRepo(process.cwd())` in `tests/docs/interactionTimingScan.test.ts`; the remaining calls in the latter take synthetic roots holding a handful of files.
- **Mutation harness entry points:** `pnpm mutation:guards` = `VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts` (package.json:55). The gate has NO env-based surface filter, so a scoped run goes through the gate's own code path: `runSurface(root, surface)` (`tests/mutation/source/runner.ts:230`) + `evaluateGate` (`tests/mutation/source/gate.ts:36`) + `score` (`tests/mutation/source/ledger.ts:79`). The overlay is in-memory (`tests/mutation/source/overlay.ts`), so a scoped run does not dirty the tree.
- **Site enumeration for the accepted-set re-derivation:** `enumerateSites(sourcePath, text, operators)` (`tests/mutation/source/operators.ts:99`).
- **Operator families (the closure set this arc converges against):** `relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal` (`OPERATOR_NAMES`, `tests/mutation/source/operators.ts:17-24`). The `interactionTimingScan` row enrols ALL SIX. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.
- **`tsconfig.json` alias mapping:** `compilerOptions.paths` is `{"@/*": ["./*"]}` with no `baseUrl` (tsconfig.json:25-27). Task 3 pins this.

## Acceptance-criteria coverage (spec §6 ids, and the task that discharges each)

Every id below is the spec's; this table is the map, and no task invents one.

| AC | what it demands (spec §6) | discharged by |
| --- | --- | --- |
| **AC-1** | a module-level shadow yields an `unclassified` site; the same fixture yields NO site on the unfixed scanner | Task 1, fires case 1 |
| **AC-2** | in one file, the shadowed call reports while the unshadowed call stays resolved — precision, not blanket reporting | Task 1, fires case 2 |
| **AC-3** | a parameter shadowing a covered constant reports | Task 1, fires case 3 |
| **AC-4** | a timing-named PROPERTY whose value is a shadowing identifier reports, carrying its `propertyKey`; the live `ttlMs` pass-throughs stay resolved | Task 2 |
| **AC-5** | legit local, direct import, aliased import, and barrel re-export all resolve — no new residual from any of them | Task 1: three stays-quiet halves (legit local, direct import, barrel re-export) plus the aliased import, which is a fires-to-quiet change |
| **AC-6** | zero live delta: `tests/docs/` green, `DESIGN.md` byte-identical, live `unclassified` still empty | Task 2's verification step |
| **AC-7** | the resolver's alias assumption is pinned against `tsconfig.json` | Task 3 |
| **AC-8** | mutation gate green at floor 0.95 with the accepted set re-derived, both numbers in the round-1 diff brief | Task 4 |
| **AC-9** | the scanner header's documented hole is rewritten to the closed contract | Task 5 step 1 |
| **AC-10** | before/after cost recorded; the memo fallback lands with its own measurement if the budget is exceeded | Task 0 (before) + Task 5 step 2 (after) |
| **AC-11** | the ledger entry graduates with its marker stripped inside the archiving move; corpus rows committed | Task 5 steps 3-4 |
| **AC-12** | a binding declared on the same line as a covered constant does not inherit its coverage | Task 1, the same-line-neighbour case |

**Line anchors in the `red-target=` markers are pre-#827 locators** (`scripts/scan-interaction-timings.ts` as tracked on this branch's base: `coveredNames` at 445, the `resolved` filter at 449). Task 0's merge moves them; re-verify by SYMBOL, not by line, and update the two markers in the same commit as the merge.

## Registry reconciliation (authored AND run at plan time)

`interactionTimingScan` today (extracted mechanically from `tests/mutation/source/registry.ts` on this branch's base): **8 accepted rows, all `kind: "equivalent"`, 0 `accepted-gap`**, `scoreFloor: 0.95`, all six operators, suites `tests/docs/_metaInteractionTimingInventory.test.ts` + `tests/docs/interactionTimingScan.test.ts`.

Declared delta for this arc: **the accepted set is RE-DERIVED, not edited.** `siteId`s are LINE-keyed (`<operator>:<line>:<col>:<from>><to>`) and this arc changes lines in `scanRepo` and the delay branch, so every row below the first edit shifts and the gate reports the whole set stale by construction — the registry row's own comment mandates re-derivation via `enumerateSites` rather than hand-adjustment, citing the previous arc's eight stale rows. Post-arc the row still holds ALL SIX operators and `scoreFloor: 0.95`; the accepted count may change only because a mutant that was equivalent is now killed (or a genuinely new equivalent appears, which needs its own reason string). No other registry row is touched. Any other delta in the diff is a defect.

## Meta-test inventory (declared)

- **CREATES:** eleven synthetic-universe assertions in `tests/docs/interactionTimingScan.test.ts`, derived from the Task 1 and Task 2 tables rather than counted by hand — **six FIRES** (an assertion that fails before the repair, or against a line-keyed repair: module-level shadow, inner-scope shadow, parameter shadow, aliased import, the same-line neighbour, and Task 2's property-value shadow) and **five STAYS-QUIET** (passes before and after: the unshadowed peer in the shadowing file, a legit same-file constant, a direct import, a barrel re-export, and Task 2's live-shaped `ttlMs` pass-through). The aliased import is a FIRES case rather than a quiet one because it reports `unclassified` under today's name filter and resolves after — the one place this arc removes a residual instead of adding one. One structural test pins the resolver's alias assumption against `tsconfig.json`.
- **EXTENDS:** `scripts/scan-interaction-timings.ts` (`TimingSite.refPos`, the resolver, `scanRepo`'s resolution step, the header paragraph documenting the hole); `tests/mutation/source/registry.ts` (`interactionTimingScan` accepted set, re-derived).
- **NOT touched:** `DESIGN.md` (AC-6), `UNCLASSIFIED_DISPOSITIONS`, `EXPLICIT_INCLUDES`, `inventoryRows`, `scripts/scan-interaction-timings.cli.ts`. No invariant-9 registry (no Supabase call site), no invariant-10 mutation surface (tooling and test code only).

<!-- tasks: depth=3 red-contract -->

### Task 1 — a shadowed timer delay reports instead of vanishing

<!-- task: red=`pnpm exec vitest run tests/docs/interactionTimingScan.test.ts` red-state=authored red-target=`scripts/scan-interaction-timings.ts:449` why=`each new fires case asserts that a shadowed delay appears in the scan result unclassified list; the name filter deletes it before the caller sees it, so the case fails until resolution is keyed on the declaration` ac=AC-1,AC-2,AC-3,AC-5,AC-12 -->

**What is red and why:** four new synthetic-universe cases assert sites that the global name filter currently removes. The production line whose behavior makes them fail is the `resolved` filter inside `scanRepo`; nothing test-local decides it.

**RED — cases, in `describe("scanRepo over a synthetic tree")`'s style (each writes its own `mkdtempSync` universe):**

| case | shape | assertion | half |
| --- | --- | --- | --- |
| module-level shadow | scanned file exports `COPY_FEEDBACK_RESET_MS = 1600`; component declares its own `const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig()` and calls `setTimeout(fn, COPY_FEEDBACK_RESET_MS)` | that file appears in `unclassified` with `name === "COPY_FEEDBACK_RESET_MS"` | fires |
| inner-scope shadow | one file IMPORTS the covered constant, shadows it inside one function, and uses the import in another | the shadowed line is in `unclassified`; the unshadowed line is NOT | fires + precision |
| parameter shadow | covered constant imported; a parameter of the same name is the delay | the site is in `unclassified` | fires |
| legit local | `const CLOSE_DELAY_MS = 220` used in the same file | no residual for that file | quiet |
| direct import | covered constant imported and used | no residual | quiet |
| aliased import | `import { OTHER_DELAY_MS as localAliasMs }` used as the delay | no residual — TODAY this reports `unclassified`, so this row is also a fires-to-quiet change | fires |
| barrel re-export | covered constant imported through a re-exporting file | no residual | quiet |
| same-line neighbour | `const CLOSE_DELAY_MS = 220, other = readConfig();` with `setTimeout(fn, other)` | `other` appears in `unclassified` | fires against a line-keyed repair (probe P10); quiet today |

**House convention this file already keeps:** the fixture-tree suite builds each universe with its local `tree({...})` helper and `rmSync`s it in a `finally`, and every case NAMES THE MUTANT IT KILLS in a comment. Each new case does both — the mutant a shadow case kills is the resolution step reverting to name equality.

**Premise (executable, and proven on the case's OWN inputs).** A universe-wide `sites.length > 0` is satisfiable by the fixture's OTHER file — a case whose component landed outside `UNIVERSE_ROOTS` would still pass it while its own "no residual" assertion holds vacuously. Each case therefore asserts its own reference file was scanned: `premiseHolds("the case's own file is in the scan universe", universeFiles(root).includes(<that file>))`, immediately above the residual assertion. That is the control the quiet halves need, since their assertion is an absence.

**Four pre-dispatch mutants, run and recorded in the commit message, for each fires case** (the string-presence discipline applied to the `name` assertions): (a) the shadow's initializer emptied to a numeric literal — the case must go quiet, proving the assertion tracks non-literal-ness and not the file's existence; (b) the shadow identifier suffixed (`COPY_FEEDBACK_RESET_MS2`) — the residual must still appear but under the new name, proving the assertion reads the site and not a constant; (c) the `setTimeout` call commented out — the residual must vanish, proving it comes from the call site rather than the declaration; (d) the covered export deleted from the scanned file — the residual must remain, proving the case does not depend on the covered row existing.

**GREEN — implementation, delay path only:**

1. `TimingSite` gains two absolute offsets: `readonly refPos?: number`, the reference identifier's start, recorded where the delay argument IS a bare identifier; and `readonly declPos?: number`, the declaration name node's start, recorded on every `named-constant` site. The covered set is keyed `${file}:${declPos}` — NOT by line, which aliases two bindings declared on one line and would suppress a real site (spec §2.1, probe P10).
2. The delay branch's `ts.isIdentifier(delay) && TIMING_NAME.test(delay.text)` gate collapses into the generic identifier path: any bare-identifier delay records `name = delay.text` and `refPos`. Live effect zero (spec §2.3, probe P7).
3. A new module-local `createBindingResolver(repoRoot, sources)` takes the `(path, text)` pairs `scanRepo` ALREADY READ — not a path list — and serves them through a `ts.CompilerHost`, so the resolver never touches the filesystem. Two consequences the plan depends on: `refPos` offsets are guaranteed to index the same text the sites were computed from (spec §2.3), and the existing unreadable-file case (a universe file chmod'd `0o000`) keeps behaving exactly as today, because a file `scanRepo` could not read simply is not in the pairs. It returns `(file, pos) => declarationKey | null`, where `declarationKey` is `${file}:${startOffset}` of the resolved declaration's name node via `ts.getNameOfDeclaration(decl) ?? decl`, alias-followed with a guarded `getAliasedSymbol`, and `getShorthandAssignmentValueSymbol` on the shorthand path.
4. `scanRepo` builds the covered DECLARATION-KEY set from its own `named-constant` sites' `declPos` and suppresses a delay site only when some declaration of the resolved symbol is in that set.

**Two strict-tsconfig traps this repo's flags create, called out so they are not discovered at paste time:** `exactOptionalPropertyTypes: true` means an optional `refPos?: number` may not be assigned an explicit `undefined` — build the site object WITHOUT the key on the paths that have no reference, rather than with `refPos: undefined`. `noUncheckedIndexedAccess: true` means `symbol.declarations[0]` is `Declaration | undefined`; the resolution rule reads the declarations with `.some(...)` and never indexes.

**Property sites keep the name filter in this task, and the discriminator is stated so the shortcut is not available.** Task 1 records `refPos` on the DELAY paths only; the resolution step consults the covered-declaration set when a site carries a `refPos` and falls through to the surviving `coveredNames` filter when it does not. Route every `unclassified` site through resolution here instead and Task 2's fires case passes the moment it is authored — its `red-state=authored` marker would then name a red nobody can observe, which is invariant 1 failing silently rather than loudly.

**Commit:** `fix(scripts): resolve a timer delay against its binding, not its spelling`

### Task 2 — timing-named property values resolve the same way, and the name filter is deleted

<!-- task: red=`pnpm exec vitest run tests/docs/interactionTimingScan.test.ts` red-state=authored red-target=`scripts/scan-interaction-timings.ts:445` why=`the property-shadow case asserts a residual for a ttlMs property whose value is a local non-literal binding sharing a covered constant's spelling; Task 1 leaves that path on the name set, so the case fails until the set is deleted` ac=AC-4,AC-6 -->

**What is red and why:** one new fires case (`{ ttlMs: SHADOW }` in a file that shadows a covered constant) plus one stays-quiet case (the live `ttlMs: ANNOUNCE_LOG_TTL_MS` shape, reproduced in the synthetic universe). The first fails while the property path still consults `coveredNames`.

**GREEN:**

1. `refPos` is recorded for the identifier-valued forms of every unclassified property site — `PropertyAssignment` with an identifier initializer, `ShorthandPropertyAssignment` (the value IS the name), and `JsxAttribute` whose expression container holds a bare identifier.
2. `coveredNames` and its filter are DELETED. One resolution step now serves both positions.
3. Live-tree assertions: `scanRepo(REPO_ROOT).unclassified` stays empty and `inventoryRows` still matches §5.5 — the existing meta-test asserts both directions, so a lost resolution and a wrongly-gained one each fail it.

**Anti-tautology:** the property fires case must NOT be satisfiable by the shorthand path alone — it is written as an explicit `key: value` pair, and its stays-quiet twin uses the same key with the covered import, so the discriminator is the BINDING, not the key spelling.

**Verification:** `pnpm exec vitest run tests/docs/` green; `git diff --stat DESIGN.md` empty.

**Commit:** `fix(scripts): resolve timing-named property values by binding and delete the name set`

<!-- tasks: end -->

### Task 3 — pin the resolver's module-alias assumption against `tsconfig.json`

Outside the marked region deliberately: this is a guard with no natural RED — the mapping it pins is already correct, so a marker claiming an observed red-then-green cycle would be false. It gets the mutant-red treatment instead.

- Export the resolver's alias mapping as a named constant and assert it equals `compilerOptions.paths` read from `tsconfig.json`. **Assert `baseUrl` is ABSENT there too**: the resolver pins `baseUrl: repoRoot`, and someone adding `"baseUrl": "./src"` to the tsconfig would mis-resolve every `@/…` specifier and push 17 live sites to `unclassified` — the exact failure this task names, and uncaught by a paths-only assertion (`tsconfig.json` has no `baseUrl` key today).
- **Mutant-red probe, run and recorded in the commit:** flip the exported constant to `{"~/*": ["./*"]}` and confirm the test fails; flip `tsconfig.json`'s mapping in a scratch copy and confirm it fails from that side too. A guard that cannot be made to fail from either side is not pinning anything.
- **Failure mode it catches:** the repo adopts a second alias (or renames `@/`), every `@/`-specified import silently stops resolving, and 17 live sites quietly become `unclassified` — a loud test instead of a mass re-disposition.

- **The test lives in `tests/docs/interactionTimingScan.test.ts`**, not a new file: the registry row's `suitePaths` are the two named suites, and this plan declares the accepted set as the row's ONLY delta, so a new file would be either coverage outside the gate or an undeclared `suitePaths` change.

**Commit:** `test(scripts): pin the timing resolver's alias assumption to tsconfig`

### Task 4 — mutation gate: re-derive the accepted set and re-run

Outside the region: a gate run, not a red-then-green cycle.

1. Re-derive site ids: `enumerateSites("scripts/scan-interaction-timings.ts", <post-change text>, OPERATOR_NAMES)`; rewrite the eight accepted rows' `siteId`s from that output. Do not hand-adjust line numbers.
2. Re-run each accepted row's justification against the new text — a row whose mutant is now KILLED is deleted, not carried.
3. `pnpm heavy pnpm mutation:guards`. Record score and the unaccepted-survivor set. Floor is 0.95.
4. If the whole-gate run is blocked by a saturated heavy queue, run the surface through the gate's own code path (`runSurface` + `evaluateGate` + `score`) and say so explicitly in the closeout — a scoped substitute is evidence about THIS surface, never evidence that the gate is green.
5. **Both numbers go in the round-1 diff brief** per the guard-surface dispatch rule; a `GUARD SURFACE:` line without `MUTATION SCORE: <killed>/<total>` plus "0 unaccepted survivors" makes `codex-guard` exit 2 before dispatching.

**Commit:** `test(mutation): re-derive the interactionTimingScan accepted set`

### Task 5 — header honesty, cost record, ledger graduation, corpus

Outside the region: documentation and ledger movement.

1. The header rewrite is NOT here — spec AC-9 puts it in the same commit as the behavior change, and Task 2 lands it. This step only verifies it happened: `rg -U 'resolves by NAME' scripts/scan-interaction-timings.ts` must find nothing. **Why the ordering is load-bearing:** `siteId`s are `<operator>:<line>:<col>:…`, so ANY edit above an accepted row shifts it. Rewriting the header here would re-staleify the set Task 4 just re-derived, and the round-1 diff brief's `MUTATION SCORE` would be computed against an accepted set a later commit invalidates. **Task 4 is the LAST edit this arc makes to that file.**
2. Record the measured cost (AC-10): the two suites' wall clock and the `mutation:guards` wall clock, before and after. If the suite delta exceeds 2 s locally, land the §2.4 memo fallback with its own measurement rather than a weaker resolver.
3. Graduate `BL-TIMING-SCAN-NAME-VS-BINDING` to `BACKLOG-archive.md`, stripping the in-progress marker INSIDE the archiving move (invariant 12; archives categorically reject in-flight entries).
4. Commit the arc's review-round corpus rows. **Task 0's merge moves the merge-base, so this arc's rows split across two `<baseSha12>.jsonl` files** — `daa53759a953.jsonl` (authoring, already committed) and whatever the post-merge base is. `countedRounds` buckets per row-set and the filing requirement is per-`baseSha12`, so check BOTH files against the threshold and file beside whichever one reaches it.
5. Closeout §12 with the impeccable-gate marker.

**Commit:** `docs(backlog): graduate BL-TIMING-SCAN-NAME-VS-BINDING`

## Task 0 — base sync and baseline (before Task 1)

Not a code change; the gate that makes Tasks 1-2 legal.

1. Confirm PR #827 merged: `gh pr view 827 --json state,mergedAt`. If still open, WAIT — do not edit `scripts/scan-interaction-timings.ts` on this branch (spec §1.1 item 5, invariant 11).
2. `git merge origin/main`; re-verify every spec citation against the merged file (`coveredNames`/`resolved` in `scanRepo`, the delay branch, the header paragraph, `EXPLICIT_INCLUDES`).
3. Record the BEFORE numbers AC-10 compares against: `time pnpm exec vitest run tests/docs/interactionTimingScan.test.ts tests/docs/_metaInteractionTimingInventory.test.ts`, and the pre-change `pnpm heavy pnpm mutation:guards` score for `interactionTimingScan`.

## Self-review checklist

- [ ] Every named file/symbol re-grepped (pre-draft pass above).
- [ ] Anti-tautology: every fires case has a stays-quiet twin; expectations derive from each fixture's own shape; the four mutants are run per fires case and recorded.
- [ ] RED validity: Tasks 1 and 2 each name the production line whose behavior makes their new cases fail; Tasks 0, 3, 4, 5 sit outside the marker region with their reasons stated inline.
- [ ] Reconciliation authored AND run: the registry extraction above, the consumer sweep, the call-count sweep.
- [ ] `pnpm spec:lint` on this plan: 0 hard.
- [ ] Numeric sweep after every repair round.

## 12. Closeout

impeccable-gate: N/A — no UI surface
