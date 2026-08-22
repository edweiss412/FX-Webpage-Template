# Intra-leg process-boundary probe — campaign record

**Arc:** `BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG`. **Branch:** `feat/mutation-verdict-intraleg-probe`.
**Spec:** `docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md`
(§5.2 the arms, §3 the pre-registered graduation). **Driver:** `scripts/intraleg-campaign.ts`.
**Killer audit:** `docs/superpowers/specs/ci/probes/2026-08-21-intraleg-killer-audit.md`.

## The question, and why more of probe 3 could not answer it

Probe 3 ran the known-flaky site six times SERIALLY IN ONE PROCESS and got 6/6
identical. Under independent trials that excludes only a flip rate around 40% or
more, and the arithmetic presumes INDEPENDENCE while serial runs in one process
share cache, ordering, environment and load. Correlated within-process state is
exactly what an intra-leg mechanism WOULD BE, so a perfectly correlated 50%
mechanism yields six identical results with probability 1: more trials in the
same process carry no information at any sample size. This campaign varies the
PROCESS BOUNDARY and the ORDERING across trials instead.

## Target, re-derived at campaign time

The plan requires the position be re-derived by the same command rather than
carried forward, because a moved site changes the prefix:

```
mutants: 74
target one-based position: 70
generation-order predecessors (arm-B gate-order prefix): 69
mutants the gate runs AFTER the target (deliberately NOT in the prefix): 4
noOps: 0
```

The site id `relational-boundary:3578:35:<><=` on `psqlStartupScan` has NOT
moved. The 4 successors stay out of the gate-order prefix deliberately: running
them before the target would bind the observation to a condition the real gate
never produces, which is the wrong-attribution direction the bound forbids.

## Harness defects the LIVE integration found before any trial ran

Recorded because both were invisible to every in-process seam, and a campaign
run over either would have been worthless:

1. **The parent observed the wrong process.** The child was spawned through
   `pnpm exec tsx`, which forks: the parent's spawn handle reported the WRAPPER's
   pid while the child self-reported its own. Measured: parent 31881 against
   child 31909, disagreeing on every trial. `node --import tsx` runs the script
   in the spawned process itself — 31944 against 31944. AC-2's "two independent
   sides" is only two sides if the parent's side observes the process that ran
   the trial.
2. **The child could not reach the control surface.** It resolved only against
   `GUARD_SURFACES`, and the §5.3 control is deliberately UNENROLLED apparatus,
   so every control trial refused. The surface row now travels in the invocation.


## The campaign, and what each arm varies

`scripts/intraleg-campaign.ts`, one child process per trial, seeded so the plan
is reproducible from the command alone:

```
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21 --seed 20260821 --trials 12
```

| Arm | Planned | Varies |
| --- | --- | --- |
| A | 12 | the process boundary alone — one fresh child per trial, target site only, no prefix |
| B | 6 | the ORDERING — the target runs after the gate-order prefix of its 69 generation-order predecessors |
| C | 2 | the LOAD — one quiet half and one half under a CPU burner per reported core, adjudicated as a pair |

Arm C is a PAIR, not two independent trials: the §5.2 load column advances only
if both halves completed and are same-stamp attributable. A refused half claims
nothing, and the renderer says so by name rather than dropping to a single-sided
reading.

## Why the campaign's own output cannot perturb the campaign

The deciding suite walks the repository, so anything written under the worktree
during a trial is a candidate for changing the very outcome being measured. Two
independent facts rule it out, both checked rather than assumed:

1. **The walk never reaches the output.** The suite derives its root skip set
   from the committed root `.gitignore` (`rootSkipNamesFromGitignore`), and both
   the campaign's output root and the ship marker's directory are root-ignored:

   ```
   $ grep -nE '^\.claude/|^\.mutation-records/' .gitignore
   55:.claude/
   149:.mutation-records/
   ```

   This is also why the output goes to `.mutation-records/campaign-2026-08-21`
   and NOT to `.mutation-campaign`, which is not ignored and would have dirtied
   the frozen tree on the first trial.

2. **The stamp does not range over it either.** `stampInputs`
   (`tests/mutation/source/determinism.ts:158`) hashes exactly
   `surface.sourcePath`, `surface.suitePaths` in declared order with duplicates
   preserved, and the declared operators plus the score floor. Nothing else is an
   input to the digest, so a write outside those paths cannot move a stamp — and
   a write INSIDE them moves every subsequent stamp, which is precisely the
   AC-12 attributability detector doing its job.

The pair matters in both directions. Fact 1 alone would leave the stamps free to
drift for a reason the record could not name; fact 2 alone would leave the
outcome free to move under a stamp that stayed still, which is the silent-
corruption shape this whole arc exists to catch.

## Pre-registration, quoted verbatim BEFORE the results were read

Extracted from spec §3 by `grep -F` on its own opening words, not retyped.
Producing command:

```
grep -nF -e '**Graduation precondition' -e '**Branch NULL' -e '**Branch POSITIVE' -e '**Either branch:**' \
  docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md
```

> **Graduation precondition, before any branch is entered: EVERY arm has a NONZERO eligible population** (arm C: both halves of its pair completed and attributable, whether the pair then adjudicates or refuses). An arm at zero eligible is not a null — it is an arm that DID NOT RUN (its trials were destroyed by faults or input movement), and §3 classifies nothing until that arm is re-run after removing whatever moved the inputs. Without this, a campaign whose entire primary arm was excluded by AC-12 still classifies NULL on the other arms' quiet and graduates claiming "local branch bounded" with no bound behind the claim — false certification with every per-claim refusal working as specified (probed at review r5). The closeout renderer REFUSES to emit any graduation text while any arm is at zero eligible, naming the arm (AC-16).

> **Branch entry is TOTAL over the states the ACs permit past that precondition, and every claimed number derives from the ELIGIBLE population, never the planned one.** Eligible = completed (not infra-faulted, AC-8) AND attributable (same-stamp, AC-12). POSITIVE iff at least one ELIGIBLE trial flips; otherwise NULL — including partial-completion states, which the ACs expressly allow (probed at review r3: 11 of 12 completed with one fault passes every per-trial check). In NULL, the claimed arm-A bound is RECOMPUTED over the eligible N by the §2 formula — 11 eligible trials support `p > 0.2384`, not the planned `0.2209` — **with a floor: an arm whose eligible N is ZERO makes NO claim at all.** The formula at N=0 evaluates to the impossible `p > 1.0` and a renderer that applies it for every N emits nonsense with full confidence (probed at review r4); a zero-eligible arm is therefore REFUSED by name — "0 eligible of N planned" — exactly as a zero-completed run is, because a bound over an empty population is the vacuous-zero class in numeric costume. The load column advances to two ONLY if the pair was ADJUDICATED **and both halves are same-stamp eligible (§5.2)**; a refused or ineligible pair is reported as such and claims nothing. The archive entry states eligible-versus-planned per arm.

> **Branch NULL — no eligible trial in any arm flips.** Reading: the intra-leg branch's LOCAL reproduction is now bounded — across-process independent flip rate excluded at the bound the ELIGIBLE arm-A count supports (`p > 0.2209` at the full N=12; recomputed upward on any shortfall) at the primary site; no ordering-dependent flip observed among eligible arm-B trials (per-condition n too small for a rate claim and none is made); the load column moves to two IF adjudicated (else stays at one, stated). The row GRADUATES on a re-scoped condition stated first in its archive entry (the `BL-MUTATION-SCORE-NONDETERMINISM` precedent): the instrument exists and is proven discriminating, the local branch is bounded as above, and the remaining open space is weighted toward the CI environment — which local trials cannot reach (§6 limit 1) and which the parent arc's uploaded `.mutation-records` artifacts are the standing evidence channel for. The archive entry carries the eliminated/bounded table (six rows + these bounds) WITH how each was established. The CI-side question files as a documented limit with a re-file trigger (the next observed CI-resident flip, with its record pair as the incident), NOT as a fresh open row — the mint bar wants a measured incident, and a null here is not one.

> **Branch POSITIVE — any ELIGIBLE trial flips.** Reading: first controlled local reproduction of the phenomenon WITH evidence attached — the trial's per-child records, stamps and condition (process/order/prefix/load). **A positive is a REPRODUCTION, never a mechanism (§1.2), and arm placement does not attribute one:** under an ordinary process-independent IID flip rate of 0.1, "arm A flips and arm B does not" occurs with probability ~0.38 and the reverse ~0.13 — the campaign's per-arm n cannot separate placement luck from a placement-driven mechanism. So the pre-registered sub-readings are FOLLOW-UP DIRECTIONS, not attributions: a flip's condition names where the successor's next probe points first (arm-B-only → probe prefix burden further; arm-C-loaded-only → probe load further), and nothing more. The arc still ships — the instrument catching it is its purpose — the row graduates on instrument-plus-reproduction, and a NEW row is minted with the reproduction as its `**Incident:**` (mint-bar satisfied by construction), whose subject is THE REPRODUCTION AND ITS CONDITION, with the follow-up direction recorded as the first scheduled step rather than as the row's asserted mechanism.

> **Either branch:** the campaign's raw outputs, pre-registrations and controls land in `docs/superpowers/specs/ci/probes/` as a dated probe record (parent §2.6 convention), and no number from it is quoted anywhere without its producing command.


## Results, derived from `campaign.json` rather than retyped

Producing command:

```
node scratchpad/render-campaign-results.mjs \
  .mutation-records/campaign-2026-08-21-r2/campaign.json
```

Campaign anchor stamp: `46fd37cf0f07`

Arm B, one row per trial, derived from `campaign.json`:

| trial | prefix length | sites AFTER the target | source |
| --- | --- | --- | --- |
| B#0 | 8 | 0 | seeded shuffle over all other mutants |
| B#1 | 8 | 0 | seeded shuffle over all other mutants |
| B#2 | 8 | 1 (relational-boundary:3933:74:>>>=) | seeded shuffle over all other mutants |
| B#3 | 24 | 2 (regex-quantifier-bound:3675:32:{0,2}>{0,3}, relational-boundary:3933:74:>>>=) | seeded shuffle over all other mutants |
| B#4 | 24 | 0 | seeded shuffle over all other mutants |
| B#5 | 69 | 0 | gate-order predecessors |

| arm | planned | produced | completed | eligible | excluded |
| --- | --- | --- | --- | --- | --- |
| A | 12 | 12 | 12 | 12 | 0 |
| B | 6 | 6 | 6 | 6 | 0 |
| C | 2 | 2 | 2 | 2 | 0 |

**BRANCH NULL.** No eligible trial in any arm flipped.

Arm-A bound over the ELIGIBLE population (12 of 12 planned): `p > 0.2209` at alpha = 0.05 by the one-sided `1 - alpha^(1/n)`.
Arm B contributed 6 eligible ordering trial(s). Per-condition n is too small for a rate claim and none is made.

Load column: REFUSED — in-window samples: quiet 0, loaded 0; each half needs at least 2. The column STAYS AT ONE and the pair claims nothing.

Every eligible trial's whole condition:

```
{"arm":"A","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":99885,"childPid":99885,"nonce":"9f6d20f3-7348-44bf-9c6c-d620bdbadd55","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356399748,"exitedAt":1787356427576},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13662}]}
{"arm":"A","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":849,"childPid":849,"nonce":"e714c8e7-3e4c-4b4c-bbb7-bb4c70ee707f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356427938,"exitedAt":1787356456771},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14666}]}
{"arm":"A","seed":20260821,"index":2,"prefix":[],"position":1,"parentPid":3463,"childPid":3463,"nonce":"85b587c2-95d1-4b3d-8bdd-8dec553a24fe","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356457150,"exitedAt":1787356485965},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14162}]}
{"arm":"A","seed":20260821,"index":3,"prefix":[],"position":1,"parentPid":5418,"childPid":5418,"nonce":"7ce041f7-4961-4b9d-8490-bc8cd88a092c","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356486341,"exitedAt":1787356514671},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14157}]}
{"arm":"A","seed":20260821,"index":4,"prefix":[],"position":1,"parentPid":6804,"childPid":6804,"nonce":"ade8da9a-1fba-450a-bd74-dcf95dcfe484","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356515051,"exitedAt":1787356546392},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":17177}]}
{"arm":"A","seed":20260821,"index":5,"prefix":[],"position":1,"parentPid":8065,"childPid":8065,"nonce":"bbd12cd8-3c76-41b9-82de-50715e2ec4e6","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356546976,"exitedAt":1787356577805},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14653}]}
{"arm":"A","seed":20260821,"index":6,"prefix":[],"position":1,"parentPid":9058,"childPid":9058,"nonce":"4a7abd0c-3a5a-4bfb-9c68-6903c7121f57","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356578194,"exitedAt":1787356612040},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":19700}]}
{"arm":"A","seed":20260821,"index":7,"prefix":[],"position":1,"parentPid":11087,"childPid":11087,"nonce":"9bcbc6e7-8fe5-40d6-b7bb-c4498f5a9e25","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356612414,"exitedAt":1787356640250},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13666}]}
{"arm":"A","seed":20260821,"index":8,"prefix":[],"position":1,"parentPid":12344,"childPid":12344,"nonce":"5a76fecc-67de-4f1d-9eb2-938f858c4f49","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356640609,"exitedAt":1787356668016},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13752}]}
{"arm":"A","seed":20260821,"index":9,"prefix":[],"position":1,"parentPid":13253,"childPid":13253,"nonce":"c1eae24d-c837-48c8-91c8-51fe3f774391","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356668380,"exitedAt":1787356695837},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13726}]}
{"arm":"A","seed":20260821,"index":10,"prefix":[],"position":1,"parentPid":13910,"childPid":13910,"nonce":"919355e6-d676-4f18-b1f9-487eefe22eef","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356696194,"exitedAt":1787356726643},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":16213}]}
{"arm":"A","seed":20260821,"index":11,"prefix":[],"position":1,"parentPid":15651,"childPid":15651,"nonce":"733a8f3a-385c-4cd9-a5ce-5456b5ac6b59","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356727452,"exitedAt":1787356760071},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14777}]}
{"arm":"B","seed":20260821,"index":0,"prefix":["relational-boundary:3246:59:>>>=","relational-boundary:1003:12:>=>>","relational-boundary:1142:53:>>>=","relational-boundary:2206:23:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>"],"position":9,"parentPid":16661,"childPid":16661,"nonce":"b98851b5-1359-4823-b6c0-2198c3c17ba3","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356760480,"exitedAt":1787356913093},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14225}]}
{"arm":"B","seed":20260821,"index":1,"prefix":["relational-boundary:1291:23:<><=","relational-boundary:2467:49:<=><","relational-boundary:1400:29:<><=","relational-boundary:1948:19:>>>=","relational-boundary:2812:24:<><=","relational-boundary:1003:27:<=><","relational-boundary:694:47:>>>=","relational-boundary:2412:16:>>>="],"position":9,"parentPid":18535,"childPid":18535,"nonce":"335d0d9e-8d84-431b-8537-608537cb546e","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787356913481,"exitedAt":1787357058454},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14260}]}
{"arm":"B","seed":20260821,"index":2,"prefix":["relational-boundary:3933:74:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2812:24:<><=","relational-boundary:1142:26:<><=","relational-boundary:2514:21:<><=","relational-boundary:861:69:>=>>","relational-boundary:3005:23:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}"],"position":9,"parentPid":31873,"childPid":31873,"nonce":"2a100ef6-4d8b-4d7c-86ec-9719b008e5cc","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787357058832,"exitedAt":1787357198262},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14254}]}
{"arm":"B","seed":20260821,"index":3,"prefix":["regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:1417:16:<><=","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:2765:29:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:1004:26:{1,3}>{1,4}","relational-boundary:2394:12:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:3675:32:{0,2}>{0,3}","relational-boundary:871:23:>>>=","relational-boundary:2251:33:>>>=","relational-boundary:949:25:<><=","relational-boundary:3933:74:>>>=","relational-boundary:1953:31:<><=","relational-boundary:3246:59:>>>=","relational-boundary:861:69:>=>>","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:1976:36:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:3446:31:<><="],"position":25,"parentPid":36625,"childPid":36625,"nonce":"f9d3835b-aa45-4bac-823f-fcccc66dc4b4","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787357198638,"exitedAt":1787357660845},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":17167}]}
{"arm":"B","seed":20260821,"index":4,"prefix":["relational-boundary:2802:24:<><=","relational-boundary:2202:22:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1186:64:>=>>","relational-boundary:2812:24:<><=","relational-boundary:2765:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:694:47:>>>=","relational-boundary:861:83:<><=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:676:21:<><=","relational-boundary:1976:36:<><=","relational-boundary:1282:23:<><=","relational-boundary:2028:46:>>>=","relational-boundary:1448:16:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3005:46:>>>=","relational-boundary:3172:88:<=><","relational-boundary:1003:12:>=>>","relational-boundary:1857:22:>>>=","relational-boundary:1298:21:<><=","relational-boundary:1902:38:<><="],"position":25,"parentPid":64588,"childPid":64588,"nonce":"9e031cf9-e648-4ec1-b2bc-be1bab9ebb9f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787357661379,"exitedAt":1787358118886},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":16685}]}
{"arm":"B","seed":20260821,"index":5,"prefix":["relational-boundary:676:21:<><=","relational-boundary:694:47:>>>=","relational-boundary:752:35:<><=","relational-boundary:752:50:<><=","relational-boundary:753:17:<><=","relational-boundary:801:23:<><=","relational-boundary:861:69:>=>>","relational-boundary:861:83:<><=","relational-boundary:871:23:>>>=","relational-boundary:949:25:<><=","relational-boundary:1003:12:>=>>","relational-boundary:1003:27:<=><","regex-quantifier-bound:1004:26:{1,3}>{1,4}","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:1021:37:<=><","relational-boundary:1142:26:<><=","relational-boundary:1142:53:>>>=","relational-boundary:1145:50:>>>=","relational-boundary:1186:64:>=>>","relational-boundary:1186:85:<=><","relational-boundary:1282:23:<><=","relational-boundary:1291:23:<><=","relational-boundary:1298:21:<><=","relational-boundary:1400:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:1448:16:<><=","relational-boundary:1709:32:<><=","relational-boundary:1848:26:>>>=","relational-boundary:1857:22:>>>=","relational-boundary:1902:38:<><=","relational-boundary:1926:38:<><=","relational-boundary:1938:30:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1976:36:<><=","relational-boundary:2028:46:>>>=","relational-boundary:2202:22:>>>=","relational-boundary:2203:26:>>>=","relational-boundary:2206:23:<><=","relational-boundary:2208:12:<><=","relational-boundary:2251:33:>>>=","relational-boundary:2394:12:>>>=","relational-boundary:2395:12:>>>=","relational-boundary:2411:16:>>>=","relational-boundary:2412:16:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:2467:49:<=><","relational-boundary:2514:21:<><=","relational-boundary:2765:29:<><=","relational-boundary:2802:24:<><=","relational-boundary:2812:24:<><=","relational-boundary:2819:22:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2866:72:>>>=","relational-boundary:2868:20:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","regex-quantifier-bound:2915:21:{1,2}>{1,3}","relational-boundary:2936:52:<><=","relational-boundary:2981:29:<><=","relational-boundary:3005:23:<><=","relational-boundary:3005:46:>>>=","relational-boundary:3128:50:>>>=","relational-boundary:3144:54:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3172:88:<=><","relational-boundary:3246:59:>>>=","relational-boundary:3446:31:<><="],"position":70,"parentPid":4486,"childPid":4486,"nonce":"02a2213c-cee6-4805-8e20-85f41e76c3d2","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787358119377,"exitedAt":1787359304092},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15221}]}
{"arm":"C","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":35451,"childPid":35451,"nonce":"18cb262b-3e0d-4ecb-8ee4-09a55774af9f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787359304609,"exitedAt":1787359336635},"half":"quiet","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":16777}]}
{"arm":"C","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":41199,"childPid":41199,"nonce":"a61a3ecf-0ade-4c45-adb1-7bf6018ef250","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787359337672,"exitedAt":1787359400500},"half":"loaded","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":31920}]}
```

Record isolation: the default `.mutation-records` listing is BYTE-IDENTICAL before and after the campaign (45 entries), so the campaign wrote nothing into the record space the gate itself reads.


## The driver's own report, verbatim

Written by the campaign to `.mutation-records/campaign-2026-08-21-r2/report.txt`,
which is gitignored, so it is carried here rather than referenced into a path
nobody else can read.

```
ANCHOR STAMP: 46fd37cf0f07
ARM A: 12 eligible of 12 planned (12 of 12 produced, 12 completed)
  BOUND: p > 0.2209 one-sided at alpha 0.05, over 12 eligible trials, CONDITIONAL on cross-process independence
ARM B: 6 eligible of 6 planned (6 of 6 produced, 6 completed)
ARM C: 2 eligible of 2 planned (2 of 2 produced, 2 completed)
TRIAL A#0: seed 20260821, prefix 0, position 1, pid 99885/99885, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356399748, 1787356427576], half n/a, load samples 0, verdict SURVIVED
TRIAL A#1: seed 20260821, prefix 0, position 1, pid 849/849, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356427938, 1787356456771], half n/a, load samples 0, verdict SURVIVED
TRIAL A#2: seed 20260821, prefix 0, position 1, pid 3463/3463, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356457150, 1787356485965], half n/a, load samples 0, verdict SURVIVED
TRIAL A#3: seed 20260821, prefix 0, position 1, pid 5418/5418, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356486341, 1787356514671], half n/a, load samples 0, verdict SURVIVED
TRIAL A#4: seed 20260821, prefix 0, position 1, pid 6804/6804, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356515051, 1787356546392], half n/a, load samples 0, verdict SURVIVED
TRIAL A#5: seed 20260821, prefix 0, position 1, pid 8065/8065, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356546976, 1787356577805], half n/a, load samples 0, verdict SURVIVED
TRIAL A#6: seed 20260821, prefix 0, position 1, pid 9058/9058, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356578194, 1787356612040], half n/a, load samples 0, verdict SURVIVED
TRIAL A#7: seed 20260821, prefix 0, position 1, pid 11087/11087, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356612414, 1787356640250], half n/a, load samples 0, verdict SURVIVED
TRIAL A#8: seed 20260821, prefix 0, position 1, pid 12344/12344, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356640609, 1787356668016], half n/a, load samples 0, verdict SURVIVED
TRIAL A#9: seed 20260821, prefix 0, position 1, pid 13253/13253, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356668380, 1787356695837], half n/a, load samples 0, verdict SURVIVED
TRIAL A#10: seed 20260821, prefix 0, position 1, pid 13910/13910, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356696194, 1787356726643], half n/a, load samples 0, verdict SURVIVED
TRIAL A#11: seed 20260821, prefix 0, position 1, pid 15651/15651, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356727452, 1787356760071], half n/a, load samples 0, verdict SURVIVED
TRIAL B#0: seed 20260821, prefix 8, position 9, pid 16661/16661, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356760480, 1787356913093], half n/a, load samples 0, verdict SURVIVED
TRIAL B#1: seed 20260821, prefix 8, position 9, pid 18535/18535, stamps 46fd37cf0f07/46fd37cf0f07, window [1787356913481, 1787357058454], half n/a, load samples 0, verdict SURVIVED
TRIAL B#2: seed 20260821, prefix 8, position 9, pid 31873/31873, stamps 46fd37cf0f07/46fd37cf0f07, window [1787357058832, 1787357198262], half n/a, load samples 0, verdict SURVIVED
TRIAL B#3: seed 20260821, prefix 24, position 25, pid 36625/36625, stamps 46fd37cf0f07/46fd37cf0f07, window [1787357198638, 1787357660845], half n/a, load samples 0, verdict SURVIVED
TRIAL B#4: seed 20260821, prefix 24, position 25, pid 64588/64588, stamps 46fd37cf0f07/46fd37cf0f07, window [1787357661379, 1787358118886], half n/a, load samples 0, verdict SURVIVED
TRIAL B#5: seed 20260821, prefix 69, position 70, pid 4486/4486, stamps 46fd37cf0f07/46fd37cf0f07, window [1787358119377, 1787359304092], half n/a, load samples 0, verdict SURVIVED
TRIAL C#0: seed 20260821, prefix 0, position 1, pid 35451/35451, stamps 46fd37cf0f07/46fd37cf0f07, window [1787359304609, 1787359336635], half quiet, load samples 1, verdict SURVIVED
TRIAL C#1: seed 20260821, prefix 0, position 1, pid 41199/41199, stamps 46fd37cf0f07/46fd37cf0f07, window [1787359337672, 1787359400500], half loaded, load samples 1, verdict SURVIVED
LOAD: load column unchanged at one, pair refused — in-window samples: quiet 0, loaded 0; each half needs at least 2
BRANCH NULL: no eligible trial flipped. The local reproduction is bounded at the figure each arm's own eligible count supports above.
```

## This is the SECOND campaign, and the first one is why

The first campaign ran at `188fb5c95`. Diff review round 2 then found that the
round-1 repairs had changed the probe core by +289/-54 and the driver by +92/-13
— verdict classification, eligibility, report binding — after it. The plan says a
production edit after the campaign voids it, so it was void: the bound described
bytes that were no longer the ones under review.

The reviewer did not argue that from the diff. It dated the ARTIFACT: the old
`campaign.json` has no `treeBefore` key, so it predates the attestation those
same repairs added, and no later claim about it can move that. A missing field is
an unbackdatable timestamp.

This run is on the committed, post-formatter tree, and its own attestation says
so rather than asserting it:

```
HEAD 607756e3ab1e0d2b702b687782e24c18b86cc4db -> 607756e3ab1e0d2b702b687782e24c18b86cc4db (unchanged)
uncommitted files 0 -> 0 (unchanged)
```

That comparison is now a FAILING CONDITION of the campaign's exit verdict, not a
line it prints. The previous version announced `CHANGED MID-CAMPAIGN` and exited
zero.

## The load column REFUSED again, and the reason is structural rather than a cadence

Zero in-window samples in both halves, exactly as before. This is not bad luck
and no sampler cadence fixes it: `setInterval` schedules its callback on the
event loop, and the child runs under `spawnSync`, which BLOCKS that loop for the
entire window between `spawnedAt` and `exitedAt`. No interval callback can fire
inside a trial's window by construction.

The loaded half's deciding child took 31 920 ms against the quiet half's
16 777 ms, so the load was real and the machine felt it — but duration is the
axis the predecessor arc already eliminated, and it is not evidence about
verdicts. The refusal is what keeps it from being written up as if it were.

**The load arm cannot advance as built.** Repairing it means a sampler that does
not share the blocked thread: a child process, or a sample the trial runner takes
synchronously around the spawn. Recorded as a DOCUMENTED LIMIT of the arm rather
than a finding against the refusal, which is correct.
