# Screenshots-drift cache refresh — make a stale restore impossible, and save on failure

**Date:** 2026-08-15 · **Authoring branch:** `docs/screenshots-drift-cache-spec` · **Implementation branch:** `fix/screenshots-drift-cache` · **Entry:** `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING` (BACKLOG.md) · **Status:** spec-APPROVED (codex-guard R5, 2026-08-15; R1-R4 findings repaired in-branch — direction ratified as input-hash key, §1.1.2)

## §0 The trap, and the settled evidence

`.github/workflows/screenshots-drift.yml` restores `.next-screenshots-help/cache` via a
combined `actions/cache@v4` step (`.github/workflows/screenshots-drift.yml:87-94`), key
`${{ runner.os }}-nextcache-screenshots-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}`
(`.github/workflows/screenshots-drift.yml:91`) with two prefix `restore-keys` fallbacks (`.github/workflows/screenshots-drift.yml:92-94`). The combined action saves
only in the post step of a SUCCESSFUL job. Composition: once every saved
`Linux-nextcache-screenshots-*` cache predates a UI-changing merge, the nightly drift
run prefix-restores a stale Next compiler cache, renders the OLD chrome, fails the byte
gate (`git diff --exit-code public/help/screenshots/`, `.github/workflows/screenshots-drift.yml:111-114`) — and by failing,
skips the save. The failure self-perpetuates until a human deletes the caches.

**Causation is settled by the entry's two-run probe (2026-08-14) and is not
re-derivable here:** main-branch runs 31693276503 / 31748971797 failed on the same 6
md5-verified `crew-preview-*.webp` files while the committed baselines were current
(regenerated at `a5e1ee44d` after the #779 UI change) and `screenshots-regen.yml` —
same sha, same pinned Playwright image (`mcr.microsoft.com/playwright`, tag
`v1.59.1-jammy`), same `pnpm screenshot:help`, and NO cache step (re-verified
2026-08-15: `grep -c 'actions/cache' .github/workflows/screenshots-regen.yml` → 0) —
reproduced the committed bytes exactly. Deleting all 12 saved caches and re-dispatching
flipped the outcome: run 31749355724 SUCCESS with zero source change. The only variable
was the restored cache.

**The evidence proves more than the entry's framing states, and it constrains the
repair (spec R1 F1/F2).** The failing drift runs and the passing regen ran at the SAME
sha with the SAME sources; only the cache differed, and the cached run rendered old
chrome. So the Next compiler cache served stale compilation for changed content — the
workflow's own byte-safety comment ("a warm build reuses identical compilation, so
rendered pixels are unchanged", `.github/workflows/screenshots-drift.yml:83-86`) was refuted live. Consequence: a failing
run's post-build cache still CONTAINS the poisoned entries it reused, so merely saving
it (an `if: always()` save on the existing sha-suffixed prefix-fallback key) would
propagate the poison to every later run instead of converging — the always-save alone
does not close the class. What closes it is making a stale restore IMPOSSIBLE: a cache
may be restored only by a run whose render inputs match the inputs it was built from.

The workflow's chown-step comment (`.github/workflows/screenshots-drift.yml:104-107`) currently claims its `if: always()`
leaves "a saveable cache for the next run" — a save that never runs on failure. That
comment is corrected by this change.

## §1.1 Resolved scope — do not relitigate

1. **Causation is probe-settled** (entry body; §0). A reviewer re-deriving "maybe the
   baselines were stale" is relitigating md5-verified evidence; the G2 scope brief
   pre-ratifies this fence.
2. **Ratified direction: the entry's direction 1 — key the cache on a hash of the
   inputs that feed the build — with no `restore-keys` fallback, implemented as an
   `actions/cache/restore@v4` + `actions/cache/save@v4` split whose save runs
   `if: always()`.** This spec's round-1 draft ratified the scope brief's recommended
   default (direction 2 alone: split + always-save on the existing key); that was
   REFUTED by the §0 same-sha derivation from the entry's own evidence (R1 F1/F2) and
   is fenced in BOTH directions: do not propose returning to a prefix-fallback key
   (the poison-propagation derivation above), and do not re-litigate the split +
   always-save riding along (it is what preserves warmth across failing first runs at
   a new input set — §2.1). Direction 3 (drop `restore-keys` on the sha key) is
   subsumed: this design also has no fallback, and the input-hash key strictly
   dominates the sha key on warmth (a re-run OR a render-input-unchanged commit both
   hit exactly; a sha key warms only exact re-runs).
3. **Surface: `.github/workflows/screenshots-drift.yml` only**, plus the structural
   pin in `tests/cross-cutting/ci-workflow-speedup.test.ts` (already the home of
   every other shape assertion on this workflow — `readWorkflow("screenshots-drift.yml")`
   at `tests/cross-cutting/ci-workflow-speedup.test.ts:72`) and the ledger moves. No
   app code, no capture scripts, no other workflow.
4. **The workflow comment cites the entry id** — required by the entry ("Whichever
   lands should note in the workflow why, citing this entry").
5. **CI-bound: real CI green is a separate gate from local review** (AGENTS.md
   local-passes-CI-fails rule). The plan carries `workflow_dispatch` verification —
   the workflow declares `workflow_dispatch:` (`.github/workflows/screenshots-drift.yml:46`;
   the 2026-08-14 probe used it).
6. **Autonomy:** 2026-08-15 grant — both user review gates waived; Fable authors, a
   fresh Opus pane implements from `HANDOFF.md`.

## §2 Contract

### §2.1 Workflow change

Replace the combined step (`.github/workflows/screenshots-drift.yml:87-94`) with:

- **Restore** — `actions/cache/restore@v4`, `id: nextcache-restore`, same `path`
  (`.next-screenshots-help/cache`), **new key, no `restore-keys`:**

  `key: ${{ runner.os }}-nextcache-screenshots-v2-${{ hashFiles('pnpm-lock.yaml', 'next.config.ts', 'package.json', <the render-input globs minus the baselines>) }}`

  where the glob list is the workflow's own `pull_request.paths` allow-list (22
  globs, `.github/workflows/screenshots-drift.yml:13-43` — R1 F4: 22, not 20) MINUS
  `public/help/screenshots/**` (R2 F1: the capture step MUTATES those bytes mid-run,
  and `actions/cache/save` re-evaluates a content-derived key at save time — its own
  README warns of exactly this — so a baselines-in-key census made a drifting run
  save under a phantom key no checkout ever requests; the baselines are the
  comparison TARGET, not a compiler input), PLUS three compiler inputs that are not
  PR-filter entries, added by name: `pnpm-lock.yaml` (was already in the old key),
  `next.config.ts` (owns `distDir` and build config), `package.json` (build
  scripts/deps surface). Net: 24 `hashFiles` arguments (22 − 1 + 3). One list, one
  derivation: the §2.2 pin asserts key-globs == filter-globs − the baselines glob +
  the three named extras, so the lists cannot drift apart silently.
  - The `-v2-` namespace segment is deliberate: it makes every pre-existing
    `Linux-nextcache-screenshots-*` entry — including the poisoned generation —
    unreachable by construction, without anyone running `gh cache delete`. Old
    entries age out on GitHub's eviction.
  - Exact-match only. A hit means the cached compilation was built from
    byte-identical render inputs, so reuse is sound BY KEY CONSTRUCTION rather than
    by trusting Next's invalidation — the exact trust the incident broke. A miss
    builds cold (~30s, the number the current comment claims for the warm-build
    saving), which is the correct price for changed inputs.
- **Save** — `actions/cache/save@v4`, `if: always()`, same `path`, and
  `key: ${{ steps.nextcache-restore.outputs.cache-primary-key }}` — the key is
  computed ONCE, at restore time, and the save reuses it by reference (R2 F1: never
  re-evaluate a content-derived key after the job has mutated the tree; with the
  baselines already out of the census this is belt-and-braces against any FUTURE
  census addition that a later step mutates). Placed AFTER the "Reclaim Next cache
  ownership" chown step
  (`.github/workflows/screenshots-drift.yml:108-110`, which stays `if: always()` and ordered before the save — the save
  reads files the Docker build left root-owned) and after the "Check screenshot
  drift" step (`.github/workflows/screenshots-drift.yml:111-114`). With the exact-input key, the save's job is warmth, not
  convergence: the first run at a given input set whose build CREATED the cache
  path — pass or fail at the byte gate — saves, so a UI-change commit whose drift
  run fails (stale baselines) still leaves the next same-input run warm; a run
  that dies before the build creates the path saves nothing and is already loudly
  red at the step that killed it (R3 F1; §4.6). A later run at an already-saved key restores that entry and
  its own save is skipped by the cache service (immutable entries, already-exists) —
  harmless, because a same-key restore is input-identical by construction (R1 F1:
  no "fresh generation per run" claim survives; none is needed).
  - Comment on the step cites `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING`
    with the one-line why (first run at any input set must save even when the byte
    gate fails).
- **Drift-check step edit (R2 F3, aggregated per R3 F2):** the untracked-capture
  branch currently hides filenames (`test -z "$(git ls-files --others
  --exclude-standard public/help/screenshots/)"`,
  `.github/workflows/screenshots-drift.yml:114` — a probe reproduced
  `status=1 output_bytes=0`), and the step's fail-fast shell means `git diff
  --exit-code` exits the script before any later untracked branch runs (R3 F2
  probe: with both kinds of drift present, only the tracked name printed). The step
  becomes ONE aggregated check: compute `tracked=$(git diff --name-only
  public/help/screenshots/)` and `untracked=$(git ls-files --others
  --exclude-standard public/help/screenshots/)` FIRST (name-listing commands, no
  early exit), print every name from BOTH non-empty lists (plus `git --no-pager
  diff --stat` for the tracked half), then exit 1 once if either list is non-empty
  — no ordering can suppress a name.
- **Comment corrections in the same edit:** the restore block drops the refuted
  byte-safety paragraph and the post-save/`restore-keys` prose (`.github/workflows/screenshots-drift.yml:80-86`) in favor
  of the key-construction argument above; the chown comment (`.github/workflows/screenshots-drift.yml:104-107`)
  points at the explicit save step.
- If the capture step fails before the build creates the cache path, the save
  reports a path-validation problem on a run that is ALREADY red at capture — it
  cannot turn a green run red, because every green run's build has created the path.

### §2.2 Structural pin (the RED)

`tests/cross-cutting/ci-workflow-speedup.test.ts` gains a `describe` on
`screenshots-drift.yml` asserting, on extracted step blocks rather than file-wide
substrings (R1 F3):

1. exactly one `actions/cache/restore@v4` step and one `actions/cache/save@v4` step
   exist; no combined `actions/cache@v4` step names the `.next-screenshots-help/cache`
   path (the `~/.cache/ms-playwright` combined-cache assertions for OTHER workflows
   at `tests/cross-cutting/ci-workflow-speedup.test.ts:155-175` are untouched);
2. the save step carries `if: always()` (asserted within the save step's block);
3. restore and save declare the SAME `path`; the restore step carries
   `id: nextcache-restore`, and the save step's `key` is exactly
   `${{ steps.nextcache-restore.outputs.cache-primary-key }}` (single-evaluation
   parity — a re-evaluated or hand-copied save key is the R2 F1 phantom-key hole);
4. the restore step declares NO `restore-keys`;
5. step ORDER: capture → chown → drift check → save (asserted on the index order of
   the extracted step names/`uses:` lines);
6. the restore key's `hashFiles(...)` argument set equals the `pull_request.paths`
   glob set MINUS `public/help/screenshots/**` plus exactly `pnpm-lock.yaml`,
   `next.config.ts`, `package.json` (parse both lists from the YAML, compare as
   sets — the single-derivation discipline that keeps the filter and the key from
   drifting apart, with the one mutated-target exclusion stated in the assertion's
   own comment);
7. the save step's block cites the entry id;
8. **key SHAPE (R2 F4):** the restore key matches exactly
   `${{ runner.os }}-nextcache-screenshots-v2-${{ hashFiles(...) }}` — the `-v2-`
   namespace is present and the expression contains NO further components (no
   `github.sha` suffix, no second interpolation), so a namespace regression or a
   smuggled per-run component fails by name;
9. **drift-check names every divergence (R3 F3 — behavioral, not shape):** extract
   the drift-check step's `run:` script from the YAML and EXECUTE it (bash, cwd set
   to a constructed throwaway git repository containing `public/help/screenshots/`
   with one committed-then-modified WebP and one untracked WebP): assert exit
   status non-zero AND both filenames present in the captured output; negative
   case — a clean constructed repo exits 0 with no names. This is the executable
   RED for the R2 F3/R3 F2 behavior change; the YAML-shape assertions cannot see
   filename emission.

This is the impl branch's executable RED: it fails against the current tree by name
(combined step live at `.github/workflows/screenshots-drift.yml:87-94`), goes green with the §2.1 edit, and closes the class
against reverts and against the near-miss shapes F3 enumerated (wrong-key save,
wrong-path save, pre-capture save, resurrected fallback).

### §2.3 Verification (plan carries it as a gate)

1. Local: the pinned suite green; eslint/format/typecheck per pre-push gates.
2. **Green dispatch:** `gh workflow run screenshots-drift.yml --ref
   fix/screenshots-drift-cache` — restore and save appear as separate steps; the
   first run misses (v2 namespace is empty), builds cold, passes the byte gate, and
   the save logs a saved cache. A second dispatch on the same ref then HITS the
   exact key (warmth proof). Record both run ids.
3. **Failing-run save proof (the constructed failing input for the gate):** on a
   throwaway branch off the impl branch, edit a rendered admin-chrome string (a real
   render input, e.g. any user-visible literal under `components/admin/**`) WITHOUT
   regenerating baselines; dispatch on that ref. Expected, all three observed in one
   run: the restore MISSES (the input hash moved — no fallback exists to hand back a
   stale cache), the build runs cold and renders the NEW chrome (the uploaded
   `drifted-screenshots` artifact shows the changed string — the stale-restore-
   impossible claim, live), the drift check FAILS, and the save still executes under
   `if: always()` and saves. Record the run id; delete the throwaway branch. (R1 F2:
   a baseline byte-flip would only have proven the save scheduling; this input
   exercises the key miss, the cold rebuild, and the save-on-failure together —
   which IS the §7 bound.)
4. The PR itself fires the workflow (the paths filter lists
   `.github/workflows/screenshots-drift.yml` itself, `.github/workflows/screenshots-drift.yml:43`), a third live check.

### §2.4 Entry disposition

The impl branch archives `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING`
(archive-RED pattern: move with marker → `tests/docs/_metaLedgerInProgress.test.ts`
fails by name → strip → green) recording: the ratified direction (input-hash exact
key), the §0 derivation that refuted the always-save-alone default, the §4 record of
the other directions, and the §2.3 run ids as resolution evidence.

### Dimensional Invariants

None — no UI surface, no rendered component.

### Transition Inventory

None — CI workflow YAML, one test file, ledger prose; no visual states.

## §4 Documented limits + direction record

1. **Direction 2 alone (split + always-save on the prefix-fallback sha key) —
   REFUTED, not merely rejected** (R1 F1/F2 + the §0 same-sha derivation): the
   incident proves a stale cache survives a warm build, so saving a failing run's
   cache under a prefix-restorable key propagates poison instead of converging. Its
   split + always-save mechanics survive INSIDE this design (§2.1) for warmth.
2. **Direction 3 (drop `restore-keys`, keep the sha key) — subsumed and dominated:**
   this design also has no fallback, and the input-hash key warms every
   input-identical run, not just same-sha re-runs. Recorded so nobody re-files it as
   a cheaper alternative: it is the same safety with strictly less warmth.
3. **Input-enumeration completeness is the residual risk.** The key can only hash
   what it names. The named set is the workflow's own render-input census (the PR
   paths filter — which itself once missed the font and was repaired, per the
   comment at `.github/workflows/screenshots-drift.yml:25-28`) plus three named
   compiler inputs; the §2.2 parity assertion makes filter and key one derivation,
   so a future census repair automatically repairs the key. An input absent from
   BOTH lists (example: a runner-toolchain drift inside the pinned Docker image tag)
   can still produce a stale-for-that-input hit; the byte gate still fails loudly
   and names the files — never silently wrong — and repairing the census closes it.
4. **Same-input immutability:** a run at an already-saved input set cannot re-save
   (cache entries are immutable). Harmless by construction — a same-key restore is
   input-identical — and stated so the "every run saves" misreading cannot return.
5. **Content-identity, not path-identity (R2 F2).** `hashFiles` digests file
   CONTENTS; a path-only rename that preserves bytes (and glob membership) keeps the
   key while filesystem routing may change build semantics. Such a rename can
   therefore restore a cache built under the old path layout. The byte gate still
   reports any resulting divergence by name — never silently wrong — and the shape
   is recorded here as a documented limit rather than engineered around (a
   path-sensitive key would go cold on every rename to buy safety the gate already
   provides).
6. **A run that fails before the build creates the cache path saves nothing (R3
   F1).** The `if: always()` save can only archive what exists; a capture-step
   death before `next build` runs leaves no path and no save. Such a run is
   already red at the killing step, and the NEXT run at those inputs simply
   misses and builds cold — no staleness is introduced, one warm opportunity is
   lost. Documented, not engineered around.
7. **A capture-step death SKIPS the drift check entirely (R4 F1).** The drift
   check keeps GitHub's default `success()` condition, so a run whose capture
   step fails — even after writing some files — names no filenames; it is loudly
   red at the capture step instead. Deliberate, not a gap to engineer around: a
   partially-written capture set is not a valid comparison population, and
   running the byte gate over it would NAME false drift (worse than naming
   nothing). The gate's naming duty applies to runs whose capture completed; a
   capture failure has its own step-level red.
8. **Cross-workflow scope:** `help-affordances.yml`'s `nextcache-help` namespace
   keeps the combined pattern; it gates NO byte comparison, so staleness there
   cannot self-perpetuate a red main — out of scope per the entry and the brief. If
   it ever grows a byte gate, this spec is the template.

## §5 Meta-test / registry inventory

- **EXTENDS:** `tests/cross-cutting/ci-workflow-speedup.test.ts` (§2.2 pin).
- **CREATES / registries:** nothing else. No Supabase call site, no mutation
  surface, no advisory lock, no §12.4 row. The CI env-guard layers are untouched —
  the change adds no `env:` block and no `GITHUB_ENV` write.

## §6 Acceptance criteria

- **AC-1:** the §2.2 pin observed RED against the unedited workflow, GREEN after
  §2.1; all nine assertions land (split, always-save, single-evaluation key parity,
  no restore-keys, step order, key/filter glob parity with the baselines exclusion,
  entry-id comment, exact key shape, behavioral name-emission check with its
  clean-repo negative).
- **AC-2:** the workflow edit matches §2.1 — v2-namespaced exact input-hash key
  (baselines excluded), no fallback, split restore/save with the save keyed on the
  restore output, untracked captures named by the drift check, save ordered after
  chown + drift check, corrected comments; step order otherwise unchanged.
- **AC-3:** §2.3 executed with run ids recorded: cold-then-warm green dispatch pair,
  and the throwaway-branch failing dispatch showing key miss + new-chrome artifact +
  FAIL at the drift check + successful save.
- **AC-4:** entry archived per §2.4; marker released in the PR's last pre-merge
  commit; conventional commits; TDD per task; real CI green before merge.

## §7 Convergence contract (for review dispatches on this spec and its diff)

- **CONSEQUENCE BOUND:** after this change, no drift run can restore a cache whose
  named render-input CONTENTS differ from its own (exact content-hash key, no
  fallback, fresh v2 namespace), and the first run at any input set whose build
  created the cache path — pass or fail at the byte gate — saves under the key it
  restored with (computed once, at restore time; the pre-build-death corner is
  §4.6); on every run whose capture completed, any render divergence — tracked
  drift or untracked new captures — is reported by name by the byte gate, and a
  run whose capture died is loudly red at that step (§4.7 — a partial capture set
  is not a valid comparison population) — never silently wrong. The residuals in
  §4.3-§4.7 (an input outside the named census; same-input immutability;
  byte-preserving path renames; the pre-build-death save corner; the
  capture-death skip) are DOCUMENTED LIMITS, not findings.
- **PROBE DOMAIN:** `.github/workflows/screenshots-drift.yml` and
  `tests/cross-cutting/ci-workflow-speedup.test.ts` on this branch, plus real
  `workflow_dispatch` runs of that workflow (the §2.3 run ids). A hypothetical about
  other workflows, other cache namespaces, or GitHub cache-service internals files
  to §4, not to a finding.
- **THREAT-MODEL FENCE:** accidental staleness from the ordinary merge/fail/save
  lifecycle on shared runners. Deliberate cache poisoning, cross-repo cache
  attacks, and GitHub-side service faults are out of scope and file to documented
  limits.

impeccable-gate: N/A — no UI surface
