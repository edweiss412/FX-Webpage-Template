# Next 16.3.0 bump + Published-toggle wedge re-measurement

**Date:** 2026-08-09 · **Ledger entry:** `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` (BACKLOG.md, "a fast server action can leave the Published toggle stuck pending on WebKit") · **Branch:** `chore/next-1630-wedge-remeasure`

## §1.1 Resolved scope — do not relitigate

- **Bump + measure over watchdog.** User-ratified 2026-08-09 (this session's AskUserQuestion): upgrade `next` and re-measure the wedge rate BEFORE any product-code mitigation. The client-side watchdog (`Promise.race` in `PublishedToggle.formAction`) is explicitly NOT in this branch's scope under any outcome; if measurement shows the wedge persists, the watchdog is a separate future decision. Do not propose adding it here.
- **`next`-only bump.** `@next/env` (16.2.4), `@next/mdx` (^16.2.6), `eslint-config-next` (16.2.4) stay put. The repo already runs version-mixed `@next/*` pins against `next` 16.2.10 (root `package.json` dependency block — grep `"@next/env"`, `"@next/mdx"`, `"eslint-config-next"`), so alignment is not a correctness requirement; adding it widens the diff for zero measured benefit (YAGNI). Do not propose aligning them.
- **Merge-even-if-still-wedging.** User-approved design 2026-08-09: if measurement shows the wedge persists, the bump still merges provided AC-2's CI condition holds — staying current on the framework has independent value. The measurement outcome decides the LEDGER disposition, not the merge.
- **Zero product code.** This branch changes `package.json` + `pnpm-lock.yaml` + docs/ledger only. The e2e wedge-recovery tiers (`tests/e2e/admin-lifecycle-transitions.spec.ts`, `expectFlipLanded`) stay in place under every outcome — they are read-only, self-documenting, and cost nothing on the healthy path.
- **No new CI surface.** The measurement uses the existing `workflow_dispatch` input `transitions_repeats` on `.github/workflows/lifecycle-layout-e2e.yml:16-23` — built for exactly this loop (baseline run 30235889083 used it). No workflow edits.

## §2 Background (measured, cited)

The ledger entry (BACKLOG.md §BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE) records: on Playwright WebKit (`mobile-safari` project) under CI, `setShowPublishedAction` POSTs, the server responds 200 `{ok:true}` in ~230ms with the flipped tree in-body, yet `await setPublished(...)` inside `PublishedToggle.formAction` (components/admin/PublishedToggle.tsx:112-122) never resolves — `useFormStatus().pending` never clears, `router.refresh()` is never reached, and the switch sits `aria-busy="true"` with the stale `aria-checked` indefinitely. React 19 replay-loss class; nearest public report vercel/next.js discussion 88767.

- **Baseline rate:** 7/10 samples wedged (CI measurement loop, run 30235889083, `transitions_repeats=10`).
- **Entry status:** PARKED-WATCH per the l-wave screen 2026-08-06 (`docs/superpowers/specs/2026-08-06-l-wave-design.md` §2.1 table) — "mitigations gated on real-user reports **or a vendored React fix**."
- **At filing (2026-07-26):** vendored React was byte-identical through next 16.2.12 — `19.3.0-canary-3f0b9e61-20260317` — so no bump could help then.

### §2.1 The unpark trigger now exists (probed 2026-08-09)

Probe: downloaded `next@16.3.0` (latest stable, per `npm view next@latest version`) tarball from the registry and extracted the vendored React version string:

```
$ grep -m1 -o '19\.[0-9]*\.[0-9]*-canary-[a-f0-9]*-[0-9]*' <16.3.0-tarball>/package/dist/compiled/react/cjs/react.production.js
19.3.0-canary-cbb046ab-20260731
$ grep -m1 -o '19\.[0-9]*\.[0-9]*-canary-[a-f0-9]*-[0-9]*' node_modules/next/dist/compiled/react/cjs/react.production.js
19.3.0-canary-3f0b9e61-20260317
```

Next 16.3.0 stable vendors a React canary **4.5 months newer** (2026-03-17 → 2026-07-31) than what this repo runs. Whether the replay-loss fix is in that window is unknown and unknowable from changelogs (the class has no confirmed upstream issue number) — which is exactly why the protocol below is a measurement, not an assertion.

Peer-dependency probe (no cascade): `npm view next@16.3.0 peerDependencies` is identical to `next@16.2.10` — `react: '^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0'`. The repo's `react`/`react-dom` 19.2.4 pins (root `package.json` — grep `"react": "19.2.4"`) satisfy it unchanged.

## §3 Change

One dependency edit: in the repo-root `package.json`, `"next": "16.2.10"` → `"next": "16.3.0"`, plus the resulting `pnpm-lock.yaml` update (`pnpm install`). Nothing else.

## §4 Measurement protocol

1. Land the bump commit on the branch; push. The auto-triggered PR suites (the §6 nine) plus the §6 required manual dispatches are the bump's regression net; the merge gate for reds is §6's failure-branch rule.
2. Dispatch the measurement loop on the branch: `gh workflow run lifecycle-layout-e2e.yml --ref chore/next-1630-wedge-remeasure -f transitions_repeats=10`. The dispatch arm runs `-g "Published toggle round-trip" --repeat-each=10 --retries=0 --trace=on` (workflow:129-134).
3. Run the dispatch **twice** (20 samples target). Two runs of 10 rather than one of 20: the job also carries the full layout spec each dispatch and has `timeout-minutes: 35` (workflow:34) — 20 repeats plus setup risks the ceiling.
4. **Counting rule (flip-precise).** One SAMPLE = one executed repeat of the round-trip case; each sample ATTEMPTS up to two flips (`expectFlipLanded` for the OFF flip then the ON flip, tests/e2e/admin-lifecycle-transitions.spec.ts:430 and :474) — a thrown recovery failure ends the sample early, so e.g. a reload-tier OFF-flip failure is a one-flip wedged sample. A **wedged flip** = one `[wedge-recovery] <label>: tier=plain did not land, escalating` line — `expectFlipLanded` emits exactly one such line per flip that fails the plain wait (tests/e2e/admin-lifecycle-transitions.spec.ts:187), so this count can neither double-count a reload-tier wedge nor conflate the two flips. A **wedged sample** = a sample with ≥1 wedged flip. Landed-tier lines (`landed at tier=…`, :182) are recorded as color but are NOT the count. Reports state wedged flips against FLIPS EXECUTED (counted from the logs), not against a fixed 2-per-sample denominator. Logs via `gh run view --log`; trace artifacts retained 7 days (workflow:135-146).
5. **Run and sample validity.** A dispatch run is a VALID measurement run iff the transitions measurement step executed its repeats (the job can die earlier: the layout-spec step precedes it, workflow:109-110, and the job has a 35-minute ceiling, workflow:34). An invalid run (setup failure, layout-step failure, timeout before/inside the measurement step) is DISCARDED — noted with its run URL in the PR body — and replaced by a fresh dispatch. Within a valid run, a VALID sample = a repeat that either passed, or failed while showing ≥1 `[wedge-recovery]` line (a repeat failing at the reload tier already emitted its plain-escalation line and counts as a wedged sample). A repeat that failed with NO `[wedge-recovery]` line is INDETERMINATE — it may have failed before the flips or after them (the case carries post-republish assertions downstream of both flips, tests/e2e/admin-lifecycle-transitions.spec.ts:483-491), and the log cannot cheaply distinguish the two — so it is EXCLUDED and noted in the PR body. Exclusion is safe by construction: a wedged sample always carries its plain-escalation line, so exclusion can only ever remove unwedged-or-indeterminate samples — it costs a replacement run, it can never manufacture a false "fixed". Dispatch additional runs until ≥20 valid samples exist; the decision rule reads exactly the first 20 valid samples in dispatch order.

### §4.1 Decision rule (stated before measuring)

- **0 wedged samples in 20 valid samples (equivalently: 0 wedged flips across their executed flips) → upstream fix confirmed.** Against the 7/10 baseline, Fisher exact one-sided p ≈ 5.9×10⁻⁵ (0/20 vs 7/10, sample-grained). The entry closes (§5 outcome A).
- **≥1 wedged sample in the 20 → upstream NOT fixed.** A single occurrence proves the replay-loss class survives the newer canary; a lower rate is not a fix. Entry stays open (§5 outcome B). No second-guessing loop, no "ambiguous" branch.

## §5 Outcome dispositions

**A — 0/20, fix confirmed.** One commit containing ALL of:
- Move the entry from BACKLOG.md to BACKLOG-archive.md with probe evidence: all valid dispatch run URLs, both vendored canary hashes (`3f0b9e61-20260317` wedged 7/10; `cbb046ab-20260731` wedged 0/20 samples, 0 wedged flips across all executed flips), and the §4.1 decision rule. The archived body preserves the entry's two watch signals verbatim and notes the e2e recovery tiers remain in `expectFlipLanded` deliberately (self-documenting; zero cost on the healthy path).
- Add the graduation registry row `{ id: "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE", provenance: "chore/next-1630-wedge-remeasure" }` to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (the registry for post-guard graduations; its checks require the archived section to contain the provenance string). `pnpm vitest run tests/docs/` green is part of the commit's acceptance.
- The IN PROGRESS marker comes off in this same commit (invariant 12 — archives reject in-flight entries; the marker never reaches main).

**Un-archive contract (outcome A).** Two triggers, matching the entry's own watch signals: (a) any future `[wedge-recovery]` line — ANY tier, including the plain-escalation line, which is the canonical wedge marker (§4 item 4) and can be the only line a wedged sample emits if recovery itself throws — in `lifecycle-layout-e2e` output; (b) an admin report of a stuck Published switch. On either trigger, the entry moves back to BACKLOG.md with `**Status:** OPEN` (park posture re-evaluated then, against whatever canary is then vendored), and its `BACKLOG_GRADUATED` registry row is removed in the same commit.

**B — ≥1/20, not fixed.**
- Entry stays in BACKLOG.md: status returns to OPEN + PARKED-WATCH, marker off in the PR's last commit, and a dated stamp line records the new measurement (canary `cbb046ab-20260731`, N wedged samples / M wedged flips of 20 valid samples, run URLs). The stamp updates the entry's "no patch-bump fix exists today" sentence to name 16.3.0 as measured-insufficient.
- The bump still merges if AC-2's CI condition holds (§1.1). The watchdog remains a separate future decision — not this branch.

## §6 Risks

- **Minor-version framework bump — the PR trigger matrix is NOT the full suite set (probed 2026-08-09).** Auto-running on a `package.json` + `pnpm-lock.yaml` diff, nine suites: six unfiltered `pull_request` workflows (`lifecycle-layout-e2e.yml`, `quality.yml`, `section-header-visual.yml`, `standalone-e2e.yml`, `unit-suite.yml`, `x-audits.yml`), `crew-e2e.yml` (filtered by a docs-only `paths-ignore` that does not exclude the dependency files, so this diff triggers it), and the two path-filtered workflows whose `paths` lists include the dependency files (`phantom-gap-e2e.yml`, `step3-live-bundle.yml`). **Dark on this diff**, six suites: `admin-layout-e2e.yml`, `help-affordances.yml`, `published-modal-e2e.yml`, `screenshots-drift.yml`, `mutation-harness.yml` (`paths` filters exclude both dependency files), and `dev-gate-e2e.yml` (no `pull_request` trigger at all). All six have `workflow_dispatch`. The protocol REQUIRES manual dispatch, on the branch, of ALL SIX dark suites before merge.
- **Failure branches for the required dispatches (decision-complete).** Every dispatched dark suite must end green before merge, through exactly these branches: (a) `screenshots-drift.yml` red → the screenshot-regeneration contingency in the next bullet, then re-dispatch to green. (b) Any other dark suite red → dispatch the SAME workflow against `origin/main` (`--ref main`): if it is ALSO red there, the failure pre-exists the bump — record both run URLs in the PR body, file it per normal ledger triage, and it does not block this merge; if it is green on main, the failure is bump-caused — a repair would exceed AC-5's allowlist, so set `blockedOn` in the pipeline marker and escalate to the user (disposition options: fix under a widened scope the user approves, or abandon the bump). No third branch exists; "dispositioned" means exactly (a) or (b).
- **Screenshot byte baselines.** `screenshots-drift.yml` gates committed WebP bytes captured under a pinned Docker image; a Next bump can shift rendered bytes, and the drift gate does NOT auto-run on this diff (previous bullet) — its required manual dispatch is what surfaces drift pre-merge. If the dispatched run fails, regenerate via the `screenshots-regen.yml` workflow (pinned image, per the byte-comparison discipline in AGENTS.md) on this branch — never from a dev machine — and commit the regenerated baselines in the same PR.
- **Measurement is a CI-WebKit proxy.** See documented limits (§8).

## §7 Acceptance criteria

- AC-1: `package.json` names `next` `16.3.0`; lockfile consistent (`pnpm install --frozen-lockfile` succeeds in CI).
- AC-2: All auto-triggered PR checks green on the branch head that merges, AND all six required dark-suite dispatches (§6) green on that head or resolved through exactly a §6 failure branch (pre-existing-on-main, recorded).
- AC-3: Enough valid `lifecycle-layout-e2e` dispatch runs (`transitions_repeats=10`) to yield ≥20 valid samples per §4's validity rule (item 5); all run URLs (valid AND discarded) recorded in the PR body; wedged-sample and wedged-flip counts stated per §4's counting rule (item 4).
- AC-4: Ledger disposition matches the measured outcome per §5 (A xor B), and the IN PROGRESS marker is absent from the merge commit.
- AC-5: No file outside `package.json`, `pnpm-lock.yaml`, `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A's registry row only), `docs/superpowers/**`, `docs/review-rounds/**`, and (only if the dispatched drift run fails) `public/help/screenshots/**` changes on this branch.

## §8 Documented limits

- **The measurement certifies the reproduction environment, not real Safari.** All wedge observations, baseline and post-bump, are Playwright WebKit (`mobile-safari` project) on ubuntu CI runners. A 0/20 result closes the entry because the entry's own evidence base is this same environment — but it is not proof about handheld Safari, which was never reproduced in either direction (entry's own "User-visible shape" paragraph). If a real-user stuck-toggle report ever arrives post-close, the archive's un-archive trigger applies regardless of this measurement.
- **7-day trace retention** (workflow:146): the measurement's raw traces expire; the run logs (wedge-count evidence) persist with the run. The PR body quotes the counts so the evidence outlives the artifacts.
- **20 samples bounds the detectable rate.** 0/20 is consistent with a true per-sample wedge rate up to ≈13.9% (exact one-sided 95% upper confidence bound; the conventional two-sided exact interval's upper endpoint is ≈16.8%). Against a 70% baseline that is a confirmed massive fix, and the decision rule treats any observed wedge as not-fixed — but a rare residual (say 5%) could pass undetected. The un-archive trigger (§5A) is the guard: recovery tiers keep logging in every future CI run, so a residual rate surfaces as `[wedge-recovery]` lines in ordinary PR runs over time.

## 12 Closeout

impeccable-gate: N/A — no UI surface
