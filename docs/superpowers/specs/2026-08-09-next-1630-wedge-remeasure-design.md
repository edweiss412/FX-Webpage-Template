# Next 16.3.0 bump + Published-toggle wedge re-measurement

**Date:** 2026-08-09 · **Ledger entry:** `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` (BACKLOG.md, "a fast server action can leave the Published toggle stuck pending on WebKit") · **Branch:** `chore/next-1630-wedge-remeasure`

## §1.1 Resolved scope — do not relitigate

- **Bump + measure over watchdog.** User-ratified 2026-08-09 (this session's AskUserQuestion): upgrade `next` and re-measure the wedge rate BEFORE any product-code mitigation. The client-side watchdog (`Promise.race` in `PublishedToggle.formAction`) is explicitly NOT in this branch's scope under any outcome; if measurement shows the wedge persists, the watchdog is a separate future decision. Do not propose adding it here.
- **`next`-only bump.** `@next/env` (16.2.4), `@next/mdx` (^16.2.6), `eslint-config-next` (16.2.4) stay put. The repo already runs version-mixed `@next/*` pins against `next` 16.2.10 (root `package.json` dependency block — grep `"@next/env"`, `"@next/mdx"`, `"eslint-config-next"`), so alignment is not a correctness requirement; adding it widens the diff for zero measured benefit (YAGNI). Do not propose aligning them.
- **Merge-even-if-still-wedging.** User-approved design 2026-08-09: if measurement shows the wedge persists, the bump still merges provided all CI suites are green — staying current on the framework has independent value. The measurement outcome decides the LEDGER disposition, not the merge.
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

1. Land the bump commit on the branch; push. Normal PR CI runs (`pull_request` trigger on every suite, including `lifecycle-layout-e2e.yml`) must be green — that is the bump's regression net.
2. Dispatch the measurement loop on the branch: `gh workflow run lifecycle-layout-e2e.yml --ref chore/next-1630-wedge-remeasure -f transitions_repeats=10`. The dispatch arm runs `-g "Published toggle round-trip" --repeat-each=10 --retries=0 --trace=on` (workflow:129-134).
3. Run the dispatch **twice** (20 samples total). Two runs of 10 rather than one of 20: the job also carries the full layout spec each dispatch and has `timeout-minutes: 35` (workflow:34) — 20 repeats plus setup risks the ceiling.
4. **Wedge count = number of `[wedge-recovery]` lines with `tier=nudge` or `tier=reload` landings or escalations** in the two runs' logs (`expectFlipLanded` logs every non-plain tier, tests/e2e/admin-lifecycle-transitions.spec.ts:181-188). A run's log is read with `gh run view --log`; the trace artifacts are retained 7 days (workflow:135-146) if a sample needs inspection.

### §4.1 Decision rule (stated before measuring)

- **0 wedges in 20 samples → upstream fix confirmed.** Against the 7/10 baseline, Fisher exact one-sided p ≈ 5.9×10⁻⁵ (0/20 vs 7/10). The entry closes (§5 outcome A).
- **≥1 wedge in 20 samples → upstream NOT fixed.** A single occurrence proves the replay-loss class survives the newer canary; a lower rate is not a fix. Entry stays open (§5 outcome B). No second-guessing loop, no "ambiguous" branch.

## §5 Outcome dispositions

**A — 0/20, fix confirmed.**
- Archive `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` to BACKLOG-archive.md with probe evidence: both dispatch run URLs, both vendored canary hashes (`3f0b9e61-20260317` wedged 7/10; `cbb046ab-20260731` wedged 0/20), and the decision rule above. The archive notes the e2e recovery tiers remain in `expectFlipLanded` deliberately (self-documenting; zero cost on the healthy path) and names the un-archive trigger: any future `[wedge-recovery]` non-plain line in `lifecycle-layout-e2e` output reopens the question against whatever canary is then vendored.
- The IN PROGRESS marker comes off in the same commit that archives (invariant 12 — archives reject in-flight entries; the marker never reaches main).

**B — ≥1/20, not fixed.**
- Entry stays in BACKLOG.md: status returns to OPEN + PARKED-WATCH, marker off in the PR's last commit, and a dated stamp line records the new measurement (canary `cbb046ab-20260731`, N/20 wedged, run URLs). The stamp updates the entry's "no patch-bump fix exists today" sentence to name 16.3.0 as measured-insufficient.
- The bump still merges if all suites are green (§1.1). The watchdog remains a separate future decision — not this branch.

## §6 Risks

- **Minor-version framework bump.** The net is the full CI matrix on the PR (`pull_request` triggers across unit-suite, x-audits, all e2e workflows). No hand-audit of the 16.2→16.3 changelog substitutes for green suites; green suites are the acceptance.
- **Screenshot byte baselines.** `screenshots-drift.yml` gates committed WebP bytes captured under a pinned Docker image; a Next bump can shift rendered bytes. If the drift gate trips, regenerate via the `screenshots-regen.yml` workflow (pinned image, per the byte-comparison discipline in AGENTS.md) on this branch — never from a dev machine — and commit the regenerated baselines in the same PR.
- **Measurement is a CI-WebKit proxy.** See documented limits (§8).

## §7 Acceptance criteria

- AC-1: `package.json` names `next` `16.3.0`; lockfile consistent (`pnpm install --frozen-lockfile` succeeds in CI).
- AC-2: All PR-triggered CI suites green on the branch head that merges.
- AC-3: Two `lifecycle-layout-e2e` dispatch runs with `transitions_repeats=10` completed on the branch, run URLs recorded in the PR body, wedge count stated per the §4.1 rule.
- AC-4: Ledger disposition matches the measured outcome per §5 (A xor B), and the IN PROGRESS marker is absent from the merge commit.
- AC-5: No file outside `package.json`, `pnpm-lock.yaml`, `BACKLOG.md`, `BACKLOG-archive.md`, `docs/superpowers/**`, `docs/review-rounds/**`, and (only if the drift gate trips) `public/help/screenshots/**` changes on this branch.

## §8 Documented limits

- **The measurement certifies the reproduction environment, not real Safari.** All wedge observations, baseline and post-bump, are Playwright WebKit (`mobile-safari` project) on ubuntu CI runners. A 0/20 result closes the entry because the entry's own evidence base is this same environment — but it is not proof about handheld Safari, which was never reproduced in either direction (entry's own "User-visible shape" paragraph). If a real-user stuck-toggle report ever arrives post-close, the archive's un-archive trigger applies regardless of this measurement.
- **7-day trace retention** (workflow:146): the measurement's raw traces expire; the run logs (wedge-count evidence) persist with the run. The PR body quotes the counts so the evidence outlives the artifacts.
- **20 samples bounds the detectable rate.** 0/20 is consistent (95% CI upper bound) with a true wedge rate up to ~14%. Against a 70% baseline that is a confirmed massive fix, and the decision rule treats any observed wedge as not-fixed — but a rare residual (say 5%) could pass undetected. The un-archive trigger (§5A) is the guard: recovery tiers keep logging in every future CI run, so a residual rate surfaces as `[wedge-recovery]` lines in ordinary PR runs over time.

## 12 Closeout

impeccable-gate: N/A — no UI surface
