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
- **§14.3** — Environment variable / ops surface (M2-D1 admin allow-list — **9.0 routed C9 as code-driven self-service UI, REQUIRES §14.3 spec amendment**). The current `public.is_admin()` Postgres function in `supabase/migrations/20260501002000_rls_policies.sql:23-37` hardcodes admins in a stable SECURITY DEFINER function (`array['dlarson@fxav.net', 'edweiss412@gmail.com']`); the `ADMIN_EMAILS` env var listed at spec §14.3:3290 + `.env.local.example:26` is NOT actually consumed by any code path. C9 replaces the hardcoded array with an `admin_emails` table lookup + UI surface for runtime CRUD.

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

**Updated 2026-05-12 at 9.0 close (revised after Round 1 adversarial review at SHA 00620cb)** — **TWO new spec amendments ARE in M9 scope**:

1. **§14.3 admin allow-list mechanism** (C9 cluster prereq). Retires the migration-hardcoded `public.is_admin()` array; replaces with `admin_emails` table lookup + `/admin/settings/admins` UI. Amendment text drafted in C9.0 (`superpowers:brainstorming`) BEFORE C9.1 migration ships; lands at `docs/superpowers/specs/amendments/2026-05-12-admin-allowlist-runtime-mutable.md`.

2. **§12.4 catalog new rows for AGENDA_* crew-facing codes** (M7-D2 task prereq, routes through C0 catalog). Adds `AGENDA_GONE_FOR_CREW` (410, "file removed / non-PDF / drift — non-retry-able") and `AGENDA_UNAUTHENTICATED` (401, "link expired / signed-in user lacks crew binding — suggest reopening Doug's link") to the §12.4 catalog. Amendment drafted in a new C0-prerequisite task **9.0.A1** (`superpowers:brainstorming` session, small scope — two rows + their `helpfulContext`) BEFORE Task 9.4 lands the catalog so 9.4's `messageFor` includes the rows from the start; lands at `docs/superpowers/specs/amendments/2026-05-12-catalog-agenda-codes.md`. **NOTE:** `PARSE_ERROR_LAST_GOOD` (spec line 2721), `SYNC_DELAYED_MODERATE` (line 2837), and `SYNC_DELAYED_SEVERE` (line 2838) are ALREADY in the spec at §12.4 (ratified via prior "Fix 2 spec amendment" referenced in `09-10-admin.md:24`) — Task 9.1 lands them in the catalog but no fresh amendment is required for those.

**If any OTHER finding during convergence requires a third amendment, that's a P0 — surface and pause; do not silently fix.** (M8 R2 M2 was almost exactly this — a copy rewrite that contradicted §13.1 — caught by adversarial review, not self-review.)

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
  - `tests/messages/_metaAdminAlertCatalog.test.ts` — M5/M6/M7/M8-extended. M9 EXTENDS with any new `admin_alerts` PRODUCER codes (e.g., `TILE_SERVER_RENDER_FAILED` from Task 9.2 — this code's `dougFacing` is non-null because Doug acts on tile failures). **AGENDA_* codes do NOT belong here** (corrected at R2 repair, codex finding 3): `AGENDA_GONE_FOR_CREW` and `AGENDA_UNAUTHENTICATED` are crew-facing-only display codes with `dougFacing: null` — they are NEVER raised as `admin_alerts` rows. Their catalog presence is asserted by the broader codes-coverage test (`tests/messages/catalog.test.ts`), NOT the admin-alerts producer meta-test.
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
3. Inputs: spec §5.4 + §8.3 + §9.0.1 + §12.1 + §12.4 + §17.1 + every §-section added to §1 above by 9.0; the M9 plan (`09-10-admin.md` §M9); this handoff; the diff `git diff <M9-base-SHA>..HEAD -- <PATH-FILTER>` where the path filter MUST be specified explicitly in EVERY review invocation. **MANDATORY PATH FILTER (added at R2 repair, codex finding 2):** future M9 reviews — including the per-cluster reviews and the final-milestone review — MUST scope the diff to the M9-relevant tree, explicitly EXCLUDING unrelated branch noise like the M12 user-facing-docs spec files. The canonical M9 path filter is:

```
'components/**' 'app/**' 'lib/**' 'tests/**' 'supabase/**' 'public/brand/**'
'DESIGN.md' 'app/globals.css' 'next.config.ts' 'package.json' 'tailwind.config.*'
'docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md'
'docs/superpowers/specs/amendments/2026-05-12-admin-allowlist-runtime-mutable.md'
'docs/superpowers/specs/amendments/2026-05-12-catalog-agenda-codes.md'
'docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/**'
':!docs/superpowers/specs/2026-05-12-user-facing-docs-design.*'
```

The exclusion `:!docs/superpowers/specs/2026-05-12-user-facing-docs-design.*` is critical — R1 reviewed against `--scope branch` with no exclusion and saw M12 spec work mixed into the M9 diff, which polluted the scope-coherence audit (codex R2 finding 2). **The path filter is exhaustive, not representative; if 9.0 routes in deferrals touching paths outside this list (e.g., `lib/auth/**` if M5-D8 routes inline-error consolidation through auth helpers), add those paths at kickoff.**

For the codex-companion invocation specifically: since `codex-companion.mjs adversarial-review --scope branch` doesn't accept path filters directly, embed the path-filtered context in the prompt: lead the prompt with "Scope your audit ONLY to files matching the M9 path filter (see handoff §10). Explicitly SKIP any `*user-facing-docs-design*` files — those are unrelated M12 work." Alternatively, pre-compute the diff via `git diff <base>..HEAD -- <path filter>` and paste into the prompt.
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

> **Recommended disposition:** No operator-log work in M9. Verify at 9.0. **9.0 close (2026-05-12)**: verified — no C0..C9 cluster requires the operator-log sink. C9 audit-trail uses the per-row `admin_emails` revocation columns + an optional `admin_email_changes` table per the C9.0 amendment, NOT the operator-log sink.

**(f) C9 admin allow-list vs existing RLS surface (M2-D1, NEW 2026-05-12 at 9.0 close).** C9 replaces the migration-hardcoded `public.is_admin()` array in `supabase/migrations/20260501002000_rls_policies.sql:23-37` with an `admin_emails` table lookup. The 21 admin-gated tables (per M2-D2 unresolved deferral) all consume `is_admin()` via RLS — the C9.1 migration must preserve identical post-cutover semantics. The schema-introspection test `tests/db/schema-introspection.test.ts` is the regression gate; any RLS policy that USED the hardcoded array directly (rather than going through `is_admin()`) breaks the migration. **Pre-task verification**: `grep -rn "dlarson@fxav.net\|edweiss412@gmail.com" supabase/migrations/` to confirm the hardcoded emails appear ONLY in the `is_admin()` function (line 33 of `20260501002000_rls_policies.sql`), NOT in any other policy or function.

> **Recommended disposition:** C9.1 migration includes a pre-migration verification step (grep + test); if hardcoded emails appear in any RLS policy outside `is_admin()`, the migration scope expands to cover those policies too. **Updated at R1 repair (codex finding 1):** M2-D2's static-vs-runtime breadth concern IS now in M9 scope, via the new Task 9.C9.0.5 runtime RLS behavioral-parity probe. The probe runs on every CI build going forward, closing the drift-detection gap M2-D2 worries about. Mark M2-D2 for "Resolved" disposition after C9.1 ships; commit SHA backfilled into DEFERRED.md Resolved section at that point.

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

- [ ] **(EXTEND) `admin_alerts` catalog completeness — EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** (M5/M6/M7/M8-shipped). New M9 rows: `TILE_SERVER_RENDER_FAILED` (from Task 9.2 — `<TileServerFallback>` Step 2 explicitly says "Server fallback also emits an `admin_alerts` row with code `TILE_SERVER_RENDER_FAILED`"). **AGENDA_* codes do NOT extend this meta-test** (corrected at R2 repair, codex finding 3) — they are crew-only display codes with `dougFacing: null`, NEVER produced as `admin_alerts` rows. AGENDA_* catalog presence is asserted by `tests/messages/catalog.test.ts` (the broader codes-coverage test), NOT here.

- [ ] **(POSSIBLY EXTEND) Supabase call-boundary discipline — EXTEND `tests/auth/_metaInfraContract.test.ts` OR `tests/sync/_metaInfraContract.test.ts`** (M5/M6-shipped). **Routed by Task 9.2** (if `<TileServerFallback>`'s data-loader functions issue Supabase reads — they will, since every tile loads data from the DB). Each data-loader function (`loadLodgingTileData`, `loadScheduleTileData`, …) registers in the relevant meta-test. **If the loaders go in `lib/tiles/loaders/**` (likely), a new `tests/tiles/_metaInfraContract.test.ts` is warranted instead of extending the auth/sync ones** — decide at Task 9.2 close. The choice mirrors M6's decision to create `tests/sync/_metaInfraContract.test.ts` rather than extend the auth one.

- [N/A] **Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`)** — **N/A — M9 introduces no new `pg_advisory*` surfaces.** Polish is UI-only; none of the listed M2/M4/M5/M7 deferrals add an advisory-lock surface. **Re-verify at 9.0** — if any routed deferral does, this row becomes mandatory.

- [ ] **(EXTEND) No-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`)** — **EXTEND for C9 (M2-D1).** Add `admin_emails` Server Actions + `lib/data/adminEmails.ts` to the glob so every add/revoke call routes through `lib/email/canonicalize.ts`. The §1.3 invariant (email canonicalization at every boundary) applies — `admin_emails` is the most security-sensitive new email-reading surface introduced since M2.

- [N/A] **Amendment contract structural meta-test (`tests/reports/_amendmentContractMetaTest.test.ts`)** — **N/A — M9 doesn't touch the §13.2.3 report pipeline contracts.** M8 owns this meta-test; M9 leaves it alone.

- [ ] **(POSSIBLY EXTEND) Supabase call-boundary discipline — `tests/auth/_metaInfraContract.test.ts` for C9 (M2-D1).** Every helper in `lib/data/adminEmails.ts` registers in the auth meta-test (admin add/revoke is auth-surface mutation). Same registry semantics as the existing M5/M6 entries — destructure `{ data, error }`, surface infra faults as typed `AdminEmailsInfraError`, never silent `continue`.

- [ ] **(CREATE) Runtime RLS behavioral-parity probe — `tests/db/admin-rls-runtime.test.ts` [ADDED at R1 repair; matrix corrected at R2 + R3 repair, codex findings 1 + 2].** TWO policy classes derived from `pg_policies` at runtime: **Class A** (`policyname = 'admin_only'` with `qual ILIKE '%public.is_admin%'`) — 21 tables × 4 verbs × 2 roles (admin / non-admin-no-crew) = **168 cells**. **Class B** (`policyname IN ('admin_insert','admin_update','admin_delete')` with `qual OR with_check ILIKE '%public.is_admin%'`) — N tables × 4 verbs × 3 roles (admin / non-admin-with-crew-session / non-admin-no-crew) = **12N cells**. Permanent meta-test going forward; closes M2-D2 by providing the continuous drift-detection guard schema introspection cannot. Pre-migration baseline JSON artifact committed at `tests/db/admin-rls-runtime.baseline.json`; post-migration regression asserts zero drift. Pre-migration baseline AND post-migration regression run is gated by Task 9.C9.0.5 + Task 9.C9.1.

- [ ] **(POSSIBLY CREATE) Pure-render-compliance static-analysis for Task 9.2 view components.** `09-10-admin.md:71-77` specifies a static-analysis test that walks every tile-view component in `components/tiles/**Tile*View.tsx` and asserts (a) no `await` in the body, (b) no imports from `lib/db/**` / `lib/drive/**` / `lib/sync/**`, (c) no calls to functions matching `/^(load|fetch|query|read)/` from outside the component module. Decide at Task 9.2 close whether this lives in a per-tile test file or a single meta-test at `tests/components/tiles/_metaPureRenderContract.test.ts` (RECOMMENDED — meta-test pattern matches §1.9 lineage).

**Empty rows silently lie.** The final create/extend/N/A determinations are re-confirmed at each cluster close.

---

## A. Task list

**9.0 outcome (2026-05-12, populated at scope-and-shape session close; revised at R1 review repair of SHA 00620cb):**

- **21 deliverables shipping in M9** (4 stated + 16 routed-in deferrals + **M2-D2 added at R1 repair via C9.0.5 closure**).
- **0 re-defers to other milestones from the 9.0-routed inventory.** (M5-D7 retains its existing Suggested-home "first M-task that introduces a 4th accent button variant" — no re-route; no 4th variant has materialized in M6/M7/M8 and the YAGNI default holds.)
- **2 new spec amendments in scope** (§14.3 admin allow-list mechanism for C9; **§12.4 catalog AGENDA_* codes for M7-D2 — added at R1 repair**).
- **12 clusters** in dependency-aware order: C0 (foundation, NOW including the §12.4 amendment 9.0.A1 as first step) → C2 (tokens) → C1 (crew-page IA) → C3 (auth flow) → C4 (admin banner) → C5 (sign-in brand) → C6 (lightbox motion/sentinel) → C6b (lightbox media perf) → C6c (lightbox pinch-zoom) → C7 (inline-error consolidation) → C8 (a11y batch) → C9 (admin allow-list — NOW including the C9.0.5 runtime RLS probe between C9.0 amendment and C9.1 migration).

**Ordering rationale (anchors the cluster sequence):**

1. **C0 lands first** — Task 9.4 (catalog + `helpfulContext`) is the dependency for stale-footer (9.1), tile-fallback alert code (9.2), AgendaPdfViewer error routing (M7-D2 inside C6), and inline-error consolidation (M5-D8 / C7). Without 9.4 done, ~7 downstream clusters are blocked on hand-coded strings.
2. **C2 tokens before C1 IA work** — M4-D5 introduces `--tracking-eyebrow` (and possibly `-eyebrow-strong`); M4-D3 header rebalance (C1) explicitly touches eyebrow typography. Landing the token first means rebalance consumes it cleanly; landing rebalance first would require a follow-up sweep when the token lands.
3. **C1 IA cluster needs its own `/impeccable shape` sub-session before crafting** — per DEFERRED.md M4-D2 (`/impeccable shape /crew-page-IA-redesign`), M4-D3 (`/impeccable shape /header-rebalance`). The four C1 items (M4-D2 tile reorder, M4-D3 header rebalance, M4-D6 desktop-chromium viewport bug, M4-D4 test-attribute relocation) are sequenced D2 → D3 → D6 → D4 so the reorder lands once and the test-attribute relocation rewrites e2e tests against the final IA, not an intermediate one.
4. **C3 auth flow needs `/impeccable shape` AND `/impeccable animate` sub-sessions** — per DEFERRED.md M5-D1 + M5-D2. C3 sequence: D1 (/me anchor) → D2 (Bootstrap liveness) → D5 (self-serve fallbacks, depends on D1 + D2 landing).
5. **C4 admin banner gets its own `/impeccable shape` sub-session** — per DEFERRED.md M5-D3 (queue depth + two-tap Resolve + raised_at format are IA decisions).
6. **C6/C6b/C6c are three separate clusters because each has different risk vectors** — C6 is motion + helper extraction (low risk); C6b is `next/image` proxy + Cache-Control interaction (medium risk — needs scoped test); C6c is `react-zoom-pan-pinch` + Embla gesture priority (highest risk — new dependency + gesture coordination). Splitting lets each cluster's dual-impeccable-gate run be focused, and allows C6c to pause/re-defer mid-milestone without unwinding C6/C6b.
7. **C9 lands LAST** — admin allow-list is the only cluster requiring a spec amendment (§14.3); the amendment brainstorming + ratification cost real time AND C9 has the biggest cross-cutting surface (RLS via `public.is_admin()` touches every admin-gated table). Landing C9 last means a C9-blocking finding doesn't strand C0..C8 work behind it.

**Re-defer disposition (1 item, no Suggested-home flip):**

- **M5-D7** — AccentButton atom extraction. **2026-05-12 (M9 Task 9.0 routing decision):** confirmed at existing Suggested-home "M6 or first M-task that introduces a 4th accent button variant." No 4th variant has materialized in M6/M7/M8; YAGNI default holds. Re-evaluate at M11 close or whenever a 4th accent-button surface is introduced. NOT in §A below.

---

### Task 9.0 — Scope-and-shape session (FIRST DELIVERABLE — completed at this commit)

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

---

### Cluster C0 — Foundation (4 stated M9 tasks + §12.4 amendment prereq)

The per-task TDD checklists for 9.1–9.4 are exhaustively spelled out in `09-10-admin.md:7-122`. The 9.0 session re-confirmed those checklists are correct as-is; below records only the ordering + commit subject + cross-cluster impact.

**C0 ordering rationale:** **9.0.A1 (§12.4 amendment for AGENDA_* codes) lands FIRST** — added at Round 1 review repair (codex finding 2). Then 9.4 (catalog + helpfulContext, NOW including the freshly-ratified `AGENDA_GONE_FOR_CREW` + `AGENDA_UNAUTHENTICATED` rows). Then 9.1 + 9.2 in either order; recommended 9.1 → 9.2 because 9.1 is the smaller surface and de-risks the catalog wiring. 9.3 lands last in C0.

#### Task 9.0.A1 — Spec amendment §12.4 (AGENDA_* catalog rows) [ADDED at R1 repair]

- **Files**: `docs/superpowers/specs/amendments/2026-05-12-catalog-agenda-codes.md` (NEW); record + ratify-by line.
- **Process**: `superpowers:brainstorming` session — small scope (2 rows + helpfulContext). Spec-amendment self-review checklist (per AGENTS.md spec-self-review additions); cross-CLI adversarial review run on the amendment commit (single round expected).
- **Amendment content MUST specify**:
  - `AGENDA_GONE_FOR_CREW` (status 410) — crew-facing copy + helpfulContext. Suggested crewFacing: "Doug removed or replaced this agenda. Ask Doug for the new link." helpfulContext: longer plain-language explanation of the 410 semantics (file deleted, replaced, or not a PDF).
  - `AGENDA_UNAUTHENTICATED` (status 401) — crew-facing copy + helpfulContext. Suggested crewFacing: "This link expired or you're not signed in. Reopen Doug's most recent message to refresh." helpfulContext: longer plain-language explanation.
  - Both rows include `dougFacing: null` (these are crew-only display codes; Doug never sees them since the agenda surface is crew-side).
  - Per the §1.5 invariant: rendered via `messageFor('AGENDA_GONE_FOR_CREW').crewFacing`, no raw codes in UI.
- **Commit**: `docs(spec): §12.4 amendment — AGENDA_* crew-facing catalog rows (M7-D2 prereq)`

#### Task 9.4 — `lib/messages/catalog.ts` + `lib/messages/lookup.ts` + `helpfulContext` field

**Status (2026-05-12):** SHIPPED. Part 1 at SHA `b7ac297` (catalog rows + interpolation + accessors). Part 2 at SHA `1812f9a` (helpfulContext populated for all 21 dougFacing-non-null entries — 15 verbatim YAML ports + 6 fresh-author — plus 2 inverse-violation cleanups on CSRF_NONCE_EXPIRED + REPORT_RATE_LIMITED_CREW; structural coverage tests pinning both directions of the spec invariant). 11/11 catalog tests pass; typecheck clean. Briefing preserved below for archival.

**Part 1 (shipped `b7ac297`):** Added AGENDA_GONE_FOR_CREW + AGENDA_UNAUTHENTICATED entries verbatim from amendment `7f836b6`. Wired `messageFor(code, params)` placeholder interpolation, added typed accessors `getDougFacing` / `getCrewFacing` / `lookupHelpfulContext`. Added AGENDA presence tests + interpolation tests. 9 tests pass; typecheck clean.

**Part 2 — REMAINING WORK (next session pickup):**

1. **Identify 21 catalog entries with `dougFacing != null` AND `helpfulContext: null`** (current count after part 1 — re-verify with the awk script in the part-2 spec). These are the entries violating the spec invariant at lines 2853-2856: "Every code whose `dougFacing` is non-null MUST have a non-null, non-empty entry here."

2. **Port 14 entries verbatim from the spec §12.4 YAML appendix** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` lines 2858-2929). Catalog entries with matching YAML keys: `LEAKED_LINK_DETECTED`, `AMBIGUOUS_EMAIL_BINDING`, `WIZARD_SESSION_SUPERSEDED`, `WEBHOOK_TOKEN_INVALID`, `STAGED_PARSE_OUTDATED`, `STAGED_PARSE_SOURCE_GONE`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `LINKED_ASSET_DRIFTED`, `REEL_DRIFTED`, `STAGED_PARSE_RESTAGED_INLINE`, `STAGED_PARSE_SUPERSEDED`, `FINALIZE_OWNED_SHOW`, `LIVE_ROW_CONFLICT`, plus 1 to verify. Use the YAML text verbatim — that's the canonical source.

3. **Author 7 catalog-only entries** that lack spec YAML mappings. Candidates from part 1's grep: `CSRF_KEY_ROTATED`, `LINK_SESSION_KEY_ROTATED`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `WIZARD_ISOLATION_INDEXES_MISSING`, `WEBHOOK_HEADERS_MISSING`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `PENDING_SYNC_NOT_FOUND`, `STALE_DISCARD_REJECTED`. Verify each:
   - If dougFacing is genuinely meant to be Doug-facing, author a 1-3-sentence plain-language helpfulContext.
   - If dougFacing is actually admin-log-only placeholder text (e.g., `"(admin log only ...)"`), CHANGE dougFacing to `null` instead of authoring helpfulContext. The catalog has mis-categorized entries from older milestones.

4. **Add the helpfulContext × dougFacing coverage test** (failing → passes after population) at `tests/messages/catalog.test.ts`:

   ```ts
   test("every dougFacing-non-null code has non-null helpfulContext", () => {
     const violations = Object.values(MESSAGE_CATALOG)
       .filter((entry) => entry.dougFacing !== null && entry.helpfulContext === null)
       .map((entry) => entry.code);
     expect(violations).toEqual([]);
   });

   test("every dougFacing-null code has null helpfulContext (admin-log-only invariant)", () => {
     const violations = Object.values(MESSAGE_CATALOG)
       .filter((entry) => entry.dougFacing === null && entry.helpfulContext !== null)
       .map((entry) => entry.code);
     expect(violations).toEqual([]);
   });
   ```

5. **Run `pnpm test tests/messages/catalog.test.ts && pnpm typecheck`** — assert both new coverage tests pass + no regressions.

6. **Commit**: `feat(messages): populate helpfulContext for all dougFacing-non-null codes (Task 9.4 part 2)`. The commit closes Task 9.4 (the canonical Task 9.4 close commit subject was `feat(messages): §12.4 catalog + lookup + helpfulContext field` per the plan; split into two commits per the session-close briefing — combine subjects in the final-commit message body if you want a single canonical reference).

**Cross-cluster impact**: C6 (M7-D2 AgendaPdfViewer status-routing) and C7 (M5-D8 inline-error consolidation) both consume the catalog; they cannot start until part 2 ships. Tasks 9.1 + 9.2 + 9.3 (the rest of C0) can proceed with part 1's catalog state since they don't depend on helpfulContext for non-AGENDA codes.

**TDD pre-task command sequence** (run at next-session kickoff):

```bash
# Verify the 21-entry list hasn't drifted
awk '
  /^  [A-Z_][A-Z0-9_]*: \{$/ { code = $1; sub(":", "", code); inEntry = 1; df = "null"; hc = "null"; next }
  inEntry && /dougFacing:/ { if ($0 !~ /dougFacing: null,/) df = "nonnull"; next }
  inEntry && /helpfulContext:/ { if ($0 !~ /helpfulContext: null,/) hc = "nonnull"; next }
  inEntry && /^  \},/ {
    if (df == "nonnull" && hc == "null") print code
    inEntry = 0
  }
' lib/messages/catalog.ts
```

If the count is materially different from 21, re-derive the YAML-port-vs-author split before populating.

#### Task 9.1 — Stale-data footer (`components/shared/StaleFooter.tsx`)

- **Files**: per `09-10-admin.md:9-25`.
- **AC**: AC-9.1.
- **TDD checklist**: `09-10-admin.md:13-25` (verbatim — every `last_sync_status` branch).
- **Cross-cluster impact**: tested independently of C1 / C2 IA work.
- **Commit**: `feat(crew-page): stale footer status ladder with parse_error + pending_review branches (§5.4, §12.4)`

#### Task 9.2 — Server + client tile error boundaries

- **Files**: per `09-10-admin.md:29-30, 33-67`. Per-tile data-loader/view split: every tile in `components/tiles/{AudioScopeTile,ContactsTile,CrewTile,DiagramsTile,FinancialsTile,LightingScopeTile,LodgingTile,NotesTile,OpeningReelTile,PackListTile,ScheduleTile,ShowStatusTile,TransportTile,VenueTile,VideoScopeTile}.tsx` becomes `*TileLoader` (data-fetch, can throw) + `*TileView` (pure, cannot throw). 15 tiles × split = 15 commits OR one larger commit per `09-10-admin.md:65-67`'s usage example.
- **AC**: AC-9.3.
- **TDD checklist**: `09-10-admin.md:94-107` (verbatim — server-throw test, client-descendant render-throw test, both-layers-compose test, pure-render-compliance static-analysis test at `09-10-admin.md:71-77`).
- **Meta-test extension**: `tests/auth/_metaInfraContract.test.ts` registers every new `*TileLoader` Supabase-call helper (§1.9 discipline; pre-declared in §13 below). OR a new `tests/tiles/_metaInfraContract.test.ts` is created if the loaders live in `lib/tiles/loaders/` — decide at Task 9.2 close per §13's POSSIBLY EXTEND row.
- **`admin_alerts` extension**: `tests/messages/_metaAdminAlertCatalog.test.ts` adds `TILE_SERVER_RENDER_FAILED` row.
- **Cross-cluster impact**: C1 tile reorder (M4-D2) must come AFTER C0/9.2 lands because moving tiles between mount positions while their loader/view split is in flight is a needless cascade.
- **Commit**: `feat(crew-page): server + client tile error boundaries (§12.1)`

#### Task 9.3 — Empty-state catalog reachability baselines

- **Files**: `tests/e2e/empty-state-reachability.spec.ts` (NEW).
- **AC**: AC-9.2.
- **TDD checklist**: `09-10-admin.md:112-113` (verbatim — Playwright `toHaveScreenshot` baselines per §8.3 empty-state catalog entry).
- **Anti-tautology check**: per AGENTS.md writing-plans additions — derive expected screenshots from real rendered pages, NOT synthesized component-level snapshots. The test must scope its assertion so a regression in the rendering path can't be passed by a stale snapshot of the same broken state.
- **Commit**: `test(crew-page): empty-state reachability baselines`

#### C0 close-out — impeccable §12 dual gate

After 9.4 + 9.1 + 9.2 + 9.3 all commit, run `/impeccable critique` and `/impeccable audit` against the C0 surface diff (`components/shared/StaleFooter.tsx`, `components/shared/TileServerFallback.tsx`, `components/shared/TileErrorBoundary.tsx`, every `*TileLoader.tsx` + `*TileView.tsx`, `lib/messages/catalog.ts`, `lib/messages/lookup.ts`, `tests/e2e/empty-state-reachability.spec.ts`). Record findings + dispositions in §12 of this handoff per the table format. **Spec-check every critique disposition that rewrites user-visible copy** — especially anything touching §12.4 catalog rows.

---

### Cluster C2 — Tokens (M4-D5)

**Sub-shape session NOT required** — token consolidation is mechanical typography normalization, not IA work.

#### Task 9.M4-D5 — `--tracking-eyebrow` token consolidation

- **Files**: `app/globals.css` (`@theme` block extension); `DESIGN.md` §2 (document new token); ALL 5 inline `tracking-[0.NNem]` callsites identified in DEFERRED.md M4-D5 (Section + KeyValue + Header + RightNowCard + Footer — verify exact line numbers with `rg "tracking-\[" components/` at task kickoff and update this list).
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `rg "tracking-\[" components/ app/ -n` returns the canonical 5 callsites (or current count); `rg "uppercase" components/ app/ -n` identifies any uppercase-eyebrow surface that should join the consolidation.
- **TDD checklist**:
  - **Step 1**: Failing test (`tests/styles/eyebrow-tracking.test.ts`, NEW) — static-grep assertion that no `tracking-\[` arbitrary-tracking values appear in `components/` or `app/` for any element with `uppercase` class.
  - **Step 2**: Add `--tracking-eyebrow` (and `-eyebrow-strong` if the 5 inline values cluster around two different ems) to `app/globals.css` `@theme`; document in `DESIGN.md` §2; replace the 5 inline values with the named token.
  - **Step 3**: Run the layout-regression Playwright suite (`pnpm test:e2e tests/e2e/crew-page.spec.ts --project=mobile-safari`) — the dimensional-invariant assertions are the regression gate; any token-driven layout collapse triggers a fail. **DO NOT** treat jsdom unit tests as sufficient (per AGENTS.md writing-plans additions).
  - **Step 4**: Re-run the static-grep test from Step 1; assert it now passes.
- **Class-sweep code-shape**: per AGENTS.md watchpoint 2, `rg "tracking-\[" components/ app/` walks every callsite, not a hand-named list.
- **Commit**: `feat(crew-page): consolidate eyebrow tracking via --tracking-eyebrow token (M4-D5)`

#### C2 close-out — impeccable §12 dual gate

After M4-D5 commits, run `/impeccable critique` + `/impeccable audit` against the C2 diff (`app/globals.css`, `DESIGN.md`, 5 component callsites). Token consolidation rarely surfaces copy issues; expect audit findings to dominate.

---

### Cluster C1 — Crew-page IA (M4-D2, M4-D3, M4-D6, M4-D4)

**Sub-shape session REQUIRED** before crafting (per DEFERRED.md M4-D2 + M4-D3).

#### Task 9.C1.0 — `/impeccable shape <crew-page-IA-redesign>` sub-session

- **Output**: a written shape brief (committed to `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-12-crew-page-IA.md`) documenting:
  - New tile order (Today / Logistics / People / Reference clusters, OR a "Today" cluster promoting 1-2 tiles above the general grid — DEFERRED.md M4-D2's two candidate framings).
  - Header treatment (shrink + sticky-thin, OR header-as-context + drop the orange hairline — DEFERRED.md M4-D3's two candidate framings).
  - PRODUCT.md persona ranking applied to the tile order (set/strike-day primary tile = PackListTile; show-day primary tile = ScheduleTile; etc.).
- **Pre-shape grep**: `app/show/[slug]/page.tsx` for the current tile mount order; `components/layout/Header.tsx` for current scale/weight; PRODUCT.md "Crew on the venue floor" section for the canonical persona-question→tile mapping.
- **TDD checklist**: this is a shape session, not a code commit; the failing-test → minimal-impl → passing-test pattern doesn't apply. The "test" is user confirmation of the brief.
- **Commit**: `docs(plan): C1 crew-page IA shape brief — tile order + header rebalance (M4-D2, M4-D3)`

#### Task 9.M4-D2 — Tile reorder by persona urgency

- **Files**: `app/show/[slug]/page.tsx` (tile mount order); `tests/e2e/crew-page.spec.ts` (regression: every tile testid still present, in new order); whatever sticky-anchor or section-header components the C1.0 shape brief calls for.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: confirm tile testids in `tests/e2e/crew-page.spec.ts` match what's actually rendered (per AGENTS.md pre-draft code-verification).
- **TDD checklist**:
  - **Step 1**: Failing e2e test — `tests/e2e/crew-page.spec.ts` assertions for the NEW tile order (testids match brief's ordering).
  - **Step 2**: Reorder `page.tsx`; add cluster headings if brief calls for them.
  - **Step 3**: Run the dimensional-invariant Playwright suite — the page rebalances vertical rhythm; any container-height collapse triggers a fail.
  - **Step 4**: Cross-milestone dependency check (§11(c)) — if the brief introduces sticky cluster headers, verify Realtime broadcast invalidation (M6.5 `SHOW_FIRST_PUBLISHED` channel) still subscribes BEFORE first-tile render.
- **Commit**: `feat(crew-page): persona-urgency tile order with cluster headings (M4-D2)`

#### Task 9.M4-D3 — Header weight rebalance

- **Files**: `components/layout/Header.tsx`; possibly `DESIGN.md` §header section.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: confirm `text-2xl sm:text-3xl font-bold` is still the current header scale; confirm the orange hairline element flagged by M4-D3 is still in place.
- **TDD checklist**:
  - **Step 1**: Failing e2e test — `tests/e2e/header-rebalance.spec.ts` (NEW): assertions for the new header treatment (smaller scale, or sticky-thin, per brief).
  - **Step 2**: Implement per brief; consume `--tracking-eyebrow` from C2 if the eyebrow gets re-styled.
  - **Step 3**: Visual regression via `toHaveScreenshot` on mobile-safari + desktop-chromium (page-hero treatment is viewport-sensitive).
  - **Step 4**: Re-run AC-4.3 RightNowCard transition tests — header rebalance MUST NOT regress the hero-card transitions.
- **Commit**: `feat(layout): rebalance header weight vs RightNowCard hero (M4-D3)`

#### Task 9.M4-D6 — `crew-page.spec.ts:118` desktop-chromium viewport bug

- **Files**: `tests/e2e/crew-page.spec.ts:118`; possibly `playwright.config.ts` testMatch scoping.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `rg "setViewportSize|test.use.*viewport" tests/e2e/crew-page.spec.ts -n`; `rg "project|testMatch" playwright.config.ts -n` to know the current desktop-chromium scoping.
- **TDD checklist**:
  - **Step 1**: Confirm the failure exists on `desktop-chromium` (`pnpm test:e2e --project=desktop-chromium tests/e2e/crew-page.spec.ts -g "2-col grid"`).
  - **Step 2**: Add `await page.setViewportSize({ width: 390, height: 667 })` at the top of the test OR scope the test's `testMatch` to `mobile-safari` only. **Choose the viewport-set option** unless C1.0's shape brief explicitly says desktop-chromium gets its own grid contract — the test is asserting MOBILE behavior, so setting the mobile viewport is the correctness fix.
  - **Step 3**: Re-run `pnpm test:e2e --project=desktop-chromium` and assert it now passes; re-run `--project=mobile-safari` and assert no regression.
  - **Step 4**: Verify the desktop-chromium Playwright project isn't silently excluded — `rg "project: 'desktop-chromium'" playwright.config.ts` should show the project AND `testMatch` should NOT exclude this file. Silent test exclusion is its own discipline regression (per §6 watchpoint 5).
- **Commit**: `fix(test): set mobile viewport on crew-page grid assertion (M4-D6)`

#### Task 9.M4-D4 — RightNowCard test-attribute relocation

- **Files**: `components/right-now/RightNowCard.tsx`; `tests/e2e/right-now-transitions.spec.ts` (and any other AC-4.3 transition tests that read `data-state` / `data-rendered-state` / `data-treatment`).
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `rg "data-state|data-rendered-state|data-treatment" tests/ -n` to enumerate every consumer.
- **TDD checklist**:
  - **Step 1**: Failing test — the `<p>` element MUST NOT carry the three `data-*` test attributes; assert they live on a sibling `<span data-testid="right-now-debug" hidden>` outside the AT tree.
  - **Step 2**: Relocate attributes; update every e2e test reader at the same time.
  - **Step 3**: Run AC-4.3 transition tests; assert no regression in transition coverage.
- **Order rationale**: lands AFTER M4-D2 tile reorder so the e2e tests aren't rewritten twice (M4-D2 may not change testids but may change `expect(locator(...).first())` traversal patterns).
- **Commit**: `refactor(right-now): relocate debug data-attrs off AT-traversed paragraph (M4-D4)`

#### C1 close-out — impeccable §12 dual gate

After C1.0 brief + M4-D2 + M4-D3 + M4-D6 + M4-D4 all commit, run `/impeccable critique` + `/impeccable audit` against the C1 diff. **Spec-check every critique disposition that rewrites cluster-heading or section-label copy** — per §6 watchpoint 1, M9's biggest critique-vs-spec risk is in IA work where the impeccable tool's UX taste may conflict with spec product-contract language.

---

### Cluster C3 — Auth flow (M5-D1, M5-D2, M5-D5)

**Sub-shape session REQUIRED** (per DEFERRED.md M5-D1 + M5-D2). **Also a `/impeccable animate` sub-session** for the Bootstrap motion design.

#### Task 9.C3.0 — `/impeccable shape </me + Bootstrap polish>` + `/impeccable animate <Bootstrap timeout>` sub-sessions

- **Output**: two brief files at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-12-{me-page-anchor,bootstrap-liveness}.md`.
- **Shape brief content (me-page-anchor.md)**: emphasized "most soonest show" card design (larger; "Tomorrow" / "In 3 days" relative-time chip); grouping headers (Upcoming / Past) for the remainder; DESIGN.md anti-pattern "no identical card grids" resolution explicit.
- **Animate brief content (bootstrap-liveness.md)**: animated dot rhythm + 6s timeout → "Still working… [Retry]" intermediate state; respects `prefers-reduced-motion` (the existing `app/globals.css` reduction); Retry rotates the bootstrap-nonce so a stale nonce doesn't replay.
- **Commit**: `docs(plan): C3 auth-flow polish briefs — /me anchor + Bootstrap liveness (M5-D1, M5-D2)`

#### Task 9.M5-D1 — /me page "what's next" anchor

- **Files**: `app/me/page.tsx`; possibly a new `components/me/UpcomingShowAnchor.tsx`; relative-time helper at `lib/time/relative.ts` if 9.1 didn't already cover the "X days from now" forward-tense variant.
- **AC**: M9 deferral closure / AC-9.X.
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/e2e/me-page-anchor.spec.ts` (NEW): with 3 shows seeded (yesterday / tomorrow / next week), assert tomorrow's card is visually emphasized (larger; "Tomorrow" chip); yesterday's appears under "Past" header; next-week's appears under "Upcoming" header.
  - **Step 2**: Implement per brief; consume catalog copy via `messageFor` for any error states.
  - **Step 3**: Dimensional-invariants check against the emphasized-card → grid-cell relationship.
  - **Step 4**: Spec-check the "Tomorrow" / "In 3 days" relative-time copy against §7.3 — the spec doesn't dictate this phrasing, but per the M9 spec-check discipline (§6 watchpoint 1), surface as a question to the user IF the brief's phrasing feels novel.
- **Commit**: `feat(me): emphasize next-soonest show with relative-time anchor (M5-D1)`

#### Task 9.M5-D2 — Bootstrap shell liveness signal + 6s timeout

- **Files**: `app/show/[slug]/p/Bootstrap.tsx`; `app/globals.css` (animation keyframes if needed, respecting `prefers-reduced-motion`); possibly a new `components/shared/AnimatedDot.tsx`.
- **AC**: M9 deferral closure / AC-9.X.
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/e2e/bootstrap-liveness.spec.ts` (NEW): assert (a) animated dot appears within first paint; (b) after 6s (use Playwright clock-mock), the "Still working… [Retry]" state appears; (c) Retry rotates the bootstrap-nonce (verify by intercepting the redeem-link POST — the second attempt carries a different nonce).
  - **Step 2**: Failing test for `prefers-reduced-motion` — assert dot animation is 0ms duration when the media query matches.
  - **Step 3**: Implement per brief.
  - **Step 4**: §13.1 channel-boundary spec-check — the Retry copy MUST NOT contain "report this to the developer" or invert the report channel (M8 R2 M2 watchpoint).
- **Commit**: `feat(auth): bootstrap liveness + 6s timeout with retry (M5-D2)`

#### Task 9.M5-D5 — Self-serve fallback copy

- **Files**: `app/show/[slug]/p/Bootstrap.tsx` (error path); `app/auth/sign-in/SignInButton.tsx` (inline-error fallback); possibly new catalog entries for the fallback codes.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: M5-D1 + M5-D2 MUST have landed so the structural anchors exist (the fallback copy attaches to those anchors).
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/e2e/auth-self-serve-fallbacks.spec.ts` (NEW): assert (a) Bootstrap error state renders a "Sign in with Google instead" link; (b) sign-in page with no `?next=` fragment renders a "View show list" secondary path; (c) /me with zero shows renders a "Contact Doug" affordance (per §13.1 channel boundary — show-content questions message Doug directly).
  - **Step 2**: Add new catalog entries IF the fallback strings introduce new MessageCodes (rather than re-using existing codes with new `crewFacing` text — adding new codes requires explicit spec amendment to §12.4 per AGENTS.md §1.7).
  - **Step 3**: Spec-check every fallback string against §13.1 channel-boundary contract (M8 R2 M2 reference). "Contact Doug" is correct for show-content; "report this" routes through `<ReportButton>` to the developer, NOT to Doug.
- **Commit**: `feat(auth): self-serve fallback copy for Bootstrap + /me + sign-in (M5-D5)`

#### C3 close-out — impeccable §12 dual gate

Run `/impeccable critique` + `/impeccable audit` against C3 diff. **Spec-check is the highest M9 risk vector for this cluster** — §7.3 sign-in copy and §13.1 channel boundary both intersect with critique-rewrite temptations.

---

### Cluster C4 — Admin banner (M5-D3)

**Sub-shape session REQUIRED** (per DEFERRED.md M5-D3).

#### Task 9.C4.0 — `/impeccable shape <AlertBanner>` sub-session

- **Output**: brief at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-12-alert-banner.md`.
- **Brief content**: queue-depth badge design ("+3 more"); two-tap Resolve confirmation pattern (initial tap → confirm prompt → confirm tap); `raised_at` format (relative "14 minutes ago" or absolute "10:23 AM" — decide per Doug's actual phone-vs-desk context).
- **Commit**: `docs(plan): C4 AlertBanner shape brief (M5-D3)`

#### Task 9.M5-D3 — AlertBanner queue depth + Resolve confirmation + raised_at

- **Files**: `components/admin/AlertBanner.tsx`; the Server Action that resolves alerts (verify file path with `grep`); possibly new catalog row for the confirmation prompt copy.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: confirm AlertBanner's current `LIMIT 1` SELECT (per DEFERRED.md M5-D3); confirm the Resolve Server Action's location and current implementation.
- **TDD checklist**:
  - **Step 1**: Failing test — with 4 unresolved alerts seeded, assert (a) topmost alert displays + "+3 more" badge; (b) clicking Resolve shows a confirm prompt; (c) clicking confirm calls the Server Action; (d) `raised_at` renders per the brief's format.
  - **Step 2**: Implement per brief.
  - **Step 3**: Audit-pass (`aria-describedby` on the confirm button per M5-D6 batch — this fix lands here ahead of C8 because the confirm UI is being built).
- **Commit**: `feat(admin): alert banner queue depth + confirmation + raised_at (M5-D3)`

#### C4 close-out — impeccable §12 dual gate

Run dual gate. The confirmation-prompt copy is the highest spec-check risk surface.

---

### Cluster C5 — Sign-in brand (M5-D4)

**Sub-shape session NOT required** — brand-asset placement is direct (FXAV wordmark above headline; Google G left of button text).

#### Task 9.M5-D4 — FXAV wordmark + Google G icon

- **Files**: `app/auth/sign-in/page.tsx`; `app/auth/sign-in/SignInButton.tsx`; new asset files at `public/brand/fxav-wordmark.svg` and `public/brand/google-g.svg`.
- **AC**: M9 deferral closure / AC-9.X.
- **Asset sourcing**: FXAV wordmark — source from Doug (or the existing FXAV brand kit if present in the repo); Google G — official Google Sign-In brand guide download (https://developers.google.com/identity/branding-guidelines). DO NOT recreate either asset by hand.
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/e2e/sign-in-brand.spec.ts` (NEW): assert (a) FXAV wordmark `<svg>` or `<img>` appears above the headline; (b) Google G icon appears left of the button text; (c) the Google button conforms to Google's brand-guide minimum dimensions (height ≥ 40px) AND has the official text "Sign in with Google" (not paraphrased).
  - **Step 2**: Add brand assets to `public/brand/`; reference from sign-in page + button.
  - **Step 3**: Visual regression via `toHaveScreenshot`.
- **Commit**: `feat(auth): FXAV wordmark + Google G icon on sign-in (M5-D4)`

#### C5 close-out — impeccable §12 dual gate

---

### Cluster C6 — Lightbox motion + sentinel + error routing (M7-D5, M7-D1, M7-D2)

**Sub-shape session NOT required** — motion design is `/impeccable animate` territory but the motion spec is already constrained by DESIGN.md §5 (`--duration-normal`, `--ease-out-quart`).

#### Task 9.M7-D5 — Sentinel-hiding helper for diagrams + agenda

- **Files**: `lib/visibility/emptyState.ts` (add `shouldHideDiagrams(diagrams, agendaLinks)`); `components/tiles/DiagramsTile.tsx` (consume the helper); `tests/components/tiles/_metaSentinelHidingContract.test.ts` (extend with DiagramsTile + AgendaTile registry rows).
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `rg "items.length > 0|agendaLinks.some" components/tiles/DiagramsTile.tsx` confirms the inline boolean checks DEFERRED.md M7-D5 describes still exist; `rg "shouldHideGenericOptional" lib/visibility/emptyState.ts` confirms the existing helper pattern.
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/lib/visibility/emptyState.test.ts` extends with `shouldHideDiagrams` cases: empty diagrams + empty agendaLinks → true; non-empty diagrams + empty agendaLinks → false; etc.
  - **Step 2**: Implement helper; refactor DiagramsTile to consume it.
  - **Step 3**: Extend `_metaSentinelHidingContract.test.ts` with DiagramsTile + AgendaTile rows (media-presence: diagrams + agenda links).
- **Class-sweep**: `rg "\.length > 0|\.some\(Boolean\)" components/tiles/ -n` walks every tile component for similar inline patterns; route the same shape through `shouldHide*` helpers if any other tile carries one.
- **Commit**: `refactor(visibility): extract shouldHideDiagrams helper + register in meta-test (M7-D5)`

#### Task 9.M7-D1 — Gallery + AgendaSheet entry/exit motion

- **Files**: `components/diagrams/GalleryLightbox.tsx`; `components/agenda/AgendaSheet.tsx` (verify exists — if not, create or skip the agenda branch).
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `ls components/agenda/` — confirmed `AgendaEmbed.tsx` + `AgendaPdfViewer.tsx`; **no `AgendaSheet.tsx`** in the current tree. Either (a) the bottom-sheet pattern doesn't exist yet (M7-D1 motion only applies to GalleryLightbox in M9), or (b) the bottom-sheet is M10 territory. **Decide at task kickoff** — if the sheet isn't a separate component in `components/agenda/`, M7-D1's scope reduces to GalleryLightbox only and `AgendaSheet` motion re-defers to whichever milestone introduces the component.
- **TDD checklist**:
  - **Step 1**: Failing test — `tests/components/diagrams/GalleryLightbox.test.tsx` extends with `AnimatePresence` entry/exit assertions (opacity 0→1, `scale: 0.96 → 1`, duration `--duration-normal` 220ms, easing `--ease-out-quart`).
  - **Step 2**: Wrap with `AnimatePresence`; respect `prefers-reduced-motion`.
  - **Step 3**: Transition-audit task per AGENTS.md writing-plans additions — every `AnimatePresence`, ternary render, conditional block has appropriate `exit` / `initial` / `animate` props. Compound transitions: opening lightbox A while lightbox B is mid-close.
- **Commit**: `feat(diagrams): lightbox entry/exit motion with reduced-motion gate (M7-D1)`

#### Task 9.M7-D2 — AgendaPdfViewer error states via messageFor

- **Files**: `components/agenda/AgendaPdfViewer.tsx`; `lib/messages/catalog.ts` (the `AGENDA_*` rows landed already via Task 9.4 from the 9.0.A1 amendment); **route file: `app/api/asset/agenda/[show]/[id]/route.ts`** (verified path, corrected R1 finding 3 — earlier `[showId]` placeholder was non-existent).
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: confirm `react-pdf`'s `onLoadError` payload shape; if status isn't exposed, the HEAD-fetch fallback per DEFERRED.md M7-D2 lands. Confirm the agenda proxy route at `app/api/asset/agenda/[show]/[id]/route.ts` emits 410 + 401 distinct status codes (NOT collapsing to 404 / 500).
- **TDD checklist**:
  - **Step 1**: Failing test — with the proxy mocked to return 410, assert AgendaPdfViewer renders `messageFor('AGENDA_GONE_FOR_CREW').crewFacing` exactly; with 401, asserts `AGENDA_UNAUTHENTICATED` copy. Test path: `tests/components/agenda/AgendaPdfViewer.test.tsx` (extend existing OR create).
  - **Step 2**: Catalog rows already exist (ratified via 9.0.A1 amendment + shipped via Task 9.4); this task only adds the `onLoadError` → status-derivation → `messageFor` routing logic in `AgendaPdfViewer.tsx`. **No fresh catalog change here.**
  - **Step 3**: Implement `onLoadError` → status derivation. If `react-pdf` doesn't expose status, HEAD-fetch the agenda proxy URL first and route on its status code.
  - **Step 4**: Meta-test `_metaAdminAlertCatalog.test.ts` check — `AGENDA_*` codes are crew-facing only (`dougFacing: null`, NOT `admin_alerts` producers); confirm they belong in the message-codes coverage test, NOT the admin-alerts catalog test.
- **Commit**: `feat(agenda): route PDF load errors through messageFor (M7-D2)`

#### C6 close-out — impeccable §12 dual gate

---

### Cluster C6b — Lightbox media perf (M7-D3)

**Sub-shape session NOT required** — this is a build/config + interaction-test task, not visual.

#### Task 9.M7-D3 — Diagrams `<img>` → `next/image` (scoped tightly)

- **Files**: `components/diagrams/Gallery.tsx`; `components/diagrams/GalleryLightbox.tsx`; `next.config.ts` (add `images.remotePatterns` for the proxy origin); **route file: `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`** (verified path, corrected R1 finding 3 — earlier `[asset]` placeholder was non-existent); new integration test.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**:
  - `cat next.config.ts` confirms current state (no `images` block — current config only sets `distDir` + `experimental.authInterrupts`).
  - `cat app/api/asset/diagram/[show]/[rev]/[key]/route.ts` for the proxy's response headers — verify `Cache-Control: private, max-age=0, must-revalidate` is still emitted.
  - Confirm Next.js 16's `/_next/image` proxy honors `Cache-Control: private` from the upstream (per AGENTS.md memory `feedback_verify_review_findings_against_external_api_spec.md`).
- **TDD checklist**:
  - **Step 1**: Failing integration test — `tests/integration/diagram-next-image.test.ts` (NEW): with the diagram proxy mocked at `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`, request a representative dynamic URL (e.g., `/api/asset/diagram/<showSlug>/<rev>/<keyHash>`) via `next/image` consumption and assert (a) the resolved image URL goes through `/_next/image?url=...`; (b) the response `Cache-Control` is `private, max-age=0, must-revalidate` (NOT mutated by `/_next/image`); (c) revoking the underlying asset (returning 403 from the proxy) propagates through `/_next/image` as a non-cached failure.
  - **Step 2**: Migrate `<img>` → `next/image`; declare the proxy origin in `next.config.ts` `images.remotePatterns`.
  - **Step 3**: Re-run the integration test; assert all three properties hold.
  - **Step 4**: Lint check — `pnpm lint` should no longer warn about `@next/next/no-img-element` for `components/diagrams/`.
- **Cache-Control vector**: per §6 watchpoint 12 + AGENTS.md memory `feedback_verify_review_findings_against_external_api_spec.md` — the Cache-Control propagation through `/_next/image` is the failure mode; the test must explicitly verify it, NOT just smoke-check that images load.
- **Commit**: `feat(diagrams): migrate to next/image with proxy Cache-Control test (M7-D3)`

#### C6b close-out — impeccable §12 dual gate (audit-dominant; little copy to critique)

---

### Cluster C6c — Lightbox pinch-zoom (M7-D4)

**Sub-shape session NOT required** — the gesture-priority decision is constrained by Embla's gesture model (well-documented).

#### Task 9.M7-D4 — `react-zoom-pan-pinch` + Embla gesture priority

- **Files**: `package.json` (add `react-zoom-pan-pinch` dep); `components/diagrams/GalleryLightbox.tsx` (wrap each `<figure>` with `TransformWrapper` + `TransformComponent`); new test.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: `grep "useEmblaCarousel\|emblaApi" components/diagrams/GalleryLightbox.tsx -n` confirms Embla's hook usage; `cat node_modules/embla-carousel-react/package.json | jq .version` for the current Embla version; check Embla's docs for the canonical pattern for temporarily disabling swipe (`emblaApi.reInit({ watchDrag: false })` is a common path).
- **TDD checklist**:
  - **Step 1**: Failing test (Playwright touch-emulation) — `tests/e2e/lightbox-pinch-zoom.spec.ts` (NEW): assert (a) two-finger pinch on a figure scales the image (transform matrix changes); (b) one-finger swipe DURING active zoom does NOT navigate Embla (gesture priority: pinch wins); (c) one-finger swipe AFTER pinch-end navigates Embla normally; (d) double-tap resets zoom.
  - **Step 2**: Add dependency; implement per pattern.
  - **Step 3**: Gesture-priority compound transitions: pinch + try-to-swipe-while-pinching; pinch then release then swipe-immediately; multiple pinches in sequence without releasing.
  - **Step 4**: Run on a real mobile device OR Playwright's touch emulation (mobile-safari project); jsdom is not sufficient (per AGENTS.md writing-plans additions).
- **Commit**: `feat(diagrams): pinch-zoom inside lightbox with Embla gesture priority (M7-D4)`

#### C6c close-out — impeccable §12 dual gate

---

### Cluster C7 — Inline-error consolidation (M5-D8)

**Sub-shape session NOT required** — this is a sweep, not a redesign.

#### Task 9.M5-D8 — Route inline error strings through `messageFor`

- **Files**: `app/auth/sign-in/SignInButton.tsx` (~lines 139-141 per DEFERRED.md M5-D8); `app/show/[slug]/p/Bootstrap.tsx` (~lines 96-99); any other inline-error callsite the class-sweep grep surfaces.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification (CLASS-SWEEP, code-shape, NOT name-list)**: `rg "setError\(['\"][^'\"]+['\"]" app/ components/ -n` enumerates every inline literal-string `setError` call across the codebase; route every result through `messageFor` (or carry a deliberate inline annotation explaining why a specific call site is exempt). Per §6 watchpoint 2.
- **TDD checklist**:
  - **Step 1**: Failing test — static-grep assertion at `tests/messages/no-inline-error-strings.test.ts` (NEW): `! rg "setError\(['\"][^'\"]+['\"]" app/ components/ | rg -v "messageFor\\(|// not-subject:"` returns zero matches.
  - **Step 2**: For each callsite, identify the appropriate catalog code (add new catalog rows if the inline string doesn't map to an existing code — adding new codes requires spec amendment per §1.7; consolidate to existing codes where possible).
  - **Step 3**: Replace inline strings with `messageFor(code).crewFacing` (or `dougFacing` per surface).
- **Commit**: `refactor(messages): route inline error strings through messageFor (M5-D8)`

#### C7 close-out — impeccable §12 dual gate

---

### Cluster C8 — A11y batch (M5-D6)

#### Task 9.M5-D6 — Five batched P2/P3 a11y polish items

- **Files** (per DEFERRED.md M5-D6):
  1. `components/messages/ErrorExplainer.tsx:93-98` — style `<details>` UA marker or `list-style: none` reset.
  2. `app/auth/sign-in/SignInButton.tsx:118-145` — `aria-describedby` linking inline error to button.
  3. `components/admin/AlertBanner.tsx` — consider `aria-atomic="true"` (AlertBanner is already C4-touched; verify D6 item #3 is still pending at this point — may be resolved in C4 already).
  4. `app/show/[slug]/p/Bootstrap.tsx` — `aria-live` on state-transition region.
  5. `app/auth/sign-in/page.tsx` — `aria-labelledby` on `<header>`.
- **AC**: M9 deferral closure / AC-9.X.
- **TDD checklist**: per-item Playwright a11y axe-rule assertion OR component-level unit test with `@testing-library/jest-dom`'s `toHaveAttribute`. One task, five sub-commits OR one batched commit per AGENTS.md §1.6 (the items share a theme — accessibility batch — so one commit is acceptable).
- **Commit**: `refactor(a11y): batched P2/P3 a11y polish (M5-D6)`

#### C8 close-out — impeccable §12 dual gate (audit-dominant)

---

### Cluster C9 — Admin allow-list runtime-mutable (M2-D1, large; spec amendment + DB migration + UI)

**Sub-brainstorming session REQUIRED for spec amendment.** **Sub-shape session REQUIRED for the UI.** This cluster has the biggest cross-cutting surface (RLS via `public.is_admin()` touches 21 admin-gated tables).

**Implementation discovery (recorded 2026-05-12 at Task 9.0 close):**
- The current admin allow-list is HARDCODED IN A POSTGRES MIGRATION (`supabase/migrations/20260501002000_rls_policies.sql:30-36`, the `public.is_admin()` function), NOT env-driven. The `ADMIN_EMAILS` env var listed at spec §14.3:3290 and `.env.local.example:26` is **NOT consumed by any code path**. DEFERRED.md M2-D1 description has been corrected to reflect this.
- 21 admin-gated tables (per M2-D2) consume `public.is_admin()` via RLS policies. C9's migration must preserve identical semantics post-cutover.

#### Task 9.C9.0 — Spec amendment `superpowers:brainstorming` session

- **Output**: `docs/superpowers/specs/amendments/2026-05-12-admin-allowlist-runtime-mutable.md` (NEW).
- **Amendment text MUST specify**:
  - Retirement of the hardcoded `array['dlarson@fxav.net', 'edweiss412@gmail.com']` arm in `public.is_admin()` — replaced by a table lookup against `admin_emails`. **The OTHER arm — `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` (line 30 of the current `public.is_admin()` at `supabase/migrations/20260501002000_rls_policies.sql:30`) — MUST be preserved verbatim** (corrected at R3 repair, comprehensive C9 re-analysis). That arm is the Supabase Auth claim path; retiring it would break the JWT-role override. Final shape:

    ```sql
    create or replace function public.is_admin
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
    as $$
      select coalesce((auth.jwt -> 'app_metadata' ->> 'role') = 'admin', false)
          or coalesce(
               exists (
                 select 1 from public.admin_emails
                 where email = public.auth_email_canonical
                   and revoked_at is null
               ),
               false
             );
    $$;
    ```

  - New `admin_emails` table contract: `(email text primary key, added_by uuid references auth.users(id), added_at timestamptz not null default now, revoked_at timestamptz, revoked_by uuid references auth.users(id), revoked_reason text)`. Email column ALWAYS canonicalized via `public.canonicalize_email` (per AGENTS.md §1.3 invariant); a CHECK constraint enforces canonicalized form (`check (email = lower(btrim(email)))`).
  - **Bootstrap contract (corrected at R3 repair, comprehensive C9 re-analysis):** the SQL migration is the SOLE bootstrap path. Migration writes `INSERT INTO admin_emails (email, added_by, added_at) VALUES ('dlarson@fxav.net', null, now), ('edweiss412@gmail.com', null, now) ON CONFLICT (email) DO NOTHING`. **No env var is involved.** Rationale (R3 finding 1 closure): `supabase/seed.sql` does NOT exist in this repo (`supabase/config.toml` line `sql_paths = ['./seed.sql']` points at a non-existent file, so `supabase db reset` runs migrations + nothing else). `supabase/seed.ts` is invoked only via manual `pnpm db:seed` and is a fixture seeder, not a bootstrap hook. There is no reliable deploy-time TypeScript entry point that runs as part of every `supabase db reset` or production migration apply. Trying to bootstrap an env-var-driven initial admin through either surface yields a no-op in normal flow. Therefore the env var is dropped.
  - **`ADMIN_EMAILS` env var (listed at §14.3:3290) is RETIRED**: removed from `.env.local.example:26`, removed from spec §14.3 table. No replacement env var is added (R3 repair: previously the amendment text added `INITIAL_ADMIN_EMAIL`; that has no working delivery mechanism, so it's dropped). The spec amendment §14.3 row reads: "**`ADMIN_EMAILS`** — _RETIRED 2026-05-12 via M9 C9 (M2-D1). Was never consumed by any code path; the live `public.is_admin()` array was migration-hardcoded. Admin allow-list is now table-driven via `admin_emails` with the initial admins seeded by the C9.1 migration. Operator adds/revokes via `/admin/settings/admins` UI._"
  - **Operator workflow for net-new deployments:** apply migrations → C9.1 seed lands `dlarson, edweiss` → first admin signs in via Supabase Auth + Google OAuth → uses `/admin/settings/admins` to add additional admins → optionally revokes the literal-seed admins if the deployment doesn't include those people. **For a deployment that genuinely needs different initial admins than the literal seed**, the operator may either (a) sign in as a literal-seed admin and rotate via UI, or (b) hand-edit the C9.1 migration's seed `INSERT` line in a one-shot patch before first apply. The C9.0 brainstorming session may decide to expose a parametric migration helper for (b); deferred to that session.
  - **Apply-twice idempotency** (per AGENTS.md "CHECK/enum migration matrix" guidance, generalized): the migration uses `CREATE TABLE IF NOT EXISTS admin_emails`, `CREATE OR REPLACE FUNCTION public.is_admin`, and the seed `INSERT ... ON CONFLICT DO NOTHING`. Reset-and-reapply produces identical schema + identical seed rows.
  - **Last-admin lockout scenario** (deferred to C9.2 UI brief): if the active admin set ever drops to 1 and that admin clicks Revoke on themselves, the operation must be refused with `messageFor('LAST_ADMIN_LOCKOUT_REFUSED')` (new MessageCode added in C9.0 amendment scope). The exact UX (modal, banner, disabled-button-with-tooltip) is C9.2's call; the amendment only mandates the refusal contract and the catalog row.

  **Authority disclaimer (R3 repair clarification):** Task 9.0's job is scope-and-shape — the contract specifics above are the BEST CURRENT UNDERSTANDING after R1+R2+R3 reviews. The C9.0 brainstorming session is the AUTHORITATIVE design point. If brainstorming surfaces additional contract questions (rotation procedures, audit-trail schema, cascade behaviors), those answers land in the amendment file, not back here. This handoff doc records routing decisions, not the final §14.3 amendment text.
  - Audit trail: `admin_email_changes` table OR re-use existing `admin_alerts` with `ADMIN_EMAIL_ADDED` / `ADMIN_EMAIL_REVOKED` producer codes — decide in the brainstorming session.
  - RLS for `admin_emails` table: `is_admin()` for SELECT/INSERT/UPDATE; advisory-lock decision (per AGENTS.md §1.2 — `admin_emails` is NOT in the §1.2 invariant list of `{shows, crew_members, crew_member_auth, pending_syncs, pending_ingestions}`, so advisory locks default to N/A; brainstorming may add `admin_emails` to a separate per-table lock contract if desired).
  - Performance: `public.is_admin()` is called in EVERY RLS check; table-lookup vs constant-array cost differential. Brainstorming evaluates: (a) function STABILITY = stable (same query plan); (b) add an index on `admin_emails(email) WHERE revoked_at IS NULL`; (c) measure baseline RPS impact on a seeded fixture.
- **Adversarial review**: per `feedback_adversarial_review_canonical_invocation.md`, the amendment goes through `/codex:adversarial-review --scope branch` before ratification. Single-round expected (small amendment).
- **Commit (amendment)**: `docs(spec): §14.3 amendment — admin allow-list runtime-mutable (M2-D1)` — single commit landing the amendment file + ratification record.

#### Task 9.C9.0.5 — Runtime RLS behavioral-parity probe [ADDED at R1 repair, codex finding 1]

**Rationale (R1 finding):** C9 replaces the `public.is_admin()` function consumed by 21 admin-gated tables' RLS. The existing `tests/db/schema-introspection.test.ts` (per M2-D2) proves policies STILL CALL `is_admin()` post-migration, but doesn't prove the live ADMIN-vs-NON-ADMIN behavior is preserved. A bad table lookup, email-canonicalization mismatch, or revoked-row edge case could lock out admins or over-authorize admin tables without breaking introspection. The R1 reviewer recommendation: pull M2-D2 into C9, OR push C9 out of M9. We're pulling M2-D2 in.

**This task ALSO RESOLVES M2-D2** (static-vs-runtime breadth for the 21-table admin RLS matrix). The runtime probe written here runs on every CI build going forward, closing the drift-detection gap M2-D2 worries about.

- **Files**: `tests/db/admin-rls-runtime.test.ts` (NEW); test fixtures for admin + non-admin JWTs (verify via `grep "admin.*jwt\|signJwt.*admin" tests/` whether helper exists, else create at `tests/_fixtures/auth.ts`).
- **AC**: M9 deferral closure / AC-9.X (also closes M2-D2 inheritance).
- **Pre-task code-verification**: enumerate the policy classes explicitly. **Two classes exist** (verified at HEAD against `supabase/migrations/20260501002000_rls_policies.sql:62-227`):

  **Class A — `admin_only` (single policy, FOR ALL):** 21 tables — `shows_internal`, `sync_log`, `reports`, `pending_syncs`, `pending_ingestions`, `crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`, `app_settings`, `deferred_ingestions`, `admin_alerts`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `onboarding_scan_manifest`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `wizard_finalize_checkpoints`, `shows_pending_changes`, `recovery_drift_cooldowns`. Derived at runtime: `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'admin_only' AND qual ILIKE '%public.is_admin()%'`.

  **Class B — crew-readable tables with separate admin policies (`crew_read` SELECT + `admin_insert` / `admin_update` / `admin_delete`):** N tables (shows, crew_members, hotel_reservations, rooms, transportation, …). Derived at runtime: `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('admin_insert','admin_update','admin_delete') AND (qual ILIKE '%public.is_admin()%' OR with_check ILIKE '%public.is_admin()%')`.

  **Do NOT use a naive `policyname IN ('admin_only', 'admin_insert', ...)` filter without examining `qual` / `with_check` for the `is_admin()` reference** — that would over-include policies that happen to share names but use different predicates.

- **Expected behavior matrix (per class):**

  **Class A (admin_only):** admin → succeeds on all 4 verbs (SELECT/INSERT/UPDATE/DELETE); non-admin → fails on ALL 4 with `permission denied` or `new row violates row-level security policy`.

  **Class B (crew-readable):** admin → succeeds on all 4 verbs (admin_insert/update/delete for writes; crew_read SELECT also satisfied since `is_admin()` is one of the OR-arms of crew_read's `qual`); non-admin (with a valid crew-session JWT for the show) → succeeds on SELECT via crew_read, fails on INSERT/UPDATE/DELETE; non-admin (no crew binding) → fails on ALL 4.

- **TDD checklist**:
  - **Step 1**: Failing test — `tests/db/admin-rls-runtime.test.ts` defines:
    - Class A matrix: 4-verb × 21-table × 2-role (admin / non-admin-no-crew) = **168 cells**. Admin succeeds; non-admin fails on every cell.
    - Class B matrix: 4-verb × N-table × 3-role (admin / non-admin-with-crew-session / non-admin-no-crew) = **12N cells**. Per row of the expected-behavior matrix above.
    - Total cells: 168 + 12N where N is the Class B count (~5+ tables → ~60+ cells). The test asserts each cell against its expected outcome.
    - The test parametrizes from the runtime-derived class lists (above); adding a new policy with `is_admin()` in `qual` / `with_check` automatically extends the matrix.
  - **Step 2**: Run the test BEFORE the C9.1 migration applies — assert all cells pass against the current hardcoded-array `is_admin()`. **This is the BASELINE**; serialize the cell-result map to a JSON artifact at `tests/db/admin-rls-runtime.baseline.json` (committed alongside the test).
  - **Step 3** (executed at C9.1 Step 4): Run the test AFTER the C9.1 migration applies — assert zero drift vs the committed baseline. ANY cell that flips outcome → P0 blocker; pause migration rollout.
  - **Step 4**: Edge-case test — explicitly add: (a) revoked admin email (`revoked_at = now`) → that admin's session fails like non-admin on Class A; (b) email-case mismatch (mixed-case input vs canonicalized table lookup) → admin operations still succeed (canonicalization at the lookup boundary per AGENTS.md §1.3); (c) duplicate-row scenario (re-INSERT of an active email) → no behavioral change (idempotency).
- **Test infrastructure**: the test runs under Vitest with the Supabase test client. Baseline + regression are TWO test runs against TWO DB states (pre-migration HEAD vs post-migration HEAD). The recommended pattern: `pnpm test:db:baseline` (runs against the migration state checked out at `git rev-parse C9.1-parent`) writes the baseline JSON; `pnpm test:db:regression` runs against the migration applied AND asserts equality with the committed baseline. The baseline JSON ships as a fixture in the same commit as the test file. Alternative if `pnpm test:db:baseline` infra doesn't exist: a Vitest `beforeAll` snapshots the cell-result map; the test then asserts equality with a frozen JSON file. Decide at task kickoff which infra path is cleaner; document the choice in the task body.
- **Class-sweep**: the test must DERIVE the table list from `pg_policies`, NOT a hand-named array. Per AGENTS.md memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`: structural meta-tests walk the subtree, not a lexical name list.
- **Meta-test inventory impact**: this test IS the M2-D2 closure meta-test. Update §13 below to record (closes M2-D2 + creates a permanent meta-test for the 8N-cell matrix).
- **Commit**: `test(db): runtime RLS behavioral-parity probe for admin allow-list (C9 prereq; closes M2-D2)`

#### Task 9.C9.1 — Migration: `admin_emails` table + replacement `is_admin()` + seed

- **Files**: `supabase/migrations/2026XXXX_admin_emails_runtime_mutable.sql` (NEW); update `supabase/seed.ts` if it touches admin state.
- **AC**: M9 deferral closure / AC-9.X.
- **Pre-task code-verification**: re-grep `is_admin()` callsites; confirm M2-D2's 21-table list is still accurate (the spec/plan should be authoritative, but verify by running `tests/db/schema-introspection.test.ts` AND the new C9.0.5 runtime test).
- **TDD checklist**:
  - **Step 1**: Failing migration test — `tests/db/admin-emails.test.ts` (NEW): (a) table exists with the schema from the amendment; (b) `public.is_admin()` returns true for an `admin_emails` row with `revoked_at IS NULL` AND the auth-jwt email canonicalized matches; (c) returns false after `revoked_at` is set; (d) returns false for an email not in the table; (e) `app_metadata.role = 'admin'` path STILL works (preserves the JWT-based admin override per `is_admin()` line 30).
  - **Step 2**: Migration writes the table + replacement `is_admin()` + initial seed.
  - **Step 3**: Run the 21-table RLS introspection test (`tests/db/schema-introspection.test.ts`) — assert zero drift in policies.
  - **Step 4**: **Run the C9.0.5 runtime RLS behavioral-parity probe (`tests/db/admin-rls-runtime.test.ts`) AFTER the migration applies; assert zero cell-result drift from the C9.0.5 baseline.** This is the behavioral-correctness gate. ANY drift → P0 blocker, halt rollout, surface to orchestrator.
  - **Step 5**: Performance smoke — run a seeded query against an admin-gated table; assert response time is within 10% of pre-migration baseline (collect baseline via `pnpm dlx supabase db reset` against pre-migration HEAD, run query, record; then apply migration, re-run).
  - **Step 6**: Idempotency — `pnpm dlx supabase db reset` twice in a row produces identical schema.
- **Commit**: `feat(db): admin_emails table + runtime-mutable is_admin() (M2-D1)`

#### Task 9.C9.2 — `/impeccable shape <admin-allowlist-UI>` sub-session

- **Output**: brief at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-12-admin-allowlist-UI.md`.
- **Brief content**: add/revoke flows; admin email confirmation pattern (two-tap or password re-prompt for the revoke path); audit-trail rendering on the page; how the page is reached (`/admin/settings/admins` per DEFERRED.md M2-D1 recommendation).
- **Commit**: `docs(plan): C9 admin-allowlist UI shape brief (M2-D1)`

#### Task 9.C9.3 — `/admin/settings/admins` page + Server Actions

- **Files**: `app/admin/settings/admins/page.tsx` (NEW); `app/admin/settings/admins/_actions.ts` (NEW — `addAdmin`, `revokeAdmin` Server Actions); `lib/data/adminEmails.ts` (NEW — typed query helpers).
- **AC**: M9 deferral closure / AC-9.X.
- **Supabase call-boundary discipline (§1.9)**: every helper in `lib/data/adminEmails.ts` destructures `{ data, error }`; infra faults surface as typed `AdminEmailsInfraError`; register helpers in `tests/auth/_metaInfraContract.test.ts` (extend per §13 below).
- **Email canonicalization (§1.3)**: every add/revoke call passes through `lib/email/canonicalize.ts` BEFORE the DB INSERT/UPDATE. Add a row to `tests/admin/no-inline-email-normalization.test.ts` to enforce.
- **TDD checklist**:
  - **Step 1**: Failing tests:
    - (a) Adding a new admin's canonicalized email lands a row; subsequent `is_admin()` returns true for that email.
    - (b) Revoking sets `revoked_at` to now AND `revoked_by` to the actor; `is_admin()` returns false for that email; the row is preserved (audit trail).
    - (c) Adding an already-active admin email is a no-op (idempotent) — does NOT raise an error.
    - (d) Adding a revoked email re-activates it (clears `revoked_at`) — confirm in the brainstorming session whether this is the desired UX OR a fresh row is appended.
    - (e) Non-admin attempting to call the Server Actions gets 403 via `requireAdmin()`.
    - (f) The page renders the canonical admin list with `revoked_at IS NULL` filtered (or shows revoked entries under a "Revoked" header per brief).
  - **Step 2**: Implement Server Actions + page per brief.
  - **Step 3**: Spec-check every UI copy string against the C9.0 amendment.
- **Commit**: `feat(admin): /admin/settings/admins page + Server Actions (M2-D1)`

#### C9 close-out — impeccable §12 dual gate

After C9.0 + C9.1 + C9.2 + C9.3 commit, run `/impeccable critique` + `/impeccable audit`. **Spec-check is high-risk** — the UI's add/revoke prompts touch security-signal copy.

---

## A. Task list — summary table

| # | Cluster | Items | Commits (rough) | Pre-req sub-sessions |
|---|---------|-------|-----------------|----------------------|
| C0 | Foundation | **9.0.A1 §12.4 amendment** → 9.4 → 9.1 → 9.2 → 9.3 + dual gate | 5-6 | `superpowers:brainstorming` (small) |
| C2 | Tokens | M4-D5 + dual gate | 1 | — |
| C1 | Crew-page IA | C1.0 brief → M4-D2 → M4-D3 → M4-D6 → M4-D4 + dual gate | 5 | `/impeccable shape` |
| C3 | Auth flow | C3.0 briefs → M5-D1 → M5-D2 → M5-D5 + dual gate | 4 | `/impeccable shape` + `/impeccable animate` |
| C4 | Admin banner | C4.0 brief → M5-D3 + dual gate | 2 | `/impeccable shape` |
| C5 | Sign-in brand | M5-D4 + dual gate | 1 | — |
| C6 | Lightbox motion/sentinel | M7-D5 → M7-D1 → M7-D2 + dual gate | 3 | — |
| C6b | Lightbox media perf | M7-D3 + dual gate | 1 | — |
| C6c | Lightbox pinch-zoom | M7-D4 + dual gate | 1 | — |
| C7 | Inline-error consolidation | M5-D8 + dual gate | 1 | — |
| C8 | A11y batch | M5-D6 + dual gate | 1 | — |
| C9 | Admin allow-list | C9.0 §14.3 amendment → **C9.0.5 runtime RLS probe** → C9.1 migration → C9.2 brief → C9.3 UI + dual gate | 5 | `superpowers:brainstorming` + `/impeccable shape` |

**Total commits (approx)**: 30-32 (including the dual-gate fixup commits where critique/audit findings land). **R1 repair (2026-05-12, codex review of SHA 00620cb) added Task 9.0.A1 + Task 9.C9.0.5 + closed M2-D2 inline via C9.0.5 + corrected M7-D2 and M7-D3 route citations.**

**Per AGENTS.md §1.6 (one commit per task)**: every numbered task above gets ONE commit subject. Dual-gate fixup commits use `chore(<scope>): impeccable <cluster-letter> findings disposition` form.

---

## Field discipline notes (carry-forward from M5 / M6 / M7 / M8 handoffs)

- **"Spec sections in scope" is exhaustive, not representative.** §1 above lists every § referenced by the four stated tasks AND every § referenced by the deferral inventory at handoff time. 9.0 may add more.
- **"AC list" uses canonical AC IDs.** M9 covers AC-9.1, AC-9.2, AC-9.3 plus the AC-9.X (M9 deferral closure) exit gate. No paraphrases.
- **"Pre-handoff state" is verified by command, not assertion.** Every "tests passing" check has a command. M8 close-out baseline at SHA `69ed38a` is the starting point.
- **"Watchpoints" is the most valuable section for M9.** Per-instance whack-a-mole is the dominant M9 failure mode under "small fix" cover. Watchpoint 1 (impeccable critique vs spec) and watchpoint 2 (class-sweep code-shape-based) are the two highest-priority preloads for the reviewer.
- **"Exit criteria" includes the convergence step AND the deferral-closure step.** M9 is not done at "four tasks ship and tests pass"; it's done at "tasks pass AND adversarial review converged AND `DEFERRED.md` reflects M9's deferral dispositions AND impeccable §12 closed on every touched cluster."

---

## Convergence log

### Task 9.0 — scope-and-shape session

- **2026-05-12 R0 commit `00620cb`** — initial §A populated with 12-cluster routing + 20 deliverables.
- **R1 codex adversarial review** — needs-attention: 2 HIGH + 1 MEDIUM findings (C9 missing runtime RLS guard; M7-D2 requires undeclared spec amendment; route citations were placeholder paths).
- **R1 repair commit `49bc26b`** — added Task 9.C9.0.5 runtime RLS probe; added Task 9.0.A1 §12.4 amendment task; corrected route paths.
- **R2 codex review** — needs-attention: 2 HIGH + 2 MEDIUM findings (C9.0.5 pg_policies underspecified; M9 branch diff polluted by M12 spec work; AGENDA_* in admin_alerts meta-test; INITIAL_ADMIN_EMAIL injection contract missing).
- **R2 repair commit `2a55707`** — specified two policy classes (Class A admin_only / Class B crew-readable); mandated path-filtered M9 reviews; removed AGENDA_* from admin_alerts inventory; moved INITIAL_ADMIN_EMAIL to TS seed.
- **R3 codex review** — needs-attention: 1 HIGH + 1 MEDIUM (INITIAL_ADMIN_EMAIL contract still contradictory because supabase/seed.sql doesn't exist; §13 inventory stale 8N).
- **R3 repair + comprehensive C9 re-analysis** at commit `1c90d6f` — verified live infra (seed.sql absent; seed.ts manual-only; is_admin has JWT-role + email-array branches). Dropped INITIAL_ADMIN_EMAIL entirely; migration's literal seed is sole bootstrap path; preserved JWT-role branch in amendment text; documented last-admin-lockout refusal contract; §13 inventory updated to mirror C9.0.5 exactly.
- **Convergence**: halted at 1c90d6f per user authorization. Remaining contract questions (audit-trail schema, rotation procedures) defer to C9.0 brainstorming session per the authority disclaimer.

### Task 9.0.A1 — §12.4 amendment for AGENDA_* codes

- **R0 commit `946b811`** — initial amendment ratifying AGENDA_GONE_FOR_CREW (410) + AGENDA_UNAUTHENTICATED (401) crew-only catalog rows.
- **R1 codex review** — needs-attention: 1 HIGH (proxy taxonomy mismatched live code; headRevisionId trigger fictional; cross-show=401 wrong, actually 403).
- **R1 repair commit `ac5983d`** — enumerated 410 triggers from route.ts:113-289 + validateCrewAssetSession.ts:30-131; cited live `file:line` for every trigger; 403 mapped to AGENDA_GONE_FOR_CREW; documented why 410/403 collapse.
- **R2 codex review** — needs-attention: 2 HIGH (mid-stream byte-limit isn't 410-observable; 401 enumeration missing validateLinkSession session-expiry paths).
- **R2 repair commit `d34c910`** — excluded mid-stream byte-limit; broadened 401 to enumerate validateLinkSession.ts:188 (SESSION_NOT_FOUND), 204 (SESSION_ABSOLUTE_TIMEOUT), 222 (LINK_SESSION_KEY_ROTATED), 288 (SESSION_IDLE_TIMEOUT).
- **R3 codex review** — needs-attention: 2 HIGH + 1 MEDIUM (401 trigger list still over/under-inclusive; 410 missing Range total-size guard; copy mismatch "fresh link" vs "new link"). **Same-vector recurrence rule satisfied — R1+R2+R3 all on trigger taxonomy.**
- **R3 repair commit `ac905da`** — **structural shift**: simplified canonical rows to HTTP-status + crew-recovery level; added "implementation owns the taxonomy" disclaimer documenting why exhaustive enumeration belongs in implementation + tests, not amendment text. Fixed "fresh link" / "new link" copy mismatch.
- **R4 codex review** — **APPROVE**. "Keeps canonical spec contract at the observable HTTP-status and crew-recovery level, preserves exact catalog copy, keeps helpfulContext omitted for null dougFacing rows, avoids making brittle implementation-branch enumeration part of spec contract."
- **Spec body integration commit `7f836b6`** — inserted two canonical rows into §12.4 between EMBEDDED_RECOVERY_REQUIRES_RESTAGE and ASSET_RECOVERY_REVISION_DRIFT; backfilled ratification SHAs in amendment file; updated 00-overview.md with new "Ratified spec amendments" sub-list.

### Task 9.4 — Catalog implementation (part 1 of 2)

- **Part 1 commit `b7ac297`** — added AGENDA_GONE_FOR_CREW + AGENDA_UNAUTHENTICATED entries to `lib/messages/catalog.ts` verbatim from amendment. Wired `messageFor(code, params)` placeholder interpolation in `lib/messages/lookup.ts` (PLACEHOLDER_RE matches `<name>` tokens; missing/null params leave placeholders verbatim; added `getDougFacing` / `getCrewFacing` / `lookupHelpfulContext` accessors). Tests: 4 existing + 5 new = 9 passing.
- **Part 2 PENDING** — see Task 9.4 task body §A for the briefing.

### Task 9.4 — Catalog implementation (part 2 SHIPPED)

- **Part 2 commit `1812f9a`** — populated `helpfulContext` for all 21 dougFacing-non-null entries (15 verbatim YAML ports + 6 fresh-author) plus 2 inverse-violation cleanups (CSRF_NONCE_EXPIRED + REPORT_RATE_LIMITED_CREW). Added structural coverage tests pinning both directions of the spec invariant. 11/11 catalog tests pass.
- **Regression fix commit `4a14100`** — retargeted three ErrorExplainer helpful-context tests to CSRF_KEY_ROTATED (which post-9.4-p2 carries both crewFacing + helpfulContext).

### Task 9.1 — Stale-data footer (SHIPPED)

- **Commit `0c41cdb`** — `components/shared/StaleFooter.tsx` with 17 vitest cases covering the §12.4 catalog-bound branching contract (4 age tiers × ok; 3 status precedence cases; pending_review × age branching; ISO-string acceptance; formatRelative helper). Catalog deltas: NEW rows DRIVE_FETCH_FAILED, PARSE_ERROR_LAST_GOOD, SYNC_DELAYED_MODERATE, SYNC_DELAYED_SEVERE; SHEET_UNAVAILABLE.crewFacing reconciled to spec-canonical copy. lib/time/relative.ts formatter shipped.

### Task 9.2 — Tile error boundaries (SHIPPED)

- **Commit `70ab2a1`** — shared infrastructure (`TileServerFallback`, `TileErrorBoundary`, `TileErrorFallback`, `WrappedTile`) + 15 tile files appended with `*TileView` alias + `load*Data` loader + show-page wire-up using `<WrappedTile tileId showId load View />` per call site. Tests: TileServerFallback (7), TileErrorBoundary (4), composition (3), pure-render compliance (61). Meta-test `_metaAdminAlertCatalog` registered TILE_SERVER_RENDER_FAILED. Total 135/135 9.2-specific tests pass; full suite 2765 passed.

### Task 9.3 — Empty-state reachability baselines (SHIPPED)

- **Commit `f4797cc`** — `tests/e2e/empty-state-reachability.spec.ts` with 4 scenarios per §8.3 category (required-field-missing, optional-field-missing, whole-tile-missing, stale-sync). Each scenario combines a DOM contract assertion (anti-tautology) with a `toHaveScreenshot` baseline. Spec is `test.describe.skip()` pending the auth-fixture migration tracked in `tests/e2e/empty-state.spec.ts:83-87`; baseline-generation command documented in JSDoc.

## §12 — C9 close-out impeccable findings + dispositions

Run date: 2026-05-17. Target: `app/admin/settings/admins/{page,AddAdminForm,RevokeRowButton,ReAddRowButton}.tsx` (4 files). User-triggered after adversarial review converged at R11.

### Critique (LLM design review + deterministic detector)

Deterministic detector: 0 findings across all 4 files (`npx impeccable --json app/admin/settings/admins/` → `[]`).

LLM review: no AI-slop patterns; tokens consistent; two-tap state machine echoes C4 ResolveAlertButton (reference-implementation consistency); Server Action retains authority on every control; no modal, no gradient text, no glassmorphism, no hero-metric, no identical card grids.

Nielsen heuristics: **30/40 (Solid — ship after P1 fixes)**.

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| P1a | HIGH | Lockout error `max-w-xs text-right text-xs` tucked under disabled Revoke button — easy to miss on Doug's phone. | **FIXED in commit `4e438b0`** — full container-width, left-aligned `text-sm` with `bg-warning-bg text-warning-text` wash for visual anchoring. |
| P1b | HIGH | No success confirmation after Add (server revalidates silently, peak-end ambiguity). | **FIXED in commit `4e438b0`** — inline `"Added <email>."` success message with `role="status"`; inputs auto-clear via `formRef.reset()` from a useEffect (DOM mutation, not setState — satisfies react-hooks/set-state-in-effect rule). |
| P2a | MEDIUM | Revoked-row recovery was 3 steps (retype → re_add_required prompt → confirm). | **FIXED in commit `4e438b0`** — new `ReAddRowButton.tsx` client island renders a one-tap "Re-add" on each RevokedRow that submits to addAdminAction with `confirm_re_add=true`. |
| P2b | MEDIUM | AdminRow meta-line ran-on for seed+actor+note (four facts on one line, awkward phone wrap). | **FIXED in commit `4e438b0`** — "You" promoted to a small pill next to email; "Seed admin" demoted to inline `<em>`; note moved to its own italic line. |
| P3 | LOW | Re-add Cancel left stale `re_add_required` result behind (retype same email → prompt re-fires without server round-trip). | **FIXED in commit `4e438b0`** — AddAdminForm split into outer + inner; Cancel bumps formKey state; inner form re-mounts; useActionState resets. |

### Audit (5-dimension technical health)

Run on the patched code (post-critique-fixes).

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | "You" pill `text-[10px] font-semibold` on `bg-accent` measured 4.07:1 (fails WCAG 1.4.3 for small text); disabled-Revoke tooltip in `title` attr only |
| 2 | Performance | 4 | No layout thrash, no expensive animations, cheap form-reset useEffect |
| 3 | Theming | 4 | All design tokens; no hard-coded colors; no new tokens (brief §11 anti-goal preserved) |
| 4 | Responsive Design | 4 | flex-wrap throughout; `min-h-tap-min`/`min-w-tap-min` on every interactive control |
| 5 | Anti-Patterns | 4 | Detector `[]` — zero matches; no AI slop tells |
| **Total** | | **19/20** | **Excellent (minor polish)** |

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| A-P2 | MEDIUM | "You" pill contrast 4.07:1 fails WCAG 1.4.3 for small text (text-[10px] ≈ 7.5pt doesn't qualify for "large text" 3:1 exemption even bold). | **FIXED in commit `72af2f1`** — swapped pill chrome to neutral `border border-border bg-surface-raised text-text-strong text-xs`. "You" is identification, not CTA — neutral chrome reads correctly and avoids competing with bg-accent button or bg-warning-bg lockout/re-add surfaces. |
| A-P3 | LOW | Disabled-Revoke explanation hidden in `title` tooltip (mobile devices don't surface title; screen readers often ignore title on disabled buttons). | **FIXED in commit `72af2f1`** — replaced with visible inline `<p>` hint below the button ("Can't revoke yourself, add another admin first.") wired via `aria-describedby`. Hint only renders when `disabled` is true. |

**Gate verdict: PASS.** Zero unresolved HIGH/CRITICAL findings; both polish items fixed in the same close-out pass. DEFERRED.md M9-D-C9-1 moved to RESOLVED 2026-05-17.

## §12 — C0 close-out impeccable findings + dispositions

### Critique (LLM design review + deterministic detector)

Deterministic detector: 0 findings across 6 affected files (`components/shared/{StaleFooter,TileServerFallback,TileErrorBoundary,TileErrorFallback,WrappedTile}.tsx` + `app/show/[slug]/page.tsx`).

LLM review: no AI-slop patterns; catalog-bound copy throughout; semantic Tailwind tokens; no gradient text, no glassmorphism, no hero-metric layouts.

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| M1 | MEDIUM   | StaleFooter shipped standalone but not wired into Footer's `asOf` slot. | **FIXED in commit `ce22e05`** — Footer accepts optional `lastSyncedAt` + `lastSyncStatus`; show page passes them; ShowForViewer projection extended. |
| M2 | MEDIUM   | Yellow + red tiers signal severity by text color only; bright-light venue-floor glare per PRODUCT.md crew context. | **DEFER** — acceptable for v1; revisit if Doug or crew flag. Document in [DEFERRED.md](../DEFERRED.md) as M9-D1 if not already. |
| M3 | MEDIUM   | TileErrorFallback is more visually prominent than working tiles (rounded border + elevated bg). | **DEFER** — current treatment matches §12.1 spec intent (visible cue that data is unavailable). |
| M4 | MEDIUM   | No inline "Report" button on TileErrorFallback; crew has to find footer-level Report. | **DEFER** — JSDoc already records this as a Task 9.2 follow-up. |
| M5 | MEDIUM   | Generic fallback copy across all tiles; no per-tile context interpolation. | **DEFER** — matches §12.4 canonical copy; spec amendment required to change. |

### Audit (5-dimension technical health)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | `role="status"` + `aria-live="polite"` on TileErrorFallback; StaleFooter informational. |
| 2 | Performance | 4 | No layout thrash, no expensive animations, bounded overhead from 15 wrappers. |
| 3 | Theming | 4 | Semantic tokens throughout (text-muted/warning/critical, bg-bg-elev, border-border). |
| 4 | Responsive Design | 4 | No fixed widths; flex layouts; non-interactive surfaces. |
| 5 | Anti-Patterns | 4 | No AI slop; catalog-bound copy; ASCII hyphen in user-visible strings. |
| **Total** | | **20/20** | **Excellent** |

P0=0, P1=0, P2=0, P3=1 (StaleFooter tier signal text-color-only; deferred per M2 above).

**Gate verdict: PASS.** Zero unresolved HIGH/CRITICAL findings. Adversarial review (cross-model) next.

### Cross-model adversarial review convergence (Codex)

Base: `9e053bd`. Each round anchors to milestone-base per memory feedback `adversarial_review_full_milestone_scope`.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 per-tile isolation; H2 View invocation; M3 Footer p→div; M4 TILE_SERVER_RENDER_FAILED placeholder | `febac56` | Initial structural correctness pass — identity-loader pattern, View JSX-element vs function-call, HTML nesting validity, copy placeholders. |
| R2 | needs-attention | H1-r2 NotesTile multi-domain check; M2-r2 SHOW_*_PUBLISHED placeholders; M3-r2 Tailwind token swap | `5a8e61f` | NotesTile aggregates 4 domains; admin-alert renderer plumbing gap surfaced; non-existent text-muted/bg-bg-elev tokens replaced with text-text-subtle/bg-surface-raised. |
| R3 | needs-attention | H1-r3 visibility-gated guards (audio/video/lighting/transport/financials) | `216ddff` | Role-gated tiles' visibility predicates AND-ed with tileErrors check before throw to prevent fallback cards for tiles the viewer wouldn't see. |
| R4 | needs-attention | H1-r4 TransportTile admin-bypass | `471ff26` | transportTileVisible(null) coupling — when transport query fails, the predicate goes silent. Fixed with admin OR transportVisible. |
| R5 | needs-attention | H1-r5 NotesTile+Lodging admin-bypass; H2-r5 catalog spec restore + renderer interpolation | `26ec002` | Renderer plumbing wired end-to-end (lookup hyphen↔underscore normalization; ErrorExplainer params; AlertBanner threading admin_alerts.context; TileServerFallback writes sheet_name). |
| R6 | needs-attention | M1-r6 renderer-interpolation test coverage | `8239543` | Added placeholder-bearing assertions on TILE_SERVER_RENDER_FAILED + SHOW_FIRST_PUBLISHED + SHOW_UNPUBLISHED via messageFor and AlertBanner-level context threading. |
| R7 | needs-attention | M1-r7 stale/sync §12.4 spec parity + SHEET_UNAVAILABLE producer plumbing | `411d882` | Restored §12.4-canonical SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD / SYNC_DELAYED_SEVERE rows; CronLiveShowRow extended with title; SHEET_UNAVAILABLE producer now supplies sheet_name in context. |
| R8 | needs-attention | M1-r8 source-gone producer plumbing; M2-r8 remaining stale-footer wrappers + TILE_SERVER_RENDER_FAILED helpfulContext + em-dashes; M3-r8 §12 doc record | `56d7fcd` | Closed all three MEDIUMs in one commit: handleFetchFailure_unlocked source-gone branch + crewFacing wrappers + em-dash restoration + §12 disposition table. |
| R9 | needs-attention | M1-r9 §12 R8 row still '(in flight)'; M2-r9 SHEET_UNAVAILABLE.followUp drift from spec | `11f61ac` | Two narrow MEDIUM cleanups — handoff SHA backfill and a single followUp string. No functional regressions. |
| R10 | needs-attention | M1-r10 R9 row lacks SHA; M2-r10 PARSE_ERROR_LAST_GOOD crewFacing drifts from §12.4 (spec apparent typo `_<time>\*.` propagated to catalog per spec-canonical rule) | `0aa1f9c` | Two final narrow MEDIUM cleanups. The spec typo at line 2721 (`_<time>\*.` instead of `_<time>_.`) is propagated to the catalog rather than silently fixed; flagged for spec-amendment follow-up. |
| R11 | **approve** | LOW R10 row backfill (record-keeping only) | `0aa1f9c` | C0 cluster CONVERGED. No HIGH/CRITICAL findings. PARSE_ERROR_LAST_GOOD spec typo flagged for future spec-amendment session. |

### Cluster C2 convergence (Codex)

Base: `1875fa7` (C0 close SHA). 4 rounds to approve.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | M1 admin kicker drift; M2 test/doc literals; L1 walker ext | `d1cbfc8` | StagedReviewCard → tracking-eyebrow; DESIGN.md scope clarified; walker scans ts/tsx/js/jsx/css. |
| R2 | needs-attention | H1 bracket-form utilities leaked into Tailwind v4 built CSS | `4f12168` | `@source not "../docs"` + `@source not "../tests"` in globals.css. |
| R3 | needs-attention | M1 runtime comments still leak; L1 admin/dev page | `789d87a` | `@source not "../lib"` + `@source not "../app/admin/dev"`; rewrote 3 runtime-file comments to remove bracket-form examples. |
| R4 | **approve** | none | `789d87a` | C2 cluster CONVERGED. No HIGH/CRITICAL findings. |

### Cluster C5 convergence (Codex) — UNBLOCKED + CONVERGED

Base: `2574061` (post-M9-close-out). Assets sourced from canonical origins (FXAV wordmark from fxav.net Wix CDN; Google G + full Sign In button SVG from Google's official signin-assets.zip). 4 rounds to approve.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | **block** | BLOCKER button on FXAV-accent violates Google brand guide; HIGH wordmark `aria-hidden` hides primary identity; HIGH wordmark squashed by `size-24`; MED 176KB PNG; MED source-grep tests only | `568ee65` | Button restyled as Google "Light" theme (white surface + #1f1f1f text + #747775 border + h-10 + gap-3). Wordmark gets `alt="FX Audio Visual"`, `w-24 h-auto`. PNG resampled to 192×205 / 30KB via `sips`. New jsdom test asserts Light-theme classes + negative-asserts the previous FXAV-accent variant. |
| R2 | needs-attention | HIGH G effective size ~10×10 (rendered the 40×40 tile asset at 20×20 — actual G inside shrunk proportionally); HIGH focus-ring orange ~1.6:1 on white (below WCAG 3:1) | `684c282` | Switched to Google's full text-bearing button SVG `web_light_rd_SI.svg` (native 175×40); the wrapping `<button>` becomes a thin focus-ring container; focus ring uses Google Interaction Blue `#1a73e8` for ≥3:1 contrast. |
| R3 | needs-attention | HIGH wrapper button only 40px tall — below DESIGN.md §3 44px tap-target floor + WCAG 2.5.5 | `f45acbc` | `h-10` → `min-h-tap-min`. SVG image stays 175×40; wrapper extends the hit area via transparent padding. New test asserts the floor is present + negative-asserts `h-10` alone. |
| R4 | **approve** | none | `f45acbc` | C5 CONVERGED. |

Assets pinned in tests:
- `public/brand/fxav-wordmark.png` — 192×205 PNG (resampled from fxav.net's 1554×1661 source).
- `public/brand/google-signin-button.svg` — verbatim copy of Google bundle's `web_light_rd_SI.svg` (175×40, Light theme, all four Google brand colors verified).

### Cluster C6 convergence (Codex)

Base: `a6446d4` (C5 deferred-record SHA). 3 sub-tasks + 3 rounds to approve.

Sub-tasks shipped:
- **M7-D5** (`75f753c`): `shouldHideDiagrams` helper extracted to `lib/visibility/emptyState.ts`; DiagramsTile consumes it; 7 unit tests.
- **M7-D2** (`b49275c`): AgendaPdfViewer onLoadError → HEAD-probe → `messageFor` routing for 410/401/other; 4 new error-routing tests.
- **M7-D1** (`f2d3a08`): GalleryLightbox `motion.div` with opacity 0→1 + scale 0.96→1 entry, reversed exit; reduce-motion gate via existing `prefersReducedMotion` state; `AnimatePresence` wrap in Gallery.tsx.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 403 unrouted; M1 retryable fallback used inline literal | `f074221` | 403 + 410 both route to AGENDA_GONE_FOR_CREW per spec line 2753; unknown / network failures route to AGENDA_ASSET_LOOKUP_FAILED. |
| R2 | needs-attention | M1 inline literal rendered during async HEAD-probe pending window | `205f84d` | Default rendered copy switched to `messageFor(errorCode ?? "AGENDA_ASSET_LOOKUP_FAILED").crewFacing` — no transitional uncataloged string. |
| R3 | **approve** | none | `205f84d` | C6 cluster CONVERGED. |

### Cluster C6b convergence (Codex)

Base: `205f84d` (C6 close SHA). 3 rounds to approve.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | **block** | P0 next/image breaks auth + cache; P1 runtime onError missing; P2 sizes too aggressive | `22623ad` | REVERTED next/image migration; added Gallery `<img onError>` → unavailable placeholder; M7-D3 stays deferred. |
| R2 | needs-attention | H1 Lightbox missing symmetric onError; H2 no Gallery onError regression test; M1 DEFERRED.md stale | `1a5a297` | Lightbox got the same `failedKeys` + onError pattern; Gallery test asserts the flip; DEFERRED.md M7-D3 has 2026-05-13 close-out subsection. |
| R3 | **approve** | none | `1a5a297` | C6b CONVERGED. M7-D3 stays deferred (next/image requires private-image-pipeline + custom loader). |

### Cluster C6c (RESOLVED — implemented 2026-05-13, pending adversarial review)

C6c / M7-D4 (lightbox pinch-zoom) was un-deferred 2026-05-13 after research revised the risk assessment. Original deferral hypothesis: "needs real-device gesture testing for Embla+pinch coordination + iOS Safari touch-action arbitration." Revised: mature library (`react-zoom-pan-pinch`) handles cross-browser quirks (millions of weekly downloads, iOS Safari blur fixes baked in); Playwright supports synthetic-pinch via CDP multi-touch; only iOS-Safari-specific `touch-action` arbitration genuinely requires a real iPhone for verification (~5 min smoke).

**Shape session:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-13-pinch-zoom-lightbox.md` (confirmed by user 2026-05-13). 14 design decisions baked: scale=4× max, single-finger pan disables Embla swipe at scale>1, reset-on-diagram-change (per-diagram zoom context), Reset chip neutral chrome centered above figure, double-tap toggles 1↔2, full desktop parity (trackpad/cmd-scroll/drag), reduced-motion = no momentum/interpolation but pinch works, etc.

**Implementation discoveries (documented in brief §10a/§10b):**
- `react-zoom-pan-pinch` v4.0.3 has NO `keyEvents` prop. Lightbox owns all keyboard (`Escape` close, `0` reset, `+/=` zoom in 0.5x, `-/_` zoom out 0.5x, arrows navigate diagrams). Arrows-pan-when-zoomed (originally specced) is dropped; arrows always navigate (auto-reset via chevron handlers). Trade-off: keyboard-only users zoom via `+/-`, pan via mouse/touch only. Acceptable for the touch-driven crew persona.
- Playwright synthetic multi-touch deferred to manual iOS device smoke; no existing diagram-lightbox e2e fixture exists and CDP plumbing is significant scope. 16 jsdom unit tests pin the lightbox's contract surface (state machine, chrome, keyboard, library prop bag).

**Test surface:** `tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx` (26 tests, all passing). Covers TransformWrapper prop contract (min/max/doubleClick/pinch/smooth/velocity), Reset chip visibility tracking scale (with 1.01 noise threshold), live-region announcements ("Zoomed in, Nx" / "Zoomed out" / initial-silent), chevron auto-reset, keyboard map, touch-action posture. Includes a vi.mock of react-zoom-pan-pinch with controlled scale simulation.

#### C6c close-out — impeccable §12 dual gate

**`/impeccable critique`** (UX heuristic review). Verdict: 2 HIGH, 3 MEDIUM. Dispositions (per AGENTS.md invariant 8: every HIGH/CRITICAL UI-gate finding is fixed or recorded as a `DEFERRED.md` entry):
- **HIGH-1 pinch discoverability hint** → DEFERRED via `DEFERRED.md` entry `M9-D-C6c-1`. Rationale: pinch is gesture-universal on mobile (iOS Photos teaches the convention); Reset chip handles the "stuck" case (scale>1). Persistent hint would compete with the page indicator in already-tight header chrome. No user-research signal that discoverability is actually a barrier; revisit if venue-floor crew feedback identifies pinch-discovery friction.
- **HIGH-2 live-region "Zoomed to 2.0×" reads like debug + silent on de-zoom** → ACCEPT. Rewrote to "Zoomed in, Nx" + announce "Zoomed out" on the de-zoom transition. wasAnnouncedZoomedRef gates the initial-state silence so AT doesn't get a "Zoomed out" announcement on first mount.
- **MED-3 Reset chip reflows the figure ~52px** → ACCEPT. Moved chip from the dialog's flex column to absolute-positioned INSIDE the relative image container (`inset-x-0 top-2`). Figure no longer reflows when chip mounts; the user's pinched-detail stays under their fingers.
- **MED-4 arrows-always-navigate undocumented** → DECLINE. Documented in shape brief §10a; low-frequency edge case (desktop keyboard user who zooms with `+` then hits arrow); recoverable (re-zoom on new diagram).
- **MED-5 Reset chip chrome reads identical to chevrons** → ACCEPT. Added `border border-border-strong` so chip earns visual primacy over neutral chevrons when active.

Anti-patterns verdict: clean. No glassmorphism beyond project-canonical `bg-bg/95 backdrop-blur-sm`, no gradient text, no hero-metric, no side stripe. Modal is the canonical image-viewer exception.

**`/impeccable audit`** (technical quality). Audit health: 15/20 (Excellent band starts at 18). Dispositions:
- **P1-A focus loss on chip unmount when chip was focused** → ACCEPT. Chip onClick moves focus to closeRef BEFORE calling resetTransform — otherwise focus falls to document.body and the user has to Tab back into the dialog.
- **P1-B two `aria-live="polite"` regions compete (page indicator + zoom region)** → ACCEPT. Removed `aria-live="polite"` from page indicator (slide change is user-initiated via labeled chevron; the announcement was redundant). Zoom region remains the only polite region.
- **P1-C `window` keydown listener escapes dialog focus context** → ACCEPT. Non-Escape keys (`0`, `+/-`, arrows) now gated by `dialogRef.current?.contains(document.activeElement)`. Escape always closes regardless (canonical dismiss contract).
- **P2 live-region timer-ref rot** (dual refs tracking the same handle) → ACCEPT. Dropped outer `liveRegionTimerRef`; rely on effect-local handle + cleanup.
- **P2 Embla reInit rapid-pinch collision risk** → DECLINE. Hand-driven gesture won't oscillate at sub-ms rates; boundary-cross gate already minimizes reInit frequency.
- **P2 `wrapperClass !important` fragility across library upgrades** → DECLINE. Manual smoke + pin to v4.0.3 in package.json. Would benefit from a Playwright dimensional-invariant test if/when a diagram-lightbox e2e fixture is added.
- **P2 Reset chip touch target** → No action — reviewer confirmed `min-h-tap-min` + `px-4` + "Reset" text ≈ 80×44px is fine.

Both gates pass with all HIGH/CRITICAL/P1 findings either fixed or explicitly dispositioned. Files touched: `components/diagrams/GalleryLightbox.tsx`, `tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx`, `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-13-pinch-zoom-lightbox.md`, `package.json` + `pnpm-lock.yaml` (added `react-zoom-pan-pinch@4.0.3`).

#### C6c convergence (Codex)

Base: `2ab3896` (the commit before the C6c initial scaffold). 11 rounds to approve. Mostly library-contract HIGH issues (R1, R4, R5, R6, R7, R8, R9, R10) reflecting the depth of integration with `react-zoom-pan-pinch@4.0.3`.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 panning defaults to enabled → intercepts Embla swipe at scale=1; H2 wheel without activationKeys zooms on plain scroll | `6852119` | `panning.disabled={!zoomed}` + `wheel.activationKeys=["Control","Meta"]` |
| R2 | needs-attention | H1 image-error mid-zoom strands the lightbox (chip+watchDrag stuck); H2 invariant 8 HIGH-1 DECLINE missing DEFERRED.md entry | `df1221a` | onError → resetTransform + setActiveScale(1) + setFailedKeys; added `M9-D-C6c-1` to DEFERRED.md |
| R3 | needs-attention | H1 reduced-motion still got animated zoom (library defaults 200/300ms); M2 R2 test was tautological; M3 onError focus loss on chip-focused path | `f4bbe16` | ZoomController threads animTime=0 under reduced motion; libState.silenceResetTransform flag; onError focus relocation |
| R4 | needs-attention | H1 wheel.activationKeys array form is AND'd (`keys.every`) — required holding both Ctrl AND Cmd | `7b67415` | Switched to predicate `(keys) => keys.includes("Control") \|\| keys.includes("Meta")`; preemptive sweep added zoomAnimation.disabled + autoAlignment.disabled under reduced motion |
| R5 | needs-attention | H1 doubleClick mode='toggle' uses library's exp math (1→2.718, 4→1.47 not reset); M1 TransformComponent contentClass left at fit-content, large images render at intrinsic size on active slide | `55b3362` | Dynamic doubleClick.mode based on zoomed state (`zoomIn` @ scale=1 / `reset` @ scale>1); contentClass `!size-full ...`; img className `size-full object-contain` |
| R6 | needs-attention | H1 keyboard +/- passed step=0.5 to library's zoomIn/zoomOut whose math switches between exp (smooth=true) and additive (smooth=false) — produces 1.65x/1.5x depending on motion mode | `1ccbc2b` | Bypassed library zoomIn/zoomOut: added `setScale(target)` that calls `setTransform(currentX, currentY, clamped, animTime)`; mock + tests rewritten to setTransformCalls |
| R7 | needs-attention | H1 setTransform carries stale pan offsets through scale changes — 4x→1x via keyboard left image translated off-screen; library's setTransform doesn't apply limitToBounds | `0f4c4fd` | Replaced setTransform with `controls.centerView(target, animTime)`; added `centerZoomedOut={true}` defense-in-depth; mock + tests rewritten to centerViewCalls |
| R8 | needs-attention | H1 keyboard targets read from activeScale (animation frames) instead of last requested target — rapid '+ +' during 200ms animation produced 1.12+0.5=1.62 instead of 1.5+0.5=2.0 | `b87d92d` | `requestedScaleRef` tracks last user intent; gesture-end callbacks (`onPinchStop`/`onZoomStop`/`onWheelStop`) sync ref; reset paths reset it; added simulateGestureEnd test helper |
| R9 | needs-attention | H1 onPinchStop fires with transient out-of-bounds scale during pinch normalization (e.g., 0.6 below minScale=1 via zoomAnimation.size padding); H2 test header lied about a Playwright spec | `1f335c7` | Clamp captured scale to [1,4] in all three stop handlers; rewrote test header to reflect actual coverage shape (no Playwright e2e) |
| R10 | needs-attention | H1 doubleClick.step=ln(2) only correct under smooth=true; smooth=false swaps to additive math → 1+ln(2)=1.693x instead of 2x | `c7fde29` | Step swaps with motion mode: `prefersReducedMotion ? 1 : Math.LN2` so both produce 2.0 exactly; added reduced-motion regression test |
| R11 | **approve** | none | `c7fde29` | C6c CONVERGED. 11 rounds total. 8 library-contract HIGHs converged into a thoroughly-audited integration. Lint passed in Codex's sandbox; Codex couldn't run Vitest due to sandbox EPERM but the harness-side run is 43/43 green. |

Test surface at close: **43 jsdom unit tests** covering prop contract (15+), Reset chip visibility tracking scale, live-region debounced announcements, chevron auto-reset on navigate, image-error focus relocation, keyboard map (Escape/0/+/=/-/_/arrows), TransformComponent contentClass shape, requestedScaleRef vs activeScale separation, gesture-end clamping at minScale/maxScale, reduced-motion math swaps (full-motion exp vs reduced additive). Real-browser pinch-gesture verification remains the manual iOS-Safari device smoke documented in shape brief §11 + §14 + the no-Playwright rationale in §10b.

Final commit: `c7fde29` (C6c R10 fix). M7-D4 marked **RESOLVED 2026-05-13** in DEFERRED.md.

### Cluster C7 convergence (Codex)

Base: `9a44bc8` (C6b close SHA). 3 rounds to approve.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 ReportModal GENERIC_NETWORK_COPY unannotated; H2 meta-test too narrow; M1 file-scoped exemption; M2 BOOTSTRAP_GENERIC catalog gap | `6d7c751` | Annotated ReportModal; broadened regex (3 patterns); callsite-scoped exemption (±3 lines); BOOTSTRAP_GENERIC tracked in DEFERRED.md. |
| R2 | needs-attention | M1 multi-line const regex missed multi-line declarations (silently hiding what it was meant to govern) | `72a160b` | Regex extended to match `const NAME_(COPY/MESSAGE/ERROR) = $`; ReportModal annotation moved within ±3 lines of declaration. |
| R3 | **approve** | none | `72a160b` | C7 CONVERGED. |

### Cluster C8 convergence (Codex)

Base: `72a160b` (C7 close SHA). 3 rounds to approve.

Five batched P2/P3 a11y items per DEFERRED.md M5-D6:
- **#1** ErrorExplainer `<details>` UA marker hiding (list-none + WebKit + Firefox + Safari)
- **#2** SignInButton aria-describedby — JUSTIFIED SKIP (file shrunk to 26 lines; inline error lives at page level with role="alert")
- **#3** AlertBanner aria-atomic="true"
- **#4** Bootstrap stable aria-live wrapper for state-transition region
- **#5** sign-in page <header aria-labelledby> tied to <h1 id>

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | **block** | P0 no tests for new contracts; P2 nested aria-live + role=alert double-announces; 2× P3 cosmetic | `890103c` | NEW tests/a11y/c8-batch.test.tsx (4 tests); Bootstrap inner role="alert" removed (P2). P3 chevron + landmark wording deferred. |
| R2 | needs-attention | P1 tests were source-regex too brittle (comment confusion + attribute-order + substring bugs) | `15e3389` | Tests strengthened with `stripComments` helper + attribute-order-independent matching + `\sid="..."` boundary to avoid `data-testid` substring confusion. 7/7 pass. |
| R3 | **approve** | none | `15e3389` | C8 CONVERGED. |

### Cluster C1 convergence (Codex)

Base: `db393a6` (C8 close + housekeeping). 4 implementation commits + 5 fix commits across 8 rounds (one initial APPROVE, then a follow-up Next.js bump + 1 LOW finding cycle).

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 travel_out_day map promotes PackList instead of Transport; M1 TODAY layout uses selected count not rendered count | `afbcb8c` | Aligned phase map with shape brief; added visibility-aware filter to derive todayTiles from actually-renderable set. |
| R2 | needs-attention | H1 TODAY PackList visibility doesn't match render predicate (pullSheet null/empty); M1 Header renders empty eyebrow when client_label absent | `c68a60b` | packListVisibleForToday composed from (pullSheet !== null) AND (length > 0) AND isPackListVisibleToday; Header eyebrow gated on truthy client_label + 1 new test. |
| R3 | needs-attention | H1 TODAY-band layout invariant not covered by active browser test (M4-D6 viewport pin landed inside test.describe.skip; no active TODAY stretch assertion) | `6a409c3` | Active layout-invariants e2e suite added; surgical Next 16 strict-validator fix split GET/POST handlers in `app/api/cron/report-reaper/route.ts` + `app/api/report/route.ts` (private deps-injectable + clean wrapper); meta-test registry updated; MS_ONLY env-guard added to playwright.config to elide other webservers for the manually-pre-built run. |
| R4 | needs-attention | M1 R3 TODAY stretch test only runs the mobile/single-tile path; sm:>=640px 2-tile branch never exercised | `b4bc55f` | New "TODAY sm:grid-cols-2 stretch" test forces travel_in_day via temporary dates mutation + temporary transport driver_name = test viewer's name; restores in afterAll; asserts 2 tracks, equal heights, equal widths. Five debugging discoveries baked into setup comments (schema_phases JSONB nesting, hasFullDates showDays gate, show timezone vs UTC, admin email maps to crew row, dev-mode font hang). |
| R5 | needs-attention | M1 TODAY transport admin error-fallback path missing from visibility predicate; L1 R4 width assertion doesn't prove tiles+gap=parent | `b694bff` | Extracted `transportVisibleForToday` helper (lib/show/selectTodayTiles.ts) ORing canonical `transportTileVisible` with `(isAdmin && tileErrors.transportation)`; 5 truth-table tests cover the composition; R4 e2e extended with columnGap-sum assertion. Also added DEFERRED.md M9-D-C1-2 documenting the dev-mode font hang. |
| R6 | **approve** | none | `b694bff` | C1 CONVERGED (initial). No material blocker found. |
| (bump) | n/a | n/a | `889347a` + `6ef820f` | Next.js 16.0.0 → 16.2.4 (resolves M9-D-C1-2 — dev-mode font hang fixed via PR #92713 / reqwest v0.13.2). MS_ONLY guard removed; e2e suite runs under default playwright command path (3/3 pass in 1.1min). Side-fix: added `.claude/**` to eslint globalIgnores (worktree double-scan was OOMing bare `pnpm lint`). |
| R7 | needs-attention | L1 DEFERRED M9-D-C1-2 entry internally contradictory (resolution note says RESOLVED but body still describes MS_ONLY workaround as current) | `79da5b2` | Collapsed stale "Current workaround" / "Why deferred" / "Likely fix" / "Trigger to remove" sections into a single "Historical workaround (no longer required as of commit 889347a)" paragraph. |
| R8 | **approve** | none | `79da5b2` | C1 CONVERGED (final). |

### Cluster C3 convergence (Codex)

Base: C1 close SHA. 16 rounds. Cluster scope expanded beyond initial shape (sign-in flow + /me page + Bootstrap state machine) as adversarial review surfaced contracts not pre-specified.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1-R7 | needs-attention | sign-in DOM ordering, Bootstrap retry race + StrictMode, partition rules, venue projection | various | Phase-1 iteration on Bootstrap state machine + sign-in shape + listShowsForCrew venue field. |
| R8 | needs-attention | sign-in error block placement vs brief §5.3 | `645b092` | Adopted Codex's order (error region ABOVE secondary path "View show list") — user-authorized deviation from brief, documented in JSX comment. |
| R9 | needs-attention | venue projection test was tautological (mock returned full row regardless of select string) | `5f4f303` | De-tautologized: mock parses `shows!inner(...)` projection list and strips response to only requested fields, so dropping `venue` from production .select(...) breaks tests. |
| R10 | needs-attention | Bootstrap e2e fixtures used stale copy + DOM shape | `8d134d4` | Tests updated; new "still_working" state coverage. |
| R11 | needs-attention | /me page missed undated shows | `00ec179` | Added "Date pending" partition bucket. |
| R12 | needs-attention | partition needed strict ISO date gate + retry button disabled-during-pending | `b94dab9` | Strict YYYY-MM-DD regex + Date.parse + round-trip check. |
| R13 | needs-attention | Date.parse normalized calendar-impossible dates (e.g., 2026-02-31 → 2026-03-03) | `0f0b74c` | Round-trip via `new Date(ms).toISOString().slice(0, 10) === input`. |
| R14 | needs-attention | resolveDisplayDate not shared between partition + render | `e84b9a1` | Single helper threaded through both call sites. |
| R15 | needs-attention | `now` not threaded consistently between partition + chip math | `6114abc` | Single `now` parameter passed top-down. |
| R16 | **approve** | none | `6114abc` | C3 CONVERGED. |

### Cluster C4 convergence (Codex)

Base: `6114abc` (C3 close). 3 rounds.

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 Cancel below 44×44 tap-target; M1 two-tap state machine untested | `7c263d9` | Cancel widened with `inline-flex min-h-tap-min min-w-tap-min px-3`; 7 state-machine tests added (idle→confirm→cancel/timeout/submit, Cancel-clears-timer, resolving disabled+aria-busy, tap-target class pin). |
| R2 | needs-attention | H1 e2e still tested one-tap Resolve; M1 raisedAt 7d boundary; M2 invariant 9 destructure; M3 mock `.is()` no-op | `e19c004` | E2e two-tap update + Cancel coverage; deltaSec gate at 7d boundary; `_countData` destructure; `.is()` filter in mock + `resolved_at` fixture + exclusion regression test. |
| R3 | **approve** | M1 useFormStatus hardening (DEFERRED) | `b6e4cc1` | C4 CONVERGED. M9-D-C4-1 logged as follow-up. |

### Cluster C9 convergence (Codex)

Base: `b6e4cc1` (C4 close). 11 rounds. Largest cluster — spec amendment + migration + atomic RPCs + 3 UI files + meta-test extensions. Same-vector findings closed via successive defensive layers (RLS posture → grants → policy → atomic locking → CHECK constraints → translator whitelists → spec amendment sync).

| Round | Verdict | Findings | Fix SHA | Notes |
|-------|---------|----------|---------|-------|
| R1 | needs-attention | H1 race-prone read-then-write lockout; M1 add/re-add not idempotent; M2 atomicity CHECK accepts `revoked_at` without `revoked_by` | `bdcad05` | Atomic SECURITY DEFINER RPCs (`upsert_admin_email_rpc` + `revoke_admin_email_rpc`) under `pg_advisory_xact_lock`; tightened CHECK; dropped auth.users FKs (cascade conflicts with tightened CHECK); concurrent-self-revoke regression via spawn-based parallel psql. |
| R2 | needs-attention | **CRITICAL** authenticated non-admins can call SECURITY DEFINER RPCs directly | `32b0090` | `if not public.is_admin() then raise exception` at RPC entry; actor identity derived from `auth.uid()` + `public.auth_email_canonical()` inside SECURITY DEFINER (caller-supplied params dropped from signatures); 4 R2 CRITICAL regression tests. |
| R3 | needs-attention | H1 Server Action `getActorUid()` swallows getUser errors → silent mutation / false invalid_email | `8bb2c9d` | Removed redundant getActorUid; both actions call requireAdminIdentity() directly → AdminInfraError propagates; 5 R3 regression tests + 2 meta-test rows. |
| R4 | needs-attention | H1 admin_emails has RLS policy but no GRANT to authenticated → permission denied before RLS | `ab726a5` | Added `grant select, insert, update, delete to authenticated` + grants test. |
| R5 | needs-attention | H1 translator masks impossible statuses as success (false-success revoke under schema drift) | `de59059` | Per-RPC status whitelists (UPSERT_STATUS_SET / REVOKE_STATUS_SET); default arm throws AdminEmailsInfraError; 6 schema-drift defense tests. |
| R6 | needs-attention | H1 non-email strings can be inserted as active rows → defeat last-admin lockout | `7393628` | `admin_emails_email_shape` CHECK regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`; RPC validates shape AND table CHECK; 3 regression tests. |
| R7 | needs-attention | H1 direct PostgREST table writes bypass RPC safety gates (an admin can self-mutate without lock / auth.uid() / lockout) | `c8281a9` | Revoked INSERT/UPDATE/DELETE from authenticated; SELECT-only grant + FOR SELECT policy; 3 direct-write denial tests. |
| R8 | needs-attention | H1 amendment §5.3 still canonized FOR ALL policy (R7 drift); M1 RevokeRowButton stuck in "Revoking…" on lockout result | `4155d01` | Amendment §5.3 rewritten to R7 SELECT-only shape with "Ratified post-R7" callout; derived-state pattern `refused = result && result.kind !== "ok"` snaps UI back to idle; 2 lockout-reset tests. |
| R9 | needs-attention | H1 amendment §5.1 still showed pre-R1 schema (FKs + loose CHECK); M1 R8 derived guard permanently overrode UI → retry-after-refusal stuck | `ddc066a` | Amendment §5.1 rewritten with R1/R6 schema (no FKs, tightened CHECK, email_shape); guard refined to `ui === "resolving"` so snap fires once per resolving→refused transition; retry-after-refusal test. |
| R10 | needs-attention | **CRITICAL** `/impeccable critique` + `/impeccable audit` dual gate not run on new UI surfaces | `e87f8db` | Cannot invoke `/impeccable` from implementer; logged as DEFERRED.md M9-D-C9-1 ("PENDING USER ACTION, not declined") with explicit resolution path. |
| R11 | **approve** | none material | `e87f8db` | C9 CONVERGED for code quality. Impeccable dual-gate is the one remaining user-action step. |

---

## M9 close-out summary

**Clusters converged (APPROVE):** C0 (R11), C2 (R4), C5 (R4), C6 (R3), C6b (R3), C6c (R11), C7 (R3), C8 (R3), **C1 (R8)**, **C3 (R16)**, **C4 (R3)**, **C9 (R11)**. **12 clusters / ~99 rounds total** — full M9 routed inventory converged in adversarial review.

The four largest sub-shape-required clusters (C1/C3/C4/C9) converged in the autonomous-push session 2026-05-15→2026-05-17:
- **C1 (Crew-page IA)** — 8 rounds + a Next.js 16.0.0 → 16.2.4 bump that resolved the dev-mode font hang documented as M9-D-C1-2 (resolved at SHA `889347a` / `6ef820f`).
- **C3 (Auth flow + /me page + Bootstrap)** — 16 rounds. The longest single cluster — Bootstrap state machine retry semantics under StrictMode + the /me partition rules (ISO date gate, calendar-impossible date rejection, undated bucket, shared `now`) drove most of the iteration.
- **C4 (AlertBanner queue + Resolve confirm + raised_at)** — 3 rounds. One MEDIUM follow-up (`useFormStatus` hardening for failure-path recovery) logged as M9-D-C4-1 — **RESOLVED 2026-05-17 in commit `c195747`** during final close-out (see §"Final M9 close-out actions" below).
- **C9 (Admin allow-list runtime-mutable)** — 11 rounds. Resolved 1 CRITICAL + 9 HIGH + 4 MEDIUM findings. Same-vector recurrence rule fired three times (RLS posture, then translator robustness, then spec-amendment text drift) and each time closed with a structural defensive layer. The impeccable critique + audit dual gate (logged as M9-D-C9-1) was **RESOLVED 2026-05-17 in commits `4e438b0` + `72af2f1`** during final close-out.

**Tracked residuals (1):** M7-D3 (Diagrams gallery `<img>` → `next/image`) RE-DEFERRED at C6b — the migration attempt at commit `d433c32` was reverted at `22623ad` after Codex returned BLOCK with a P0 (`/_next/image` doesn't forward auth cookies + rewrites private Cache-Control). Adoption requires a private-image-pipeline brainstorming session. All other M9-routed deliverables shipped at APPROVE OR closed-as-RESOLVED in DEFERRED.md.

**Open spec-amendment debt (flagged across the convergence loops):**
1. PARSE_ERROR_LAST_GOOD spec line 2721 markdown emphasis typo (`_<time>\*.` vs `_<time>_.`) — propagated to catalog per AGENTS.md §1.7; flagged for future spec-amendment session.
2. BOOTSTRAP_GENERIC catalog code — single catch-all for the multiple §A redeem-link error codes the Bootstrap state machine collapses; current GENERIC_ERROR_COPY inline literal carries `not-subject:M5-D8` annotation.
3. Network-failure catalog code — ReportModal's GENERIC_NETWORK_COPY ("Couldn't reach the server…") has no §12.4 row for client-side network unreachable; annotated `not-subject:M5-D8`.

**Convergence trajectory by cluster:** C0 11×R, C1 8×R, C2 4×R, C3 16×R, C4 3×R, C5 4×R, C6 3×R, C6b 3×R, C6c 11×R, C7 3×R, C8 3×R, C9 11×R. Findings narrow within each cluster; round counts vary by surface complexity and same-vector recurrence (C0/C3/C6c/C9 all hit the rule and closed via structural defensive layers per memory `feedback_class_sweep_must_be_code_shape_not_name_list`).

### Final M9 close-out actions — COMPLETED 2026-05-17

1. **`/impeccable critique` + `/impeccable audit` ran cleanly on C9 UI** (commits `4e438b0` + `72af2f1`). Both gates returned no HIGH/CRITICAL after dispositions; detector `[]` on both passes. See §12 above for full findings tables.
2. **DEFERRED.md M9-D-C9-1 moved to RESOLVED 2026-05-17.**
3. **M9-D-C4-1 (`useFormStatus` hardening for ResolveAlertButton failure path)** also resolved — commit `c195747`. Local `"resolving"` UiState removed; pending state now derived from `useFormStatus().pending` inside a ConfirmRow child of the parent form. Regression test pins the previously-stuck failure-path: action returns without revalidatePath → controls re-enable instead of staying disabled forever.
4. **Whole-M9 cross-model adversarial review** ran in two rounds:
   - **R1** (commit `f669e18`): HIGH spec-integration drift — C9 amendment shipped but never folded into canonical §14.3 or 00-overview ratified-amendments index; MEDIUM admin error boundary missing (AdminEmailsInfraError surfaced as Next generic error page). Both fixed: §14.3 row retired with cross-reference, 00-overview ratified-amendments incremented to two with full C9 entry, new route-segment `error.tsx` + `ADMIN_EMAIL_LIST_FAILED` catalog row + 4 regression tests.
   - **R2** (commit pending): HIGH M2-D2 / Task 9.C9.0.5 missing — runtime RLS behavioral-parity probe (the M2-D2 closure mechanism) was never built despite C9 close-out claiming zero tracked residuals. Fixed: `tests/db/admin-rls-runtime.test.ts` (45 cells across the 21 admin_only FOR ALL tables, runtime-derived from `pg_policies`) + `admin-rls-runtime.baseline.json` (frozen baseline + zero-drift gate). M2-D2 moved to RESOLVED.

**M9 status: COMPLETED.** 12/12 routed clusters converged through adversarial review; whole-M9 review converged across R1–R5. C9 closed its impeccable dual-gate cleanly. C4's deferred hardening folded in. M2-D2 (the longest-standing residual carried since M2) closed via C9.0.5 probe.

**Tracked residuals (1):**
- **M7-D3** (Diagrams gallery `<img>` → `next/image`) — RE-DEFERRED at C6b (commit `22623ad` reverted commit `d433c32`). The next/image migration attempt failed adversarial review with a P0 — `/_next/image` doesn't forward auth cookies to the proxy route, and it rewrites `Cache-Control: private` to public. Adoption requires either a custom Next.js image loader that forwards cookies + preserves private caching, OR a different image pipeline entirely. The R4 sweep initially marked it RESOLVED in error; R5 corrected to RE-DEFERRED. The C6b commits DID close one adjacent item (runtime `<img onError>` fallback for 4xx/5xx). See DEFERRED.md M7-D3 for full context.

**All other M9-routed deferred items shipped at APPROVE OR closed-as-RESOLVED in DEFERRED.md.**
