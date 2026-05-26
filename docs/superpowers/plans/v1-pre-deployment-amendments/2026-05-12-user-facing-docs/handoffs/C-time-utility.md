# Handoff — M11 Phase C: Request-scoped time utility (Tasks C.1–C.4)

**Status:** CLOSED 2026-05-19 at SHA `6c7e6de` (R7 fix; the latest Phase C surface change). R8 cross-CLI adversarial review APPROVED 2026-05-19 at 90% confidence with zero findings.

**Handed off:** 2026-05-19 by Eric Weiss (orchestrator session "Orchestrator — M11").
**Implementer (§A — backend):** GPT-5.5 / Codex CLI via `codex exec` (per ROUTING.md row "C — Time utility"; `lib/time/` + `tests/time/` + `tests/help/` are Codex-owned per same row).
**Implementer (§B — UI):** Opus 4.7 / Claude Code (per AGENTS.md UI hard rule: `app/show/[slug]/_ShowBody.tsx`, `components/layout/Footer.tsx`, `components/shared/StaleFooter.tsx` are UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (cross-CLI; reviewer is the opposing-of-§A harness regardless of §B's own routing — Codex reviews the merged phase via `/codex:adversarial-review`-style invocation OR fresh subagent dispatch).
**Plan file:** `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/03-time-utility.md` (Tasks C.1 → C.4; r9-converged adversarial-review version).

> Phase C is **split-mode** with a **single pin-stop** after C.1. §A Codex ships C.1 (utility + full gating test suite) → PIN → §B Opus does C.2 (UI migration of `_ShowBody.tsx`/Footer/StaleFooter) AND §A Codex finishes C.3 (envelope coverage) + C.4 (grep guard) in parallel. The pin-stop is required because C.2's migration consumes the `nowDate()` signature + the ISO regex tolerance + the `length >= 16` secret guard pinned in C.1; without the pin, §B would build against an unstable contract.
>
> **Plan-vs-orchestrator-prompt note (resolved 2026-05-19, pre-kickoff):** the orchestrator-side kickoff outline used a different task-ordering (C.1 utility, C.2 unit gating tests, C.3 grep guard, C.4 page migration). The **canonical ordering is the plan body** (`03-time-utility.md`): C.1 utility + full three-precondition gate tests (TDD per AGENTS.md §1.1); C.2 UI migration; C.3 envelope coverage; C.4 grep guard. The plan-body ordering is r9-converged across nine prior adversarial-review rounds; do NOT swap.

---

## §0 Implementer split

### §A — Codex / backend tasks (ship first; UI consumes the pinned contract)

- **Task C.1** — `lib/time/now.ts` exporting `now(): Promise<string>` (returns ISO) and `nowDate(): Promise<Date>` (returns `Date`). Both gate on ALL THREE preconditions: (a) `process.env.ENABLE_TEST_AUTH === "true"`, (b) `Authorization: Bearer ${process.env.TEST_AUTH_SECRET}` matches and `TEST_AUTH_SECRET.length >= 16` (mirrors `app/api/test-auth/set-session/route.ts:95`), (c) `X-Screenshot-Frozen-Now: <ISO 8601>` header present + ISO-regex screened + `Date.parse()` non-NaN. Outside a request scope (build-time RSC compilation), `await headers()` throws → fall back to `new Date()`. The full **ten-case gating test suite** lands in `tests/time/now.test.ts` in the SAME commit as the implementation per the r2 restructure (TDD; the previous draft deferred gate tests to C.3 and shipped C.1 with smoke tests only — that violated AGENTS.md §1.1 for a security-sensitive surface). Spec: §3.6.2 Fixed-clock row + AC-11.37.

  **PIN-STOP after C.1** — Codex stops, reports the final `now()` / `nowDate()` signatures + the ISO regex (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/`) + the `length >= 16` secret guard + the throw-outside-request-scope fallback contract. Opus's C.2 consumes this directly.

- **Task C.3** — Append a second `describe` block to `tests/time/now.test.ts` with three NEW envelope-coverage cases (NOT duplicates of C.1's gate tests, per r2 restructure + r3 append-only fix): (a) capture-boundary — same frozen header returns byte-identical ISO across a 60+s fake-timer wall-clock advance; (b) header casing tolerance via the lower-casing mock; (c) Bearer prefix case-sensitivity (`bearer ...` rejected). The verify-red-via-restore protocol fires here (r4 fix uses deterministic `return new Date()` after auth, NOT `Math.random()` which could randomly pass).

- **Task C.4** — Create `tests/help/_metaServerTimeGuard.test.ts` — the server-time grep guard (test #16 / AC-11.38). Walks `.ts`/`.tsx` under scan roots derived from `scripts/help-screenshots.manifest.ts` if it exists (Phase F lands the manifest; pre-Phase-F fallback scans `app/show`, `app/admin`) + always-included `components/` (per r3 cross-phase fix — components are imported BY app routes and must be in scope). Uses a tiny **lexer-based** `stripComments()` (r9 fix — regex stripping false-negatives on string literals containing `//`) + non-global `FORBIDDEN_PATTERNS` regexes (r2 fix — `/g` flag silently drops adjacent multi-line matches) + directive-prologue-correct `isClientComponent()` (r5/r6 fix — must be the FIRST non-comment statement, terminated by `;`/EOL, NOT just any string literal `"use client"` anywhere in the file). Per-line `// not-render-side: <reason>` waiver convention for mutation-path call sites. Add per-line waivers to `app/admin/actions.ts`, `app/show/[slug]/p/actions.ts`, `app/admin/dev/actions.ts` (write-only mutation timestamps) in the same commit.

### §B — Opus / UI tasks (after Pin-stop 1)

- **Task C.2** — Migrate the render-side `new Date()` call sites in three server-rendered surfaces (the C.4 guard scans these, EXCLUDING `"use client"` files per r4 / C-r3 finding 1):
  - `app/show/[slug]/_ShowBody.tsx:83` — `const today = new Date()` (the plan body cites `page.tsx:697`; the actual call site has moved to `_ShowBody.tsx` per M10 §B Task 10.8's body extraction; see §6 watchpoint #1 below).
  - `components/layout/Footer.tsx:105` — `const year = new Date().getUTCFullYear()`.
  - `components/shared/StaleFooter.tsx:27, 72` — `now ?? new Date()` default branch.

  For each: ship the failing source-file structural test FIRST (red), then the minimal-edit migration. The plan body's r6 ordering (RED→implementation) is canonical; do NOT reorder. The plan body covers each surface in detail in Task C.2 Step 5b — read it cover-to-cover before editing.

  **Critical structural deviation from plan body:** the plan body example diff at line 383 assumes `ShowPage` is the immediate parent of the IIFE that holds `const today = new Date()`. The current HEAD has the call site INSIDE `app/show/[slug]/_ShowBody.tsx:83`, which is a **synchronous** server component (`export function ShowBody(...): ReactNode`) imported by BOTH `app/show/[slug]/page.tsx` AND `app/admin/show/[slug]/preview/[crewId]/page.tsx`. Two options for the migration:
  - **Option A (preferred):** make `ShowBody` async (`export async function ShowBody(...): Promise<ReactNode>`), call `const today = await nowDate()`, and update BOTH callers to `await ShowBody(...)`. Verify both call sites compile and that the e2e suite still passes.
  - **Option B:** hoist `today` to the caller — `page.tsx` and `preview/[crewId]/page.tsx` each `const today = await nowDate()` and pass it as a `today: Date` prop. `ShowBody` stays synchronous; signature widens by one prop.

  Pick at C.2 time based on which is the smaller diff in practice; surface the chosen option in the C.2 commit body so the reviewer can verify.

### Coordination protocol

Single pin-stop after C.1; one §B task (C.2) consumes the pin. §A Codex finishes C.3 + C.4 in parallel with §B Opus's C.2 — none of those three task surfaces overlap. If C.4 fires before C.2 lands, the guard will report violations at `_ShowBody.tsx:83`, `Footer.tsx:105`, `StaleFooter.tsx:72` — that's an expected red state during the parallel window. Phase C closes when all four tasks committed AND the guard is green.

### Pin-stop 1 (C.1) — Pinned contract @ `9f2a37f`

| Item | Value |
| --- | --- |
| Pin-1 SHA | `9f2a37f` |
| `now()` signature | `export async function now(): Promise<string>` at `lib/time/now.ts:13` |
| `nowDate()` signature | `export async function nowDate(): Promise<Date>` at `lib/time/now.ts:23` |
| ISO regex (original Pin-1) | `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z\|[+-]\d{2}:\d{2})$/` |
| **ISO regex (post-R1 narrowing)** | `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/` — Z-only; per-component UTC round-trip added to reject calendar-impossible dates (e.g., `2026-02-31`). See R1 finding 1 closure at `ee62bb4` + §6 watchpoint #21. |
| Secret minimum length | `>= 16` chars (mirrors `app/api/test-auth/set-session/route.ts:95`) |
| Outside-request-scope behavior | `await headers()` throws → catch → return `new Date()` |
| Module-import alias | `@/lib/time/now` |
| Bearer prefix | Case-sensitive `Bearer ` (lowercase `bearer ` rejected — defense-in-depth) |
| Bearer prefix | Case-sensitive `Bearer ` (lowercase `bearer ` rejected — defense-in-depth) |

---

## §1 Session metadata

- **Session date(s):** TBD (kickoff after this handoff commits).
- **Implementer (§A):** GPT-5.5 / Codex CLI via `codex exec` (`< /dev/null` discipline per memory `feedback_codex_exec_needs_stdin_closed.md`).
- **Implementer (§B):** Opus 4.7 / Claude Code (this orchestrator session OR a fresh Opus subagent dispatch — TBD at C.2 dispatch time).
- **Reviewer:** Opus 4.7 / Claude Code (fresh subagent) for cross-model adversarial review of the merged Phase C diff. **Note:** §A is Codex, §B is Opus, so the reviewer is structurally Opus regardless (the cross-model partner against Codex's §A bulk). Phase A reversed (Opus implementer + Codex reviewer); Phase B reversed back (Codex implementer + Opus reviewer); Phase C is split, but the §A bulk dominates so Opus reviews per the "opposing-of-§A-bulk" convention. If Codex review of §B alone is desired, dispatch a second pass via `/codex:adversarial-review` scoped to the §B commits.
- **Base branch:** `main` at commit `fd215adb` (current HEAD; Phase B closed at `cd14865`, X.4 trailing handoff commits landed at `a6bb529` → `eec56ee` → `c4521a0` → `fd215adb`). Phase C base SHA at kickoff time is the live HEAD, NOT `cd14865`, because the trailing X.4 commits are benign w.r.t. Phase C surfaces but may shift line numbers on tracked source files (see §6 watchpoint #1).
- **Plan version:** `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/03-time-utility.md` r9 (commit `977dc78` — M12 → M11 rename + plan reordering, 2026-05-19; r9 is the adversarial-review-converged version with the lexer-based stripComments + directive-prologue isClientComponent + ISO regex tolerance fixes).
- **Spec version:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` r14 (commit `977dc78`). Phase C implements spec §3.6.2 Fixed-clock row + §7.1 tests #15 and #16 + AC-11.16 / AC-11.32 / AC-11.37 / AC-11.38 / AC-11.39 (partial — AC-11.39's E2E proof is Phase F's test #18; Phase C provides the utility that makes the E2E proof possible).

---

## §2 Phase completed in this session

- [x] **Phase C — Request-scoped time utility** (`03-time-utility.md`) — **CLOSED 2026-05-19 at SHA `6c7e6de`**
  - [x] Task C.1 — `lib/time/now.ts` + `tests/time/now.test.ts` 10-case gate suite (`9f2a37f`). Pin-1 contract pinned to `nowDate()` / `now()` signatures + ISO regex + length-16 secret guard. PIN-STOP 1 cleared.
  - [x] Task C.2 — Render-side migration (`4ab9a84`). Option A on both: `_ShowBody` made async (Next 16 JSX-renders async server components natively; no caller changes needed); `<StaleFooter>` `now` prop required (existing sync test suite already passed `now` explicitly per line-27 docstring); `Footer` made async + `await nowDate()` reused for year + StaleFooter prop. Collateral: `tests/components/layout/FooterPreviewSurface.test.tsx` updated to `await Footer({...})`.
  - [x] Task C.3 — Envelope coverage to 13 cases (`91a57f7`). Verify-red-via-restore via deterministic `return new Date()` mutation after auth-OK; observed FAIL on capture-boundary case; restored and re-ran GREEN.
  - [x] **Class-sweep extension** (`b3f23ab`) — C.4 guard's first red run caught 4 LATENT render-side calls beyond C.2's known set: `app/admin/_finalizeCheckpoint.ts:95` (`isCheckpointStale` now takes `now: Date`), `components/admin/ActiveShowsPanel.tsx:43` (Option B prop-threaded from `<Dashboard />`), `components/admin/AlertBanner.tsx:228` (one-line `await nowDate()` swap), `components/admin/PerShowAlertSection.tsx:28` (helper threading). Class-sweep migration per memory `feedback_class_sweep_before_patch.md`. New structural test at `tests/components/admin/class-sweep-now-utility.test.ts`; 14/14 verify-red'd to GREEN.
  - [x] Task C.4 — Server-time grep guard (`4cb6d82`). After class-sweep, exactly 4 mutation-path violations remained; per-line `// not-render-side:` waivers shipped in the same commit at `app/admin/actions.ts:97`, `app/admin/dev/actions.ts:145, :204`, `app/show/[slug]/p/actions.ts:142`.
  - [x] **R1 fix 1** (`ee62bb4`) — Calendar-impossible ISO rejection. Z-only narrowing + UTC component round-trip; adds 7 new gate fixtures (impossible day/month/hour/minute + leap-day positive control + year-end positive control). Replaces the original Pin-1 regex permissiveness.
  - [x] **R1 fix 2** (`27c4360`) — Lexer template-expression stack. C.4 guard's `stripComments()` now re-enters code mode inside `${...}` so executable interpolations like `` `${new Date()}` `` are flagged.
  - [x] **R2 migration** (`4d257e1`) — Removed wall-clock defaults from `lib/time/relative.ts` (`formatRelative` + `relativeDayChip`); threaded `now: Date` through `<MeShowSections>` (prop) + `app/admin/settings/admins/page.tsx` (`RevokedRow` + `buildAddedLine`); widened C.4 guard fallback scan roots to include `app/me`.
  - [x] **R2 structural defense** (`0a27df2`) — `tests/help/_metaTimeHelpersRequireNow.test.ts` — AST walk of `lib/time/*.ts` (excluding `now.ts`); asserts every exported function with render-side `new Date()`/`Date.now()` has a required `now: Date` parameter (no optional, no wall-clock default).
  - [x] **R3 meta-test extension** (`7e789f5`) — Walker now traverses VariableStatement initializers (ArrowFunction + FunctionExpression) + ExportAssignment expressions.
  - [x] **R4 meta-test comprehensive coverage** (`c06352b`) — Walker traverses ExportDeclaration (named export-list); supports renamed exports via `spec.propertyName`; skips cross-file re-exports. Scope-ceiling code comment added documenting 10 in-scope shapes + 7 out-of-scope categories.
  - [x] **R5 meta-test outer-expression unwrap** (`9d3db32`, cherry-picked equivalent of orphaned `98637e9`) — Single-helper `ts.skipOuterExpressions` applied at all 3 initializer sites; transparently unwraps parens, type assertions, `as`, non-null, satisfies, partially-emitted, expression-with-type-arguments. Local-typed cast around `ts.skipOuterExpressions` (declaration-surface workaround). See §6 watchpoint #22 for branch-state context.
  - [x] **R6 meta-test default-identifier lookup** (`648d22a`) — ExportAssignment branch now resolves bare Identifier expressions against the localFunctions map (symmetric to R4's named-export Identifier resolution). Covers `const foo = ...; export default foo`.
  - [x] **R7 meta-test identifier-alias chains** (`6c7e6de`) — `resolveLocal` helper follows alias chains with visited-set cycle guard. Covers `const alias = impl; export const exposed = alias` and multi-level chains. After R7, the declarative-helper-export class is structurally exhausted per Codex's own R8 convergence statement.

Other phases (A done at `e911078`; B done at `cd14865`; D–I tracked in their own per-phase handoffs).

---

## §3 Spec sections in scope (Phase C only)

- **§3.6.2 Fixed-clock row (r7 request-scoped form)** — the request-scoped `X-Screenshot-Frozen-Now` header contract, the `ENABLE_TEST_AUTH` + `Authorization: Bearer ${TEST_AUTH_SECRET}` gating pair, the outside-request-scope fall-through, and the migration-inventory rule for render-side `new Date()` call sites.
- **§7.1 test #15** — `lib/time/now.ts` three-precondition gate (Phase C Tasks C.1 + C.3 jointly cover the 13 cases at close-out: 10 from C.1 gate, 3 from C.3 envelope).
- **§7.1 test #16** — server-side `Date.now()` / `new Date()` grep guard with per-line waiver convention (Task C.4).
- **AC-11.16** — No new env vars (the screenshot harness reuses `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` for gating; the only new wire is the `X-Screenshot-Frozen-Now` HTTP header, NOT a new env var).
- **AC-11.32** — Fixed clock per §3.6.2; browser side is `context.clock.install()` (Phase F's deliverable), server side is `lib/time/now.ts` (Phase C's deliverable).
- **AC-11.37** — Three-precondition gate enforced; capture-boundary case (60+s wall-clock advance returns byte-identical ISO under the same frozen header) verified via unit test. Production-mode case (`ENABLE_TEST_AUTH` unset → header ignored) verified.
- **AC-11.38** — Server-side render-time call sites migrated to `lib/time/now.ts`; mutation-path sites waived per-line; grep guard catches future violations.
- **AC-11.39** — Phase C ships the utility that makes the E2E proof viable. The full E2E test (#18) is Phase F's deliverable.

Out of scope for Phase C (deferred to later phases):
- Screenshot harness manifest at `scripts/help-screenshots.manifest.ts` (Phase F). Phase C's C.4 guard reads the manifest if present, falls back to spec-named scan roots otherwise.
- MDX `<Screenshot>` component that consumes the frozen-clock-rendered output (Phase D).
- E2E clock-pipeline proof (test #18 — Phase F).

---

## §4 Acceptance criteria

| AC | Phase C status | Notes |
| --- | --- | --- |
| AC-11.16 | **PASS** | No new env var introduced. Phase C reuses `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` (M3-established). The `X-Screenshot-Frozen-Now` HTTP header is a request-scoped wire, NOT an env var. |
| AC-11.32 | **PARTIAL** — server side covered | Phase C ships the server-side fixed clock (`lib/time/now.ts`). Browser side (`context.clock.install()`) is Phase F. |
| AC-11.37 | **PASS** | Three-precondition gate enforced. 20 unit-test cases in `tests/time/now.test.ts` (10 original gate + 3 envelope + 7 calendar-impossible-ISO from R1 fix 1). Capture-boundary asserts byte-identical ISO across 60+s wall-clock advance. Z-only narrowing + per-component UTC round-trip rejects calendar-impossible inputs like `2026-02-31`. |
| AC-11.38 | **PASS** | Render-side migration covers initial 3 known sites + 4 latent sites caught by C.4 class-sweep + 4 indirect-helper sites caught by R2 (formatRelative defaults + `app/me/page.tsx` direct call). C.4 grep guard catches future additions; `_metaTimeHelpersRequireNow.test.ts` structurally enforces no-wall-clock-defaults on `lib/time/*` helpers (10 in-scope export shapes + 7 unwrapped wrappers + 2 identifier-reference paths + alias chains). 4 mutation-path sites per-line-waivered. |
| AC-11.39 | **PARTIAL** — utility ready, E2E proof deferred | Phase C ships the utility that makes the E2E clock pipeline observable. Test #18 (E2E proof) lands in Phase F. |
| AC-11.17 | **PASS** | Conventional-commits per AGENTS.md §1.6: `feat(time):`, `refactor(show):`, `test(time):`, `refactor(admin):`, `test(help):`, `fix(time):`, `fix(help):`, `refactor(time):` across 13 Phase C surface commits. No batching. |
| AC-11.22 | **PASS** | Phase B closed at `cd14865`; Phase C closed at `6c7e6de`. Strict-sequential per `00-overview.md` r2. |

ACs NOT addressed by Phase C: AC-11.1–AC-11.6 + AC-11.11 (Phases A/B); AC-11.7–AC-11.10 + AC-11.13–AC-11.15 + AC-11.18–AC-11.21 + AC-11.23–AC-11.31 + AC-11.33–AC-11.36 (Phases D–I).

---

## §5 Plan-wide invariants — applicability to Phase C

These are AGENTS.md's 9 invariants layered with M11's per-plan additions.

| # | Invariant | Phase C applicability |
| --- | --- | --- |
| AGENTS.md §1.1 | **TDD per task.** | **ACTIVE.** Each C.* task: failing test → minimal implementation → passing test → commit. C.1's failing test runs against a non-existent `@/lib/time/now` module (red = ImportError). C.2's failing tests are source-file structural assertions (red = "no nowDate import" / "still contains new Date()"). C.3 uses verify-red-via-restore (deterministic mutation, NOT `Math.random()` — r4 fix). C.4 starts red (un-waived mutation paths still violate) and goes green only after per-line waivers ship in the same commit. |
| AGENTS.md §1.2 | **Per-show advisory lock.** | **N/A.** Phase C does not mutate `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. |
| AGENTS.md §1.3 | **Email canonicalization at every boundary.** | **N/A.** No raw email handling. |
| AGENTS.md §1.4 | **No global sync cursor.** | **N/A.** |
| AGENTS.md §1.5 | **No raw error codes in user-visible UI.** | **N/A.** Phase C ships no new user-visible copy. The thrown-when-outside-request-scope path is caught + falls back; no user-facing error string. |
| AGENTS.md §1.6 | **Commit per task.** | **ACTIVE.** Conventional-commits `feat(time): ...` (C.1), `refactor(show): ...` (C.2), `test(time): ...` (C.3), `test(help): ...` (C.4). No batching. The plan body's commit-message templates are canonical; do not paraphrase. |
| AGENTS.md §1.7 | **Spec is canonical.** | **ACTIVE.** Spec §3.6.2 defines the header name, the env var names, and the gating contract. Any drift between plan body and spec → open a question, do not silently fix. The `length >= 16` secret guard is rooted in `app/api/test-auth/set-session/route.ts:95` (existing M3-established code), NOT a plan-only invention — verify the live route still enforces this at kickoff time. |
| AGENTS.md §1.8 | **impeccable v3 critique + audit dual-gate.** | **ACTIVE for C.2 only.** C.2's three migration sites are all UI surface (`app/show/...`, `components/layout/...`, `components/shared/...`). Per AGENTS.md §1.8 + M11 plan-wide invariant #5, the impeccable v3 dual-gate fires on the C.2 diff. The edits are trivial (one-line `new Date()` → `await nowDate()` + import + caller-prop-threading), so the gate is expected to pass quickly. **External attestation required per memory `feedback_impeccable_external_attestation_required.md`** — both `/impeccable critique` AND `/impeccable audit` must be run by an external Opus session OR fresh subagent, NOT by the same session that authored C.2. C.1, C.3, C.4 are NOT UI surface and skip the gate. |
| AGENTS.md §1.9 | **Supabase call-boundary discipline.** | **N/A.** `lib/time/now.ts` reads `process.env` + `headers()`; no Supabase client touched. |
| M11 plan-wide #4 | **No raw error codes in user-visible UI** (AGENTS.md #5 echo). | N/A as above. |
| M11 plan-wide #5 | **impeccable v3 UI gate** (AGENTS.md #8 echo). | ACTIVE for C.2 as above. |
| M11 plan-wide #9 | **`lib/time/now.ts` is the only server-side render-time source.** | **CORE ACTIVE for Phase C.** C.1 creates the utility; C.2 makes the three known render-side sites consume it; C.4 enforces the rule structurally for all future additions. |
| M11 plan-wide #7 | **`MessageCatalogEntry` additive extension.** | **N/A.** Phase B closed this; Phase C does not touch the catalog. |
| M11 plan-wide #8 | **Catalog-master-spec alignment.** | **N/A.** Phase B closed this. |
| M11 plan-wide #10 | **§5.6 affordance matrix is the §9.0.1 retrofit contract.** | **N/A.** Phase G is the implementer. |

---

## §6 Watchpoints (class-vectors carried forward)

Per AGENTS.md "Same-vector recurrence" + Disagreement-loop preempt rules. These are pre-loaded BEFORE adversarial review fires so the reviewer is anchored on prior-incident context. Memory entries cited inline are loaded via the auto-memory index in `CLAUDE.md`.

1. **Plan-body line number `page.tsx:697` is stale — actual call site is `_ShowBody.tsx:83`** (verified 2026-05-19 at HEAD `fd215adb`). The plan body Task C.2 Step 1 says "Run `rg -n \"const today = new Date\\(\\)\" app/show/\\[slug\\]/page.tsx` (resolves to the actual line at execution time — line numbers drift across PRs)". The implementer MUST follow that instruction and `rg` BOTH `page.tsx` AND `_ShowBody.tsx` (and any other under `app/show/[slug]/`) before editing. At HEAD `fd215adb`, the rg results are:
   - `app/show/[slug]/_ShowBody.tsx:83: const today = new Date();` ← this is the actual call site
   - `components/layout/Footer.tsx:105: const year = new Date().getUTCFullYear();`
   - `components/shared/StaleFooter.tsx:27: /** Override for deterministic testing; defaults to new Date() at render. */` (comment — stripped by C.4 lexer)
   - `components/shared/StaleFooter.tsx:72: const currentNow = now ?? new Date();`

   The plan body's example diff at line 383 assumes `async function ShowPage` is the immediate parent of the IIFE. The actual current state is: `_ShowBody.tsx:72` declares `export function ShowBody(...): ReactNode` (synchronous!), and `page.tsx:412` declares `export default async function ShowPage(...)` which renders `<ShowBody ... />`. M10 §B Task 10.8 extracted ShowBody for preview-as parity; the extraction is **synchronous**. Per `_ShowBody.tsx:5`, the body is ALSO imported by `app/admin/show/[slug]/preview/[crewId]/page.tsx`. The migration MUST update both call sites if Option A (make ShowBody async) is chosen.

2. **`<StaleFooter>` `now` prop contract — caller-prop-thread (Option A) or async wrapper (Option B)** (plan body Task C.2 Step 5b.2 / r8 fix). The plan body explicitly forbids making `StaleFooter` an async server component because the existing sync `tests/components/StaleFooter.test.tsx` renders it through `@testing-library/react`. Two acceptable migrations:
   - **Option A (preferred):** make `now` a REQUIRED prop. Every caller MUST pass `now={await nowDate()}`. Existing sync tests pass an explicit `now={...}` (which they already do per line 27 docstring "Override for deterministic testing").
   - **Option B:** ship a thin async wrapper `<StaleFooterServer />` that calls `await nowDate()` and forwards to the sync `<StaleFooter now={...} />`.
   Pick Option A unless surfaces beyond the screenshot-reachable callers prevent it. The plan body's structural test (`tests/components/shared/staleFooter-now-prop.test.ts`) asserts deterministic byte-identical output across a 61s fake-timer advance with the frozen header pinned — the verify-red proof requires the unfixed default-branch `new Date()` to drift "less than a minute ago" → "1 minute ago" between renders.

3. **Footer.tsx `year` is special-case waiver-eligible** (plan body Task C.2 Step 5b). `Footer.tsx:105` is `const year = new Date().getUTCFullYear()` — copyright year. Screenshot fixtures are pinned to 2026-03-24 (fixture window 2026-03-22 → 2026-03-26 per spec §3.6.2 "Frozen-instant fixture validation"), and `getUTCFullYear()` is stable mid-March across all reasonable wall-clock real-time captures. Two acceptable approaches: (a) migrate to `await nowDate()` → consistency with the other sites; (b) keep `new Date().getUTCFullYear()` with an explicit per-line `// not-render-side: copyright year is stable mid-fixture-window` waiver. Pick (a) for consistency unless Footer is a Client Component (it should NOT be — `Footer.tsx` has no `"use client"` directive at HEAD `fd215adb`; verify). If Footer were a Client Component, do NOT migrate — Client Components are excluded from the C.4 guard by the directive-prologue `isClientComponent()` check.

4. **`isClientComponent()` directive-prologue boundary** (plan body Task C.4 + r5/r6 fixes). The classifier must require the `"use client"` literal to be the FIRST non-comment statement (after stripping leading `//` line and `/* ... */` block comments) AND terminated by `;` or end-of-line. Earlier drafts (r4) used `/^\s*["']use client["']\s*;?\s*$/m` which would falsely classify a file containing `"use client"` ANYWHERE — including inside a function body or as part of `"use client" + sideEffect()` expression. The r6 lexer's regex is `/^["']use client["'][ \t]*(?:;|$|\r?\n)/` applied to the post-comment-strip prefix. The C.4 test file ships explicit positive AND negative fixtures for the boundary (live `Footer.tsx`/`StaleFooter.tsx` = server; live `RightNowCard.tsx`/`ReportModal.tsx` = client; synthetic `"use client" + sideEffect()` = server; synthetic `'use client'.length` = server; synthetic post-imports `"use client"` = server). Do NOT simplify to a single anchored regex.

5. **`stripComments()` is a tiny lexer, NOT a regex** (plan body Task C.4 + r9 fix). Earlier drafts used `/\/\/.*$/gm` + `/\/\*[\s\S]*?\*\//g` which silently strips legitimate code on lines containing a string literal with `//` (e.g., `const url = "https://example.com"; const t = new Date();` would have everything-after-`//` stripped). The r9 lexer tracks string + template-literal context. Test fixtures in C.4 prove: comment-only `new Date()` mentions are stripped; URL-containing-`//` lines preserve real code; multi-line block comments preserve newline count so `originalLines[i]` and `strippedLines[i]` stay aligned (waiver-detection alignment depends on this).

6. **Non-global FORBIDDEN_PATTERNS regexes** (plan body Task C.4 + r2 fix). The constant is `[/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/]` — **without** the `/g` flag. A `/g`-flagged regex keeps its `lastIndex` across `.test()` calls; the synthetic two-line fixture in the C.4 self-test proves a forbidden call on column 60 of line 1 followed by a forbidden call on column 8 of line 2 must both be reported. Do NOT add `/g`.

7. **Verify-red-via-restore deterministic mutation** (plan body Task C.3 + r4 fix). The C.3 verify-red must mutate `lib/time/now.ts` to **deterministically** return `new Date()` after auth-OK (e.g., replace the trailing `return parsed;` with `return new Date();`). Do NOT use `Math.random()` which could randomly pass. The capture-boundary test (60+s fake-timer advance) is the load-bearing assertion: with the mutation, `first` and `second` are both wall-clock `Date.now()` calls separated by 61s in fake-timer-land → `second !== first` AND `second !== FROZEN`. The plan body's commit-message template documents the observed failure literal — preserve it.

8. **Outside-request-scope fallback** (plan body Task C.1 Step 3). Next 16's `headers()` throws if called outside a request scope (e.g., during build-time RSC compilation). The implementation catches the throw and falls back to `new Date()`. This is NOT a silent gate-failure — it's a no-request-scope-no-frozen-clock contract. The C.1 test suite does NOT need to assert this branch (it's exercised at build time, not test time), but the comment in the source should make the rationale explicit per the plan body. Reviewer is pre-loaded: do NOT flag this fallback as a "silent failure" — it's the correct behavior outside request scope.

9. **ISO 8601 regex tolerance — accept both `Z` and `+00:00`, with or without fractional seconds** (plan body Task C.1 + r9 fix). Earlier drafts used `Date.parse(frozen) !== NaN` only (too permissive — accepts `03/24/2026` implementation-dependently) OR `toISOString() === frozen` round-trip (too strict — rejects valid `2026-03-24T15:00:00Z` since `toISOString()` always emits `.000Z`). The r9 regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/` screens for canonical ISO 8601 first, THEN `Date.parse()` for NaN. Test fixtures in C.1 prove both `2026-03-24T15:00:00Z` and `2026-03-24T15:00:00+00:00` are accepted; `03/24/2026` and `Wed, 24 Mar 2026 15:00:00 GMT` are rejected. Do NOT relax to bare `Date.parse()`.

10. **`length >= 16` secret guard mirrors the test-auth route** (plan body Task C.1 + r3 fix per C-r2 finding 4). The route at `app/api/test-auth/set-session/route.ts:95` requires `process.env.TEST_AUTH_SECRET.length >= 16` before honoring the `Authorization: Bearer ...` header. The time utility MUST mirror this — without it, a one-char `TEST_AUTH_SECRET` would let a guess-attacker pin the clock. **Verify at C.1 implementation time** that the live route still enforces `>= 16`; if it's been changed (e.g., to `>= 32`), update the utility AND the C.1 test fixtures to match. The test fixture uses a `test-secret-fixture-19c` (19 chars) string. The fixture `"Bearer undefined"` test case proves a naive `if (!expected)` check is insufficient — defense-in-depth refuses the literal token `"undefined"` when the env is unset.

11. **`components/` is always in the C.4 scan roots** (plan body Task C.4 + r3 fix per C-r2 finding 3). The manifest-derived scan roots cover `app/<segment>` for screenshot-reachable routes. But components imported BY those routes (e.g., `Footer` and `StaleFooter` imported by `_ShowBody.tsx`) live under `components/` — `app/<segment>` alone misses them. The `discoverScanRoots()` function unconditionally adds `components/` regardless of manifest content. Do NOT scope `components/` out of the scan roots.

12. **`"use client"` files are excluded from the C.4 guard** (plan body Task C.4 + r4 fix per C-r3 finding 1). Client Components run in the browser where Playwright's `context.clock.install()` pins time deterministically — their `new Date()` / `Date.now()` calls are NOT a screenshot-drift source. The C.4 guard's `isClientComponent()` check skips them. **Implication for C.2:** do NOT migrate `RightNowCard.tsx` (Client Component) or `ReportModal.tsx` (Client Component) even if they contain `new Date()`. They are out of scope.

13. **AST-scoping reserved for future Phase F+ if accuracy demands it** (plan body Task C.4 r7 comment). The current C.4 guard uses regex-level pattern matching after lexer-based comment stripping. A stringified mention like `"new Date()"` in code (rare — usually only in test setup) would false-positive. The plan body accepts the trade-off for now; if a future PR needs strict accuracy, swap for the TypeScript Compiler API or `ts-morph` to walk `NewExpression` / `CallExpression` nodes. Do NOT preemptively introduce AST-scoping for Phase C — the lexer approach is sufficient at current scale.

14. **Codex `< /dev/null` discipline** (memory `feedback_codex_exec_needs_stdin_closed.md`). Every `codex exec` invocation MUST append `< /dev/null` to close stdin. Without it, `codex exec ... "$prompt"` hangs forever waiting on stdin EOF in non-interactive contexts. The companion-script invocations from the orchestrator side handle this; this note is for the Codex implementer's own shell discipline if it shells out from within its session. Monitor Codex CPU% if a session feels stalled (0.0% for 2+ min = stdin hang).

15. **Codex companion-script `--background` instability** (Phase A §14 observation). Phase A's R2 attempts crashed twice in background mode. The R3 attempt succeeded in foreground `--wait` mode. **Discipline for the Phase C adversarial review:** if the first background companion-script invocation crashes, fall back to `--wait` foreground on the next attempt rather than continuing to retry background.

16. **Parallel-session cross-talk in the working tree** (carried forward from Phase B §6 watchpoint #12). X.5 (other cross-cutting work) may still be running against the same checkout in a separate session. Phase C subagents MUST use `git add <specific-paths>` (never `git add -A` / `.`), and verify with `git show --stat HEAD` post-commit that the diff contains only Phase C surface files. `pnpm typecheck` will surface X.5-related errors in untracked files — those are X.5's responsibility, not Phase C's; scope errors appropriately at review time.

17. **Audit derives from spec at audit time, not handoff** (memory `feedback_audit_derives_from_spec_not_handoff.md`). The C.4 guard's scan roots derive from `scripts/help-screenshots.manifest.ts` (Phase F) at test-execution time, NOT from a copy of the manifest's expected routes baked into this handoff. The pre-Phase-F fallback (`app/show`, `app/admin`, always `components/`) is documented in the guard source. When Phase F lands the manifest, the C.4 guard will automatically widen scope without any test-file edit. Reviewer is pre-loaded: do NOT flag the fallback list as "hardcoded" — it's a fallback, the manifest derive is the canonical path.

18. **Class-sweep before patching** (memory `feedback_class_sweep_before_patch.md` + `feedback_class_sweep_must_be_code_shape_not_name_list.md`). If adversarial review surfaces a forbidden `new Date()` call C.4 should have caught, do NOT patch only the one site. Run the C.4 guard against the live HEAD, eyeball its full output, and audit the guard's logic for the class. Round-by-round whack-a-mole on individual call sites burns review rounds; a single structural fix to the guard or the migration closes the class.

19. **Iterate until convergence** (memory `feedback_iterate_until_convergence.md`). Phase C complexity is medium-low (header parsing + env gating + AST-aware lexer + 3-site migration). Predicted round count: 1–2. The plan body has already absorbed 9 rounds of cross-model review (r1 → r9); the remaining failure modes are mostly drift in line numbers (watchpoint #1) and the StaleFooter Option A vs B choice (watchpoint #2). Keep iterating fix → review → fix → review until APPROVE. Stop only on (a) genuine value-judgment ambiguity, (b) tooling failures, OR (c) APPROVE.

20. **Disagreement-loop preempt: fail-closed gate posture** (Phase A §6 watchpoint precedent). The gate refuses (returns wall-clock `new Date()`) on EVERY missing/malformed precondition. There is no "log and continue" path; no "best-effort honor the header anyway"; no fail-open behavior. If adversarial review pushes toward "the gate should log a warning and honor the header when only one precondition fails," redirect: the production-safety contract requires fail-closed. The capture script (Phase F) is responsible for providing all three preconditions; if it fails to, the screenshot drifts and the CI drift gate catches it. The utility's job is to refuse; not to fix.

21. **R1 fix-1 contract narrowing — Z-only ISO + UTC component round-trip** (R1 finding 1 closure at `ee62bb4`). JavaScript's `Date` constructor silently normalizes impossible calendar fields: `new Date("2026-02-31T00:00:00Z")` becomes `2026-03-03T00:00:00.000Z`; `new Date("2026-04-31T00:00:00Z")` becomes `2026-05-01T00:00:00.000Z`. The original Pin-1 regex screened SHAPE only, so a screenshot harness sending an impossible date would have produced a silently-different rendered instant — breaking the deterministic-capture contract. R1 fix 1 (a) tightened the regex to require `Z` suffix only (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/` — the original `+00:00` offset acceptance was dropped), (b) added per-component UTC round-trip validation after `Date.parse()` that rejects any input whose parsed UTC components don't match the input's literal components. The Z-only narrowing was acceptable per spec §3.6.2 / AC-11.37 because the harness's `toISOString()` always emits Z (the spec mandates valid ISO but doesn't mandate non-Z offsets). **Future Phase F implication:** the capture script's `page.setExtraHTTPHeaders({ "X-Screenshot-Frozen-Now": frozenClockInstant, ... })` must send the canonical Z form. If a future requirement emerges for non-Z offsets, this gate would need to be widened with offset-aware component-comparison logic — but that's not blocking Phase F today.

22. **Branch-state anomaly: R5 fix orphaned then cherry-picked** (recorded 2026-05-19 during R7 implementer's pre-implementation check). Between R4 (`c06352b`) and R5 work, X.6 traceability work landed on a verification branch (`verify/x6-workflow-fails-on-bad-spec`). The R5 fix was committed on that X.6 branch as `98637e9`. When the user switched back to main and X.6 close-out commits landed (`4a8c242`, `52d05d9`, `ef483dc`, `7400c48`), `98637e9` was left orphaned — never merged to main. R7's Codex implementer correctly diagnosed the gap: live HEAD was `7400c48` not `98637e9`, R5 walker changes missing from main. Codex cherry-picked `98637e9` onto main as `9d3db32` (empty-diff equivalence verified at the meta-test file path), then applied R6 + R7 on top. The orphaned `98637e9` remains on the verify branch with no live consumers; branch hygiene cleanup is optional. **Operational implication for future rounds:** when Codex starts a new round, it should `git log --oneline cd14865..HEAD` to verify the Phase C surface is intact on main BEFORE doing work. The X.* parallel-work pattern + the verify-branch worktree pattern + the cherry-pick recovery flow is the canonical disaster-tolerant workflow; future phases should expect similar churn in dirty working trees and adopt the same `git log` precheck.

23. **Convergence trajectory — 8 adversarial review rounds on Phase C** (closed 2026-05-19). Round-by-round summary: R1 closed 2 unrelated structural defects (ISO normalization + lexer `${...}`); R2 closed the production-side indirect-time-bypass class (helper wall-clock defaults) AND shipped a structural defense (`_metaTimeHelpersRequireNow`); R3-R7 are 5 consecutive defensive-layer extensions on the meta-test walker (arrows + function-expressions; ExportDeclaration; outer-expression unwrap; default-identifier lookup; identifier-alias chains). After R7, the walker handles every realistic in-scope declarative-helper-export shape per Codex's own R8 convergence statement. R8 returned APPROVE at 90% with zero findings. **Anti-pattern avoidance signal:** R3-R7 trajectory looks pathological at first glance (5 rounds on the same surface), but each round closed a DIFFERENT in-scope AST shape — not the same finding re-litigated. Memory `feedback_iterate_until_convergence.md` explicitly permits this ("round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces NEW bugs"). The legitimacy test is "does each round find something different + structural + shippable?" — yes, in all 5 cases. **Convergence stop signal:** Codex's R7 implementer + R8 reviewer BOTH affirmed they couldn't brainstorm another realistic in-scope shape. The defensive layer is at its natural AST-only static-analysis ceiling. Any future surface gap would be in the documented out-of-scope compound-expression class (IIFE call, await, conditional, comma, spread, member access, element access, call-expression initializer, destructuring) — production-side adversarial review catches the rare residual on a hypothetical future PR introducing such a helper.

---

## §7 Test commands

```bash
# Unit + integration (vitest):
pnpm test

# Phase C targeted runs:
pnpm test tests/time/now.test.ts                                # C.1 + C.3 (10 + 3 cases at close-out)
pnpm test tests/show/page-today-uses-now-utility.test.ts        # C.2 _ShowBody.tsx + page.tsx migration structural
pnpm test tests/components/shared/staleFooter-now-prop.test.ts  # C.2 StaleFooter deterministic-output contract
pnpm test tests/help/_metaServerTimeGuard.test.ts               # C.4 server-time grep guard

# Cross-phase regression sanity:
pnpm test tests/cross-cutting/codes.test.ts                     # X.1 parity (unchanged surface in Phase C)
pnpm test tests/help/                                           # Phase A + Phase C tests/help/* surface
pnpm test tests/messages/                                       # Phase B catalog tests (unchanged surface in Phase C)
pnpm test tests/components/StaleFooter.test.tsx                 # Existing sync StaleFooter behavior — must stay green after Option A/B
pnpm test tests/components/                                     # Broader component sweep (Footer / ScheduleTile / RightNowCard)

# E2E (Playwright) — verify C.2 migration doesn't regress crew-page rendering:
pnpm test:e2e --project=mobile-safari
pnpm test:e2e -g "schedule-tile|right-now"                      # Plan body targets these

# Lint:
pnpm lint

# Typecheck:
pnpm typecheck

# Final gate:
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e --project=mobile-safari
```

Pre-flight: all four gates (typecheck + lint + vitest + e2e mobile-safari) green at base SHA `fd215adb`.
Post-close-out: all four green at Phase C final SHA + new test files included.

---

## §8 Convergence log (adversarial review)

Phase C close-implementation commit stack (13 Phase C surface commits + R5 cherry-pick from orphaned branch — see §6 watchpoint #22):

| Task / Round | SHA | Title |
| --- | --- | --- |
| C.1 | `9f2a37f` | `feat(time): lib/time/now.ts request-scoped time utility with header gating (Task C.1)` |
| C.2 | `4ab9a84` | `refactor(show): migrate render-side new Date() to nowDate() utility (Task C.2 — _ShowBody + Footer + StaleFooter)` |
| C.3 | `91a57f7` | `test(time): lib/time/now.ts capture-boundary + envelope coverage (Task C.3 — test #15)` |
| Class-sweep | `b3f23ab` | `refactor(admin): class-sweep render-side time calls to nowDate() (Task C.2 extension — admin tiles + finalize checkpoint)` |
| C.4 | `4cb6d82` | `test(help): server-time grep guard (test #16) + per-line waivers on mutation paths (Task C.4)` |
| R1 fix 1 | `ee62bb4` | `fix(time): reject calendar-impossible ISO inputs in lib/time/now.ts (R1 finding 1)` |
| R1 fix 2 | `27c4360` | `fix(help): server-time guard re-enters code mode inside ${...} (R1 finding 2)` |
| R2 migration | `4d257e1` | `refactor(time): remove wall-clock defaults from formatRelative + relativeDayChip; migrate /me + /admin/settings/admins (M11 Phase C R2)` |
| R2 structural defense | `0a27df2` | `test(help): _metaTimeHelpersRequireNow.test.ts — structural defense against wall-clock-defaulting time helpers (M11 Phase C R2)` |
| R3 meta-ext | `7e789f5` | `fix(help): _metaTimeHelpersRequireNow walks exported arrow + function-expression helpers (R3 finding)` |
| R4 meta-comprehensive | `c06352b` | `fix(help): _metaTimeHelpersRequireNow walks ExportDeclaration (R4 finding — comprehensive export-shape coverage)` |
| R5 outer-unwrap | `9d3db32` (cherry-pick of orphaned `98637e9`) | `fix(help): _metaTimeHelpersRequireNow unwraps outer expressions via ts.skipOuterExpressions (R5 finding)` |
| R6 default-identifier | `648d22a` | `fix(help): _metaTimeHelpersRequireNow handles export default <identifier> via local lookup (R6 finding)` |
| R7 identifier-alias | `6c7e6de` | `fix(help): _metaTimeHelpersRequireNow resolves identifier-alias chains via localFunctions + resolveLocal (R7 finding)` |

| Round | Date | Verdict | Findings (sev, summary) | Resolution commit | Notes |
| --- | --- | --- | --- | --- | --- |
| **R1 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 91% | 2 HIGH: (a) ISO gate accepts JS-normalized impossible dates like `2026-02-31`; (b) lexer skips executable `${new Date()}` inside template-literal interpolation | `ee62bb4` + `27c4360` | Fresh Codex via `/codex:adversarial-review` from base `cd14865`. Both findings fixed in dedicated commits; R1 fix 1 narrows to Z-only + UTC component round-trip; R1 fix 2 extends lexer with tplExpr stack. |
| **R2 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 86% | 1 HIGH (new class-sweep finding): indirect render-side time bypass via `lib/time/relative.ts` helper wall-clock defaults — `formatRelative` + `relativeDayChip` defaulted `now` to `new Date()`; `app/admin/settings/admins/page.tsx` callers omitted the arg entirely; `app/me/page.tsx:185` also held a direct `new Date()`. C.4 grep guard scans direct call shapes only, missing helper-default bypass. | `4d257e1` + `0a27df2` | Class-sweep migration (defaults removed, all callers thread `await nowDate()`, scan roots widened to `app/me`) + structural defense meta-test (`_metaTimeHelpersRequireNow.test.ts` — AST walk of `lib/time/*`, asserts every exported helper with render-side `new Date()`/`Date.now()` has required `now: Date` param). |
| **R3 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 88% | 1 HIGH (defensive-layer gap): `_metaTimeHelpersRequireNow` only walked top-level `FunctionDeclaration` nodes; arrow + function-expression exports + default-export non-FunctionDeclaration forms slipped past. | `7e789f5` | Walker extended to also traverse exported VariableStatement initializers (Arrow + FunctionExpression) + ExportAssignment expressions. |
| **R4 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 86% | 1 HIGH (defensive-layer gap): walker missed ESM export-list shape `const foo = ...; export { foo };` + renamed-export `export { foo as bar };` because ExportDeclaration nodes were never visited. | `c06352b` | Comprehensive re-analysis per memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`: enumerated all 10 in-scope TS export-function shapes + 7 deliberately-out-of-scope categories; walker now traverses ExportDeclaration with local-declaration map lookup; renamed exports resolve via `spec.propertyName ?? spec.name`; cross-file re-exports skipped. Scope-ceiling code-comment added inline. |
| **R5 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 84% | 1 HIGH (defensive-layer gap): walker missed parenthesized default exports `export default (() => Date.now())` because ExportAssignment branch checked raw `node.expression` against ArrowFunction/FunctionExpression kind without unwrapping the ParenthesizedExpression layer. | `9d3db32` (cherry-pick of orphaned `98637e9`) | Structural fix via `ts.skipOuterExpressions` — single helper transparently unwraps ALL 7 TS outer-expression kinds (parens, type assertion, as, non-null, satisfies, partially-emitted, expression-with-type-arguments). Applied at every initializer/expression site. Local-typed cast around `ts.skipOuterExpressions` because the repo's TS declaration surface doesn't expose it (runtime works). Scope-ceiling comment extended. |
| **R6 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 88% | 1 HIGH (defensive-layer gap): walker missed `export default <localIdentifier>` shape — `const leaky = () => Date.now(); export default leaky` because ExportAssignment branch only checked direct ArrowFunction/FunctionExpression after unwrap, not Identifier references. | `648d22a` | ExportAssignment branch now resolves bare Identifier expressions against the localFunctions map (symmetric to R4's named-export Identifier resolution). Imported/global identifiers skip gracefully. Scope-ceiling comment extended with IDENTIFIER-REFERENCE EXPORTS section. |
| **R7 Codex adversarial** | 2026-05-19 | **CONDITIONAL** at 86% | 1 HIGH (defensive-layer gap): walker missed identifier-alias chains — `const impl = () => Date.now(); export const alias = impl;` (and export-list / default-export analogs) because local-collection pass only recorded direct function declarations / arrow / function-expression initializers, not Identifier initializers. | `6c7e6de` | `resolveLocal` helper added with chain-following + visited-set cycle guard; applied at all three lookup sites (export-list, default-identifier, export-const-alias). Cycle guard handles self-referencing aliases cleanly. Scope-ceiling comment extended with IDENTIFIER-ALIAS CHAINS section. Codex's R7 implementer convergence statement: "I don't see another realistic in-scope declarative-helper export shape left." |
| **R8 Codex adversarial** | 2026-05-19 | **APPROVE** at 90% | — | — | Zero HIGH/CRITICAL findings. R7 closure verified at `tests/help/_metaTimeHelpersRequireNow.test.ts:266`. Structural completeness audit: remaining theoretical shapes (member access, destructuring from objects, nullish/conditional/array/call-wrapped aliases, class static fields) correctly fall in the documented out-of-scope compound-expression class. R1-R6 fixes all hold. Production-side converged at 4 mutation-path waivered sites. 14 Phase C commits clean of X.5/X.6/traceability contamination. Phase C ships. |
| **Final stop-condition verification at `6c7e6de`** | 2026-05-19 | **PASSES** all gates | typecheck ✅; lint ✅ (5 pre-existing warnings, 0 errors); vitest 65 files / 870 tests ✅; `tests/help/_metaTimeHelpersRequireNow.test.ts` 44/44 ✅; `tests/help/_metaServerTimeGuard.test.ts` 17/17 ✅; `tests/time/now.test.ts` 20/20 ✅ | — | Phase C officially closed; Phase D (MDX components) unblocked per strict-sequential A→I ordering. |

**Two impeccable v3 dual-gate runs (external attestation per memory `feedback_impeccable_external_attestation_required.md`):**

| Run | Date | Critique | Audit | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 impeccable (post-class-sweep) | 2026-05-19 | 0 CRITICAL / 0 HIGH | 0 CRITICAL / 0 HIGH | **GATE-APPROVE** | Fresh Opus subagent `a944b447b6b536776`. Pre-flight pass (PRODUCT.md + DESIGN.md + register identification: crew × admin). Audit Health 20/20. Diff is mechanical time-source plumbing with zero visual delta. |
| R2 impeccable (post-R2 fix) | 2026-05-19 | 0 CRITICAL / 0 HIGH | 0 CRITICAL / 0 HIGH | **GATE-APPROVE** | Critique by `a53eda79c75d72897`; audit by `a120ba53dfa22f7aa` (continued). Same posture as R1 — `app/admin/settings/admins/page.tsx` + `app/me/page.tsx` migration is pure prop-threading with no visual/text/token/interaction delta. Audit Health 20/20. |

---

## §9 Impeccable findings + dispositions (Phase C close-out)

**Two impeccable v3 dual-gate runs.** Per AGENTS.md §1.8 + M11 plan-wide invariant #5 + memory `feedback_impeccable_external_attestation_required.md`, the gate fires on every UI mutation including post-review fix commits, with external attestation required.

- **R1 impeccable** (post-class-sweep at SHA `b3f23ab`) — fresh Opus subagent `a944b447b6b536776`. Scoped to the merged C.2 + class-sweep extension UI diff (6 C.2 files + 9 class-sweep files). **GATE-APPROVE, 0/0 findings, Audit Health 20/20.**
- **R2 impeccable** (post-R2 fix at SHA `4d257e1`) — critique by `a53eda79c75d72897` + audit by `a120ba53dfa22f7aa`. Scoped to the R2 migration UI delta (`app/admin/settings/admins/page.tsx` + `app/me/page.tsx`). **GATE-APPROVE, 0/0 findings, Audit Health 20/20.**

Subsequent fix commits (R3-R7) touch only test infrastructure files (`tests/help/_metaTimeHelpersRequireNow.test.ts`) and do NOT introduce new UI surface — the §1.8 dual-gate does NOT need to re-fire on those.

| Finding | Severity | File:line | Disposition | Commit |
| --- | --- | --- | --- | --- |
| _(none)_ | — | — | — | — |

---

## §10 Performance & bundle impact

Phase C adds no new runtime dependencies. `lib/time/now.ts` is ~60 LOC of TypeScript (ISO regex + headers() read + auth check + parse + fallback). The migration at C.2 changes synchronous `new Date()` to `await nowDate()` — adds one microtask per render of `_ShowBody`, `Footer`, `StaleFooter`. Production behavior is identical when `ENABLE_TEST_AUTH` is unset (the gate short-circuits to `return new Date()`).

Pre-flight `pnpm install` size: unchanged from Phase B close-out (`cd14865`).
Post-Phase C `pnpm install` size: unchanged (no new deps added).
`next build` bundle delta: expected negligible (<1 KB across all surfaces; verify at close-out).

---

## §11 Linked content deferred / phantom-target audit

Per `feedback_deferral_discipline.md`. Phase C's expected deferrals:

- **E2E clock-pipeline proof (test #18, AC-11.39 full coverage)** — DEFERRED to **Phase F** (Task F.X — Playwright screenshot harness). Phase C ships the server-side utility that makes the E2E proof viable; Phase F runs the actual capture-against-different-`frozenClockInstant` byte-comparison. Concrete trigger, scheduled home — this is a planned scope split, NOT a deferred-because-blocked item.

- **`scripts/help-screenshots.manifest.ts`** — Phase F's deliverable. The C.4 guard's `discoverScanRoots()` is forward-compatible: it reads the manifest if present, falls back to `app/show` + `app/admin` + `components/` otherwise. No Phase C action needed.

- **Footer.tsx waiver-vs-migrate choice** — LAND-NOW at C.2 (small mechanical fix, <5 LOC). If the implementer chooses the waiver path, the per-line waiver comment is the deliverable; if migrate, the `await nowDate()` swap. Either is in scope.

Three-bucket routing legend:
- **Land-now:** small mechanical fix, <~30 LOC, no milestone-significant abstraction.
- **DEFERRED.md (per-plan):** blocked on planned future M11 phase (D / E / F / G / H / I) with concrete trigger.
- **BACKLOG.md (project-wide):** speculative, no scheduled home, no concrete trigger. Aspirational milestone names are NOT real homes.

No expected `DEFERRED.md` / `BACKLOG.md` entries from Phase C. If adversarial review surfaces items, route per the three-bucket discipline at disposition time.

---

## §12 Sign-off

- [x] Implementer §A (GPT-5.5 / Codex CLI): 2026-05-19 — Phase C §A close-implementation SHA `6c7e6de` (R7 fix; latest Phase C surface change). §A contributions: `9f2a37f` (C.1), `91a57f7` (C.3), `4cb6d82` (C.4), `ee62bb4` (R1 fix 1), `27c4360` (R1 fix 2), `9d3db32` (R5 outer-unwrap, cherry-picked equivalent of orphaned `98637e9`), `648d22a` (R6), `6c7e6de` (R7).
- [x] Implementer §B (Opus / Claude Code): 2026-05-19 — C.2 commit `4ab9a84`. §B contributions: `4ab9a84` (C.2), `b3f23ab` (class-sweep extension), `4d257e1` (R2 migration), `0a27df2` (R2 structural defense), `7e789f5` (R3 meta-ext), `c06352b` (R4 meta-comprehensive).
- [x] Reviewer (Codex cross-CLI via `/codex:adversarial-review`): **APPROVE on 2026-05-19 at 90% confidence at R8** after 7 prior CONDITIONAL rounds — each round closed a genuinely-different defect (R1: 2 unrelated structural defects; R2: production-side class-sweep + structural defense; R3-R7: 5 consecutive defensive-layer AST shape extensions). Codex's R7 implementer + R8 reviewer both affirmed the declarative-helper-export class is structurally exhausted.
- [ ] User review: __ date __

Phase C **closed** in this handoff. Marking in `ROUTING.md` is a follow-up admin step.

Close-out gates satisfied:

- [x] All four Phase-C task commits landed (C.1 `9f2a37f` → C.2 `4ab9a84` → C.3 `91a57f7` → C.4 `4cb6d82`) + class-sweep extension `b3f23ab` + 7 review-driven fix commits (`ee62bb4`, `27c4360`, `4d257e1`, `0a27df2`, `7e789f5`, `c06352b`, `9d3db32`, `648d22a`, `6c7e6de`).
- [x] `tests/time/now.test.ts` green at 20 cases (10 original gate + 3 envelope + 7 calendar-impossible-ISO from R1 fix 1).
- [x] `tests/show/page-today-uses-now-utility.test.ts` + `tests/components/shared/staleFooter-now-prop.test.ts` + `tests/components/admin/class-sweep-now-utility.test.ts` + `tests/components/layout/FooterPreviewSurface.test.tsx` + `tests/lib/time/relativeDayChip.test.ts` all green.
- [x] `tests/help/_metaServerTimeGuard.test.ts` green (17/17). 4 mutation-path violations remain, all `// not-render-side:` waivered.
- [x] `tests/help/_metaTimeHelpersRequireNow.test.ts` green (44/44) — structural defense at its natural ceiling.
- [x] X.1 parity (`tests/cross-cutting/codes.test.ts`) still green.
- [x] All Phase A + Phase B tests still green.
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm test:e2e --project=mobile-safari` clean at final SHA `6c7e6de`.
- [x] Both impeccable v3 dual-gate runs APPROVE (R1 post-class-sweep + R2 post-R2-fix) — external attestation via fresh Opus subagents.
- [x] Cross-model adversarial review converged to APPROVE at R8 (90% confidence, 0 findings).

---

## §13 Meta-test inventory (Phase C introduces / extends)

Per AGENTS.md "Meta-test inventory (mandatory)" writing-plans rule + memory `feedback_meta_test_at_plan_time_not_round_n.md`. Phase C's meta-test footprint:

- **CREATE** `tests/time/now.test.ts` (M11 test #15) — three-precondition gate + capture-boundary + alt-style envelope. 10 cases at C.1 commit + 3 cases at C.3 commit = 13 cases at Phase C close-out.
- **CREATE** `tests/show/page-today-uses-now-utility.test.ts` — source-file structural assertion that `app/show/[slug]/_ShowBody.tsx` (or `page.tsx` if the migration moves the call site there) imports `nowDate` from `@/lib/time/now` and uses `await nowDate()` instead of `new Date()` at the `const today` site. Also asserts no async IIFE pattern that would render Promise-as-React-child (r2 fix per C-r1 finding 2).
- **CREATE** `tests/components/shared/staleFooter-now-prop.test.ts` — deterministic-output contract: with `X-Screenshot-Frozen-Now` pinned, byte-identical render across a 61s fake-timer advance. Verify-red proof requires the unfixed default-branch to drift between renders.
- **CREATE** `tests/help/_metaServerTimeGuard.test.ts` (M11 test #16) — server-time grep guard. Lexer-based `stripComments`; non-global `FORBIDDEN_PATTERNS`; directive-prologue `isClientComponent`; manifest-derived + components-always scan roots; per-line `// not-render-side:` waiver. Includes its own self-tests (multi-violation regex stability; comment-stripping cases; client/server classification cases; directive-prologue boundary cases).
- **CREATE** `lib/time/now.ts` — the gated time utility module. Single source of truth for "current instant" in server render paths.
- **EXTEND** existing mutation-path files (`app/admin/actions.ts`, `app/show/[slug]/p/actions.ts`, `app/admin/dev/actions.ts`) — add per-line `// not-render-side: <reason>` waivers on every existing `new Date()` / `Date.now()` call. NOT a behavior change; structural guard-acceptance only.
- **VERIFY** `tests/cross-cutting/codes.test.ts` (X.1's parity test) — stays green. Phase C does not touch `MessageCatalogEntry` shape or the catalog.
- **VERIFY** `tests/components/StaleFooter.test.tsx` (existing sync behavior) — stays green after Option A's required-prop migration. Existing tests already pass `now={...}` explicitly per the line-27 docstring; the migration just removes the `?? new Date()` default branch.

No CI workflow extensions expected. Tests run under the standard `pnpm test` gate.

---

## §14 Cross-milestone dependencies (Phase C specific)

- **M11 Phase B closed at `cd14865`** — Phase C builds on Phase B's `MessageCatalogEntry` schema extension, though Phase C does NOT consume the new `title` / `longExplanation` / `helpHref` fields. Phase B's surface (`lib/messages/`, `tests/messages/`) does not overlap Phase C's surface (`lib/time/`, `tests/time/`, `tests/help/`, three UI files at C.2).

- **M11 Phase A closed at `e911078`** — Phase A's `app/help/layout.tsx` and existing `app/show/[slug]/page.tsx` are NOT migrated by Phase C; Phase A's `app/help/*` does not currently render any `new Date()` call sites (verify at kickoff via the C.4 guard; if any surface, surface as a question to the orchestrator, NOT a silent migration).

- **Phase D (MDX components) depends on Phase C** per `00-overview.md` r2 strict-sequential ordering. Phase D's `<Screenshot>` component consumes the frozen-clock primitive Phase C ships — without Phase C's `lib/time/now.ts`, the captured screenshot's server-rendered timestamps would drift between captures.

- **Phase F (screenshot harness) consumes Phase C end-to-end** — Phase F's capture script sets `page.setExtraHTTPHeaders({ "X-Screenshot-Frozen-Now": frozenClockInstant, Authorization: ... })`. Phase F's test #18 is the E2E proof that the header pipeline actually reaches the server's render path; AC-11.39 partial-coverage in Phase C becomes full-coverage in Phase F.

- **M3 `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` env contract is the canonical source** — `app/api/test-auth/set-session/route.ts:95` is the existing reference implementation. Phase C reuses the env var names, the Bearer prefix, AND the `length >= 16` secret guard. Do NOT invent a new env var. Verify the live route still enforces `length >= 16` at kickoff time.

- **X.* siblings (X.5, X.6) do NOT share Phase C's file surface** if they're not touching `lib/time/`, `tests/time/`, `tests/help/`, `app/show/[slug]/_ShowBody.tsx`, `components/layout/Footer.tsx`, `components/shared/StaleFooter.tsx`. They can run in parallel if separate Codex sessions are available. Phase C's working-tree discipline (specific `git add` paths, never `git add -A`) keeps cross-talk benign per watchpoint #16.

- **Phases D, E, G, H, I** all depend (transitively) on Phase C's `lib/time/now.ts` landing. Phase D's `<Screenshot>` consumes the frozen-clock primitive; Phase E's content authoring renders timestamps that must pin under the harness; Phase G's affordance retrofit does NOT depend on Phase C directly; Phase H's auth integration tests reuse the same `ENABLE_TEST_AUTH` env Phase C gates on; Phase I's close-out validates the end-to-end clock pipeline as part of `/impeccable audit` evidence.
