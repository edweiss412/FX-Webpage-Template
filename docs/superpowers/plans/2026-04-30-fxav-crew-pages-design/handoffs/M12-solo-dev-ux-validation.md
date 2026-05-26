# Handoff — M12: Solo-Dev UX Validation

**Handed off:** 2026-05-26 by Eric Weiss (orchestrator: Opus 4.7 / Claude Code, session `orchestrator-m12`)
**Implementer (amendment + Phase 0+):** Opus 4.7 / Claude Code per `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/ROUTING.md` — ALL phases Opus (differs from M11.5's split-mode; M12 has no Codex-implemented surfaces).
**Adversarial reviewer:** Codex CLI (cross-CLI) via `codex-companion adversarial-review` — manual invocation by orchestrator (the `/codex:adversarial-review` slash command is not visible in this session; user authorized manual invocation 2026-05-26).
**Plan file:** `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/00-overview.md` + phases `01..07-*.md`.
**Spec file:** `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md`.
**Pre-rebase convergence:** spec ran R1–R25 (25 rounds, 2026-05-19); plan ran P-R1–P-R5 (5 rounds, 2026-05-20). Proceeded to plan-writing without formal APPROVE per user R0 authorization at §15.25.
**Post-rebase convergence:** amendment session 2026-05-26 rebased onto M11.5's picker pivot (`b4b2c38`); adversarial review resumed at R6 (= amendment R1).

---

## §0 — Amendment session context (the rebase)

M12's spec + plan tree were drafted 2026-05-19 against the **pre-pivot** M9.5 signed-link auth model. M11.5 closed 2026-05-25 ratifying a pivot to one share-token per show + identity picker + optional Google-OAuth claim — retiring `crew_member_auth`, `lib/auth/jwt.ts`, `app/show/[slug]/p/page.tsx`, `revoked_links` validation usage, and 18 catalog codes (`LINK_*` / `CSRF_*` / `ADMIN_LINK_*`). The pre-rebase M12 artifacts referenced retired surfaces in 172 places across 12 files — every plan phase file contained at least one hit; spec carried 50 hits; `04-phase0-tooling-link.md` was 100% rewrite (entire file was a JWT-mint/revoke harness).

Authoritative rebase source: [`M11.5-delta-for-m12.md`](M11.5-delta-for-m12.md). M11.5 ratified contracts inherit verbatim via delta §6.

The amendment ran as 13 commits over a single Opus implementer session on 2026-05-26:

| # | SHA | Title |
|---|---|---|
| 1 | `19762b5` | `docs(spec-m12): amendment header + §15.26 picker-pivot rebase declaration` |
| 2 | `020d572` | `docs(spec-m12): rewrite §4.2 surface bands B+C for picker pivot` |
| 3 | `a1b28a7` | `docs(spec-m12): rewrite §5.3 J3 — three-leg picker walk` |
| 4 | `d1cb235` | `docs(spec-m12): rebase §3.3 seed contract — drop crew_member_auth, add picker fixtures` |
| 5 | `7a805d0` | `docs(spec-m12): rewrite §9.1.2 tooling reference + §3.3.2 atomic master-spec amendment` |
| 6 | `3e53ff3` | `docs(plan-m12): rebase 00-overview + 01-infra for picker pivot` |
| 7 | `9ab568e` | `docs(plan-m12): rebase 03-reseed seed contract for picker fixtures` |
| 8 | `583cb1d` | `docs(plan-m12): delete Phase 0.D + renumber 05→04, 06→05, 07→06, 08→07` |
| 9 | `48fc708` | `docs(plan-m12): rebase 05-smokes + 06-matrix-walk J3 for three-leg picker walk` |
| 10 | `77687d8` | `docs(plan-m12): fold M11.5-IMP-1 + IMP-2 + IMP-4 into amendment scope` |
| 11 | `ebe4ae5` | `docs(plan-m12): cleanup 02-validation-state + spec §3 persona note + §15.26 sweep narrative` |
| 12 | `6388738` | `docs(handoff-m12): mark M11.5-IMP-1/2/4 resolved; round-06 stub; JWT_SIGNING_SECRET orphan note` |
| 13 | `481671f` | `docs(plan-m12): inline-rewrite 03-reseed pre-rebase code blocks` (pre-R6 repair) |

Net amendment diff: `b4b2c38..481671f` — 25 files changed, +1,033 / −740 lines.

---

## §1 — Spec sections in scope

- §1 Goal & scope
- §3 Persona inventory + role variants + date/stage restriction axes
- §3.3.2 `validation_state` table (M12's own DB-touching deliverable; atomic master-spec amendment per α + γ-footnote hybrid)
- §4.2 Surface bands (rebased for picker pivot — bands B + C carry the tokenized URL + 11-arm picker render arms)
- §4.3 Excluded surfaces
- §5.1 J1 — Cold-start admin via /help
- §5.2 J2 — Pending-sync triage
- §5.3 J3 — Share-link + picker crew end-to-end (three legs: rotate / epoch-reset / OAuth-claim, per user `(d)` decision)
- §5.4 J4 — Preview-as-crew double-check
- §6 Cold-start pass mechanics
- §7 Triage rubric + iteration loop
- §8 Exit gate + sign-off
- §9 Phase 0 — prod-equivalent infra setup (5 sub-phases post-amendment: 0.A / 0.B / 0.C / 0.E / 0.F; Phase 0.D deleted)
- §15.26 Amendment audit-trail entry (rebase declaration; consolidated stale-citation paragraph)

---

## §2 — Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (every code-producing task: failing test → minimal impl → passing test → commit).
- [x] **Per-show advisory lock** — validation tooling RPCs (`mint_validation_fixture_atomic` + `validation_finalize_all_atomic`) hold `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` per AGENTS.md invariant 2.
- [x] **Email canonicalization at boundary** — `lib/email/canonicalize.ts` is the only normalization helper; validation tooling canonicalizes BEFORE the RPC write, never inline via SQL. Test extension lands in `tests/cross-cutting/email-canonicalization.test.ts` (R5 amendment).
- [x] **No global cursor** — M12 doesn't touch sync.
- [x] **No raw error codes in UI** — every UI surface (Phase 1 walks) reads through `messageFor()`; verified during matrix walk.
- [x] **Commit per task** (conventional-commits `<type>(<scope>): <summary>`; scopes: `validation`, `db`, `master-spec`, `signoff`, `spec-m12`, `plan-m12`, `handoff-m12`).
- [x] **UI quality gate (impeccable v3)** — applies to M11.5-IMP-2 picker-show-strip + M11.5-IMP-4 DESIGN.md contrast rows folded into amendment scope as Phase 0.A.2 + 0.A.3; external attestation per `feedback_impeccable_external_attestation_required`.
- [x] **Supabase call-boundary discipline (AGENTS.md invariant 9)** — every Supabase call in validation tooling destructures `{data, error}`; registered in `tests/auth/_metaInfraContract.test.ts`.

M12-specific invariants layered on AGENTS.md (per `00-overview.md` §"Plan-wide invariants"):

- **No exercise-time per-cell artifact** (spec §8.1 + §11.3.1) — `SIGN-OFF.md` paragraph is the only required exercise output.
- **MATRIX-INVENTORY.md is plan-time, not exercise-time** (spec §4.1.1).
- **Validation tooling target-consistency** (spec §3.3 + §5.3 + §9.1.2) — every CLI rejects localhost/127.0.0.1/::1 (without `--allow-local-override`) and stamps `seeded_supabase_project_ref`.
- **Singleton + drift-safe DDL for `validation_state`** (spec §3.3.2) — keyed by `key = 'validation_seed'`; idempotent + enum-drift-safe + type-drift-fail-loud.
- **Atomic master-spec amendment** (spec §3.3.2 step 3) — Phase 0.B is ONE PR: migration + script + master-spec §4.3 + §4.1 + admin-tables generator regen + AC-2.5 update + test baseline updates.
- **Walk-session gate before every walk** (spec §3.3 step 5) — `pnpm validation:check-seed` runs before initial sweep, before each targeted re-exercise, and before final sweep.
- **Default-up triage** (spec §7.1) — borderline classifies UP (MUST > SHOULD > NICE).
- **Final-sweep zero-MUST gate** (spec §7.2 step 7) — sign-off requires CLEAN final sweep.

---

## §3 — Amendment scope decisions (user-ratified 2026-05-26)

| Decision | Resolution | Rationale |
|---|---|---|
| Spec-vs-plan-vs-both amendment | **BOTH.** Spec ratified as §15.26 amendment header; plan-only edit would leave plan contradicting AGENTS.md invariant 7 at 50 cites. | The picker-pivot rebase is structural; spec is canonical. |
| J3 picker-pivot shape | **Option (d) comprehensive.** Three legs: (a) admin rotates share-token → iPhone reload hits `PICKER_SHOW_UNAVAILABLE` per M11.5 R2 → admin gives new URL → iPhone re-picks; (b) admin resets picker-epoch → iPhone reload surfaces `epoch_stale` (R6 correction; was originally drafted as `identity_invalidated/session_mismatch`) → iPhone re-picks; (c) Google-OAuth claim path via `claim_oauth_identity` exercising H8 doc-guard's two-reasons `identity_invalidated` contract. `validateNextParam` slug-only-rejection inlined as a band-C row, NOT a J3 leg (routing-time reject, not a journey). | Covers the picker-pivot's whole negative-auth surface; mirrors the discipline of pre-rebase J3's three legs. |
| Implementer routing | **Separate Opus implementer session**, spec + plan tree sequential. | Spec amendment is code-producing per TDD-and-commit-per-task; orchestrator session has M11.5 context warm but separation gives clean diff. |
| Master-spec amendment posture | **α + γ-footnote hybrid.** §4.3 prose bumps 21→22 + adds footnote noting live `ADMIN_TABLES.length = 18 = 22 − 4 dropped` per M11.5 `removedByPickerPivot` filter. 4 dead `CREATE TABLE` blocks in §4.1 PRESERVED (M11.5 supersession posture). `tests/db/admin-rls-runtime.test.ts:112` bumps 17→18; live track is parity-true. | M11.5 deliberately chose supersession-by-picker-spec over master-spec body edits; M12 honors that. Cleaning the 4 dead tables would be scope expansion into a master-spec rewrite. |
| Phase 0.D | **DELETED entirely** (option β). Admin UI's `CurrentShareLinkPanel` + `ShareLinkCopyButton` + `RotateShareTokenButton` + `ResetPickerEpochButton` are the canonical share-link interface; no CLI parity in M12. Files renumbered: old `05`/`06`/`07`/`08` → `04`/`05`/`06`/`07`. | Solo-dev IS the admin for every walk session; CLI parity for one-time share-URL reads is overkill. |
| Stale test-file paths | **Silent rewrite + consolidated §15.26 paragraph.** `tests/db/rls.test.ts` cites dropped (file doesn't exist); `tests/cross-cutting/auth.test.ts` cites dropped (file doesn't exist); `tests/db/admin-rls-runtime.test.ts` corrected from claimed-7-refs to live-4-refs (lines 4/21/111/112). | Amendment IS the fix; consolidated paragraph in spec §15.26 documents the class for future readers. |

### Carry-over triage (M11.5 DEFERRED items)

- **AMENDMENT scope** (folded into Phase 0.A.1/0.A.2/0.A.3; DEFERRED.md entries marked RESOLVED at SHA `77687d8`):
  - `M11.5-IMP-1` SignInOrSkipGate reassurance footer + catalog code (Phase 0.A.1).
  - `M11.5-IMP-2` picker-show-strip + show metadata (Phase 0.A.2; impeccable v3 applies, external attestation).
  - `M11.5-IMP-4` DESIGN.md §1.2 contrast amendments (Phase 0.A.3; impeccable v3 applies).
- **EXECUTION scope** (Phase 1 / Iteration walks WILL surface; do not pre-fix):
  - `M11.5-IMP-3` /me TerminalFailure dedup (trigger: M12 touches `app/me/page.tsx`).
  - `M11.5-IMP-5` Admin Reset/Rotate polish (5 sub-items; Band A walk surfaces).
  - `M11.5-PLAYWRIGHT-HELPERS` 4 picker-shaped `.skip` scenarios (Band A walk un-skips + ports).
- **CLOSE-OUT scope** (decision deferred to M12 close-out):
  - Test-migration coda (~36h jsdom port, 12 suites). Surface options: (a) fold into close-out, (b) discrete milestone between M12 close-out and M13 kickoff.
- **UNTOUCHED:** 4 BACKLOG.md Doug-feedback-gated UX entries — promotion prerequisite is Doug-usage signals from M13+.

---

## §4 — Do-not-relitigate block

The following 23 contracts are ratified. Re-flagging any of them in any adversarial round wastes that round. Codex reviewers receive this list verbatim in every R≥6 focus prompt.

### From M11.5 close-out (delta §6 items 1–11; inherited unchanged)

1. **Picker model itself** — PRODUCT.md 2026-05-23 ratification.
2. **11-arm `resolveShowPageAccess` discriminated union**, including two-reasons `identity_invalidated` (`claimed_after_pick` + `session_mismatch`) and two-reasons `no_auth` (`first_contact` + `google_mismatch`).
3. **`__Host-fxav_picker` cookie envelope** — HMAC-signed; `MAX_SAFE_T_MILLIS = Number.MAX_SAFE_INTEGER`; UUID selection-keys; LRU eviction.
4. **`validateNextParam.ts` allowlist** `^/(show/[a-z0-9-]+/[0-9a-f]{64}|admin(/.*)?|me(/.*)?)$/` — slug-only `/show/<slug>` REJECTED.
5. **M9.5 signed-link surfaces are RETIRED** — `crew_member_auth` table dropped; `lib/auth/jwt.ts` deleted; `app/show/[slug]/p/page.tsx` deleted; 18 catalog codes deleted.
6. **H1–H8 structural meta-tests + R1/R4/R5/R6 extensions LANDED** — extensions only, no churn.
7. **Locked deployment path** — M11.5 → M12 → M13. No detours.
8. **`__Host-fxav_picker` cookie.t source** — ALWAYS RPC return `out_observed_at_millis`, NEVER `Date.now()`.
9. **Step 4(e) `GOOGLE_NO_CREW_MATCH` is TERMINAL** `no_auth/google_mismatch` — does NOT fall through to step 5.
10. **`resetPickerEpoch` uses `requireAdminIdentity()`** (NOT `requireAdmin()`) — needs admin email for `admin_email_hash` context.
11. **6 R41 admin_alert producers** per P-R26 email-posture matrix — 3 email-bearing + 3 email-less.

### M12 amendment ratifications (items 12–23; user-confirmed 2026-05-26)

12. **Exercise output is only `SIGN-OFF.md` paragraph; no per-cell tracking** (M12 spec §8.1 + §11.3.1).
13. **4 journeys are deliberate; additional journeys are sub-paths or matrix-covered** (M12 spec §5.6).
14. **Solo-dev only; Doug/real-crew NOT in this milestone** (M12 spec §1.5).
15. **Prod-equivalent without custom domain** — production-target Vercel + `*.vercel.app` URL (M12 spec §2 + §9.1).
16. **LEAD unlocks ALL THREE scope tiles unconditionally** (M12 spec §3.4.1).
17. **`dateRestriction` affects Right Now + Schedule only** — NOT scope tiles and NOT pack-list (M12 spec §3.3 R3 + §3.4.1).
18. **Pack-list visibility gated by `stage_restriction` + day-phase** (M12 spec §3.3.1 + §3.4.1).
19. **`validation_state` is M12's own admin-only deliverable**, unaffected by the picker pivot (atomic master-spec amendment per α + γ-footnote hybrid).
20. **MATRIX-INVENTORY.md is plan-time, not exercise-time** (M12 spec §4.1.1 + §11.3.1).
21. **Default-up triage** (M12 spec §7.1).
22. **Final-sweep zero-MUST gate** (M12 spec §7.2 step 7).
23. **Spec went through 25 pre-rebase rounds without formal APPROVE** per user R0 authorization (M12 spec §15.25). The amendment IS the resolution; no 26th pre-rebase round.

---

## §5 — Pre-handoff state (post-amendment, pre-Phase 0)

- [x] M11.5 closed at `b4b2c38` (2026-05-25; R7 APPROVE on whole-milestone adversarial review).
- [x] Amendment session 2026-05-26 ran 13 commits to HEAD `481671f`.
- [x] Class-sweep residual post-amendment: 92 hits across 11 files (was 187 pre-amendment); all in acceptable categories (§15.x audit trail + handoffs commentary + intentional do-not-relitigate-table naming). R6 surfaced 2 HIGH findings that the residual classification missed — see §"Convergence log" R6 row + §"Watchpoints" item 1.
- [x] Numeric consistency: 22 master-spec prose / 88 AC-2.5 / 18 live ADMIN_TABLES / 96 alias-map leaves / 4 validation CLIs / 3 VALIDATION_* env vars / 5 sub-phases / 3 J3 legs / 6+1 smokes.
- [x] Live-code citation pass verified (commit-13 implementer handback): all `lib/auth/picker/*.ts` exports + admin show-link components + crew route file + 7 RPC signatures + catalog codes + `validateNextParam.ts:18` allowlist regex.
- [ ] **Pending R6 repair (R7 not yet fired):** spec §5.3 J3 leg (b) re-target to `epoch_stale + PICKER_EPOCH_STALE_BANNER`; leg (c) restructure into c1 (`claimed_after_pick`) + c2 (`session_mismatch`); §9.2 smokes 2 + 5 + 6 + J1/J2 prose rewrite for share-token + picker model; stricter class-sweep re-categorization.
- [ ] Test commands clean at amendment HEAD: `pnpm test && pnpm lint && pnpm typecheck` — N/A (amendment is markdown-only; no test surface).

---

## §6 — Watchpoints

### From pre-rebase R1–R5 (now obsolete vector but the class lessons stick)

The pre-rebase rounds identified a **live-code fidelity / schema-invariant** vector that surfaced findings in 5 consecutive rounds (R1 through R5). The vector was declared **UNRESOLVED for per-instance patching** at R5; two structural defenses landed in the M12 plan's R5 amendment:

1. **`tests/cross-cutting/validation-tooling-tz-pin.test.ts`** (new) — greps every `.sql` migration + `scripts/validation-*.ts` for `current_date`. Each match must be inside the bounded-skew sanity check OR carry an inline `// not-validation-today-iso: <reason>` waiver. Catches future TZ-pin drift at CI time.
2. **`tests/cross-cutting/email-canonicalization.test.ts`** (extended) — adds `scripts/validation-*.ts` to audit scope; flags any `lower(...)` / `trim(...)` not adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts`.

These defenses survive the rebase. The pre-rebase R1–R5 findings on signed-link tooling are obsolete (the surfaces were deleted by M11.5).

### From amendment R6 (live)

1. **Class-sweep categorization is load-bearing.** The amendment implementer's R5→R6 handback classified the spec's 56 hits as "✅ §15.x audit-trail + §15.26 rebase narrative" — but spec §9.2 smokes 2/5/6 + §5.x journey prose are NOT §15 audit trail; they're live operational prose. R6 surfaced both classes. **Watchpoint:** any future class-sweep must distinguish (a) acceptable [§15.x audit narrative + handoffs + do-not-relitigate-table naming] from (b) live operational prose [must fix] from (c) historical-but-not-§15. If R7 still surfaces the same vector, the `feedback_recurring_bug_response` ladder applies (3 rounds → structural meta-test).

2. **J3 leg outcomes must match resolver semantics.** Pre-amendment J3 prose described outcomes the live resolver cannot produce. The resolver ordering at `lib/auth/picker/resolvePickerSelection.ts:88-143` is: epoch check (line 88-90) → roster check (line 107) → `claimed_after_pick` check (line 110-120) → `session_mismatch` check (line 122-143, only if Google session exists with mismatched email). **Watchpoint:** any future J3 amendment OR new picker-walk journey must verify expected outcomes against this ordering BEFORE drafting.

### Inherited from M11.5 (delta §6 items + carry-forward)

- **Cookie decoder unix-seconds cap** — pre-M11.5 cap of `2_000_000_000` rejected legitimate ~1.7e12 ms timestamps. **Watchpoint:** validation tooling MUST honor `MAX_SAFE_T_MILLIS = Number.MAX_SAFE_INTEGER` when reading the picker cookie.
- **Service-role bypass of `is_admin()`** — service-role clients have NO JWT; `auth.jwt()` returns NULL; `is_admin()` always returns null. **Watchpoint:** any validation-tooling RPC gated by `is_admin()` MUST be called from a cookie-bound client; `GRANT EXECUTE` should NOT include service_role.
- **Shared-device identity leak vector** — Bob's Google session + Alice's stale picker cookie. **Watchpoint:** J3 leg (c)'s c2 `session_mismatch` sub-step exercises exactly this surface; the walk procedure must set up the precondition correctly (signed-in mismatched email + cookie row for different eligible identity).

### Excluded / disagreement-loop preempts (cite the precedent if reviewer tries)

- **Master-spec body cleanup beyond §4.3 / §4.1 / AC-2.5** — out of M12 scope per do-not-relitigate item 5 + the α + γ-footnote hybrid decision.
- **JWT_SIGNING_SECRET orphan in `.env.local.example:12`** — filed to §11 future-orchestrator notes; deferred to M12 close-out tidying. NOT amendment-round scope.
- **`screenshots-drift` workflow red on `main`** — M11 Phase F infra, NOT M12 amendment scope. Tracked separately in §11.

---

## §7 — Test commands

- Unit / vitest: `pnpm test <pattern>`.
- Pre-commit per task: `pnpm lint && pnpm typecheck && pnpm test --run <changed-files>`.
- Phase 0 smoke gate (deferred to Phase 0.E close-out): smokes 1–6 (always) + smoke 7 (conditional on Band F harness disposition).
- Structural meta-tests (must remain green throughout M12): `pnpm test tests/cross-cutting/validation-tooling-tz-pin.test.ts tests/cross-cutting/email-canonicalization.test.ts tests/auth/_metaInfraContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts`.
- Amendment-era class-sweep:
  ```
  rg -c -i 'link_session|signed.link|signed link|crew_member_auth|validateLinkSession|signLinkJwt|JWT_SIGNING_SECRET|/p#t=|fragment.token|revoked_links|LINK_EXPIRED|LINK_VERSION_MISMATCH|alias_5a_lead_for_revoke|alias_5a_lead_for_query_compromise|crewMemberKey|active_signing_key_id|jwt_token_version|mint-link|revoke-link' \
    docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md \
    docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/*.md
  ```

---

## §8 — Exit criteria

- [ ] **Amendment APPROVE** — cross-CLI Codex adversarial review on the amended spec + plan tree converges to APPROVE (iterate to APPROVE or the 40-round cap per user R0 authorization).
- [ ] **Phase 0 closure** — all required smokes pass (smokes 1–6 always + smoke 7 conditional); MATRIX-INVENTORY.md band F slice committed (Phase 0.E.0); cross-CLI adversarial review on Phase 0 implementation diff converged.
- [ ] **Phase 1 closure** — full matrix walk + 4 journeys + cold-start pass complete; MATRIX-INVENTORY.md extended with bands A–E committed (Task 1.0); all findings triaged into MUST/SHOULD/NICE per default-up rubric.
- [ ] **Iteration loop closure** — all MUST-FIX items resolved (fix + cross-CLI review converged for each); final full sweep produces zero new MUST-FIX (spec §7.2 step 7).
- [ ] **Sign-off** — `SIGN-OFF.md` paragraph authored (spec §8.1). Subjective gate: "I'd be proud to show Doug."
- [ ] **Whole-milestone close-out** — fresh-eyes cross-CLI adversarial review on the entire M12 diff (separate gate from per-phase reviews per `feedback_whole_milestone_closeout_gate`) converges to APPROVE.
- [ ] **Test-migration coda decision** taken (fold-into-close-out vs separate milestone).
- [ ] **JWT_SIGNING_SECRET orphan disposition** taken (close-out tidying OR BACKLOG).

---

## §9 — Adversarial review handoff

Per AGENTS.md mandatory cross-CLI step + user R0 authorization (40 rounds, fresh-eyes per round, anchored on milestone-base `b4b2c38`):

- **Invocation:** manual `codex-companion adversarial-review --background --base b4b2c38 --scope branch "<focus text>"` by orchestrator session (the `/codex:adversarial-review` slash command is not visible; user authorized manual invocation 2026-05-26).
- **Focus text** must include: fresh-eyes posture; full §4 do-not-relitigate block (23 items inlined; memory paths invisible to Codex per `feedback_memory_files_invisible_to_codex`); REVIEWER ONLY framing per `feedback_adversarial_review_runbook`; expected output format (verdict + findings table + class-sweep observations + same-vector recurrence flag).
- **Iteration:** until APPROVE OR 40-round cap. Each round is fresh-eyes; nothing in prior rounds is load-bearing.
- **Round handoff:** entries appended inline to the convergence log below (per project convention — M11.5 / M11 / M0–M10 pattern). No per-round files.

---

## Convergence log

### Pre-rebase rounds R1–R5 (2026-05-19..23) — OBSOLETE

Five rounds of plan-tree review against the pre-pivot signed-link auth model. All findings on the live-code-fidelity / schema-invariant vector (auth tables, column names, RPC contracts, env vars) — every one of them was rendered moot when M11.5 retired the signed-link surfaces. R5 declared the vector unresolved per AGENTS.md `feedback_recurring_bug_response` ladder and landed two structural defenses (`validation-tooling-tz-pin.test.ts` + extension to `email-canonicalization.test.ts`) — those defenses survive the rebase.

The amendment session 2026-05-26 rebased onto M11.5; pre-rebase rounds are archived in git history at the pre-amendment HEADs of the deleted `round-01..05.md` files (commit `<TBD post-consolidation-commit>` records the deletion). Narrative preserved in spec §15.1–§15.25 audit-trail entries for citational continuity.

### Amendment R6 (= post-rebase R1) — 2026-05-26

- **Codex thread:** `019e643d-c3d4-78f3-8d96-110fb0dd4223`
- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `481671f` (post-amendment + commit-13 03-reseed inline-rewrite)
- **Verdict:** **needs-attention** (2 HIGH)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F1 | HIGH | `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md:523-540` (spec §5.3 J3 legs b + c) + mirror in plan `06-phase1-matrix-walk.md` Task 1.6 | **Land in R7.** Leg (b) reset says picker_epoch bump → `identity_invalidated/session_mismatch`; live `lib/auth/picker/resolvePickerSelection.ts:88-90` returns `epoch_stale` first. Leg (c) "no Google session" sub-step says no-session → `session_mismatch`; live resolver hits `claimed_after_pick` (line 110-120) first. Repair: leg (b) → `epoch_stale + PICKER_EPOCH_STALE_BANNER`; leg (c) split into c1 (`claimed_after_pick`, no-session) + c2 (`session_mismatch`, signed-in mismatched-email Google session + cookie for different eligible row). H8 two-reasons doc-guard requires BOTH reasons exercised. |
  | F2 | HIGH | spec §9.2 smokes 2 + 5 + 6 (`docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md:791-795`); same-document contradiction with §784 sequencing note; J1/J2 prose contamination | **Land in R7 with explicit class-sweep.** §9.2 cites deleted `/show/<slug>/p#t=<jwt>`, `pnpm validation:mint-link`, `VALIDATION_JWT_SIGNING_SECRET`, `active_signing_key_id`, `validateLinkSession`. §784 narrative ("share-link + picker") contradicts §791-795 ("signed-link"). Codex also flagged J1/J2 prose ("Generate a signed link", "existing signed-link sessions"). Repair: rewrite §9.2 smokes for share-token + picker via admin UI; rerun stricter class-sweep distinguishing acceptable (§15.x + handoffs + intentional naming) vs live operational prose (must fix). |

- **Class-sweep vector callout:** "live operational prose carrying retired vocabulary outside `§15` audit trail." 03-reseed had 29 hits of this class (fixed pre-R6 in commit 13 inline-rewrite). §9.2 + J1/J2 + possibly other spots have more. Codex found the class at amendment round 1; if R7 still surfaces it, `feedback_recurring_bug_response` ladder applies (3 rounds → structural meta-test). R7 must land all instances at once via class-sweep to avoid that escalation.
- **Repair commit:** pending R7 implementer dispatch.

### Amendment R7 — pending

R7 implementer-repair dispatch authored 2026-05-26 (in-chat one-paste-ready kickoff pointing the implementer at the R6 row above + the original amendment dispatch §2 do-not-relitigate + live-code citations at `lib/auth/picker/resolvePickerSelection.ts:88-143` and spec lines 784-799). Implementer's repair commits (expected 3-4) will land before R7 adversarial-review fires.

---

## §10 — Cross-milestone dependencies

- **`lib/auth/picker/*.ts`** — owned by M11.5. M12 cites by signature for spec §3.3 seed contract + §5.3 J3 expected outcomes; does NOT modify.
- **`lib/auth/requireAdmin.ts`** (`requireAdminIdentity`) — owned by M5. M12 validation tooling does not call directly; admin UI surfaces (M11.5 §F) consume it.
- **`lib/email/canonicalize.ts`** — owned by M5. M12 validation tooling canonicalizes via this helper before fixture INSERT.
- **`lib/audit/admin-tables.generated.ts`** — owned by X.6. M12 Phase 0.B regenerates to add `validation_state`; live count goes 17 → 18.
- **`scripts/generate-admin-tables.ts`** — owned by X.6 (extended by M11.5 with `removedByPickerPivot` filter). M12 Phase 0.B extends the live list to include `validation_state`; filter stays as M11.5 wrote it.
- **`tests/db/admin-rls-runtime.test.ts:112`** — owned by X.6. M12 Phase 0.B bumps `toHaveLength(17)` → `toHaveLength(18)`.
- **M11 `/help/*` pages** — hard prerequisite for M12 Phase 1 cold-start pass + Band D matrix walk. M11 must remain green.
- **M11.5 admin UI surfaces** (`CurrentShareLinkPanel`, `ShareLinkCopyButton`, `RotateShareTokenButton`, `ResetPickerEpochButton`, `PerShowCrewSection`) — load-bearing for J3 three-leg walk. M11.5 must remain green.

---

## §11 — Future-orchestrator notes

- **Memory updates** — update `~/.claude/projects/-Users-ericweiss-FX-Webpage-Template/memory/project_post_m11_deployment_path.md` (M12 row) at: (a) amendment APPROVE'd, (b) Phase 0 done, (c) Phase 1 done, (d) close-out APPROVE'd.

- **Whole-milestone close-out is its own gate** (per `feedback_whole_milestone_closeout_gate`) — separate from per-phase Codex review. Don't claim M12 done until BOTH per-phase and fresh-eyes whole-milestone APPROVE.

- **Test-migration coda decision** (~36h jsdom port, 12 suites) — surface to user at M12 close-out, NOT before. Options: (a) fold into close-out, (b) discrete milestone between M12 close-out and M13 kickoff.

- **Doug-feedback-gated BACKLOG entries** stay parked until M13+ produces real-usage signals.

- **`screenshots-drift` workflow red on `main`** (filed 2026-05-26 orchestrator) — the M11 Phase F byte-comparison CI gate is failing. Two distinct failure modes observed: (a) 2026-05-26T12:36 cron run failed at 6s during `pnpm/action-setup@v4` archive download (transient or upstream SHA rotation); (b) 2026-05-25T12:57 cron run failed at 3m36s — likely substantive screenshot byte-drift. NOT M12 amendment scope (amendment touched 0 files in `.github/`). Triage as separate thread per memory `feedback_byte_comparison_ci_gates_pin_capture_environment` — host architecture pin + Docker image pin discipline applies. Decision NOT taken at amendment time; orchestrator triages when user opens the thread.

- **JWT_SIGNING_SECRET orphan** (filed 2026-05-26 amendment implementer) — `.env.local.example:12` still carries `JWT_SIGNING_SECRET=` (empty placeholder) post-M11.5 G3 cutover, but the only production code reference is one M11-era playwright test fixture (`tests/help/playwright-config.test.ts:82`). The implementer did not touch `.env.local.example` (out of amendment scope). Orchestrator decision needed: (a) file as BACKLOG.md item ("remove JWT_SIGNING_SECRET from .env.local.example + retire the playwright-config.test.ts:82 reference"); OR (b) fold into M12 close-out tidying. Recommend (b) — small mechanical cleanup that pairs naturally with close-out's other "M11.5 supersession cleanup that M11.5 deliberately didn't do" decisions.

- **Handoff format convention** — this doc is the single milestone handoff per project convention (mirroring `M11.5-crew-auth-pivot.md`). Round-by-round audit lives inline in §"Convergence log"; per-round files (`round-NN.md`) are NOT used in this project. The pre-rebase M12 plan author had introduced a per-round-file anomaly which the consolidation commit at HEAD `<TBD>` retired.

---

## §12 — Per-phase handoff plan (Phase 0+)

Per M11 precedent (`docs/superpowers/plans/2026-05-12-user-facing-docs/handoffs/A-foundation.md` … `G-affordance-retrofit.md`), code-producing phases with their own Codex adversarial-review cycle get a per-phase handoff. Each per-phase handoff is authored **at phase kickoff** (not pre-emptively) and lives at `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/handoffs/<phase>-<name>.md`. The per-phase handoff carries: scope summary, acceptance criteria, watchpoints, test commands, sandbox/git protocol, AND its own per-phase Codex convergence log. The milestone handoff (this doc) indexes them in the table below as they land.

| Phase | Per-phase handoff path | Authored at | Scope | Status |
|---|---|---|---|---|
| 0.A — Infra stand-up | (none — no code) | — | Vercel + Supabase + Drive prod stand-up; 3 `VALIDATION_*` env vars | _pending Phase 0.A kickoff_ |
| 0.A.1 — `M11.5-IMP-1` SignInOrSkipGate reassurance footer + catalog code | `handoffs/0A1-signin-or-skip-footer.md` | Phase 0.A.1 kickoff | Catalog code add + component wire; mechanical | _pending_ |
| 0.A.2 — `M11.5-IMP-2` picker-show-strip + show metadata | `handoffs/0A2-picker-show-strip.md` | Phase 0.A.2 kickoff | Resolver shape extension + component render; impeccable v3 external attestation applies | _pending_ |
| 0.A.3 — `M11.5-IMP-4` DESIGN.md §1.2 contrast amendments | `handoffs/0A3-design-md-contrast.md` | Phase 0.A.3 kickoff | Two contrast rows + ratio computation; impeccable v3 applies | _pending_ |
| **0.B** — `validation_state` migration + atomic master-spec amendment | **`handoffs/B-validation-state.md`** | Phase 0.B kickoff | Migration + RLS + master-spec §4.3 + §4.1 + AC-2.5 (α + γ-footnote hybrid) + admin-tables generator regen + 4 live test refs (lines 4/21/111/112 in `admin-rls-runtime.test.ts`) | _pending_ |
| **0.C** — Reseed + check-seed + resolve-alias CLIs | **`handoffs/C-reseed.md`** | Phase 0.C kickoff | 3 CLIs + `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` RPCs; picker-fixture seed contract (no `crew_member_auth` UPSERT post-rebase); validation_state alias_map (96 leaves) | _pending_ |
| 0.D | DELETED 2026-05-26 (Phase 0.D = β decision) | — | — | _deleted_ |
| **0.E** — Report-fixtures harness | **`handoffs/E-report-fixtures.md`** | Phase 0.E kickoff | `scripts/validation-report-fixtures.ts` + 8-outcome materialization + MATRIX-INVENTORY.md Band F slice (Phase 0.E.0) | _pending_ |
| 0.F — Smokes | (none — manual smoke runs) | — | 6 required + 1 conditional; no code | _pending_ |
| Phase 1 — Matrix walk + 4 journeys + cold-start | (none — manual exercise) | — | ≈650-850 cells; MATRIX-INVENTORY.md extension Bands A-E (Task 1.0); informal working notes | _pending_ |
| Iteration + Final sweep + Sign-off | (per-fix entries roll up into this doc's Convergence log; no per-phase handoff) | — | MUST-FIX loop; final sweep zero-MUST gate; `SIGN-OFF.md` paragraph | _pending_ |

Three per-phase handoffs (0.B / 0.C / 0.E) carry their own per-phase Codex convergence log inside the per-phase doc. The three 0.A.* sub-phase handoffs are smaller-scope and may carry a thinner template (scope + AC + single-round impeccable v3 attestation entry). When each per-phase handoff opens, update its row above with **status = open** + author SHA + Codex thread ID; mark **status = closed** when phase APPROVE'd.

**Whole-milestone close-out** (the AGENTS.md `feedback_whole_milestone_closeout_gate` rule) is a separate gate from per-phase reviews. Its rounds land in **this doc's** §"Convergence log" — after every per-phase handoff has closed, a fresh-eyes whole-milestone Codex adversarial round fires on the full M12 diff, anchored on `b4b2c38`. M12 is not done until BOTH per-phase APPROVEs AND whole-milestone APPROVE land.
