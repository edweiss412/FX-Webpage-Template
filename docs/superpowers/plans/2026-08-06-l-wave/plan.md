# L-wave implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/2026-08-06-l-wave-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** execute the ratified L-tier screen — 29 claimed entries (14 dispositions: 1 ship, 5 demotes incl. 1 probe-gated, 4 decompositions, 2 zero-code closures, 1 sentence-class delete, 1 enforce; plus 15 stamp/classification targets incl. 3 executed archives and 1 resize), plus one new filing and the decomposition children — across three themed branches to three merged PRs (after this spec/plan branch merges).

**Architecture:** `docs/l-wave-spec` (this branch: spec + plan + claim handoff) merges first; then `feat/l-wave-docs`, `feat/l-wave-push`, `feat/l-wave-emdash` off `origin/main`, in that order, each TDD per task, cross-model reviewed, CI-green merged.

**Date:** 2026-08-06 · **Spec:** `docs/superpowers/specs/2026-08-06-l-wave-design.md` (+ ratified brief `docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md`) · **Status:** DRAFT (pre-review)

## Global constraints

- Every AGENTS.md plan-wide invariant binds; the ones this wave exercises: 1 (TDD), 6 (conventional commits), 8 (W-EMDASH dual-gate), 11 (worktree-only), 12 (claims). Spec §1.1 lists the 16 do-not-relitigate items.
- Guard premise rule (`tests/_shared/premise.ts`) applies to the one new guard (em-dash copy guard, task E1).
- No em dashes in new user-visible copy (all units — W-EMDASH makes it mechanical).
- The archive RED, stated once and used by every archive task: move the entry body to `BACKLOG-archive.md` WITH its flight marker intact, run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`, observe the named failure (archives categorically reject in-progress entries — proves the guard sees THIS entry); then strip the marker and rerun to GREEN. That failing run is the task's executable RED. Stamp-only and refile tasks use `pnpm vitest run tests/docs/` green as their proof (prose edits have no executable red of their own).

## Pre-draft verification pass (writing-plans rule)

Every file/symbol/command named below was grep-verified in the worktree on 2026-08-06 (spec pre-draft pass + this plan's sweeps; transcripts in the review dispatch). Key probe results the plan RELIES on, recorded so no task re-derives them:

- `lib/messages/catalog.ts` copy strings carry **zero** em dashes today (probed: string-literal scan → 0 hits; the file's 9 U+2014 lines are all comments). The entry's "dozens of catalog rows" claim is stale — a prior copy pass cleaned it (e.g. `SYNC_DELAYED_SEVERE` now reads "…has stalled. Check the dashboard."). Consequence: **no §12.4 lockstep commit is expected in W-EMDASH**; the guard still covers the surface so regression is loud.
- `lib/notify/` copy strings carry exactly **2** em dashes (`lib/notify/templates/realtimeProblem.ts:121`, `lib/notify/templates/autoPublishUndo.ts:127` — both overflow lines of the shape `…and N more — open the dashboard…`); the other raw U+2014 hits are comments. The R1 AST probe additionally seeded ~25 copy-constant/JSX-child sites across 10 component/app files (spec §2.3 item 3) that a props-only scan would have missed.
- `app/help/**/*.mdx`: 20 U+2014 instances across 2 files (`app/help/admin/settings/page.mdx` 9 lines, `app/help/admin/dashboard/page.mdx` 10 lines).
- Unconditional-skip suites (`describe.skip(` / `test.fixme(`): 14 files — the 12 `tests/e2e/` files the entry probed, plus `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` and `tests/time/rightNowTransitions.test.ts` (task L1 classifies these two: wiring-meta-test string mention vs real suite).
- Phrase-family prose sweep (coverage claims): 9 candidate files; the `lib/messages/catalog.ts` / `lib/messages/__generated__/spec-codes.ts` / `tests/messages/popoverContextCopy.test.ts` hits are FALSE POSITIVES ("full audit suite" = the branch-protection CI check set, not a test-suite coverage claim) — excluded with that reason in L1's table.
- `transportTileVisible` Branch 0 ("garble-proof id path" over `transportationOwnerIds`, `lib/visibility/scopeTiles.ts:208-215`) — id-based visibility SHIPPED (#380/Flow 8.3b).
- Notify templates receive `origin` and build absolute links today (`${origin}/admin` in both overflow lines; `escapeHtml(href)` anchor pattern at `lib/notify/templates/autoPublishUndo.ts:74`).
- Mass weights: `EFFORT_WEIGHTS = { XS: 1, S: 2, M: 4, L: 8 }` (`scripts/ledger-mass.ts:46`), severity-multiplied — AC-PROG arithmetic recomputed at close, not predicted.

## Meta-test inventory (declared per writing-plans rule)

- **CREATES:** a new guard suite under `tests/styles/` (working name _metaEmDashCopy.test.ts, final at implementation; the em-dash copy guard + exemption registry + planted-dash premise fixtures, task E1); per-template report-link unit rows in the existing notify template test files (task P1).
- **EXTENDS:** nothing structural. The `tests/docs/` meta-suites (`_metaLedgerInProgress`, `_metaLedgerReferentialIntegrity`, sizing, claims) discover ledger files from disk and cover every archive/stamp/refile/child-filing by default. `tests/parser/mutation/knownHoles.test.ts` already pins `OPERATOR_FINDING_MAP` referential integrity — the decomposition keeps its BL- ids resolvable, proven by that suite staying green.
- **Registries:** invariant-9 (`tests/auth/_metaInfraContract.test.ts`) and invariant-10 (`tests/log/_auditableMutations.ts`) — no new Supabase call site, no new mutation surface in any unit. If implementation discovers otherwise, the registry row lands in the same commit. Advisory locks: untouched. Source-mutation registry: no unit enrolls (the em-dash guard's kill criterion is its planted fixtures, not a registry family).

## Unit W-LDOCS — `feat/l-wave-docs`

Worktree + branch + claim markers are created by the AUTHORING session BEFORE `docs/l-wave-spec` merges (handoff-by-overlap, spec §3: the authoring session creates all three unit branches off `origin/main`, runs `pnpm ledger:claims --check <unit ids>` from the MAIN checkout expecting exit 1 naming `docs/l-wave-spec` only, marks each unit's subset (W-LDOCS: 27 ids — 12 dispositions + 15 stamp/classification targets; W-PUSH: 1; W-EMDASH: 1), pushes; THEN strips the parent's 29 markers in its last pre-merge commit — no undeclared instant on origin). IMPLEMENTATION starts after the parent PR merges: the Opus pane runs `pnpm install && pnpm worktree:link-env && pnpm preflight` in the existing worktree (the branch runs test suites and the L3 probe — the docs-only preflight exemption is NOT invoked) and merges `origin/main` before its first task commit.

### Task L1 — BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES: delete the sentence class

1. RED: none executable for prose deletion; the proof chain is (a) the sweep table below fully dispositioned, (b) `pnpm vitest run tests/visibility/ tests/time/` green after the comment edits (no behavior change), (c) the archive RED for the entry itself.
2. Enumerate (commands + current output committed in the task record):
   - `grep -rln "describe\.skip(\|test\.fixme(" tests/ --include="*.spec.ts" --include="*.test.ts"` → 14 files (list in the verification pass above). Classify the 2 non-e2e hits first: a string/regex mention inside a wiring meta-test is NOT a skipped suite (exclude with reason); a real `.fixme` suite joins the set.
   - `grep -rn "compound test\|audit suite\|the helper covers\|exercised by e2e\|exercised in e2e\|compound-transition tests\|Regression-guarded by the audit" lib/ tests/ --include="*.ts" --include="*.tsx"` → 9 files; 3 are false positives (reason recorded above); the remaining 6 are the entry's site list.
3. Disposition per hit, seeded by the entry's 12-site table (the table is the seed, not the bound — re-run both greps and disposition EVERY hit):
   - `lib/visibility/capabilityTransitions.ts` (3 sites), `tests/visibility/capabilityTransitions.test.ts` (:8-9, :194 — NOT :224/:272, which stay verbatim), `tests/e2e/helpers/rightNow.ts` (3 sites), `tests/visibility/transportTransitions.test.ts` (:10), `lib/time/rightNowTransitions.ts` (2 sites), `tests/time/rightNowTransitions.test.ts` (:6-8): DELETE the execution claim or rewrite honest present-tense (for example: "not exercised anywhere in CI: the suites are `describe.skip`; see BL-E2E-APP-DEPENDENT-SPECS-CI-DARK").
4. Archive the entry (archive RED pattern) with the final site list + the ratified no-guard decision + the honest-phrasing convention.
5. Commit `docs(backlog): delete the skipped-suite coverage-claim class; archive BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES`.

### Task L2 — zero-code closures + demotes (one commit each, archive RED pattern each)

- **L2a** BL-ATTENTION-PANEL-NAME-LEADING-SECTION — archive; owner ruling (keep the deliberate name) + trigger preserved. `docs(backlog): archive BL-ATTENTION-PANEL-NAME-LEADING-SECTION — owner keeps the leading-section name`.
- **L2b** BL-RESYNC-STAGED-REVIEW-UI — archive; re-open trigger (operator asks for diff review) verbatim.
- **L2c** BL-ROLEFLAGSNOTICE-DROP-GUARD — archive; preserve the four refuted-designs list + locked-wrapper structural note as the fix-shape.
- **L2d** BL-CI-OVERLAP-BOOT-WITH-SETUP — archive; preserve measurement table, runner facts, `legfix`/`legwall` pointer, pre-baked-Postgres-image lever; note the dormant source branch `origin/chore/ci-overlap-boot-with-setup`.
- **L2e** BL-CI-RECLASSIFY-PARALLEL-STABILITY — archive; preserve the two re-attempt preconditions + reusable-asset pointers.
- **L2f** BL-ACCENT-BUTTON-ATOM-SWEEP — archive at honest census (3 live `MIGRATED_FILES`); preserve migration mechanics + trigger; state that repo-wide token coverage remains `tests/styles/_metaBgAccentInventory.test.ts`'s job.

### Task L3 — BL-CI-PARALLEL-DB-FALLBACK-AUDIT: probe, then demote or keep

1. Probe (both runs from the W-LDOCS worktree, local stack up via preflight):
   - DB-present: `pnpm vitest run --project=parallel --reporter=json --outputFile=<scratch>/parallel-db.json`
   - Closed-port: same command with every Supabase env endpoint pointed at `http://127.0.0.1:1` (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `TEST_DATABASE_URL` → `postgresql://127.0.0.1:1/none`) — a REFUSED connection, not an absent variable, per the entry's protocol.
   - Diff per-file assertion counts (`numPassingAsserts` aggregated per file from the JSON envelopes; small script committed alongside the transcript).
2. Validity gate BEFORE the decision rule (spec §2.1.3, R1 F3): both runs must exit with parseable JSON reports covering the IDENTICAL file set; the DB-present run must report a nonzero total assertion count; the diff script validates its fields (absent field = INVALID, never zero) — precedent `scripts/run-excluded-test.mjs` (its report-validation block: child-exit, numeric-field, `testResults`, exact-file-attribution checks). An invalid probe means fix-and-re-run; the entry is NEVER archived on an invalid probe.
3. Decision rule over a VALID probe (pre-ratified, total): a file whose count drops, newly skips, or reports all-skipped under the closed port is DEGRADING. Zero degrading → archive with the transcript (answered-negative). Any degrading → entry STAYS OPEN, resized to the named instances with count deltas; each listed file then either moves to serial or gains a fallback-under-test note — THAT follow-through work is the resized entry's content, not this wave's.
4. Commit `docs(backlog): settle BL-CI-PARALLEL-DB-FALLBACK-AUDIT by probe — <archive|resize> per result`.

### Task L4 — decompositions (one commit per umbrella)

- **L4a** BL-MUTATION-HARNESS-OPEN-HOLES → file `BL-MUTATION-REF-SUB`, `BL-MUTATION-UNICODE`, `BL-MUTATION-COLUMN-SHIFT`, `BL-MUTATION-MERGED-CELL`, `BL-MUTATION-SECTION-ORDER` as standalone sized entries (default M each; adjust honestly per class), each carrying its corpus evidence, `OPERATOR_FINDING_MAP` linkage, and the shrink-only ratchet contract. Archive the umbrella with the decomposition record. RED: archive RED + `pnpm vitest run tests/parser/mutation/knownHoles.test.ts` green (BL- refs resolve) + `pnpm vitest run tests/docs/` green.
- **L4b** BL-E2E-LIFECYCLE-SPECS-CI-DARK → refile as `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (L): the ~60 app-dependent standalone-allowlist specs; promotion = incremental green batches; owner GitHub-settings action recorded. Archive the umbrella with the full wiring history (both lifecycle specs wired in `lifecycle-layout-e2e.yml`).
- **L4c** BL-OPS-LOG → file `BL-OPS-LOG-OAUTH-EMITS` (S), `BL-OPS-LOG-ONBOARDING-EMIT` (S), `BL-OPS-LOG-DASHBOARD-BANNER` (M, Opus/UI, design-gated), symbol-anchored per spec §2.1.4; archive the umbrella with the built/MOOT inventory.
- **L4d** BL-RESURRECT-MOBILE-SAFARI-E2E → refile at honest scope (~20 tile/crew specs; `crew-e2e.yml` template; id decision: KEEP the id — cheaper for cross-references; the refiled body corrects the premise). Archive nothing if the id is kept: the entry body is REWRITTEN in place at honest scope with a dated correction note. (If review prefers the new id, archive + refile — either satisfies spec AC-L1.)

### Task L5 — BL-PARSER-FIELD-PROVENANCE-MODEL: new filing

File the L entry per spec §2.1.5 (audit citations, shipped-already record #367/#379, remainder = full provenance model for the named P0-2 zero-signal residuals). RED: `pnpm vitest run tests/docs/` green (new entry parses, referential integrity holds). Commit `docs(backlog): file BL-PARSER-FIELD-PROVENANCE-MODEL — the provenance-model remainder, honestly scoped`.

### Task L6 — newly-L classification stamps + 3 executed archives

1. Stamp all 11 stamp-only entries per the spec §2.1.6 table (`l-wave-screen 2026-08-06: <classification> — <one-line reason>` on the meta block); resize BL-PG-CRON-COVERAGE-UNRUN L→M in the same commit.
2. Execute the 3 archives (archive RED each): BL-ADOPTION-PIN-REACHABILITY-BLIND (triggers + backstop-deletion warning preserved), UNDO-FAILURE-REANNOUNCE-1 (from DEFERRED.md; owning-spec ratification cross-ref), BL-TRANSPORT-ID-RESOLUTION — but FIRST re-verify the entry's deferred regression pins landed with 8.3b: `grep -rn "Doug Larson Loadout\|namesRefer\|transportationOwnerIds" tests/visibility/` — pins present → archive with the Branch-0 probe; any missing → RESIZE to exactly the missing pin list instead (both outcomes compliant per spec).
3. Stamp BL-WATCH-PROMOTION-ACTIVATION-RACE PARKED (spec §2.1.7 wording). No other edit to it.

### Task L7 — close W-LDOCS

Strip the unit's 12 markers in the PR's last commit (archived entries already stripped theirs in the move; stamped-open entries' markers strip here). `pnpm vitest run tests/docs/` green. PR body: preflight ran (not docs-only exempt); probe transcripts linked. CI green → merge → ff main → `0 0`.

`impeccable-gate: N/A — no UI surface` (W-LDOCS: ledger prose, code comments, probe transcripts).

## Unit W-PUSH — `feat/l-wave-push`

### Task P1 — the Report-a-problem link (TDD)

1. RED (spec §2.2 R1 F4 — shapes × channels, not files): one unit row PER RENDER SHAPE — `renderAutoPublishUndo`, `renderAutoPublishUndoBatch`, `renderDigest`, `renderRealtimeProblem` with `kind` `show`/`global`/`ingestion`, `renderRealtimeProblemBatch` (7 shapes; locate suites by `grep -rln "autoPublishUndo\|realtimeProblem\|renderDigest" tests/notify/`) — asserting BOTH bodies of `RenderedEmail`: the `html` contains an anchor whose text is "Report a problem" with the expected href, AND the `text` contains the labeled URL. Href = `${origin}/admin?show=<slug>` for shapes with a single show context (the show modal — the landed destination the per-show route itself redirects to; it hosts the existing show-scoped report controls), `${origin}/admin` for shapes without one (digest and batch multi-show bodies, realtime `global`/`ingestion`). The link is a NAVIGATIONAL entry point by ratified resize — memo form 1's one-click report form is explicitly NOT shipped (spec §2.2 item 2, §4 limit 6); the archive records the delta and its trigger. Hrefs fixture-derived (anti-tautology: derive expected from the fixture's origin+slug inputs, never hardcode a literal the implementation also hardcodes). Concrete failure modes caught: a batch path shipping without the link while its single-item sibling has it; a plaintext body missing what the HTML carries; an off-origin link.
2. GREEN: add the footer anchor via the existing `escapeHtml(href)` pattern to each body-producing template. No em dash in the new copy. No new route; `/api/report` untouched.
3. Commit `feat(notify): add the Report-a-problem footer link to every push template`.

### Task P2 — resize + archive + close

1. Same commit as the resize: entry body gains the staleness-repair note (prereqs (a)/(c) refuted by its own 2026-08-03 sweep), `**Effort:** L` → `**Effort:** S`.
2. Archive the resized entry (archive RED) with memo cross-ref; forms 2–3 + the UNVERIFIED Doug-observation prerequisite recorded as explicitly NOT shipped.
3. Strip the marker in the last pre-merge commit; PR; CI green → merge → `0 0`.

`impeccable-gate: N/A — no UI surface` (email HTML in `lib/notify/`; invariant-8 UI definition not triggered).

## Unit W-EMDASH — `feat/l-wave-emdash` (Opus, dual gate)

Pre-code mechanical UI gate applies to every copy repair (no new em dashes, apostrophe literals, tap targets untouched — copy-only diff).

### Task E1 — the guard, RED first

1. Write the guard suite (working name _metaEmDashCopy.test.ts under `tests/styles/`): it scans the spec §2.3 accept-set —
   (a) `lib/messages/catalog.ts` executable string literals (comment-stripped lexical scan; census: 0 hits today — comments excluded by construction);
   (b) `app/help/**/*.mdx` prose (fenced code blocks elided; 20 hits today);
   (c) EVERY executable string literal and JSX text node in `components/**` and `app/**` excluding `app/api/**` (comment-stripped; covers exported copy constants, return literals, and string expressions rendered as JSX children — seed inventory per spec §2.3: ~25 sites across 10 files plus the `NotifBell.tsx` template fragment). NODE KINDS per spec §2.3 item 3: `StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead`/`TemplateMiddle`/`TemplateTail`, `JsxText`, JSX attribute strings — NOT bare `isStringLiteralLike`, which excludes template fragments and silently misses three live covered sites (probed, spec R2 F3);
   (d) `lib/notify/**` executable string literals (2 hits today).
   U+2014 banned in all four; literal `--` banned in (b) prose text and (a)/(d) copy strings only. Non-copy literals swept in by (c) (test ids, class names) get exemption-registry rows with reasons, never scan narrowing. Exemption registry starts EMPTY. Premise fixtures (`tests/_shared/premise.ts`): a planted-dash fixture per surface class proves the scanner can fail (unconditional execution, never inside `.each` over a possibly-empty list).
2. Run it: the failure list is the sweep list, committed as the task record. Expected from the census: ~20 MDX + 2 notify + the ~25-site component/app seed inventory + whatever else the scan finds (the seed is a floor, not a bound — the guard is the enumerator); catalog expected clean, so the §12.4 lockstep is expected NOT to fire.
3. Commit the guard RED? No — invariant 1 shape here: commit guard + repairs together per surface batch (a red guard on main would break CI); the RED run is recorded in the task record, the guard lands green with the sweep.

### Task E2 — sweep repairs

Per surface batch (MDX; notify; JSX findings), repair each hit per DESIGN.md §9 (commas/colons/periods/parentheses), or add a reasons-required exemption row. Same-commit obligations: every test pin asserting a changed string (locate per string: `grep -rn "<changed string>" tests/`); §12.4 lockstep triple IF any catalog copy string turns out non-clean (not expected per the verification pass — the lockstep steps stand by in the task body regardless: master-spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` same commit, x1 the proof).

### Task E3 — screenshot determination

For each repaired copy string, determine whether it renders on a captured surface (`public/help/screenshots/` — 14 WebPs: dashboard-overview, needs-attention, crew-preview ×3, preview-as-crew-banner, review-queues-empty-state, each ×2 themes). MDX prose does NOT render in product screenshots; component copy MIGHT. If any captured surface's rendered text changes: regenerate baselines FROM the pinned Playwright Docker image with `--platform linux/amd64` (byte-comparison discipline), never from the dev host; after any local verification capture, `git restore public/help/screenshots/`.

### Task E4 — DESIGN.md §9 + close

1. One sentence added to §9's em-dash bullet naming the guard as enforcement.
2. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED-entried; findings + dispositions in the unit closeout.
3. Archive BL-EM-DASH-POLICY (archive RED) recording resolution 2 shipped + the guard's accept-set + §4 limits (comments/docs/en-dash/homoglyphs out of scope).
4. Strip marker last pre-merge commit; PR; CI green → merge → `0 0`.

The dual gate runs at branch close; the wave `closeout.md` carries the filled marker line for this unit (M-wave precedent).

## Adversarial review (cross-model)

- This plan: self-review (below) → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff. Briefs carry the canonical CONSEQUENCE BOUND / THREAT MODEL FENCE block, REVIEWER ONLY, VERDICT + FINDINGS lines, round cap 4.
- Each unit branch: whole-diff codex-guard `--stage diff` review to APPROVE before merge (split tight-scope briefs if the diff exceeds a handful of files — W-EMDASH likely splits: guard+tests vs copy repairs).

## Execution handoff

Per spec §3 and the kickoff: this branch's PR merges (spec + plan + brief + marker handoff order per spec §3 steps 2–3 — unit branches claim FIRST from worktrees created off origin/main, then this branch strips all 29 markers in its last pre-merge commit). Then a NEW Opus pane (split per kickoff §4) executes W-LDOCS → W-PUSH → W-EMDASH from `HANDOFF.md` in this directory. Never end a turn mid-pipeline; 10-minute nudge per Stage-0 semantics in each driving session.

## Impeccable gate (this authoring branch)

This spec/plan branch ships no UI surface; the W-EMDASH unit's filled marker lands in this directory's `closeout.md` at wave close (M-wave precedent, its plan.md line 196).

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped (pre-draft pass above; re-verify any task edited during review rounds).
- [ ] Anti-tautology: P1 hrefs fixture-derived; E1 premise fixtures unconditional; L3's diff script compares independent runs, not a run against itself.
- [ ] Reconciliation sweeps authored AND RUN: L1's two greps (outputs above), E1's guard-as-enumerator (RED run recorded), L3's probe (runs at execution — the plan fixes commands + decision rule, compliant because the DISPOSITION is the deliverable, not the sweep).
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-06-l-wave/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
