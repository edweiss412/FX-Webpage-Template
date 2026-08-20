# Browser mutation gate - per-child wall clock, and the ceiling it supports

**Probe for:** `BL-MUTATION-BROWSER-CHILD-LIFETIME`. Run 2026-08-20 on the origin machine by
`arc-browser`, branch `fix/mutation-browser-child-lifetime`, base `039533373`.

**Question.** `runChild` (`tests/mutation/browser/runner.ts`) spawns Playwright children with no
`timeout` and no process group. The mechanism to bound them already exists - `spawnBounded` takes a
per-caller `timeoutMs` - but the source harness's `MUTANT_TIMEOUT_MS` (180 s) was derived against a
~2 s healthy suite and does not transfer. The ledger entry says so and makes the measurement the
entry's first scheduled step: *"without it any number chosen is arbitrary."* So: **what is the
per-child wall clock of a healthy browser-gate run, and what ceiling does it support?**

**Why raw and not a summary.** A mean would hide the only part of this distribution that matters.
The ceiling has to clear the slowest HEALTHY child, so the max and the shape of the tail are the
load-bearing figures; a mean would sit near 24 s and support a ceiling that converts healthy runs
into timeouts - the exact failure the ledger entry warns is worse than the one being fixed.

---

## 1. Method

Two full gate runs, each `pnpm heavy pnpm mutation:browser`, **foreground under the heavy-phase
semaphore** (AGENTS.md: the browser gate spawns a real Playwright child per mutant).
`FX_HEAVY_SLOT_DIR` was never set. Both runs acquired `slot-0` of 2.

Per-child timing came from temporary instrumentation in `runChild` - one JSONL row per child with
its suite label, kind, exit status and elapsed ms. It is **probe apparatus and was reverted**; the
repair is a call-site swap to `spawnBounded`, not this. The exact diff is in section 5 so the
numbers can be reproduced.

| run | wall clock | gate result | children |
| --- | --- | --- | --- |
| 1 | 616.67 s | 9 passed, exit 0 | 41 |
| 2 | 651.90 s | 9 passed, exit 0 | 41 |

Both runs were GREEN, so every figure below is a **healthy** child. Nothing here is a hang.

**Composition.** Each run produced 21 `vitest:Step3Review.test.tsx` children (all exit 0) and 20
`playwright:tap-target-floor` children (all exit 1). The surface is `tapTargetFloor`, the single
enrolled browser surface, with 19 mutants and 2 deciding suites. The instrumentation recorded suite
and kind but **not** whether a child belonged to the baseline, a mutant, or the control, so the
41-vs-40 residual is unattributed - a limit of this probe, not of the data. It does not affect the
derivation, which ranges over all healthy children regardless of role.

## 2. The distribution, raw

**`playwright:tap-target-floor`** - every observation, ms, sorted, both runs pooled (n=40):

```
[18833, 19876, 20451, 20489, 20677, 20874, 20915, 21192, 21217, 21245, 21480, 21720, 21843, 22326, 22408, 22627, 22871, 22981, 23003, 24451, 25601, 26069, 26917, 27106, 27137, 27461, 27977, 28062, 28217, 28390, 29562, 29825, 31071, 31200, 31912, 32149, 47211, 51108, 62723, 65111]
```

**`vitest:Step3Review.test.tsx`** - every observation, ms, sorted, both runs pooled (n=42):

```
[2864, 2870, 2898, 2946, 2961, 3015, 3077, 3157, 3218, 3239, 3332, 3344, 3359, 3386, 3391, 3393, 3396, 3422, 3445, 3465, 3494, 3549, 3638, 3644, 3647, 3669, 3696, 3840, 3874, 3889, 3903, 3916, 3945, 3946, 4009, 4022, 4064, 4196, 4264, 4290, 4544, 4898]
```

| series | n | min | p50 | p90 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| playwright, run 1 | 20 | 19876 | 22981 | 31071 | 47211 | 65111 |
| playwright, run 2 | 20 | 18833 | 24451 | 32149 | 51108 | 62723 |
| playwright, POOLED | 40 | 18833 | 24451 | 32149 | 51108 | 65111 |
| vitest, run 1 | 21 | 2864 | 3344 | 3946 | 4022 | 4290 |
| vitest, run 2 | 21 | 3077 | 3874 | 4264 | 4544 | 4898 |
| vitest, POOLED | 42 | 2864 | 3494 | 4196 | 4290 | 4898 |

## 3. What the shape says

**The tail is real, and it reproduces.** The slowest playwright child was 65111 ms in run 1 and
62723 ms in run 2 - two independent runs agreeing to within 4%. Pooled, the max is
**65111 ms = 65.1 s**, which is **2.66x the median** (24451 ms). Four of
40 playwright children exceeded 47 s. A single 65 s observation could be dismissed as noise;
the same tail in a second run cannot.

**The two child kinds differ by an order of magnitude** and one ceiling covers both: vitest children
are tightly clustered (max/median 1.40x, max 4898 ms) while playwright children
are long-tailed. A ceiling derived from the playwright max is far above every vitest child, so the
single per-caller `timeoutMs` the repair passes is bounded by the playwright series alone.

**The ledger's premise is confirmed, its magnitude corrected.** The entry says each browser child is
"a full Playwright run whose legitimate wall clock is minutes." Measured, the healthy playwright
child is **tens of seconds** - median 24.5 s, max 65.1 s - not minutes. The
conclusion the entry draws from that premise still holds and holds comfortably: 180 s is only
2.76x the measured max, so adopting `MUTANT_TIMEOUT_MS` unchanged would sit inside the
observed healthy range once contention widened the tail by a factor of three - which run-to-run
variance already shows is not far-fetched. **180 s is not a safe ceiling here**, so the entry's
conclusion is right for a reason slightly different from the one it states.

## 4. The ceiling this supports

Stated as a multiple of a measured quantity, per the entry's requirement that the margin carry the
same "a timeout means a hang, not a slow machine" meaning the source ceiling carries:

> **Ceiling = 10x the pooled measured healthy maximum = 10 x 65111 ms = 651110 ms, rounded to
> `660_000` ms (11 min).**

Why 10x rather than a tighter multiple:

- The measured maximum is **already** 2.66x the median, so the multiple must clear
  observed intra-run variance, not just the typical child. 10x the max is
  **26.6x the median**.
- **Contention on this machine is unmeasured and can only lengthen the tail.** Both runs took
  `slot-0` of 2 under modest load; AGENTS.md records roughly nine concurrent arcs as the normal
  state of this machine, and the semaphore bounds how many heavy phases START, not what else is
  running. A ceiling derived at low contention must carry margin for high contention.
- **The error costs are asymmetric.** An over-generous ceiling costs a hung child 11 min instead of
  the 1h48m-5h43m the sibling arc measured on unbounded children. A tight ceiling converts a healthy
  run into a `MutantRunInfraError`, which is the outcome the ledger entry calls worse than the bug.
- It remains unambiguous as a hang signal: a single child at 660 s exceeds the **entire** healthy
  gate run (617-652 s, section 1).

Both tighter candidates are recorded so the choice is auditable rather than asserted: 5x the max is
325.6 s and 3x is 195.3 s. Either bounds the unbounded-child failure; neither
carries margin for a contention regime nobody has measured.

## 5. Reproducing this

```
FX_BROWSER_CHILD_TIMING=/tmp/timing.jsonl pnpm heavy pnpm mutation:browser
```

with this temporary instrumentation applied (reverted after the probe):

```diff
diff --git a/tests/mutation/browser/runner.ts b/tests/mutation/browser/runner.ts
index 491f3c10c..07f3b00c2 100644
--- a/tests/mutation/browser/runner.ts
+++ b/tests/mutation/browser/runner.ts
@@ -1,5 +1,12 @@
 import { execFileSync } from "node:child_process";
-import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import {
+  appendFileSync,
+  existsSync,
+  mkdtempSync,
+  readFileSync,
+  rmSync,
+  writeFileSync,
+} from "node:fs";
 import { tmpdir } from "node:os";
 import { basename, join, resolve } from "node:path";
 import { BaselineNotGreenError } from "../source/oracle";
@@ -164,6 +171,22 @@ function runChild(root: string, suite: DecidingSuite, manifestPath: string | nul
     exitStatus = typeof err.status === "number" ? err.status : null;
   }
 
+  // MEASUREMENT-ONLY INSTRUMENTATION (BL-MUTATION-BROWSER-CHILD-LIFETIME probe).
+  // Emits one JSONL row per child so the ceiling can be derived from a measured
+  // per-child distribution rather than a total. Inert unless the env var is set,
+  // and REVERTED before the repair lands -- it is probe apparatus, not the fix.
+  if (process.env.FX_BROWSER_CHILD_TIMING) {
+    appendFileSync(
+      process.env.FX_BROWSER_CHILD_TIMING,
+      JSON.stringify({
+        suite: suiteLabel(suite),
+        kind: suite.kind,
+        exitStatus,
+        ms: Date.now() - spawnedAt,
+      }) + "\n",
+    );
+  }
+
   return suite.kind === "playwright"
     ? { exitStatus, report: reportEvidence({ path: reportPath, spawnedAt }) }
     : { exitStatus };
```

## 6. Documented limits of this probe

1. **One machine, two runs, low contention.** n=40 playwright children. The tail is
   reproduced, not bounded. A run under nine concurrent arcs is not measured, and section 4's choice
   of multiple is the response to that gap rather than a measurement of it.
2. **Role attribution absent.** Baseline, mutant, and control children are pooled (section 1); the
   instrumentation did not record which was which.
3. **One surface.** `tapTargetFloor` is the only enrolled browser surface. A second surface with a
   heavier suite would move the max, and the ceiling is stated as a multiple of a MEASURED maximum
   precisely so that re-measuring is the documented response rather than re-arguing.
4. **Healthy runs only.** Both gate runs were green. This probe measures the healthy distribution;
   it does not exercise the timeout path, which is the implementing plan's job.
