# Handoff — X.1: No-orphan-error-codes three-way §12.4 parity (AC-X.1)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend audit, no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews; per ROUTING.md "Reviewer pairing logic" + memory `feedback_iterate_until_convergence.md`).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md` — Task X.1 only (Tasks X.2–X.6 are separate handoffs).

> X.1 is the first of six cross-cutting audit tasks (X.1–X.6). Each is its own handoff, its own adversarial-review cycle, its own milestone-style close-out. There is **no §A/§B split** here — X.1 is pure backend (build-time extractor + Vitest meta-test + manifest + four regression fixtures); the UI hard rule is N/A because no file under `app/` (outside `app/api/**`), `components/`, or design tokens is touched.

> **X.1 is the gate for M12 Phase B.** M12 Phase B (`docs/superpowers/plans/2026-05-12-user-facing-docs/02-catalog-extension.md`) extends `MessageCatalogEntry` with three new fields (`title`, `longExplanation`, `helpHref`) and mutates the shared catalog. The 00-overview.md cross-reference is explicit: "finish X.1 catalog parity audit before M12 Phase B starts, OR pin Phase B's catalog-row additions against the X.1 audit baseline so the parity assertion sees a known-good starting state." If X.1 surfaces spec ↔ catalog drift on the existing four fields, that drift MUST be reconciled in X.1's scope **before** M12 Phase B starts. Letting drift survive into M12 Phase B's baseline ratifies the drifted state into perpetuity (the M12 catalog meta-test would lock it in). Treat X.1 as the gate, not as an optional polish pass.

> **X.1 will surface findings on M5/M8/M9/M10 catalog rows.** Per memory `feedback_deferral_discipline.md`: small mechanical fixes (catalog text drift, missing `helpfulContext` entry, orphan catalog row, mis-classified retired code) land **now** as fix commits inside X.1's scope. They do **not** go to `DEFERRED.md` and do **not** wait for M12. The only deferral candidate is a drift that requires a spec amendment to resolve — and that amendment lands before X.1 closes, not as future work.

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§12.4** — User-facing message catalog (entire section: prose preamble, the 4-column markdown table covering Auth / Sync / Drive / Parser / Wizard / Onboarding / Bug-report / Stale-data subsections, the `~~strikethrough~~` retired-code rows, and the trailing `<!-- §12.4 helpfulContext appendix -->` YAML block). This is **the** canonical input the X.1 extractor parses.
- **§12.4 helpfulContext appendix** — anchored by the HTML comment `<!-- §12.4 helpfulContext appendix -->` and fenced as a single YAML code-block immediately following the markdown table. Per spec §12.4 Batch-10 Fix 1: this is the source of truth for the `helpfulContext` field; any prose describing `helpfulContext` outside the appendix is non-authoritative.
- **§13.1** — "Something looks wrong?" footer + report channel boundaries (Doug-fault vs developer-fault vs ops-fault). Not directly parsed by the extractor, but X.1 watchpoints reference §13.1 as the canonical example of why three-way parity matters at the per-field level (M8 R2 M2 shipped a §13.1-violating subhead via a `/impeccable critique` disposition). Re-read §13.1 verbatim if any X.1 finding touches report-pipeline copy (`REPORT_*` rows, `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`, etc.).
- **§17.2 (AC-X.1, AC-X.6)** — the AC bodies that X.1 must satisfy. AC-X.6 names the required CI status check `x1-catalog-parity` verbatim; the test must be wired as a separately-named project/script that CI exposes under that name.
- **§9.0.1 / plan Task 10.9** — the `<ErrorExplainer code="<X>" />` and `messageFor(<X>, ...).dougFacing` renderer call-sites X.1's cross-check walks (the "Task 10.9 messageFor coverage cross-check" sub-invariant inside the extractor).

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2):**

- **AC-X.1** — **§12.4 catalog ↔ runtime parity (full row payload).** Build-time generator parses §12.4 prose into `SPEC_CODES` (active) + `RETIRED_CODES` (retired) carrying the full row payload (`dougFacing`/`crewFacing`/`followUp`/`helpfulContext`); runtime catalog (`lib/messages/catalog.ts`) is loaded; the parity test asserts (a) field-by-field deep equality of every active code, (b) every retired code is absent from runtime, (c) duplicate-active dedup invariant uses the full row hash as key, (d) every code reachable from at least one fixture or synthesized scenario via the code-to-scenario registry. Failure emits named diffs (`+missing_in_runtime:CODE`, `-extra_in_runtime:CODE`, field-level `dougFacing differs for CODE`). NOT a flat `git grep` set comparison.

> **Spec/code path-name reconciliation.** Spec §17.2 says `lib/errors/catalog.ts`; the actual file is `lib/messages/catalog.ts` (verified at HEAD — `lib/errors/` does not exist). The runtime catalog lives at `lib/messages/catalog.ts`; X.1 imports from there. If the implementer believes the spec should be patched to match, surface as a finding rather than silently diverging — but for this handoff, the canonical path is `lib/messages/catalog.ts`.

**Task-internal sub-criteria (from plan Task X.1, `11-cross-cutting.md:7-173`):**

- The extractor at `scripts/extract-spec-codes.ts` exists and:
  - Parses the §12.4 markdown table (4-column shape: `Code | trigger | Doug-facing | Crew-facing | Follow-up`).
  - Parses the §12.4 helpfulContext YAML appendix anchored by `<!-- §12.4 helpfulContext appendix -->`.
  - Normalizes `—` (em-dash) / empty cell / `(admin log only ...)` parenthetical preamble to `null` per §12.4 Conventions.
  - Classifies `~~strikethrough~~` rows into a separate `RETIRED_CODES` set; never merges them into `SPEC_CODES`.
  - Emits the four-field `SpecCodePayload` (`dougFacing` / `crewFacing` / `followUp` / `helpfulContext`) per code into `lib/messages/__generated__/spec-codes.ts` (committed, regenerated by CI).
  - Enforces the four invariants from plan Task X.1 Step 1 part 3 (missing YAML entry for non-null dougFacing → fail; orphan YAML key → fail; YAML entry for admin-log-only code → fail; pseudo-null sentinel text in the table → fail).
  - Cross-checks every `messageFor(<X>, ...).dougFacing` and `<ErrorExplainer code="<X>" />` call site against the YAML appendix (Task 10.9 coverage check).
- All four documented regression fixtures exist under `tests/cross-cutting/fixtures/extract-spec-codes/` and the extractor's behavior on each is asserted: `bad-missing-helpful-context.md`, `bad-orphan-yaml-key.md`, `bad-yaml-entry-for-null-dougfacing.md`, `good-complete.md`.
- The three-way parity test at `tests/cross-cutting/codes.test.ts` deep-compares every code's four `SpecCodePayload` fields between `SPEC_CODES` and `MESSAGE_CATALOG`. It is NOT a `Object.keys`-only comparison.
- The retired-codes inverse-invariant test asserts no source file across `lib/**/*.{ts,tsx}`, `app/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`, `middleware.{ts,tsx}` references any code in `RETIRED_CODES`, and that `RETIRED_CODES ∩ MESSAGE_CATALOG = ∅`.
- The CI workflow exposes the test as a status check named `x1-catalog-parity` (verbatim — required by AC-X.6's named-check list at spec §17.2).
- Recently-added rows (`BOOTSTRAP_GENERIC` and `NETWORK_UNREACHABLE`, both landed 2026-05-19 via SHA `36a2671` after spec amendment SHA `ba4e8b7`) parse cleanly and deep-compare equal between `SPEC_CODES` and `MESSAGE_CATALOG`.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [ ] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [ ] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

**Catalog-affecting spec amendments through 2026-05-19 — IN SCOPE as X.1's audit-input baseline. Confirm all three are integrated in §12.4 before X.1 starts:**

1. **2026-05-12 — `AGENDA_*` catalog codes** (SHA `7f836b6` + ratification trail `5a8e61f`..`0aa1f9c`). Adds `AGENDA_GONE_FOR_CREW` (410) and `AGENDA_UNAUTHENTICATED` (401) to §12.4 with crew-facing copy. M9 Cluster C6 consumed them.
2. **2026-05-14 — Admin-allowlist runtime-mutable** (SHA `e060766`, amendment file `docs/superpowers/specs/amendments/2026-05-12-admin-allowlist-runtime-mutable.md`). Adds no new §12.4 rows directly, but introduces `ADMIN_EMAILS_TABLE_MISSING` / related catalog rows the M9 C9 cluster wired.
3. **2026-05-19 — §12.4 catalog cleanup (M9 spec-amendment debt close)** (SHA `ba4e8b7`, paired with catalog wiring SHA `36a2671` and POLISH-D1/D2/D3 close SHA `a193fac`). Corrects the `PARSE_ERROR_LAST_GOOD` crew-facing copy typo and adds two NEW rows: `BOOTSTRAP_GENERIC` (consolidates §A bootstrap errors that reach the server) and `NETWORK_UNREACHABLE` (client-side fetch failed before reaching the server).

Verification command at kickoff: `git log --since=2026-05-12 -- docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` should show the three amendments above. If anything from the list is missing in §12.4 at HEAD, surface as a P0 — do not start X.1 against a stale baseline.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed (M10 closed at SHA `28410a9` per `handoffs/M10-onboarding.md:1`). Current `git rev-parse --short HEAD` at handoff authoring is `428431f docs(plan): cross-reference M12 sibling plan in FXAV 00-overview`. Working tree clean.
- [ ] **Pre-flight tests passing in isolation** (verify at kickoff):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 (M10 close-out baseline at SHA `28410a9`; re-verify post-`a193fac` POLISH-D1/D2/D3 close + post-`36a2671` BOOTSTRAP_GENERIC/NETWORK_UNREACHABLE catalog wiring).
  - `pnpm verify:spec-amendment` exits 0.
- [x] **Specific files present from prior milestones**:
  - `lib/messages/catalog.ts` — present with 139 entries at HEAD (post `36a2671`). Type is `MessageCatalogEntry` with fields `code` / `severity?` / `dougFacing` / `crewFacing` / `followUp` / `helpfulContext`. **Schema matches the spec's `SpecCodePayload` four-field shape exactly** (plus the indexed `code` field and optional `severity` which are runtime-only, not spec-§12.4 columns; the parity test ignores those).
  - `lib/messages/lookup.ts` — `messageFor()` reader; `MessageCode` is derived from `MESSAGE_CATALOG` keys.
  - `tests/messages/_metaAdminAlertCatalog.test.ts` — exists (M5-shipped, M6/M7/M8/M9/M10-extended). The producer-completeness meta-test that covers `admin_alerts` PRODUCER codes is registry-shaped; X.1 may extend it if Task X.1 plan requires.
  - `tests/messages/no-inline-error-strings.test.ts` — exists (M9 Cluster C7 / M5-D8 close). Asserts no inline raw error-code literal strings in `components/**/*.tsx` / `app/**/*.tsx`. This is the M5-D8 producer-side enforcement of AGENTS.md §1.5; X.1 is the spec-side counterpart.
  - `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §12.4 — present at lines 2683-2882 (table) + 2856-end-of-YAML-block (appendix).
- [x] **NEW X.1 deliverables** (the implementer creates these):
  - `scripts/extract-spec-codes.ts` — the §12.4 extractor.
  - `lib/messages/__generated__/spec-codes.ts` — the committed manifest (regenerated by CI).
  - `tests/cross-cutting/codes.test.ts` — the three-way parity test.
  - `tests/cross-cutting/fixtures/extract-spec-codes/` — the four regression fixtures (`bad-missing-helpful-context.md`, `bad-orphan-yaml-key.md`, `bad-yaml-entry-for-null-dougfacing.md`, `good-complete.md`).
  - `tests/cross-cutting/code-scenarios.ts` — the code-to-scenario registry (one entry per active `SPEC_CODES` code mapping to a named test scenario per plan Task X.1 Step 2).
  - `.github/workflows/x-audits.yml` extension OR equivalent — wires `x1-catalog-parity` as a separately-named PR-required status check.
- [x] **DEFERRED.md** — confirmed no X.1 sub-items pre-listed (grep `X.1\|X1\|catalog` shows only the deferral-discipline narrative + M5/M7/M9 closed entries; no Open X.1 items).

If any of the above is not met, do not start X.1; open a question.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always applies. Each extractor sub-step ships failing-test-first: write the assertion (one of the four regression fixtures, or one assertion in `codes.test.ts`), watch it fail, implement minimal extractor logic, commit. Do NOT batch.
- [x] **Per-show advisory lock** (invariant 2) — **N/A.** X.1 doesn't mutate any locked surface.
- [x] **Email canonicalization** (invariant 3) — **N/A.** X.1 doesn't read emails from external sources.
- [x] **No global cursor** (invariant 4) — **N/A.** X.1 doesn't touch sync.
- [x] **No raw error codes in user-visible UI** (invariant 5) — **X.1 IS the canonical spec-side audit for this invariant.** The three-way parity test is the structural enforcement (drift in either direction fails the build). The renderer-side counterpart (`tests/messages/no-inline-error-strings.test.ts`) already exists; X.1 closes the loop from the spec side.
- [x] **Commit per task** (invariant 6) — always applies. Conventional-commits format: `<type>(<scope>): <summary>`. Common scopes for X.1: `messages`, `cross-cutting`, `scripts`, `test`. Example commits:
  - `scripts(messages): bootstrap §12.4 markdown-table extractor (Task X.1 Step 1a)`
  - `scripts(messages): parse §12.4 helpfulContext YAML appendix (Task X.1 Step 1b)`
  - `test(cross-cutting): regression fixtures for spec-codes extractor (Task X.1 Step 1c)`
  - `feat(messages): commit __generated__/spec-codes.ts manifest (Task X.1 Step 1d)`
  - `test(cross-cutting): three-way §12.4 / catalog / scenario parity (AC-X.1)`
  - `ci(audits): wire x1-catalog-parity as PR-required status check`
- [x] **Spec is canonical** (invariant 7) — X.1's whole point. If the extractor finds drift between spec §12.4 and `lib/messages/catalog.ts`, the **spec wins** — fix the catalog, not the spec, unless the drift indicates a spec error (in which case open a question for a spec amendment; do not silently fix the spec).
- [x] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.1 touches `scripts/`, `lib/messages/__generated__/`, `tests/cross-cutting/`, `.github/workflows/`. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. Section 12 below is marked N/A.
- [x] **Supabase call-boundary discipline** (invariant 9) — N/A for X.1's own code (the extractor + parity test make no Supabase calls); **but X.1 may surface §1.9 violations as findings** if the audit unintentionally walks into producer call sites where catalog codes are emitted alongside Supabase calls. If found, those fixes are routed to the relevant milestone (typically M5/M10 since those owned the auth + onboarding helpers); X.1 does not silently absorb them.

## 6. Watchpoints from prior adversarial review

Pulled forward from the convergence logs of every prior catalog-touching milestone (M5/M8/M9/M10). The class-recurrence count is meaningful — these are the failure modes that have actually fired on this surface, not hypothetical.

1. **Code-shape-based class-sweep, NOT name-list-based** (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`). The extractor's producer-site discovery for the Task 10.9 cross-check (and the retired-codes inverse-invariant test) MUST walk every `.ts` / `.tsx` file under `app/`, `lib/`, `middleware.ts` for the code-shape pattern (`messageFor\(['"]\w+['"]`, `<ErrorExplainer\s+code=['"]\w+['"]`, raw `['"][A-Z_]{2,64}['"]` literal in JSX attribute context for the inverse test). It MUST NOT be a hardcoded list of files. A new producer surface in a future directory must be caught automatically. M5 R3–R22 and M10 close-out R6 §B both hit this class — code-shape detection rules were the eventual fix in both.
2. **`helpfulContext` YAML appendix discipline** (per Task X.1 Step 1 part 3). The four invariants are: (a) every code with non-null `dougFacing` has a non-null `helpfulContext` YAML entry; (b) no orphan YAML keys; (c) admin-log-only codes (`dougFacing: null`) MUST omit YAML keys; (d) the em-dash sentinel discipline (`—` / empty cell / `(admin log only ...)` parenthetical preamble) is the ONLY canonical null marker — pseudo-null sentinels (`null`, `none`, `n/a`, prose like "no Doug-facing message") fail extraction. Round-1 adversarial findings on Task X.1's plan body itself surfaced multiple sentinel-discipline ambiguities; the X.1 implementer must keep this list of four invariants intact.
3. **Anti-tautology** (CLAUDE.md writing-plans additions; AGENTS.md project-scoped mirror). The parity test must NOT compare `SPEC_CODES.keys` to `MESSAGE_CATALOG.keys` only — that's two-way set parity, which proves IDs match but says nothing about whether the actual user-facing copy in each column matches. The required assertion is per-row deep-compare across all four `SpecCodePayload` fields (`dougFacing`, `crewFacing`, `followUp`, `helpfulContext`) per code. A `dougFacing` edit in §12.4 that doesn't propagate to `catalog.ts` MUST fail the test the same way a missing code does.
4. **Recently-added rows are the most likely drift sites.** `BOOTSTRAP_GENERIC` and `NETWORK_UNREACHABLE` both landed on 2026-05-19: spec via amendment SHA `ba4e8b7` (13:18 CST), catalog wiring via separate SHA `36a2671` (13:30 CST), POLISH-D1/D2/D3 close via SHA `a193fac` (later). Confirm both rows parse cleanly into `SpecCodePayload` and deep-compare equal between `SPEC_CODES` and `MESSAGE_CATALOG` entries on the first run of the parity test. The 2026-05-12 `AGENDA_*` amendment is older and has been catalog-resident since SHA `b7ac297`, but verify those rows too.
5. **Same-vector recurrence rule** (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`). If 3+ adversarial-review rounds in a row identify findings on the same vector (e.g., "catalog text differs from spec by whitespace"; "YAML appendix entry uses smart quotes instead of straight quotes"), pause per-instance patching and ship a structural defensive layer: extend the extractor with a normalization pass, or add a meta-test row, or extend the parity assertion to cover the class. Don't ship the same patch shape across 4+ rounds.
6. **Retired-codes classification.** §12.4 currently has at least two strikethrough rows (verified at HEAD: `~~OAUTH_STATE_INVALID (operator-log-only variant)~~` at line 2712 and `~~OAUTH_REDIRECT_INVALID (operator-log-only variant)~~` at line 2713). Both retire to canonical user-visible rows in the **Auth — OAuth round-trip** subsection. The extractor MUST classify these into `RETIRED_CODES` (NOT `SPEC_CODES`) and the parity test MUST verify NO retired code appears in `MESSAGE_CATALOG`. Note the canonical (non-struck) `OAUTH_STATE_INVALID` row remains active and has both crew-facing and Doug-facing copy — the strikethrough is on the variant, not the canonical row. The extractor must distinguish reliably.
7. **Task 10.9 messageFor cross-check coverage.** For every code rendered via `messageFor(<X>, ...).dougFacing` or `<ErrorExplainer code="<X>" />` call site (whether in M10's `ErrorExplainer.tsx`, M9's various error surfaces, or any future renderer), X.1 cross-checks that `<X>` has a non-null `helpfulContext` entry in the YAML appendix. The rg procedure for finding these call sites MUST be code-shape-based (see watchpoint 1). M10 R10/R11 specifically called out `UNKNOWN_FIELD`, `PULL_SHEET_PARSE_PARTIAL`, and `WIZARD_ISOLATION_INDEXES_MISSING` as omission-shape cases — codes that had non-null dougFacing copy in the §12.4 table but were absent from the YAML appendix; the cross-check is the symmetric guard against that recurrence.
8. **Verify findings against the spec before patching** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding, verify the claim against §12.4 verbatim (and against `lib/messages/catalog.ts` verbatim) before changing code. Round-2 false positives have happened on this project (M7 R2 `supportsAllDrives` was a confident misdiagnosis); X.1's spec source is in-repo, so the verification cost is low — pay it.
9. **Deferral discipline** (memory `feedback_deferral_discipline.md`, codified post-M10 2026-05-19). Small mechanical fixes (one-row catalog text drift, one missing `helpfulContext` entry, one orphan catalog row) land NOW as X.1 fix commits. They do NOT route to `DEFERRED.md` and do NOT wait for M12 Phase B or X.6. POLISH-D1/D2/D3 (May 19) is the canonical post-mortem — 10 lines of fixes that almost shipped to `defer-to-harden` got correctly landed in 10 minutes.

## 7. Test commands

- **X.1 test suite (new home):** `pnpm test tests/cross-cutting/` — runs the parity test + the four regression fixtures + the typed code-to-scenario ledger and producer-presence assertions.
- **Existing meta-tests X.1 may extend:** `pnpm test tests/messages/` — runs `tests/messages/_metaAdminAlertCatalog.test.ts` (admin_alerts producer registry), `tests/messages/no-inline-error-strings.test.ts` (M5-D8 renderer-side enforcement of AGENTS.md §1.5), and any per-code coverage tests.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings.
- **CI status check name:** the workflow file (`.github/workflows/x-audits.yml` per spec §17.2, or equivalent) MUST expose the X.1 test as a status check named **`x1-catalog-parity`** verbatim. This is the required-check name in AC-X.6's seven-name list (`traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-rls-coverage`, `verify-branch-protection-status`).
- **Named audit script:** `pnpm test:audit:x1-catalog-parity` — script name matches the required status check name.
- **Local regenerate (developer ergonomics):** the extractor MUST be runnable as `pnpm tsx scripts/extract-spec-codes.ts` (or equivalent project-convention invocation). The committed `lib/messages/__generated__/spec-codes.ts` is regenerated by CI; if a developer edits §12.4, they regenerate locally and commit the manifest in the same PR — the CI step verifies the committed manifest is byte-identical to a fresh regenerate (drift = build failure).

## 8. Exit criteria

Concrete checklist; every item is checkable, not vibe-based.

- [x] All sub-steps in `11-cross-cutting.md` Task X.1 (Steps 1–3) checked off.
- [x] AC-X.1 has at least one passing test asserting each sub-criterion (a–d in spec body).
- [x] `scripts/extract-spec-codes.ts` exists and passes all four regression fixtures (`bad-missing-helpful-context.md`, `bad-orphan-yaml-key.md`, `bad-yaml-entry-for-null-dougfacing.md`, `good-complete.md` — exact filenames per Task X.1 plan).
- [x] `lib/messages/__generated__/spec-codes.ts` is committed; CI regeneration is byte-identical.
- [x] `tests/cross-cutting/codes.test.ts` deep-compares all four `SpecCodePayload` fields per code (not `Object.keys`-only).
- [x] Retired-codes inverse-invariant test passes: `RETIRED_CODES ∩ MESSAGE_CATALOG = ∅` AND no producer for any retired code under `lib/**`, `app/**`, `components/**`, `middleware.{ts,tsx}`.
- [x] Task 10.9 `messageFor` / `<ErrorExplainer>` cross-check passes for every active code.
- [x] `BOOTSTRAP_GENERIC` and `NETWORK_UNREACHABLE` (added 2026-05-19) parse cleanly and deep-compare equal between `SPEC_CODES` and `MESSAGE_CATALOG`.
- [x] `AGENDA_GONE_FOR_CREW` and `AGENDA_UNAUTHENTICATED` (added 2026-05-12) parse cleanly and deep-compare equal.
- [x] CI exposes the test as a status check named `x1-catalog-parity` verbatim. Spot-check by reading the workflow file.
- [x] `pnpm typecheck && pnpm lint && pnpm test` exits 0. The exact requested chain `pnpm test && pnpm lint && pnpm typecheck` also exits 0; lint still reports four pre-existing warnings in UI/test files outside X.1 scope.
- [x] No new `// TODO` or `// FIXME` lines unless explicitly justified.
- [ ] Adversarial review (per memory `feedback_adversarial_review_canonical_invocation.md`) converged to APPROVE. **Implementer note:** not run in this Codex pass because the X.1 invocation explicitly says adversarial review runs at milestone close and "DO NOT run an adversarial review of your own X.1 work."
- [x] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [x] Convergence log at the bottom of this file is filled in.

## 9. Sandbox / git protocol

- [ ] **Claude Code** — N/A (not the implementer for X.1).
- [ ] **Codex CLI default sandbox** — fallback only.
- [x] **Codex CLI with relaxed sandbox** — verified working since M5, used through M10. Commits run in-session. Verify before starting: `git status` from inside the Codex session must succeed without permission errors; if it fails, fall back to the default-sandbox protocol (patch out → human commits).
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin: `codex exec ... "$prompt" < /dev/null`. Without it, `codex exec` hangs indefinitely on stdin EOF in non-interactive contexts. Monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.

## 10. Adversarial review handoff

After the implementer (Codex) finishes:

1. Implementer summarizes what was built, which AC sub-criteria are satisfied, and lists any spec ↔ catalog drift findings the audit surfaced with their resolutions (fix commits, not deferrals — see watchpoint 9).
2. Adversarial reviewer (Opus / Claude Code) is invoked via the canonical `/codex:adversarial-review` slash command (per memory `feedback_adversarial_review_canonical_invocation.md`; never raw `codex-companion.mjs`). Suggested invocation:
   ```
   /codex:adversarial-review --background --base 428431f "X.1 cross-cutting catalog parity (single-implementer Codex audit) — see handoff §6 watchpoints + §8 exit criteria"
   ```
3. Reviewer iterates with implementer until convergence (per memory `feedback_iterate_until_convergence.md` — keep iterating until APPROVE; the round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces NEW bugs).
4. **Routing repair work** (memory `feedback_adversarial_review_repair_routing.md`): the reviewer never fixes; route findings by file ownership. X.1 is single-implementer Codex; almost every finding is Codex's. The exception: if review surfaces a finding that demands a spec amendment (e.g., §12.4 itself has an internal inconsistency the audit exposes), that's an orchestrator decision — surface for the user, do not silently amend the spec.
5. **Class-sweep before patching** (memory `feedback_class_sweep_before_patch.md`): when review surfaces a bug, grep the codebase for the same class BEFORE patching only the named instance. Per-instance whack-a-mole burns rounds.
6. **Whole-task close-out gate** (memory `feedback_whole_milestone_closeout_gate.md`): X.1 is small enough that the per-round review IS effectively the close-out gate; no separate "milestone integration" pass needed. But the final APPROVE must be against the milestone-base SHA (`428431f` at handoff time), not just the latest fix-base (memory `feedback_adversarial_review_full_milestone_scope.md`).
7. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.1 is M12 Phase B's prerequisite.** M12 Phase B (`docs/superpowers/plans/2026-05-12-user-facing-docs/02-catalog-extension.md`) extends `MessageCatalogEntry` with `title` / `longExplanation` / `helpHref`. Once X.1 closes APPROVED, M12 Phase B can extend the schema against the X.1-validated baseline. If X.1 surfaces drift that requires a spec amendment to resolve, the amendment lands BEFORE M12 Phase B starts. The shared file surface is `lib/messages/catalog.ts` — coordinate via the orchestrator if both run in parallel (per `docs/superpowers/plans/2026-05-12-user-facing-docs/ROUTING.md:57`).
- **X.6 traceability walker consumes the X.1 manifest.** X.6's `coverage.md` generator reads the SpecCodePayload manifest emitted at `lib/messages/__generated__/spec-codes.ts` to verify that every §12.4 code is anchored to an owning task. Verify the manifest shape matches what X.6 expects to consume (X.6's plan body at `11-cross-cutting.md` Task X.6 names the shape — re-read before declaring X.1 done).
- **X.2 (no raw error codes in user-visible UI) is independent of X.1** but related: X.2 is the JSX/AST audit; X.1 is the catalog parity audit. They cover different surfaces. X.1 does not block X.2.
- **No M5/M8/M9/M10 sub-tasks are blocking X.1.** All four are closed (M10 closed 2026-05-19 per `handoffs/M10-onboarding.md:1`); X.1 may surface findings on their catalog rows, in which case those fixes land in X.1's scope per watchpoint 9 (deferral discipline).

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.1 ships scripts, generated TypeScript manifests, Vitest meta-tests, and a CI workflow extension. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per the meta-test pre-declaration rule (memory `feedback_meta_test_at_plan_time_not_round_n.md`).

- [ ] **Supabase call-boundary discipline** (`tests/auth/_metaInfraContract.test.ts` / `tests/admin/_metaInfraContract.test.ts`) — **N/A.** X.1's own code makes no Supabase calls; if the audit surfaces a §1.9 violation on a producer call site, the fix is routed to the owning milestone (typically M5 or M10) and the meta-test extension lives there, not in X.1.
- [ ] **Sentinel hiding in optional text** (`tests/components/tiles/_metaSentinelHidingContract.test.ts`) — **N/A.** X.1 renders nothing; tile sentinel discipline is not in scope.
- [ ] **`admin_alerts` catalog completeness** (`tests/messages/_metaAdminAlertCatalog.test.ts`) — **EXTEND if needed.** The existing meta-test is the per-`admin_alerts`-producer registry; X.1's parity test is the spec-side counterpart. If the parity test surfaces a code whose `dougFacing` is non-null but is not registered as an `admin_alerts` producer (or vice versa), X.1 may extend this meta-test with a new row. Default expectation: X.1 does NOT extend it (the audit's job is the spec ↔ catalog three-way; producer-side registry coverage is the meta-test's existing job). Flag if expectations diverge during execution.
- [ ] **Advisory-lock topology** (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — **N/A.** X.1 adds no `pg_advisory*` callers.
- [ ] **No-inline-email-normalization** (`tests/admin/no-inline-email-normalization.test.ts`) — **N/A.** X.1 reads no emails.
- [x] **CREATE: three-way §12.4 ↔ catalog ↔ scenario parity** (`tests/cross-cutting/codes.test.ts`) — the canonical AC-X.1 meta-test. Deep-compares all four `SpecCodePayload` fields per code; asserts retired-codes inverse invariant; asserts no orphan codes in source.
- [x] **CREATE: extractor regression fixtures** (`tests/cross-cutting/fixtures/extract-spec-codes/`) — four synthetic spec excerpts pinning each invariant of the extractor's contract.
- [x] **CREATE: code-to-scenario registry** (`tests/cross-cutting/code-scenarios.ts`) — one entry per active code; compile-fails if a §12.4 code lacks a scenario or a scenario references a non-§12.4 code.
- [x] **CREATE: SpecCodePayload manifest** (`lib/messages/__generated__/spec-codes.ts`) — committed; regenerated by CI; the canonical X.6-consumable shape.

---

## Convergence log

- Implementer pass (2026-05-19): X.1 parity checks exposed parser warning producer orphans (`DAY_RESTRICTION_DOUBLE_LOCATION`, `PULL_SHEET_UNKNOWN_VARIANT`), §12.4/catalog drift in admin-alert rows, stale ASCII-arrow expectations for agenda follow-up copy, and a retired `FIRST_SEEN_REVIEW` emission in `runManualStageForFirstSeen`. Resolved in-scope with spec/catalog/test/code fixes; no deferrals.
- Verification (2026-05-19): `pnpm test && pnpm lint && pnpm typecheck` exits 0. Lint reports four pre-existing warnings outside X.1 scope.
- R1 adversarial review (2026-05-19, Opus): NEEDS_FIXES. F1 tautological `CODE_SCENARIOS`; F2 X.1 backfill format drift; F3 implicit `rg` dependency; F4 retired-code scan narrower than plan; F5 script name mismatch; F6 unsorted generated manifest keys. Disposition in R1 fix commit: F1 fixed by removing the tautological emission assertion and documenting producer-presence scan as the chosen proof; F2 fixed by normalizing the backfill table and catalog; F3 fixed by replacing `rg` shellouts with JS source walkers; F4 fixed by widening retired-code literal scanning with explicit legacy-display allowlist; F5 fixed by renaming the script to `test:audit:x1-catalog-parity`; F6 fixed by sorting generated object keys. F7/F8 remain deferred as instructed.
- R1 verification (2026-05-19): `pnpm test:audit:x1-catalog-parity` exits 0; `pnpm test && pnpm lint && pnpm typecheck` exits 0 with the same four pre-existing lint warnings.
- R2 adversarial review (2026-05-19, Opus): NEEDS_FIXES. P0-1 retired variant rows used parenthetical descriptors as manifest keys; P0-2 retired inverse-invariant did not model canonical-active + retired-variant collisions; H1 orphan-YAML fixture used substring assertion; H2 rendered `messageFor(...).dougFacing` detector had a fragile 160-character window; M1 source walker was duplicated; M2 workflow lacked the required audit artifact upload; L1 user-facing-docs spec deletion confirmed unrelated to X.1 and already present in the review base range.
- R2 disposition (2026-05-19): P0-1 fixed by emitting bare retired identifiers with `variant` metadata; P0-2 fixed by keeping strict source/catalog absence checks for genuinely retired codes while requiring variant metadata for active canonical collisions; H1 fixed with an exact orphan-YAML error assertion; H2 fixed with an unbounded multiline detector and a rendered-site fixture; M1 fixed by sharing `lib/messages/__internal__/walkSourceFiles.ts`; M2 fixed by uploading the generated-manifest diff and audit log with `if: always()`. Negative regression: temporarily restoring parenthetical retired keys failed `extract-spec-codes.test.ts` for the expected key mismatch; temporarily adding a `FIRST_SEEN_REVIEW` producer literal under `lib/messages/__internal__/walkSourceFiles.ts` failed `codes.test.ts` for the expected retired producer.
- R2 verification (2026-05-19): `pnpm test:audit:x1-catalog-parity` exits 0; `pnpm test && pnpm lint && pnpm typecheck` exits 0 with the same four pre-existing lint warnings. `actionlint` was not installed locally; workflow YAML parses via Ruby `YAML.load_file`, and `codes.test.ts` asserts the required `actions/upload-artifact@v4`, `if: always()`, diff, and log artifact wiring.
