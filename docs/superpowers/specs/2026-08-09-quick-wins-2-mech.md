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

**TDD disposition: N/A — declared.** A comment carries no behavior; there is no RED to write. The change ships as its OWN commit (invariant 6 — one task, one commit; R1 F5), with `pnpm lint` green as the regression check. Archive on merge.

### §2.2 BL-SHADOW-TILE-ARROW-SYNTAX — sweep, truthful comment, derived guard

Three parts, per the entry's Work section:

1. **Sweep.** Every class-string arrow use of a declared `@theme` token becomes its canonical utility (known instances at authoring time: the `shadow-(--shadow-tile)` / `shadow-(--shadow-popover)` family → `shadow-tile` / `shadow-popover`). The census is DERIVED at implementation time by the part-3 guard's own RED output — never copied from this spec or the entry (the entry's 2026-08-07 count of 24 was already 25 at authoring time; a hardcoded list rots). Doc comments that name an arrow form in order to deprecate it (e.g. `app/globals.css` token block) keep it.
2. **Truthful comment — stating the MEASURED mechanism, not the entry's refuted theory.** `app/globals.css` (token block above `--shadow-tile: var(--shadow-tile-runtime)`, drafting locators :285-293) currently claims "(eslint-plugin-better-tailwindcss enforces this)" — probed false in the entry. The entry's replacement theory ("every `-runtime` indirection token is invisible to the rule") was ALSO refuted by the R1 review probe (2026-08-09): the `@theme` block carries 35 `var(--…-runtime)` tokens and direct ESLint probes found 29 of them already canonicalized; the silent set is the two shadow tokens plus exactly four color tokens (`--color-text-subtle`, `--color-text-faint`, `--color-accent`, `--color-accent-on-bg`). The comment therefore states only what is measured: the plugin enforces canonical forms for most `@theme` tokens, a measured residue is silent, and the repo guard below is the enforcement that closes the whole class without depending on which tokens the plugin happens to see.
3. **Derived guard — an arrow-form ban over declared `@theme` tokens, breakpoint namespace excluded.** New vitest guard under `tests/specLint/`, file "themeTokenArrowBan.test.ts" (created by this arc). Rationale: for the covered namespaces, the `@theme` token generates a canonical utility resolving the SAME token, so the arrow form is never necessary — the ban is derived (parse the `@theme` block for token names; no enumeration), covers the measured silent residue and every future token on arrival, and is merely redundant where the plugin already reports. **The `--breakpoint-*` namespace is EXCLUDED by rule (R2 probe; census corrected per R3 P2):** against the installed Tailwind 4.2.4 compiler, `min-w-(--breakpoint-sm)` emits `var(--breakpoint-sm)` while `min-w-sm` resolves `--container-sm` — a different token — so there IS no token-preserving canonical form and a mistaken "canonicalization" would silently change the resolved value. The tree declares three breakpoint tokens (`--breakpoint-sm`/`-lg`/`-xl`) and carries ZERO live breakpoint-arrow class uses today; the exclusion protects the legitimate spelling should one appear. Arrow forms referencing NON-theme variables stay out of scope. Mechanics: walk every tracked `.ts`/`.tsx` under `app/`, `components/`, `lib/`; fail on any string-literal arrow use of a covered declared token, naming file:line per hit; comment-only lines excluded by the entry probe's convention.

**TDD.** The guard is the RED: written first, it fails on the current tree (the shadow-token arrow sites; the sweep census is measured when the test first runs, not asserted from this spec). The sweep turns it green — and the sweep's scope widens to match the guard: every arrow form of a declared theme token found in the census is canonicalized (authoring-time spot check found only the shadow family; the census is authoritative). **Premise (per `tests/_shared/premise.ts`):** the guard asserts it parsed ≥30 declared `@theme` tokens before scanning — a globals.css restructure that breaks the parse must fail the premise, not silently scan for nothing.

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

**TDD (executable RED first; the lint observations are evidence, not the RED — R1 F4).** The RED is a new structural case in `tests/specLint/canonicalClassCallee.test.ts`'s file (or a sibling in the same directory; plan picks): for each of the nine consts, parse the file and assert the const's initializer (or each Record value) is a `cn(...)` call — failing today, green after the wrap, and its failure derives from the production lines named above (RED-validity rule). The behavioral evidence is layered on top: before the wrap, plant `min-h-[44px]` inside one const per file, run `pnpm lint`, record the observed SILENCE; after the wrap, the same plants are each REPORTED (premise: the rule sees the wrapped consts), then removed. Both observations land in the commit message. **Census sweep:** the implementation re-runs the entry's shape hunt (`rg -n '^const [A-Z_a-z]+(: [^=]+)? =\s*$' -A1` over `components app` filtered to Tailwind-bearing strings, plus object-value scan of the three files) and disposes every hit in the PR body — the nine above repaired; any new hit repaired or dispositioned by name (class-sweep disposition rule).

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

**The fix, three parts (parts 2-3 hardened by the R1+R2 probes — hostname parsing alone does NOT constrain libpq's effective target):**

1. **Call-time resolution.** The URL is resolved inside the helper's execution path (the `execFileSync("psql", …)` call site, drafting locator :88), never at module top level, so import order stops deciding the target.
2. **Loopback refusal, with a DEFINED accept-set (accept-set discipline; R3 P1 — `devCaptureStaged`'s existing check is in fact a seven-name DENYLIST, drafting locator :66, and a denylist accepts whatever it did not model).** The shared resolver's query-parameter contract is a true allowlist, defined here: it ACCEPTS exactly the non-target tuning parameters `connect_timeout`, `application_name`, and `sslmode`; it REFUSES every other query parameter by name — the known steering channels `host`/`hostaddr`/`service` (R1 probe: `?host=`/`?hostaddr=` steered a loopback hostname; R2 probe: `?service=probe` steered a loopback authority to `192.0.2.3`) and every parameter outside the accept-set alike, so an unmodeled libpq channel fails loud rather than passing silent. A benign-but-unlisted parameter being refused is the documented limit below (§4 limit 8), satisfying the consequence bound: conservative refusal plus a named signal, never a silent wrong target. The refusal error names the resolved target, the channel that supplied it, and the escape hatch — explicit `LOCKED_FIXTURE_ALLOW_REMOTE=1` (aligned with the observe CLI's `--env` guardrail posture) — replacing today's misleading "run `pnpm db:seed`?" symptom. Migrating both helpers onto the shared resolver must not turn anything they currently REFUSE into an acceptance (the allowlist only tightens; `devCaptureStaged`'s port/database/credential protections carry over verbatim).
3. **Scrubbed child environment, with the default service file neutralized.** The psql spawn receives the parent env with every `PG*` variable removed (R1 probe: ambient `PGHOSTADDR=192.0.2.2` overrode a loopback URL) AND `PGSERVICEFILE` pointed at an empty/nonexistent path — scrubbing alone leaves `HOME` in place and libpq falls back to the libpq user service file (pg_service.conf in the home directory), the R2 probe's second `service` channel. The connection string is self-contained, so nothing legitimate is lost; the opt-in restores the ambient env verbatim.

**Every DSN entry point routes through the resolver** — including `devCaptureStaged`'s explicit dsn arguments (`seedStagedRow(options.dsn)` drafting locator :538 and the `runLockedSql` dsn parameter), not only the env-derived default; an argument path that bypassed the resolver would reopen the class through the caller.

**TDD.** New unit suite under `tests/e2e/helpers/`, file "lockedCrewRestriction.unit.test.ts" (created by this arc; vitest, no DB — plan confirms its testMatch wiring): (a) RED — with `TEST_DATABASE_URL` set to a non-loopback URL after import, the helper refuses (fails pre-fix because module-load capture + no guard sends it through); (b) call-time proof — env var changed between import and call is honored; (c) loopback + opt-in paths pass through to the psql invocation (spawn stubbed). The production e2e path is exercised by the existing suites on a loopback stack (unchanged behavior there).

**Class-sweep disposition (authored AND run, 2026-08-09; corrected per R1 F3 — the earlier draft's "full sweep" table was built from a truncated `head -10` read of a 246-line result, which is exactly the sweep-authoring failure the writing-plans rule warns about).** The defect CLASS is "a test helper capturing a psql write target at module load". The repo-wide pattern `rg -n 'TEST_DATABASE_URL \?\?' --glob '*.ts'` returns 246 lines across 212 files — dominated by `tests/db/**` / `tests/sync/**` suites and lib server code for which reading `TEST_DATABASE_URL` at function scope is the documented, intended contract — so the CLASS sweep is the scoped command, run verbatim:

`rg -n 'TEST_DATABASE_URL \?\?' tests/e2e/helpers --glob '*.ts'`

Exactly two hits, both in class, BOTH repaired in this PR:

| Hit | Disposition |
| --- | --- |
| `tests/e2e/helpers/lockedCrewRestriction.ts:50` | The filed defect — repaired. |
| `tests/e2e/helpers/devCaptureStaged.ts:39` | Same class (module-load capture feeding `runLockedSql`'s default, `seedStagedRow`, `cleanupStagedRow`; its partial `LOOPBACK_HOSTS` check is subsumed). Repaired via the same shared resolver. |

Both helpers consume ONE extracted resolver, so the contract cannot drift between them and the unit suite's refusal cases cover both. Boundary note for the wider 246-line result: production lib callers resolve at call time inside functions and deployments intentionally supply these vars (different contract, N/A); operator-invoked seed scripts (`supabase/seed.ts`, `supabase/seedWalkerFixtures.ts`) target `TEST_DATABASE_URL` on purpose with `pnpm preflight` already warning on non-loopback (N/A); playwright configs pass env through to webServer (N/A). The plan re-runs the scoped command at implementation time and reconciles any new hit by name.

### §2.7 BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE — the arithmetic gap assertion

Ratified approach (§1.1 item 2): no harness redesign; the live entry keeps mounting components in isolated `<div data-mount>` blocks (`tests/e2e/_tapTargetFloorLiveEntry.tsx`, drafting locator :148). What ships is the assertion the entry sketched: for each of the three uncovered targets, pin that the container's own gap keeps the 8px/side expansion band from reaching an interactive neighbour.

The three targets and their containers (re-verified 2026-08-09; the entry's hand-trace "no interactive neighbour sits in any band today" is the state being pinned):

| Target | Container + gap |
| --- | --- |
| HelpSheet trigger | `components/admin/wizard/Step3Review.tsx:1312` area, `gap-2` |
| HelpTooltip trigger | `components/admin/StagedReviewCard.tsx:464` (`flex flex-wrap items-center gap-2`; the entry's `wizard/` prefix had rotted) |
| HelpSheet close | `components/admin/HelpSheet.tsx:167` area, `gap-3` |

**Assertion shape (extends `tests/e2e/tap-target-floor.layout.spec.ts`, same real-browser harness; per-container assignment FIXED here, not delegated — R1 F6 caught the earlier draft re-opening the ratified no-harness-redesign decision).** The live entry mounts `HelpSheet` and `HelpTooltip` directly (probed 2026-08-09; `tests/e2e/_tapTargetFloorLiveEntry.tsx` :180/:187), so:

- **HelpSheet close** (`components/admin/HelpSheet.tsx:167`, `gap-3` — inside the mounted sheet): MEASURED — open the sheet, `getComputedStyle` the row, assert `gap ≥ EXPANSION_BAND_PER_SIDE` (8, the suite's existing constant — cross-referenced, not re-literaled) on every axis an interactive sibling can adjoin.
- **HelpSheet trigger container** (`components/admin/wizard/Step3Review.tsx:1312`, `gap-2`) and **HelpTooltip container** (`components/admin/StagedReviewCard.tsx:464`, `gap-2 flex-wrap`) — NOT in any mounted subtree: STATIC PIN — a source-scan assertion that the cited container line still carries a `gap-*` utility resolving to ≥ the band, with a premise that the class string is found (a refactor that moves it fails the premise, never silently passes). No mount is widened; the harness stays a component mount per §1.1 item 2. **Premise:** each case asserts the container carries the expected `gap-*` utility before measuring, so a refactor that moves the gap to a child wrapper fails the premise instead of measuring the wrong box. **Failure mode caught (anti-tautology):** mutant #14 from the tap-target arc — collapsing the container to `gap-0` so a grown target overlaps its neighbour — now fails by name; today it passes the committed suite for these three containers.

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
4. **§2.6's guard protects the two in-class e2e helpers (via the shared resolver).** A future e2e helper that grows psql writes must adopt the same resolver; the scoped sweep command is the detection, and the plan re-runs it at implementation time.
5. **§2.7 asserts gap arithmetic, not production adjacency.** The production neighbour inventory stays hand-traced (entry's probe); a page-level harness remains out of scope per ratification.
6. **§2.2's guard does not judge `--breakpoint-*` arrow forms.** No token-preserving canonical utility exists for that namespace (R2 probe: `min-w-sm` resolves `--container-sm`, not `--breakpoint-sm`), so the arrow form is the correct spelling there and the guard deliberately leaves it alone — a namespace exclusion for a form with ZERO live uses today (R3 census), stated here so a later reader neither "fixes" a legitimate future use nor reads the exclusion as covering live code.
7. **§2.6's refusal covers URI/env target channels, not filesystem trust.** An operator who writes a malicious libpq user service file (pg_service.conf in the home directory) AND passes the explicit opt-in is outside the threat model (accidental misconfiguration, not adversarial local users).
8. **§2.6's accept-set refuses benign-but-unlisted query parameters** (anything beyond `connect_timeout`/`application_name`/`sslmode`): a legitimate new tuning parameter fails loud with its name in the error until it is added to the accept-set — the deliberate cost of never admitting an unmodeled steering channel silently.

## §5 Acceptance criteria

- **AC-M1** (§2.1+§2.2): `eslint.config.mjs` comment updated (own commit); `app/globals.css` claim states the measured mechanism (plugin-enforced majority + measured silent residue + guard); `themeTokenArrowBan` guard exists, parsed ≥30 declared tokens (premise), observed RED pre-sweep with the measured hit census in the commit, green post-sweep; `rg 'shadow-\(--shadow-(tile|popover)\)' app components lib` reports only deprecation-comment hits.
- **AC-M2** (§2.3): nine consts cn-wrapped; planted-violation silence observed pre-wrap and report observed post-wrap, both recorded; census sweep dispositions in PR body; `pnpm lint` green.
- **AC-M3** (§2.4): BACKLOG entry re-dispositioned to watch with trigger + probe recorded; no registry row shipped.
- **AC-M4** (§2.5): pin set green with observed-RED transcript; Werner grep flips to hits; premise on empty owner ids present.
- **AC-M5** (§2.6): unit suite green incl. observed-RED on the refusal case; call-time resolution proven; the `?host=`/`?hostaddr=`/`?service=` query channels, the `PG*` env channel, and the default-service-file channel (`PGSERVICEFILE` neutralized) each have a refusal case; every query param outside the defined accept-set (`connect_timeout`/`application_name`/`sslmode`) refused by name; BOTH in-class helpers consume the shared resolver through EVERY dsn entry point (env default AND explicit dsn args), with `devCaptureStaged`'s pre-existing protections asserted as preserved; sweep reconciled at implementation time.
- **AC-M6** (§2.7): three containers asserted (form per container documented); mutant #14 shape fails by name on each covered container.
- **AC-M7**: full suite + typecheck + lint + format green locally; real CI green pre-merge; six archives + the watch flip land with markers stripped.

impeccable-gate: run — §2.2/§2.3 touch `components/**` class strings (zero expected visual delta; dual gate still runs on the affected diff)
