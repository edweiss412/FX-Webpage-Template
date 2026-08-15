# Screenshots-drift cache refresh — a failing run must refresh the cache that failed it

**Date:** 2026-08-15 · **Authoring branch:** `docs/screenshots-drift-cache-spec` · **Implementation branch:** `fix/screenshots-drift-cache` · **Entry:** `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING` (BACKLOG.md) · **Status:** DRAFT

## §0 The trap, and the settled evidence

`.github/workflows/screenshots-drift.yml` restores `.next-screenshots-help/cache` via the
combined `actions/cache@v4` step ("Restore Next build cache", key
`${{ runner.os }}-nextcache-screenshots-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}`
with two prefix `restore-keys` fallbacks). The combined action saves only in the post
step of a SUCCESSFUL job. Composition: once every saved `Linux-nextcache-screenshots-*`
cache predates a UI-changing merge, the nightly drift run restores a stale Next compiler
cache, renders the OLD chrome, fails the byte gate — and by failing, skips the save that
would have replaced the stale cache. The failure self-perpetuates until a human deletes
the caches.

**The causation is settled by the entry's two-run probe (2026-08-14) and is not
re-derivable here:** main-branch runs 31693276503 / 31748971797 failed on the same 6
md5-verified `crew-preview-*.webp` files while the committed baselines were current
(regenerated at `a5e1ee44d` after the #779 UI change) and `screenshots-regen.yml` — same
sha, same pinned Playwright image (`mcr.microsoft.com/playwright`, tag `v1.59.1-jammy`), same
`pnpm screenshot:help`, NO cache step (verified again 2026-08-15: zero cache references
in `.github/workflows/screenshots-regen.yml`) — reproduced the committed bytes exactly.
Deleting all 12 saved caches and re-dispatching flipped the outcome: run 31749355724
SUCCESS with zero source change. The only variable was the restored cache.

The workflow's own chown-step comment currently claims `if: always()` on the chown "so a
drift failure still leaves a saveable cache for the next run" — a save that never runs
on failure. That comment is corrected by this change.

## §1.1 Resolved scope — do not relitigate

1. **Causation is probe-settled** (entry body, two-run evidence above). A reviewer
   re-deriving "maybe the baselines were stale" is relitigating md5-verified evidence;
   the G2 scope brief pre-ratifies this fence.
2. **Repair direction is ratified: explicit `actions/cache/restore@v4` +
   `actions/cache/save@v4` with `if: always()`** — the entry's direction 2, the scope
   brief's recommended default. The other two directions are recorded rejected in §4.
3. **Surface: `.github/workflows/screenshots-drift.yml` only**, plus the structural pin
   in `tests/cross-cutting/ci-workflow-speedup.test.ts` (already the home of every
   other shape assertion on this workflow — its `describe` at line 71 reads the same
   file) and the ledger moves. No app code, no capture scripts, no other workflow.
4. **The workflow comment cites the entry id** — required by the entry ("Whichever
   lands should note in the workflow why, citing this entry").
5. **CI-bound: real CI green is a separate gate from local review** (AGENTS.md
   local-passes-CI-fails rule). The plan carries a `workflow_dispatch` verification —
   the workflow already declares `workflow_dispatch:` (re-verified 2026-08-15; the
   2026-08-14 probe used it).
6. **Autonomy:** 2026-08-15 grant — both user review gates waived; Fable authors, a
   fresh Opus pane implements from `HANDOFF.md`.

## §2 Contract

### §2.1 Workflow change

Replace the single combined step:

- **Restore** — `actions/cache/restore@v4`, same `path`, same `key`, same
  `restore-keys`, `id: nextcache-restore`. Everything the current comment block says
  about key namespace, byte-safety, and `github.sha` freshness stays true and stays in
  place.
- **Save** — a new `actions/cache/save@v4` step placed AFTER the "Reclaim Next cache
  ownership" chown step (the save reads files the Docker build left root-owned; the
  chown already runs `if: always()` and must stay ordered before the save) and after
  the "Check screenshot drift" step, with:
  - `if: always()` — a failing drift run still refreshes its cache; this is the whole
    repair. (`save-always: true` on the combined action is NOT used: it is deprecated
    as broken upstream — the post-step condition it gates evaluates too early — and
    the split form is the upstream-recommended replacement.)
  - `path: .next-screenshots-help/cache`, `key:` the same primary-key expression the
    restore uses. Each run therefore saves a fresh entry under its own `github.sha`;
    the NEXT run's prefix fallback restores the newest entry — which after a failing
    run is that run's own fresh cache, breaking the self-perpetuation.
  - A comment citing `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING` and the
    one-line why (failing runs must refresh the cache that failed them).
- **Comment corrections in the same edit:** the restore block's prose drops the claim
  that the post step saves ("`github.sha` in the key makes each run save a fresh
  immutable entry" moves to the save step); the chown comment's "so a drift failure
  still leaves a saveable cache" now points at the explicit save step instead of the
  nonexistent post-save.

Behavior notes, stated so the implementer does not re-derive them:

- Re-running a job for a sha that already saved: the save logs a cache-already-exists
  warning and the step succeeds — non-fatal, no handling needed.
- If the capture step fails before the build creates `.next-screenshots-help/cache`,
  `actions/cache/save` reports a path-validation problem on a run that is ALREADY red
  at the capture step — it cannot turn a green run red, because on every green run the
  build has created the path. The §2.3 dispatch proofs exercise both live paths (green
  run, drift-failing run); this corner needs no branch of its own.

### §2.2 Structural pin (the RED)

`tests/cross-cutting/ci-workflow-speedup.test.ts` gains assertions on
`screenshots-drift.yml`: the nextcache step pair is `actions/cache/restore@v4` +
`actions/cache/save@v4`; the save step carries `if: always()`; the file does NOT use
combined `actions/cache@v4` on the `.next-screenshots-help/cache` path (the
`~/.cache/ms-playwright` combined-cache assertions on OTHER workflows at lines 158-175
are untouched — the scope is this path in this file). This is the impl branch's
executable RED: it fails against the current tree by name, goes green with the §2.1
edit, and pins the class shut (a future revert to the combined form fails CI).

### §2.3 Verification (plan carries it as a gate)

1. Local: the pinned suite green; `pnpm exec eslint`/format/typecheck per pre-push
   gates.
2. `gh workflow run screenshots-drift.yml --ref fix/screenshots-drift-cache` — the
   run's step list shows restore + save as separate steps and the save executes with
   "Cache saved" on a green run.
3. **Failing-run proof (the mutant-red for the gate, run on a throwaway branch off the
   impl branch):** flip one byte of one committed baseline WebP, dispatch, observe the
   run FAIL at "Check screenshot drift" AND the save step still execute "Cache saved"
   under `if: always()`. That failing run saving its cache IS the entry's repair claim,
   proven executably. The throwaway branch is deleted afterward; the byte flip never
   reaches the impl branch.

### §2.4 Entry disposition

The impl branch archives `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING`
(archive-RED pattern: move with marker → `tests/docs/_metaLedgerInProgress.test.ts`
fails by name → strip → green) with the shipped direction, the two rejected directions
(§4), and the dispatch-run ids from §2.3 as the resolution evidence.

### Dimensional Invariants

None — no UI surface, no rendered component.

### Transition Inventory

None — CI workflow YAML, one test file, ledger prose; no visual states.

## §4 Documented limits + rejected directions

1. **Direction 1 (input-hash cache key) — rejected.** An honest input enumeration is
   the entire render surface (the workflow's 20-glob PR paths allowlist is its own
   approximation of it); hashing `app/** components/** lib/** fixtures/**` every run
   is slow, still approximate, and adds no safety the byte gate does not already
   provide — the drift gate IS the oracle for cache-poisoned renders, and the repair
   only has to stop the poisoned state from persisting.
2. **Direction 3 (drop `restore-keys`) — rejected.** The primary key embeds
   `github.sha`, so without the prefix fallback every run is a guaranteed cold build
   (~30s+ each) — the fallback is the entire warmth mechanism, and with the
   `if: always()` save the fallback now finds a fresh-generation cache even after a
   failure, so its staleness window closes without giving up warm builds.
3. **A stale-but-same-generation cache remains possible in the window between a
   UI-changing merge and the next drift run** — unchanged from today, harmless: the
   first run after the merge restores the pre-merge cache, and whether it passes (byte-
   identical warm compilation) or fails (real drift), it now SAVES, so the state
   converges in one run instead of never. Never silently wrong: the byte gate still
   reports any divergence by name.
4. **Cross-workflow scope:** `help-affordances.yml`'s `nextcache-help` namespace uses
   the same combined-action pattern but gates NO byte comparison (it runs e2e
   assertions, not `git diff --exit-code` on committed bytes), so a stale compiler
   cache there cannot self-perpetuate a red main — out of scope by the entry's own
   framing and the brief's "surface: screenshots-drift.yml only". If that workflow
   ever grows a byte gate, this spec is the template.

## §5 Meta-test / registry inventory

- **EXTENDS:** `tests/cross-cutting/ci-workflow-speedup.test.ts` (§2.2 pin).
- **CREATES / registries:** nothing else. No Supabase call site, no mutation surface,
  no advisory lock, no §12.4 row. The CI env-guard layers
  (`ENV_KEY_ALLOWLIST`, cross-step `GITHUB_ENV` census) are untouched — the change
  adds no `env:` block and no `GITHUB_ENV` write.

## §6 Acceptance criteria

- **AC-1:** the §2.2 pin observed RED against the unedited workflow, GREEN after §2.1;
  no combined `actions/cache@v4` on the nextcache path survives in the file.
- **AC-2:** the workflow edit matches §2.1 — restore/save split, `if: always()` save
  ordered after chown, entry-id-citing comment, corrected prose; step order otherwise
  unchanged.
- **AC-3:** §2.3 executed with run ids recorded: one green dispatch showing the save
  step, one throwaway-branch failing dispatch showing FAIL at the drift check AND a
  successful save.
- **AC-4:** entry archived per §2.4; marker released in the PR's last pre-merge
  commit; conventional commits; TDD per task; real CI green before merge.

## §7 Convergence contract (for review dispatches on this spec and its diff)

- **CONSEQUENCE BOUND:** after this change, every drift run — pass or fail — saves a
  fresh cache generation under its own sha, so a stale-cache failure cannot outlive
  one run; any render divergence is still reported by name by the byte gate — never
  silently wrong. Cache-staleness shapes that cannot persist past one run (§4.3) are
  DOCUMENTED LIMITS, not findings.
- **PROBE DOMAIN:** `.github/workflows/screenshots-drift.yml` and
  `tests/cross-cutting/ci-workflow-speedup.test.ts` on this branch, plus real
  `workflow_dispatch` runs of that workflow (the §2.3 run ids). A hypothetical about
  other workflows or other cache namespaces files to §4.4, not to a finding.
- **THREAT-MODEL FENCE:** accidental staleness produced by the ordinary
  merge/fail/save lifecycle on shared runners. Deliberate cache poisoning,
  cross-repository cache attacks, and GitHub-side cache-service faults are out of
  scope and file to documented limits.

impeccable-gate: N/A — no UI surface
