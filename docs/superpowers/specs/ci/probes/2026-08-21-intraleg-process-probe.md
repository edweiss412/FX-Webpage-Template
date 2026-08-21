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
| B | 6 | the ORDERING — the target runs after a prefix of its generation-order predecessors, at the pre-registered lengths 8, 8, 8, 24, 24 and 69. Only the last is the full gate-order prefix; describing all six that way (as an earlier draft did) misstates five of them. |
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
  .mutation-records/campaign-2026-08-21/campaign.json
```

Campaign anchor stamp: `46fd37cf0f07`

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
{"arm":"A","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":38507,"childPid":38507,"nonce":"8f59f7fd-6e58-45ef-accf-a620506ead57","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346227494,"exitedAt":1787346255992},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14235}]}
{"arm":"A","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":39465,"childPid":39465,"nonce":"01256a12-cf0d-40fb-bd57-50a517c2cf0f","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346256391,"exitedAt":1787346284878},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14232}]}
{"arm":"A","seed":20260821,"index":2,"prefix":[],"position":1,"parentPid":40681,"childPid":40681,"nonce":"a04756c2-fc6b-42f6-92ed-002c58e0dbd0","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346285257,"exitedAt":1787346313772},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14266}]}
{"arm":"A","seed":20260821,"index":3,"prefix":[],"position":1,"parentPid":41519,"childPid":41519,"nonce":"85cb8851-c14f-41da-ba1f-d2baddf67dc9","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346314136,"exitedAt":1787346343136},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14251}]}
{"arm":"A","seed":20260821,"index":4,"prefix":[],"position":1,"parentPid":42247,"childPid":42247,"nonce":"dabb2ae0-3d8c-4a8d-8c9a-0e2e87f7ca86","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346343508,"exitedAt":1787346371470},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14243}]}
{"arm":"A","seed":20260821,"index":5,"prefix":[],"position":1,"parentPid":43102,"childPid":43102,"nonce":"4538186c-a529-412e-bcd1-3607cf23b952","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346371839,"exitedAt":1787346400296},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14214}]}
{"arm":"A","seed":20260821,"index":6,"prefix":[],"position":1,"parentPid":44156,"childPid":44156,"nonce":"c554164d-dff1-4ce5-a6c2-1620d8fb004e","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346400663,"exitedAt":1787346429141},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14237}]}
{"arm":"A","seed":20260821,"index":7,"prefix":[],"position":1,"parentPid":45137,"childPid":45137,"nonce":"2818456b-7570-48c6-860d-7886b3ea93b1","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346429512,"exitedAt":1787346459013},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":15253}]}
{"arm":"A","seed":20260821,"index":8,"prefix":[],"position":1,"parentPid":45997,"childPid":45997,"nonce":"fa5a9c05-da13-4735-97ae-de23b56c7046","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346459454,"exitedAt":1787346488944},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14746}]}
{"arm":"A","seed":20260821,"index":9,"prefix":[],"position":1,"parentPid":47026,"childPid":47026,"nonce":"3cc239e8-05e4-4491-b4b5-e0adaaace195","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346489313,"exitedAt":1787346517844},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14293}]}
{"arm":"A","seed":20260821,"index":10,"prefix":[],"position":1,"parentPid":48429,"childPid":48429,"nonce":"8f6aba18-a19f-4c0c-aedb-6f7b2d80c500","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346518214,"exitedAt":1787346547199},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14238}]}
{"arm":"A","seed":20260821,"index":11,"prefix":[],"position":1,"parentPid":49685,"childPid":49685,"nonce":"90486c00-6578-4faf-aa83-05b3efd2df6b","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346547586,"exitedAt":1787346577119},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14767}]}
{"arm":"B","seed":20260821,"index":0,"prefix":["relational-boundary:3246:59:>>>=","relational-boundary:1003:12:>=>>","relational-boundary:1142:53:>>>=","relational-boundary:2206:23:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>"],"position":9,"parentPid":51597,"childPid":51597,"nonce":"9c7bf96c-a3d8-4e33-81b9-840674c3a50d","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346577494,"exitedAt":1787346733607},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14764}]}
{"arm":"B","seed":20260821,"index":1,"prefix":["relational-boundary:1291:23:<><=","relational-boundary:2467:49:<=><","relational-boundary:1400:29:<><=","relational-boundary:1948:19:>>>=","relational-boundary:2812:24:<><=","relational-boundary:1003:27:<=><","relational-boundary:694:47:>>>=","relational-boundary:2412:16:>>>="],"position":9,"parentPid":58934,"childPid":58934,"nonce":"15c1de07-9898-44fa-9ea3-988c34b12e7c","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346734036,"exitedAt":1787346882430},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14714}]}
{"arm":"B","seed":20260821,"index":2,"prefix":["relational-boundary:3933:74:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2812:24:<><=","relational-boundary:1142:26:<><=","relational-boundary:2514:21:<><=","relational-boundary:861:69:>=>>","relational-boundary:3005:23:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}"],"position":9,"parentPid":66167,"childPid":66167,"nonce":"abb078b7-c158-4e75-853f-ca86a81df4e5","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787346882818,"exitedAt":1787347028794},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14737}]}
{"arm":"B","seed":20260821,"index":3,"prefix":["regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:1417:16:<><=","relational-boundary:1926:38:<><=","relational-boundary:1186:64:>=>>","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:2765:29:<><=","relational-boundary:694:47:>>>=","regex-quantifier-bound:1004:26:{1,3}>{1,4}","relational-boundary:2394:12:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:3675:32:{0,2}>{0,3}","relational-boundary:871:23:>>>=","relational-boundary:2251:33:>>>=","relational-boundary:949:25:<><=","relational-boundary:3933:74:>>>=","relational-boundary:1953:31:<><=","relational-boundary:3246:59:>>>=","relational-boundary:861:69:>=>>","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:1976:36:<><=","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:3446:31:<><="],"position":25,"parentPid":73470,"childPid":73470,"nonce":"e3b99fc9-762c-4579-8c78-4b67bd2a3a79","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787347029201,"exitedAt":1787347398934},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14229}]}
{"arm":"B","seed":20260821,"index":4,"prefix":["relational-boundary:2802:24:<><=","relational-boundary:2202:22:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1186:64:>=>>","relational-boundary:2812:24:<><=","relational-boundary:2765:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:694:47:>>>=","relational-boundary:861:83:<><=","relational-boundary:2203:26:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2870:41:{1,2}>{1,3}","relational-boundary:676:21:<><=","relational-boundary:1976:36:<><=","relational-boundary:1282:23:<><=","relational-boundary:2028:46:>>>=","relational-boundary:1448:16:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3005:46:>>>=","relational-boundary:3172:88:<=><","relational-boundary:1003:12:>=>>","relational-boundary:1857:22:>>>=","relational-boundary:1298:21:<><=","relational-boundary:1902:38:<><="],"position":25,"parentPid":89249,"childPid":89249,"nonce":"c5d2015d-c430-4ddb-89f2-b062f3b0bfe0","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787347399356,"exitedAt":1787347795019},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":13751}]}
{"arm":"B","seed":20260821,"index":5,"prefix":["relational-boundary:676:21:<><=","relational-boundary:694:47:>>>=","relational-boundary:752:35:<><=","relational-boundary:752:50:<><=","relational-boundary:753:17:<><=","relational-boundary:801:23:<><=","relational-boundary:861:69:>=>>","relational-boundary:861:83:<><=","relational-boundary:871:23:>>>=","relational-boundary:949:25:<><=","relational-boundary:1003:12:>=>>","relational-boundary:1003:27:<=><","regex-quantifier-bound:1004:26:{1,3}>{1,4}","regex-quantifier-bound:1008:30:{1,2}>{1,3}","relational-boundary:1021:37:<=><","relational-boundary:1142:26:<><=","relational-boundary:1142:53:>>>=","relational-boundary:1145:50:>>>=","relational-boundary:1186:64:>=>>","relational-boundary:1186:85:<=><","relational-boundary:1282:23:<><=","relational-boundary:1291:23:<><=","relational-boundary:1298:21:<><=","relational-boundary:1400:29:<><=","relational-boundary:1417:16:<><=","relational-boundary:1448:16:<><=","relational-boundary:1709:32:<><=","relational-boundary:1848:26:>>>=","relational-boundary:1857:22:>>>=","relational-boundary:1902:38:<><=","relational-boundary:1926:38:<><=","relational-boundary:1938:30:>>>=","relational-boundary:1948:19:>>>=","relational-boundary:1953:31:<><=","relational-boundary:1976:36:<><=","relational-boundary:2028:46:>>>=","relational-boundary:2202:22:>>>=","relational-boundary:2203:26:>>>=","relational-boundary:2206:23:<><=","relational-boundary:2208:12:<><=","relational-boundary:2251:33:>>>=","relational-boundary:2394:12:>>>=","relational-boundary:2395:12:>>>=","relational-boundary:2411:16:>>>=","relational-boundary:2412:16:>>>=","regex-quantifier-bound:2437:45:{1,2}>{1,3}","regex-quantifier-bound:2441:17:{1,2}>{1,3}","relational-boundary:2465:26:<=><","relational-boundary:2467:49:<=><","relational-boundary:2514:21:<><=","relational-boundary:2765:29:<><=","relational-boundary:2802:24:<><=","relational-boundary:2812:24:<><=","relational-boundary:2819:22:>>>=","regex-quantifier-bound:2864:38:{1,2}>{1,3}","relational-boundary:2866:72:>>>=","relational-boundary:2868:20:>>>=","regex-quantifier-bound:2870:41:{1,2}>{1,3}","regex-quantifier-bound:2915:21:{1,2}>{1,3}","relational-boundary:2936:52:<><=","relational-boundary:2981:29:<><=","relational-boundary:3005:23:<><=","relational-boundary:3005:46:>>>=","relational-boundary:3128:50:>>>=","relational-boundary:3144:54:<><=","relational-boundary:3172:66:>=>>","relational-boundary:3172:88:<=><","relational-boundary:3246:59:>>>=","relational-boundary:3446:31:<><="],"position":70,"parentPid":5317,"childPid":5317,"nonce":"a745a88e-eafb-4e55-9b1c-94a394debe0b","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787347795415,"exitedAt":1787348832787},"half":null,"loadSampleCount":0,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14248}]}
{"arm":"C","seed":20260821,"index":0,"prefix":[],"position":1,"parentPid":32116,"childPid":32116,"nonce":"4dad9cd3-46b3-4531-a8f9-529f2b2da234","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787348833249,"exitedAt":1787348861774},"half":"quiet","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":14260}]}
{"arm":"C","seed":20260821,"index":1,"prefix":[],"position":1,"parentPid":33211,"childPid":33211,"nonce":"9c550876-4b02-457d-9234-a2a009fc4eca","stampBefore":"46fd37cf0f07","stampAfter":"46fd37cf0f07","window":{"spawnedAt":1787348862481,"exitedAt":1787348909651},"half":"loaded","loadSampleCount":1,"verdict":"SURVIVED","children":[{"suite":"tests/cross-cutting/psqlStartupFileSuppression.test.ts","kind":"exit","exitCode":0,"durationMs":23818}]}
```

Record isolation: the default `.mutation-records` listing is BYTE-IDENTICAL before and after the campaign (34 entries), so the campaign wrote nothing into the record space the gate itself reads.


## The driver's own report, verbatim

Written by the campaign to `.mutation-records/campaign-2026-08-21/report.txt`,
which is gitignored, so it is carried here rather than referenced into a path
nobody else can read.

```
ANCHOR STAMP: 46fd37cf0f07
ARM A: 12 eligible of 12 planned (12 of 12 produced, 12 completed)
  BOUND: p > 0.2209 one-sided at alpha 0.05, over 12 eligible trials, CONDITIONAL on cross-process independence
ARM B: 6 eligible of 6 planned (6 of 6 produced, 6 completed)
ARM C: 2 eligible of 2 planned (2 of 2 produced, 2 completed)
TRIAL A#0: seed 20260821, prefix 0, position 1, pid 38507/38507, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346227494, 1787346255992], half n/a, load samples 0, verdict SURVIVED
TRIAL A#1: seed 20260821, prefix 0, position 1, pid 39465/39465, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346256391, 1787346284878], half n/a, load samples 0, verdict SURVIVED
TRIAL A#2: seed 20260821, prefix 0, position 1, pid 40681/40681, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346285257, 1787346313772], half n/a, load samples 0, verdict SURVIVED
TRIAL A#3: seed 20260821, prefix 0, position 1, pid 41519/41519, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346314136, 1787346343136], half n/a, load samples 0, verdict SURVIVED
TRIAL A#4: seed 20260821, prefix 0, position 1, pid 42247/42247, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346343508, 1787346371470], half n/a, load samples 0, verdict SURVIVED
TRIAL A#5: seed 20260821, prefix 0, position 1, pid 43102/43102, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346371839, 1787346400296], half n/a, load samples 0, verdict SURVIVED
TRIAL A#6: seed 20260821, prefix 0, position 1, pid 44156/44156, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346400663, 1787346429141], half n/a, load samples 0, verdict SURVIVED
TRIAL A#7: seed 20260821, prefix 0, position 1, pid 45137/45137, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346429512, 1787346459013], half n/a, load samples 0, verdict SURVIVED
TRIAL A#8: seed 20260821, prefix 0, position 1, pid 45997/45997, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346459454, 1787346488944], half n/a, load samples 0, verdict SURVIVED
TRIAL A#9: seed 20260821, prefix 0, position 1, pid 47026/47026, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346489313, 1787346517844], half n/a, load samples 0, verdict SURVIVED
TRIAL A#10: seed 20260821, prefix 0, position 1, pid 48429/48429, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346518214, 1787346547199], half n/a, load samples 0, verdict SURVIVED
TRIAL A#11: seed 20260821, prefix 0, position 1, pid 49685/49685, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346547586, 1787346577119], half n/a, load samples 0, verdict SURVIVED
TRIAL B#0: seed 20260821, prefix 8, position 9, pid 51597/51597, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346577494, 1787346733607], half n/a, load samples 0, verdict SURVIVED
TRIAL B#1: seed 20260821, prefix 8, position 9, pid 58934/58934, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346734036, 1787346882430], half n/a, load samples 0, verdict SURVIVED
TRIAL B#2: seed 20260821, prefix 8, position 9, pid 66167/66167, stamps 46fd37cf0f07/46fd37cf0f07, window [1787346882818, 1787347028794], half n/a, load samples 0, verdict SURVIVED
TRIAL B#3: seed 20260821, prefix 24, position 25, pid 73470/73470, stamps 46fd37cf0f07/46fd37cf0f07, window [1787347029201, 1787347398934], half n/a, load samples 0, verdict SURVIVED
TRIAL B#4: seed 20260821, prefix 24, position 25, pid 89249/89249, stamps 46fd37cf0f07/46fd37cf0f07, window [1787347399356, 1787347795019], half n/a, load samples 0, verdict SURVIVED
TRIAL B#5: seed 20260821, prefix 69, position 70, pid 5317/5317, stamps 46fd37cf0f07/46fd37cf0f07, window [1787347795415, 1787348832787], half n/a, load samples 0, verdict SURVIVED
TRIAL C#0: seed 20260821, prefix 0, position 1, pid 32116/32116, stamps 46fd37cf0f07/46fd37cf0f07, window [1787348833249, 1787348861774], half quiet, load samples 1, verdict SURVIVED
TRIAL C#1: seed 20260821, prefix 0, position 1, pid 33211/33211, stamps 46fd37cf0f07/46fd37cf0f07, window [1787348862481, 1787348909651], half loaded, load samples 1, verdict SURVIVED
LOAD: load column unchanged at one, pair refused — in-window samples: quiet 0, loaded 0; each half needs at least 2
BRANCH NULL: no eligible trial flipped. The local reproduction is bounded at the figure each arm's own eligible count supports above.
```

## The load column REFUSED, and that is the pre-registration working

Both arm-C halves completed and both are same-stamp eligible, so the pair was
ADJUDICABLE — and it still claims nothing, because the adjudicator wants at
least two IN-WINDOW load samples per half and got one apiece. Section 3 says the
column advances "ONLY if the pair was ADJUDICATED", and this pair was not. The
column stays at one.

**Precisely zero in-window samples, not one per half.** Each half took exactly
one sample and BOTH landed before their child's window opened — the quiet half's
at 1787348832832 against a window opening at 1787348833249 (417 ms early), the
loaded half's at 1787348861870 against 1787348862481 (611 ms). An earlier draft
of this section said the halves "got one apiece", which counts samples taken
rather than samples that counted.

The loaded half's deciding child took 23 818 ms against the quiet half's
14 260 ms, so the load was real. That is a DURATION difference, and duration is
the axis the predecessor arc already eliminated — it is not evidence about
verdicts, and the refusal is what stops it from being written up as if it were.
The burner count the driver requests is one per reported core; the artifacts
record the request, not a liveness check, so this record does not assert how many
were actually burning.

**And the cadence diagnosis in the earlier draft was wrong in a way worth
keeping.** It said a faster sampler would fix the shortfall. It cannot:
`setInterval` schedules a callback on the event loop, and the child runs under
`spawnSync`, which BLOCKS that loop for the whole window. No interval callback
can fire between `spawnedAt` and `exitedAt` by construction, at any cadence. The
only in-window sample this design can ever take is one that happens to fall
inside another trial's window. So the load column cannot advance as built, and
the repair is a sampler that does not share the blocked thread — a child
process, or a synchronous sample taken by the trial runner itself. Recorded as a
DOCUMENTED LIMIT of the arm, not as a finding against the refusal, which was
correct.
