# Handoff — M12: Solo-Dev UX Validation

**Handed off:** 2026-05-26 by Eric Weiss (orchestrator: Opus 4.7 / Claude Code, session `orchestrator-m12`)
**Implementer (amendment + Phase 0+):** Opus 4.7 / Claude Code per `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/ROUTING.md` — ALL phases Opus (differs from M11.5's split-mode; M12 has no Codex-implemented surfaces).
**Adversarial reviewer:** Codex CLI (cross-CLI) via `codex-companion adversarial-review` — manual invocation by orchestrator (the `/codex:adversarial-review` slash command is not visible in this session; user authorized manual invocation 2026-05-26).
**Plan file:** `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/00-overview.md` + phases `01..07-*.md`.
**Spec file:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md`.
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
- [x] **Email canonicalization at boundary** — `lib/email/canonicalize.ts` is the only normalization helper; validation tooling canonicalizes BEFORE the RPC write, never inline via SQL. Test extension to `tests/cross-cutting/email-canonicalization.test.ts` is **planned for Phase 0.C** per `DEFERRED.md` entry `M12-PHASE0C-EMAIL-CANON-EXT` (R5 amendment narrative had framed this extension as already-landed; R11 audit 2026-05-26 verified `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` does NOT walk `scripts/validation-*.ts`).
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

The pre-rebase rounds identified a **live-code fidelity / schema-invariant** vector that surfaced findings in 5 consecutive rounds (R1 through R5). The vector was declared **UNRESOLVED for per-instance patching** at R5; two structural defenses were **SPECIFIED** in the M12 plan's R5 amendment and are planned for Phase 0.C authoring per `DEFERRED.md`:

1. **`tests/cross-cutting/validation-tooling-tz-pin.test.ts`** (planned per `DEFERRED.md` entry `M12-PHASE0C-TZ-PIN-METATEST`) — WILL grep every `.sql` migration + `scripts/validation-*.ts` for `current_date`. Each match MUST be inside the bounded-skew sanity check (`abs(DATE_TEXT::date - current_date) > 1` — integer day comparison; the R5 narrative had cited `abs(extract(epoch from ...::date - current_date)) > 86400` but that's invalid SQL — PostgreSQL `date - date` returns INTEGER days, not interval; corrected per R11 F9 fix) OR carry an inline `// not-validation-today-iso: <reason>` waiver. Catches future TZ-pin drift at CI time once the meta-test lands.
2. **`tests/cross-cutting/email-canonicalization.test.ts`** (extension planned per `DEFERRED.md` entry `M12-PHASE0C-EMAIL-CANON-EXT`) — WILL add `scripts/validation-*.ts` to audit scope; WILL flag any `lower(...)` / `trim(...)` not adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts`. The base test exists; the extension does not (verified live at `lib/audit/emailCanonicalization.ts:693-705`).

**R11 audit (2026-05-26):** the R5 amendment narrative framed both as already-landed structural defenses. R11 audit verified neither was actually committed — the file doesn't exist for (1); the audit scope doesn't include validation scripts for (2). Both reframed to deferred posture in R11 commit 28 with concrete Phase 0.C triggers. Per-instance adversarial review remains the catch mechanism for these vectors until Phase 0.C authoring lands. The pre-rebase R1–R5 findings on signed-link tooling are obsolete (the surfaces were deleted by M11.5).

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
- Structural meta-tests (must remain green throughout M12): `pnpm test tests/cross-cutting/email-canonicalization.test.ts tests/auth/_metaInfraContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts`. (Note: `tests/cross-cutting/validation-tooling-tz-pin.test.ts` is **NOT YET COMMITTED** — see `DEFERRED.md` entry `M12-PHASE0C-TZ-PIN-METATEST`; Phase 0.C close-out adds it to this command. The `email-canonicalization.test.ts` extension to walk `scripts/validation-*.ts` is similarly deferred — `M12-PHASE0C-EMAIL-CANON-EXT` — but the base test exists and is included here. R8 `picker-resolver-outcome-prose-guard.test.ts` added per the resolver-outcome structural defense.)
- Amendment-era class-sweep:
  ```
  rg -c -i 'link_session|signed.link|signed link|crew_member_auth|validateLinkSession|signLinkJwt|JWT_SIGNING_SECRET|/p#t=|fragment.token|revoked_links|LINK_EXPIRED|LINK_VERSION_MISMATCH|alias_5a_lead_for_revoke|alias_5a_lead_for_query_compromise|crewMemberKey|active_signing_key_id|jwt_token_version|mint-link|revoke-link' \
    docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md \
    docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/*.md
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

Five rounds of plan-tree review against the pre-pivot signed-link auth model. All findings on the live-code-fidelity / schema-invariant vector (auth tables, column names, RPC contracts, env vars) — every one of them was rendered moot when M11.5 retired the signed-link surfaces. R5 declared the vector unresolved per AGENTS.md `feedback_recurring_bug_response` ladder and **specified** two structural defenses (`validation-tooling-tz-pin.test.ts` + extension to `email-canonicalization.test.ts`). **R11 audit 2026-05-26 verified neither defense was actually committed by the R5 amendment** (the R5 narrative claimed past-tense "landed" but the file does not exist in git history for the first, and `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` does not walk `scripts/validation-*.ts` for the second). The structural-defense specifications survive the rebase; authoring is deferred to Phase 0.C per `DEFERRED.md` entries `M12-PHASE0C-TZ-PIN-METATEST` + `M12-PHASE0C-EMAIL-CANON-EXT` (reframed in R11 commit 28).

The amendment session 2026-05-26 rebased onto M11.5; pre-rebase rounds are archived in git history at the pre-amendment HEADs of the deleted `round-01..05.md` files (commit `<TBD post-consolidation-commit>` records the deletion). Narrative preserved in spec §15.1–§15.25 audit-trail entries for citational continuity.

### Amendment R6 (= post-rebase R1) — 2026-05-26

- **Codex thread:** `019e643d-c3d4-78f3-8d96-110fb0dd4223`
- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `481671f` (post-amendment + commit-13 03-reseed inline-rewrite)
- **Verdict:** **needs-attention** (2 HIGH)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F1 | HIGH | `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md:523-540` (spec §5.3 J3 legs b + c) + mirror in plan `06-phase1-matrix-walk.md` Task 1.6 | **Land in R7.** Leg (b) reset says picker_epoch bump → `identity_invalidated/session_mismatch`; live `lib/auth/picker/resolvePickerSelection.ts:88-90` returns `epoch_stale` first. Leg (c) "no Google session" sub-step says no-session → `session_mismatch`; live resolver hits `claimed_after_pick` (line 110-120) first. Repair: leg (b) → `epoch_stale + PICKER_EPOCH_STALE_BANNER`; leg (c) split into c1 (`claimed_after_pick`, no-session) + c2 (`session_mismatch`, signed-in mismatched-email Google session + cookie for different eligible row). H8 two-reasons doc-guard requires BOTH reasons exercised. |
  | F2 | HIGH | spec §9.2 smokes 2 + 5 + 6 (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md:791-795`); same-document contradiction with §784 sequencing note; J1/J2 prose contamination | **Land in R7 with explicit class-sweep.** §9.2 cites deleted `/show/<slug>/p#t=<jwt>`, `pnpm validation:mint-link`, `VALIDATION_JWT_SIGNING_SECRET`, `active_signing_key_id`, `validateLinkSession`. §784 narrative ("share-link + picker") contradicts §791-795 ("signed-link"). Codex also flagged J1/J2 prose ("Generate a signed link", "existing signed-link sessions"). Repair: rewrite §9.2 smokes for share-token + picker via admin UI; rerun stricter class-sweep distinguishing acceptable (§15.x + handoffs + intentional naming) vs live operational prose (must fix). |

- **Class-sweep vector callout:** "live operational prose carrying retired vocabulary outside `§15` audit trail." 03-reseed had 29 hits of this class (fixed pre-R6 in commit 13 inline-rewrite). §9.2 + J1/J2 + possibly other spots have more. Codex found the class at amendment round 1; if R7 still surfaces it, `feedback_recurring_bug_response` ladder applies (3 rounds → structural meta-test). R7 must land all instances at once via class-sweep to avoid that escalation.
- **Repair commit:** pending R7 implementer dispatch.

### Amendment R7 — 2026-05-26

- **Codex companion job:** `bp35gpwar`
- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `6de2b35` (post-R7 repair, 6 commits: 7b49036 / f462304 / b2fe146 / 0710960 / 24069d3 / 6de2b35)
- **Verdict:** **needs-attention** (2 HIGH; same-vector recurrence with R6)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F3 | HIGH | spec §5.3 J3 leg (c) step 2 (lines 540-541) + plan `06-phase1-matrix-walk.md` Task 1.6 mirror | **Land in R8.** Step 2 prose says iPhone post-claim sees `claimed_after_pick`. Live `lib/auth/picker/resolveShowPageAccess.ts:174` calls `validateGoogleSession` BEFORE `resolvePickerSelection`; when Google matches the claimed row AND cookie pre-dates the claim, line 204-208 returns `needs_picker_bootstrap` (NOT `claimed_after_pick`). The iPhone redirects through `/api/auth/picker-bootstrap` → fresh cookie minted with `entry.t > claimEpochMillis` → `_ShowBody` renders. Repair: rewrite step 2 expected outcome to describe the bootstrap-redirect chain; reserve `claimed_after_pick` exercise for step 4 (cross-device, no Google session — already correct). |
  | F4 | HIGH | spec §4.2 Band C inventory row (line 482) | **Land in R8 with class-sweep.** Band C still describes "ResetPickerEpochButton → identity_invalidated/session_mismatch cascade" — the OLD R6-incorrect outcome. R7 commit 14 corrected J3 leg (b) to `epoch_stale + PICKER_EPOCH_STALE_BANNER` but missed this Band C peer. Class-sweep miss. Repair: rewrite line 482 to match live resolver semantics + sweep all surface-inventory prose for `reset.*session_mismatch` wording. |

- **Same-vector recurrence flag:** R6 + R7 = 2 consecutive rounds on the vector "spec/plan prose describes resolver outcomes the live ordering doesn't produce, AND surface-inventory peers aren't class-swept when J3 leg outcomes are corrected." Per AGENTS.md writing-plans "Same-vector recurrence" rule + `feedback_recurring_bug_response` + M12 plan R5 precedent (structural-defense calibration), R8 MUST: (a) include comprehensive re-analysis of the resolver-outcome citation class before patching; (b) land structural defense pre-emptively in the same commit series (do NOT wait for R9 to confirm recurrence). Defense candidate: doc-guard meta-test grepping `FORBIDDEN_PATTERNS` like `Reset.*session_mismatch`, `Rotate.*claimed_after_pick`, etc. outside `§15` audit-trail context; OR a structural test enumerating every `epoch_stale|claimed_after_pick|session_mismatch|removed_from_roster` mention in spec/plan and asserting the surrounding context cites the correct trigger.
- **Repair commit:** pending R8 implementer dispatch.

### Amendment R8 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `68c5807` (post-R8 repair: 3 commits a98e466 / e97e549 / 68c5807; comprehensive re-analysis covered 38 mentions across spec + plan tree)
- **Verdict:** **repair landed; pending R9 adversarial review.**
- **Comprehensive re-analysis (per same-vector mandate):** implementer audited every occurrence of resolver-outcome labels (`epoch_stale`, `claimed_after_pick`, `session_mismatch`, `removed_from_roster`, `no_auth/google_mismatch`, `no_auth/first_contact`, `needs_picker_bootstrap`, and the banner codes) in the M12 spec + M12 plan tree. 38 mentions audited; 3 needed repair (F3 step 2 mis-attribution, F4 Band C mis-attribution, F5 step 5 session_mismatch unreachable-from-page-route). 35 mentions verified correct against live `resolveShowPageAccess.ts:170-212` + `resolvePickerSelection.ts:39-145` ordering.
- **F5 (new finding from R8 (a) audit):** `session_mismatch` is structurally unreachable from the page-route. `validateGoogleSession` at line 174 short-circuits BEFORE `resolvePickerSelection` runs — either `GOOGLE_NO_CREW_MATCH` (lines 176-178 → `no_auth/google_mismatch`) OR a success branch that returns `needs_picker_bootstrap` for any cookie-mismatch / unclaimed-row / cookie-pre-dates-claim sub-state. The arm at `resolvePickerSelection.ts:122-143` is reachable ONLY via API callers that bypass `validateGoogleSession` (`/api/show/<slug>/version:82`, `/api/realtime/subscriber-token:97`, `/api/report:118`, `validatePickerAssetSession.ts:37`). Per orchestrator triage 2026-05-26: F5 = (α) — re-frame J3 leg (c) step 5 as `no_auth/google_mismatch` (Mode B) which IS what the dev observes from "Bob's Google session + Alice's cookie" on iPhone; add closing disclosure paragraph explaining session_mismatch API-route reachability. H8 two-reasons doc-guard contract satisfied by spec body still mentioning both reason strings (§3.3 preamble + closing disclosure).
- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 20 | `a98e466` | `docs(spec-m12): R8 repair — page-route resolver-ordering corrections (F3+F4+F5)` |
  | 21 | `e97e549` | `docs(plan-m12): R8 repair — Task 1.6 J3 mirror + Task 1.2 band-B arms` |
  | 22 | `68c5807` | `test(cross-cutting): picker-resolver-outcome-prose-guard meta-test` (TDD: RED on pre-R8 HEAD 6de2b35; GREEN on 68c5807) |

- **Structural defense (per same-vector recurrence calibration; landed in same commit series, NOT deferred to R9):** new meta-test at `tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts` greps M12 spec + plan tree `.md` files (strips `§15` audit trail; excludes `handoffs/`) for 4 forbidden-pattern sub-classes:
  - **F3-class:** `iPhone.*claim.*claimed_after_pick` (same-line within 400 chars) without `needs_picker_bootstrap` / `resolveShowPageAccess.ts:204` / "no Google session" qualifier.
  - **F4-class:** `Reset.*session_mismatch` (same-line within 200 chars) — flat-forbidden outside §15.
  - **F5-class:** bare `session_mismatch` (±5-line proximity) without an API-route qualifier (`/api/` / `auth_email_canonical` / `resolvePickerSelection.ts:122-143` / "API-route-only" / "not from page-route").
  - **Paranoia:** `\bRotate(?:ShareToken)?(?:Button)?\b.*claimed_after_pick` (word-boundary verb-noun match) — flat-forbidden outside §15.

  Implementer refined the orchestrator's spec on three axes based on observed false-positives: (i) same-line vs ±5-line proximity for F3/F4/paranoia; (ii) case-sensitive matching on resolver-union literals to avoid catching `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` catalog-code mentions; (iii) ±60-char local-chunk window for F4's acceptable-qualifier check to avoid far-away wire-arm enumerations exonerating misattributions. Refinements ratified by orchestrator 2026-05-26.

- **Doc-guard verification:** existing `tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts` confirmed unaffected by reorg + still passing against R8-repaired prose. The H8 two-reasons documentation contract is satisfied — spec body mentions both `claimed_after_pick` AND `session_mismatch` literally (§3.3 preamble + step 4 + closing disclosure paragraph). 9 FORBIDDEN_PATTERNS in the doc-guard are orthogonal to the 4 patterns in the new resolver-outcome guard (different fault families: identity-invalidated→401 fall-through vs resolver-outcome misattribution).

### Amendment R9 — 2026-05-26

- **Codex companion job:** `review-mpmplfxb-ee6mda` (thread `019e649c-2bb6-7711-9a90-75e6eb94b039`)
- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `68c5807` (post-R8)
- **Verdict:** **needs-attention** (2 HIGH; **resolver-outcome vector clean** — structural defense from commit 22 held; new findings are a **different class**)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F6 | HIGH | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:365-470` (Phase 0.B Tasks 0.B.7 + 0.B.10) | **Land in R10 with inline-rewrite.** Spec §15.26 stale-citation paragraph claimed the rewrites were done ("Every M12 cite is rewritten to point at `tests/db/admin-rls-runtime.test.ts`"), but actual Phase 0.B task bodies still cite deleted `tests/db/rls.test.ts` + `tests/cross-cutting/auth.test.ts` AND expect "22 generated admin tables" (which is master-spec prose count, NOT the live ADMIN_TABLES.length post-amendment count of 18 per α + γ-footnote hybrid). Same class shape as the pre-R6 03-reseed file-head-rebase-note bug (a header note claimed a fix that the body didn't reflect). Repair: delete Tasks 0.B.7 + 0.B.10, remove their commands from gate/commit recipes, bump generated-table expectations to live 18 where applicable, keep only the 4-ref `admin-rls-runtime` + baseline update path. |
  | F7 | HIGH | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:132-169` (DDL block) vs spec `§3.3.2:217-225` (canonical 7-column DDL) | **Land in R10 with spec amendment.** Plan DDL has 8 columns (adds `combos_seeded_dates` per pre-rebase R3 amendment to fix the partial-reseed-falsifies-check-seed bug); spec §3.3.2 still has 7-column DDL + explicitly says "the canonical and complete migration body." The R3 fix to a real bug was never mirrored to the spec. Phase 0.C's `validation_finalize_all_atomic` RPC + check-seed predicate (i) both depend on the column. **Repair: amend spec §3.3.2** (NOT plan): add `combos_seeded_dates jsonb NOT NULL DEFAULT '{}'::jsonb` to the canonical DDL block + idempotency `ADD COLUMN IF NOT EXISTS` stanza + update "complete migration body" claim + new §15.27 audit-trail entry documenting the R3 amendment now lands in spec. **Orchestrator decision 2026-05-26:** (a) over (b) — removing the column re-introduces the R3 bug; spec catches up to plan. |

- **Same-vector status:** **resolver-outcome misattribution class STRUCTURALLY CLOSED** by R8 commit 22 meta-test (`picker-resolver-outcome-prose-guard.test.ts`). R9 surfaced ZERO findings on that vector — confirms the structural defense held. F6 + F7 are different classes:
  - F6 class = "rebase-corrections claim doesn't match body" (1st occurrence on `02-phase0-validation-state.md`; pre-R6 03-reseed was the same class but caught + fixed before R6). Per `feedback_recurring_bug_response`, threshold is 3 rounds same-vector before mandating defense — not warranted at R10.
  - F7 class = "plan extends schema beyond spec without spec amendment" (1st occurrence). Per-instance fix.
- **Class-sweep peer mandate for R10:** during F7 repair, audit every plan §0.B/§0.C DDL/RPC/CHECK/policy reference against spec §3.3.2 + §3.3 for additional drift; fix any other plan-vs-spec divergence the R3+R4+R5 pre-rebase amendments may have introduced without spec mirroring.
- **Repair commit:** pending R10 implementer dispatch.

### Amendment R10 — 2026-05-26

- **Codex companion job:** `review-mpmq84u1-tteh60` (thread `019e64XX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)
- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `3c8114c` (post-R10 repair: 2 commits `00271fe` + `3c8114c`; 11-surface drift-audit clean per implementer handback)
- **Verdict:** **needs-attention** (2 HIGH; F6-class recurrence at 2 rounds + NEW F9 class)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F8 | HIGH | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:345-351` (Task 0.B.6) | **F6-class peer (dual-count drift) — land in R11.** Task 0.B.6 tells implementer to verify `lib/audit/admin-tables.generated.ts` has 22 quoted table names. That's master-spec PROSE track, not live generator track (which filters 4 M11.5-retired tables → 17 entries → 18 post-validation_state). R10 commit 24 swept most F6 peers but missed Task 0.B.6. Repair: 22 → 18 here + comprehensive sweep of remaining "22" mentions in Phase 0.B overview + task bodies for live-track-vs-prose-track context. |
  | F9 | HIGH | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/03-phase0-tooling-reseed.md:216-217` (mint RPC skew check) + same pattern in `validation_finalize_all_atomic` + the tz-pin meta-test example | **NEW class — land in R11.** SQL: `extract(epoch from (date - current_date))`. Postgres semantics: `date - date` returns INTEGER (day count), not interval; `extract(epoch from integer)` is INVALID. Implementing the plan as written would create broken validation RPCs that fail at `CREATE OR REPLACE FUNCTION` apply OR at first RPC invocation. Blocks reseed/finalize and the whole walk-session gate. Repair: `IF abs(v_validation_today_iso::date - current_date) > 1 THEN ...` (integer day comparison; no extract/epoch). Apply same fix to finalizer + tz-pin meta-test prose/example so the meta-test doesn't enshrine the invalid expression. |

- **Same-vector status:**
  - **F6-class (dual-count drift)**: R9 F6 + R10 F8 = 2 rounds. Per AGENTS.md "Same-vector recurrence triggers comprehensive re-analysis" + `feedback_recurring_bug_response`, R11 MUST audit every dual-count "21"/"22"/"17"/"18" occurrence BEFORE patching, with explicit per-occurrence dual-track context classification (prose track vs live track). Threshold-3 calibration: if R12 still surfaces dual-count drift, structural defense mandated (candidate: doc-guard meta-test grepping "22" + "21" without acceptable prose-track qualifier).
  - **F9-class (inline SQL invalidity)**: NEW class, round 1. Per-instance fix. Class-sweep adjacency: every other inline SQL block in plan §0.B/§0.C/§0.E for similar semantics bugs.
  - **Resolver-outcome class (R6-R8 vector)**: structurally closed by commit 22 meta-test; held through R9 + R10.
- **Repair commit:** pending R11 implementer dispatch.

### Amendment R11 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `0e9da3c` (post-R11 repair: 3 commits `b3ed1e8` / `6522c98` / `0e9da3c`)
- **Verdict:** **repair landed; pending R12 adversarial review.**
- **(A) comprehensive dual-count audit** (per same-vector mandate from R9 F6 + R10 F8): 26 occurrences of "21"/"22"/"17"/"18" across spec + plan tree, all classified prose-track vs live-track. Only 1 wrong (Task 0.B.6 Step 4 = F8). 14 prose-track occurrences correctly framed; 12 live-track occurrences correctly framed; F8 fixed in commit 26.
- **F9 adjacent-SQL audit:** 2 broken `extract(epoch from (date - current_date))` sites (mint RPC + finalizer); both fixed in commit 27 with integer day comparison `abs(::date - current_date) > 1`. Spec §3.3.2 describes RPCs at contract-prose level only — no spec mirror needed. No other operand-type bugs in plan §0.B / §0.C / §0.E. Adjacent audit clean.
- **NEW class surfaced by R11 audit — phantom-structural-defense-citation:**
  - `tests/cross-cutting/validation-tooling-tz-pin.test.ts` cited as live infrastructure in handoff §6 + spec §3.3.2:337 + R5 plan-amendment narrative. Verified via `find`/`git log` — file never committed.
  - `tests/cross-cutting/email-canonicalization.test.ts` exists but the R5-claimed extension to walk `scripts/validation-*.ts` was also never authored. Verified via `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` walking only `lib/parser` / `lib/sync` / `lib/reports` / `lib/auth` / `lib/data` / `lib/adminAlerts` / `app/api/admin` — no `scripts/validation-*.ts`.
  - Both treated per `feedback_deferral_discipline` as DEFERRED entries: `M12-PHASE0C-TZ-PIN-METATEST` + `M12-PHASE0C-EMAIL-CANON-EXT` in `DEFERRED.md`; trigger = Phase 0.C `scripts/validation-reseed.ts` authoring (the meta-tests pair naturally with the script they audit).
  - Citation reframes: handoff §2 invariant "Email canonicalization" + §6 watchpoints + §7 test commands + spec §3.3.2:337 + plan `00-overview.md` meta-test inventory — all reframed from past-tense ("(new) — greps...") to forward-looking ("(planned in Phase 0.C per DEFERRED M12-PHASE0C-*)") in commit 28.
- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 26 | `b3ed1e8` | `docs(plan-m12): R11 F8 — Task 0.B.6 Step 4 expects live track 18 not prose 22` |
  | 27 | `6522c98` | `docs(plan-m12): R11 F9 — fix Postgres date-arithmetic in mint + finalizer RPCs` |
  | 28 | `0e9da3c` | `docs(plan-m12): R11 phantom-metatest reframe — defer tz-pin + email-canon-ext to Phase 0.C` |

- **Meta-test regression:** both pre-existing structural defenses (R8 `picker-resolver-outcome-prose-guard.test.ts` + H8 `identity-invalidated-two-reasons-doc-guard.test.ts`) PASS against R11-amended prose. No regression.
- **Class-sweep status:** F6-class dual-count drift = 2 rounds (R9+R10), closed by R11 (A) audit + single-site fix; threshold-3 calibration if R12 surfaces another F6-class hit → structural defense becomes mandate. F9-class inline SQL invalidity = 1 round, closed in R11. Phantom-structural-defense-citation class = 1 round (R11 audit surfaced 2 hits in same R5 source narrative; both deferred + reframed).

### Amendment R12 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `0e9da3c` (post-R11)
- **Verdict:** **needs-attention** (2 HIGH + 1 MEDIUM; 2 NEW classes + 1 same-vector recurrence)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F10 | HIGH | `06-phase1-matrix-walk.md:185-190` (J3 leg c claim-email reference) + plan `03-phase0-tooling-reseed.md` seed contract (fixture emails synthesized as `validation+<combo>-<alias>@example.com`) | **NEW class — J3 OAuth-walk fixture impossibility.** J3 leg (c) requires the dev to sign in to Google as `alias_5a_lead`'s identity to trigger `claim_oauth_identity`. Fixture emails are RFC-reserved `example.com` addresses; real Google OAuth cannot authenticate against that domain. The load-bearing OAuth identity-claim path is unwalk-able as designed. Repair: parameterize J3 claim identities via new env var (e.g., `VALIDATION_J3_CLAIM_EMAIL`); reseed uses the configured email for the J3-claim alias; `validation:check-seed` fails if J3 claim fixture email is still a placeholder domain; Phase 0.A env-var contract adds this var. |
  | F11 | HIGH | `03-phase0-tooling-reseed.md:282-297` (mint RPC crew_members UPSERT) | **NEW class — reseed doesn't restore OAuth-claim baseline.** UPSERT updates email/role/flags/restrictions but does NOT reset `claimed_via_oauth_at`. After J3 leg (c) stamps `alias_5a_lead` as claimed, `validation:reseed --combo all` preserves the row through `ON CONFLICT (show_id, name) DO UPDATE`, leaving the LEAD picker row OAuth-disabled. Subsequent walks see a poisoned baseline. Tightly coupled with F10 — together they make J3 leg (c) unexecutable in practice. Repair: amend mint RPC to explicitly `SET claimed_via_oauth_at = NULL` in UPDATE clause (or DELETE+INSERT pattern); spec §3.3 seed contract gains explicit "claim state reset on every reseed" obligation; check-seed adds predicate asserting baseline picker aliases are unclaimed; regression test pins the contract. |
  | F12 | MEDIUM | `00-overview.md:122-130` (meta-test inventory) | **Same-vector recurrence — phantom-structural-defense class round 2.** R11 closed the citation-claim-vs-reality mismatch via DEFERRED + reframe, but didn't actually schedule the deferred work as concrete Phase 0.C tasks. Meta-test inventory still says Task 0.C.4 authors the defenses; actual Phase 0.C Task 0.C.4 is the atomic RPC task. No concrete checklist step authors either structural defense. Per AGENTS.md "Same-vector recurrence" + `feedback_recurring_bug_response`: R13 MUST do comprehensive re-analysis of the phantom-trigger class BEFORE patching. Threshold-3 calibration: if R14 surfaces another phantom-trigger finding, structural defense becomes mandate (candidate: doc-guard meta-test auditing DEFERRED.md entries' triggers against live plan task list). Repair: add explicit Phase 0.C task(s) authoring `validation-tooling-tz-pin.test.ts` + `email-canonicalization.test.ts` scope extension; update meta-test inventory pointer to point at the real task IDs; include both tests in Phase 0.C close-out commands. |

- **Same-vector status:**
  - **Phantom-metatest class:** 2 rounds (R11 + R12). R13 mandate: comprehensive re-analysis before patching. R14 structural-defense triggers if recurrence.
  - **F6-class dual-count drift:** closed via R11 (A) audit; R12 surfaced no new hits → status = held cleanly.
  - **F9-class inline SQL:** closed in R11; R12 surfaced no new hits → status = held cleanly.
  - **Resolver-outcome class (R6-R8):** structurally closed by commit 22 meta-test; held through R9 + R10 + R11 + R12.
  - **F10/F11 (J3 OAuth-walk integrity):** NEW classes; round 1; per-instance fix in R13.
- **Repair commit:** pending R13 implementer dispatch.

### Amendment R13 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `748cbbd` (post-R13 repair: 4 commits `b8c6b01` / `d34f7bc` / `8b42668` / `748cbbd`)
- **Verdict:** **repair landed; pending R14 adversarial review.**
- **(A) comprehensive phantom-trigger audit** (per same-vector mandate from R11+R12): 10 audit surfaces; 4 F12-class hits all converging on a single repair surface (Task 0.C.4 mis-attribution in DEFERRED entries + meta-test inventory peers); 0 additional phantom-trigger peers beyond named hits. M11.5-IMP-3 + M11.5-IMP-5 correctly classified as execution-scope-ambient triggers (NOT F12-class). Other 4 DEFERRED carryovers verified pointing at real Task 0.A.1/2/3 or ambient walk note at 06-phase1-matrix-walk.md:86.
- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 29 | `b8c6b01` | `docs(plan-m12): R13 F12 — schedule deferred structural defenses as concrete Phase 0.C tasks` |
  | 30 | `d34f7bc` | `docs(spec-m12)+docs(plan-m12): R13 F10 — parameterize J3 claim email via VALIDATION_J3_CLAIM_EMAIL` |
  | 31 | `8b42668` | `docs(spec-m12)+docs(plan-m12): R13 F11 — reseed clears claimed_via_oauth_at` |
  | 32 | `748cbbd` | `test(cross-cutting): R13 F11 regression — reseed-clears-oauth-claim doc-guard` |

- **F10 repair:** new env var `VALIDATION_J3_CLAIM_EMAIL` documented in Phase 0.A.5 env-var contract; spec §3.3 seed contract amended (alias_5a_lead for combo R1 reads its fixture email from `VALIDATION_J3_CLAIM_EMAIL`); mint RPC uses the configured email; check-seed predicate fails if J3 claim email is still a placeholder domain; J3 walk procedure references the env var. Spec §3.3 carries the "WHY-this-exists" framing — per spec §1.5, solo-dev IS the validation; the dev's personal Google email IS the load-bearing alias_5a_lead identity; Google OAuth cannot authenticate against RFC 2606 reserved domains.
- **F11 repair:** mint RPC `crew_members` UPSERT's `DO UPDATE SET` clause now explicitly includes `claimed_via_oauth_at = NULL`; spec §3.3 picker-fixture lockstep contract gains explicit obligation; check-seed gains predicate (l) — "for any baseline picker alias enumerated in §3.2, `crew_members.claimed_via_oauth_at IS NULL` after a fresh `--combo all` reseed." R13 commit 32 lands a TDD regression test at `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` (RED phase failed on assertions 1+2 against pre-commit-31 HEAD `d34f7bc`; GREEN phase passes against R13 HEAD `748cbbd`; assertion 3 prose-completeness passed pre-fix legitimately because §3.3 cleanup contract already covered that surface).
- **F12 repair:** Phase 0.C task list extended with Task 0.C.8 (`tests/cross-cutting/validation-tooling-tz-pin.test.ts` authoring; TDD with RED against live `scripts/validation-*.ts` + `supabase/migrations/*.sql` set without TZ-pin discipline pin) + Task 0.C.9 (`tests/cross-cutting/email-canonicalization.test.ts` audit-scope extension to `scripts/validation-*.ts` via `auditLiveEmailCanonicalization()` walk-root extension). DEFERRED.md entries M12-PHASE0C-TZ-PIN-METATEST + M12-PHASE0C-EMAIL-CANON-EXT now cite concrete Task 0.C.8 / 0.C.9 (NOT the previous generic Task 0.C.4 mis-attribution). Meta-test inventory at 00-overview.md:122-130 points at the real task IDs. Phase 0.F Task 0.F.8 close-out gate Step 1a requires both new structural defenses green before Phase 0 closes.
- **Meta-test regression:** all 3 structural defenses PASS against R13 HEAD (`picker-resolver-outcome-prose-guard.test.ts` + `identity-invalidated-two-reasons-doc-guard.test.ts` + new `reseed-clears-oauth-claim-doc-guard.test.ts`).
- **Class-sweep status:**
  - Phantom-metatest class: R11 + R12 = 2 rounds; R13 closes per-instance via concrete Task 0.C.8/0.C.9 + DEFERRED + inventory + Phase 0.F gate. Threshold-3: if R14 surfaces another, structural defense becomes mandate.
  - F10 (J3-OAuth-walk-fixture-impossibility): 1 round; closed.
  - F11 (Reseed-claim-baseline-poisoning): 1 round; closed + R13 commit 32 IS the F11 structural defense (pre-emptively landed per dispatch's (D) regression-test scope, not waiting for round-2).
  - All previous classes still closed.

### Amendment R14 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `748cbbd` (post-R13)
- **Verdict:** **needs-attention** (1 HIGH + 1 MEDIUM; both F10-class peers — class-sweep miss within R13 commit 30)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F13 | HIGH | `03-phase0-tooling-reseed.md:566-567` (Phase 0.C verification count query) | **F10-class class-sweep miss.** Query asserts `email LIKE 'validation+%@example.com'` count = 96, but R13 F10 repair parameterized combo R1's alias_5a_lead to `VALIDATION_J3_CLAIM_EMAIL` (a real Google email, NOT example.com). Correct seed post-F10: 95 synthesized example.com rows + 1 real Google email = 96 total, but only 95 match the LIKE pattern. Implementers either fail a correct implementation OR regress F10 by reverting alias_5a_lead to example.com placeholder. Repair: rewrite query to assert (a) total seeded aliases via alias_map/crew_members join = 96; (b) synthesized example.com rows = 95; (c) `R1.alias_5a_lead.email = canonicalize(VALIDATION_J3_CLAIM_EMAIL)`. |
  | F14 | MEDIUM | `03-phase0-tooling-reseed.md:516-519` (check-seed predicate (k)) | **F10-class — predicate implementation too narrow.** Only rejects unset + example.com/.org/.net (RFC 2606). Misses RFC 6761 reserved TLDs (.test, .invalid, .localhost) + project-conventional dev domains (.local, dev.local, localhost). Implementer can configure an OAuth-unsignable email like `dev@dev.local` and check-seed passes; J3 walk fails late at OAuth-sign-in instead of at the seed gate. Repair: extend both fixture-build and check-seed predicates to reject .test/.invalid/.local/.localhost/localhost/dev.local domains; keep DB-side R1 alias email check in sync. |

- **Same-vector status:**
  - **F10-class (J3 OAuth-walk integrity): 2 rounds** (R12 F10 + R14 F13/F14). Per AGENTS.md "Same-vector recurrence" + `feedback_recurring_bug_response`, **R15 MUST do comprehensive re-analysis** of F10-class surfaces BEFORE patching. Threshold-3 calibration: if R16 surfaces another F10-class hit, structural defense mandate fires. Per M12 plan R5 precedent (structural-defense calibration), R15 pre-emptively ships structural defense IF (A) audit surfaces 3+ peers beyond F13/F14.
  - **Phantom-metatest class:** closed in R13 (R14 surfaced no new hits → held cleanly).
  - **F11-class (reseed-claim-baseline-poisoning):** closed in R13 + R13 commit 32 doc-guard held (R14 surfaced no new hits).
  - **Resolver-outcome class (R6-R8):** structurally closed by R8 commit 22 (held through R9-R14).
  - **F6 / F7 / F9 classes:** all closed in earlier rounds; held through R14.
- **Class-sweep discipline note:** R13 (A) audit was scoped to F12 class only. F10/F11 repairs in commits 30+31 did NOT include adjacent class-sweeps. R15 dispatch MUST mandate comprehensive F10-class (A) audit BEFORE patching commits land. AGENTS.md cross-cutting #5 ("class-sweep before patching") applies pre-emptively, not just after the second same-vector finding.
- **Repair commit:** pending R15 implementer dispatch.

### Amendment R15 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `78b9cf1` (post-R15 HEAD)
- **Verdict:** **implementer-complete; pending R16 adversarial review**
- **(A) F10-class comprehensive audit (mandated by R12+R14 same-vector recurrence):** 5 dimensions audited (email-pattern / count assertions / placeholder-domain rejection lists / alias_5a_lead-specific / DB-side mirrors). Summary:

  | Dim | Description | Peers beyond named (F13+F14) |
  |---|---|---|
  | 1 | email-pattern (`validation+%@example.com`) | 0 |
  | 2 | count assertions (96 / 95 / 9×16) | 0 (F13 is the only conflation site) |
  | 3 | placeholder-domain rejection lists | **7** (all narrow-list peers across spec §3.3 + plan §0.C + env-var template + walk procedure) |
  | 4 | `alias_5a_lead`-specific references | 0 |
  | 5 | DB-side / RPC-side mirrors | 0 (1 new defense surface added, not a peer drift) |
  | **Total** | — | **7** |

- **Structural-defense-acceleration trigger:** 7 peers ≥ 3-peer threshold → pre-emptive structural defense ships at R15 (commit 36) per M12 plan R5 precedent (structural-defense calibration in same commit series, do not wait for R16).

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 33 | `6866d72` | docs(plan-m12): R15 F13 — Phase 0.C verification query split for post-F10 seed shape |
  | 34 | `30bbb4f` | docs(plan-m12): R15 F14 — predicate (k) + fixture-build + RPC defense-in-depth with full canonical domain set |
  | 35 | `2e37cb0` | docs(spec-m12)+docs(plan-m12): R15 Dim-3 class-sweep — narrow→canonical rejected-domain set across all 7 peers |
  | 36 | `78b9cf1` | test(cross-cutting): R15 F10-class structural defense extension |

- **F13 repair (commit 33):** Phase 0.C verification query at `03-phase0-tooling-reseed.md:592-637` split into three queries — (a) `alias_map` JOIN asserts 96 total aliases; (b) `email LIKE 'validation+%@example.com'` asserts 95 (post-F10 split); (c) `R1.alias_5a_lead.email` asserts canonicalize(`VALIDATION_J3_CLAIM_EMAIL`). Postgres operand types verified per R10 F9 lesson.
- **F14 repair (commit 34):** Predicate (k) at `03-phase0-tooling-reseed.md:516` + fixture-build TS pseudocode at `:129-148` + mint RPC body at `:266-279` all extended to reject the **canonical rejected domain set** — RFC 2606 (example.com/.org/.net) + RFC 6761 (*.test, *.invalid, *.localhost, bare localhost) + mDNS RFC 6762 + project-conventional (*.local, dev.local). RPC `RAISE EXCEPTION` provides defense-in-depth at seed-write (not just check-seed time).
- **Dim-3 class-sweep (commit 35):** 7 narrow-list peer sites bumped to canonical set with cross-references back to spec §3.3 step 5 (single source of truth). Sites: spec §3.3 R13-amendment paragraph (`:146`); spec §3.3 combo R1 exception (`:158`); spec §3.3 predicate (k) mirror (`:343`); plan §0.C.5 fixture-build pseudocode (`03:129`); plan env-var doc template (`01:99-112`); plan commit-msg template (`01:131-137`); plan J3 walk procedure (`06:185`).
- **Structural defense (commit 36):** Existing `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` (R13 commit 32 F11 defense) extended with 3 new F10-class assertions: (1) F13-conflation-prevention guard (Phase 0.C verification queries using `email LIKE '%@example.com'` must NOT assert count = alias_map leaf total); (2) F14-canonical-set guard (every placeholder-domain rejection list in M12 spec + plan cites every entry of the canonical set); (3) F10-parameterization-integrity guard (every J3-claim-email contract site names `VALIDATION_J3_CLAIM_EMAIL` + cross-references live RPC + check-seed + walk surfaces). **RED phase against pre-R15 HEAD `748cbbd`:** 2 of 3 new assertions failed (F14-canonical-set + F13-conflation-prevention); F10-parameterization-integrity passed legitimately because R13 commits 30+31 had already landed `VALIDATION_J3_CLAIM_EMAIL` across all 6 surfaces. **GREEN phase against R15 HEAD `78b9cf1`:** all 3 new assertions PASS; all 3 pre-existing F11 doc-guard assertions hold.
- **Meta-test regression:** all 3 structural defenses PASS at R15 HEAD — `picker-resolver-outcome-prose-guard.test.ts` (R8) + `identity-invalidated-two-reasons-doc-guard.test.ts` (H8) + `reseed-clears-oauth-claim-doc-guard.test.ts` (R13c32 + R15c36; 6 assertions total). 8 doc-guard assertions across 3 files, all PASS.
- **Class-sweep status post-R15:**
  - **F10-class (J3 OAuth-walk integrity):** R12 F10 + R14 F13/F14 = 2 rounds. R15 closes via per-instance F13/F14 + Dim-3 7-peer class-sweep + structural defense (commit 36 ships pre-emptively per M12 plan R5 calibration). **Threshold-3 calibration:** if R16 surfaces another F10-class hit, structural defense is insufficient and deeper redesign is required.
  - All previous classes still closed (resolver-outcome R6-R8, F6/F7/F9, phantom-metatest R11+R12, F11-class R12).
- **Scope discipline:** Spec + plan + handoff markdown + ONE test file under `tests/cross-cutting/` (the existing R13c32 doc-guard extended; consolidates F10/F11/F13/F14 doc-guards per project pattern). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/`.

### Amendment R16 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `78b9cf1` (post-R15)
- **Verdict:** **needs-attention** (2 HIGH + 1 MEDIUM; all 3 are NEW classes, 0 F10-class hits)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F15 | HIGH | `02-phase0-validation-state.md:180-189` (validation_state migration grants) | **NEW class — PostgREST DML lockdown for RPC-gated table.** Plan says writes are RPC-owned (atomic with advisory lock) but migration GRANTs INSERT/UPDATE/DELETE to anon/authenticated. Any admin session can bypass RPC and directly mutate `last_seed_date` / `combos_seeded_dates` / `alias_map` / `seeded_supabase_project_ref`, falsifying check-seed without the intended transaction semantics. Direct match for AGENTS.md cross-cutting #1 + `feedback_postgrest_dml_lockdown_for_rpc_gated_tables`. Repair: REVOKE INSERT/UPDATE/DELETE from anon/authenticated; SELECT-only if admin read needed; service_role/RPC remain only write path; structural meta-test pinning the invariant. |
  | F16 | HIGH | `03-phase0-tooling-reseed.md:305-348` (mint_validation_fixture_atomic RPC body) | **NEW class — reseed `--combo all` not full-replace.** Spec says `--combo all` is full-replace; RPC only UPSERTs expected crew_members + updates alias_map. Never DELETEs `crew_members` for the validation show that are no longer in the payload. Picker roster reads `crew_members` directly (not `alias_map`), so stale aliases from an earlier draft/manual run remain visible and selectable while check-seed (which counts alias_map leaves) still passes. UX walk can exercise identities outside the canonical 96-leaf fixture. Repair: in locked RPC, DELETE validation-show crew rows whose names are not in the incoming payload before the UPSERT (or after, with a sentinel pattern); add check-seed/test case that seeds an extra stale crew row, runs reseed, confirms it's removed and picker roster matches fixture aliases. |
  | F17 | MEDIUM | `02-phase0-validation-state.md:83-88` (failing-first schema test) | **NEW class — test pattern unfit for harness.** Test queries `information_schema.columns` via supabase-js `.from()`. Local Supabase exposes only public/graphql_public/dev schemas; `information_schema` is unreachable via PostgREST even with service_role. Test continues failing after schema is correct, blocking Phase 0.B on harness rather than schema. Repair: use existing `tests/db/*` pattern (psql against TEST_DATABASE_URL for information_schema/pg_catalog assertions), OR add a purpose-built SECURITY DEFINER introspection RPC in public schema. |

- **Same-vector status:**
  - **F10-class (J3 OAuth-walk integrity):** R16 surfaced 0 hits → R15 structural defense (commit 36 + Dim-3 7-peer class-sweep) held cleanly. Class closed.
  - F15 / F16 / F17: each NEW class, 1 round, no priors.
  - All previous classes still closed; structural defenses regression-clean.
- **Repair commit:** pending R17 implementer dispatch.

### Amendment R17 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `fa32554` (post-R17 HEAD)
- **Dispatch mode:** **inline Agent** (general-purpose subagent in orchestrator session, not separate paste-in Opus session). First R-round on this milestone dispatched inline; tradeoffs documented at handoff §11.
- **Verdict:** **implementer-complete; pending R18 adversarial review**
- **(A) class-sweep peer surveys:**

  | Finding | Class | Peers beyond named | Disposition |
  |---|---|---|---|
  | F15 | RPC-gated table w/ PostgREST DML open | 0 | Single-instance (`validation_state` only); `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` function-level `REVOKE ALL FROM public, anon, authenticated` already correct |
  | F16 | Reseed/full-replace semantics gap | 0 | Single-instance (`mint_validation_fixture_atomic` only); `validation_finalize_all_atomic` only stamps `last_seed_date`, does not write `crew_members` |
  | F17 | supabase-js used for unreachable schema | 0 | Single-instance (`02:85` only `information_schema.*` reference) |
  | **Total** | — | **0** | No class hit 3-peer threshold → no structural-defense-acceleration trigger |

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 37 | `a261cf8` | supabase(migration)+docs(plan-m12)+docs(spec-m12): R17 F15 — validation_state PostgREST DML lockdown |
  | 38 | `6ee4a03` | test(db): R17 F15 structural defense — postgrest-dml-lockdown.test.ts inventory registration |
  | 39 | `2d08cae` | docs(plan-m12)+docs(spec-m12): R17 F16 — mint RPC full-replace + check-seed predicate (m) |
  | 40 | `fa32554` | docs(plan-m12): R17 F17 — schema-test pattern swap supabase-js → psql |

- **F15 repair (commit 37):** validation_state migration grants `SELECT` to anon/authenticated; REVOKEs `INSERT, UPDATE, DELETE` from anon/authenticated; service_role keeps full DML. PostgREST DML lockdown contract paragraph added at `02-phase0-validation-state.md:221` + spec §3.3.2 mirror. Cites M9.5 R5+R6 precedent migration `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql` for `crew_member_auth` + `crew_members` parallel.
- **F15 structural defense (commit 38):** `tests/db/postgrest-dml-lockdown.test.ts` is PLAN-SPEC'D at Task 0.B.2 Step 8 (commit 37) — verbatim source embedded in plan, registered in 00-overview.md meta-test inventory (commit 38). **Runtime authoring deferred to Phase 0.B execution** per M9.5 precedent (M9.5 R5+R6 closed with REVOKE migration only; no `postgrest-dml-lockdown.test.ts` file exists at HEAD; M12 Phase 0.B authors it new, registering `crew_member_auth` + `crew_members` + `validation_state` as the initial registry). This interpretation of AGENTS.md cross-cutting #1 ("Plan-time checklist") = decided-at-plan-time + authored-at-execution-time matches the M9.5 lifecycle. **Pre-emptive ratification:** this is NOT a deferred-defense gap; the cross-cutting #1 rule's authoring obligation is honored by the Phase 0.B execution step.
- **F16 repair (commit 39):** `mint_validation_fixture_atomic` pseudocode at `03-phase0-tooling-reseed.md` §2.5 gains DELETE-BEFORE-UPSERT block (`WITH keep AS (...) DELETE FROM crew_members WHERE show_id = v_show_id AND name NOT IN (SELECT keep_name FROM keep)`). Check-seed predicate count 9 → 10 (a-g, i, k, l + new **m**) at `03:567` + spec §3.3.2 mirror. Predicate (m) wording: "for every combo C in combos_materialized, every crew_members.name for the C-show MUST appear in the canonical fixture body for combo C; orphan rows are flagged." Regression test specified at Task 0.C.5 Step 5 — seed R1, INSERT `orphan_stale_lead`, assert predicate (m) fires; re-mint; assert orphan removed + check-seed PASS + canonical fixture intact.
- **F17 repair (commit 40):** Phase 0.B Task 0.B.2 Step 1 failing-first test pattern swapped from supabase-js `.from(information_schema.columns)` (unreachable schema) to `execFileSync` psql against `TEST_DATABASE_URL`. Mirrors `tests/db/admin-rls-runtime.test.ts:55-79` `runPsql` helper pattern (TSV parsing via `-At -F\t`); also cited at `tests/db/picker_epoch_columns.test.ts`. New shape SELECTs `column_name, data_type, is_nullable` ORDER BY ordinal_position; parses to colMap; asserts 8-column type matrix.
- **Meta-test regression:** all 3 cross-cutting structural defenses PASS at R17 HEAD (`picker-resolver-outcome-prose-guard` + `identity-invalidated-two-reasons-doc-guard` + `reseed-clears-oauth-claim-doc-guard` = 8 assertions / 8 PASS in 495ms).
- **Class-sweep status post-R17:**
  - F15/F16/F17 each 1 round, closed per-instance (no peers). F15 structural defense plan-spec'd for Phase 0.B authoring per M9.5 precedent.
  - F10-class still closed (R15 commit 36 held through R16). All previous classes still closed.
- **Scope discipline:** Spec + plan + handoff markdown only. No `app/`, `components/`, `lib/`, `scripts/`, `tests/cross-cutting/`, `tests/db/`, or `supabase/migrations/` runtime files modified (the REVOKE block is plan-spec'd into the canonical DDL embedded in `02-phase0-validation-state.md`; runtime migration ships when Phase 0.B Task 0.B.2 Step 3 fires per existing plan cadence).
- **Orchestrator nits (not blocking):**
  - Commit 38 type `test(db):` is slightly off-convention given the commit only edits markdown (00-overview.md +2/-1 lines); arguably `docs(plan-m12):`. Defensible because the conceptual scope IS the test inventory registry. Non-blocking.

### Amendment R18 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `fa32554` (post-R17)
- **Verdict:** **needs-attention** (2 HIGH; F18 NEW class + F19 F16-class same-vector recurrence)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F18 | HIGH | `03-phase0-tooling-reseed.md:247-248` (mint RPC `drive_file_id` formula vs predicate (m) + regression `lower(C)` / `validation_r1` references) | **NEW class — fixture identity normalization mismatch.** Mint RPC writes `drive_file_id := 'validation_' || p_combo` (R1 → `validation_R1` UPPERCASE) but predicate (m) and regression snippets resolve via `'validation_' || lower(C)` / literal `validation_r1`. A correct R1 reseed will not be found by the prescribed predicate/test, so check-seed either fails immediately after fresh reseed OR the orphan regression INSERTs against a NULL show_id. Repair: pick one canonical case (UPPER matches existing combo enum convention R1/R2/...) and align both write + read sides; add regression that `reseed --combo R1` followed by `check-seed --combo R1` passes and that the orphan test resolves a non-null R1 show_id. |
  | F19 | HIGH | `03-phase0-tooling-reseed.md:251-255` (mint RPC shows UPSERT vs check-seed predicate (g) share-token requirement) | **F16-class same-vector recurrence (R16 F16 + R18 F19) — reseed cannot self-heal show_share_tokens.** Plan relies on `shows_create_share_token_after_insert` trigger to populate `show_share_tokens` on shows INSERT, but the trigger does not fire on UPSERT update path. If the token row is missing (manual cleanup / failed earlier migration / test corruption), rerunning `validation:reseed` updates the existing show but never (re)creates the token row, leaving smoke 6 / J3 unwalkable (predicate (g) treats missing token as blocking failure). Repair: mint RPC self-heals after show UPSERT via `INSERT INTO public.show_share_tokens (show_id) VALUES (v_show_id) ON CONFLICT DO NOTHING`; predicate (g) regression extended to delete the token row, rerun reseed, assert check-seed PASS. |

- **Same-vector status post-R18:**
  - **F16-class (mint RPC UPSERT update-path self-healing): 2 rounds** (R16 F16 crew_members orphan deletion + R18 F19 show_share_tokens repair). Per AGENTS.md "Same-vector recurrence" + `feedback_recurring_bug_response`, **R19 MUST do comprehensive re-analysis** of F16-class surfaces BEFORE patching. The (A) audit must enumerate EVERY table the mint RPC writes (directly or via INSERT trigger) and confirm the UPSERT update-path self-heals the invariant for each. R17 (A) audit was scoped to "reseed/full-replace semantics" but missed the trigger-bypass-on-UPSERT-update surface — the comprehensive re-analysis must close that gap.
  - Threshold-3 calibration: if R20 surfaces another F16-class hit, R19 audit was incomplete → structural defense mandate fires (per M12 plan R5 precedent — defense ships at R19 pre-emptively if (A) audit surfaces 3+ peers beyond F19).
  - F18 NEW class — fixture identity normalization; 1 round; no priors.
  - F10-class still closed (R15 commit 36 + R16 + R17 held).
  - F15 / F17 each NEW classes at R17, closed (no R18 recurrence).
- **Repair commit:** pending R19 implementer dispatch (inline Agent).

### Amendment R19 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `2f6c742` (post-R19 HEAD)
- **Dispatch mode:** inline Agent (general-purpose subagent in orchestrator session).
- **Verdict:** **implementer-complete; pending R20 adversarial review**
- **(A) F16-class comprehensive re-analysis** (per same-vector recurrence mandate from R16 F16 + R18 F19):

  | Table | Direct write by mint RPC | Triggers fired (semantics) | Invariant held on UPSERT update-path? | F16-class peer? |
  |---|---|---|---|---|
  | `shows` | UPSERT (ON CONFLICT (drive_file_id) DO UPDATE) | (i) `shows_bump_picker_epoch_bumped_at` BEFORE UPDATE OF picker_epoch — mint RPC does NOT touch picker_epoch, trigger doesn't fire on either path; not invariant-bearing for mint. (ii) `shows_create_share_token_after_insert` AFTER INSERT — fires ONLY on initial INSERT; bypassed on UPSERT update-path. | (i) N/A. (ii) **NO** — F19 gap (this finding). | **F19 = sole peer beyond F16 itself.** |
  | `crew_members` | DELETE-BEFORE-UPSERT (R17 commit 39 F16 amendment, already closed) | `crew_members_bump_last_changed_at` BEFORE UPDATE + `crew_members_publish_invalidation` AFTER UPDATE (UPSERT update-path) + `crew_members_publish_invalidation_insert` AFTER INSERT (initial INSERT). The publish_invalidation pair covers both INSERT + UPDATE → realtime-invalidation invariant holds on every path. | YES (bump_last_changed_at + publish_invalidation both fire on UPSERT update-path). | NO — no gap. |
  | `validation_state` | UPSERT (ON CONFLICT (key) DO UPDATE) | None on `public.validation_state`. | YES (no triggered invariant to lose). | NO — no triggers. |
  | `show_share_tokens` | NOT directly written — relies on `shows_create_share_token_after_insert` trigger. | (Owns its own invariant: every show has exactly one row.) | NO if shows UPSERT hits update-path AND share-token row was removed out-of-band — trigger doesn't re-fire. | **YES — F19 (this finding).** |

  **F16-class peer count beyond F19: 0.** `crew_member_auth` retired at M11.5 G3 cutover (`supabase/migrations/20260523000099_cutover_drop_m9_5.sql`) — no triggers to audit. No other tables in the mint RPC's write set. Structural-defense-acceleration trigger NOT fired (peer count < 3); threshold-3 calibration applies (defense becomes mandate IF R20 surfaces another F16-class hit).

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 41 | `d59489d` | `docs(plan-m12)+docs(spec-m12): R19 F18 — drive_file_id case normalization to UPPER` |
  | 42 | `2f6c742` | `docs(plan-m12)+docs(spec-m12): R19 F19 — show_share_tokens self-heal in mint RPC` |

  (Commit numbering follows the M12 amendment series; commit count shifted +1 vs orchestrator's pre-dispatch projection — R19 lands in 2 commits, not 4. Commit 44 + commit 45 NOT needed: (A) audit surfaced 0 peers beyond F19, so no adjacent peer fixes; 0 peers < 3-peer threshold, so no structural-defense-acceleration trigger.)

- **F18 repair (commit 41):** drive_file_id canonical case is UPPER (matches existing combo enum convention `R1`/`R7b`/`SW-POST_SHOW`). Mint RPC line 247 already wrote `'validation_' || p_combo` correctly (no lowercase coercion); the bug was on the READ side — predicate (m) prose at line 583 used `'validation_' || lower(C)` and Task 0.C.5 Step 5 regression snippets used literal `validation_r1`. R19 normalizes all read-side references to match the write side. Sites updated: 03:583 (predicate (m) prose), 03:585 (failing test snippet), 03:601 (orphan INSERT), 03:604 (orphan removal assertion); spec §3.3.2 predicate (m) gains case clarifier (no SQL form in spec prose, so this is a contract-level invariant statement). Regression test extension at Task 0.C.5 Step 1: `pnpm validation:reseed --combo R1` + `pnpm validation:check-seed --combo R1` must resolve non-null R1 show_id via predicate (m) and PASS — exercises the case round-trip end-to-end.
- **F19 repair (commit 42):** mint RPC body gains section 2.6 (post-shows-UPSERT, pre-crew_members) with `INSERT INTO public.show_share_tokens (show_id) VALUES (v_show_id) ON CONFLICT (show_id) DO NOTHING`. ON CONFLICT target `(show_id)` matches `show_share_tokens_pkey` at `supabase/migrations/20260523000002_show_share_tokens.sql:27`. Ordering AFTER shows UPSERT (v_show_id exists) BEFORE crew_members ops (show invariants complete before fixture data lands; concurrent readers acquiring the advisory lock never observe a show without its share-token row). Predicate (g) regression at Task 0.C.5 Step 5 extended with sub-steps 6-10: capture original token → DELETE share-token row → check-seed exit 1 predicate (g) fires → reseed → assert row re-created with fresh 64-hex token + check-seed PASS + idempotency probe (second reseed preserves the token via ON CONFLICT DO NOTHING). Predicate (g) prose at line 618 extended to reflect dual-source sentinel (trigger on initial INSERT + self-heal on UPSERT-update reseeds). Spec §3.3.2 mint-RPC prose at line 347 mirrors the F19 amendment.
- **Meta-test regression:** all 3 cross-cutting structural defenses PASS at R19 HEAD `2f6c742` — `picker-resolver-outcome-prose-guard.test.ts` (R8) + `identity-invalidated-two-reasons-doc-guard.test.ts` (H8) + `reseed-clears-oauth-claim-doc-guard.test.ts` (R13c32 + R15c36; 6 assertions). **8 doc-guard assertions across 3 files; 8 PASS in 564ms.** No structural defense extended at R19 (commit 45 was conditional on (A) audit finding 3+ peers beyond F19; (A) audit found 0).
- **Class-sweep status post-R19:**
  - **F16-class (mint RPC UPSERT update-path self-healing):** R16 F16 + R18 F19 = 2 rounds. R19 closes per-instance via §2.6 self-heal block + predicate (g) regression extension. (A) audit found 0 peers beyond F19 — class is structurally bounded by the mint RPC's write surface, which is enumerated above. **Threshold-3 calibration:** if R20 surfaces another F16-class hit, R19 (A) audit was incomplete; deeper structural defense required (candidate: doc-guard meta-test enumerating every mint-RPC-touched table + asserting each has a documented self-heal block OR a documented "no self-heal needed because <reason>" justification in the RPC body comments).
  - **F18-class (fixture identity normalization):** NEW class, 1 round, closed in R19. Threshold-3 applies if R20 surfaces another case-normalization peer.
  - All previous classes still closed (resolver-outcome R6-R8, F6/F7/F9, phantom-metatest R11+R12, F10-class, F11-class, F15/F17 R16-R17).
- **Scope discipline:** Spec + plan + handoff markdown only. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `tests/`, `supabase/migrations/` (mint RPC body is plan-spec'd inline; runtime authoring is Phase 0.C execution work per existing plan cadence).

### Amendment R20 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `2f6c742` (post-R19)
- **Verdict:** **needs-attention** (2 HIGH; F20 = F10-class THRESHOLD-3 BREACH + F21 = R19 class-sweep miss)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F20 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:814-819` (spec §9.1.2 canonical CLI env-var table) | **F10-class same-vector recurrence (3rd round). THRESHOLD-3 BREACH.** §9.1.2 declares itself "single authoritative tooling contract"; reseed row lists only `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF`; other commands inherit "Same three env vars." Contradicts R13/J3 contract requiring `VALIDATION_J3_CLAIM_EMAIL`. Implementer following table can omit Google email from reseed/check-seed → R1.alias_5a_lead remains placeholder OR predicate (k) unenforced; J3 unwalkable or falsely green. **R15 (A) audit had 5 dimensions but didn't include "canonical CLI env-var enumeration TABLE" as a surface — the F10-parameterization-integrity doc-guard was prose-scoped, didn't extend to markdown tables.** |
  | F21 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:168-178` (spec §3.3 picker-fixture lockstep prose) | **R19 class-sweep miss — F19 surface incomplete.** §3.3 lockstep says reseed "does NOT write show_share_tokens directly" + frames predicate (g) as trigger-only sentinel. §3.3.2 R19-amendment requires mint RPC self-heal via `INSERT INTO public.show_share_tokens ... ON CONFLICT DO NOTHING`. AGENTS.md says spec is canonical → implementer can follow §3.3 prose, omit self-heal block, ship R19 exact failure mode. R19's (A) audit enumerated mint-RPC write surfaces (tables) but didn't sweep prose contradicting the newly-amended contract. |

- **THRESHOLD-3 BREACH ACKNOWLEDGMENT:** F10-class is at **3 rounds** (R12 F10 + R14 F13/F14 + R20 F20). Per M12 plan R5 precedent + R15 row explicit promise: "if R16 surfaces another F10-class hit, structural defense is insufficient and a deeper redesign is required." Strict reading: F10-class threshold-3 trigger is round-counted (not consecutive-counted); R20 IS the 3rd round. **R15 doc-guard (`reseed-clears-oauth-claim-doc-guard.test.ts` F10-parameterization-integrity assertion) was prose-scoped grep; MISSED markdown TABLE surfaces.** R21 MUST:
  1. Ship **deeper structural-defense redesign** (not per-instance patch): either extend R15 guard to enumerate markdown-table VALIDATION_* literals + assert 4-var completeness, OR author new `tests/cross-cutting/m12-canonical-tables-completeness-guard.test.ts` that scans every spec §-numbered table referencing VALIDATION_* env vars and asserts all 4 are present.
  2. Run **enlarged (A) audit** on F10-class: original 5 dimensions PLUS new Dim 6 (canonical contract tables — §9.1.2 + any other §-numbered enumeration tables) PLUS Dim 7 (cross-section prose contradictions — every spec section that references an env-var contract surface must agree on the contract's full shape).
  3. Per-instance fix F20: §9.1.2 table reseed/check-seed rows explicitly list `VALIDATION_J3_CLAIM_EMAIL`; clarify which read-only commands don't need it (no "Same three env vars" shorthand).

- **F21 disposition:** treat as R19 class-sweep-miss. The prose-contradiction-after-amendment pattern is broader than F10-class — it's a general "amend §X.Y, sweep §X.* + other sections that reference §X.Y" discipline. R21 must:
  1. Per-instance fix F21: rewrite §3.3 lockstep prose to match §3.3.2 (trigger creates row on first INSERT; mint RPC always self-heals via idempotent INSERT...ON CONFLICT after shows UPSERT; remove "does NOT write" wording; remove troubleshooting paths that treat manual backfill as normal repair).
  2. Class-sweep all R13-R19 amendments for prose-contradiction peers: every section the amendment touched, audit ALL OTHER sections that reference the same contract surface. Specifically: R13 F10 (J3 OAuth + VALIDATION_J3_CLAIM_EMAIL); R15 F13/F14 (rejected domain canonical set); R17 F15 (PostgREST DML lockdown contract); R17 F16 (mint RPC full-replace); R17 F17 (schema-test pattern); R19 F18 (drive_file_id case); R19 F19 (show_share_tokens self-heal).
  3. If class-sweep surfaces 3+ peers beyond F21, ship structural defense for prose-contradiction class (candidate: new `tests/cross-cutting/m12-amendment-prose-consistency-guard.test.ts` that grep-asserts every §-numbered section referencing an amended contract uses the post-amendment prose).

- **Same-vector status post-R20:**
  - **F10-class: 3 rounds, threshold-3 BREACHED.** R21 mandate: deeper structural defense + enlarged (A) audit. Failure to ship deeper defense at R21 → escalate to deeper redesign (contract-level inline assertions, etc.).
  - **F19-class (prose-contradicts-newly-amended-contract):** R20 surfaced this as an R19 sweep gap. Could be classified as F19-class extension OR new "amendment-prose-consistency" class. Per same-vector ladder: R21 patches per-instance + sweeps R13-R19 amendments for peers. If 3+ peers found, structural defense at R21 per M12 plan R5 precedent.
  - F18-class still closed (no R20 hit).
  - All previous classes (resolver-outcome R6-R8, F6/F7/F9, phantom-metatest R11+R12, F11-class, F15/F17, F16-class R16-R19) still closed.

- **Repair commit:** R21 amendment session 2026-05-26 (inline Agent dispatch). 4 commits landed (commit 48 conditional NOT FIRED — class-sweep peers <3 threshold):

  | # | SHA | Title |
  |---|---|---|
  | 44 | `dd9e013` | `docs(spec-m12): R21 F20 — §9.1.2 canonical CLI table 4-var completeness per row` |
  | 45 | `e9f252e` | `docs(spec-m12): R21 F21 — §3.3 lockstep prose rewrite to match §3.3.2 R19 self-heal` |
  | 46 | `5e0aa95` | `docs(spec-m12)+docs(plan-m12): R21 (C) class-sweep — R13-R19 amendment prose-consistency peers` |
  | 47 | `c957622` | `test(cross-cutting): R21 F10-class DEEPER structural defense — canonical-tables-completeness guard` |

  **(B) Enlarged F10-class (A) audit — Dim 1-7 results:**
  - Dim 1 (parameterization integrity, 6 prose surfaces): PASS (R15 guard).
  - Dim 2 (canonical rejected-domain set across peers): PASS (R15 Dim-3 sweep).
  - Dim 3 (predicate (k) verb form): PASS.
  - Dim 4 (test fixture-vs-RPC enforcement parity): PASS.
  - Dim 5 (claim baseline reset on every reseed): PASS.
  - **Dim 6 (canonical contract TABLES — §-numbered tables enumerating VALIDATION_* env vars):** **FAIL pre-R21 commit 44** — §9.1.2 table at lines 814-819 had reseed row listing 3 vars + 3 rows using "Same three env vars" shorthand; missing VALIDATION_J3_CLAIM_EMAIL on all 4 rows. **PASS post-R21 commit 44** — every row enumerates its env vars explicitly (4 vars for reseed + check-seed; 3 vars + explicit subset reason for resolve-alias + report-fixtures).
  - **Dim 7 (cross-section prose vs amendment consistency):** **FAIL pre-R21 commit 45** for F21 surface (§3.3 lockstep prose contradicted §3.3.2 R19 self-heal contract). **PASS post-R21 commits 45 + 46** — §3.3 lockstep rewritten as dual-source sentinel (initial-INSERT trigger + mint RPC self-heal); F16 full-replace peer surface also patched into §3.3 lockstep.

  **(C) F21-class class-sweep — R13-R19 amendment peers:**

  | Amendment | Contract surface | Peers in OTHER sections | Status |
  |---|---|---|---|
  | R13 F10 | J3 OAuth + VALIDATION_J3_CLAIM_EMAIL parameterization | §9.1.2 table (F20 itself; covered Dim 6) | Fixed commit 44 |
  | R13 F11 | reseed clears claimed_via_oauth_at on every reseed | §3.3 lines 169 + 175 — already uses "RESET TO NULL on every reseed" verb post-R13 | CLEAN |
  | R15 F13/F14 | canonical rejected-domain set (RFC 2606 + 6761 + mDNS) | swept across 6 surfaces in R15 commit 35 | CLEAN |
  | R17 F15 | PostgREST DML lockdown for validation_state | §3.3.2 carries full contract at line 330; DDL has REVOKE block | CLEAN |
  | R17 F16 | mint RPC full-replace DELETE-BEFORE-UPSERT for crew_members | §3.3 lockstep was silent on full-replace (peer) | **Fixed commit 46** |
  | R17 F17 | schema-test pattern psql vs supabase-js | plan-only surface, no spec prose to drift | CLEAN |
  | R19 F18 | drive_file_id UPPERCASE canonical case | §3.3.2 predicate (m) carries clarification; no other section references | CLEAN |
  | R19 F19 | show_share_tokens self-heal in mint RPC | §3.3 lockstep contradicted §3.3.2 (F21 itself) | Fixed commit 45 |

  **Peers beyond F21 itself: 2** (R17 F16 lockstep silence + canonical-env-var-map cross-link ambiguity). Below 3-peer threshold → commit 48 (prose-consistency structural defense) NOT FIRED. If R22 surfaces another prose-contradiction peer, structural defense for the prose-contradiction class fires at R23.

  **F10-class structural-defense redesign — assertion design + RED→GREEN evidence:**
  - Surface targeted: every spec table-body row enumerating at least one canonical `VALIDATION_*` env var literal by name (not the wildcard `VALIDATION_*` glob which appears in prose like "Set VALIDATION_* env vars in Vercel").
  - Contract: such a row MUST EITHER (a) list all 4 canonical vars verbatim, OR (b) carry an explicit subset reason inline (`3 vars` + `J3-claim-email NOT required` / `J3-claim-email is omitted` / `not-subject-to-meta: <reason>`).
  - RED verify: stashed §9.1.2 patch and re-ran — assertion fails at `:816` reseed row with `missing: VALIDATION_J3_CLAIM_EMAIL`. Restored spec.
  - GREEN verify: post-R21 commits 44 + 46, assertion passes against current HEAD.
  - Meta-test regression: 9/9 pass (baseline 8/8 + new F20-canonical-tables-completeness assertion = 9 total).

- **Same-vector status post-R21:**
  - **F10-class: 3 rounds, threshold-3 BREACHED at R20.** R21 shipped deeper structural defense (canonical-tables-completeness guard) + enlarged (A) audit (Dim 6 + 7). If R22 surfaces another F10-class hit, the structural defense was incomplete → escalate to contract-level inline assertions OR multi-table grep + 4-var enumeration walker.
  - **F19-class / prose-contradiction-after-amendment class:** R20 surfaced; R21 patched F21 per-instance + swept R13-R19 amendments (2 peers found: R17 F16 lockstep + cross-link). Below 3-peer threshold; per-instance defense for now. R22+ same-vector hit → structural defense at that round.
  - F18-class still closed.
  - All previous classes still closed (resolver-outcome R6-R8, F6/F7/F9, phantom-metatest R11+R12, F11-class, F15/F17, F16-class R16-R19).

### Amendment R22 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `9e7e6fc` (post-R21)
- **Verdict:** **needs-attention** (2 HIGH F21-class peers + 1 MEDIUM anti-tautology on R21 structural defense)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F22 | HIGH | `03-phase0-tooling-reseed.md:7` (Phase 0.C plan summary + commit template + failure-mode prose) | **F21-class same-vector recurrence (round 2).** Plan opens with "no direct write to show_share_tokens is needed" — direct contradiction of R19 F19 + R21 F21 self-heal contract. Same file also has trigger-only commit template + failure-mode pointing operator to manual SQL backfill. **R21 (C) class-sweep audited SPEC peers but missed PLAN summary/template/failure-mode prose surfaces.** Implementer following the plan summary or commit template can omit the self-heal block or paper over a missing block with manual SQL → exact F19 failure mode regressed. |
  | F23 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:160` (spec OAuth-claim reversibility prose) | **F21-class same-vector recurrence (round 2, second peer).** Spec :160 says "next --combo all creates affected rows with fresh ids"; :175-area canonical cleanup contract says reseed preserves stable id + resets `claimed_via_oauth_at` to NULL. Actual mint RPC uses `ON CONFLICT (show_id, name) DO UPDATE` (ids preserved). **R21 (C) class-sweep reported "R13 F11 CLEAN" — missed the fresh-id/recreate wording at :160.** Spec-canonical contradiction can lead implementer to DELETE+INSERT claimed rows or write tests expecting cookie invalidation, breaking the row-stability contract J3 walk relies on. |
  | F24 | MEDIUM | `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts:490-495` (F20-canonical-tables-completeness assertion) | **Anti-tautology gap in R21 structural defense.** Subset row with explicit marker passes if ≥1 canonical literal present; doesn't verify ALL non-omitted vars. A future row "3 vars; J3-claim-email NOT required: VALIDATION_SUPABASE_URL" would pass while silently omitting 2 of 3 required Supabase vars — the same incomplete-CLI-contract class the guard is meant to prevent. Repair: derive expected set from stated reason; require all non-omitted canonical vars present; add negative fixture/assertion. |

- **Same-vector status post-R22:**
  - **F21-class (prose-contradicts-newly-amended-contract): 2 rounds** (R20 F21 + R22 F22+F23). R22 surfaced 2 distinct F21-class peers in ONE round → R21 (C) sweep demonstrably incomplete. R23 MUST do comprehensive re-analysis of F21-class surfaces at DEEPER scope (plan summary openers + commit templates + failure-mode catalogs + spec narrative outside §-amended subsections + handoff sections + .env templates).
  - Threshold-3 calibration: if R23 (A) audit surfaces 1+ more F21-class peer beyond F22+F23, **structural defense mandate fires** per M12 plan R5 precedent (defense in same commit series). Given R21's sweep missed multiple obvious surfaces, trigger is **likely** to fire at R23.
  - F10-class threshold-3 BREACH closed in R21; F24 is permissiveness gap WITHIN the R21 assertion (anti-tautology), not a missed F10-class surface.
  - All other classes still closed.

- **Repair commit:** closed in R23 (see below).

### Amendment R23 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `e0eee2c` (post-R23 HEAD)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R24 adversarial review**
- **(A) F21-class comprehensive re-analysis at DEEPER scope** (mandated by R20+R22 same-vector recurrence; audit went beyond R21 (C)'s spec-only/per-section coverage to include plan summary openers, RPC narrative, commit templates, failure-mode catalogs, spec narrative outside §-amended subsections, handoff §6/§11, .env templates):

  | Amendment | Peer surface(s) found | Status |
  |---|---|---|
  | R13 F10 | none | CLEAN |
  | R13 F11 (reseed PRESERVES id + RESETs claim) | spec :160 "fresh ids" / "re-creates affected rows" (**F23 named**); 00-overview.md:153 "fresh crew_members.id" (**adjacent peer**) | Fixed commits 49 + 51 |
  | R15 F13/F14/Dim-3 | none | CLEAN |
  | R17 F15 | none | CLEAN |
  | R17 F16 | none | CLEAN |
  | R17 F17 | none (plan-only surface) | CLEAN |
  | R19 F18 | none | CLEAN |
  | R19 F19 (show_share_tokens self-heal) | plan 03:5 opener + :194 RPC narrative + :584-586 commit template + :740 verification + :863 failure-mode (**F22 named** — 5 sub-surfaces in one file as one finding) | Fixed commit 48 |

  **Total F21-class peers in R23 audit: 3** (F22 multi-surface cluster + F23 + 00-overview.md adjacent). **Threshold-3 fired** → structural defense ships in same commit series per M12 plan R5 precedent (commit 52).

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 48 | `a204054` | docs(plan-m12): R23 F22 — plan §03 dual-source-sentinel rewrite across 5 surfaces |
  | 49 | `555ae16` | docs(spec-m12): R23 F23 — spec :160 stable-id alignment with canonical cleanup contract |
  | 50 | `75c3095` | test(cross-cutting): R23 F24 — F20 subset-cardinality fix + negative-case assertion |
  | 51 | `78b1152` | docs(plan-m12): R23 (A) F23-class adjacent peer — 00-overview.md row-stability alignment |
  | 52 | `e0eee2c` | test(cross-cutting): R23 F21-class structural defense — dual-source-sentinel + stable-id prose-consistency guard |

- **F22 repair (commit 48):** plan `03-phase0-tooling-reseed.md` 5 surfaces rewritten as dual-source sentinel — opener :5 ("show_share_tokens row maintained by **dual-source sentinel** — trigger on initial INSERT + mint RPC self-heal on UPSERT update-path; manual SQL backfill is NOT a normal repair path"); RPC narrative :194; commit template :584-586 ("DUAL-SOURCE SENTINEL" / "self-heal is load-bearing — NOT trigger-only"); verification comment :740; failure-mode :863 (resolution = re-run `pnpm validation:reseed`; manual SQL NOT a recurring repair step). All references aligned with §3.3.2 / §3.3 lockstep / mint RPC body contract.

- **F23 repair (commit 49):** spec :160 rewritten to align with canonical cleanup at :175 — "ON CONFLICT (show_id, name) DO UPDATE SET ..., claimed_via_oauth_at = NULL clause **preserves the stable crew_members.id while resetting claimed_via_oauth_at to NULL** ... devices holding stale cookies remain valid." Cross-links R13 commit 31 F11 + R23 commit 49 F23.

- **F24 repair (commit 50):** F20-canonical-tables-completeness assertion extracted into pure `evaluateCanonicalTableRow(line, canonicalVars)` helper with cardinality logic. 5 rules: (1) full 4-var → passes; (2) `not-subject-to-meta:` waiver → passes; (3) J3-omission marker requires ALL 3 SUPABASE_* vars present; (4) `<N> vars` cardinality must equal canonical-literals count; (5) cardinality + omission cross-checked. 5 negative-case fixtures inline (broken-subset, full-claim-with-missing, subset-marker-zero-vars, etc.) — all fail as expected. RED→GREEN: pre-R23 helper (`presentVars.length >= 1`) returned null for broken-subset; post-R23 helper returns finding with `missingVars=[SECRET_KEY, PROJECT_REF]`.

- **00-overview.md:153 adjacent peer (commit 51):** "fresh crew_members.id with null claimed_via_oauth_at" → "ON CONFLICT...DO UPDATE clause, which **preserves the stable `crew_members.id`** while resetting `claimed_via_oauth_at` to NULL." Cites R13 commit 31 + R23 commit 51.

- **F21-class structural defense (commit 52):** 2 new tests in `reseed-clears-oauth-claim-doc-guard.test.ts`:
  - **Live-spec assertion** (`F21-class prose-consistency`): grep-walks every M12 doc surface (spec + plan tree + handoff with §15 audit-trail + EXCLUDED_PATHS exclusions) for 4 forbidden-pattern regexes (no-direct-write / trigger-only-sentinel / fresh-ids / re-creates-affected-rows). Escape hatches: corrective-negation lookbehind `(?<!\b(?:not|no\s+longer|never)\s+(?:a\s+)?)`; historical-qualifier lookback ~200 chars; explicit `<!-- not-f21-class: -->` waiver. PASSES against R23 HEAD.
  - **Negative-case unit test**: 4 broken fixtures trigger the regex; 5 passing fixtures (corrective negation / historical frame / waiver / `no longer` prefix / canonical) pass.
  - RED demonstration witnessed during authoring: commit-48 rewrite contained "NOT a trigger-only sentinel"; regex initially fired (false positive); tightened with corrective-negation lookbehind; converged GREEN. Iteration itself = structural-defense RED→GREEN witness.

- **Meta-test regression:** **12/12 PASS** (was 9 pre-R23; +F24 negative-case + F21-class main + F21-class negative-case = 12).

- **Same-vector status post-R23:**
  - **F21-class: 2 finding-rounds (R20 + R22).** R23 closed per-instance (F22 + F23 + 00-overview adjacent) + shipped structural defense at threshold-3 trigger. Defense is regex-based with corrective-negation/historical/waiver escape hatches. **If R24 surfaces an F21-class peer NOT caught by the 4 regexes,** structural-defense extension (additional regex / fact-table assertion) is next escalation per M12 plan R5 calibration.
  - F10-class threshold-3 BREACH closed in R21; F24 was anti-tautology gap within the R21 assertion; R23 commit 50 tightened with cardinality logic + negative-case.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 2 commits to `tests/cross-cutting/` (R23 commits 50 + 52). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

### Amendment R24 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `1f7f6d1` (post-R23 + R22/R23 handoff rows)
- **Verdict:** **needs-attention** (1 HIGH — F25 = F10-class **4th-round** same-vector hit)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F25 | HIGH | `03-phase0-tooling-reseed.md:33` (Task 0.C.1 `scripts/validation-reseed.ts` env-var enumeration) | **F10-class 4th-round same-vector hit.** Task 0.C.1 enumerates only 3 env vars (URL + SECRET_KEY + PROJECT_REF) for the reseed script; contradicts canonical §9.1.2 contract requiring `VALIDATION_J3_CLAIM_EMAIL` so R1 `alias_5a_lead` is seeded with real Google account and predicate (k) fails early. **Implementer following the plan can ship a reseed skeleton/help/env-parser without claim email, leaving J3 unwalkable or failing late.** Codex's exact phrasing: "The new F20 guard does not catch this because it scans spec table rows, not plan prose." Repair: add `VALIDATION_J3_CLAIM_EMAIL` to Task 0.C.1 env list AND extend the F10-class structural defense to cover plan-side per-command env-var prose. |

- **F10-class structural-defense calibration escalation:**
  - F10-class is now at **4 rounds** (R12 F10 + R14 F13/F14 + R20 F20 + R24 F25). Per AGENTS.md "Structural-defense calibration (M12 plan R5 amendment)": "if the round after the comprehensive re-analysis STILL surfaces a finding on the same vector, the analysis was incomplete — stop patching, declare the vector unresolved, and deep-dive until convergence is structural (not per-instance)."
  - Honest diagnosis: each F10-class round revealed a NEW syntactic-form dimension that prior defenses didn't cover. R15 defense scoped to PROSE (J3-OAuth-claim sites); R21 defense scoped to spec markdown TABLES (§9.1.2); F25 surfaces plan-side TASK env-var enumerations (Task 0.C.1 list-item-style). Each defense was correct WITHIN its scoped surface but the class is broader than per-syntactic-form coverage can incrementally close.
  - **R25 mandate: contract-level structural defense** — single canonical env-var contract surface + cross-reference validation OR exhaustive walker over the UNION of all surfaces that can name VALIDATION_* env vars (spec tables + plan task lists + plan prose + .env templates + commit templates + failure-mode catalogs). Per-syntactic-form regex extensions have proven inadequate over 4 rounds.

- **Repair commit:** closed in R25 (see below).

### Amendment R25 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `fae1407` (post-R25 HEAD)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R26 adversarial review**
- **F10-class structural-defense calibration response:** Per R24 mandate, R25 ships **contract-level** structural defense (NOT per-syntactic-form regex extension). Design: Option B+C hybrid — walker scans every M12 doc surface for env-var enumeration CLUSTERS via `COLON_LIST_FRAME_RX` filter to own-enumeration sites; applies canonical-4-or-explicit-subset rule using reused R23 F24 `evaluateCanonicalEnvVarCluster()` helper (sibling of `evaluateCanonicalTableRow()` adapted to non-table contexts with ±5-line cluster windows).

  **Critical design decision: cross-reference exemption REMOVED** after the walker prototype caught F25 — F25's exact line cited "spec §9.1.2:" YET listed only 3 vars. Citation alone is insufficient; every own-enumeration must satisfy the canonical contract regardless of cross-reference. Documented in test body.

- **(B) F10-class full-sweep peer-survey** (post-defense walker, broader than any prior round):

  | Surface | Classification | Status |
  |---|---|---|
  | spec §3.3 step 5 (:144) | own-enumeration, 4 vars verbatim | PASS |
  | spec §9.1.2 canonical table (:818-:821) | F20/F24 covered | PASS |
  | spec §15 audit-trail (:1088, :1119) | excluded | n/a |
  | plan 01:18 ("for §3.3 step 5 env vars: ..." subset) | BORDERLINE peer — colon-frame regex doesn't catch this shape | **Fixed commit 55 defensively** |
  | plan 01:73 (wildcard "4 new VALIDATION_*") | not a cluster | PASS |
  | plan 01:96-123 (.env.local.example template, 4 vars over 30 lines) | cluster-window-covered + §9.1.2 cross-ref at :91 | PASS |
  | plan 01:139-143 (commit-msg template, 4 vars multi-line) | PASS | PASS |
  | **plan 03:33 (F25 Task 0.C.1)** | **own-enumeration, 3 vars — F25 named** | **Fixed commit 53** |
  | plan 06:185 (J3-walk procedure) | J3-only context, not env-var contract | n/a |

  **Total peers beyond F25 named: 1** (01-phase0-infra.md:18, BORDERLINE). Below 3-peer threshold; per-instance defensive fix sufficient.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 53 | `3be1116` | docs(plan-m12): R25 F25 — Task 0.C.1 env-var list adds VALIDATION_J3_CLAIM_EMAIL + cross-ref to §9.1.2 |
  | 54 | `8c81430` | test(cross-cutting): R25 F10-class CONTRACT-LEVEL structural defense — env-var-cluster walker |
  | 55 | `fae1407` | docs(plan-m12): R25 (B) sweep peer — 01-phase0-infra.md:18 explicit 3-var subset marker |

- **F25 repair (commit 53):** Task 0.C.1 Step 3 env-var list at plan `03:33` rewritten — "Required env vars per spec §9.1.2 (the canonical CLI command-by-command env-var map): reseed's row in the §9.1.2 table enumerates **4 vars** — `VALIDATION_SUPABASE_URL`, `VALIDATION_SUPABASE_SECRET_KEY`, `VALIDATION_SUPABASE_PROJECT_REF`, `VALIDATION_J3_CLAIM_EMAIL` (R13 commit 30 amendment + R21 commit 44 §9.1.2 4-var per-row completeness). Do NOT inherit a 3-var subset by shorthand."

- **F10-class contract-level structural defense (commit 54):** New `evaluateCanonicalEnvVarCluster()` helper + walker assertion in `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts`:
  - **Cluster detection:** `COLON_LIST_FRAME_RX` matches `"Required env vars|env vars per|MUST be set|all four env|four VALIDATION_|four new VALIDATION_|four env vars" + [up to 80 chars] + ":" + canonical-literal` — filters to own-enumeration sites; excludes per-predicate narratives, single-var code citations, wildcard prose.
  - **§9.1.2 table exclusion:** section-heading tracking skips canonical table rows already covered by R21 F20 + R23 F24.
  - **Cross-reference exemption REMOVED:** test body documents why (F25 itself cited §9.1.2 while contradicting it).
  - **Negative-case test:** synthetic F25-shape + "MUST be set" + cardinality-mismatch + missing-SUPABASE_* fixtures all fire; full-4 + valid-subset + waiver pass.
  - **RED phase:** pre-R25 HEAD walker reports 1 finding at `03-phase0-tooling-reseed.md:33` with diagnostic "cluster references VALIDATION_* but does not list all 4 canonical env vars AND does not carry an explicit subset marker; missing: VALIDATION_J3_CLAIM_EMAIL." **GREEN phase:** R25 HEAD walker reports 0 findings.

- **Meta-test regression:** **14/14 PASS** (was 12/12 pre-R25; +F25 walker main + F25 walker negative-case = 14).

- **Same-vector status post-R25:**
  - **F10-class: 4 rounds, contract-level defense shipped.** Walker is syntactic-form-agnostic within its `COLON_LIST_FRAME_RX` filter. **One known gap (documented):** the "for §3.3 step 5 env vars: ..." shape at plan 01:18 didn't match the colon-frame regex (caught only by the (B) human sweep, fixed defensively at commit 55). If R26 surfaces an F10-class peer via a syntactic shape NOT in the regex set, the choice is either (i) broaden the regex (risking false positives on legitimate cross-references) OR (ii) escalate to Option D refactor (single source of truth + structural exclusivity).
  - F21-class structural defense (R23 commit 52) regression-clean.
  - F18-class still closed.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (commit 54). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

- **Open question (flagged by implementer):** "The (B) peer at `01-phase0-infra.md:18` is BORDERLINE — the walker's tight `COLON_LIST_FRAME_RX` does NOT catch the 'for [section-ref] env vars:' shape. The peer fix is defensive (adds explicit subset marker) but a future regression in that exact syntactic form would not be CI-caught. Trade-off: broadening the regex risks false positives on legitimate cross-references."

### Amendment R26 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `f131bdb` (post-R25 + R25 handoff row)
- **Verdict:** **needs-attention** (2 HIGH + 1 MEDIUM)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F26 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:351` (spec predicate (b)) | **NEW TZ-pin class — spec-level contract drift.** Predicate (b) text says check-seed fails when `last_seed_date != current_date`; same paragraph promotes `$VALIDATION_TODAY_ISO` (CLI-pinned UTC). Implementer following canonical sentence can reintroduce TZ-skew class around UTC/local midnight. Task 0.C.8 `validation-tooling-tz-pin.test.ts` is plan-spec'd to catch this at Phase 0.C execution, but spec is canonical → per-instance fix mandatory at R27. Repair: replace `current_date` with `$VALIDATION_TODAY_ISO` in predicate (b); extend Task 0.C.8 tz-pin test scope to flag `current_date` in check-seed contract. |
  | F27 | HIGH | `03-phase0-tooling-reseed.md:284-288` (mint RPC ON CONFLICT UPDATE SET clause) | **F16-class same-vector recurrence (3rd round, NEW sub-shape — SET-clause-column completeness).** Mint RPC INSERTs with `archived=false` + `published=true` but ON CONFLICT UPDATE only refreshes `title/dates/last_seen_modified_time`. If validation show is archived/unpublished during manual exercise, reseed can't restore baseline; predicate (f) blocks walks. **R19 (A) F16-class audit was trigger-focused; missed SET-clause-column completeness dimension.** Per AGENTS.md same-vector rule, R27 MUST do comprehensive re-analysis of F16-class at SET-clause-column scope (enumerate every `public.shows` column the mint RPC writes; verify each is in UPDATE SET or carries documented exception). |
  | F28 | MEDIUM | `00-overview.md:63` (M12 file inventory) | **F10-class 5th round** — cardinality-only "3 new VALIDATION_* vars" omits J3_CLAIM_EMAIL. R25 walker (`COLON_LIST_FRAME_RX` + canonical literals) can't catch this because there are no canonical literals to evaluate (wildcard `VALIDATION_*` + cardinality alone). Per R25 documented escalation ladder + AGENTS.md "structural-defense calibration" rule: F10-class converging structurally only via **Option D refactor** (single source of truth + structural exclusivity). **Orchestrator decision 2026-05-26: Option D adopted; R27 refactors all own-enumerations outside §9.1.2 + `.env.local.example` to cross-references; walker redesigned to assert structural exclusivity.** |

- **Same-vector + structural-defense status post-R26:**
  - **F10-class: 5 rounds (R12 + R14 + R20 + R24 + R26).** R25's contract-level cluster-walker had a documented gap (cardinality-only patterns); R26 surfaced exactly that shape. Per R25 row's documented ladder + AGENTS.md "structural-defense calibration": Option D refactor mandate fires at R27. **No more walker-extension rounds.** Walker redesigned to enforce "no own-enumeration outside canonical §9.1.2 + `.env.local.example`."
  - **F16-class: 3 rounds (R16 F16 crew_members orphan + R18 F19 share-token trigger-bypass + R26 F27 SET-clause-column).** Each round revealed a NEW sub-shape (DELETE-stale-rows vs trigger-bypass vs SET-clause completeness). R19 (A) audit was trigger-scoped — F27 surfaces the SET-clause dimension. R27 MUST do comprehensive re-analysis at SET-clause-column scope. Threshold-3 calibration: if R28 surfaces another F16-class hit, structural-defense mandate (per M12 plan R5 precedent — defense in same commit series).
  - **NEW class: TZ-pin contract drift between write-side and read-side (F26).** Plan-spec'd test at Task 0.C.8 will close this at Phase 0.C execution; R27 ships per-instance fix + extends Task 0.C.8 scope.
  - F21-class structural defense (R23 commit 52) regression-clean.
  - F18-class still closed.
  - All other classes still closed.

- **Repair commit:** pending R27 implementer dispatch (inline Agent; Option D refactor).

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

- **Handoff format convention** — this doc is the single milestone handoff per project convention (mirroring `M11.5-crew-auth-pivot.md`). Round-by-round audit lives inline in §"Convergence log"; per-round files (`round-NN.md`) are NOT used in this project. The pre-rebase M12 plan author had introduced a per-round-file anomaly which the consolidation commit at HEAD `5cd84d8` retired.

---

## §12 — Per-phase handoff plan (Phase 0+)

Per M11 precedent (`docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/handoffs/A-foundation.md` … `G-affordance-retrofit.md`), code-producing phases with their own Codex adversarial-review cycle get a per-phase handoff. Each per-phase handoff is authored **at phase kickoff** (not pre-emptively) and lives at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/handoffs/<phase>-<name>.md`. The per-phase handoff carries: scope summary, acceptance criteria, watchpoints, test commands, sandbox/git protocol, AND its own per-phase Codex convergence log. The milestone handoff (this doc) indexes them in the table below as they land.

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
