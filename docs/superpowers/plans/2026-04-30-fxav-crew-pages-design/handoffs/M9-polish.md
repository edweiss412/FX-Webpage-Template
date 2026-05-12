# Handoff — M9: Stale-data UX, error states, polish (AC-9.1..AC-9.3) + deferral basket

**Handed off:** 2026-05-12 by Eric Weiss
**Implementer:** Opus 4.7 / Claude Code (per ROUTING.md M9 row — all-Opus; the UI hard rule reinforces this regardless of routing)
**Adversarial reviewer:** GPT-5.5 / Codex CLI (per ROUTING.md M9 row — Opus implements → Codex reviews)
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/09-10-admin.md` (§M9 only; §M10 is a separate milestone)

> M9 is **NOT** four tasks. The plan lists four stated tasks (9.1 Stale-data footer, 9.2 Error boundaries per tile, 9.3 Empty-state catalog reachability, 9.4 Message catalog (§12.4) implementation), but the deferral inventory routes **~18 additional items here**: M2-D1, M4-D2..M4-D6, M5-D1..M5-D8, M7-D1..M7-D5. Treating M9 as "ship the four tasks and triage the rest" is the failure mode the M4 close-out warning codified: parser-order → persona-order is an IA judgment call that needs design context, not close-out pressure. **Task 9.0 (`/impeccable shape` scope session) is the mandatory FIRST deliverable** and decides which deferred items ship in M9 vs roll to M10/M11.

> M9 is also the milestone where **`/impeccable critique` dispositions are most likely to silently violate the spec**. Per memory entry `feedback_impeccable_critique_not_authoritative_vs_spec.md` (codified after M8 R2 M2 shipped a §13.1-violating subhead): every critique disposition that rewrites user-visible copy MUST be spec-checked before commit. Impeccable knows UX; it does not know the spec's product contracts. This rule is load-bearing for M9 because polish-pass dispositions are concentrated here.

---

## 1. Spec sections in scope

Exhaustive, not representative. M9's surface = the four stated tasks + every §-section referenced by the deferral inventory routed here.

**From the four stated M9 tasks (per plan `09-10-admin.md:5,7,27,110,115`):**

- **§5.4** — Stale-data footer ladder; relative-time tiers; `last_sync_status` branch precedence (Task 9.1).
- **§8.3** — Empty-state catalog (whole-tile-missing rules, generic-optional sentinel hiding) (Task 9.3).
- **§9.0.1** — `<ErrorExplainer>` "What does this mean?" link; `helpfulContext` field rule that every dougFacing-non-null code carries a one-paragraph plain-language explanation (Task 9.4).
- **§12.1** — Error boundaries per tile; server vs client split (Task 9.2).
- **§12.4** — Error-code catalog (entire section); `MessageCode` enum × dougFacing/crewFacing/followUp/helpfulContext (Task 9.4); the canonical copy that catalog rows MUST match (mandatory re-read for every copy rewrite — see watchpoint 1 in §6).
- **§17.1 milestone 9** — Per-milestone AC-9.1..AC-9.3.

**From the deferral inventory routed here (per `DEFERRED.md` Open section):**

- **§7.3** — Sign-in / `/me` flow copy and IA (M5-D1, M5-D4, M5-D5).
- **§4.6** — `admin_alerts` UPSERT contract; per-show vs global keying (M5-D3 AlertBanner queue depth, resolve confirmation, raised_at format).
- **§10** — Onboarding flow copy mapping (M5-D5 — self-serve fallbacks).
- **§13.1** — "Something looks wrong?" footer button surfaces; report channel boundaries (Doug vs developer vs ops). **M8 R2 M2 reference** — the §13.1 channel-boundary inversion that shipped via a critique disposition; M9 work in or near this surface re-reads §13.1 verbatim before any copy rewrite.
- **§14.3** — Environment variable / ops surface (M2-D1 admin allow-list rotation; if it lands in M9 at all per 9.0's call).

If 9.0's scope decision adds or removes deferrals, this §1 list updates in the same commit that ships the 9.0 output.

## 2. Acceptance criteria

Canonical AC IDs from the plan; every ID must have at least one passing assertion at milestone close.

- **AC-9.1** — Stale-data footer renders relative-time tiers AND every `last_sync_status` branch (`ok` / `sheet_unavailable` / `drive_error` / `parse_error` / `pending_review` / `pending`) with catalog-bound copy via `messageFor`. [Task 9.1]
- **AC-9.2** — Empty-state catalog reachability: every empty state defined in §8.3 is reachable from at least one fixture (or synthesized variant); Playwright `toHaveScreenshot` baselines are acceptable as the v1 mechanism. [Task 9.3]
- **AC-9.3** — Error boundaries per tile: server-throw inside a tile renders the tile-level fallback (NOT the route-level `error.tsx`); client-descendant render throws are caught by the client `<TileErrorBoundary>`; both layers compose. [Task 9.2]

**Plus one explicit M9 exit gate (NOT a numbered AC; recorded here so it is checkable at close):**

- **AC-9.X (M9 deferral closure)** — Every M9-routed deferred item (per `DEFERRED.md` Open at handoff time: M2-D1, M4-D2..M4-D6, M5-D1..M5-D8, M7-D1..M7-D5) is **either resolved in M9** (with commit SHA recorded in `DEFERRED.md` Resolved section) **or re-deferred with a new Suggested-home + dated rationale** in `DEFERRED.md` Open. Silent leave-in-place is a discipline regression — the same failure mode flagged at M8 §11(d) for the M5-D9..M5-D11 operator-log sink decision.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [ ] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [ ] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

The other six plan amendments (parser registry / v4 single-marker / Sheets modtime-CAS / MI-8 debounce / MI-9 LEAD-bit / Amendment 9 first-seen auto-publish) are all M1/M6/M6.5 territory; **none apply to M9.** Amendment 9 was resolved in M6.5 at SHA `badbb15` (per `DEFERRED.md` Resolved section).

**State explicitly:** No new spec amendments are expected in M9. M9 is implementation-only against the existing spec. If a finding during convergence requires an amendment, that's a P0 — surface and pause; do not silently fix. (M8 R2 M2 was almost exactly this — a copy rewrite that contradicted §13.1 — caught by adversarial review, not self-review.)

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3, M4, M5, M6, M6.5, M7, M8 closed. `git rev-parse --short HEAD` at handoff authoring is `69ed38a docs(handoff): M8 milestone converged at R4 APPROVED`. Working tree clean except `docs/superpowers/specs/2026-05-12-user-facing-docs-design.{html,md}` (unrelated user-facing docs draft, untracked).
- [ ] **Pre-flight tests passing in isolation** (do NOT parallelize Vitest with Playwright):
  - `pnpm lint` exits 0 (M8 close-out baseline; only pre-existing M7 `<img>` warnings in `components/diagrams/Gallery.tsx` + `components/diagrams/GalleryLightbox.tsx` deferred via M7-D3 — those will be addressed in M9 if M7-D3 is routed here at 9.0).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 (M8 close-out baseline — re-verify at kickoff).
  - `pnpm test:e2e --project=mobile-safari` exits 0 (M8 close-out baseline).
  - `pnpm verify:spec-amendment` exits 0 (M8 close-out baseline; still gates CI even though M9 has no amendments).
  - `pnpm dlx supabase db reset && pnpm db:seed` applies cleanly.
- [x] **Specific files present from prior milestones**:
  - All M0–M8 deliverables.
  - `lib/messages/catalog.ts` + `lib/messages/lookup.ts` (M5-shipped, M6/M7/M8-extended). M9 EXTENDS in two places: (a) Task 9.1 adds `SYNC_DELAYED_MODERATE`, `SYNC_DELAYED_SEVERE`, `PARSE_ERROR_LAST_GOOD`; (b) Task 9.4 adds the `helpfulContext` field to every existing entry whose `dougFacing` is non-null. If M7-D2 is routed in by 9.0, additionally extend with `AGENDA_GONE_FOR_CREW` (410) + `AGENDA_UNAUTHENTICATED` (401).
  - `tests/components/tiles/_metaSentinelHidingContract.test.ts` — exists from M4/M7 era. M9 EXTENDS with diagrams + agenda tiles if M7-D5 is routed in by 9.0.
  - `tests/messages/_metaAdminAlertCatalog.test.ts` — M5/M6/M7/M8-extended. M9 EXTENDS with any new producer codes added (e.g., `TILE_SERVER_RENDER_FAILED` from Task 9.2 if landed; `AGENDA_*` codes from M7-D2 if routed).
  - `app/globals.css` `@theme` block (M4-shipped). M9 ADDS `--tracking-eyebrow` (and possibly `-eyebrow-strong`) if M4-D5 is routed in.
  - `DESIGN.md` — M4-shipped. M9 documents any new tokens added under §2.
- [ ] **NEW M9 modules / routes** (concrete file list deferred to 9.0; the four stated tasks are minimally):
  - `components/shared/StaleFooter.tsx` (Task 9.1)
  - `components/shared/TileServerFallback.tsx` + `components/shared/TileErrorBoundary.tsx` (Task 9.2)
  - `lib/messages/catalog.ts` extensions + new field `helpfulContext` (Task 9.4)
  - Per-tile data-loader / view-component splits (Task 9.2) — every tile in `components/tiles/**` must split into `*TileLoader` + `*TileView`.
  - Additional surfaces for whichever deferrals 9.0 routes into M9 — enumerated in the post-9.0 commit that updates this §4.
- [ ] **Env vars set in `.env.local`**: no new M9 env vars expected. (If M2-D1 admin allow-list rotation lands in M9 with code changes, that may extend; 9.0 decides.)
- [ ] **`vercel.json` cron registry**: no new M9 entries expected.

If any required pre-flight command fails, do NOT start the next M9 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Tick each invariant exercised by M9's code paths.

- [x] **TDD per task** (always applies, §1.1). Failing test → minimal implementation → passing test → commit. Self-review runs after. Especially critical for Task 9.2's server-throw vs client-throw tests — both layers must have negative-regression-verified tests (stash the production fix; confirm the test fails; restore the fix; confirm the test passes — per memory `feedback_negative_regression_verification.md`).

- [ ] **Per-show advisory lock** (§1.2). **Likely N/A for M9** — polish is overwhelmingly UI-only; M9 does not introduce new `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions` write paths. **Confirm during 9.0 scope session.** If any 9.0-routed deferral adds a write surface (none of the listed M2/M4/M5/M7 deferrals appear to), AGENTS.md §1.2 + the M5 R20 deadlock class applies; extend `tests/auth/advisoryLockRpcDeadlock.test.ts` and document the holder layer in this section.

- [ ] **Email canonicalization at boundary** (§1.3). **Likely N/A for M9** — none of the routed deferrals introduce new email-reading surfaces. **Confirm during 9.0.** If a deferral does, the M6-extended glob in `tests/admin/no-inline-email-normalization.test.ts` must extend.

- [ ] **No global sync cursor** (§1.4). **N/A for M9.** M9 does NOT touch sync watermarks. `! rg "lastPollAt" components/ lib/messages app/show app/me app/auth` returns zero (preserved).

- [x] **No raw error codes in user-visible UI** (§1.5). **FULLY ACTIVE for M9.** This is the milestone most likely to touch user-facing error copy:
  - Task 9.1 binds every stale-footer status branch to `messageFor` (catalog-driven).
  - Task 9.4 implements the catalog + lookup contract.
  - M5-D5 (help/recovery copy on bootstrap + sign-in) ⇒ ErrorExplainer-routed.
  - M5-D8 (inline error copy duplication) ⇒ `messageFor` routing.
  - M7-D2 (AgendaPdfViewer 410/401/500 distinct copy) ⇒ new catalog rows + `messageFor`.
  Every M9 surface that renders an error code routes through `lib/messages/lookup.ts`. Static-grep regression at M9 close: `! rg "(REPORT_|SHEET_|DRIVE_|SYNC_|PARSE_|AGENDA_)[A-Z_]+" components/ app/show app/me app/auth | rg -v "messageFor\\(|catalog\\.ts|test|spec"` returns zero. (Exact pattern revised at 9.0 close once the routed codes are known.)

- [x] **Commit per task** (§1.6). One task per commit. Conventional-commits format. Common scopes for M9 (per `AGENTS.md §1.6` historical convention): `crew-page`, `messages`, `auth`, `admin`, `assets`, `tiles`, `handoff`, `plan`. **Task 9.0 commit:** `chore(plan): M9 scope-and-shape session — route deferrals; finalize task list`. **Subsequent tasks:** per-task verbatim commit subjects from the plan file where the plan specifies them (Task 9.1: `feat(crew-page): stale footer status ladder with parse_error + pending_review branches (§5.4, §12.4)`; Task 9.2: `feat(crew-page): server + client tile error boundaries (§12.1)`; Task 9.3: `test(crew-page): empty-state reachability baselines`; Task 9.4: `feat(messages): §12.4 catalog + lookup + helpfulContext field`). Deferral-resolution commits use the deferred item's domain scope (e.g., M4-D5: `feat(crew-page): consolidate eyebrow tracking via --tracking-eyebrow token (M4-D5)`).

- [x] **Spec is canonical** (§1.7). No new spec amendments in M9 (§3 above). If a finding during convergence requires one, that's a P0 — surface and pause.

- [x] **UI quality gate (impeccable v3 critique + audit pair)** (§1.8). **FULLY ACTIVE — every surface touched in M9 ships only after the dual run.** UI surface = any file under `app/` except `app/api/**`, any file under `components/`, any `app/globals.css` `@theme` block, any change to `DESIGN.md` or `tailwind.config.*`. M9 is **mostly** UI surface; expect to run the dual gate on every cluster the 9.0 session defines (likely 4–6 clusters: crew-page IA, auth flow, admin banner, lightbox polish, tokens/atoms, errors). Both `/impeccable critique` AND `/impeccable audit` run with canonical v3 preflight gates (load-context → product gate → command-reference → register identification → preflight signal). HIGH and CRITICAL findings either fixed or deferred via a `DEFERRED.md` entry — silent leave-in-place is a discipline regression.

  **Plus the new spec-check discipline (memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`):** every `/impeccable critique` (and `/impeccable clarify` / `/impeccable polish`) disposition that rewrites user-visible copy MUST be spec-checked before commit. Grep the spec for the relevant §-section governing the surface; match the rewrite against the spec text semantically. If the spec is silent on exact phrasing but the surface is high-stakes (channel boundary, security signal, payment/data flow), surface as a question rather than ship the critique's rewrite. **Especially load-bearing surfaces** (highest M9 risk): §7.3 sign-in copy, §13.1 report-channel boundaries, §12.4 catalog entries, §10 onboarding flow copy. **Not subject to this rule:** `/impeccable audit` (catches technical/a11y issues without rewriting copy) and `/impeccable shape` (IA work, usually no copy to violate).

- [x] **Supabase call-boundary discipline** (§1.9). **APPLIES if any M9 work adds Supabase calls.** Task 9.2's `<TileServerFallback>` data-loader functions may issue Supabase reads — each destructures `{ data, error }`; returned-error vs thrown-error paths distinguished; infra faults surface as discriminable typed results (`{ kind: 'infra_error' }` or typed `*InfraError` thrown), never silent `continue`. Helpers register in the relevant meta-test (likely `tests/auth/_metaInfraContract.test.ts` for `/me` / sign-in deferrals; `tests/sync/_metaInfraContract.test.ts` for any read-side polish; or a new registry if 9.0 introduces one). Per-call-site annotation `// not-subject-to-meta: <reason>` is the alternative when a row is genuinely unnecessary.

## 6. Watchpoints from prior adversarial review

M9 inherits the M4/M5/M7/M8-codified bug classes. Below is the prioritized list for round-1 reviewer scan.

1. **Impeccable critique disposition vs spec contract** (memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`; codified after M8 R2 M2). Every `/impeccable critique` / `clarify` / `polish` rewrite of user-visible copy passes through a spec re-read BEFORE commit. **Especially:** §7.3 sign-in copy (M5-D4), §13.1 report-channel boundaries (already shipped M8, but M9 may touch surrounding copy), §12.4 catalog entries (M7-D2 AGENDA_* codes + many M5-D items), §10 onboarding flow copy (M5-D5 self-serve fallbacks). **Procedure:** when a disposition rewrites copy, grep the spec for the relevant § and confirm the rewrite matches semantically. If the spec is silent on phrasing but the surface is high-stakes, surface as a question. Treat impeccable §12 dispositions as advisory inputs to the adversarial-review record, NOT authoritative.

2. **Per-instance whack-a-mole / class-sweep code-shape-based, not name-list-based** (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`). M9 is a basket of small fixes; the temptation to patch only the named instance is high. When review surfaces a bug, grep the codebase for the same SHAPE (not name list) BEFORE patching only the named instance. **M9-specific risk classes** (each is a SHAPE):
   - Every inline `tracking-[0.NNem]` value on uppercase eyebrow text (M4-D5 surface; SHAPE: arbitrary-tracking on `text-xs uppercase`).
   - Every accent-button className composition diverging from `<SignInButton>` (M5-D7 surface; SHAPE: button with focus-ring-offset + disabled state but no shared atom).
   - Every inline hand-coded error copy string that should route through `messageFor` (M5-D8 surface; SHAPE: `setError("…")` with literal string in `app/` or `components/`).
   - Every `<img>` element under `components/diagrams/` (M7-D3 surface; SHAPE: `next/image`-eligible asset).
   - Every empty-state inline boolean check that should route through `shouldHideGenericOptional` or a new media-presence helper (M7-D5 surface; SHAPE: `items.length > 0` or `arr.some(Boolean)` guards in tile components).

3. **DESIGN.md token drift / silent token introduction.** M4-D5 is the explicit token surgery (`--tracking-eyebrow` consolidation). Other M9 clusters may want new tokens — **do not introduce silently.** Token additions go through the `/impeccable shape` session in Task 9.0 (or a follow-up shape session for the cluster), are documented in `DESIGN.md` §2 in the same commit that adds the `@theme` row, and are not introduced mid-cluster as an "obvious" addition. **Layout-regression gate:** any token change that affects spacing/typography/sizing must be cross-checked against M4's dimensional-invariant Playwright suite (`pnpm test:e2e tests/e2e/crew-page.spec.ts --project=mobile-safari` + `--project=desktop-chromium` once M4-D6 is fixed).

4. **Tile reorder (M4-D2) and header rebalance (M4-D3) are IA judgment calls — do them FIRST if 9.0 routes them in.** Per `DEFERRED.md` M4-D2/M4-D3 descriptions, both require dedicated `/impeccable shape` sessions before crafting. If 9.0 routes either into M9, the shape session for that cluster runs BEFORE any per-tile work that depends on the new order. Reordering tiles after subsequent per-tile work has shipped is a recipe for cascading rebases.

5. **M4-D6 is a real bug pretending to be polish.** Per `DEFERRED.md`, `tests/e2e/crew-page.spec.ts:118` asserts a 2-col grid without setting the viewport — on `desktop-chromium` (1280×800) the grid renders 4 cols and the assertion fails. Pre-existing failure introduced at commit `c518006`. If 9.0 routes M4-D6 in: treat as bug-fix priority (either add `await page.setViewportSize({ width: 390, height: 667 })` at the top of the test OR scope its `testMatch` to `mobile-safari` only). **Verify the desktop-chromium project is genuinely excluded or genuinely passing** — silent test exclusion is its own discipline regression.

6. **Iterate adversarial review until APPROVE** (memory `feedback_iterate_until_convergence.md`). The round-3 cap is for value-judgment disagreement loops, NOT for halting when each round surfaces NEW bugs. **M9 round count is hard to predict** — could be 1–2 rounds if 9.0 routes few deferrals and each cluster is small, or 5–8 rounds if 9.0 routes everything. Plan accordingly; do not pre-commit to a round budget.

7. **Class-sweep before patching review findings** (memory `feedback_class_sweep_before_patch.md`). When the reviewer surfaces a bug, grep the codebase for the same class BEFORE patching only the named instance. Per-instance whack-a-mole burns review rounds without converging.

8. **Fix-round regression budget** (AGENTS.md writing-plans additions). When a fix in round N patches surface S for class C, round (N+1) preparation must include: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test (if any) still passes, (c) note both in the round closure.

9. **Same-vector recurrence triggers comprehensive re-analysis** (AGENTS.md §1, line 75; codified after M7 R20–R26). 3 consecutive rounds on the same vector → comprehensive re-analysis BEFORE the next review fires. **M9 candidate vectors** (each could plausibly recur):
   - DESIGN.md token compliance across multiple touched surfaces (theming audit).
   - Spec-check discipline on critique-rewritten copy (every cluster with copy changes).
   - The `helpfulContext` × `dougFacing` coverage rule (Task 9.4 — every code with non-null `dougFacing` must have non-null `helpfulContext`; the inverse must be enforced too).

10. **codex exec stdin closure** (memory `feedback_codex_exec_needs_stdin_closed.md`). Cross-CLI Codex reviews go through `/codex:adversarial-review` with proper per-session scoping; do NOT raw-shell `node codex-companion.mjs`. The slash command handles stdin closure (`< /dev/null`) and the per-session `CLAUDE_PLUGIN_DATA` scoping.

11. **echo append discipline** (memory `feedback_echo_append_newline_trap.md`). Never use `echo "X" >> .gitignore` or any append-to-file shell idiom that doesn't guarantee a trailing newline on the previous line. Use `printf '\n%s\n'`. Verify with `git check-ignore -v` for `.gitignore` appends; verify with `git diff` for env / config appends. M0 R1 + M4 R7 both shipped malformed entries this way.

12. **Verify review findings against external API spec** (memory `feedback_verify_review_findings_against_external_api_spec.md`). M9 risk class: if M7-D3 is routed in, `next/image` migration findings must be verified against Next.js 16 image-optimization typings + the `/api/asset/diagram/*` proxy's auth-checked bytes contract (`private, max-age=0, must-revalidate`). The optimizer would either need to bypass the auth proxy OR add a second redirect layer — declare the proxy origin as a `next.config.ts` remote pattern and verify the resulting `Cache-Control` is still `private` so revocation propagates.

13. **AC test coverage vs production-caller context** (M5-D1 pattern). The same AC-test caveat that surfaced at M5-D1 / M8 applies in M9: an AC test that passes against a synthetic fixture but fails against the real rendered surface is a false-pass. Especially for Task 9.3 (empty-state catalog reachability) — Playwright `toHaveScreenshot` baselines must be captured from actual rendered pages, not synthesized component-level snapshots, OR the test name and §8.3 cross-reference must say so. Re-verify every M9-touched test against its actual production-caller context.

14. **§13.1 channel boundary** (M8 R2 M2 reference). If any M9 work touches report-channel copy (likely none, but possible if M5-D8 inline-error-routing pulls in `<ErrorExplainer>` work near `<ReportButton>` / `<ReportModal>`): re-read §13.1 verbatim. The contract is "report goes to the developer, not Doug; for show-content questions, message Doug directly." Any critique disposition that inverts that channel boundary must be rejected at the spec-check step.

## 7. Test commands

Every test command the implementer should be able to run during the milestone:

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright.
- **Vitest unit / component tests**:
  - `pnpm test tests/messages/catalog.test.ts` (Task 9.4 catalog-completeness + helpfulContext-coverage assertions)
  - `pnpm test tests/components/shared/StaleFooter.test.ts` (Task 9.1 status-precedence + catalog-binding assertions; create if missing)
  - `pnpm test tests/components/shared/TileServerFallback.test.ts` (Task 9.2 server-throw → tile-fallback assertion; create if missing)
  - `pnpm test tests/components/shared/TileErrorBoundary.test.ts` (Task 9.2 client-descendant-throw assertion; create if missing)
  - Additional test files per deferral cluster routed by 9.0.
- **Playwright e2e** (mobile-safari is primary; desktop-chromium for layout-dimensions regressions):
  - `pnpm test:e2e --project=mobile-safari` (always; AC-9.1 / AC-9.2 / AC-9.3 plus any persona-walkthrough specs added by deferrals).
  - `pnpm test:e2e --project=desktop-chromium tests/e2e/crew-page.spec.ts` (verify M4-D6 fix if routed; otherwise verify the testMatch scoping is what it should be).
- **Empty-state screenshot baselines** (Task 9.3):
  - `pnpm test:e2e tests/e2e/empty-state-reachability.spec.ts --project=mobile-safari --update-snapshots` (initial baseline run).
  - Subsequent runs without `--update-snapshots` to detect drift.
- **Existing meta-tests** (always run; new rows added per §13 below):
  - `pnpm test tests/components/tiles/_metaSentinelHidingContract.test.ts` (M4/M7-shipped; M9 extends with diagrams + agenda rows if M7-D5 is routed).
  - `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` (M5/M6/M7/M8-shipped; M9 extends with any new `admin_alerts` producer codes from Task 9.2 or routed deferrals).
- **Static-grep gates** (run at milestone close):
  - `! rg "(REPORT_|SHEET_|DRIVE_|SYNC_|PARSE_|AGENDA_)[A-Z_]+" components/ app/show app/me app/auth | rg -v "messageFor\\(|catalog\\.ts|test|spec"` returns zero (refined at 9.0 close once routed codes are known).
  - `! rg "lastPollAt" components/ app/show app/me app/auth` returns zero (M5 invariant preserved).
  - **Un-skipped specs:** every previously-skipped Playwright/Vitest spec touched by M9 work is re-enabled, OR carries a `// reason: <DEFERRED.md ID>` comment pointing to a still-open deferral.

## 8. Exit criteria

- [ ] Task 9.0 ships first; its output updates §A below (the post-9.0 task list) AND `DEFERRED.md` (any deferrals that flip Suggested-home) in the same commit.
- [ ] All tasks in `09-10-admin.md` §M9 (9.1, 9.2, 9.3, 9.4) checked off (`- [x]` on every step).
- [ ] Every M9-routed deferred item is **either resolved in M9** (with commit SHA recorded in `DEFERRED.md` Resolved section) **or re-deferred with a new Suggested-home + dated rationale** in `DEFERRED.md` Open. **No silent leave-in-place** (AC-9.X exit gate).
- [ ] AC-9.1, AC-9.2, AC-9.3 each have at least one passing assertion.
- [ ] `lib/messages/catalog.ts` extended per Task 9.1 (`SYNC_DELAYED_MODERATE`, `SYNC_DELAYED_SEVERE`, `PARSE_ERROR_LAST_GOOD`) AND Task 9.4 (`helpfulContext` field on every dougFacing-non-null entry).
- [ ] **Impeccable §12 dual gate closed** on every UI surface M9 touches. Zero unresolved HIGH/CRITICAL/P0/P1 findings (P2/P3 may be deferred via `DEFERRED.md`). Every critique disposition that rewrote user-visible copy is spec-checked and the §-reference cited in the disposition table.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `pnpm test:e2e --project=desktop-chromium` exits 0 if any M9 work touches desktop-chromium scope (e.g., M4-D6 fix).
- [ ] Static-grep gates from §7 pass.
- [ ] All commits follow `<type>(<scope>): <summary>` format. One commit per task per AGENTS.md §1.6.
- [ ] Adversarial review (per `superpowers:adversarial-review` with GPT-5.5 / Codex CLI per ROUTING.md) ran to convergence — recorded in convergence log below.
- [ ] Working tree clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.

## 9. Sandbox / git protocol

- [x] **Claude Code:** commits run in-session, no sandbox issue. Use `Bash` for `git add` + `git commit` per AGENTS.md §1.6.
- [ ] **Codex CLI default sandbox:** N/A — M9 is single-implementer Opus.
- [ ] **Codex CLI with relaxed sandbox:** N/A.

Cross-CLI Codex reviews (adversarial-review phase only) go through `/codex:adversarial-review` per memory `feedback_adversarial_review_canonical_invocation.md`. Do NOT raw-shell `node codex-companion.mjs`.

## 10. Adversarial review handoff

After Opus finishes implementation:

1. Opus summarizes what was built and confirms each per-task checklist + each deferral disposition. The summary explicitly lists which deferrals were resolved in-milestone vs re-deferred (and where they were re-deferred to).
2. The adversarial reviewer (GPT-5.5 / Codex CLI per ROUTING.md M9 row) is invoked via `/codex:adversarial-review --base 69ed38a --scope branch` (M8 close-out is the M9 implementation baseline; scopes the diff to M9 work only, not post-M8 housekeeping). If the kickoff SHA differs (post-handoff doc commits land before 9.0 starts), capture the actual milestone-base SHA in §0 of the convergence log.
3. Inputs: spec §5.4 + §8.3 + §9.0.1 + §12.1 + §12.4 + §17.1 + every §-section added to §1 above by 9.0; the M9 plan (`09-10-admin.md` §M9); this handoff; the diff `git diff <M9-base-SHA>..HEAD -- 'components/**' 'app/**' 'lib/messages/**' 'lib/visibility/**' 'DESIGN.md' 'app/globals.css' 'tests/components/**' 'tests/messages/**' 'tests/e2e/**' 'docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md'`. **The path filter is exhaustive, not representative; if 9.0 routes in deferrals touching paths outside this list (e.g., `lib/auth/**` if M5-D8 routes inline-error consolidation through auth helpers), add those paths at kickoff.**
4. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision. **Per memory `feedback_iterate_until_convergence.md`, do not halt at round 3 if each round surfaces new bugs; the round-3 cap is for value-judgment loops, not bug-finding.**
5. Each round's findings are all routed to Opus inline (this session) — M9 is all-Opus, so there's no cross-implementer routing.
6. **Adversarial review must keep full-milestone scope, not narrow per-round** (memory `feedback_adversarial_review_full_milestone_scope.md`). Each round anchors to the M9 milestone-base SHA, not the previous round's fix-base. The final APPROVE attests to the whole milestone, not just the latest fix.
7. **Every review round starts fresh-eyes** (memory `feedback_review_prompt_fresh_eyes_first.md`). Round-N review focus text leads with a fresh-eyes audit of the full current milestone diff against the spec / plan / watchpoints. Prior findings + commit SHAs are allowed only as a secondary regression checklist after the fresh-eyes instruction.
8. **Class-sweep before patching findings; meta-contract test when bug class recurs.** Both rules are load-bearing project invariants per AGENTS.md and the M5/M7/M8 retrospectives. M9 §13 below pre-declares meta-test extensions so the rule kicks in at plan time.
9. **Same-vector recurrence rule** (AGENTS.md §1 line 75; codified after M7 R20–R26). 3 consecutive rounds on the same vector → comprehensive re-analysis BEFORE the next review fires. M9 candidate vectors enumerated in §6 watchpoint 9.
10. Convergence is logged at the bottom of this file (under `## Convergence log`).
11. Only after convergence does M9 move to "completed" status — AND only after `DEFERRED.md` reflects the M9 dispositions for every routed item.

## 11. Cross-milestone dependencies

**(a) DESIGN.md token additions must not break M4 tile layouts.** If 9.0 routes M4-D5 (`--tracking-eyebrow` consolidation) or introduces other new tokens, the layout-dimensions Playwright suite (`pnpm test:e2e tests/e2e/crew-page.spec.ts --project=mobile-safari`) is the regression gate. The dimensional-invariant assertions (`child.height === parent.height` within 0.5px tolerance, per AGENTS.md spec self-review additions) are real-browser-rendered and will catch token-driven layout collapse that jsdom would miss. **Run the layout suite after every token-touching commit, not just at milestone close.**

> **Recommended disposition:** Token changes are clustered in a single commit-set per shape session; layout suite is the immediate sanity check.

**(b) `lib/messages/catalog.ts` extensions vs M8's `REPORT_*` codes.** M8 added `REPORT_ORPHANED_LOST_LEASE`, `GITHUB_BOT_LOGIN_MISSING`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT`, `REPORT_HORIZON_EXPIRED` (some present from earlier milestones). M9 adds `SYNC_DELAYED_MODERATE`, `SYNC_DELAYED_SEVERE`, `PARSE_ERROR_LAST_GOOD` (Task 9.1) AND the `helpfulContext` field on every existing dougFacing-non-null entry (Task 9.4). If M7-D2 is routed in by 9.0, additionally `AGENDA_GONE_FOR_CREW` (410) + `AGENDA_UNAUTHENTICATED` (401).

> **Recommended disposition:** Run `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` after every catalog-extension commit. Verify the M8 codes are not regressed (none renamed, none dropped). The Task 9.4 `helpfulContext` field is additive — every M8 dougFacing-non-null code receives a one-paragraph plain-language explanation in the same commit that adds the field.

**(c) Tile reorder (M4-D2) and Realtime broadcast invalidation.** M6.5 introduced Realtime broadcast invalidation (`SHOW_FIRST_PUBLISHED` / `SHOW_UNPUBLISHED` per `lib/messages/catalog.ts:350-369`). If 9.0 routes M4-D2 (persona-urgency tile reorder) in, the new tile mount order must not break the Realtime invalidation contract — verify the Bootstrap / page mount sequence still subscribes to the show channel BEFORE the first tile renders, regardless of the reordered mount tree.

> **Recommended disposition:** If M4-D2 is routed, add a Playwright assertion that synthesizes a `realtime.send()` invalidation mid-render and verifies the page refetches data correctly in the new mount order.

**(d) M9 polish vs M10 onboarding wizard.** Per ROUTING.md, M10 is the onboarding wizard milestone (Tasks 10.1–10.10; split-mode: Opus wizard UI + Codex API routes). M9 deferrals that touch onboarding copy (M5-D5 self-serve fallbacks; possibly M2-D1 admin allow-list rotation if it surfaces in onboarding) MUST coordinate with M10's scope — verify at 9.0 that any onboarding-adjacent deferral routed into M9 does not pre-empt M10 work.

> **Recommended disposition:** 9.0's scope session reads `09-10-admin.md` §M10 alongside §M9 to confirm boundary. Onboarding-flow copy that lives in M5/auth surfaces (sign-in, /me, bootstrap) is M9 territory; wizard-step copy is M10 territory.

**(e) M11 ops-hardening operator-log sink (M5-D9 / M5-D10 / M5-D11).** Per M8 §11(d) kickoff decision: structured operator-log sink rolled to M11 ops-hardening. **M9 inherits NO operator-log work** — none of the M5/M7 deferrals routed to M9 require the sink. If 9.0 surfaces a deferral that does require it, surface to orchestrator as a routing question (M9 vs M11).

> **Recommended disposition:** No operator-log work in M9. Verify at 9.0.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**APPLIES — M9 is almost entirely UI surface.** The dual run (`/impeccable critique` + `/impeccable audit`) happens AFTER each cluster's implementation closes and BEFORE that cluster is marked done. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

**Plus the new spec-check discipline** (memory `feedback_impeccable_critique_not_authoritative_vs_spec.md`): every critique disposition that rewrites user-visible copy is verified against the spec's relevant § before commit. Disposition entries that fail spec-check are surfaced as questions, not silently dropped or silently shipped. The §-reference is cited in the disposition table alongside the SHA.

UI surfaces reviewed depend on what 9.0 routes in. Expected clusters (refined at 9.0 close):

- **Crew-page IA cluster**: `app/show/[slug]/page.tsx` (tile reorder if M4-D2), `components/layout/Header.tsx` (rebalance if M4-D3), `components/right-now/RightNowCard.tsx` (test-attribute relocation if M4-D4), `components/shared/StaleFooter.tsx` (Task 9.1).
- **Auth-flow cluster**: `app/me/page.tsx` (what's-next anchor if M5-D1), `app/show/[slug]/p/Bootstrap.tsx` (liveness if M5-D2), `app/auth/sign-in/page.tsx` + `SignInButton.tsx` (brand mark + Google G if M5-D4), help/recovery copy (M5-D5).
- **Admin banner cluster**: `components/admin/AlertBanner.tsx` (queue depth + resolve confirmation + raised_at if M5-D3).
- **Lightbox polish cluster**: `components/diagrams/GalleryLightbox.tsx` + `components/agenda/AgendaSheet.tsx` (entry/exit motion if M7-D1), `components/diagrams/Gallery.tsx` (`next/image` migration if M7-D3), pinch-zoom (M7-D4), AgendaPdfViewer error states (M7-D2), sentinel-hiding helper (M7-D5).
- **Tokens/atoms cluster**: `app/globals.css` `@theme` extension (`--tracking-eyebrow` if M4-D5), shared `<AccentButton>` atom (M5-D7), inline-error consolidation (M5-D8).
- **Errors cluster**: `components/shared/TileServerFallback.tsx` + `TileErrorBoundary.tsx` (Task 9.2), `tests/e2e/empty-state-reachability.spec.ts` baselines (Task 9.3), catalog implementation (Task 9.4).

Each cluster's findings + dispositions in the table format established by M5 / M7 / M8:

```
critique findings: <Finding ID> — <severity> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>> — spec-check: <§-reference> | <N/A — no copy rewrite>
audit findings: <P0-P3> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
```

**The `spec-check` column is M9-specific** — it tracks the new memory entry's discipline. Every critique disposition that rewrote user-visible copy carries either the spec §-reference that approved the rewrite OR an explicit `N/A — no copy rewrite` annotation. Audit findings don't need this column (audit doesn't rewrite copy).

The convergence log proper appends ONLY after impeccable evaluation closes (per cluster) AND adversarial review begins. M9 is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/CRITICAL/P0/P1 findings on every touched cluster AND adversarial review has converged AND `DEFERRED.md` reflects M9's deferral dispositions.

## 13. Meta-test inventory (AGENTS.md writing-plans rule — pre-declared at handoff time)

Per AGENTS.md §1.9 + the M5/M6/M7/M8 retrospectives: pre-declare meta-tests at plan/handoff time, NOT round 14. M4 §8.3 (8 rounds), M5 R14–R18 (6 rounds), M6 R8–R13 (5 rounds), M7 R20–R26 (7 rounds) all became cheap once the meta-test landed; the rounds disappear when the registry exists from day 1.

For each candidate class below, **create / extend / N/A — <reason>**. The exact list of new registry rows is partly determined by 9.0 (because the routed deferrals decide which surfaces M9 actually touches), but the headline create/extend/N/A determinations can be made now.

- [ ] **(EXTEND) Sentinel hiding in optional text — EXTEND `tests/components/tiles/_metaSentinelHidingContract.test.ts`** (M4/M7-shipped). **Routed by M7-D5** (if 9.0 keeps it in M9). Adds `shouldHideDiagrams(diagrams, agendaLinks)` to `lib/visibility/emptyState.ts` and registers `DiagramsTile` + `AgendaTile` in the meta-test so the §8.3 generic-optional contract walks them alongside the other sentinel-bearing tiles. New rows: `DiagramsTile` (media-presence: diagrams + agenda links), `AgendaTile` (media-presence: agenda PDF link). **If 9.0 defers M7-D5 to a later milestone, this row downgrades to N/A in M9 and the deferred home receives the meta-test extension obligation.**

- [ ] **(EXTEND) `admin_alerts` catalog completeness — EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** (M5/M6/M7/M8-shipped). New M9 rows (if the codes land): `TILE_SERVER_RENDER_FAILED` (from Task 9.2, if `<TileServerFallback>` emits an `admin_alerts` row per the plan's Task 9.2 Step 2 — verify the plan text says it does; the plan does mention "Server fallback also emits an `admin_alerts` row with code `TILE_SERVER_RENDER_FAILED`"). If M7-D2 is routed, additionally `AGENDA_GONE_FOR_CREW` and `AGENDA_UNAUTHENTICATED` (NOTE: these are crew-facing UI codes, not `admin_alerts` producers — verify at task close whether they belong in the admin_alerts catalog test or the codes-coverage test only).

- [ ] **(POSSIBLY EXTEND) Supabase call-boundary discipline — EXTEND `tests/auth/_metaInfraContract.test.ts` OR `tests/sync/_metaInfraContract.test.ts`** (M5/M6-shipped). **Routed by Task 9.2** (if `<TileServerFallback>`'s data-loader functions issue Supabase reads — they will, since every tile loads data from the DB). Each data-loader function (`loadLodgingTileData`, `loadScheduleTileData`, …) registers in the relevant meta-test. **If the loaders go in `lib/tiles/loaders/**` (likely), a new `tests/tiles/_metaInfraContract.test.ts` is warranted instead of extending the auth/sync ones** — decide at Task 9.2 close. The choice mirrors M6's decision to create `tests/sync/_metaInfraContract.test.ts` rather than extend the auth one.

- [N/A] **Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`)** — **N/A — M9 introduces no new `pg_advisory*` surfaces.** Polish is UI-only; none of the listed M2/M4/M5/M7 deferrals add an advisory-lock surface. **Re-verify at 9.0** — if any routed deferral does, this row becomes mandatory.

- [N/A] **No-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`)** — **N/A — M9 doesn't read emails from any new source.** Polish surfaces don't introduce email-reading code paths. **Re-verify at 9.0.**

- [N/A] **Amendment contract structural meta-test (`tests/reports/_amendmentContractMetaTest.test.ts`)** — **N/A — M9 doesn't touch the §13.2.3 report pipeline contracts.** M8 owns this meta-test; M9 leaves it alone.

**Empty rows silently lie.** The final create/extend/N/A determinations are confirmed at 9.0 close and re-confirmed at each cluster close.

---

## A. Task list

**Pre-9.0 (this handoff):** the §A task list is intentionally NOT enumerated. Per the kickoff prompt's "DO NOT pre-decide" rules, the 9.0 shape session decides which deferred items ship in M9 vs roll to M10/M11 and produces the concrete task list.

**Tasks 9.0 (scope-and-shape), then 9.1+ as determined by 9.0 output.**

### Task 9.0 — Scope-and-shape session (FIRST DELIVERABLE)

**Files:** modify `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M9-polish.md` (this file's §A). Modify `DEFERRED.md` to reflect any Suggested-home changes for deferrals re-deferred out of M9.

**Inputs:**

- The deferred inventory at handoff time: M2-D1, M4-D2..M4-D6, M5-D1..M5-D8, M7-D1..M7-D5 (per `DEFERRED.md` Open section).
- The four stated M9 tasks (9.1 Stale-data footer, 9.2 Error boundaries per tile, 9.3 Empty-state catalog reachability, 9.4 Message catalog) from `09-10-admin.md` §M9.
- The spec sections each touches (per §1 above).
- The DESIGN.md token surface (current state of `app/globals.css` `@theme` block + `DESIGN.md` §2).
- PRODUCT.md persona priorities (especially crew-on-venue-floor scan-speed rule, the "five-second answer rule" referenced in M5 §B impeccable critique).
- AGENTS.md §1.8 UI quality gate + the new spec-check discipline.

**Procedure:**

1. Invoke `/impeccable shape M9 polish scope` with the inputs above. **`/impeccable shape` is the right v3 command for IA / scope work — not `/impeccable polish` and not `/impeccable harden`.** The shape session produces an IA / grouping plan; subsequent per-cluster work runs `/impeccable polish` or `/impeccable harden` as appropriate.
2. Re-group the deferral inventory by surface cluster. Candidate clusters (per §12 above): **crew-page IA** (M4-D2, M4-D3, M4-D6, M5-D1), **auth flow** (M5-D2, M5-D4, M5-D5), **admin banner** (M5-D3), **lightbox polish** (M7-D1, M7-D2, M7-D3, M7-D4, M7-D5), **atom extraction** (M5-D7, possibly M4-D5), **inline-error consolidation** (M5-D8), **test-attribute relocation** (M4-D4), **admin allow-list ops** (M2-D1 — likely a docs-only deferral rather than code; 9.0 decides). The cluster names are suggestive; 9.0 may re-cluster.
3. For each cluster: decide ship-in-M9 (with task ordering and dependencies) vs defer to M10/M11 with explicit justification. **Default to shipping IA-blocked items (M4-D2 tile reorder, M4-D3 header rebalance, M5-D1 what's-next anchor) early in M9** so dependent per-tile / per-page work has the final IA to build against. **Default to deferring atom-extraction items (M5-D7) until a 4th button variant appears OR the cluster's own justification ripens.**
4. Update §A (this file) with the concrete task list reflecting the decisions. Each task carries: files to create/modify, AC reference (or "M9 deferral closure" if the only AC is AC-9.X), step-by-step TDD checklist, commit-subject template.
5. Update `DEFERRED.md` for every deferral that flips Suggested-home (e.g., M5-D1 from "M9 polish" → "M10 onboarding wizard" if 9.0 decides it). **The dated rationale goes in the `DEFERRED.md` Open entry's "Why deferred" line, not in a separate log.**
6. Commit: `chore(plan): M9 scope-and-shape session — route deferrals; finalize task list`.

**Outputs (all in the same commit):**

1. This file's §A populated with the concrete task list.
2. `DEFERRED.md` updated with any Suggested-home flips.
3. The convergence log below (§ Convergence log) seeded with the 9.0 outcome — number of deferrals shipping in M9, number re-deferred, target SHA.

**Step 1: Failing test (or assertion)** — `tests/plan/m9-scope.test.ts` (NEW, optional but recommended): a markdown-parsing assertion that walks `DEFERRED.md` Open + this handoff's §A and asserts (a) every M9-routed item in `DEFERRED.md` Open appears as a task in §A OR is re-deferred to a non-M9 milestone; (b) §A has no tasks that reference DEFERRED IDs not in the inventory. This is a "structural completeness" gate, not a behavior gate. If 9.0 elects not to write the assertion, the same check runs manually as a self-review checklist item before commit.

**Step 2: Run the shape session, populate §A and `DEFERRED.md`, commit.**

**Step 3: Adversarial-review the scope decision.** Before any per-task work starts, run a lightweight cross-CLI review of the 9.0 output (`/codex:adversarial-review --base 69ed38a --scope branch` against just the 9.0 commit). Focus: is the M9 scope coherent? Are any deferrals routed into M9 that should have been pushed to M10/M11 given their dependencies? Are any deferrals pushed out that should have been kept (i.e., is M9 over-deferring)? Convergence cap: 2 rounds — if the scope decision survives 2 rounds with no blocking findings, it ships; otherwise iterate.

### Task 9.1, 9.2, 9.3, 9.4, and routed deferrals — DETERMINED BY 9.0

The per-task TDD checklists, file lists, test commands, and commit subjects for the four stated M9 tasks plus every routed deferral land in §A in the post-9.0 commit. **Do not start any of these tasks before 9.0 closes.**

The four stated tasks already have plan-prose TDD checklists in `09-10-admin.md:7–122`. 9.0's job is to (a) confirm those checklists are still correct given any routed deferrals that touch the same surfaces, (b) order them against the routed deferrals (e.g., M4-D2 tile reorder must precede any per-tile data-loader-split work in Task 9.2), and (c) write per-cluster task checklists for the routed deferrals using the same TDD-per-task pattern.

---

## Field discipline notes (carry-forward from M5 / M6 / M7 / M8 handoffs)

- **"Spec sections in scope" is exhaustive, not representative.** §1 above lists every § referenced by the four stated tasks AND every § referenced by the deferral inventory at handoff time. 9.0 may add more.
- **"AC list" uses canonical AC IDs.** M9 covers AC-9.1, AC-9.2, AC-9.3 plus the AC-9.X (M9 deferral closure) exit gate. No paraphrases.
- **"Pre-handoff state" is verified by command, not assertion.** Every "tests passing" check has a command. M8 close-out baseline at SHA `69ed38a` is the starting point.
- **"Watchpoints" is the most valuable section for M9.** Per-instance whack-a-mole is the dominant M9 failure mode under "small fix" cover. Watchpoint 1 (impeccable critique vs spec) and watchpoint 2 (class-sweep code-shape-based) are the two highest-priority preloads for the reviewer.
- **"Exit criteria" includes the convergence step AND the deferral-closure step.** M9 is not done at "four tasks ship and tests pass"; it's done at "tasks pass AND adversarial review converged AND `DEFERRED.md` reflects M9's deferral dispositions AND impeccable §12 closed on every touched cluster."

---

## Convergence log

_(Append here after Task 9.0 ships AND each cluster's impeccable evaluation closes AND adversarial review begins.)_
