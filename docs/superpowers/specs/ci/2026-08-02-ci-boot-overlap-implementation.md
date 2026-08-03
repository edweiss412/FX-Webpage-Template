# CI wall-clock + flake pair — implement the boot/install overlap, and de-flake T-REGROW

**Date:** 2026-08-02
**Status:** SPEC — implementation-only. Two independent items shipped together because both are CI-surface changes with no product code between them.

**Design authority for item 1 is [`2026-07-20-ci-overlap-boot-with-setup.md`](./2026-07-20-ci-overlap-boot-with-setup.md).** Eight adversarial rounds are sunk into that document. Its §1.1 resolved-scope table, its §3 single-shell design, and its §5 accept gate are RATIFIED and are not reopened here. This spec exists to do the three things that document says must happen before it ships, and nothing else:

1. redo the write-surface audit against the real `allowBuilds` inventory (its §3/§4h state a known factual error — the inventory is five keys, not one);
2. reconcile the design against the workflow topology as it exists today, which changed after 2026-07-20 (the job split into `unit-suite-db` / `unit-suite-nodb`);
3. state the meta-test inventory and accept criteria against that current topology.

Item 2 (the T-REGROW e2e flake) is unrelated to item 1 and carries its own §6.

## 1. Scope

**Item 1 — overlap the Supabase boot with `pnpm install` in `unit-suite-db`.** One workflow step backgrounds `scripts/ci/supabase-local-bootstrap.sh`, captures its PID, runs `pnpm install --frozen-lockfile` in the foreground, and `wait`s on the PID, under `set -euo pipefail`.

**Item 2 — replace the fixed `waitForTimeout` calls in T-REGROW's armed measurements** (`tests/e2e/admin-lifecycle-layout.spec.ts`) with `toPass` blocks, the template the rest of that spec already uses. Filed as the "New instance observed 2026-07-26" paragraph of `BL-E2E-LIFECYCLE-SPECS-CI-DARK`.

Out of scope, stated so it is not inferred: the ~60 app-dependent dark e2e specs in that same backlog umbrella. This spec wires nothing new into CI.

### 1.1 Resolved scope — do not relitigate

| Settled | Where |
| --- | --- |
| Image caching is dead as a lever (measured ~19s SLOWER than the registry pull on P1) | 2026-07-20 §1.1, PR #504 |
| Test-membership / shard-count changes are out of scope | 2026-07-20 §1.1, PR #510 |
| The cross-step coordination protocol (sentinel, PID file, deadline arithmetic) is RETIRED — rounds 1–4 died on it. The design is ONE step with a native `wait` | 2026-07-20 §3 |
| The bootstrap script's body is unchanged; this phase changes only WHEN it runs | 2026-07-20 §1.1 |
| A pre-baked/pre-migrated Postgres image is out of scope | 2026-07-20 §1.1, §6 |
| **The install-failure stdout-pipe delay (~70s typical, bounded only by `timeout-minutes: 20`) is an ACCEPTED NON-GOAL.** Killing the background job correctly needs process-group termination + a join + PID-reuse care, and must not interrupt the bootstrap's held-aside-migration restore trap. Bought for a rare path whose only symptom is a slower failure report | 2026-07-20 §3, rounds 5–6 |
| The probe establishing that a detached process survives step boundaries (run 29743206592) is durable but INFORMATIONAL — the §3 design needs none of it | 2026-07-20 §2.1, round 7 |

## 2. Surface reconciliation — what changed since 2026-07-20

The 2026-07-20 spec describes a single 8-leg `unit-suite` job whose steps are `checkout → ./.github/actions/setup → supabase/setup-cli → psql guard → boot → vitest` (its §2 table). That topology no longer exists. Current `.github/workflows/unit-suite.yml`:

| Job | Legs | Boots Supabase | Project |
| --- | --- | --- | --- |
| `unit-suite-db` | 8 | yes | `serial` |
| `unit-suite-nodb` | 3 | no | `parallel` |
| `unit-suite` | — | aggregator, REQUIRED check-context name | — |

Anchors, all in `.github/workflows/unit-suite.yml`: `unit-suite-db` at `.github/workflows/unit-suite.yml:101` with `shard: [1, 2, 3, 4, 5, 6, 7, 8]` at `.github/workflows/unit-suite.yml:108`, the bootstrap step at `.github/workflows/unit-suite.yml:125`, and `--project=serial` at `.github/workflows/unit-suite.yml:133`; `unit-suite-nodb` at `.github/workflows/unit-suite.yml:135` with `shard: [1, 2, 3]` at `.github/workflows/unit-suite.yml:142`, its no-boot rationale comment at `.github/workflows/unit-suite.yml:154`, and `--project=parallel` at `.github/workflows/unit-suite.yml:165`; the aggregator at `.github/workflows/unit-suite.yml:167` with its `needs:` / `if: always()` at `.github/workflows/unit-suite.yml:177`.

Consequences for this implementation, all of them additive:

- **Only `unit-suite-db` changes.** `unit-suite-nodb` boots nothing, so it has nothing to overlap; it keeps `- uses: ./.github/actions/setup` verbatim. The composite is therefore NOT deleted, and `tests/cross-cutting/unit-suite-shard-topology.test.ts:190-196` ("`unit-suite-nodb` must use exactly three actions") stays green untouched.
- **One step exists today that the 2026-07-20 spec does not mention:** `- uses: ./.github/actions/assert-pnpm-sources` (`unit-suite.yml:126-127`), a composite guard, positioned after the boot and before vitest. Its relative order is preserved exactly — it runs after the combined step, before vitest. It is already downstream of the install today, so nothing about it moves.
- **The §2 measurement table is stale as a baseline.** Its `vitest 154s` line was a mixed-project leg. The accept gate (§7) therefore recomputes the baseline from `main` on the SAME topology, which is what 2026-07-20 §5.2 already requires ("versus the main baseline computed the SAME way").

## 3. Write-surface audit, REDONE (this is the correction)

2026-07-20 §3 asserts the concurrent install and the concurrent bootstrap have disjoint filesystem surfaces, and §4h pins `allowBuilds` as the audited inventory — but names only `@sentry/cli`. The real inventory is five keys. That error is why the branch was parked. Audit redone, empirically rather than by inference.

### 3.1 The inventory, verbatim

`pnpm-workspace.yaml` in full:

```yaml
allowBuilds:
  "@sentry/cli": true
  esbuild: true
  sharp: true
  # (comment: reviewed + intentionally NOT built)
  simple-git-hooks: false
  unrs-resolver: true
```

Five keys; four enabled, one deliberately disabled. Lifecycle scripts, read from the installed packages:

| Package | Version | Lifecycle |
| --- | --- | --- |
| `@sentry/cli` | 2.58.5 | `postinstall: node ./scripts/install.js` |
| `esbuild` | 0.28.0 | `postinstall: node install.js` |
| `sharp` | 0.34.5 | `install: node install/check.js \|\| npm run build` |
| `unrs-resolver` | 1.11.1 | `postinstall: napi-postinstall unrs-resolver 1.11.1 check` |
| `simple-git-hooks` | 2.13.1 | `postinstall: node ./postinstall.js` — **not run**, `allowBuilds: false` |

Root lifecycle: `package.json` declares exactly one install-lifecycle script, `prepare: "simple-git-hooks"`, whose config is `{"pre-commit": "pnpm exec lint-staged"}`.

### 3.2 The probe (the thing §4h could not do)

2026-07-20 §4h states the honest limitation: `allowBuilds` holds names and booleans, not commands, so pinning the set cannot prove where an allow-listed dependency writes. This spec closes that by OBSERVING the writes instead of reasoning about them.

Two probes, because one of them alone would not settle it.

**Probe A — host, `pnpm rebuild` (Darwin arm64).** Mark a timestamp, run `pnpm rebuild`, then look for anything under `supabase/` newer than the mark and for any git-visible change under `supabase/`:

```
$ pnpm rebuild
@sentry/cli postinstall$      ... Done
esbuild postinstall$          ... Done
sharp install$                ... Done
unrs-resolver postinstall$    ... Done
. prepare$ simple-git-hooks   ... Done      (5 lifecycle scripts executed)

$ find supabase -newer "$MARK" -type f
(no output)
$ git status --porcelain supabase/
(no output)
```

**Probe A is not sufficient, for two reasons, and both are why probe B exists.** First, `pnpm rebuild` and `pnpm install` do NOT execute the same lifecycle set: rebuild runs `preinstall`/`install`/`postinstall`/`prepublish`/`prepare`, while install additionally runs `preprepare` and `postprepare` (pnpm 10.33.2). This tree declares only `prepare`, so the two coincide TODAY — but the guard must forbid the install set, not the rebuild set, which is why §5h's forbidden list includes `preprepare` and `postprepare`. Second, these build scripts branch on platform — Sentry picks a download per platform, esbuild selects a platform package, sharp branches on platform and prebuilt availability — and a rebuild of an already-materialized Darwin tree is not evidence about the operation that actually runs in CI: a FRESH install on x86_64 Linux.

**Probe B — fresh install, x86_64 Linux, from a clean tree.** `git archive HEAD` (so no `node_modules/` comes along) piped into a `--platform linux/amd64` `node:20-bookworm` container, corepack resolving the same pinned pnpm 10.33.2, then `pnpm install --frozen-lockfile`.

**Fidelity, stated exactly.** The container is Debian 12; `ubuntu-latest` currently maps to Ubuntu 24.04. They differ in distribution and glibc version (2.36 vs 2.39) and in runner tool inventory. What they SHARE is what these four install scripts actually branch on: `process.platform === "linux"`, `process.arch === "x64"`, and glibc-vs-musl. That is the axis probe A could not exercise and probe B does, and it is the axis the round-1 finding was about. The residual — a script that behaves differently between two glibc minor versions on the same distro family — is a documented gap, not a closed one, and the §7 accept gate is what would surface it.

```
.../node_modules/@sentry/cli postinstall$ node ./scripts/install.js
.../node_modules/unrs-resolver postinstall$ napi-postinstall unrs-resolver 1.11.1 check
.../esbuild@0.28.0/node_modules/esbuild postinstall$ node install.js
.../sharp@0.34.5/node_modules/sharp install$ node install/check.js || npm run build
. prepare$ simple-git-hooks
│   Ignored build scripts: @parcel/watcher@2.6.0.                              │
Done in 9.5s using pnpm v10.33.2
=== supabase writes ===
(end)                        # find supabase -newer "$MARK" -type f  -> nothing
$ uname -m                   -> x86_64
$ /etc/os-release            -> Debian GNU/Linux 12 (bookworm)
```

All four enabled build scripts plus the root `prepare` executed on x86_64 Linux, from a fresh install.

**`find -newer` is not enough on its own** — it detects additions and touches, not deletions, and not a same-mtime rewrite. So probe B was re-run with a content manifest on both sides: `find supabase -type f -exec sha256sum {} \; | sort` before the install and after, then `diff`:

```
manifest entries before: 126
=== manifest diff (adds, deletes, content changes) ===
IDENTICAL
```

126 files, byte-identical set, before and after a full fresh install on the target architecture. (A `git status` equivalent is unavailable inside the container — `git archive` carries no `.git` — which is why the manifest diff replaces it rather than being described as "the same two checks".)

**And a before/after manifest is still only END STATE.** It cannot see a transient create-then-delete, a mode-only change, or a symlink or directory touch — and the premise being established is safe CONCURRENT access, where a transient write is exactly the thing that would collide. So probe B was run a third time with the whole directory under a live watch: `inotifywait -m -r -e create,delete,modify,move,attrib,close_write supabase` started before `pnpm install --frozen-lockfile` and killed after it.

```
=== inotify watch established? ===
1
=== filesystem events under supabase/ during the install ===
0
(end-events)
```

Watch established (so the zero is not a watch that never started), and **zero filesystem events of any kind under `supabase/` for the entire duration of a fresh install** — creates, deletes, modifies, moves, attribute changes and closed writes all included, recursively, directories and symlinks included. That is the observation the disjointness premise rests on: not "the end state matched", but "nothing happened there at all".

**One thing probe B surfaced that probe A could not:** on Linux, a FIFTH build-script candidate exists — `@parcel/watcher` version 2.6.0, a platform-conditional optional dependency absent from the macOS resolution — and pnpm **ignored** it, because it is not in `allowBuilds`. That is the allow-list working as designed: the concurrent install's executable surface is exactly the four enabled entries, on either platform. It also means `allowBuilds` is an ALLOW-list of what may run, not an inventory of what pnpm would otherwise want to run; §5h pins the former, which is the set that matters here.

### 3.3 Disjointness in the other direction

The premise also requires the BOOTSTRAP not to touch the install's surface. Audited against `scripts/ci/supabase-local-bootstrap.sh`:

- It invokes **no `node`, `npm`, `npx`, or `pnpm`** — grep for those four tokens over the whole script returns nothing. No repo-local Node tooling is invoked, so nothing in the script resolves `node_modules/`, which is the install's principal write target. (Two earlier drafts tried to enumerate the script's complete command vocabulary instead; both enumerations were wrong — one listed `mkdir`, which the script never calls, and the next omitted `set`, `trap`, `[` and `true`. The enumeration was never what the claim needed: what matters is the ABSENCE of the four Node-toolchain tokens, which is a grep, not a census.)
- Its held-aside stash is `STASH_DIR="$(mktemp -d)"` (`scripts/ci/supabase-local-bootstrap.sh:49`), outside the repo entirely. The migrations it moves and restores live under `supabase/migrations/` (`scripts/ci/supabase-local-bootstrap.sh:50-66`), which §3.2 just showed the install never touches.

**What this does and does not prove.** Token absence bounds what the SCRIPT reads; it says nothing about what the three vendored binaries it drives read. `supabase`, `docker` and `psql` are standalone executables with no knowledge of this repository's `node_modules/`, so the residual risk is theoretical rather than argued away — and it is also the one thing the §7 accept gate directly observes: if the boot depended in any way on a complete `node_modules/`, overlapping it with the install that produces `node_modules/` would fail, loudly, on some fraction of the eight legs. Eight green legs is the observation; this section is the reason to expect it.

### 3.4 What the guard can still prove, and what it cannot

The §3.2 probe is a point-in-time observation; it cannot bind the future. The durable guard (§5h) is unchanged in KIND from 2026-07-20 §4h — pin the root lifecycle keys and pin the `allowBuilds` set — but is corrected to the real five-key inventory. Its job is to force a human re-run of §3.2 when either set changes, which is the realistic way this premise rots. It still does not, and cannot, prove where an already-allow-listed dependency writes.

## 4. Implementation — item 1

`.github/workflows/unit-suite.yml`, job `unit-suite-db` only. `- uses: ./.github/actions/setup` is replaced by the composite's two non-install actions inlined, followed by the combined step:

```yaml
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.107.0
      - name: Install psql (local-DB tests + bootstrap shell out to psql)
        run: command -v psql >/dev/null || (sudo apt-get update && sudo apt-get install -y postgresql-client)
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Boot local Supabase and install dependencies concurrently
        run: |
          set -euo pipefail
          bash scripts/ci/supabase-local-bootstrap.sh &
          boot_pid=$!
          pnpm install --frozen-lockfile
          wait "$boot_pid"
      - name: Refuse node-killing pnpm settings (composite, pre-node, defaults-immune)
        uses: ./.github/actions/assert-pnpm-sources
      - name: Run serial project, shard ${{ matrix.shard }}/8
        ...
```

The step body is the canonical five lines of 2026-07-20 §3, unmodified. `setup-cli` and the psql guard move ABOVE the combined step because the bootstrap needs both on PATH, and they sit ahead of the pnpm/node pair because that is the order 2026-07-20 §4a ratified; `assert-pnpm-sources` and vitest keep their positions after it.

### 4.1 Constraints the rewrite must not break (swept, not assumed)

Existing guards over this file, each verified against the planned diff:

| Guard | Constraint | Planned diff |
| --- | --- | --- |
| `tests/cross-cutting/ci-workflow-speedup.test.ts:130` | every line containing `sudo apt-get` + `postgresql-client` must also contain `command -v psql` **on that same line** | psql step is moved verbatim, still one line — never reformatted into a multi-line `run: \|` |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:152-166` | `./.github/actions/assert-pnpm-sources` must remain a step in `unit-suite-db`, precede the vitest step, and carry exactly the keys `name` + `uses` | kept verbatim including its `name:`, still immediately before vitest |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:313` | zero `\|\| true` anywhere in `unit-suite.yml` | the combined step has none; this is also §5c |
| `scripts/ci/assert-pnpm-sources-clean.sh:67-73` (runs live in this job) | refuses `node[_-]?options`, a `defaults:` key, `\x`/`\u`/`\U` escapes, and non-ASCII outside `#` comment lines | the combined step's body and its comments are plain ASCII |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:183-198` | the no-Supabase guard and the exactly-three-`uses:` count are scoped to `unit-suite-nodb` | `unit-suite-nodb` is untouched; the db job's `uses:` count is unconstrained |
| `tests/cross-cutting/vitest-projects-partition.test.ts:372-388` | reads `unit-suite.yml` directly; pins `VITEST_EXCLUDE_ENV_BOUND` present and `vitest run --exclude` absent | the vitest step and its `env:` are untouched |
| `tests/cross-cutting/ci-workflow-speedup.test.ts:24-52` | `unit-suite.yml` is in the dynamically-discovered PR-firing set; pins its `concurrency` shape | `on:` and `concurrency:` are untouched |
| `tests/cross-cutting/unit-suite-shard-topology.test.ts:131-141` | the vitest step's keys are exactly `env`/`name`/`run`, and no `defaults:` exists at workflow or job scope | no `defaults:` is added; the vitest step is untouched |

**Log interleaving, stated rather than glossed.** Both processes inherit the step's stdout, so nothing is buffered and nothing is lost — but the two output streams now INTERLEAVE within one step's log, where today they are two clean consecutive step logs. 2026-07-20 §3's "output streams exactly as it does now" is true about liveness and false about ordering. This is accepted: the install is ~16s of mostly-quiet progress lines against a ~70s boot, both are line-oriented, and §7.1 gates on green legs plus the boot log being PRESENT, not on it being contiguous. Anyone reading a failed leg's log should expect the two woven together.

**Why inline rather than a nested composite.** 2026-07-20 §3 states the composite cannot simply be dropped, since `pnpm/action-setup@v4` and `actions/setup-node@v4` (with `cache: pnpm`) are prerequisites of the install, and prescribes pinning them ahead of the combined step (§4d). Splitting the composite into a toolchain-only child action would preserve D12's single-version-source property more elegantly, but it changes a composite that **31 job steps across 17 workflows** consume (`grep -rc 'uses: ./.github/actions/setup$' .github/workflows/`, measured 2026-08-02 — the composite's own header comment still says "~20 jobs across 8 workflows" and is stale) — a blast radius disproportionate to this change. Inlining plus a meta-test that derives its expectations FROM the composite's own YAML (§5d) buys the same anti-drift guarantee with a two-line diff outside `unit-suite.yml`. Recorded here so it is not re-litigated as an oversight.

## 5. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/unit-suite-shard-topology.test.ts`. CREATES no new file. Lettering follows 2026-07-20 §4 so the two documents can be read side by side; every item is scoped to `unit-suite-db`.

(a) **Step ordering**, by index comparison within `unit-suite-db`, and it is the RATIFIED order from 2026-07-20 §4a verbatim — `checkout` < `supabase/setup-cli` < psql guard < `pnpm/action-setup` < `setup-node` < combined step < `assert-pnpm-sources` < vitest. An earlier draft of this spec put the pnpm/node pair first; that is functionally equivalent (every one of them is serial and complete before the combined step, and `supabase/setup-cli` is a JS action running on the runner's built-in node, not on `setup-node`'s) but it CONTRADICTED a ratified ordering while this document claims not to reopen the design. The authority's order is adopted rather than argued with.

(b) **The combined step's shape** — the whole contract: its `run:` body contains the bootstrap invocation suffixed with `&`, captures the PID, runs `pnpm install --frozen-lockfile` in the foreground, and ends with `wait` on that captured PID, under `set -euo pipefail`.

(c) **Fail-closed, at BOTH levels.** Body level: the `wait` is the step's last command and carries no `|| true`, no `set +e`, no `trap`, and no trailing `exit 0`. Step level: the combined step's key set is exactly `["name", "run"]`. Body equality alone does not pin fail-closed behaviour — an expression-valued `continue-on-error`, a `shell:` override that re-points or appends to the command, an `if:` that skips the step, or a `working-directory:` all mask or redirect a byte-identical body. This is the same qualification the file already applies to the vitest step and to the `assert-pnpm-sources` guard (`tests/cross-cutting/unit-suite-shard-topology.test.ts:131-141`, `tests/cross-cutting/unit-suite-shard-topology.test.ts:164-166`), applied to the one step whose failure semantics this change is about.

(d) **Prerequisites preserved, derived from the composite rather than hardcoded.** Parse `.github/actions/setup/action.yml` and partition its steps:

  - every `uses:` step must appear in `unit-suite-db` before the combined step with identical `uses`, identical `with`, and an identical full key set (so `node-version: 20` or `cache: pnpm` cannot silently drop, and so an added `env:`/`if:` on the composite's copy is not silently unmirrored);
  - the composite must contain **exactly one** `run:` step, and its command must equal the install line inside the combined step's body. This is the part a naive "mirror the non-install steps" matcher gets wrong: if someone adds a SECOND `run:` prerequisite to the composite, a matcher keyed on `uses`/`with` matches nothing and passes vacuously. Requiring the composite's run-step count to be exactly one turns that into a loud failure, and pinning the command equal to the inlined one keeps the two install invocations from diverging.

  A change to the composite that this job does not mirror fails the test, which is the anti-drift property inlining would otherwise lose. Stated honestly: this is anti-drift for the composite's STEP SHAPE and its install command, not for everything the composite could ever grow (an added step-level `env` on the install step, for instance, is caught by the key-set comparison only for `uses:` steps). The residual is bounded and named rather than claimed away.

(e) **Install runs exactly once** in `unit-suite-db`: `pnpm install` appears once in the job, and `./.github/actions/setup` is not also invoked there (a double install would erase the saving and could race itself).

(f) **Bootstrap invoked exactly once**, still as `bash scripts/ci/supabase-local-bootstrap.sh` (shared-script contract, already pinned at `unit-suite-shard-topology.test.ts:176`).

(g) **Step body pinned by EQUALITY, not by a forbidden-substring list.** 2026-07-20 rounds 5–7 showed a denylist cannot close the class: `pnpm install ... || kill "$boot_pid"` contains neither `trap` nor `|| true`, yet masks the install failure whenever the final `wait` succeeds. The guard asserts the `run:` body, with comments and leading whitespace stripped, EQUALS the canonical five lines. Any cleanup re-introduction, conditional wrapper, or reordering fails the equality.

(h) **Install write-surface guard, corrected inventory.** Three pins, all with failure messages naming §3.2 as the audit to re-run:

  - **Root lifecycle keys.** `package.json` declares no install-lifecycle script beyond `prepare`. The forbidden set is the one `pnpm install` actually executes, which is NOT the same as `pnpm rebuild`'s: `preinstall`, `install`, `postinstall`, `preprepare`, `postprepare`, `prepublish`, `prepublishOnly`. (`preprepare`/`postprepare` run on install and NOT on rebuild — omitting them would leave an executable hole the guard reported green on. See §3.2's stated delta.) Plus: `scripts.prepare === "simple-git-hooks"` and `pkg["simple-git-hooks"]` equals `{"pre-commit": "pnpm exec lint-staged"}`.
  - **The `allowBuilds` map**, equal to the audited five-key inventory of §3.1 **including each boolean** — `simple-git-hooks: false` flipping to `true` is a new executing build script and must fail.
  - **The audited VERSIONS of the four enabled build packages**, read from `pnpm-lock.yaml`. The versions are the SUFFIXES of the `packages:` map keys, not their values — the Sentry CLI key at `pnpm-lock.yaml:1625`, and the corresponding keys at `pnpm-lock.yaml:2692`, `pnpm-lock.yaml:4220` and `pnpm-lock.yaml:4597`, giving 2.58.5, 0.28.0, 0.34.5 and 1.11.1. The assertion is on the COMPLETE set of keys whose package name matches each of the four, compared with `toEqual` against a one-element expected set — not on a first match. `allowBuilds` is keyed by NAME, so if a future lockfile carries two versions of an allow-listed package, BOTH versions' install scripts are permitted to run; a first-match check would stay green over the unaudited second one. Without this, a routine lockfile bump replaces an allow-listed package's install script wholesale while the five-key map is untouched, and the guard stays green over code nobody audited — the most ROUTINE way this premise rots, more likely than a new key. Pinning versions makes a bump of one of these four fail with an instruction to re-run §3.2 and update the literal. That friction is the point, and it is bounded to four packages; this is the same structural-pin posture the repo already uses for `MEASURED_HEAVY` in the shard-balance test.

(i) **Unchanged and must stay green:** the 8/3-leg matrix + `--shard` denominator pins, the `unit-suite-nodb`-boots-nothing guard, the no-`continue-on-error` guard, the aggregator name/`needs`/`if: always()` pins, and `tests/cross-cutting/ci-workflow-speedup.test.ts` (notably its guarded-psql-install assertion, which the moved psql step must still satisfy).

No executable behavioral harness is specified for item 1. That is the deliberate consequence of the §3 simplification, not a gap: correctness lives in `wait` and `set -e`, which are shell semantics, and the real proof is the §7 accept gate — all 8 db legs green means both the boot and the install succeeded and were joined.

## 6. Item 2 — de-flake T-REGROW's armed measurement

### 6.1 The defect

`tests/e2e/admin-lifecycle-layout.spec.ts`, test `T-REGROW: re-places when the popover's own content grows`. After clicking `archive-show-button` and waiting for `archive-show-confirm-button` to be visible, the test sleeps a fixed 300ms and then measures:

```ts
await popover.getByTestId("archive-show-button").click();
await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();
await page.waitForTimeout(300);
const armed = await measure();
```

Confirm-button visibility is not the settle signal the assertions need. The invariant under test is that placement RE-RAN after the body grew, and the re-placement is an async effect downstream of the growth. When 300ms is not enough on a loaded runner, the measurement reads the pre-re-placement state: the body has grown but the stale "bottom, no cap" placement is still applied, so the clip-rect assertion fails first. That is exactly the observed CI failure on PR #604 (`lifecycle-layout-e2e`, `mobile-safari`, 24 passed / 1 failed, re-run of the identical tree green).

The same fixed-wait shape appears twice in this one test — the ladder sweep uses `waitForTimeout(250)` before its own armed measurement, where an early read makes the sweep either pick the wrong rung or find none and fail on `chosen` being null. Per the project's class-sweep rule, both are fixed, not just the one the backlog names.

### 6.2 The fix

Wrap each armed measurement in `expect(async () => { ... }).toPass({ ... })`, the template already used in this file (`openHub`'s kebab-click retry). The retried block re-measures each attempt; `measure()` is idempotent by construction (it saves and restores `body.style.maxHeight` around its natural-height read), so retrying is safe.

**Real run.** The retried block measures and asserts the two clip-rect invariants and the `replaced` predicate together, so a transient pre-re-placement state retries instead of failing. A regression in which placement never re-runs still fails — the block never passes and `toPass` times out, reporting the same assertion text it does today.

**Ladder sweep.** The sweep is not asserting an invariant, it is probing for a viewport. Its block retries until GROWTH is observed — `armed.natural > idle.natural`, both numbers read from the page — and only then evaluates the window predicate. Growth is the right settle condition there because the rung's decision depends on the armed natural height, not on where placement put it. A rung where growth never appears fails its own `toPass` rather than silently selecting a wrong height.

### 6.3 Anti-tautology note

Folding the clip-rect assertions into the `toPass` weakens nothing that the fixed wait provided: today a slow re-placement fails a real invariant for a timing reason (a false red), and a broken re-placement fails the same invariant. After the change the first case passes on retry and the second still fails, at the timeout. The `replaced` predicate stays inside the block precisely so "placement never re-ran" remains a failure rather than becoming a silently-satisfied wait condition.

Timeouts: `toPass({ timeout: 15_000 })`, matching `openHub`'s existing retry budget in the same file. The test already calls `test.setTimeout(240_000)`.

## 7. Accept criteria

### 7.1 The metric, defined executably

2026-07-20 §5.2 says to "measure with P1's `measure()`". That helper is not a repo artifact — it was an ad-hoc shell function in the P1 session and does not exist under `scripts/`. Since a metric that cannot be re-run is not an accept gate, it is defined here instead, as a command against the GitHub API:

```bash
# LEG FIXED OVERHEAD for one run: per unit-suite-db leg,
#   (job wall clock) - (duration of the "Run serial project" step)
gh api --paginate "/repos/edweiss412/FX-Webpage-Template/actions/runs/<RUN_ID>/jobs" \
  --jq '.jobs[] | select(.name | startswith("unit-suite-db"))
        | { leg: .name,
            wall: (( (.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601) )),
            vitest: ( .steps[] | select(.name | startswith("Run serial project"))
                      | ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601)) ) }
        | .wall - .vitest'
```

Wrapped so the arithmetic is not left to the operator either — it must emit exactly eight legs or fail, and it computes the median itself:

```bash
legfix () {  # usage: legfix <RUN_ID>  -> prints "<n legs> <median seconds>"
  gh api --paginate "/repos/edweiss412/FX-Webpage-Template/actions/runs/$1/jobs" \
    --jq '.jobs[] | select(.name | startswith("unit-suite-db"))
          | ( ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601))
              - ( .steps[] | select(.name | startswith("Run serial project"))
                  | ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601)) ) )' \
  | sort -n | awk '{ a[NR] = $1; printf "leg %d fixed-overhead: %s\n", NR, $1 > "/dev/stderr" }
                   END{ n = NR
                        if (n == 0) { print "FAIL: no unit-suite-db legs reported" > "/dev/stderr"; exit 1 }
                        printf "legs=%d median=%s max-fixed-overhead=%s\n",
                               n, (n % 2 ? a[(n+1)/2] : (a[n/2] + a[n/2+1]) / 2), a[n]
                        if (n != 8) {
                          print "FAIL: " n " legs, expected 8 — the figures above are NOT the accept figure" > "/dev/stderr"
                          exit 1 } }'
}

# MAX LEG is a different quantity from max fixed overhead — 2026-07-20 §2 records
# 91s fixed overhead against a 245s max leg on the same run, and §5.4 requires the
# LATTER in the PR body. It is total job wall clock, so it does not subtract vitest:
legwall () {  # usage: legwall <RUN_ID>  -> prints the max unit-suite-db leg wall clock
  gh api --paginate "/repos/edweiss412/FX-Webpage-Template/actions/runs/$1/jobs" \
    --jq '.jobs[] | select(.name | startswith("unit-suite-db"))
          | ((.completed_at|fromdateiso8601) - (.started_at|fromdateiso8601))' \
  | sort -n | tail -1
}
```

**Validated, not just written down.** Run against the most recent all-green `push` run of `unit-suite` on `main` as of 2026-08-02:

```
$ legfix 30783618781
leg 1 fixed-overhead: 89
leg 2 fixed-overhead: 91
leg 3 fixed-overhead: 92
leg 4 fixed-overhead: 94
leg 5 fixed-overhead: 98
leg 6 fixed-overhead: 101
leg 7 fixed-overhead: 109
leg 8 fixed-overhead: 112
legs=8 median=96 max-fixed-overhead=112
$ legwall 30783618781
255
```

Eight legs, leg-median fixed overhead **96s**, max leg **255s** — the median is close to the 101s the 2026-07-20 spec measured on the pre-split topology, and the max leg to its 245s, which together are the sanity check that both metrics survived the job split. The accept threshold applied to the median is ≤88s. Note the two max figures are different quantities and both appear above deliberately: 112s is the worst leg's fixed overhead, 255s is the worst leg's total wall clock, and the PR body wants the latter.

**Baseline selection is a rule, not a choice** (an operator picking among noisy `main` runs could turn a revert into an accept): the baseline is the **most recent `push`-event `unit-suite` run on `main` whose head commit is at or before this PR's merge-base and in which every `unit-suite-db` leg concluded `success`**. If that run is unusable (fewer than 8 legs reported, or a leg re-run so its timings are not comparable), step to the next most recent run satisfying the same predicate and say in the PR body which run was skipped and why. Both run IDs, both leg counts, both medians and both MAX LEGS (`legwall`) go in the PR body. And whichever way the decision goes, the commit that records it is a NEW head commit that the measured run did not cover — so it is pushed and gets its own green CI run before merge. The measurement validates the overlap; it does not validate the tree that records the measurement.

**Item 1 (real CI, per 2026-07-20 §5, restated against the current topology):**

1. All 8 `unit-suite-db` legs, all 3 `unit-suite-nodb` legs, and the `unit-suite` aggregator green; the boot log present in each db leg's job output (backgrounding must not hide it).
2. Comparison metric is **leg-median fixed overhead** for `unit-suite-db` — `(job wall) − (vitest step)` — not max leg, whose noise is dominated by test distribution. The baseline is computed the SAME way from a `main` run of the CURRENT topology, not from the stale 2026-07-20 §2 table.
3. **Accept** if median fixed overhead drops by **≥8s** versus that baseline AND every leg is green. **Revert item 1** otherwise. The 8s floor is half the theoretical 16s: it demands a real effect while tolerating contention, and is far enough from zero that runner noise cannot manufacture it. A one-second difference is not a gain.
4. Record both the median fixed overhead and the max leg in the PR body either way, so a revert is as legible as an accept.

**Item 2:** `lifecycle-layout-e2e` green on the PR, and the modified test observed green locally. Item 2's value is the removal of a timing-dependent read; a single green run is not proof of a flake's absence and is not claimed as such.

The two items are independently revertible, and the file sets do not intersect:

| Item | Files |
| --- | --- |
| 1 | `.github/workflows/unit-suite.yml` and the new `describe` block in `tests/cross-cutting/unit-suite-shard-topology.test.ts` |
| 2 | `tests/e2e/admin-lifecycle-layout.spec.ts` and its settle-contract guard (a new file under `tests/cross-cutting/`) |

**Reverting item 1 means reverting BOTH of its files, together.** The meta-test block pins the combined step's existence and shape, so reverting only the workflow leaves the suite red — the revert is one operation over the pair, not a workflow rollback. Item 2 is unaffected by an item-1 revert and stays.

## 8. Out of scope

- Everything in §1.1.
- The ~60 app-dependent dark e2e specs of `BL-E2E-LIFECYCLE-SPECS-CI-DARK`.
- The T-CONFIRM-SCROLL case, whose `scrollIntoView` assertion at `tests/e2e/admin-lifecycle-layout.spec.ts:411` the PR #604 run also failed. **It carries the same defect shape** — a fixed `waitForTimeout(250)` at `tests/e2e/admin-lifecycle-layout.spec.ts:378`, immediately before the geometry and call-record reads. It is excluded on SCOPE, not because the shape is absent, and the class sweep required by this project's discipline is discharged by enumerating the residue rather than by silently stopping: the file's three remaining fixed waits are anchored by ENCLOSING TEST, not by line, because §6's edits insert lines above two of them and any line anchor here goes stale the moment this branch lands: one in the `390x560: arming scrolls the popover's OWN scroller to the confirm` case (T-CONFIRM-SCROLL, opening at `tests/e2e/admin-lifecycle-layout.spec.ts:328`), one in the `T-FIT/T-REACH @ 390x{height}` case (opening at `tests/e2e/admin-lifecycle-layout.spec.ts:819`), and one in the `T-TRANSITION` case (opening at `tests/e2e/admin-lifecycle-layout.spec.ts:969`). Each needs its own settle condition — T-CONFIRM-SCROLL's is "the production `scrollIntoView` call has been recorded on `window.__siv`", which is a different predicate from T-REGROW's growth-then-replace and carries its own risk of being converted into a tautology. §6's change is the one the backlog names and the one whose settle condition is established. The residue is filed as `BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE` in `BACKLOG.md`, so it is tracked rather than forgotten.
- Promoting any e2e job into branch protection's required-context set (an owner GitHub-settings action, `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT`).
- The next wall-clock lever, a pre-baked Postgres image removing the ~14s schema+migration phase.

## 9. Numeric self-consistency register

Theoretical upper-bound saving 16s (the install step's measured duration, 2026-07-20 §2); accept threshold ≥8s median fixed-overhead reduction (§7.3), deliberately half of it; measured main baseline over 8 legs on run 30783618781 (§7.1): leg-median fixed overhead 96s, worst-leg fixed overhead 112s, max leg wall clock 255s — so the accept figure against that baseline is a median ≤88s; `unit-suite-db` 8 legs, `unit-suite-nodb` 3 legs (§2); `allowBuilds` five keys, four enabled (§3.1); five lifecycle scripts executed by each of the two §3.2 probes, zero writes under `supabase/` in both; audited build-package versions `@sentry/cli` 2.58.5, `esbuild` 0.28.0, `sharp` 0.34.5, `unrs-resolver` 1.11.1 (§3.1, pinned by §5h); one Linux-only ignored build candidate, `@parcel/watcher` 2.6.0 (§3.2); the setup composite consumed by 31 job steps across 17 workflows (§4); `toPass` timeout 15_000 ms in both item-2 blocks (§6.2), matching `openHub`; test-level timeout 240_000 ms, unchanged; install-failure report delay ~70s typical, hard-bounded only by `timeout-minutes: 20` (§1.1).
