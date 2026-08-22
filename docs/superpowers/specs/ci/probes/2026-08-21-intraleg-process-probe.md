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

The campaign ran FOUR times. Each of the first three was voided by the diff-review
repairs that followed it — the plan says a production edit after a campaign
invalidates it — so only the fourth describes the code under review. All four
commands are recorded, because a record that shows only the surviving run hides
what the arc actually cost:

```
# 1 — voided by the round-1 repairs
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21 --seed 20260821 --trials 12

# 2 — voided by the round-3 repairs
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21-r2 --seed 20260821 --trials 12

# 3 — voided by the round-4 repairs
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21-r3 --seed 20260821 --trials 12

# 4 — THE ONE EVERY NUMBER BELOW COMES FROM
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21-r4 --seed 20260821 --trials 12
```

| Arm | Planned | Varies |
| --- | --- | --- |
| A | 12 | the process boundary alone — one fresh child per trial, target site only, no prefix |
| B | 6 | the ORDERING — the target runs at position 9, 25 or 70, behind prefixes of 8, 8, 8, 24, 24 and 69 mutants. FIVE are seeded shuffles over the other mutants; ONE (B#5) is the gate-order prefix of all 69 generation-order predecessors |
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
# per-arm populations
jq -r '.aggregate.arms[] | "\(.arm) \(.planned) \(.produced) \(.completed) \(.eligible) \(.excluded|length)"' \
  .mutation-records/campaign-2026-08-21-r4/campaign.json
# arm B, one row per trial
jq -r '.trials[].observation.plan | select(.arm=="B") | "B#\(.index) prefix=\(.prefix|length) position=\(.position)"' \
  .mutation-records/campaign-2026-08-21-r4/campaign.json
# and the standing check that every figure below still matches the artifact
pnpm intraleg:claims
```

The earlier draft of this line cited `node scratchpad/render-campaign-results.mjs`,
which exists only in one session's scratchpad and cannot be run from a checkout.
A producing command nobody else can run is not a producing command, and this
section's own pre-registration ("no number from it is quoted anywhere without its
producing command") is what it failed. Found at diff review r5.

Campaign anchor stamp: `46fd37cf0f07`

**Which REVISION this measures, and why that sentence is now load-bearing.** The
campaign ran against `psqlStartupScan` at merge-base `0ba72c23774f`, where
`scan.ts` is 4049 lines and the primary target site
`relational-boundary:3578:35:<><=` is the inner `for (let depth = 0; depth < 32;
depth++)`. PR #873 then landed attached-redirection-target substitution on main
(`2f1071b28`), changing BOTH of this surface's declared and stamped inputs —
`scan.ts` by +473 lines and the deciding suite by +914 — and moving that same
construct to line 3965. So against the merged tree the stamp `46fd37cf0f07` does
not reproduce, and the site id does not name the same construct.

Nothing above is retracted by that: a measurement is permanently true of the
tree it measured, which is the plan's own rule read in the other direction. What
changes is the scope sentence. The arm-A bound is a bound on THAT revision of
that surface, not a standing property of the file that now ships. The campaign
was NOT re-run for it, and that is a decision rather than an omission: on a
branch that merges main, re-dating the measurement lasts until the next merge,
and this arc already spent four campaigns learning what that treadmill costs.
Re-file trigger: the next campaign of any kind runs against the tree it will
describe, and states its base sha here the way this paragraph does.

Derive both halves rather than trusting this prose:

```
git show 0ba72c23774f:tests/cross-cutting/psqlStartupFiles/scan.ts | sed -n '3578p'
git show 2f1071b28:tests/cross-cutting/psqlStartupFiles/scan.ts    | sed -n '3965p'
git diff 0ba72c23774f..2f1071b28 --stat -- \
  tests/cross-cutting/psqlStartupFiles/scan.ts \
  tests/cross-cutting/psqlStartupFileSuppression.test.ts
```

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
{"arm":"A","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":186,"childPid":186,"nonce":"4fd59c19-7989-4034-9b64-3d643ad687df","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368239690,"exitedAt":1787368268525},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14161}]}
{"arm":"A","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":2262,"childPid":2262,"nonce":"f2770191-ee65-4e6a-8414-498e34093c02","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368268910,"exitedAt":1787368297738},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14670}]}
{"arm":"A","seed":20260821,"index":2,"prefix":[],"position":1,"parentPid":5483,"childPid":5483,"nonce":"e7fecaf5-5709-45de-be75-614a3baca74d","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368298111,"exitedAt":1787368327439},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14660}]}
{"arm":"A","seed":20260821,"index":3,"prefix":[],"position":1,"parentPid":6813,"childPid":6813,"nonce":"745923ad-af1d-420b-a13f-40095a6bc77c","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368327828,"exitedAt":1787368356142},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14177}]}
{"arm":"A","seed":20260821,"index":4,"prefix":[],"position":1,"parentPid":7908,"childPid":7908,"nonce":"469d29ec-d5e1-4ff6-917e-a1f14f7bed0e","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368356519,"exitedAt":1787368385335},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14156}]}
{"arm":"A","seed":20260821,"index":5,"prefix":[],"position":1,"parentPid":11027,"childPid":11027,"nonce":"d838e785-7e19-4d59-98cb-20fba985f7d2","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368385716,"exitedAt":1787368414054},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14156}]}
{"arm":"A","seed":20260821,"index":6,"prefix":[],"position":1,"parentPid":13122,"childPid":13122,"nonce":"e60e115d-26d3-4839-8306-053a8c9df688","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368414427,"exitedAt":1787368447800},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":18211}]}
{"arm":"A","seed":20260821,"index":7,"prefix":[],"position":1,"parentPid":13941,"childPid":13941,"nonce":"7e88c922-a8c7-4a7f-a75a-cb62481211bc","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368448420,"exitedAt":1787368484250},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":17655}]}
{"arm":"A","seed":20260821,"index":8,"prefix":[],"position":1,"parentPid":14730,"childPid":14730,"nonce":"56438591-5ad2-4d48-be78-80763a4ef2b3","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368484713,"exitedAt":1787368515572},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15176}]}
{"arm":"A","seed":20260821,"index":9,"prefix":[],"position":1,"parentPid":15238,"childPid":15238,"nonce":"4a2d7cbe-736c-4b28-99ec-1e7ac8946a97","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368516001,"exitedAt":1787368552386},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":21219}]}
{"arm":"A","seed":20260821,"index":10,"prefix":[],"position":1,"parentPid":16083,"childPid":16083,"nonce":"99e1acd0-9054-4a3c-b624-23ebe7227710","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368552958,"exitedAt":1787368597406},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":22737}]}
{"arm":"A","seed":20260821,"index":11,"prefix":[],"position":1,"parentPid":17438,"childPid":17438,"nonce":"59cedf5a-e1c2-4a0f-909e-e1acb7927839","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368597916,"exitedAt":1787368637289},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":19187}]}
{"arm":"B","seed":20260821,"index":0,"prefix":["relational-boundary:3246:59:>>>=","relational-boundary:1003:12:>=>>","relational-boundary:1142:53:>>>=","relational-boundary:2206:23:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>"],"position":9,"parentPid":19214,"childPid":19214,"nonce":"19119308-ab74-4e30-b60f-d58df4b54e58","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368637902,"exitedAt":1787368827270},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15166}]}
{"arm":"B","seed":20260821,"index":1,"prefix":["relational-boundary:1291:23:<><=","relational-boundary:2467:49:<=><","relational-boundary:1400:29:<><=","relational-boundary:1948:19:>>>=","relational-boundary:2812:24:<><=","relational-boundary:1003:27:<=><","relational-boundary:694:47:>>>=","relational-boundary:2412:16:>>>="],"position":9,"parentPid":27686,"childPid":27686,"nonce":"41591b26-fea7-4618-bd1b-a721cac5413d","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368827687,"exitedAt":1787368987440},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":23707}]}
{"arm":"B","seed":20260821,"index":2,"prefix":["relational-boundary:3933:74:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2812:24:<><=","relational-boundary:1142:26:<><=","relational-boundary:2514:21:<><=","relational-boundary:861:69:>=>>","relational-boundary:3005:23:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}"],"position":9,"parentPid":34081,"childPid":34081,"nonce":"2361cdd2-d777-4a5d-83f7-4fa30e439317","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787368987894,"exitedAt":1787369200189},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15678}]}
{"arm":"B","seed":20260821,"index":3,"prefix":["regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:1417:16:<><=","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:2765:29:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:1004:26:{1,3}>{1,4}","relational-boundary:2394:12:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:3675:32:{0,2}>{0,3}","relational-boundary:871:23:>>>=","relational-boundary:2251:33:>>>=","relational-boundary:949:25:<><=","relational-boundary:3933:74:>>>=","relational-boundary:1953:31:<><=","relational-boundary:3246:59:>>>=","relational-boundary:861:69:>=>>","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:1976:36:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:3446:31:<><="],"position":25,"parentPid":38675,"childPid":38675,"nonce":"d1d026ab-a4d1-4fc7-8ec9-c0e1fabded2a","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787369200735,"exitedAt":1787369579090},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15175}]}
{"arm":"B","seed":20260821,"index":4,"prefix":["relational-boundary:2802:24:<><=","relational-boundary:2202:22:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1186:64:>=>>","relational-boundary:2812:24:<><=","relational-boundary:2765:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:694:47:>>>=","relational-boundary:861:83:<><=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:676:21:<><=","relational-boundary:1976:36:<><=","relational-boundary:1282:23:<><=","relational-boundary:2028:46:>>>=","relational-boundary:1448:16:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3005:46:>>>=","relational-boundary:3172:88:<=><","relational-boundary:1003:12:>=>>","relational-boundary:1857:22:>>>=","relational-boundary:1298:21:<><=","relational-boundary:1902:38:<><="],"position":25,"parentPid":56560,"childPid":56560,"nonce":"7f832f7f-0fb8-4097-8834-dc88f7300730","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787369579536,"exitedAt":1787369983466},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14674}]}
{"arm":"B","seed":20260821,"index":5,"prefix":["relational-boundary:676:21:<><=","relational-boundary:694:47:>>>=","relational-boundary:752:35:<><=","relational-boundary:752:50:<><=","relational-boundary:753:17:<><=","relational-boundary:801:23:<><=","relational-boundary:861:69:>=>>","relational-boundary:861:83:<><=","relational-boundary:871:23:>>>=","relational-boundary:949:25:<><=","relational-boundary:1003:12:>=>>","relational-boundary:1003:27:<=><","regex-quantifier-bound:1004:26:{1,3}>{1,4}","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:1021:37:<=><","relational-boundary:1142:26:<><=","relational-boundary:1142:53:>>>=","relational-boundary:1145:50:>>>=","relational-boundary:1186:64:>=>>","relational-boundary:1186:85:<=><","relational-boundary:1282:23:<><=","relational-boundary:1291:23:<><=","relational-boundary:1298:21:<><=","relational-boundary:1400:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:1448:16:<><=","relational-boundary:1709:32:<><=","relational-boundary:1848:26:>>>=","relational-boundary:1857:22:>>>=","relational-boundary:1902:38:<><=","relational-boundary:1926:38:<><=","relational-boundary:1938:30:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1976:36:<><=","relational-boundary:2028:46:>>>=","relational-boundary:2202:22:>>>=","relational-boundary:2203:26:>>>=","relational-boundary:2206:23:<><=","relational-boundary:2208:12:<><=","relational-boundary:2251:33:>>>=","relational-boundary:2394:12:>>>=","relational-boundary:2395:12:>>>=","relational-boundary:2411:16:>>>=","relational-boundary:2412:16:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:2467:49:<=><","relational-boundary:2514:21:<><=","relational-boundary:2765:29:<><=","relational-boundary:2802:24:<><=","relational-boundary:2812:24:<><=","relational-boundary:2819:22:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2866:72:>>>=","relational-boundary:2868:20:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","regex-quantifier-bound:2915:21:{1,2}>{1,3}","relational-boundary:2936:52:<><=","relational-boundary:2981:29:<><=","relational-boundary:3005:23:<><=","relational-boundary:3005:46:>>>=","relational-boundary:3128:50:>>>=","relational-boundary:3144:54:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3172:88:<=><","relational-boundary:3246:59:>>>=","relational-boundary:3446:31:<><="],"position":70,"parentPid":74616,"childPid":74616,"nonce":"0b5bc8d9-8ec3-415a-8cdb-aaf57d3496be","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787369983895,"exitedAt":1787371069413},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13715}]}
{"arm":"C","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":20399,"childPid":20399,"nonce":"d36f84ab-7cbc-408c-bfc5-0d7336631345","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787371069878,"exitedAt":1787371098340},"half":"quiet","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13712}]}
{"arm":"C","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":21269,"childPid":21269,"nonce":"94270f22-0f6b-4cbf-ba57-1f25b461d4db","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787371099022,"exitedAt":1787371150305},"half":"loaded","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":25864}]}
```

Record isolation: the default `.mutation-records` listing is BYTE-IDENTICAL before and after the campaign (61 entries), so the campaign wrote nothing into the record space the gate itself reads.


## The driver's own report, verbatim

```
ANCHOR STAMP: 46fd37cf0f07
ARM A: 12 eligible of 12 planned (12 of 12 produced, 12 completed)
  BOUND: p > 0.2209 one-sided at alpha 0.05, over 12 eligible trials, CONDITIONAL on cross-process independence
ARM B: 6 eligible of 6 planned (6 of 6 produced, 6 completed)
ARM C: 2 eligible of 2 planned (2 of 2 produced, 2 completed)
TRIAL A#0: seed 20260821, prefix 0, position 1, pid 186/186, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368239690, 1787368268525], half n/a, load samples 0, verdict SURVIVED
TRIAL A#1: seed 20260821, prefix 0, position 1, pid 2262/2262, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368268910, 1787368297738], half n/a, load samples 0, verdict SURVIVED
TRIAL A#2: seed 20260821, prefix 0, position 1, pid 5483/5483, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368298111, 1787368327439], half n/a, load samples 0, verdict SURVIVED
TRIAL A#3: seed 20260821, prefix 0, position 1, pid 6813/6813, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368327828, 1787368356142], half n/a, load samples 0, verdict SURVIVED
TRIAL A#4: seed 20260821, prefix 0, position 1, pid 7908/7908, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368356519, 1787368385335], half n/a, load samples 0, verdict SURVIVED
TRIAL A#5: seed 20260821, prefix 0, position 1, pid 11027/11027, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368385716, 1787368414054], half n/a, load samples 0, verdict SURVIVED
TRIAL A#6: seed 20260821, prefix 0, position 1, pid 13122/13122, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368414427, 1787368447800], half n/a, load samples 0, verdict SURVIVED
TRIAL A#7: seed 20260821, prefix 0, position 1, pid 13941/13941, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368448420, 1787368484250], half n/a, load samples 0, verdict SURVIVED
TRIAL A#8: seed 20260821, prefix 0, position 1, pid 14730/14730, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368484713, 1787368515572], half n/a, load samples 0, verdict SURVIVED
TRIAL A#9: seed 20260821, prefix 0, position 1, pid 15238/15238, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368516001, 1787368552386], half n/a, load samples 0, verdict SURVIVED
TRIAL A#10: seed 20260821, prefix 0, position 1, pid 16083/16083, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368552958, 1787368597406], half n/a, load samples 0, verdict SURVIVED
TRIAL A#11: seed 20260821, prefix 0, position 1, pid 17438/17438, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368597916, 1787368637289], half n/a, load samples 0, verdict SURVIVED
TRIAL B#0: seed 20260821, prefix 8, position 9, pid 19214/19214, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368637902, 1787368827270], half n/a, load samples 0, verdict SURVIVED
TRIAL B#1: seed 20260821, prefix 8, position 9, pid 27686/27686, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368827687, 1787368987440], half n/a, load samples 0, verdict SURVIVED
TRIAL B#2: seed 20260821, prefix 8, position 9, pid 34081/34081, stamps 46fd37cf0f07/46fd37cf0f07, window [1787368987894, 1787369200189], half n/a, load samples 0, verdict SURVIVED
TRIAL B#3: seed 20260821, prefix 24, position 25, pid 38675/38675, stamps 46fd37cf0f07/46fd37cf0f07, window [1787369200735, 1787369579090], half n/a, load samples 0, verdict SURVIVED
TRIAL B#4: seed 20260821, prefix 24, position 25, pid 56560/56560, stamps 46fd37cf0f07/46fd37cf0f07, window [1787369579536, 1787369983466], half n/a, load samples 0, verdict SURVIVED
TRIAL B#5: seed 20260821, prefix 69, position 70, pid 74616/74616, stamps 46fd37cf0f07/46fd37cf0f07, window [1787369983895, 1787371069413], half n/a, load samples 0, verdict SURVIVED
TRIAL C#0: seed 20260821, prefix 0, position 1, pid 20399/20399, stamps 46fd37cf0f07/46fd37cf0f07, window [1787371069878, 1787371098340], half quiet, load samples 1, verdict SURVIVED
TRIAL C#1: seed 20260821, prefix 0, position 1, pid 21269/21269, stamps 46fd37cf0f07/46fd37cf0f07, window [1787371099022, 1787371150305], half loaded, load samples 1, verdict SURVIVED
LOAD: load column unchanged at one, pair refused — in-window samples: quiet 0, loaded 0; each half needs at least 2
BRANCH NULL: no eligible trial flipped. The local reproduction is bounded at the figure each arm's own eligible count supports above.
```

## Four campaigns, and the sequencing rule that would have bought one

Each of the first three was voided by the diff-review repairs that followed it.
The rule is cheap to state and I did not follow it until it had cost three runs:
land every fix from every open round FIRST, then run the campaign once, on the
committed post-formatter tree. Running earlier feels like progress and buys an
artifact the next repair discards.

**Why the merge between runs three and four did not void run three** — recorded
because the reasoning is reusable, not because run three's numbers survive (they
do not; round 4's repairs replaced them). Two checks, each with its command:

```
$ git diff --name-only HEAD^1..HEAD -- \
    tests/cross-cutting/psqlStartupFiles/scan.ts \
    tests/cross-cutting/psqlStartupFileSuppression.test.ts \
    tests/mutation/source/registry.ts
(no output)

$ pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts
 Test Files  1 passed (1)
      Tests  976 passed (976)
```

The first shows the stamped inputs did not move. The second re-runs the deciding
suite, which walks the whole repository and therefore CAN be moved by files the
stamp never sees. That second command is the UNMUTATED baseline — the same green
check every trial runs before its mutants — not a re-derivation of the verdict.
Round 4 caught an earlier version of this paragraph quoting the count with no
command, which left the two indistinguishable.

## The load column REFUSED in all four, for one structural reason

`setInterval` schedules on the event loop; the child runs under `spawnSync`,
which blocks that loop for the whole window. No in-window sample is reachable at
any cadence, so the load arm cannot advance as built. Repairing it needs a
sampler off the blocked thread. Documented limit of the arm; the refusal itself
is correct and has now behaved identically across four independent runs.
