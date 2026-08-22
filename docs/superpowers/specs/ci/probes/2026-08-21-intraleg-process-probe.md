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

The campaign ran THREE times. Each of the first two was voided by the diff-review
repairs that followed it — the plan says a production edit after a campaign
invalidates it — so only the third describes the code under review. All three
commands are recorded, because a record that shows only the surviving run hides
what the arc actually cost:

```
# 1 — voided by the round-1 repairs
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21 --seed 20260821 --trials 12

# 2 — voided by the round-3 repairs
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21-r2 --seed 20260821 --trials 12

# 3 — THE ONE EVERY NUMBER BELOW COMES FROM
pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts \
  --out .mutation-records/campaign-2026-08-21-r3 --seed 20260821 --trials 12
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
  .mutation-records/campaign-2026-08-21-r3/campaign.json
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
{"arm":"A","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":70378,"childPid":70378,"nonce":"52d944c2-3533-4ebe-9828-1a38addf3d36","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362062434,"exitedAt":1787362091269},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14167}]}
{"arm":"A","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":71786,"childPid":71786,"nonce":"0fdd5e73-907a-4144-b1d6-083bf9ffaed4","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362091648,"exitedAt":1787362119945},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14148}]}
{"arm":"A","seed":20260821,"index":2,"prefix":[],"position":1,"parentPid":73142,"childPid":73142,"nonce":"79546951-6194-4035-9ea0-9ee5a110622c","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362120309,"exitedAt":1787362148140},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13666}]}
{"arm":"A","seed":20260821,"index":3,"prefix":[],"position":1,"parentPid":74319,"childPid":74319,"nonce":"949478ad-969d-49f4-b128-8156319f8bd3","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362148510,"exitedAt":1787362176842},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14677}]}
{"arm":"A","seed":20260821,"index":4,"prefix":[],"position":1,"parentPid":76710,"childPid":76710,"nonce":"ff464cc4-1e9f-47e1-a218-cf59c4008c4f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362177216,"exitedAt":1787362204553},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13666}]}
{"arm":"A","seed":20260821,"index":5,"prefix":[],"position":1,"parentPid":77990,"childPid":77990,"nonce":"af55da61-de16-4201-a015-25405a86a6ad","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362204932,"exitedAt":1787362232756},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14186}]}
{"arm":"A","seed":20260821,"index":6,"prefix":[],"position":1,"parentPid":80665,"childPid":80665,"nonce":"a1802792-5ed4-4ab5-b43e-351527a54541","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362233123,"exitedAt":1787362265492},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":18688}]}
{"arm":"A","seed":20260821,"index":7,"prefix":[],"position":1,"parentPid":81790,"childPid":81790,"nonce":"e79380df-1456-445d-bde1-7c2e2a3820db","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362265877,"exitedAt":1787362294728},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14691}]}
{"arm":"A","seed":20260821,"index":8,"prefix":[],"position":1,"parentPid":83031,"childPid":83031,"nonce":"79ca9193-ead1-4ac0-9161-068df8cd7ba7","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362295128,"exitedAt":1787362322952},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13661}]}
{"arm":"A","seed":20260821,"index":9,"prefix":[],"position":1,"parentPid":83969,"childPid":83969,"nonce":"141424f3-7b43-4e17-80d7-3e41e5d611c1","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362323323,"exitedAt":1787362351673},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13677}]}
{"arm":"A","seed":20260821,"index":10,"prefix":[],"position":1,"parentPid":85250,"childPid":85250,"nonce":"018accbc-d3ff-4e57-9065-f78a57ca3cfd","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362352059,"exitedAt":1787362383540},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":17777}]}
{"arm":"A","seed":20260821,"index":11,"prefix":[],"position":1,"parentPid":86138,"childPid":86138,"nonce":"82c17912-101a-4a4f-a812-80a585782f05","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362383916,"exitedAt":1787362411394},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13720}]}
{"arm":"B","seed":20260821,"index":0,"prefix":["relational-boundary:3246:59:>>>=","relational-boundary:1003:12:>=>>","relational-boundary:1142:53:>>>=","relational-boundary:2206:23:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>"],"position":9,"parentPid":86610,"childPid":86610,"nonce":"4d566e32-d2fa-4cf0-a7fc-d869bfed90ed","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362411753,"exitedAt":1787362568301},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14223}]}
{"arm":"B","seed":20260821,"index":1,"prefix":["relational-boundary:1291:23:<><=","relational-boundary:2467:49:<=><","relational-boundary:1400:29:<><=","relational-boundary:1948:19:>>>=","relational-boundary:2812:24:<><=","relational-boundary:1003:27:<=><","relational-boundary:694:47:>>>=","relational-boundary:2412:16:>>>="],"position":9,"parentPid":89350,"childPid":89350,"nonce":"e49429fc-742c-4594-9b26-994341337c58","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362568673,"exitedAt":1787362708397},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13664}]}
{"arm":"B","seed":20260821,"index":2,"prefix":["relational-boundary:3933:74:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2812:24:<><=","relational-boundary:1142:26:<><=","relational-boundary:2514:21:<><=","relational-boundary:861:69:>=>>","relational-boundary:3005:23:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}"],"position":9,"parentPid":94734,"childPid":94734,"nonce":"8188a7c5-0df0-455b-95b8-f0997e5cec23","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362708778,"exitedAt":1787362846389},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13642}]}
{"arm":"B","seed":20260821,"index":3,"prefix":["regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:1417:16:<><=","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:2765:29:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:1004:26:{1,3}>{1,4}","relational-boundary:2394:12:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:3675:32:{0,2}>{0,3}","relational-boundary:871:23:>>>=","relational-boundary:2251:33:>>>=","relational-boundary:949:25:<><=","relational-boundary:3933:74:>>>=","relational-boundary:1953:31:<><=","relational-boundary:3246:59:>>>=","relational-boundary:861:69:>=>>","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:1976:36:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:3446:31:<><="],"position":25,"parentPid":98954,"childPid":98954,"nonce":"872fc8c1-154e-4aa1-809e-cdaf8059eedb","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787362846776,"exitedAt":1787363204262},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14240}]}
{"arm":"B","seed":20260821,"index":4,"prefix":["relational-boundary:2802:24:<><=","relational-boundary:2202:22:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1186:64:>=>>","relational-boundary:2812:24:<><=","relational-boundary:2765:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:694:47:>>>=","relational-boundary:861:83:<><=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:676:21:<><=","relational-boundary:1976:36:<><=","relational-boundary:1282:23:<><=","relational-boundary:2028:46:>>>=","relational-boundary:1448:16:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3005:46:>>>=","relational-boundary:3172:88:<=><","relational-boundary:1003:12:>=>>","relational-boundary:1857:22:>>>=","relational-boundary:1298:21:<><=","relational-boundary:1902:38:<><="],"position":25,"parentPid":12194,"childPid":12194,"nonce":"bd709bdf-9a52-497f-9f2f-324f2034075d","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787363204667,"exitedAt":1787363596105},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13751}]}
{"arm":"B","seed":20260821,"index":5,"prefix":["relational-boundary:676:21:<><=","relational-boundary:694:47:>>>=","relational-boundary:752:35:<><=","relational-boundary:752:50:<><=","relational-boundary:753:17:<><=","relational-boundary:801:23:<><=","relational-boundary:861:69:>=>>","relational-boundary:861:83:<><=","relational-boundary:871:23:>>>=","relational-boundary:949:25:<><=","relational-boundary:1003:12:>=>>","relational-boundary:1003:27:<=><","regex-quantifier-bound:1004:26:{1,3}>{1,4}","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:1021:37:<=><","relational-boundary:1142:26:<><=","relational-boundary:1142:53:>>>=","relational-boundary:1145:50:>>>=","relational-boundary:1186:64:>=>>","relational-boundary:1186:85:<=><","relational-boundary:1282:23:<><=","relational-boundary:1291:23:<><=","relational-boundary:1298:21:<><=","relational-boundary:1400:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:1448:16:<><=","relational-boundary:1709:32:<><=","relational-boundary:1848:26:>>>=","relational-boundary:1857:22:>>>=","relational-boundary:1902:38:<><=","relational-boundary:1926:38:<><=","relational-boundary:1938:30:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1976:36:<><=","relational-boundary:2028:46:>>>=","relational-boundary:2202:22:>>>=","relational-boundary:2203:26:>>>=","relational-boundary:2206:23:<><=","relational-boundary:2208:12:<><=","relational-boundary:2251:33:>>>=","relational-boundary:2394:12:>>>=","relational-boundary:2395:12:>>>=","relational-boundary:2411:16:>>>=","relational-boundary:2412:16:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:2467:49:<=><","relational-boundary:2514:21:<><=","relational-boundary:2765:29:<><=","relational-boundary:2802:24:<><=","relational-boundary:2812:24:<><=","relational-boundary:2819:22:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2866:72:>>>=","relational-boundary:2868:20:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","regex-quantifier-bound:2915:21:{1,2}>{1,3}","relational-boundary:2936:52:<><=","relational-boundary:2981:29:<><=","relational-boundary:3005:23:<><=","relational-boundary:3005:46:>>>=","relational-boundary:3128:50:>>>=","relational-boundary:3144:54:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3172:88:<=><","relational-boundary:3246:59:>>>=","relational-boundary:3446:31:<><="],"position":70,"parentPid":25939,"childPid":25939,"nonce":"acd9aad1-27f4-4b6e-b86b-2322eac9a24c","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787363596482,"exitedAt":1787364651622},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13658}]}
{"arm":"C","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":64080,"childPid":64080,"nonce":"251fb19a-7f6b-465c-91b5-2b4aada1027f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787364652068,"exitedAt":1787364680913},"half":"quiet","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14160}]}
{"arm":"C","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":65554,"childPid":65554,"nonce":"a2a9de60-2aa2-4151-bed5-82907009fe7a","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787364681665,"exitedAt":1787364738121},"half":"loaded","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":29214}]}
```

Record isolation: the default `.mutation-records` listing is BYTE-IDENTICAL before and after the campaign (52 entries), so the campaign wrote nothing into the record space the gate itself reads.


## The driver's own report, verbatim

```
ANCHOR STAMP: 46fd37cf0f07
ARM A: 12 eligible of 12 planned (12 of 12 produced, 12 completed)
  BOUND: p > 0.2209 one-sided at alpha 0.05, over 12 eligible trials, CONDITIONAL on cross-process independence
ARM B: 6 eligible of 6 planned (6 of 6 produced, 6 completed)
ARM C: 2 eligible of 2 planned (2 of 2 produced, 2 completed)
TRIAL A#0: seed 20260821, prefix 0, position 1, pid 70378/70378, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362062434, 1787362091269], half n/a, load samples 0, verdict SURVIVED
TRIAL A#1: seed 20260821, prefix 0, position 1, pid 71786/71786, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362091648, 1787362119945], half n/a, load samples 0, verdict SURVIVED
TRIAL A#2: seed 20260821, prefix 0, position 1, pid 73142/73142, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362120309, 1787362148140], half n/a, load samples 0, verdict SURVIVED
TRIAL A#3: seed 20260821, prefix 0, position 1, pid 74319/74319, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362148510, 1787362176842], half n/a, load samples 0, verdict SURVIVED
TRIAL A#4: seed 20260821, prefix 0, position 1, pid 76710/76710, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362177216, 1787362204553], half n/a, load samples 0, verdict SURVIVED
TRIAL A#5: seed 20260821, prefix 0, position 1, pid 77990/77990, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362204932, 1787362232756], half n/a, load samples 0, verdict SURVIVED
TRIAL A#6: seed 20260821, prefix 0, position 1, pid 80665/80665, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362233123, 1787362265492], half n/a, load samples 0, verdict SURVIVED
TRIAL A#7: seed 20260821, prefix 0, position 1, pid 81790/81790, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362265877, 1787362294728], half n/a, load samples 0, verdict SURVIVED
TRIAL A#8: seed 20260821, prefix 0, position 1, pid 83031/83031, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362295128, 1787362322952], half n/a, load samples 0, verdict SURVIVED
TRIAL A#9: seed 20260821, prefix 0, position 1, pid 83969/83969, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362323323, 1787362351673], half n/a, load samples 0, verdict SURVIVED
TRIAL A#10: seed 20260821, prefix 0, position 1, pid 85250/85250, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362352059, 1787362383540], half n/a, load samples 0, verdict SURVIVED
TRIAL A#11: seed 20260821, prefix 0, position 1, pid 86138/86138, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362383916, 1787362411394], half n/a, load samples 0, verdict SURVIVED
TRIAL B#0: seed 20260821, prefix 8, position 9, pid 86610/86610, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362411753, 1787362568301], half n/a, load samples 0, verdict SURVIVED
TRIAL B#1: seed 20260821, prefix 8, position 9, pid 89350/89350, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362568673, 1787362708397], half n/a, load samples 0, verdict SURVIVED
TRIAL B#2: seed 20260821, prefix 8, position 9, pid 94734/94734, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362708778, 1787362846389], half n/a, load samples 0, verdict SURVIVED
TRIAL B#3: seed 20260821, prefix 24, position 25, pid 98954/98954, stamps 46fd37cf0f07/46fd37cf0f07, window [1787362846776, 1787363204262], half n/a, load samples 0, verdict SURVIVED
TRIAL B#4: seed 20260821, prefix 24, position 25, pid 12194/12194, stamps 46fd37cf0f07/46fd37cf0f07, window [1787363204667, 1787363596105], half n/a, load samples 0, verdict SURVIVED
TRIAL B#5: seed 20260821, prefix 69, position 70, pid 25939/25939, stamps 46fd37cf0f07/46fd37cf0f07, window [1787363596482, 1787364651622], half n/a, load samples 0, verdict SURVIVED
TRIAL C#0: seed 20260821, prefix 0, position 1, pid 64080/64080, stamps 46fd37cf0f07/46fd37cf0f07, window [1787364652068, 1787364680913], half quiet, load samples 1, verdict SURVIVED
TRIAL C#1: seed 20260821, prefix 0, position 1, pid 65554/65554, stamps 46fd37cf0f07/46fd37cf0f07, window [1787364681665, 1787364738121], half loaded, load samples 1, verdict SURVIVED
LOAD: load column unchanged at one, pair refused — in-window samples: quiet 0, loaded 0; each half needs at least 2
BRANCH NULL: no eligible trial flipped. The local reproduction is bounded at the figure each arm's own eligible count supports above.
```

## Three campaigns, and what the first two cost

The first ran before diff review round 1; its repairs changed verdict
classification, eligibility and report binding, which voided it. The second ran
before round 3; its repairs changed the aggregate's enforcement, the load
adjudicator, the attestation ordering and the durable record's `passed`
semantics, which voided it too. Only the third describes the code under review.

The lesson is a sequencing one and it is cheap to state: land every fix from
every open round FIRST, then run the campaign once, on the committed
post-formatter tree. Running it earlier feels like progress and buys an artifact
the next repair throws away.

**Why a MERGE afterwards did not void this one.** `origin/main` advanced after
the third run and was merged in. The campaign's stamped inputs — the surface's
source, its deciding suite, and the operator set — are byte-identical across that
merge (`git diff --name-only HEAD^1..HEAD` over those three paths is empty), and
the deciding suite, which walks the whole repository and so CAN be moved by files
outside the stamp, was re-run on the merged tree and reports the same 976 passed.
Both halves are needed: the stamp covers the declared inputs, and the suite run
covers everything the stamp cannot see.

## The load column REFUSED again — the same structural reason, now three for three

Zero in-window samples in both halves, in all three campaigns. `setInterval`
schedules its callback on the event loop; the child runs under `spawnSync`, which
blocks that loop for the entire window. No in-window sample is reachable at any
cadence, so the load arm cannot advance as built. Repairing it needs a sampler
off the blocked thread — a child process, or a synchronous sample taken around
the spawn by the trial runner itself.

The loaded half's deciding child took 29 214 ms against the quiet half's
14 160 ms. That is a duration difference, duration is the axis the predecessor
arc already eliminated, and the refusal is what keeps it from being written up as
evidence about verdicts.
