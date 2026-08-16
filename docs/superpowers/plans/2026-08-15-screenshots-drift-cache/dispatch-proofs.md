# screenshots-drift dispatch proofs (Task B2)

Real `workflow_dispatch` verification of the §2.1 change. Real CI green is a separate gate
from local review (AGENTS.md local-passes-CI-fails rule), so these are runs of the actual
workflow on GitHub runners, not local simulations.

**Executable proof** (plan B2 step 3): `gh run view <id> --json conclusion -q .conclusion`

```
31926544147 -> success
31926782074 -> success
31926586967 -> failure
```

which matches the expected `success, success, failure` exactly.

## 1. Cold dispatch — run `31926544147` (`fix/screenshots-drift-cache`)

The `-v2-` namespace is empty, so the first run must miss, build cold, pass the byte gate,
and save.

```
Restore Next build cache: Cache not found for input keys:
  Linux-nextcache-screenshots-v2-8b9588ef6936b1208a4a1a802c737b13739f022737d43d6e0feb99a3287719f3
Save Next build cache:    Cache saved with key:
  Linux-nextcache-screenshots-v2-8b9588ef6936b1208a4a1a802c737b13739f022737d43d6e0feb99a3287719f3
```

Conclusion: `success`. The saved key is **byte-identical** to the restored key, which is the
single-evaluation contract observed live: the key is computed once at restore time and the
save reuses it by reference, so no `hashFiles` re-evaluation can occur after the job has
mutated the tree.

## 2. Warm dispatch — run `31926782074` (same ref, no source change)

```
Restore Next build cache: Cache restored successfully
  Cache restored from key:
  Linux-nextcache-screenshots-v2-8b9588ef6936b1208a4a1a802c737b13739f022737d43d6e0feb99a3287719f3
  Cache Size: ~280 MB (293214346 B)
```

Conclusion: `success`. An EXACT hit on the key run 1 saved — with no `restore-keys` present,
this can only be an exact-input match. Warmth preserved.

## 3. Constructed failing input — run `31926586967` (`throwaway/drift-cache-failing-proof`)

A real render input was edited (an admin dashboard heading literal, `Needs attention` ->
`Needs attention NOW`, in `components/admin/Dashboard.tsx`) WITHOUT regenerating baselines.
A baseline byte-flip would only have proven save scheduling; this input exercises the key
miss, the cold rebuild, and the save-on-failure together, which IS the §7 bound.

All four expected observations landed in ONE run:

**a. The restore MISSED, under a different hash — no fallback handed back a stale cache.**

```
Cache not found for input keys:
  Linux-nextcache-screenshots-v2-ea6eb25526ad151a555e8b36b2d17907449d0153c4489d2b642f0900d7d769db
```

`ea6eb255…` vs runs 1-2's `8b9588ef…`: the render input moved, so the key moved. This is the
stale-restore-impossible claim, live — under the OLD prefix-fallback key this run would have
restored the previous generation.

**b. The cold rebuild rendered the NEW chrome.** Four baselines diverged, exactly the surfaces
the edited heading appears on.

**c. The drift check FAILED and NAMED every divergence** (the R2 F3 / R3 F2 behavior change):

```
Drifted (tracked) screenshots:
public/help/screenshots/dashboard-overview-dark.webp
public/help/screenshots/dashboard-overview-light.webp
public/help/screenshots/review-queues-empty-state-dark.webp
public/help/screenshots/review-queues-empty-state-light.webp
 .../help/screenshots/dashboard-overview-dark.webp   | Bin 81698 -> 82138 bytes
 .../help/screenshots/dashboard-overview-light.webp  | Bin 77670 -> 78088 bytes
 .../screenshots/review-queues-empty-state-dark.webp | Bin 6418 -> 6916 bytes
 .../review-queues-empty-state-light.webp            | Bin 6088 -> 6534 bytes
```

**d. The save STILL executed and saved**, under `if: always()`, after the failed byte gate:

```
Save Next build cache: Cache saved with key:
  Linux-nextcache-screenshots-v2-ea6eb25526ad151a555e8b36b2d17907449d0153c4489d2b642f0900d7d769db
```

Step conclusions for that run, in order:

```
success  Restore Next build cache (screenshots-help :3004 build)
success  Capture screenshots in pinned Playwright image
success  Reclaim Next cache ownership (Docker built it as root)
failure  Check screenshot drift
success  Save Next build cache
success  Upload drifted captures (diagnosis artifact)
```

The save runs AFTER the failing drift check and succeeds. This is precisely the behavior the
old combined step could never reach: it saved only in the post step of a SUCCESSFUL job, so a
drifting run skipped the save and the failure self-perpetuated.

The throwaway branch was deleted after these observations were recorded; its edit never
reached `fix/screenshots-drift-cache`.

## 4. The PR run

`.github/workflows/screenshots-drift.yml` is itself in the `pull_request.paths` filter, so
this arc's PR fires the workflow as a third live verification.
