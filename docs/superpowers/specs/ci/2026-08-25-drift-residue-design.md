# Drift residue: reach the survivor by render import, decline the ternary fallback, and read the runner population off real records

<!-- spec-lint: not-ui — no rendered surface changes; the only components/ and app/ paths cited are read as guard POPULATION, never edited. See section 6. -->

**Arc:** `fix/screenshots-drift-residue` · **Date:** 2026-08-25 · **Facing:** process

Three rows filed off `fix/screenshots-drift-instrument` and `fix/rowactions-submenu-reveal-flake` share one shape: a guard or a job reports clean over a population that does not contain the thing it is meant to see. This spec closes all three.

**Standing directive, stronger than the process mint freeze.** Eric, 2026-08-25: this arc files NO new `BL-` or `DEF-` row of any facing, with no exception clause — not (a), (b), (c), not `invariant`, not `product-blocked`. Anything found here is repaired in this PR under the class-sweep default, or recorded as a documented limit on the owning surface with a re-file trigger. Under same-axis recurrence the repair direction is NARROWING: decline to fire and document the limit, never grow the recognizer.

---

## §0 Problem

Three rows, one sentence each.

- **`BL-SERVER-TIME-GUARD-EXCLUDES-LIB`.** `tests/help/_metaServerTimeGuard.test.ts` seeds its population from `components` plus manifest-derived `app/<segment>` roots (`tests/help/_metaServerTimeGuard.test.ts:11-38`), so `lib/**` is never walked, and `lib/admin/loadAppEvents.ts:45` is a live unwaived survivor the guard reports clean over.
- **`BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY`.** `scanCandidates`'s `IfStatement` arm falls back to a fault-vocabulary probe and reports an unclassifiable guard as `unknown` residue (`tests/help/_renderFaultScan.ts:726-733`); its `ConditionalExpression` arm has no fallback and drops silently (`tests/help/_renderFaultScan.ts:754`). Separately, `FLAG_RESIDUE` is a registry named for one cause holding entries of three other causes.
- **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED`.** One `dashboard-overview-light.webp` byte drift, mechanism named as sub-pixel rasterization variance, with the runner-population question unread.

---

## §1 The measurements this spec rests on

Every number below was probed on this branch at `d04d63709`, 2026-08-25. They are the inputs to the three decisions, and each decision cites the number that forces it.

### §1.1 Server-time guard: the reachability ladder

Population sizes and TRUE violation counts, where "true" means counted under the guard's own semantics — comments stripped by `stripCommentsForFile`, `lib/time/now.ts` self-exempt (`tests/help/_metaServerTimeGuard.test.ts:72`), `"use client"` files skipped (`tests/help/_metaServerTimeGuard.test.ts:73`), per-line `// not-render-side:` waivers honoured (`tests/help/_metaServerTimeGuard.test.ts:82`). Runtime import edges only: `import type` and all-type-only named-import groups are excluded, because a type edge is erased at build and carries no render.

| population | `lib/**` files | true violations | reaches `loadAppEvents.ts:45` |
|---|---|---|---|
| whole `lib/**` (the naive widening) | 532 | **55** | yes |
| render closure, unbounded depth | 396 | 31 | yes |
| render closure, depth 2 | 319 | 22 | yes |
| **render closure, depth 1 (direct runtime imports)** | **211** | **13** | **yes** |

The brief's figure of 72 raw hits in 43 files is a raw `rg` count; 55 is the same population read through the guard's filters. Both name the same problem: the naive widening is a waiver-writing exercise.

Depth 1 is the narrowing form. It reaches the survivor, and it costs **13** violations against **55**. The existing guard already carries **10** waivers under `components/` and `app/`, every one reading `not-render-side: mutation timestamp (…)`. Twelve more of the same kind is the same instrument at the same scale, not a new class of boilerplate.

### §1.2 Server-time guard: what the 13 are

One repair, twelve waivers.

- **Repaired:** `lib/admin/loadAppEvents.ts:45`. Imported directly by `app/admin/dev/telemetry/page.tsx` — a server-rendered route — where it computes a `occurred_at >= now - sinceH` window during SSR. That is render-side wall-clock, exactly the non-determinism this guard exists to stop, and exactly what makes a capture drift.
- **Waived, 12, in three reason families:** mutation write timestamps (`lib/adminAlerts/resolveAdminAlert.ts:33` and `lib/adminAlerts/resolveAdminAlert.ts:60`), dependency-injection defaults on non-render paths (five sites in `lib/drive/watch.ts` (lines 956, 1044, 1172, 1389 and 1562) and `lib/sync/runManualSyncForShow.ts:297`), and CLI read-path windows (`lib/observe/query/{events,failures,staged,syncLog}.ts`).

**Waiver count added by this arc: 12.**

### §1.3 Render-fault ternary arm: what a fallback would surface

Fresh probe on this branch. The row's 2026-08-24 figures were 714 and 91; both moved, and the spec restates the live ones.

- **719** `ConditionalExpression` nodes under the derived roots whose `whenTrue` contains JSX.
- **79** of those are unclassified by `classifyExpression` AND carry a fault-vocabulary guard — the population a symmetric fallback would surface, each needing a hand-written reason.
- **70 of the 79 (89%) sit in `"use client"` files.** Their guards are interaction state: `state.kind === "error"`, `errorCode`, `failed`, `persistFailed`, `switchStatus === "error"`. The screenshot harness captures server-rendered output; a client error toast is a different population from the one this instrument measures.
- **9 sit in server components.** Of those, 4 are emptiness checks (`allHidden && !roomsFetchFailed` and its three siblings in `components/crew/sections/`), and 2 are already registered (`components/admin/Dashboard.tsx:674` and `components/admin/Dashboard.tsx:858`). The fallback's yield of genuinely new server-render fault sites is **3**, at a cost of 79 declared reasons — and even restricted to server components its output is 6 noise to 3 signal.

That 6:3 ratio is the same failure the `IfStatement` arm already documents at `tests/help/_renderFaultScan.ts:726-731`: `null` and `missing` were tried as vocabulary and withdrawn, because six ordinary routing branches came back as candidates and "a false candidate is not free: it lands in the reported residue, where it dilutes exactly the signal the residue carries."

### §1.4 Render-fault registry: how many stated causes are false

`FLAG_RESIDUE` (`tests/help/_metaRenderFaultMarking.test.ts` lines 68 to 83) holds **7** entries. The brief's count of 6 predates the `inOnboarding` entry in `app/admin/layout.tsx`; the live file has 7.

| entry | actual cause |
|---|---|
| `TelemetryOverviewStrip.tsx` — `SystemHealthCard.unavailable` | flag-shaped |
| `TelemetryOverviewStrip.tsx` — `EventsCard.isInfra` | flag-shaped |
| `app/admin/layout.tsx` — `inOnboarding` | flag-shaped |
| `Dashboard.tsx` — `ignoredDegraded` | ternary, `classifyExpression` returned null |
| `Dashboard.tsx` — `dataGapsDegraded` | ternary, `classifyExpression` returned null |
| `IgnoredSheetsDisclosure.tsx` — `degraded` | ternary, `classifyExpression` returned null |
| `OnboardingWizard.tsx` — `OperatorErrorBlock` | ternary, fault in `whenFalse`, structurally invisible to the arm |

**3 of 7 carry the cause the registry is named for. 4 do not.** Every one of the four states its true cause in prose today — the 2026-08-24 repair at `tests/help/_metaRenderFaultMarking.test.ts` lines 69 to 72 is real and is not re-litigated here — but the prose is the only thing holding it. Nothing computes the cause, so nothing stops the next entry from being filed under the wrong one, which is how these four got there.

### §1.5 Screenshots drift: the runner population, read

Eight evidence records collected 2026-08-25/26, every one inside its 7-day retention window, downloaded from the `drifted-screenshots` artifact of runs 32907197024, 32907278297, 32909205619, 32911850181, 32912521153, 32912963457 (`pull_request`) and 32915671785, 32915681874 (`workflow_dispatch`, fired on `main` from this arc). That is six and two against the brief's minimum of four records with at least two per trigger.

- `runnerArch` is `X64` on all 8. `runnerOs` is `Linux` on all 8. `cpuCount` is 4 on all 8. `runnerName` is distinct on all 8.
- **`cpuModel` takes 4 distinct values:** `AMD EPYC 7763 64-Core Processor`, `AMD EPYC 9V74 80-Core Processor`, `Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz`, `Intel(R) Xeon(R) 6973P-C`.
- Each record carries 14 capture identities.
- **`dashboard-overview/light` — the identity that drifted on 2026-08-18 — is `46d095ed19f5…` on ALL EIGHT records**, across all four CPU models and across both triggers. Seven other identities are likewise single-valued across the whole population.
- **The 6 `crew-preview-*` identities hold two values, and the split is by head branch.** Both `bbbe3503e580…` records are `feat/ui-polish-class-sweep` (runs 32909205619, 32912963457); the other six, including both dispatches on `main`, are `cc36e78cf541…`. **Two CPU models appear on BOTH sides of that split** — `Intel Xeon 6973P-C` (32909205619 is `bbbe`, 32915671785 is `cc36`) and `AMD EPYC 9V74` (32912963457 is `bbbe`, 32915681874 is `cc36`) — so CPU model is refuted as the discriminator twice over, on independent pairs. A UI branch that changes crew-preview rendering and updates its own baselines produces exactly this.
- **Zero identities where `pixelSha256` moved while the source tree held still. Zero cases of `webpSha256` moving without `pixelSha256`.**

**Reading, and it is narrower than the table first suggests.** The runner population is heterogeneous on `cpuModel` — 4 values in 8 runs — and byte equality held across every one of them. That is worth having. It is not a refutation of the runner axis.

**What these eight records CANNOT settle, stated plainly because an earlier draft of this section overstated it.** Not one of the eight reproduces the 2026-08-18 drift: `dashboard-overview/light` is `46d095ed19f5…` on all eight. The comparison `BACKLOG.md:545-547` actually schedules is between a REPRODUCING run and a non-reproducing one, and no reproducing run exists in this population. Eight non-reproductions are not evidence about a failure none of them contains. All eight `runnerName` values are distinct and the pool is explicitly unbounded, so "four CPU models agreed" is a sample, not a closed domain.

The same correction applies to the row's trigger hypothesis, for the same reason. Two `workflow_dispatch` records agreeing with six `pull_request` records does not refute "the trigger is the difference", because neither trigger reproduced the failure here. The mis-sample criticism the row makes of the old 0/9 probe is correct and stands; this arc has not tested the variable it named, and says so rather than claiming a refutation the data does not carry.

**So the runner reading is UNTESTED, not negative.** The comparison was executed as scheduled, and its outcome is that the comparison the row wants cannot be built out of passing runs alone. That is a real result: it tells the next person what to collect.

---

## §1.6 Resolved scope — do not relitigate

Ratified here so no review round re-opens them.

- **No new ledger row.** Eric's directive, 2026-08-25, binding and without exception clause. A finding that would ordinarily be filed is repaired in this PR or recorded as a documented limit with a re-file trigger.
- **The narrowing direction under same-axis recurrence.** Decline to fire and document the limit; never grow the recognizer. AGENTS.md, "Repair direction under same-axis recurrence (2026-08-15)".
- **The screenshots row's own fence.** `BACKLOG.md:549-553`: no screenshots repair on the current evidence, and no perceptual-tolerance comparator. This arc collects and reports; it does not choose between the two candidate repairs.
- **The already-repaired half of the residue row.** The two Dashboard entries already state their true cause in prose. Re-fixing that prose is not a finding; what this spec adds is a computed check so the next entry cannot be misfiled.
- **The 2026-08-24 `class-sweep exception (c)` notes on all three rows.** They were the filing-time justification for deferral. This arc is the scheduled work; the notes are history, not a live scope fence.

---

## §2 The three decisions

### §2.1 Server-time guard — WIDEN, by direct render import, depth 1

The population becomes: every `.ts`/`.tsx` under the existing derived roots, PLUS every `lib/**` module those files import directly at runtime.

The resolver is not new. `resolveSpecifier` at `tests/help/_renderFaultScan.ts:83-99` already resolves `@/`-aliased and relative specifiers to `.ts`/`.tsx` on disk, and already exists because the render-fault scanner needs the same two hops. This spec extracts it to a shared helper and reuses it. The brief's decline condition — "if the import closure cannot be computed without a new module resolver" — is therefore not met: the resolver is in-tree, tested, and load-bearing for a sibling guard today.

**Depth 1, not transitive, and the reason is the guard's own name.** A module a rendered file imports directly is on the render path. A module four hops behind it is in the same module graph for reasons that have nothing to do with rendering: unbounded depth pulls in `lib/sync/runScheduledCronSync.ts`, `lib/sync/promoteSnapshot.ts` and `lib/geocoding/cache.ts`, none of which any render awaits, and it costs 31 violations against 13 to say so. Depth 1 grows the population by render reachability, which is what the row asked for; unbounded depth grows it by module-graph reachability, which is the directory widening wearing a resolver.

**The probe that defends depth 1, so it is not read as a number chosen to keep the waiver count small.** Every one of the 18 violations that unbounded depth adds sits in a module whose only `app/` importers are under `app/api/**` route handlers or cron paths: `lib/sync/applyStaged.ts`, `lib/sync/promoteSnapshot.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/phase1.ts`, `lib/sync/assetRecovery.ts`, `lib/log/persistHealth.ts` and their siblings. `grep -rl` over `app/` and `components/` returns no render-side importer for any of them; the single `components/` hit, on `writeAutoApplyChanges`, is a comment at `components/admin/undoAnnounceContext.ts:34` rather than an import. None is awaited by a server render, so depth 1 loses no render-side survivor.

**The two guards derive the same roots, so the measured numbers transfer.** The ladder above was computed over `scannedFiles()` (`tests/help/_renderFaultScan.ts:70`), whose roots come from `deriveScanRoots` (`scripts/help-screenshots-routes.ts:54`), while the guard being widened uses its own `discoverScanRoots`. Both seed `components` and add `app/<segment>` per manifest route; the only divergence is `deriveScanRoots`'s skip of an interpolated first segment. Probed: every route in `scripts/help-screenshots.manifest.ts` is `/admin` or `/admin/needs-attention`, so both derivations produce exactly `["app/admin", "components"]` and the skip never fires.

`lib/admin/loadAppEvents.ts:45` is repaired to read `lib/time/now.ts`, not waived. It is genuinely render-side and the fix is the one the guard exists to force.

**Guard premise, executable.** A widened population whose new roots resolve to nothing passes unconditionally forever — the shape `tests/_shared/premise.ts` exists to stop. Two premises: the derived `lib/**` set is non-empty, and it contains `lib/admin/loadAppEvents.ts`. The second is asserted by direct containment, not by a root count: the existing assertion at `tests/help/_metaServerTimeGuard.test.ts:115` counts roots and would pass over an empty widening.

### §2.2 Render-fault ternary arm — DECLINE the fallback, document the limit

The arm keeps its bare `continue`. The vocabulary probe is the wrong filter on this arm, and §1.3 is the measurement that says so rather than an intuition: 89% of what it would surface is client interaction state, and the server-side remainder runs 6 noise to 3 signal.

This is the narrowing direction taken at design time rather than after four rounds of one grammar corner each. The alternative — copy the `IfStatement` arm's fallback — is recognizer growth whose entire output is a 79-row hand-written registry, which is the boilerplate failure the row itself named at filing and the brief forbids outright.

**Ratified, and out of scope in both directions so neither side is relitigated.** Not a per-arm vocabulary tuned to server components (its measured yield is 3 signal against 6 noise, so it makes the registry less honest, not more). Not a `whenFalse` arm (the `OnboardingWizard` blind spot is declared, not widened into the recognizer — that decision was taken at review r4b and stands). Not dataflow analysis (spec §4.2's documented ceiling, unchanged).

The limit is recorded in three places, with the live 719 / 79 / 70 / 9 / 3 numbers and a re-file trigger: at the arm in `_renderFaultScan.ts`, in the residue registry's docblock, and in §8.5 of `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md`.

**The re-file trigger, stated once and cited by all three copies.** An earlier draft set it at 3 and was wrong on its own numbers: the computable set — server-component ternaries that are unclassified, fault-vocabulary and not already registered — holds **7** today, not 3. The 3 was the count AFTER discounting four emptiness checks (`allHidden && !roomsFetchFailed` and its three siblings in `components/crew/sections/`), an exclusion the trigger's wording never stated, so as written it was tripped from the moment it was authored.

The trigger is therefore stated with no unstated exclusion: **the count is asserted `<= 7`, its resting value today.** A new unclassified fault-vocabulary server-component ternary trips it and re-opens the decline; removing one simply passes. The four emptiness checks are named in the comment as why the resting value is 7 rather than 3 — that is prose explaining a number, not a rule the assertion silently applies.

### §2.3 Render-fault registry — re-key so every declared cause is computed

`FLAG_RESIDUE` is renamed `UNREACHED_RESIDUE` — a registry named for what it holds, sites layer 1's scanner does not reach, whatever the reason — and each entry declares its cause as a typed field rather than in prose.

**Two causes, not three, and the reason is that a third is not computable.** An earlier draft of this section declared `flag-shaped`, `ternary-unclassified` and `ternary-when-false`, checked by three independent predicates. Round 2 refuted it with the live nodes: `Dashboard.tsx:858`, `IgnoredSheetsDisclosure.tsx` and `OnboardingWizard.tsx` all carry JSX in BOTH arms, so "JSX is in `whenFalse`" is true of three entries whatever arm holds the fault; all four unclassified ternaries satisfy "`whenTrue` contains JSX"; and all four are absent from `scanCandidates()`, so a candidate-absence reading of `flag-shaped` accepts every one of them. Three overlapping predicates cannot report "0 false causes" honestly, because a wrong relabel passes all of them.

Which arm holds the FAULT is the thing the third cause wanted to record, and no AST predicate decides it without a fault oracle the scanner does not have. So the taxonomy narrows to what the AST does decide:

```ts
type UnreachedCause = "not-a-ternary-site" | "ternary-unreached";
```

- **`not-a-ternary-site`** — no `ConditionalExpression` begins at the entry's line. This is the genuinely flag-shaped case: the guard site returns no JSX, so it is not a candidate under any arm.
- **`ternary-unreached`** — a `ConditionalExpression` begins at the entry's line and `classifyExpression` returns `null` for its condition, so the arm's bare `continue` drops it.

**They are mutually exclusive by construction, not by three separate checks agreeing.** The second's structural precondition is the negation of the first, and one derivation function returns exactly one cause per site; the suite asserts the declared cause EQUALS the derived one. A wrong relabel now fails, which is what "0 false causes" has to mean to be worth asserting.

Entries are keyed `file:line:flag` so the derivation has a node to look at. The finer detail the dropped third cause carried — that `OnboardingWizard`'s fault sits in the false arm and is therefore invisible to an arm that inspects only `whenTrue` — stays in that entry's prose, which is where a true statement no checker can decide belongs. This is the same narrowing the ternary decline takes: state computably what is computable, and do not grow a recognizer to fake the rest.

The prose reasons at `tests/help/_metaRenderFaultMarking.test.ts` lines 69 to 72, line 78 and line 80 are preserved verbatim; they are already true and re-fixing them is explicitly not a finding. What changes is that a future entry cannot be filed under a false cause without the suite failing, which is the defect the row is actually about — a registry read as settled while four of seven rows sat under the wrong heading.

### §2.4 Screenshots drift — report the comparison, extend nothing, claim nothing the records do not carry

The done condition offers two conclusions. Neither is available on this evidence, and §1.5 says why: no record in the population reproduces the drift, so the runner reading is untested rather than confirmed or refuted. The spec takes the brief's third path, which the brief names explicitly — DECLINE, record the collected count and the reason as a documented limit, archive the row on that, and do not re-file it.

**The pin is extended to nothing, and that is a decision rather than an omission.** Extending it to `cpuModel` is unavailable in any case — GitHub-hosted standard runners expose no CPU selection — and nothing in the records names `cpuModel` as the variable. Byte equality held across the four models these eight runs drew.

**The predicate is not loosened; the job's CLAIM is what narrows.** The row's fence forbids the loosening: no perceptual-tolerance comparator, and no screenshots repair on the current evidence. What goes into the workflow header is what the population actually supports — byte equality has held across a measured heterogeneous population of eight runs across both triggers; the single 2026-08-18 drift is unexplained on every axis this arc could read; and the comparison the row scheduled needs a reproducing run, which eight passing runs cannot supply.

**Re-file trigger, stated in the header:** if a future record shows two `pixelSha256` values for one identity at one tree state, the runner reading becomes testable and the comparison resumes from these eight records, both triggers included.

The brief's minimum is four records with at least two per trigger. Met and exceeded: six `pull_request` and two `workflow_dispatch`, all eight collected. The dispatch arm's `cancel-in-progress` is `false` (`.github/workflows/screenshots-drift.yml:65`), which does NOT mean dispatches queue harmlessly — a newer pending run in the same group supersedes the older pending one, so three fired back to back yielded two records and one `cancelled`. Fire them sequentially, waiting for each to leave the queue.

---

## §3 Convergence criterion for this spec's reviews

**Consequence bound.** Every input each guard sees is correct or signaled, never silently wrong: classified correctly, or reported as residue with a true declared reason. Never dropped in silence while the guard reports clean. A conservative decline plus a surfaced documented limit is a DOCUMENTED LIMIT, not a finding.

**`PROBE DOMAIN:`** the live tracked corpus only — files under `components/**` and `app/**` reachable from `scannedFiles()` (`tests/help/_renderFaultScan.ts:70`), files under `lib/**` in this checkout, the committed `public/help/screenshots/**` baselines, and evidence records produced by real runs of `.github/workflows/screenshots-drift.yml`. A probe against a hand-built fixture, a synthesized TSX file, or a construct appearing nowhere in the tracked tree files to documented limits, not to a finding.

**Threat fence.** Accidental authoring mistakes by an ordinary contributor. Adversarially obfuscated guards, deliberately exotic TSX and hand-crafted PNG containers are out of scope and file to documented limits. Every admissibility clause cites this fence and the probe domain above.

---

## §4 Documented limits of this close

1. **The ternary arm reports no residue.** 719 JSX-bearing ternaries under the derived roots; 79 unclassified on a fault-vocabulary guard; 70 of those in `"use client"` files; 9 in server components, of which 4 are emptiness checks and 2 already registered. Re-file trigger in §2.2.
2. **The server-time population stops at depth 1.** 18 true violations sit in `lib/**` modules reached only at depth 2 or deeper (31 unbounded minus 13 at depth 1) and are outside the guard's population. Every one is on a cron, sync, or CLI path; none is awaited by a render. Re-file trigger: a server component that imports one of them directly moves it to depth 1 and the guard picks it up automatically, which is the point of deriving the population rather than listing it.
3. **The 2026-08-18 drift stays unexplained, and the runner axis stays UNTESTED rather than cleared.** Sub-pixel rasterization variance is the named mechanism. Eight records show byte equality holding across four `cpuModel` values, but not one of them reproduces the drift, so they say nothing about the failing case. The comparison the row schedules needs a reproducing run. Re-file trigger: the first record that shows two `pixelSha256` values for one identity at one tree state. No further mechanism is proposed and no repair is opened.
4. **`cpuModel` heterogeneity is measured over 8 runs, not proven bounded.** Four values is what eight runs happened to draw from GitHub's pool. The claim is that byte equality held across those four, not that the pool contains only four.
5. **The guard's root set is `components/**` and `app/admin/**`, and nothing else.** Both derivations are manifest-driven and every manifest route is under `/admin`, so `app/show` and `app/me` are outside the population — the no-manifest fallback that once enumerated them (`tests/help/_metaServerTimeGuard.test.ts:16-25`) never fires while the manifest exists. Probed 2026-08-25: `grep -rnE '\bnew Date\(\s*\)|\bDate\.now\(\s*\)' app/show app/me` returns one hit and it is a comment (`app/me/page.tsx:121`), so the gap is currently empty. Re-file trigger: a live time call under either root, or a manifest route outside `/admin`, puts real code in the gap.

---

## §5 Acceptance criteria

- **AC-1.** The server-time guard's computed file population contains `lib/admin/loadAppEvents.ts`, asserted by direct containment.
- **AC-2.** The guard's violation list is empty, with `lib/admin/loadAppEvents.ts:45` repaired to `lib/time/now.ts` and exactly 12 new `// not-render-side:` waivers, each naming its reason family.
- **AC-3.** Two premises hold executably via `tests/_shared/premise.ts`: the derived `lib/**` population is non-empty, and it contains the survivor.
- **AC-4.** The `ConditionalExpression` arm's decline is pinned by an assertion, and the arm, the registry docblock and spec §8.5 each carry the live numbers and the re-file trigger.
- **AC-5.** The count of residue entries whose declared cause is false is **0**, computed from the AST rather than asserted in prose.
- **AC-6.** Both citations of the scanner's pre-repair line number (the ternary arm now sits at 754) are corrected, at `tests/help/_metaRenderFaultMarking.test.ts:57` and in the `BACKLOG.md` row, verified by `rg -n '_renderFaultScan\.ts:[0-9]+'` returning only live line numbers. This criterion deliberately does not spell the stale `path:line` token: an earlier draft did, so the very command it prescribes matched the acceptance criterion itself and could never come back clean.
- **AC-7.** `.github/workflows/screenshots-drift.yml`'s header carries a dated paragraph stating the record count by trigger, the distinct `cpuModel` count, that no record reproduces the drift and therefore what the population cannot settle, that the pin is extended to nothing, and the re-file trigger. It must not claim the runner axis is cleared.
- **AC-8.** All three ledger rows are archived with their measured numbers, and no new `BL-`/`DEF-` row is filed.

---

## §6 Out of scope and N/A declarations

- **UI surface: none.** No file under `components/` or `app/` outside `app/api/**` changes. `impeccable-gate: N/A — no UI surface`.
- **Mutation surface (invariant 10): N/A.** No mutating route handler and no `"use server"` action is touched.
- **Mutation enrolment: N/A.** `scripts/capture-render-fault.ts` is not modified, so the enrolled score at `tests/mutation/source/registry.ts:177-191` is untouched. `tests/help/_renderFaultScan.ts` and `tests/help/_metaServerTimeGuard.test.ts` are not enrolled.
- **Advisory locks (invariant 2): N/A.** No DB mutation path.
- **§12.4 catalog: N/A.** No error-code row changes.
- **A perceptual-tolerance comparator: fenced out** by the row's own scope decision at `BACKLOG.md:549-553`.

---

## §7 Meta-test inventory

| file | change |
|---|---|
| `tests/help/_metaServerTimeGuard.test.ts` | population widened by direct render import; premise + containment assertions added |
| `tests/help/_renderFaultScan.ts` | shared specifier resolver exported; ternary-arm comment restated with live numbers and the re-file trigger |
| `tests/help/_metaRenderFaultMarking.test.ts` | registry re-keyed with typed causes; causes asserted from the AST; stale citation removed |
| `lib/admin/loadAppEvents.ts` | render-side time call repaired to `lib/time/now.ts` |
| `.github/workflows/screenshots-drift.yml` | dated population-comparison paragraph in the header |
| `BACKLOG.md` | three rows archived with measured numbers |
