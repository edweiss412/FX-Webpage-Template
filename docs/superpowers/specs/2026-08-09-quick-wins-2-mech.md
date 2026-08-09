# Quick wins 2 — mech batch (seven ledger entries, no product-visual change)

**Date:** 2026-08-09 · **Authoring branch:** `docs/quick-wins-2-specs` · **Implementation branch:** `fix/quick-wins-2-mech` · **Status:** DRAFT (pre-adversarial-review)

## §0 Why this arc exists, and its scope

Second pass over the mdview "Quick wins (S)" view (open entries, effort XS/S), after arc C (`docs/superpowers/specs/2026-08-06-arc-c-quick-wins.md`). The user selected the batch 2026-08-09 in-session and granted full autonomy ("yes autonomously, fable owns spec(s) + plan(s), launches new pane for opus implementation + closeout"). This spec covers the seven entries whose work is mechanical or test-side; the two crew-chrome entries plus the wizard connector are the sibling UI spec (`2026-08-09-crew-chrome-wizard-connector.md`), on their own implementation branches.

Claimed entries (invariant 12, marked on `docs/quick-wins-2-specs`, handed off to `fix/quick-wins-2-mech`):

1. `BL-ESLINT-CONFIG-ARRAY-JOIN-COMMENT-STALE` (XS) — one comment edit; archive.
2. `BL-SHADOW-TILE-ARROW-SYNTAX` (S) — arrow-form sweep + false enforcement claim + derived guard; archive.
3. `BL-CLASS-CONST-LINT-BLINDSPOT` (S) — cn-wrap the nine dark const sites; archive.
4. `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` (S) — **probe-refuted as filed**; re-disposition to watch with trigger (§2.4); stays open, marker off.
5. `BL-TRANSPORT-ID-RESOLUTION` (S) — the deferred red-first pin set, observed-RED protocol; archive.
6. `BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB` (S) — call-time env resolution + non-loopback refusal; archive.
7. `BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE` (S) — arithmetic gap assertion (user-ratified option); archive.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-09 by the user in the authoring session unless another source is cited.

1. **Batch membership is decided.** The seven entries above; the crew footer pair, avatar-menu relocation, and wizard connector are the sibling UI spec's scope, not this one's. Fitwithinclip pair (explicit unmet triggers), `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` (decided terminal state, arc C §1.1 item 4), `BL-NULLCODE-STAMP-BATCH-2` container (working order complete), and `VOICEOVER-ANNOUNCER-SPOTCHECK` (owner-only manual pass) are excluded by design.
2. **Neighbour-overlap approach is decided:** the arithmetic gap assertion derived from the container's own gap token, NOT a harness redesign that mounts production containers. User selected the entry's own "cheaper and probably right" lean (AskUserQuestion, 2026-08-09).
3. **Autonomy: both user review gates WAIVED** (user grant 2026-08-09). Stop only for a genuinely NEW question.
4. **The mutation-enrolment re-disposition (§2.4) is probe-backed, not a scope dodge.** The registry's runner spawns one **vitest** child per mutant (`tests/mutation/guardSurfaces.gate.test.ts:11` "It spawns one `vitest` child per mutant"); `sourcePath` rows are lib modules (`tests/mutation/source/registry.ts:153` `taskContract`, `tests/mutation/source/registry.ts:314` `ledgerClaimsCore`); the declared operator set is six generic source operators (`tests/mutation/source/operators.ts:17` `OPERATOR_NAMES`). The tap-target guard is a Playwright spec whose nineteen mutants are bespoke `.tsx` component edits. No registry row can express that today. Re-disposition, with the probe, is the honest outcome; do not relitigate toward shipping a row the harness cannot run.
5. **All AGENTS.md invariants bind.** `impeccable-gate` applies to this arc because §2.2/§2.3 touch class strings under `components/**` (invariant 8's UI-surface definition is file-location-based); the expected visual delta is zero, and the dual gate is still run on the affected diff.
6. **Entry graduations archive with the marker stripped in the same commit** (invariant 12); the §2.4 entry keeps its row (status flips to watch) and its marker comes off in the PR's last commit like the others.

## §2 Per-entry contracts

Entry bodies in BACKLOG.md are the evidence-of-record; this section states what the arc ADDS. Code claims verified 2026-08-09 against the live tree at `97e179d83` (citation pass in the authoring session); anchors are file + symbol — line numbers are drafting-time locators.

### §2.1 BL-ESLINT-CONFIG-ARRAY-JOIN-COMMENT-STALE — one comment edit

`eslint.config.mjs` (comment above `"better-tailwindcss/enforce-canonical-classes"`, drafting locators :66-72) still says array-join patterns "are linted by hand on initial canonicalization". The first clause (plugin cannot traverse array joins) stays; the second clause is replaced with a pointer to the zero-tolerance guard `tests/specLint/canonicalClassCallee.test.ts`, which reports any new array-join className as a hard failure.

**TDD disposition: N/A — declared.** A comment carries no behavior; there is no RED to write. The change ships in the same commit as §2.2's guard work (same file family), and `pnpm lint` green is the regression check. Archive on merge.

### §2.2 BL-SHADOW-TILE-ARROW-SYNTAX — sweep, truthful comment, derived guard

Three parts, per the entry's Work section:

1. **Sweep.** Every class-string use of `shadow-(--shadow-tile)` / `shadow-(--shadow-popover)` becomes the canonical `shadow-tile` / `shadow-popover`. The census is DERIVED at implementation time — `rg -n 'shadow-\(--shadow-(tile|popover)\)' app components lib` — never copied from this spec or the entry (the entry's 2026-08-07 count of 24 was already 25 at authoring time; a hardcoded list rots). Doc comments that name the arrow form in order to deprecate it (e.g. `app/globals.css` token block) keep it.
2. **Truthful comment.** `app/globals.css` (token block above `--shadow-tile: var(--shadow-tile-runtime)`, drafting locators :285-293) currently claims "(eslint-plugin-better-tailwindcss enforces this)" — probed false in the entry. The claim is replaced with the truth: the plugin canonicalizes tokens whose `@theme` value is a literal and cannot see tokens defined through a `-runtime` `var()` indirection; the repo guard below is the enforcement.
3. **Derived guard (the entry's "decide whether the blind spot deserves its own guard" — decided YES, and derived rather than enumerated).** New vitest guard under `tests/specLint/`, file "runtimeIndirectionArrowBan.test.ts" (created by this arc): parse the `@theme` block of `app/globals.css` for tokens whose value matches `var(--…-runtime)` (today: `--shadow-tile`, `--shadow-popover` — discovered, not hardcoded), then walk every tracked `.ts`/`.tsx` under `app/`, `components/`, `lib/` and fail on any `<utility>-(--<token>)` arrow use of a discovered token in a string literal, naming file:line per hit. Comment-only lines are excluded by the same convention the entry's own probe used. A future `-runtime` token is covered on arrival (derived cover, per the class-sweep rule); a token that stops being `-runtime` drops out automatically.

**TDD.** The guard is the RED: written first, it fails on the current tree (25 textual matches at authoring time; the guard's own comment-exclusion means the failing count is the class-string subset, measured when the test first runs, not asserted from this spec). The sweep turns it green. **Premise (per `tests/_shared/premise.ts`):** the guard asserts it discovered ≥1 `-runtime` token from globals.css before scanning — a refactor that renames the indirection pattern must fail the premise, not silently scan for nothing.

**Zero visual delta:** both forms resolve to the same token; `tests/specLint/canonicalTokenIdentity.test.ts` already pins token identity. No baseline changes expected; if the impeccable gate or a pixel gate disagrees, that is a finding, not a re-baseline.

### §2.3 BL-CLASS-CONST-LINT-BLINDSPOT — cn-wrap the nine dark sites

The entry's probe matrix is the mechanism-of-record: the plugin traverses recognized callees (`cn`) but not bare consts or object values. The cheap repair the entry names is applied: **wrap in `cn(...)`** (renaming to `classes` cannot serve nine consts in three files).

The nine sites (paths corrected from the entry during the 2026-08-09 citation pass — the entry's directory prefixes had rotted, symbol names had not):

| File | Consts (drafting locators) |
| --- | --- |
| `components/admin/settings/DeveloperToggleButton.tsx` | `TRACK_BASE` :79 · `THUMB_BASE` :81 · `TAP_TARGET` :84 |
| `components/shared/AccentButton.tsx` | `SIZE_CLASS` :84 · `WEIGHT_CLASS` :92 · `RING_OFFSET_CLASS` :97 · `BASE_CLASS` :105 |
| `components/admin/OnboardingWizard.tsx` | `base` :165 · `focusRing` :167 (StepIndicator scope; the entry's :127/:129 predate a shift) |

For `Record`-valued consts (`SIZE_CLASS` etc.) each VALUE is wrapped: `sm: cn("…")`. Runtime is unchanged (`cn` of one string is that string). Whatever the newly-sighted lint then reports inside those strings is fixed in the same commit — the entry's worked example (`THUMB_BASE` `h-5 w-5` → `size-5`, the drift its three sibling switches already took) is the known instance; the commit records the full lint delta.

**TDD (behavioral proof, not a tautology).** Before the wrap: plant `min-h-[44px]` (a non-canonical form the rule rewrites to a token) inside one const per file, run `pnpm lint`, observe SILENCE — that observed silence is the RED, the blind spot demonstrated live. After the wrap: the same plants are each REPORTED (premise: the rule sees the wrapped consts), then removed. Both observations land in the commit message. **Census sweep:** the implementation re-runs the entry's shape hunt (`rg -n '^const [A-Z_a-z]+(: [^=]+)? =\s*$' -A1` over `components app` filtered to Tailwind-bearing strings, plus object-value scan of the three files) and disposes every hit in the PR body — the nine above repaired; any new hit repaired or dispositioned by name (class-sweep disposition rule).

### §2.4 BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT — probe-refuted; re-disposition

**The probe (2026-08-09, decisive).** See §1.1 item 4. The harness contract the entry assumed — "one registry row plus an operator pass" — does not exist for Playwright suites or component-file mutants: the runner is vitest-per-mutant, the operator set is six generic source operators, and every enrolled `sourcePath` is a lib module. Enrolling `tests/e2e/tap-target-floor.layout.spec.ts` would require (a) a Playwright child-runner mode, (b) bespoke component-edit operators for the nineteen documented mutants, and (c) a runtime budget far above the 93 s/run the entry cites — a harness redesign (M-L), not an S.

**The re-disposition (this arc's whole deliverable for the entry).** The BACKLOG entry is edited in place: status → watch with `**Un-defer trigger:** the source-mutation harness gains a Playwright/component-mutant mode (or an equivalent runner exists)`, the probe above recorded in the body with the three missing capabilities named, effort resized S → M-L, and the nineteen-mutant operator list left intact as the ready enrolment payload. No code ships. The marker comes off in the PR's last commit; the entry stays open as watch.

### §2.5 BL-TRANSPORT-ID-RESOLUTION — the deferred pin set, observed-RED

The residual is exactly the entry's verbatim list: pin `transportTileVisible`'s fuzzy-name fallback (`lib/visibility/scopeTiles.ts`, `transportTileVisible`, drafting locator :180; the id Branch 0 at :214-215 is NOT under test here) in `tests/visibility/scopeTiles.test.ts`:

- driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix)
- `"Douglas Larson"` vs `"Doug Larson"` → visible (surname)
- assigned-names `["Bill Werner"]` vs `"William Werner"` → visible (nickname via surname rule, `lib/data/nameMatch.ts` multi-token last-token comparison, drafting locators :48-53)
- case/trim `"  doug larson "` → visible
- negative controls: `"Jane Smith"` → not visible; empty / `null` → not visible; admin → visible when transportation exists
- known-gap fixture: driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (last tokens `"loadout"` ≠ `"larson"`), asserted as the documented limit it is

Fixtures route through legs with NO resolved owner id so Branch 0 cannot answer (guard premise: the case asserts `transportationOwnerIds` is empty/absent for the leg under test, per `tests/_shared/premise.ts` — otherwise the id path would make every name fixture vacuous).

**Observed-RED protocol (a regression pin on shipped-correct behavior cannot fail naturally).** Before trusting green: temporarily invert the fuzzy-name fallback in the local working tree (e.g. neuter the `namesRefer`/multi-token branch), run the new cases, observe the positive fixtures FAIL; restore; observe all green. The mutant is never committed; commit message + PR body record both observations with run output (arc C's protocol, ratified there §1.1 item 2). The pin-set completeness check is the entry's own: `rg -n 'Bill Werner|William Werner' tests/visibility lib/visibility` flips from exit 1 to hits in the new suite.

### §2.6 BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB — call-time resolution + loopback guard

`tests/e2e/helpers/lockedCrewRestriction.ts` captures `databaseUrl` at module load (drafting locators :50-52) — `TEST_DATABASE_URL ?? DATABASE_URL ?? local default` — while the suites' PostgREST admin client reads loopback `SUPABASE_URL`; with `.env.local`'s non-loopback `TEST_DATABASE_URL` the crew id resolves locally and the UPDATE lands on the validation project, order-dependently (the entry's probe).

**The fix, two independent halves:**

1. **Call-time resolution.** The URL is resolved inside the helper's execution path (the `execFileSync("psql", …)` call site, drafting locator :88), never at module top level, so import order stops deciding the target.
2. **Loopback refusal.** When the resolved URL's host is non-loopback, the helper THROWS with a message naming the resolved host, the env var that supplied it, and the escape hatch — a new explicit `LOCKED_FIXTURE_ALLOW_REMOTE=1` opt-in (naming aligned with the observe CLI's `--env` guardrail posture: local is the default target; remote requires an explicit, per-run declaration). The thrown error replaces today's misleading "run `pnpm db:seed`?" symptom for this failure shape.

**TDD.** New unit suite under `tests/e2e/helpers/`, file "lockedCrewRestriction.unit.test.ts" (created by this arc; vitest, no DB — plan confirms its testMatch wiring): (a) RED — with `TEST_DATABASE_URL` set to a non-loopback URL after import, the helper refuses (fails pre-fix because module-load capture + no guard sends it through); (b) call-time proof — env var changed between import and call is honored; (c) loopback + opt-in paths pass through to the psql invocation (spawn stubbed). The production e2e path is exercised by the existing suites on a loopback stack (unchanged behavior there).

**Class-sweep disposition (authored AND run, 2026-08-09).** `rg -n "TEST_DATABASE_URL \?\?" -g '*.ts'` full hit list and per-hit disposition:

| Hit | Disposition |
| --- | --- |
| `tests/e2e/helpers/lockedCrewRestriction.ts:50` | THE defect — repaired here. |
| `supabase/seedWalkerFixtures.ts:26`, `supabase/seed.ts:11` | Operator-invoked seed scripts; targeting `TEST_DATABASE_URL` is their documented purpose (`pnpm preflight` already warns on non-loopback). N/A — intended. |
| `playwright.config.ts:396`, `playwright.screenshots.config.ts:168` | webServer env pass-through, not a write path. N/A. |
| `lib/reports/submit.ts:140`, `lib/reports/rateLimit.ts:45`, `lib/onboarding/rescanWizardSheet.ts:86`, `lib/onboarding/sessionLifecycle.ts:95`, `lib/adminAlerts/resolveOnboardingSheetUnreadable.ts:32`, `lib/drive/watch.ts:242` | Production code resolving inside function scope (call-time by construction); server deployment intentionally supplies these vars. N/A — different contract. |

The plan re-runs this sweep at implementation time and reconciles any new hit by name.

### §2.7 BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE — the arithmetic gap assertion

Ratified approach (§1.1 item 2): no harness redesign; the live entry keeps mounting components in isolated `<div data-mount>` blocks (`tests/e2e/_tapTargetFloorLiveEntry.tsx`, drafting locator :148). What ships is the assertion the entry sketched: for each of the three uncovered targets, pin that the container's own gap keeps the 8px/side expansion band from reaching an interactive neighbour.

The three targets and their containers (re-verified 2026-08-09; the entry's hand-trace "no interactive neighbour sits in any band today" is the state being pinned):

| Target | Container + gap |
| --- | --- |
| HelpSheet trigger | `components/admin/wizard/Step3Review.tsx:1312` area, `gap-2` |
| HelpTooltip trigger | `components/admin/StagedReviewCard.tsx:464` (`flex flex-wrap items-center gap-2`; the entry's `wizard/` prefix had rotted) |
| HelpSheet close | `components/admin/HelpSheet.tsx:167` area, `gap-3` |

**Assertion shape (extends `tests/e2e/tap-target-floor.layout.spec.ts`, same real-browser harness):** where the container renders inside the component the live entry already mounts, measure the container's computed `column-gap`/`row-gap` via `getComputedStyle` and assert `gap ≥ EXPANSION_BAND_PER_SIDE` (8, the suite's existing constant — cross-referenced, not re-literaled) for every axis on which an interactive sibling can adjoin; where the container is NOT inside any mounted subtree, the plan either widens that mount by one wrapper level (still a component mount, not a page) or pins the class statically with a premise that the class string still resolves the expected token — the plan decides per container after probing the mount trees, and documents which of the two forms each container got. **Premise:** each case asserts the container carries the expected `gap-*` utility before measuring, so a refactor that moves the gap to a child wrapper fails the premise instead of measuring the wrong box. **Failure mode caught (anti-tautology):** mutant #14 from the tap-target arc — collapsing the container to `gap-0` so a grown target overlaps its neighbour — now fails by name; today it passes the committed suite for these three containers.

The BACKLOG entry's "first scheduled step" (the decision) is answered by ratification; the spec §4 limit 2 widening the entry cites stays accurate (the band remains unasserted against *production* neighbours — documented limit below).

## §3 Batch topology

One implementation branch, `fix/quick-wins-2-mech`, worktree off `origin/main`, full worktree setup (invariant 11: `pnpm install`, `worktree:link-env`, `preflight`). Commit per task (invariant 6): `chore(infra)`/`fix(...)`/`test(visibility)` per surface. The handoff to the implementing pane follows the `HANDOFF.md` in the plan directory `docs/superpowers/plans/2026-08-09-quick-wins-2/` (both created with the plan). Ledger graduations (six archives: §2.1, §2.2, §2.3, §2.5, §2.6, §2.7; plus the §2.4 watch re-disposition) land as the PR's closing commits with markers stripped (invariant 12).

## Dimensional Invariants

N/A — no task in this arc creates or changes a fixed-dimension parent with flex/grid children; §2.2/§2.3 are token-identity class edits with zero layout delta, and §2.7 measures existing gaps without changing them. (The sibling UI spec carries the real table for the crew flex chain.)

## Transition Inventory

N/A — no component in this arc gains or changes a visual state; every surface is test/lint/comment-side or a token-identical class rewrite.

## §4 Documented limits

1. **§2.2 guard scope is string literals in `.ts`/`.tsx`.** A class assembled at runtime from fragments (`"shadow-(" + t + ")"`) is invisible — same posture as every specLint guard; accidental authoring is the threat model, adversarial obfuscation files here.
2. **§2.3 repairs the nine known sites and the census's hits at implementation time.** The plugin's identifier-argument blind spot itself (`cn(IDENT)`) is upstream behavior this arc does not change; a future const that dodges both the census shape and lint files as a new instance, not a regression of this work.
3. **§2.5 pins the name-fallback's documented hole as a NEGATIVE** (`"Doug Larson Loadout"`): the mis-parse stays unmatched by design; the id path (Branch 0) is the shipped remedy and is out of scope here.
4. **§2.6's guard protects the locked-fixture helper only.** Other e2e helpers that grow psql writes later must adopt the same call-time + loopback contract; the sweep table names today's full hit set and their dispositions.
5. **§2.7 asserts gap arithmetic, not production adjacency.** The production neighbour inventory stays hand-traced (entry's probe); a page-level harness remains out of scope per ratification.

## §5 Acceptance criteria

- **AC-M1** (§2.1+§2.2): `eslint.config.mjs` comment updated; `app/globals.css` enforcement claim truthful; `runtimeIndirectionArrowBan` guard exists, discovered ≥1 `-runtime` token (premise), observed RED pre-sweep with the measured hit count in the commit, green post-sweep; `rg 'shadow-\(--shadow-(tile|popover)\)' app components lib` reports only deprecation-comment hits.
- **AC-M2** (§2.3): nine consts cn-wrapped; planted-violation silence observed pre-wrap and report observed post-wrap, both recorded; census sweep dispositions in PR body; `pnpm lint` green.
- **AC-M3** (§2.4): BACKLOG entry re-dispositioned to watch with trigger + probe recorded; no registry row shipped.
- **AC-M4** (§2.5): pin set green with observed-RED transcript; Werner grep flips to hits; premise on empty owner ids present.
- **AC-M5** (§2.6): unit suite green incl. observed-RED on the refusal case; call-time resolution proven; sweep table reconciled at implementation time.
- **AC-M6** (§2.7): three containers asserted (form per container documented); mutant #14 shape fails by name on each covered container.
- **AC-M7**: full suite + typecheck + lint + format green locally; real CI green pre-merge; six archives + the watch flip land with markers stripped.

impeccable-gate: run — §2.2/§2.3 touch `components/**` class strings (zero expected visual delta; dual gate still runs on the affected diff)
