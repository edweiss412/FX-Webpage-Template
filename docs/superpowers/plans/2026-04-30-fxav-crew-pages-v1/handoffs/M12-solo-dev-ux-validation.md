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

- **Repair commit:** closed in R27 (see below).

### Amendment R27 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `cb9c319` (post-R27)
- **Dispatch mode:** inline Agent (HEAVIEST round: Option D refactor + F16-class comprehensive re-analysis at SET-clause-column scope + 3 per-instance fixes)
- **Verdict:** **implementer-complete; pending R28 adversarial review**
- **F10-class Option D refactor (mandated by orchestrator decision 2026-05-26 per R25 escalation ladder + 5-round same-vector recurrence):**

  | Surface refactored | Form |
  |---|---|
  | spec :144 (§3.3 step 5 Target selection) | 4-var inline list → cross-ref to §9.1.2 + `not-subject-to-meta` waiver on lone SUPABASE_URL mention in localhost-rejection clause |
  | plan 03:33 (Task 0.C.1 Step 3) | 4-var enumeration → cross-ref; "§9.1.2 is the SOLE source of truth ... no inline-list" |
  | plan 01:18 (Task 0.A.4 Step 5) | 3-var capture-values shorthand → cross-ref; "Step 5 deliberately does NOT inline-list" |
  | plan 01:139-150 (commit-msg template) | 4-var multi-line → cross-ref; "this commit message intentionally does not re-list them" |
  | plan 00-overview.md:63 (F28 named) | "3 new VALIDATION_* vars" cardinality-only → cross-ref to §9.1.2 |
  | **EXEMPTIONS** with `<!-- canonical-env-var-source: keep -->` marker | spec §9.1.2 canonical table (IS the source of truth); plan 01:91-123 `.env.local.example` template block (operator-facing config with literal values) |

- **F10-class walker REDESIGN (commit 59):** structural-exclusivity model (replaces R25 contract-level satisfiability):
  - **M1 same-line detection**: line names ≥2 distinct canonical literals AND literals are in list proximity (≤80 chars short-connector text between; sentence boundaries / `predicate (X)` citations / `diagnostic` / `check-seed` markers disqualify).
  - **M2 fenced-block detection**: cluster lives inside contiguous fenced code block with ≥2 distinct canonicals.
  - **Exemptions** (5 types): §9.1.2 heading scope; `canonical-env-var-source: keep` marker within ±60 lines; ALL canonical-mentions are `process.env.X` real-code references; same-line cluster inside fenced code block; explicit `<!-- not-f28-class: -->` waiver.
  - **RED phase verified**: stashed commit 58; walker fired **7 findings** (plan 01:18 same-line + plan 01:96/97/98/123/143 fenced-block + plan 03:33 same-line).
  - **GREEN phase**: post-refactor HEAD → 0 findings.
  - Retired R25 helper kept with `_evaluateCanonicalEnvVarCluster_retired_R27` prefix for design-evolution documentation.

- **(B) F16-class comprehensive re-analysis at SET-clause-column scope** (mandated by 3-round same-vector recurrence; R19 (A) audit was trigger-scoped):

  | Column | INSERT? | UPDATE SET? | Disposition |
  |---|---|---|---|
  | `id` / `drive_file_id` / `created_at` | (varies) | no | auto-generated / PK conflict target / audit-trail immutable |
  | `slug` / `client_label` / `template_version` | YES | no | exception: deterministic constant or hard-coded value (never drifts) |
  | `title` / `dates` / `last_seen_modified_time` | YES | YES | refreshed correctly |
  | **`archived` / `published`** | YES (`false`/`true`) | **NO → R27 ADDED in commit 57** | **F27 FIX** |
  | `picker_epoch` / `picker_epoch_bumped_at` | no | no | **DELIBERATE exception**: admin may rotate during M11.5 admin-action walks; reseed MUST NOT reset (owned by `reset_picker_epoch_atomic` RPC) |
  | venue/event_details/agenda_links/diagrams/coi_status/pull_sheet/last_sync_*/opening_reel_*/unpublish_*/client_contact | no | no | n/a — never written by mint RPC |

  **Peers beyond F27 named: 0** (audit found ONLY archived + published needing SET clause addition; all other INSERT-only columns have documented exceptions). Below 3-additional-column threshold → structural-defense-acceleration NOT fired. Per-column audit table added inline at plan 03 line 284 area as living documentation.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 56 | `e1fd08d` | docs(spec-m12)+docs(plan-m12): R27 F26 — predicate (b) TZ-pin fix + Task 0.C.8 scope extension |
  | 57 | `e6416c6` | docs(plan-m12)+docs(spec-m12): R27 F27 — mint RPC SET clause adds archived/published + predicate (n) baseline-eligibility + per-column audit + regression spec |
  | 58 | `a2f852c` | docs(spec-m12)+docs(plan-m12): R27 F10-class Option D refactor — own-enumerations → cross-references at all surfaces except §9.1.2 + .env.local.example |
  | 59 | `cb9c319` | test(cross-cutting): R27 F10-class walker REDESIGN — structural-exclusivity assertion + F20 waiver on §3.3 cross-ref row |

- **F26 repair (commit 56):** spec :351 predicate (b) rewritten — "`last_seed_date != $VALIDATION_TODAY_ISO` (R27 commit 56 F26 amendment — TZ-pin alignment with predicate (i); prior `current_date` framing read Postgres server clock and reintroduced UTC-vs-local-midnight skew class. DB-side `current_date` reserved for bounded-skew sanity check inside mint RPC per R11 F9 fix at plan 03 line 242)." Task 0.C.8 `validation-tooling-tz-pin.test.ts` scope-extended at plan 03:766 to scan `scripts/validation-check-seed.ts` predicate bodies for `current_date` vs `$VALIDATION_TODAY_ISO`.

- **F27 repair (commit 57):** mint RPC ON CONFLICT UPDATE SET clause (plan 03:284-289) adds `archived = false` + `published = true` with inline comment ("R27 commit 57 F27 amendment — restore baseline eligibility"). Predicate (n) added to spec §3.3.2: "For every seeded validation show, `archived = false AND published = true` after fresh `--combo all` reseed; catches F16-class failure where mint RPC ON CONFLICT UPDATE SET omits these." Predicate count: 10 → 11 (a-g, i, k, l, m, **n**). Regression spec at plan 03 Task 0.C.5 Step 1 + Step 5 — set `archived = true` before reseed → reseed → assert post-reseed `(archived=false, published=true)` AND check-seed PASS.

- **F28 repair (commit 58, folded into Option D refactor):** plan 00-overview.md:63 → ".env.local.example ... documents the new VALIDATION_* env vars per the canonical CLI command-by-command env-var contract at spec §9.1.2 (R27 commit 58 F10-class Option D refactor — §9.1.2 is the SOLE source-of-truth surface authorized to enumerate the literal env-var names; this overview row deliberately does NOT inline-list them, only states VALIDATION_JWT_SIGNING_SECRET retired with Phase 0.D)."

- **Meta-test regression:** **14/14 PASS** (was 14/14 baseline pre-R27; walker REDESIGN replaced R25 satisfiability 2 tests with R27 structural-exclusivity 2 tests; total count preserved).

- **Same-vector + structural-defense status post-R27:**
  - **F10-class: 5 rounds; Option D refactor + structural-exclusivity walker shipped at R27.** Class structurally closed at the prose-level: only §9.1.2 + `.env.local.example` may have own-enumerations; everything else is a cross-reference. If R28 surfaces an F10-class peer DESPITE structural exclusivity, the walker's detection rules (M1+M2 + 5 exemptions) need refinement OR the structural exclusivity is being bypassed via a syntactic form the walker doesn't recognize as an own-enumeration.
  - **F16-class: 3 rounds; comprehensive re-analysis at SET-clause-column scope shipped at R27.** Per-column audit found 0 additional invariant-bearing columns needing SET clause addition. **Threshold-3 calibration:** if R28 surfaces another F16-class hit, structural-defense mandate (defense in same commit series; candidate: doc-guard asserting every-INSERT-column-also-in-UPDATE-SET-or-documented-exception).
  - **NEW TZ-pin class (R26 F26):** per-instance fix landed; Task 0.C.8 plan-spec'd test scope extended to enforce at Phase 0.C execution.
  - F21-class structural defense (R23 commit 52) regression-clean.
  - F18-class still closed.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R27 commit 59). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `.env.local.example` (the template file's content was NOT modified — Option D refactor only added the `canonical-env-var-source: keep` marker comment at the enclosing plan §-block).

### Amendment R28 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `97019cc` (post-R27 + R27 handoff row)
- **Verdict:** **needs-attention** (1 HIGH F29 + ≥3 adjacent F29-class peers per orchestrator sweep)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F29 | HIGH | `01-phase0-infra.md:140-141` (Task 0.A.5 Step 3+4) | **F10-class 6th round** — non-template checklist prose still has cardinality/wildcard contract references the R27 walker doesn't detect: "the four env vars" (cardinality-only) + "SUPABASE_* trio" (wildcard shorthand) + names `VALIDATION_J3_CLAIM_EMAIL` in single-var citation. **R27 Option D structural-exclusivity walker counts ≥2 canonical literals; cardinality + wildcard + single-citation shapes have nothing for the walker to count.** Additional concern: `canonical-env-var-source: keep` marker ±60-line window may exempt nearby prose if literals later added. |

- **Orchestrator sweep (F29-class adjacent peers, not in codex finding):**
  - `00-overview.md:175` — "Set 3 VALIDATION_* env vars" (cardinality + objectively WRONG count, should be 4 post-R13)
  - `01-phase0-infra.md:73` — "document the 4 new VALIDATION_* env vars" (cardinality + wildcard + single-var citation `VALIDATION_J3_CLAIM_EMAIL`)
  - `01-phase0-infra.md:179` — "Four VALIDATION_* env vars set in Vercel Production scope" (cardinality + wildcard)
  - `01-phase0-infra.md:150` (commit-msg template) — "VALIDATION_* env vars in .env.local.example" (wildcard-only; borderline — within commit-msg template context which already has R27 cross-ref)
  - spec `:758` — "VALIDATION_* env vars in Vercel + locally" (wildcard-only; minor, in §-overview table)

- **F10-class 6-round same-vector status:**
  - The Option D structural-exclusivity MODEL is correct; only §9.1.2 + `.env.local.example` should contain env-var contract enumerations of ANY syntactic form. R27's walker detection rules (M1 ≥2-canonical proximity + M2 fenced-block) catch literal-enumeration shapes but miss cardinality + wildcard + single-citation shapes.
  - Honest diagnosis: every F10-class round has revealed a new syntactic dimension. The Option D MODEL is the structural answer; what R28 surfaces is a DETECTION refinement need, not a MODEL redesign need. R27 walker correctly catches "lists ≥2 canonical literals," but the contract can be referenced in prose via cardinality / wildcard / single-citation without being a literal enumeration.
  - **R29 mandate:** (i) refine walker with M3 (cardinality + wildcard detection: "[N] VALIDATION_*", "[N] env vars", "SUPABASE_* trio", "all (four/three) env vars") + M4 (single-var-citation-in-contract-prose with disambiguation from single-var-operational-instruction); (ii) tighten `canonical-env-var-source: keep` marker semantics to only exempt the immediate fenced block, not ±60-line window; (iii) per-instance fix F29 + the 3+ adjacent peers swept by orchestrator; (iv) negative fixtures proving the new detection shapes fire.

- **Repair commit:** closed in R29 (see below).

### Amendment R29 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `2d9925d` (post-R29)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R30 adversarial review**

- **Per-instance peer rewrites** (5 surfaces refactored from cardinality/wildcard/single-citation to cross-refs OR M4-disambiguated operational instructions):

  | Surface | Was | Became |
  |---|---|---|
  | 00-overview.md:175 | "Set 3 VALIDATION_* env vars" | "Set the M12 validation env vars per spec §9.1.2 (canonical CLI command-by-command env-var contract)" |
  | 01-phase0-infra.md:73 | "document the 4 new VALIDATION_* env vars; ... R13 commit 30 amendment adds VALIDATION_J3_CLAIM_EMAIL" | "document the M12 validation env vars per spec §9.1.2 — the canonical CLI command-by-command env-var contract; §9.1.2 is the SOLE source of truth" |
  | 01-phase0-infra.md:140 (F29 Step 3) | "Set the four env vars in Vercel ... SUPABASE_* trio ... VALIDATION_J3_CLAIM_EMAIL" | cross-refs §9.1.2; new Step 3a labeled "Operational note — set VALIDATION_J3_CLAIM_EMAIL to dev's real Google account email" (single-var operational, M4-disambiguated) |
  | 01-phase0-infra.md:141 (F29 Step 4) | "Set the four env vars locally" | "Mirror those env-var values into .env.local" |
  | 01-phase0-infra.md:179 | "Four VALIDATION_* env vars set in Vercel Production scope" | "M12 validation env vars ... per the canonical CLI command-by-command env-var contract at spec §9.1.2" |

  Borderline cases left as-is: 01:150 (commit-msg template wildcard-only, no cardinality, surrounding lines already cross-ref §9.1.2); spec :758 (§-overview table wildcard-only, acceptable shape).

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 62 | `c1f0ea5` | docs(plan-m12): R29 F29 + adjacent peers — cardinality/wildcard/single-citation prose → cross-references to §9.1.2 |
  | 63 | `2d9925d` | test(cross-cutting): R29 F10-class walker REFINEMENT — M3 + M4 + marker tightening + negative fixtures |

- **Walker M3 + M4 refinement (commit 63):**
  - **M3 (cardinality + wildcard prose):** 3 sub-patterns — (a) `[1-9N]/three/four/all/the (three|four) + ≤2 short qualifiers + VALIDATION_*`; (b) cardinality + (optional qualifier) + `(env|environment) (vars?|variables?)`; (c) `(VALIDATION_)?SUPABASE_* trio` case-insensitive. Tightened: cardinality must be DIRECTLY adjacent (no 40-char window) so citation digits like "Phase 0.A" / "R27 commit 58" don't trip.
  - **M4 (single-canonical-literal in contract-prose context):** exactly 1 canonical literal on line + COLLECTIVE-SHAPE contract-prose marker on same or previous line. Markers (narrower than orchestrator brief's "env vars" / "credentials" suggestion): `VALIDATION_*`, `the/all (four|three)`, `SUPABASE_* trio` / `VALIDATION_* trio`, `canonical CLI env-var contract/map`. Bare "env vars" / "credentials" deliberately EXCLUDED (would fire on legitimate narrative; rationale: R13/R15 amendment paragraphs + predicate-(k) explanations + J3 walk descriptions).
  - **Disambiguation (8 operational-instruction patterns)** make M4 PASS: `set <VAR> to <X>`; `<VAR> is (undefined/required/missing/absent/empty/null)`; `<VAR> must (be/equal)`; `<VAR> (reads/comes/sourced) from`; `<VAR> is (gitignored/not committed/local-only)`; explicit `Operational note` / `operational instruction` label; `responding at <VAR>`; `values for <VAR>`.

- **Exemption marker tightening (commit 63):** R27's flat ±60-line `canonical-env-var-source: keep` window REPLACED with structural detection — (a) marker inside or immediately above fenced code block → exempts ONLY that fenced block (plan 01:104 `.env.local.example` block); (b) marker inside §-numbered heading scope → exempts until next same-or-higher heading (spec §9.1.2 line-812 marker covers entire §9.1.2 body). No flat-window fallback. Future doc edits cannot accidentally inherit whitelist.

- **RED → GREEN evidence:** pre-R29 docs (`ceb9567`) + new walker → fires 5 findings (00-overview.md:175, 01-phase0-infra.md:73, :140, :141, :179). Confirmed via `git checkout HEAD~1 -- <plan files>` + walker run; restored. Post-R29 docs (HEAD) + new walker → 0 findings.

- **Negative fixtures (8 + 8):**
  - **M3 FIRES**: "the four env vars" / "SUPABASE_* trio" / "Set 3 VALIDATION_*" / "4 new VALIDATION_*" / "Four VALIDATION_*" / "all four env vars" / "the three env vars MUST be set"
  - **M3 PASSES**: "all four artifacts/journeys/stages" (non-env) / "VALIDATION_* env vars in Vercel + locally" (wildcard-only no cardinality)
  - **M4 FIRES**: "names VALIDATION_J3_CLAIM_EMAIL alongside the SUPABASE_* trio for the four env vars" / "the four env vars including VALIDATION_J3_CLAIM_EMAIL" / "documents the 4 new VALIDATION_* env vars including VALIDATION_J3_CLAIM_EMAIL" / "the VALIDATION_* env vars (including VALIDATION_J3_CLAIM_EMAIL) follow the §9.1.2 contract"
  - **M4 PASSES (operational disambiguation)**: "set VALIDATION_J3_CLAIM_EMAIL to your real Google account email" / "throw if VALIDATION_J3_CLAIM_EMAIL is undefined" / "VALIDATION_SUPABASE_URL is required" / "VALIDATION_SUPABASE_PROJECT_REF must be set" / "VALIDATION_J3_CLAIM_EMAIL reads from your local .env.local" / "Operational note: set X to a real Google email" / "responding at VALIDATION_SUPABASE_URL" / "the reseed reads this env var VALIDATION_J3_CLAIM_EMAIL at fixture-build time"

- **Meta-test regression:** **16/16 PASS** (was 14 pre-R29; +F29 walker main + F29 negative-case = 16).

- **Same-vector + structural-defense status post-R29:**
  - **F10-class: 6 rounds; walker DETECTION refinement (M3+M4) + EXEMPTION marker tightening shipped at R29.** Option D MODEL is correct + detection now covers literal/cardinality/wildcard/single-citation shapes. Trade-off: M4 markers narrowed from brief's broader scope to avoid false positives on legitimate narrative. **If R30 surfaces an F10-class peer in a syntactic form NOT caught by M1+M2+M3+M4,** the next escalation per AGENTS.md "stop patching" rule would be (a) further detection refinement (likely brittle), OR (b) accept residual class risk and document the bounded coverage, OR (c) fundamental refactor of doc surfaces to eliminate even cardinality/wildcard references (heaviest).
  - All other classes still closed.

- **Open items flagged by implementer:**
  - Narrower-than-brief M4 markers: brief proposed bare "env vars" / "credentials" as M4 markers; implementer narrowed to collective-shape only because broader markers would fire on legitimate narrative (R13/R15 amendment paragraphs + predicate-(k) explanations + J3 walk descriptions). Documented in walker test comments.
  - 00-overview.md:63 (post-R27 commit 58 cross-ref form): not in R28 sweep; new M3 silent post-tightening (no cardinality directly adjacent). Left as-is.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R29 commit 63). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

### Amendment R30 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `7b0cd64` (post-R29 + R29 handoff row)
- **Verdict:** **needs-attention** (1 HIGH — NEW class)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F30 | HIGH | `04-phase0-tooling-report.md:58-79` (Phase 0.E `validation-report-fixtures` harness) | **NEW class — validation harness producer-state mismatch.** Phase 0.E task writes `reports` rows for all 8 outcomes + expects them in admin UI. But: 429 rate-limit outcomes are driven from `report_rate_limits` (not `reports.context`); failure-mode visibility surfaces via `admin_alerts` / `ErrorExplainer` (not a reports admin page); **no `app/admin/reports` route exists in the repo** (codex confirmed). Implementer following the task can ship a harness that inserts plausible `reports.context` rows, passes its own cleanup test, AND never exercises real failure-mode producers (429 / lookup-inconclusive / orphan-lost-lease / admin-alert rendering). Repair: rewrite per-outcome producer state — seed `report_rate_limits` OR drive `/api/report` for 429s; use submitReport / API fault injection for lookup/lease/orphan; assert actual rendered surface (`ReportModal` error OR `AlertBanner` row); cleanup must remove every table touched (admin_alerts + report_rate_limits + reports). |

- **Same-vector status post-R30:**
  - F30 NEW class — 1 round; no priors. Per AGENTS.md cross-cutting #5, R31 dispatch includes class-sweep for OTHER Phase 0.E (and Phase 0.F smokes) tasks that might have analogous producer-state mismatches.
  - All other classes still closed (F10-class walker M3+M4 + structural-exclusivity model regression-clean; F16-class per-column audit complete; F21-class prose-consistency guard clean; F18 / F26 / F11-class all closed).

- **Repair commit:** closed in R31 (see below).

### Amendment R31 — 2026-05-26 (F30 repair — per-outcome producer map + Phase 0.E rewrite)

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `a5ed46f` (post-R31 plan rewrite; handoff §9 SHA-stamp commit follows)
- **Verdict:** **implementer-complete; pending R32 adversarial review**

- **(A) Per-outcome producer map (codebase grounding).** For each of the 8 `--outcome` enum values from spec §9.1.2 line 824, the real producer state in live code:

  | # | Outcome (CLI flag) | Real producer state — table + RPC + endpoint | Observable UI surface | Cleanup tables (FK order) | File cites |
  |---|---|---|---|---|---|
  | 1 | `success` (admin) | `submitReport()` happy path → `acquireReportLease` INSERT into `reports` (lease holder claimed) → `createIssue` GitHub call → `writeIssueUrl` tail UPDATE sets `github_issue_url`. NO admin_alerts upsert on success. | `ReportModal` succeeded-state (status: `created`, `duplicate`, or `recovered`); admin path also receives `github_issue_url` in success body | `reports` (single row) | `lib/reports/submit.ts:935-998` (entry); `:464-480` (writeIssueUrl); `lib/reports/leaseProtocol.ts:80-126` (acquireReportLease INSERT into `reports`) |
  | 2 | `success` (crew) | Same as admin success path; differs only in auth resolution + issue body builder (`buildCrewIssueBody`); response omits `github_issue_url`. | `ReportModal` succeeded-state on `/show/[slug]/[shareToken]/` route | `reports` | `lib/reports/submit.ts:179-186` (crew successBody omits url); `:370-403` (buildCrewIssueBody) |
  | 3 | `in-flight` (`IDEMPOTENCY_IN_FLIGHT`) | Triggered when a `reports` row already exists with the same `idempotency_key` AND `lease_live=true` (processing_lease_until > now()) AND github_issue_url IS NULL. Producer = a concurrent in-flight call; reproduce by INSERTing a `reports` row with `processing_lease_until = now() + interval '90 seconds'` and no `github_issue_url`. | `ReportModal` failed-retryable banner with code `IDEMPOTENCY_IN_FLIGHT` (HTTP 409) → catalog at `lib/messages/catalog.ts:154-162` | `reports` (single fixture row) | `lib/reports/submit.ts:188-197` (`dispatchExisting` + `inFlightResponse`); `:944-957` (reservation path) |
  | 4 | `rate-limit-admin` (`REPORT_RATE_LIMITED_ADMIN`) | **Producer = `report_rate_limits` table, NOT `reports`.** `enforceQuota` UPSERTs into `report_rate_limits (kind='admin', identity=<canonical email>, hour_bucket=date_trunc('hour', now()), count)`; when `count > 10` (admin limit), the transaction throws `QuotaDeniedRollback` and the API returns 429 with code `REPORT_RATE_LIMITED_ADMIN`. To materialize: INSERT a `report_rate_limits` row with `count=11` for the dev's canonical admin email + current hour bucket. NO `reports` row materializes when the quota denies. | `ReportModal` failed-retryable banner code `REPORT_RATE_LIMITED_ADMIN` (HTTP 429) → `lib/messages/catalog.ts:846-854` | `report_rate_limits` (single fixture row) | `lib/reports/rateLimit.ts:71-98` (enforceQuota UPSERT); `:53-55` (admin limit=10); `lib/reports/submit.ts:454-462` (quotaDeniedResponse) |
  | 5 | `rate-limit-crew` (`REPORT_RATE_LIMITED_CREW`) | Same as admin rate-limit but `kind='crew'`, `identity=<crewMemberId>`, limit=3. Materialize via INSERT into `report_rate_limits` with `count=4`. | `ReportModal` failed-retryable banner code `REPORT_RATE_LIMITED_CREW` (HTTP 429) → catalog `:856-...` | `report_rate_limits` | `lib/reports/rateLimit.ts:53-55` (crew limit=3); `lib/reports/submit.ts:454-462` |
  | 6 | `lookup-inconclusive` (`REPORT_LOOKUP_INCONCLUSIVE`) | Triggered by `LookupInconclusive` thrown from GitHub lookup OR by `createIssue` failure on the expired-lease-retry path. The handler `handleLookupInconclusive` upserts an `admin_alerts` row (code = `REPORT_LOOKUP_INCONCLUSIVE` / `REPORT_DUPLICATE_LIVE_MATCHES` / `REPORT_OPEN_ORPHAN_LABEL` / `GITHUB_BOT_LOGIN_MISSING` per `lookupAlertCode`) via state-gated upsert pattern + returns 502 with code `REPORT_LOOKUP_INCONCLUSIVE`. **Two-surface producer:** (i) an existing `reports` row in the post-lease-expired state (lease_live=false, github_issue_url IS NULL, within 24h horizon), (ii) the resulting `admin_alerts` row. | (i) `ReportModal` failed-retryable banner code `REPORT_LOOKUP_INCONCLUSIVE` (HTTP 502); (ii) `AlertBanner` rendered admin row (via RLS-gated SELECT from `admin_alerts`) | `admin_alerts` + `reports` (must delete admin_alerts first — no FK but ordering preserves the audit trail) | `lib/reports/submit.ts:691-740` (handleLookupInconclusive); `:643-689` (resolveStateGatedAlert upsert via raw SQL); `:202-208` (lookupAlertCode mapping); `components/admin/AlertBanner.tsx:97` (admin_alerts SELECT) |
  | 7 | `lease-expired` | Triggered by retry-path entry in `expiredLeaseRetry`. Producer = an existing `reports` row whose lease expired (`processing_lease_until < now()`), no `github_issue_url`, within 24h horizon. Subsequent retry attempts pass through reconcile → may create issue OR fall through to `handleTailUpdateMiss`. Materialize: INSERT a `reports` row with `processing_lease_until = now() - interval '60 seconds'`, `github_issue_url IS NULL`, `created_at = now()`. NO admin_alerts row is upserted unless the retry depth saturates → `REPORT_LEASE_THRASHING` upsert. | `ReportModal` failed-retryable on retry depth saturation (code `REPORT_LEASE_THRASHING` HTTP 503); without retry exercise, UI surface is only observable through subsequent submitReport invocation. UI rendering value of pure-lease-expired-row WITHOUT retry trigger = none (row is invisible until a subsequent request hits it). | `reports` | `lib/reports/submit.ts:742-870` (expiredLeaseRetry); `:771-781` (lease-thrashing alert) |
  | 8 | `horizon-expired` (`REPORT_HORIZON_EXPIRED`) | Triggered when retry path finds row with `created_at < now() - interval '24 hours'`. Producer = `reports` row with `created_at < now() - interval '24 hours'`, `github_issue_url IS NULL`, lease state irrelevant. Materialize: INSERT a `reports` row with `created_at = now() - interval '25 hours'`. **Cannot be materialized via the live submitReport entry (acquire path doesn't take a created_at override) — must be a direct INSERT.** | `ReportModal` failed-retryable banner code `REPORT_HORIZON_EXPIRED` (HTTP 410); also surfaced via ReportModal's `expired` modal status branch at `components/shared/ReportModal.tsx:331-333` | `reports` | `lib/reports/submit.ts:199-201` (horizonExpiredResponse); `:559` + `:725` + `:796` (predicate check `within_horizon`); `components/shared/ReportModal.tsx:331-333` (UI branch) |
  | 9 | `orphaned-lost-lease` (`REPORT_ORPHANED_LOST_LEASE`) | Triggered by `handleTailUpdateMiss` (issue created BUT tail UPDATE could not stamp `github_issue_url` because lease was lost). Producer raises `admin_alerts (code='REPORT_ORPHANED_LOST_LEASE', context={idempotency_key, orphan_url, orphan_issue_number, lease_holder, row_reaped, stored_url, orphan_close_failed, orphan_close_error})` via raw SQL UPSERT in submit.ts. Returns 410/200/409 depending on stored row state. | `AlertBanner` row with `REPORT_ORPHANED_LOST_LEASE` (admin-only); also `ReportModal` may show `REPORT_HORIZON_EXPIRED` (HTTP 410) if row reaped, or recovered state if URL exists. **Primary observable = AlertBanner, not ReportModal.** | `admin_alerts` (cleanup target); optionally `reports` if a stub row was inserted | `lib/reports/submit.ts:872-933` (handleTailUpdateMiss); `:901-922` (admin_alerts UPSERT); `lib/messages/catalog.ts:1166-1174` (catalog code) |

  **Cleanup order matters:** `admin_alerts` has FK `show_id → shows(id) ON DELETE CASCADE` (`supabase/migrations/20260501001000_internal_and_admin.sql:270`) — independent of `reports`. `reports` has FK `show_id → shows(id)` (no ON DELETE, blocks shows delete). `report_rate_limits` has no FK. Order: delete `admin_alerts` validation rows → delete `report_rate_limits` validation rows → delete `reports` validation rows. The reports/admin_alerts/rate_limits triple is independent; deletion in any of the three orders works in isolation, but the **canonical fixture-cleanup order** for the harness is: (1) `admin_alerts` first (it has the longest reach via the `AlertBanner` cache), (2) `report_rate_limits` (shortest TTL, purely time-bucketed), (3) `reports` (idempotency-key-bound; cleanup tag via `context->>'validation_tag'`).

  **Key class-of-bug F30 catches:** the prior task said "INSERTs into `reports` directly for each outcome" — that pattern materializes nothing observable for `rate-limit-admin` / `rate-limit-crew` (those don't write `reports` at all) and produces only a fraction of the observable surface for `lookup-inconclusive` / `orphaned-lost-lease` (those primary-surface through `admin_alerts` + `AlertBanner`, not through anything that reads `reports`). The harness MUST seed the producer table the live code reads, not a substitute.

- **(C) F30-class class-sweep (Phase 0 task audit for analogous producer-state mismatches).**

  | Plan file | Task | Verdict | Reasoning |
  |---|---|---|---|
  | 01-phase0-infra.md | 0.A.1–0.A.7 (project + env wiring) | CLEAN | No fixture materialization — pure provisioning + env-var documentation. No producer-state model. |
  | 02-phase0-validation-state.md | 0.B.1–0.B.13 (validation_state migration) | CLEAN | Migration creates a singleton-row table; no fault-state simulation. The table is its own producer (singleton write through `mint_validation_fixture_atomic` RPC). PostgREST DML lockdown test pins direct-write rejection — matches live producer (RPC-only). |
  | 03-phase0-tooling-reseed.md | 0.C.1–0.C.9 (reseed harness + mint RPC) | CLEAN | Reseed writes EXACTLY the same tables the production `mint_validation_fixture_atomic` RPC writes: `shows`, `crew_members`, `auth_email_canonical`, `show_share_tokens` (self-heal contract). Producer table matches consumer table at every read site (crew page resolver SELECTs from `crew_members`+`auth_email_canonical`; share-token resolver SELECTs `show_share_tokens`). The `show_share_tokens` dual-source sentinel (R19/R21/R23) explicitly enumerated the producer triggers — exactly the discipline F30 retroactively requires. |
  | 04-phase0-tooling-report.md | 0.E.0 (MATRIX-INVENTORY band F slice) | CLEAN | Enumerates outcomes per spec §13.2.3; disposition decision is metadata, no producer write. |
  | 04-phase0-tooling-report.md | 0.E.1 (disposition decision) | CLEAN | Metadata write to MATRIX-INVENTORY.md only. |
  | 04-phase0-tooling-report.md | 0.E.1-dup (validation-report-fixtures harness) | **PEER (this is F30 itself; fixed in commit 65)** | Original task: "INSERTs into `reports` directly for each outcome." Real producer: 4 of 8 outcomes are NOT primarily reports-writes. |
  | 04-phase0-tooling-report.md | 0.E.2 (integration test against rendered UI) | **PEER — inherits F30 fix.** Original step: "for each materialized outcome, `messageFor(<outcome-code>)` returns a non-null `dougFacing`." The `messageFor` predicate is correct (catalog lookup), but the rendering predicate for outcomes 4/5/6/9 is `AlertBanner` reads `admin_alerts` (not `messageFor`). Rewrite assertion to: `(reports row count change) + (admin_alerts row code) + (report_rate_limits row count) per the §A producer map`. | Rewritten in commit 65 along with 0.E.1. |
  | 04-phase0-tooling-report.md | 0.E.3 (end-to-end verification) | **BORDERLINE — inherits F30 fix.** Step 1 says "expect report row visible in admin UI" but there is NO admin reports UI route. Rewrite to: "expect rendered surface per outcome — `ReportModal` failed-retryable OR `AlertBanner` row visible per §A producer map." | Rewritten in commit 65. |
  | 05-phase0-smokes.md | 0.F.1–0.F.6 (smokes 1–6) | CLEAN | Each smoke exercises a real producer surface end-to-end (sign-in, share-link redemption, Drive cron, admin_alerts via MI-6 crew shrinkage, clock-control, picker rotation). No simulated/proxied fixture state. |
  | 05-phase0-smokes.md | 0.F.7 (smoke 7 — report-fixtures round-trip) | **PEER — inherits F30 fix.** Step 3 says "the report-failure UI row renders for an admin viewing the affected show or report list" — there is no report list route. Rewrite to: "for `--outcome lookup-inconclusive`, expect `admin_alerts` row with code `REPORT_LOOKUP_INCONCLUSIVE` rendered in `AlertBanner` on the admin show page." | Rewritten in commit 65. |
  | 05-phase0-smokes.md | 0.F.8 (Phase 0 close-out) | CLEAN | Aggregate close-out gate. |
  | 06-phase1-matrix-walk.md / 07-iteration-and-final-sweep.md | (Phase 1+ tasks) | OUT OF SCOPE for R31 sweep | Sweep scope per dispatch is Phase 0 (fixture-author tasks). Phase 1 is consumption of fixture state — bug here would surface differently. |

  **Class-sweep summary:** 4 peer tasks all WITHIN Phase 0.E + Phase 0.F (smoke 7). All four inherit the F30 rewrite — the producer-map (§A above) is the canonical contract, and Phase 0.E.1 / 0.E.2 / 0.E.3 / 0.F.7 cite it. **No structural defense required** — peers all live in 2 adjacent plan files and are rewritten in one commit; <3-peer threshold per AGENTS.md cross-cutting calibration was tripped only because the peers are sub-tasks of one logical surface, not 3+ independent surfaces.

- **(B) F30 per-instance fix — Phase 0.E task rewrite.** Phase 0.E.1 / 0.E.2 / 0.E.3 + Phase 0.F.7 rewritten in commit 65 to cite §A producer map row-by-row. See commit 65 diff at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/04-phase0-tooling-report.md` + `05-phase0-smokes.md`.

- **Commits (R31 chain):**

  | # | SHA | Subject |
  |---|---|---|
  | 64 | `b1515b4` | docs(plan-m12): R31 (A) codebase-grounding audit + (C) class-sweep |
  | 65 | `a5ed46f` | docs(plan-m12): R31 F30 — Phase 0.E + 0.F.7 rewrite for per-outcome producer state |

- **Meta-test regression (R31 baseline):** **16/16 PASS** (no walker changes; structural defenses unchanged from R29).

- **Scope discipline:** spec untouched; plan `04-phase0-tooling-report.md` + `05-phase0-smokes.md` + handoff `M12-solo-dev-ux-validation.md`. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/`.

- **Out-of-scope flags for future M12 Phase 0 execution work** (read-only observations from codebase grounding; not changed here):
  - `lib/reports/submit.ts:565-581` (`upsertAdminAlert` private helper) duplicates the `admin_alerts` UPSERT shape from `lib/adminAlerts/upsertAdminAlert.ts` (the canonical helper that calls the `upsert_admin_alert` RPC). The private helper uses raw SQL UPSERT instead. Phase 0.E.2 rendering assertion should note this dual-write surface so the harness test doesn't accidentally assert only one of the two writers fires — both produce `admin_alerts` rows.
  - `app/admin/` has no `reports/` route. The Phase 0.E.3 prior step ("expect report row visible in admin UI") was structurally unimplementable. Fix in commit 65 retargets to `AlertBanner` (admin show page).
  - `components/shared/ReportModal.tsx:331-333` is the ONLY `REPORT_HORIZON_EXPIRED`-specific UI branch (sets `expired` status). All other failure codes flow through the generic `failed-retryable` path with `messageFor(code).dougFacing`. The Phase 0.E.2 rendering assertion can rely on this asymmetry — horizon-expired has a distinguishable status; other codes do not.

---

### Amendment R32 — 2026-05-26

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `424f438` (post-R31)
- **Verdict:** **needs-attention** (1 HIGH F31 + 1 MEDIUM F32)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F31 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:824` (spec §9.1.2 row) + `:517` (spec §4.2) | **F21-class 3rd round** — spec §9.1.2 + §4.2 still say `validation:report-fixtures` only INSERTs/UPDATEs `reports`. R31 plan rewrite changed the producer state to per-outcome (`reports` + `report_rate_limits` + `admin_alerts`) but did NOT propagate to canonical spec. **R23 commit 52 F21-class structural defense had 4 regex patterns specific to F22/F23 shapes** (no-direct-write / trigger-only-sentinel / fresh-ids / re-creates-affected-rows) — F31 is a NEW "producer table" prose-contradiction shape outside the regex set. Implementer can follow spec table + ship pre-R31 bug: rate-limit and alert-backed outcomes materialized in wrong table or not at all. Repair: update spec §4.2 + §9.1.2 to R31's per-outcome producer map (including cleanup predicates + stdout id semantics + env inputs); ratify as plan-supersedes-spec amendment per §13.2.3 model. |
  | F32 | MEDIUM | `04-phase0-tooling-report.md:84-88` (failing test example for `rate-limit-admin`) | Test asserts `identity LIKE 'validation:%' AND count=11`. R31 (A) producer map says `report_rate_limits.identity=<canonical($VALIDATION_ADMIN_EMAIL)>` and live `enforceQuota` canonicalizes the actual admin reporter identity before UPSERT. **Test passes while real admin request increments different bucket** + never returns `REPORT_RATE_LIMITED_ADMIN`. Cleanup may miss the real admin bucket unless flag used consistently. Repair: assert canonical admin identity actually used by `enforceQuota`; declare where the identity comes from (`VALIDATION_ADMIN_EMAIL` or seeded `admin_emails`/session); require cleanup coverage via `--cleanup --include-admin-email <email>`. |

- **Same-vector + structural-defense status post-R32:**
  - **F21-class (prose-contradicts-newly-amended-contract): 3 rounds** (R20 F21 + R22 F22+F23 + R32 F31). Per AGENTS.md same-vector recurrence + threshold-3 calibration, R33 MUST do comprehensive re-analysis of F21-class surfaces. Specifically: R23 regex defense is shape-specific (4 patterns); each new amendment introduces a new shape needing a new regex (same incremental pattern as F10-class pre-R27 Option D). R33 either extends regex set (incremental) OR pivots to broader pattern (e.g., audit every amendment's plan-side changes against canonical spec sections — analogous to F10-class Option D).
  - **Threshold-3 calibration:** if R34 surfaces another F21-class peer despite R33 re-analysis, escalate per M12 plan R5 precedent (structural-defense calibration: "if comprehensive re-analysis fails to converge, ship structural defense in the same repair commit"). R23 defense exists; R33 mandate is to EXTEND it (new regex pattern for "producer table" shape) OR refactor to broader assertion.
  - F30-class (NEW R30): 1 round, closed at R31; no R32 recurrence.
  - All other classes still closed.

- **Repair commit:** closed in R33 (see below).

### Amendment R33 — 2026-05-26 (F31 + F32 repair — F21-class comprehensive re-analysis + regex extension)

- **Diff base:** `b4b2c38` (M11.5 close-out HEAD)
- **Diff target:** `5d46d9d` (post-R33 chain HEAD; structural-defense commit 70)
- **Verdict:** **implementer-complete; pending R34 adversarial review**

- **(A) F21-class comprehensive re-analysis at AMENDMENT-CROSS-SECTION scope** (mandated by R20+R22+R32 same-vector recurrence at 3 rounds — threshold-3 trigger fires per AGENTS.md cross-cutting #5 + R5 calibration). Audit covers every M12 amendment R13–R31 that landed plan-side contract changes; for each, every canonical spec section referencing the amended contract surface is greped against the post-amendment contract.

  | Amendment (named-instance hit) | Contract surface | Spec section(s) audited | Plan-side surfaces audited | Verdict | Disposition |
  |---|---|---|---|---|---|
  | R13 F10 (J3 OAuth — VALIDATION_J3_CLAIM_EMAIL) | env-var parameterization | §3.3 step 5, §3.3.2 predicate (k), §9.1.2 row 1+2 | 01 / 03 / 06 / handoff | CLEAN | Closed at R15/R29; R27 Option D refactor made §9.1.2 the SSoT; F10-class structural-exclusivity walker in tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts (R27 commit 59 supersedes R25/R23/R15 prior defenses) regression-clean per R31 16/16 PASS. |
  | R13 F11 (reseed clears claimed_via_oauth_at) | mint RPC SET clause + stable-id reseed contract | §3.3 lockstep, §3.3.2 predicate (l), §3.3 Cleanup contract :160 | 03 mint RPC body, 00-overview row-stability bullet :153 | CLEAN | Closed R23 (F23 stable-id + 00-overview adjacent peer). F21-class regex `stable-id:fresh-ids` + `stable-id:re-creates-affected-rows` pin both surfaces at CI time. |
  | R15 F13/F14/Dim-3 (canonical rejected domain set) | RFC 2606/6761/6762 rejection list | §3.3 step 5, §3.3.2 predicate (k) | 03 fixture-build TS guard, 03 RPC defense-in-depth, 03 check-seed predicate (k) | CLEAN | Closed R15 + R23 (C) sweep. F14-canonical-set assertion in same test file walks every rejection-list site for ±10-line completeness. |
  | R17 F15 (PostgREST DML lockdown for validation_state) | RPC-gated table mutation discipline | §3.3.2 | 02 migration + tests/db/postgrest-dml-lockdown.test.ts | CLEAN | Closed R17/R21. RPC + REVOKE migration + structural meta-test landed atomically. |
  | R17 F16 (mint RPC full-replace crew_members) | mint RPC roster-write semantics | §3.3 lockstep, §3.3.2 predicate (m) | 03 mint RPC body, 03 Task 0.C.5 Step 5 | CLEAN | Closed R17/R21 lockstep + R27 SET-clause-column completeness extension. |
  | R17 F17 (schema-test pattern swap psql ↔ supabase-js) | plan-only | — | 03 schema test scaffold | CLEAN | Plan-only; no spec surface. |
  | R19 F18 (drive_file_id UPPERCASE in mint RPC) | combo-enum case-normalization | §3.3.2 predicate (m) | 03 mint RPC body | CLEAN | Closed R19; spec predicate (m) :351 explicitly states UPPERCASE-verbatim contract. |
  | R19 F19 (show_share_tokens self-heal in mint RPC) | dual-source sentinel for show_share_tokens row | §3.3 lockstep, §3.3.2 | 03 opener :5 + RPC narrative :194 + commit template :584 + verification :740 + failure-mode :863 | CLEAN | Closed R23 (F22 5-surface cluster + lockstep prose rewrite). F21-class regex `dual-source-sentinel:no-direct-write` + `dual-source-sentinel:trigger-only-sentinel` pin both shapes; corrective-negation lookbehind passes post-amendment wording. |
  | R23 F22/F23 (dual-source sentinel + stable-id) | same as R19 F19 + R13 F11 | spec :160 + :175 | 03 (5 surfaces) + 00-overview :153 | CLEAN | Closed R23 per-instance + structural defense commit 52. |
  | R25 F25 + R27 Option D + R29 walker refinement | canonical env-var CLI table | §9.1.2 (SSoT, marked `canonical-env-var-source: keep`) | 01 .env.local.example (also marked) | CLEAN | R27 inverted model — structural exclusivity. Only 2 authorized own-enumeration surfaces; everything else cross-references §9.1.2. F10-class walker (M1+M2+M3+M4) regression-clean post-R29. |
  | R27 F26 (predicate (b) TZ-pin) | check-seed predicate (b) date-comparison | §3.3.2 :351 predicate (b) | 03 check-seed implementation, 03 Task 0.C.8 | CLEAN | Closed R29; spec :351 explicitly cites `$VALIDATION_TODAY_ISO` (NOT `current_date`); CI structural defense `tests/cross-cutting/validation-tooling-tz-pin.test.ts` scheduled for Phase 0.C authoring per DEFERRED.md. |
  | R27 F27 (mint RPC SET clause for archived/published + predicate (n)) | shows baseline-eligibility on reseed | §3.3.2 predicate (n) :351 | 03 mint RPC body :284 + Task 0.C.5 Step 5 | CLEAN | Closed R27 per-instance + R29 walker pass; predicate (n) is enumerated alongside (m) at the same paragraph; no other spec section references the column-set contract. |
  | **R31 F30 (per-outcome producer map)** | report-fixtures producer-state map (3 tables: reports / report_rate_limits / admin_alerts) | **§4.2 band F paragraph (a) :517 + §9.1.2 row :824 — F31 NAMED HIT** | 04 (Tasks 0.E.1/0.E.2/0.E.3 already rewritten R31), 05 (smoke 7 already rewritten R31), handoff §9 R31 §A canonical map | **2 spec PEERS within the SAME R31 contract surface (both at the band-F producer-table-contract claim)** | Spec :517 paragraph (a) + spec :824 producer-state column both still say "the `reports` table" as the singular target. Fixed in commit 68. Plan tree + handoff already R31-correct. **No other spec/plan/handoff surface references the producer-table contract.** |

  **Audit method:** for each amendment, grep the spec full-file for the named contract concept (the table name, the predicate letter, the env-var literal, the column name, the SET-clause column, etc.); cross-walk every match; verdict CLEAN when every match either (a) lives inside §15 audit-trail (stripFifteen — historical-by-design), (b) is the canonical SSoT for the contract (where the contract is defined), or (c) is a cross-reference that quotes the SSoT without restating the contract. Verdict PEER when a match restates the contract using pre-amendment wording.

  **Total peers beyond F31's named-instance scope: 0.** F31 is the only amendment with un-propagated spec drift after the audit. All 4 prior F21-class-related amendments (R13 F11 / R19 F19 / R23 F22+F23 / R27 F27) had been fully propagated to the spec at amendment time OR cleaned up in subsequent class-sweep rounds. **The F31 audit produced 2 instances of ONE drift class (R31 producer-map under-propagation), both within the spec's band-F report-fixtures contract surface. No structural-defense REDESIGN (Option b) required — Option (a) regex extension is the proportionate response per the dispatch.** Commit 71 is conditional and NOT FIRED.

- **(B) Per-instance fix F31 — spec §4.2 + §9.1.2 propagation of R31 producer map.** Commit 68 rewrites:
  - **Spec §4.2 band F row :517 paragraph (a)** — replaces "materializes the named failure state in the `reports` table (the only v1 admin-only table in this domain ...)" with the per-outcome producer-map summary citing all three producer tables (`reports` for success/in-flight/lease-expired/horizon-expired; `report_rate_limits` for rate-limit-admin/rate-limit-crew; `admin_alerts` for lookup-inconclusive/orphaned-lost-lease). Cleanup-order predicate cited (admin_alerts → report_rate_limits → reports per handoff §9 R31 §A). The pre-R31 "feedback_inbox out-of-scope" note is preserved (still correct — feedback_inbox is BACKLOG-only).
  - **Spec §9.1.2 table :824 row** — replaces the "Target DB" cell ("INSERTs / UPDATEs the `reports` table directly via service role ...") with the per-outcome producer table list + a cross-reference to handoff §9 R31 §A for the full producer-state map. The Stdout-contract cell is updated to acknowledge the polymorphic `<id>` semantics (reports.id / admin_alerts.id / report_rate_limits.(kind, identity, hour_bucket) tuple). The Idempotency cell is updated to clarify the per-table delete-by-tag predicates.
  - **Ratified as plan-supersedes-spec amendment per §13.2.3 model.** R31 commit `a5ed46f` is the canonical ratification; R33 commit 68 is the spec propagation. Both amendments target the same contract — the producer map is canonical at handoff §9 R31 §A; spec §4.2 + §9.1.2 are now summary cross-references with the cleanup-order predicate inlined for implementer ergonomics.

- **(C) Per-instance fix F32 — plan 04 :84-88 test assertion repair (commit 69).** Live `enforceQuota` (`lib/reports/rateLimit.ts:76`) canonicalizes the admin identity via `canonicalize(identity)` before UPSERT. Pre-R33 the failing-test example asserted `identity LIKE 'validation:%' AND count=11` — this matches a `validation:` prefix that the live admin path NEVER writes (the live admin path writes the canonicalized admin email). Fix:
  - Test assertion rewritten to use the canonical admin identity: `WHERE kind='admin' AND identity = canonicalize($VALIDATION_ADMIN_EMAIL) AND count=11` (canonicalized via the project's `lib/email/canonicalize.ts` helper — single source of truth per plan-wide invariant 3).
  - Identity-source declaration added: identity comes from the new `VALIDATION_ADMIN_EMAIL` env var (added to spec §9.1.2 report-fixtures row required-env-vars list as a 4th var — the prior "3 vars; J3-claim-email NOT required" framing is updated to "4 vars; J3-claim-email NOT required (replaced by ADMIN_EMAIL for the rate-limit-admin outcome)"). The dev's REAL admin email goes into this var so the rate-limit-admin outcome actually triggers the production quota deny path.
  - Cleanup contract: `--cleanup` default-conservative does NOT delete real admin-email rows; `--cleanup --include-admin-email <email>` extends cleanup to the canonical admin bucket so the test harness can purge its own rate-limit state without operator intervention.
  - The non-admin `validation:m12-fixture-<outcome>` prefix for the OTHER 7 outcomes is preserved (those use `gen_random_uuid()` suffix per plan 04 Step 5; rate-limit-crew uses a fixture-seeded crew_member_id which is also covered by the existing prefix). Only rate-limit-admin gets the real-email-with-cleanup-flag treatment.

- **(D) F21-class structural-defense extension (commit 70) — Option (a) regex extension.** Per dispatch, (A) audit results favor incremental extension over Option (b) refactor (0 peers beyond F31's named-instance scope; F21-class is a 3-round, 4-regex defense, not a 5+ round case demanding model inversion like F10-class was at R27). Two new regex patterns added to `F21_FORBIDDEN_PATTERNS` in `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` to cover the F31 "producer table" prose-contradiction shape:
  - `producer-table:reports-only-target` — matches phrasings asserting `reports` is the singular target / only / sole target of the report-fixtures harness (the pre-R31 shape). Covers "the `reports` table directly" without a producer-map cross-reference, "ONLY `reports`" in producer-table context, etc.
  - `producer-table:singular-failure-state` — matches phrasings asserting `validation-report-fixtures` "materializes ... in the `reports` table" without acknowledging the 3-table producer set. Covers "materializes the named failure state in the `reports` table" (pre-R31 §4.2 :517 shape).
  - Both regexes carry the same escape hatches as the prior 4 patterns: historical-qualifier lookback (~200 chars) for "pre-R31", "earlier draft", "originally drafted"; explicit `<!-- not-f21-class: -->` waiver; corrective-negation lookbehind for "NOT only" / "no longer just" / etc.
  - **The §4.2 row's note about `feedback_inbox` BACKLOG-only** is the only pre-existing legitimate "only `reports`" prose remaining in the spec. The R33 spec rewrite (commit 68) re-frames this as "harness targets THREE producer tables (`reports`, `report_rate_limits`, `admin_alerts`) — `feedback_inbox` is NOT in v1 schema" so the rewrite uses the corrective-negation form, which the existing escape-hatch logic passes.

- **(E) RED → GREEN evidence (commit 70).**
  - RED phase (pre-commit-68 spec content + new regex on pre-R33 HEAD): assertion fires findings against spec :517 paragraph (a) wording AND spec :824 producer-table column wording.
  - GREEN phase (post-commit-68 spec content + new regex + commit 70 negative-case fixtures): assertion passes; 4 new negative-case fixtures land in the structural-defense negative-case test (2 broken-pre-R31 fixtures fire the new regex; 2 post-R31 corrective fixtures pass via cross-reference framing).
  - F21-class same-vector status: 3 rounds (R20 F21 + R22 F22+F23 + R32 F31); R33 closes per-instance + extends structural defense with 2 new patterns covering F31's shape. **R34 same-vector recurrence would fire the structural-defense calibration ladder rung: pivot to Option (b) (broader contract-level assertion analogous to F10-class R27 Option D refactor).** Until then, the regex-extension model is the proportionate posture.

- **Commits (R33 chain):**

  | # | SHA | Subject |
  |---|---|---|
  | 67 | `252229a` | docs(handoff-m12): R33 (A) F21-class comprehensive re-analysis audit table — R13–R31 amendment sweep |
  | 68 | `46d386c` | docs(spec-m12): R33 F31 — §4.2 + §9.1.2 per-outcome producer map propagation |
  | 69 | `84b8809` | docs(plan-m12): R33 F32 — rate-limit-admin test assertion fix (canonical admin identity + VALIDATION_ADMIN_EMAIL env var + cleanup flag) |
  | 70 | `5d46d9d` | test(cross-cutting): R33 F21-class regex extension — producer-table shape patterns (RED→GREEN) |

- **Meta-test regression (R33 baseline):** **16/16 PASS** post-R33 (same test() count as pre-R33; the F21-class assertion grew by 2 regex patterns inside the SAME `test()` block + the negative-case `test()` gained 6 new fixtures — both extensions land inside existing test blocks per Option (a) minimal-extension model; test count is unchanged, regex/fixture coverage is +50%).

- **Same-vector + structural-defense status post-R33:**
  - **F21-class: 3 finding-rounds (R20 + R22 + R32).** R33 closed per-instance (spec §4.2 + §9.1.2 propagation) + extended structural defense with 2 new regex patterns (`producer-table:reports-only-target` + `producer-table:singular-failure-state`). Defense remains regex-based per Option (a). **If R34 surfaces an F21-class peer NOT caught by the now-6 regexes,** structural-defense REDESIGN (Option b — broader cross-amendment fact-table assertion analogous to F10-class R27 Option D) is the next escalation per AGENTS.md M12 plan R5 calibration.
  - F30-class (NEW R30): closed at R31; no R32/R33 recurrence.
  - F10-class: 6 rounds, closed at R29 via M3+M4 walker refinement; regression-clean post-R33.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R33 commit 70). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

- **Out-of-scope flags for future M12 Phase 0 execution work** (read-only observations from R33 audit; not changed here):
  - `VALIDATION_ADMIN_EMAIL` env var is NEW in R33 commit 68 — it adds a 4th required env var to the `report-fixtures` row in spec §9.1.2 (was 3 vars per R21 F20 — now 4 vars; J3-claim-email is still NOT required for this CLI, but ADMIN_EMAIL takes its place specifically for the rate-limit-admin outcome). Phase 0.A `.env.local.example` template MUST be extended to include `VALIDATION_ADMIN_EMAIL=` placeholder at plan 01 Task 0.A.5 — flagged for the Phase 0.A executor.
  - The R23 F21-class structural defense file at `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` has now accumulated 6 F21-class regex patterns (R23 commit 52: 4; R33 commit 70: +2). Any further regex extension beyond ~8 patterns should trigger Option (b) refactor consideration per M12 plan R5 structural-defense-calibration ladder. R34 budget gate.

### Amendment R34 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `992c5bb` (post-R33)
- **Verdict:** **needs-attention** (1 HIGH F33 + 1 MEDIUM F34)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F33 | HIGH | `01-phase0-infra.md:83-136` (Phase 0.A.5 env template + `.env.local.example` block) | **R33 fix-round regression budget gap.** R33 made `VALIDATION_ADMIN_EMAIL` required for `validation:report-fixtures --outcome rate-limit-admin` but Phase 0.A env template still says "all four validation env vars are SUPABASE trio + VALIDATION_J3_CLAIM_EMAIL" + provides NO `VALIDATION_ADMIN_EMAIL=` placeholder. Implementer following Phase 0.A.5 setup won't set ADMIN_EMAIL → Task 0.E rejects rate-limit-admin path when unset → walk-session gate blocks. **F10-class walker still has 4 canonical vars** (URL/SECRET/PROJECT_REF/J3_CLAIM_EMAIL); ADMIN_EMAIL is structurally unprotected. Repair: extend Phase 0.A.5 + `.env.local.example` to include ADMIN_EMAIL placeholder; rewrite "all four" cardinality prose; decide F10-class walker treatment (canonical-5 set vs helper-categorization with separate `<!-- not-canonical-helper-var: ADMIN_EMAIL scoped to rate-limit-admin -->` documentation + dedicated rate-limit-admin contract structural test). |
  | F34 | MEDIUM | `04-phase0-tooling-report.md:69-94` (rate-limit-admin cleanup recipe) | **NEW class — destructive cleanup affecting prod state.** Cleanup deletes `report_rate_limits` rows by `(kind='admin', identity=canonicalize(<email>))` spanning ALL hour_buckets. PK is `(kind, identity, hour_bucket)`. Can collide with prod admin buckets in current hour + erase cross-hour legitimate rate-limit state. Repair: harness snapshots prior `(kind, identity, hour_bucket)` row before seeding; cleanup restores prior count OR deletes ONLY the exact bucket it created; test covers pre-existing admin bucket scenario. |

- **Same-vector status post-R34:**
  - **F10-class adjacency (F33):** the env-var propagation gap is structurally F10-class-adjacent — R33 added a 5th VALIDATION_* env var and didn't propagate to Phase 0.A.5 template. R33's audit was spec-scoped (R31→spec); didn't re-audit Phase 0.A setup template. **Per AGENTS.md "fix-round regression budget" rule:** when a fix patches surface S for class C, the next-round preparation must re-grep class C across S after the patch. R33 missed this for the new ADMIN_EMAIL surface. R35 must close the propagation gap + decide walker treatment.
  - F21-class regex extension (R33 commit 70) regression-clean.
  - NEW F34 class: destructive cleanup affecting prod state. 1 round; no priors.

- **Repair commit:** closed in R35 (see below).

### Amendment R35 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `7ff3bcb` (post-R35)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R36 adversarial review**

- **F33 repair (commit 71) — Phase 0.A.5 propagation:**
  - Phase 0.A.5 env template extended with `VALIDATION_ADMIN_EMAIL=` placeholder + multi-line comment naming R33/R35 lineage + `lib/reports/rateLimit.ts:76` canonicalize boundary + per-outcome scoping
  - "All four MUST be set" prose → "All validation env vars per spec §9.1.2 MUST be set" (cardinality-drift-free cross-reference; F10-class walker M3 evasion strategy)
  - NEW R35 amendment paragraph (plan 01:93-102) classifies ADMIN_EMAIL as per-outcome helper var + explicitly states "do NOT count ADMIN_EMAIL inside the canonical cardinality"
  - Step 5 stale "the four `VALIDATION_`-prefixed vars" rewritten to §9.1.2 cross-ref

- **F10-class walker decision — HELPER-CATEGORIZATION** (orchestrator-recommended; implementer-adopted):
  - Walker `canonicalVars` array UNCHANGED (still URL/SECRET/PROJECT_REF/J3_CLAIM_EMAIL); ADMIN_EMAIL is NOT canonical
  - Rationale: ADMIN_EMAIL is scoped to ONE outcome (rate-limit-admin) within ONE CLI (validation:report-fixtures); NOT part of the broader validation tooling contract governing reseed/check-seed/resolve-alias. Canonical-5 expansion would propagate to every §9.1.2 row + .env.local.example + commit-msg templates + every "3 vars; J3 omitted" subset-reason row — heavy surface already F10-class-cleaned across R12-R29.
  - **Dedicated rate-limit-admin contract test ships:** new file `tests/cross-cutting/rate-limit-admin-helper-var-doc-guard.test.ts` (333 lines, 2 tests). Scans M12 doc surfaces for `rate-limit-admin` OR `REPORT_RATE_LIMITED_ADMIN`; contract-discussion detection ±10 lines via 12 marker keywords (`report_rate_limits`, `identity`, `canonicaliz`, `harness`, `cleanup`, `bucket`, `outcome`, `producer`, `enforceQuota`, `fixture-`, `validation:report-fixtures`, `--outcome`); each cluster MUST cite `VALIDATION_ADMIN_EMAIL` literal OR cross-ref (`spec §9.1.2`, `handoff §9`, `R31 commit/producer/§A`, `R33 commit 68/69/70`). 5 escape hatches: `<!-- not-rate-limit-admin-class: -->` waiver; historical qualifier (`pre-R33` / `originally drafted` / `F32 finding` / `retired`); §9.1.2 heading scope; fenced blocks with `canonical-env-var-source: keep` marker. RED phase fired 1 finding at plan 04:129; GREEN after commit 72 amendment.

- **F34 repair (commit 73) — snapshot+restore cleanup:**
  - rate-limit-admin per-outcome producer map row rewritten with Snapshot → Seed → Record three-step recipe
  - NEW 5-item F34 contract block after tagging-convention: (1) snapshot SELECT before seed; (2) UPSERT at recorded bucket; (3) cleanup branches (NULL prior → DELETE exact bucket; non-NULL prior → UPDATE SET count=prior at exact bucket); (4) snapshot persistence options (file at `.validation-state/rate-limit-admin-snapshot.json` OR `validation_state` row at key `rate_limit_admin_snapshot`); (5) defense-in-depth refusal absent snapshot + `--force-cleanup-without-snapshot --hour-bucket <ISO>` emergency escape hatch
  - F34 regression test mandatory: pre-INSERT same-hour sentinel (count=4) + cross-hour sentinel (-2h, count=7); post-cleanup same-hour sentinel restored, cross-hour sentinel untouched
  - Phase 0.E.3 Step 2 + failure-modes catalog updated

- **(C) ADMIN_EMAIL sweep across M12 docs:**
  - 8 surfaces AMENDED (Phase 0.A.5 + Phase 0.E producer map + tagging + Step 5 + cleanup test + identity recipe + rendering predicate + failure modes + Phase 0.E.3 verification)
  - Plans 00-overview / 02 / 03 / 05 / 06 / 07: CLEAN (no rate-limit-admin / ADMIN_EMAIL refs)
  - Pre-M12 surfaces (M8 plan + master spec + M8 handoff) carry REPORT_RATE_LIMITED_ADMIN production-rendering contract refs — OUT-OF-SCOPE (correctly excluded by walker PLAN_TREE constant; not validation harness contract)

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 71 | `4d822ed` | docs(plan-m12): R35 F33 — Phase 0.A.5 + .env.local.example ADMIN_EMAIL placeholder |
  | 72 | `2ac7453` | test(cross-cutting): R35 F33 — helper-categorization walker + cross-ref propagation (RED→GREEN) |
  | 73 | `7ff3bcb` | docs(plan-m12): R35 F34 — rate-limit cleanup snapshot+restore (non-destructive of prod state) |

- **Meta-test regression:**
  - 4 cross-cutting prose-guard files: **18/18 PASS** (was 16 pre-R35; +2 new dedicated `rate-limit-admin-helper-var-doc-guard.test.ts`)
  - Full `tests/cross-cutting/` suite: **140/140 PASS**

- **Same-vector status post-R35:**
  - F10-class adjacency (F33 propagation gap): closed at R35 via helper-categorization walker + Phase 0.A.5 + .env.local.example propagation. ADMIN_EMAIL now has scoped structural protection in dedicated walker.
  - F34 NEW class (destructive cleanup): per-instance fix (snapshot+restore) + regression test spec; 1 round; no priors.
  - F21-class regex extension (R33 commit 70) regression-clean.
  - All other classes still closed.

- **Open items flagged by implementer:**
  - Phase 0.E.1 executor must pick ONE snapshot-persistence strategy (file vs `validation_state` row); plan presents both options without prescribing.
  - New `--force-cleanup-without-snapshot --hour-bucket <ISO>` emergency-recovery flag.
  - Walker regex pattern accumulation: F10-class M3+M4 (5 patterns) + F21-class (6 patterns) + new rate-limit-admin (12 markers + 5 escape hatches). All under ~8-pattern Option-(b)-refactor threshold but worth monitoring.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R35 commit 72, NEW test file). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

---

### Amendment R36 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `c5ce8bc` (post-R35)
- **Verdict:** **needs-attention** (1 HIGH F35; F21-class round 4)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F35 | HIGH | `2026-05-19-solo-dev-ux-validation-design.md:824` (spec §9.1.2 validation:report-fixtures row) | **F21-class same-vector recurrence (round 4).** Spec §9.1.2 still documents `--cleanup --include-admin-email <email>` as `DELETE WHERE kind='admin' AND identity=canonicalize(<email>)` (no exact-bucket scope, no snapshot+restore). Directly contradicts R35 commit 73 plan-side snapshot+restore contract. Implementer treating §9.1.2 as the "tooling man page" can reintroduce the destructive-cleanup data-loss bug F34 was meant to prevent. **R35 fix-round regression budget gap** — plan-side fix didn't propagate to canonical spec. Same shape as F31 (R32 → R33 closure was plan→spec propagation for R31 F30 producer map). Repair: rewrite spec §9.1.2 validation:report-fixtures row to include snapshot record + exact hour_bucket restore/delete behavior + refusal-without-snapshot contract + `--force-cleanup-without-snapshot --hour-bucket <ISO>` emergency flag; extend F21-class regex set with cleanup-recipe pattern (7th regex). |

- **F21-class status post-R36:**
  - 4 rounds (R20 F21 + R22 F22+F23 + R32 F31 + R36 F35). Pattern: each amendment surfaces a new contract surface that the regex set doesn't cover. Regex extensions have been incremental (R23 commit 52: 4 patterns; R33 commit 70: +2; R37 will add +1 = 7 total).
  - Per R33 row's documented Option (b) threshold (~8 patterns): R37 incremental extension to 7 patterns is within budget; if R38 surfaces another F21-class peer NOT caught by 7 patterns, R39 MUST escalate to Option (b) — structural refactor analogous to F10-class R27 Option D (candidate: spec §13.2.3-style "every plan-side amendment has a ratified spec entry" assertion).
  - Per AGENTS.md "fix-round regression budget" rule + R35 row's flagged risk: R34 F34 fix was the latest amendment NOT to propagate to canonical spec. R37 must close that propagation gap AND audit R35 commits 71/72/73 for ANY other plan-side changes not yet ratified in spec §13.2.3 or §9.1.2.

- **Path A (incremental) ratified at R37 dispatch:** ship per-instance F35 fix + 7th regex pattern; monitor F21-class accumulation. If R38 surfaces another F21-class peer despite the 7th pattern, R39 mandates Option (b) — no further regex extensions.

- **Repair commit:** closed in R37 (see below).

### Amendment R37 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `db7f416` (post-R37)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R38 adversarial review**

- **F35 repair (commit 74):** spec §9.1.2:824 cleanup paragraph rewritten to mirror R35 commit 73 F34 plan-side contract — 6 contract elements (snapshot before seed, exact-bucket UPSERT, branch-on-prior-count cleanup, persistence options, refusal-without-snapshot, `--force-cleanup-without-snapshot --hour-bucket <ISO>` emergency flag). Pre-R37 destructive `DELETE WHERE kind='admin' AND identity=canonicalize(...)` wording explicitly retired.

- **F21-class 7th regex pattern (commit 75) — `cleanup-recipe:no-bucket-scope`:**
  - Regex: matches `DELETE` verb + `kind='admin'` within 80 chars + positive-lookahead for `canonicaliz|identity` within 280 chars + negative-lookahead asserting `hour_bucket` NOT present in same window
  - Backtick-handling fix-up during authoring: initial draft excluded backticks (markdown inline-code fences) but blocked matches across fence boundaries; removed exclusion to match through fences
  - **RED phase:** pre-R37 HEAD spec §9.1.2:824 fires 1 finding (`matched: "delete \`WHERE kind='admin'"`)
  - **GREEN phase:** post-R37 spec → 0 findings
  - Negative-case fixtures: F35-pre-fix-wording (fires); F35-corrective-with-bucket (passes); historical-frame (passes via HISTORICAL_QUALIFIER_RX); waiver (passes via WAIVER_RX); UPDATE-only-no-DELETE (passes); non-cleanup-narrative (passes)

- **(C) plan-side amendment propagation audit** (per fix-round regression budget rule):

  | Amendment | Propagation status |
  |---|---|
  | R35 commit 71 (Phase 0.A.5 + .env.local.example ADMIN_EMAIL) | CLEAN — spec §9.1.2:824 already names ADMIN_EMAIL (R33 commit 68); spec §9.1.2:810 already cross-references plan §0.A.5 |
  | R35 commit 72 (walker test file) | CLEAN — test-only, no spec implications |
  | R35 commit 73 (cleanup safety) | PEER (F35) — CLOSED by R37 commit 74; all 6 contract elements propagated |

  Total residual propagation gaps: 0. Commit 76 (adjacent peer fixes) NOT NEEDED.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 74 | `8b7149d` | docs(spec-m12): R37 F35 — §9.1.2 validation:report-fixtures cleanup snapshot+restore propagation |
  | 75 | `db7f416` | test(cross-cutting): R37 F21-class 7th regex pattern — cleanup-by-kind-identity-without-bucket (RED→GREEN) |

- **Meta-test regression:** **18/18 PASS** maintained (7th regex extends existing F21-class assertion; no new test additions).

- **Same-vector + structural-defense status post-R37:**
  - **F21-class: 4 rounds; defense at 7 regex patterns.** Per R33 row Option-(b) threshold flag (~8 patterns), 1 pattern below trigger. **If R38 surfaces another F21-class peer NOT caught by 7 patterns, R39 MUST escalate to Option (b) refactor — no further regex extensions.** Candidate Option (b): spec §13.2.3-style structural assertion mapping every plan-side amendment to a canonical spec ratification entry.
  - All other classes still closed.

- **Scope discipline:** spec markdown + 1 commit to `tests/cross-cutting/`. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

---

### Amendment R38 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `4482aaf` (post-R37)
- **Verdict:** **needs-attention** (1 HIGH F36 — F34-class round 2 + plan-internal contradiction + spec drift)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F36 | HIGH | `04-phase0-tooling-report.md:70-113` (rate-limit-crew producer + assertion + identity recipe) + `2026-05-19-solo-dev-ux-validation-design.md:824` ("other 7 outcomes use synthetic identities") | **F34-class round 2 — R35 fix-round regression budget gap; crew not audited.** Three-way contradiction: (i) plan 04:70 says `rate-limit-crew` INSERTs `identity=<real crew_member_id from fixture>`; (ii) plan 04:107 assertion query uses same real crew_member_id; (iii) plan 04:131 Step 3 implementation contracts say `identity ← 'validation:m12-fixture-' \|\| $outcome \|\| ':' \|\| gen_random_uuid()` EXCEPT for rate-limit-admin (implies rate-limit-crew uses synthetic); (iv) spec §9.1.2:824 says "other 7 outcomes use `validation:m12-fixture-<outcome>:<uuid>` synthetic identities." Live `lib/reports/submit.ts:168` shows `reporterFor()` writes `identity=auth.crewMemberId` (real UUID) for crew quota — synthetic prefix CANNOT intercept production quota path. Real crew_member_id IS required; therefore rate-limit-crew needs same snapshot+restore lifecycle as rate-limit-admin. Without it: validation walk leaves real fixture crew_member_id bucket at count=4 → later walks for same fixture crew spuriously 429-rate-limited (same destructive-prod-state class as F34). Repair: align plan + spec on real-crew_member_id contract; extend snapshot+restore lifecycle to rate-limit-crew with `--include-crew-id <uuid>` (or equivalent) flag; F21-class regex pattern generalize from `kind='admin'` to any non-bucket-scoped DELETE on `report_rate_limits`. |

- **Same-vector status post-R38:**
  - **F34-class: 2 rounds** (R34 F34 admin + R38 F36 crew). Per AGENTS.md same-vector recurrence, R39 MUST do comprehensive re-analysis: enumerate every rate-limit `kind` value in live `lib/reports/rateLimit.ts` + every destructive-cleanup-shape surface in harness. Threshold-3 calibration: if R40 surfaces another F34-class peer, structural defense mandate per M12 plan R5 precedent.
  - **F21-class regex 7th pattern under-scope:** the pattern hardcodes `kind='admin'`; F36 surfaces because rate-limit-crew was missed. R39 must generalize regex to match any non-bucket-scoped DELETE on `report_rate_limits` (regardless of `kind` value). Stays at 7 patterns (no new addition; generalizes existing).
  - **Plan-internal contradiction (NEW shape):** R35 fix-round regression budget for F34 missed the cross-`kind` audit. Treat as fix-round-regression-budget gap, not new class — same lesson as R23+R29+R33 (each fix needs class-sweep BEFORE/DURING patching, per AGENTS.md cross-cutting #5).
  - All other classes still closed.

- **Repair commit:** closed in R39 (see below).

### Amendment R39 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `df2dacc` (post-R39)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R40 adversarial review**

- **(A) F34-class comprehensive re-analysis** (mandated by R34+R38 same-vector recurrence):

  Schema constraint: `report_rate_limits.kind` CHECK = `('admin', 'crew')` per `supabase/migrations/20260501001000_internal_and_admin.sql:329`. Binary enum; no third kind exists.

  | `kind` | Identity shape | Live quota path | Real-identity in harness | Snapshot+restore |
  |---|---|---|---|---|
  | `admin` | Canonical email (`canonicalize` at `lib/reports/rateLimit.ts:76`) | `enforceQuota` via `reporterFor` at `lib/reports/submit.ts:162-164` | YES (`$VALIDATION_ADMIN_EMAIL`) | SHIPPED R35 commit 73 F34 |
  | `crew` | Raw `crew_members.id` UUID (no canonicalization — admin-only conditional at :76) | `enforceQuota` via `reporterFor` at `lib/reports/submit.ts:166-171` (identity = `auth.crewMemberId`) | YES (fixture `crew_member_id` per plan 04:70/107) | SHIPPED R39 commit 76 F36 |

  **2 real-identity kinds; below 3-kind structural-defense threshold.** F34-class converged at R39 — schema CHECK bounds future regressions to {admin, crew}; both now have snapshot+restore. Mechanical surface closure.

- **F36 repair (commit 76):**
  - Plan 04 (rewritten): producer-map row 70 carries Snapshot → Seed → Record 3-step recipe parallel to admin; tagging convention names two real-identity exceptions (admin + crew); NEW F36 contract block (steps 1-6) follows the F34 block at plan 04 contract section; Step 1 adds `--include-crew-id` flag + F36 regression-test assertion (same-hour sentinel count=2, cross-hour sentinel count=5); Step 4 wires crew lifecycle (a)-(e) alongside admin; Step 5 enumerates two real-identity exceptions; Step 2 verify-cleanup combined invocation; failure-modes section adds real-crew_member_id + F36 destructive-cleanup regression bullets
  - Spec §9.1.2:824 (rewritten): CLI args column adds `[--include-crew-id <uuid>]`; env-var column retires "other 7 outcomes use synthetic identities" wording, replaced with "2 real-identity (admin canonical email + crew raw UUID) + 6 synthetic-default" enumeration citing `lib/reports/submit.ts:168` for crew identity-shape contract; idempotency column appends F36 snapshot+restore contract block (steps 1-6) parallel to F34; emergency escape hatch flag set requires `--kind admin|crew` mandatory

- **F21-class 7th regex generalization (commit 77):**
  - Before: hardcoded `kind='admin'` (admin-specific)
  - After: `kind\s*=\s*['"](?:admin|crew)['"]` alternation; DELETE-verb proximity widened 80→160 chars (accommodates F35 broken wording where table name sits between `delete` and predicate); disambiguator simplified
  - **Stays at 7 regex patterns total** (generalized, not added)
  - **RED→GREEN evidence with 5 new crew fixtures:** `brokenF36CrewPreFixWording` + `brokenF36CrewAltWording` FIRE; corrective-with-bucket / historical-frame / waiver / non-cleanup-mention all PASS
  - Pre-existing F35 admin fixtures regression-clean

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 76 | `11e078a` | docs(plan-m12)+docs(spec-m12): R39 F36 — rate-limit-crew snapshot+restore + plan contradiction resolution + spec §9.1.2 propagation |
  | 77 | `df2dacc` | test(cross-cutting): R39 F21-class 7th regex generalization (kind-agnostic) + crew negative-case fixtures (RED→GREEN) |

- **Meta-test regression:** **18/18 PASS** maintained (regex generalized; +5 crew fixtures inside existing F21-class test).

- **Same-vector + structural-defense status post-R39:**
  - **F34-class: 2 rounds, converged at R39.** Schema CHECK bounds future regressions to {admin, crew}; both now have snapshot+restore. Threshold-3 calibration: a 3rd F34-class peer would require a schema change (new kind enum value), which would require its own plan amendment — mechanically impossible to regress without explicit DDL change.
  - **F21-class: 4 rounds; defense at 7 patterns (generalized).** Per R37 row Option (b) threshold flag (~8 patterns): still 1 below trigger. If R40 surfaces another F21-class peer NOT caught by 7 patterns, R41 mandates Option (b).
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R39 commit 77, regex generalization). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

---

### Amendment R40 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `b4766b2` (post-R39)
- **Verdict:** **needs-attention** (1 HIGH F37 + 1 MEDIUM F38)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F37 | HIGH | `04-phase0-tooling-report.md:91-111` (snapshot persistence options for F34/F36 contracts) | **Plan/schema drift — snapshot DB-backed option unworkable.** Plan 04 documents 2 acceptable snapshot persistence strategies: (a) file-backed at `.validation-state/<kind>-snapshot.json`; (b) `validation_state` table row at key `rate_limit_admin_snapshot` / `rate_limit_crew_snapshot`. But `validation_state` table has `CHECK (key = 'validation_seed')` per migration `:329`-area (singleton constraint). Implementer choosing (b) will fail the CHECK; OR bypass the reviewed schema; OR lose the snapshot needed for safe cleanup. **R35/R39 fix-round regression budget gap** — didn't audit live schema constraints against persistence-option claims. Repair: REMOVE option (b); default to file-backed (a) only; document validation_state singleton constraint as the reason. Extending validation_state schema is out-of-scope (live migration change). |
  | F38 | MEDIUM | `2026-05-19-solo-dev-ux-validation-design.md:824` (canonical CLI args) + `04-phase0-tooling-report.md` | rate-limit-crew recipe requires resolving `validation:resolve-alias <combo> alias_5a_lead` to get `crew_member_id` for seeding, but CLI only exposes `--outcome` at seed time. `--include-crew-id` exists only under `--cleanup`. Implementer must invent default combo or fail at runtime; wrong default seeds bucket the real crew POST never hits → false confidence in crew quota validation. Repair: add explicit seed-time selector `--combo <combo>` (or `--crew-id <uuid>`) at spec §9.1.2 + plan 04 + help-text tests + cleanup verification. |

- **Same-vector status post-R40:**
  - **F37** treated as plan/schema drift (R35/R39 fix-round regression budget gap). Per-instance fix at R41; no structural defense at this round (no class-sweep peer surfaces since validation_state is the singular candidate for DB-backed snapshot).
  - **F38** NEW class — seed-time selector missing for an outcome requiring identity resolution. 1 round; no priors. Per-instance fix.
  - F34-class mechanically converged at R39 (both rate-limit kinds have snapshot+restore; schema CHECK bounds future kinds).
  - All other classes still closed.

- **Repair commit:** closed in R41 (see below).

### Amendment R41 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `d9127df` (post-R41)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R42 adversarial review**

- **F37 repair (commit 78):** removed validation_state DB-backed snapshot option from plan 04:91-111 (admin block) + crew block + Step 4 implementation + spec §9.1.2 idempotency column. File-backed `.validation-state/<kind>-snapshot.json` is the SOLE supported strategy. Cited reason: validation_state has `CHECK (key = 'validation_seed')` per master spec §3.3.2 DDL + `02-phase0-validation-state.md:139` / `:404` — snapshot key would fail the CHECK constraint at INSERT time. Pre-R41 wording explicitly RETIRED.

- **F38 repair (commit 79):** added `--combo <R1|...|R8b>` seed-time selector at spec §9.1.2:824 CLI args + plan 04 rate-limit-crew recipe + Step 1 help-text test + Step 4 lifecycle wiring + Phase 0.E.3 Step 2 cleanup verification. Semantics: REQUIRED for `--outcome rate-limit-crew`; IGNORED for all other 7 outcomes. Resolves to fixture `crew_member_id` UUID via `validation:resolve-alias <combo> alias_5a_lead`. New exit-1 cases: missing flag for rate-limit-crew + alias resolution failure. Chosen over `--crew-id` because it mirrors existing `validation:reseed --combo` vocabulary.

- **(C) class-sweep per-outcome audit** (verifying no peer outcomes lack seed-time selectors):

  | Outcome | Seed-time identity source | Gap? |
  |---|---|---|
  | success (admin/crew) | synthetic `validation_tag` | No |
  | in-flight | synthetic idempotency_key | No |
  | rate-limit-admin | `VALIDATION_ADMIN_EMAIL` env var | No (R33 covered) |
  | **rate-limit-crew** | `--combo` flag | **F38 closed R41** |
  | lookup-inconclusive / lease-expired / horizon-expired / orphaned-lost-lease | synthetic `validation_tag` | No |

  **0 peers beyond F38; per-instance singleton.**

- **`.gitignore` update:** `.validation-state/` added at line 73 with comment citing F34/F36 + F37 CHECK constraint reason. Verified via `git check-ignore -v`.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 78 | `fd36e2c` | docs(plan-m12)+docs(spec-m12): R41 F37 — remove validation_state snapshot backend; file-backed only |
  | 79 | `d9127df` | docs(plan-m12)+docs(spec-m12): R41 F38 — add `--combo <combo>` seed-time selector for rate-limit-crew |

- **Meta-test regression:** **18/18 PASS** maintained.

- **Same-vector status post-R41:**
  - F37 plan/schema drift: 1 round; closed per-instance (singleton — no peer outcomes use validation_state as backend). If R42 surfaces another plan/live-schema drift, R43 mandates structural defense (candidate: doc-guard asserting every plan-claimed persistence/storage option is compatible with live schema CHECK constraints).
  - F38 NEW class (seed-time selector gap): 1 round; per-outcome sweep confirms singleton. No structural defense.
  - F34-class mechanically converged at R39; F21-class regex 7 patterns stable; all other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + `.gitignore` (1 line). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/cross-cutting/*`.

---

### Amendment R42 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `c96a533` (post-R41)
- **Verdict:** **needs-attention** (1 HIGH F39 + 1 MEDIUM F40; F34-class threshold-3 triggered)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F39 | HIGH | `04-phase0-tooling-report.md:83-111` (rate-limit snapshot persistence) | **F34-class round 3 — snapshot file overwrite race.** Plan snapshots before every rate-limit seed + persists to one fixed file per kind (`.validation-state/rate-limit-{admin,crew}-snapshot.json`), then cleanup restores from that file. NO guard for existing snapshot. A second `rate-limit-admin` seed before cleanup overwrites original pre-seed count with already-forced count=11; a second `rate-limit-crew --combo X` overwrites first crew UUID's snapshot with another UUID. Cleanup restores WRONG state OR leaves first seeded quota row behind. **R39 mechanical-convergence claim was schema-CHECK-bounded only**; snapshot persistence is a SEPARATE destructive mechanism the audit missed. Repair: refuse-existing-snapshot (simpler, prevents the race) OR keyed-snapshots by kind+identity+hour (preserves first-snapshot semantics). Add regression test for duplicate-seed-before-cleanup. |
  | F40 | MEDIUM | `04-phase0-tooling-report.md:58-70` (CLI `--outcome` contract) + `2026-05-19-solo-dev-ux-validation-design.md:824` (spec §9.1.2) | **F38-class class-sweep miss in R41 (C) audit.** Spec §9.1.2 + R31 producer map distinguish "success (admin)" + "success (crew)" as 2 distinct rows (different `reported_by_kind`, different UI/body). CLI exposes only `--outcome success` — no actor selector. R41 (C) sweep claimed "success (admin/crew): synthetic via validation_tag — no gap" but missed the actor distinction. Implementer can't know which row shape to materialize → one success surface silently unwalked. Repair: split `--outcome success` → `--outcome success-admin` + `--outcome success-crew`, OR add required `--actor admin\|crew` selector. Update spec §9.1.2 row + MATRIX-INVENTORY instructions + stdout contract + tests. |

- **Same-vector + structural-defense status post-R42:**
  - **F34-class: 3 rounds, threshold-3 TRIGGERED** (R34 F34 admin destructive cleanup + R38 F36 crew not covered + R42 F39 snapshot file race). Per M12 plan R5 precedent, R43 MUST ship structural defense in same commit series. Defense candidate: doc-guard asserting every snapshot-protocol section has refuse-existing-snapshot OR keyed-snapshots protection. R39 mechanical-convergence claim retracted — was schema-CHECK-bounded only; snapshot file races are a separate destructive mechanism outside the schema constraint scope.
  - **F38-class: 2 rounds** (R38 F36 crew not covered + R42 F40 success actor-selector gap). Per same-vector recurrence, R43 must audit ALL outcomes for hidden actor-distinction / row-shape-variant gaps. R41 (C) audit was scoped narrowly; R43 audit must enumerate per-outcome **row-shape distinct values** (not just identity-source).
  - All other classes still closed.

- **Repair commit:** pending R43 implementer dispatch (inline Agent; F39 + F40 per-instance + F34-class structural defense + F38-class re-analysis).

### Amendment R43 — 2026-05-26 (repair)

- **Diff base:** `7f2c188` (post-R42 handoff row)
- **Diff target:** `4bec1ac` (post-R43 commits 80–82)
- **Verdict:** **closed** (F39 + F40 per-instance fixes landed; F34-class round 3 structural defense shipped in same commit series per M12 plan R5 precedent; F38-class re-analysis surfaced ONE additional peer (lookup-inconclusive) which received per-instance `--alert-code` selector — total 2 F38-class peers, below the 3-peer threshold for sibling structural defense per the brief's conditional (E))

- **(B) R43 per-outcome variant audit (canonical source for F38-class re-analysis):**

  | `--outcome` | Distinct row-shape variants | Variant differentiator | CLI selector? | R43 disposition |
  |---|---|---|---|---|
  | `success` (pre-R43) | 2 (admin / crew) | `reported_by_kind`, response body shape (admin carries `github_issue_url` per `lib/reports/submit.ts:179-186`; crew omits) | **NO — F40 HIT** | **SPLIT** → `success-admin` + `success-crew` (commit 81) |
  | `in-flight` | 1 | — | N/A | unchanged |
  | `rate-limit-admin` | 1 | — | N/A (env-var-sourced identity) | unchanged |
  | `rate-limit-crew` | 1 | — | N/A (`--combo` selector exists per R41 F38) | unchanged |
  | `lookup-inconclusive` | **4** (BOT_LOGIN_MISSING / DUPLICATE_LIVE_MATCHES / OPEN_ISSUE_WITH_ORPHAN_LABEL / generic) | `admin_alerts.code` per `lookupAlertCode` at `lib/reports/submit.ts:202-208` | **NO — F40-CLASS PEER** | **SELECTOR** → `--alert-code <bot-login-missing\|duplicate-live-matches\|open-orphan-label\|inconclusive>` (commit 81; default `bot-login-missing` matches pre-R43 fixture context) |
  | `lease-expired` | 1 | — | N/A | unchanged |
  | `horizon-expired` | 1 | — | N/A | unchanged |
  | `orphaned-lost-lease` | 1 | — | N/A | unchanged |

  **Total: 2 F40-class peers (success + lookup-inconclusive); below 3-peer threshold for sibling F38-class structural defense per brief's conditional (E). Per-instance fixes in commit 81 close both.**

- **F39 repair (commit 80):** plan 04 F34 (admin) + F36 (crew) contract blocks each gain a (4a) refuse-existing-snapshot guard step; new `--force-overwrite-snapshot` flag is the explicit crash-recovery escape hatch (warns about lost pre-seed `prior_count`); cleanup steps gain unlink-on-cleanup-success semantics; Step 1 test list adds 6 assertions (help-text mirror; duplicate-admin-seed-refuses; duplicate-crew-seed-refuses; force-overwrite-admin-accepts; force-overwrite-crew-accepts; force-overwrite-non-rate-limit-rejects); Step 4 implementation wires (a0) F39 guard alongside F34 + F36 lifecycles; F39 regression-test block covers duplicate-seed-without-cleanup-refuses + force-overwrite-with-warning + unlink-on-cleanup + cross-combo-clobber-also-refuses; new failure-mode bullet; spec §9.1.2:824 row gains `[--force-overwrite-snapshot]` in CLI args column + (7) refuse-existing-snapshot block in both admin and crew contract paragraphs + new exit-1 case.

- **F40 repair (commit 81):** plan 04:58 outcome enum updated to 9 values (`success` → `success-admin` + `success-crew`); `--alert-code` selector documented with 4-variant default `bot-login-missing` matching pre-R43 fixture context; producer-map rows 66/67 renamed to `success-admin` / `success-crew`; producer-map row 71 (lookup-inconclusive) extended with `--alert-code` selector + `lookupAlertCode` cite; Step 1 test list adds 4 assertions (help-text mirror for both selectors; `--alert-code <invalid>` rejected; each of 4 variants materializes correct `admin_alerts.code`); Task 0.E.0 MATRIX-INVENTORY band F slice updated to 9 rows; count references propagated ("other 7 outcomes" → "other 8 outcomes"; "8 outcomes total = 2 + 6" → "9 outcomes total = 2 + 7"; "All other 6 outcomes" → "All other 7 outcomes"); new failure-mode bullet (F40 silent variant under-coverage); spec §9.1.2:824 row gains 9-outcome enum + `[--alert-code <variant>]` flag + updated 2+7 split commentary + exit-1 case for unknown alert-code.

- **F34-class round 3 structural defense (commit 82 — MANDATORY per threshold-3 trigger):** two new tests extend `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` under the existing R15 F10-class describe block.
  - Live-scan test: every snapshot-protocol surface in `{plan 04, spec §9.1.2}` that documents seed markers (`snapshot+restore`, `.validation-state/rate-limit-{admin,crew}-snapshot.json`, `snapshot at seed time`, `Snapshot persistence`) MUST also document at least one protection marker (`refuse-existing-snapshot`, `--force-overwrite-snapshot`, `keyed-snapshot`, `refuses to seed if snapshot present`, `snapshot file already present`, `refuse-to-seed`, `existing-snapshot guard`). File-level invariant (NOT per-±N-char window) because table-cell layouts cluster seed markers ~5k chars from the protection paragraph. Historical-qualifier + `<!-- not-f34-class: -->` waiver are the escape hatches.
  - Negative-case test: synthetic pre-R43 fixtures (seed markers present, no protection) FIRE (`expect(...fires).toBe(true)`); synthetic post-R43 fixtures (refuse-existing-snapshot, keyed-snapshot, `--force-overwrite-snapshot`, historical-frame, waiver, non-snapshot-protocol mention) PASS. Pins regex semantics so future edits cannot relax the contract — mirrors the F24 / F21-class negative-case pattern.

- **F34-class round 3 RED→GREEN evidence:**
  - Pre-commits-80–81 (synthetic equivalents in the negative-case fixtures): walker FIRES with 8 file-level findings on the live plan + spec. ✓
  - Post-commits-80–81 (live plan + spec carry refuse-existing-snapshot + `--force-overwrite-snapshot` prose): walker PASSES. ✓
  - Negative-case fixture `brokenPreR43Admin` (pre-R43 wording): `fires=true` ✓
  - Negative-case fixture `correctivePostR43Admin` (post-R43 wording): `fires=false` ✓
  - All 7 escape-hatch fixtures (corrective + historical + waiver + canonical + non-snapshot mention): `fires=false` ✓

- **(E) F38-class re-analysis defensive bundle decision:** per the brief's conditional ("If (B) audit surfaces 3+ outcomes with row-shape gaps, ship F38-class structural defense... If only success (and maybe lookup-inconclusive) hit, per-instance fixes suffice"), R43 (B) audit found exactly 2 F40-class peers (success + lookup-inconclusive). Below the 3-peer threshold. Per-instance fixes in commit 81 close both. **No sibling structural defense shipped for F38-class — defer until R44+ surfaces a third peer.**

- **Same-vector + structural-defense status post-R43:**
  - **F34-class: 3 rounds, structural defense LANDED in same commit series per M12 plan R5 precedent.** R39 mechanical-convergence claim retracted at R42; R43 ships the contract-level doc-guard. Future drift on either snapshot file OR a new snapshot-protocol surface added to the live walker's `SNAPSHOT_PROTOCOL_SURFACES` list (without protection prose) fails CI structurally. The class is closed at the contract level pending R44 confirmation no peer surfaces.
  - **F38-class: 2 rounds, per-instance fixes; below 3-peer threshold for structural defense.** R43 (B) audit enumerated all 8 outcomes (pre-R43) × all row-shape variants and found 2 peers — both received per-instance CLI fixes (split for success; selector for lookup-inconclusive). If R44 surfaces a third F40-class peer (e.g., a future amendment introduces a new outcome with multiple variants), structural defense becomes mandatory.
  - All other classes still closed.

- **Repair commit series:**

  | # | SHA | Title |
  |---|---|---|
  | 80 | `0e03d7c` | docs(plan-m12)+docs(spec-m12): R43 F39 — refuse-existing-snapshot guard + --force-overwrite-snapshot flag + regression spec |
  | 81 | `79986bd` | docs(plan-m12)+docs(spec-m12): R43 F40 — split --outcome success → success-admin + success-crew + --alert-code selector for lookup-inconclusive |
  | 82 | `4bec1ac` | test(cross-cutting): R43 F34-class round 3 structural defense — snapshot-protocol guard (RED→GREEN) |

- **Meta-test counts post-R43:**
  - `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts`: 14 → **16** (+2 — live-scan + negative-case)
  - `tests/cross-cutting/*` aggregate: 140 → **142** (+2)

- **R44 watch:** if R44 adversarial review still surfaces F34-class findings (snapshot protocol OR adjacent destructive-cleanup peer), the analysis was incomplete — escalate per AGENTS.md "Structural-defense calibration" same-commit-series rule. Likely candidates: validation-state row-locking patterns for the in-progress claim path (off-scope here); other JSON-file persistence in `.validation-state/` if Phase 0.C/0.F adds any.

### Amendment R44 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `95fbc02` (post-R43)
- **Verdict:** **needs-attention** (1 HIGH F41 — R43 fix-round regression budget gap)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F41 | HIGH | `05-phase0-smokes.md:80-85` (Smoke 7) + `04-phase0-tooling-report.md:191-196 + :215` (rendering assertion table) + Phase 0.E.3 | Smoke 7 invokes `pnpm validation:report-fixtures --outcome lookup-inconclusive` with no `--alert-code` flag (R43 default = `bot-login-missing`); Step 3 asserts `admin_alerts.code='REPORT_LOOKUP_INCONCLUSIVE'`. Same stale assertion appears at plan 04 rendering table + Phase 0.E.3. **R43 commit 81 fix-round regression budget gap** — added selector + default but didn't sweep dependent assertions. Per-instance fix: pick alignment (explicit `--alert-code inconclusive` everywhere the assertion expects `REPORT_LOOKUP_INCONCLUSIVE`, OR keep defaults + update assertions to `REPORT_DUPLICATE_LIVE_MATCHES` / `REPORT_OPEN_ORPHAN_LABEL` / `GITHUB_BOT_LOGIN_MISSING` matching bot-login-missing variant). Sweep all dependent sites. Optionally add doc-guard rejecting bare `--outcome lookup-inconclusive` paired with `REPORT_LOOKUP_INCONCLUSIVE` assertion in the same window. |

- **Same-vector status post-R44:**
  - F41 fix-round regression budget gap (R43 commit 81): per-instance scoped; sweep dependent assertions. NOT a new class.
  - F34-class round 3 structural defense (R43 commit 82) regression-clean.
  - F38-class closed at R43 (per-instance + (B) audit).
  - All other classes still closed.

- **Repair commit:** closed in R45 (see below).

### Amendment R45 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `08e7b8d` (post-R45)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R46 adversarial review**

- **(A) `--alert-code` selector → catalog code mapping** (verified vs `lib/reports/submit.ts:203-207`):

  | selector flag | LookupInconclusiveCode | catalog code |
  |---|---|---|
  | `--alert-code bot-login-missing` (default) | `BOT_LOGIN_MISSING` | `GITHUB_BOT_LOGIN_MISSING` |
  | `--alert-code duplicate-live-matches` | `DUPLICATE_LIVE_MATCHES` | `REPORT_DUPLICATE_LIVE_MATCHES` |
  | `--alert-code open-orphan-label` | `OPEN_ISSUE_WITH_ORPHAN_LABEL` | `REPORT_OPEN_ORPHAN_LABEL` |
  | `--alert-code inconclusive` | (default branch — no enum match) | `REPORT_LOOKUP_INCONCLUSIVE` |

- **F41 alignment direction:** Option 1 (explicit `--alert-code inconclusive` at all assertion sites expecting `REPORT_LOOKUP_INCONCLUSIVE`). Justification: Smoke 7's intent IS the canonical "lookup inconclusive" surface (default branch of `lookupAlertCode`). Keeping safe CLI default + explicit happy-path testing aligns with fixture context AND smoke documented intent.

- **F41 per-instance fix + sweep (commit 84):** 4 sites PATCHED, 3 CLEAN.
  - `05-phase0-smokes.md:80` Smoke 7 Step 2 seed: added `--alert-code inconclusive` + R45 note
  - `05-phase0-smokes.md:84` Smoke 7 Step 3 assertion: selector cite for default branch
  - `04-phase0-tooling-report.md:196` rendering predicate row: selector variant prose + R45 note
  - `04-phase0-tooling-report.md:215` Phase 0.E.3 Step 1: `--alert-code inconclusive` to seed cmd + R45 note
  - `04-phase0-tooling-report.md:24` mapping doc reference: CLEAN (documentation, not assertion)
  - `04-phase0-tooling-report.md:71` producer-map row: CLEAN (documents all 4 mappings)
  - `spec §9.1.2:824` selector definition: CLEAN (mapping documentation)
  - Sweep verification: `rg '\-\-outcome lookup-inconclusive(?!.*--alert-code)'` returns ZERO post-patch

- **Structural defense decision:** NOT shipped at R45. F41 is fix-round regression budget gap (R43 commit 81 didn't sweep dependents), not class recurrence. R46 proves class recurrence if a new alert-code-selector-vs-assertion gap appears; 8th regex pattern in F21-class defense would hit R37/R39's ~8-pattern Option-(b) threshold — defer until class proves recurrent. Per-instance + sweep is proportional.

- **Repair commit:**

  | # | SHA | Title |
  |---|---|---|
  | 84 | `08e7b8d` | docs(plan-m12): R45 F41 — align --outcome lookup-inconclusive with explicit --alert-code inconclusive at dependent assertion sites |

- **Meta-test regression:** **22 test files / 142 tests PASS** in `tests/cross-cutting/` (full suite unchanged).

- **Same-vector status post-R45:** F41 (R43 fix-round regression budget gap) closed per-instance. No same-vector trigger. All structural defenses regression-clean.

- **Scope discipline:** plan markdown only. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/cross-cutting/*`. Live `lib/reports/submit.ts:202-208` read for codebase grounding only.

---

### Amendment R46 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `72333a7` (post-R45)
- **Verdict:** **needs-attention** (2 MEDIUM; F42 F21-class round 5)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F42 | MEDIUM | `2026-05-19-solo-dev-ux-validation-design.md:841` (spec §9.0/§9.2 smoke 7) | **F21-class round 5** (R20+R22+R32+R36+R46). Spec smoke 7 still says bare `pnpm validation:report-fixtures --outcome lookup-inconclusive` (no `--alert-code inconclusive`). R45 fixed plan but didn't propagate to canonical spec. F21-class regex at 7 patterns; F42 NOT caught (new shape: actionable CLI command in spec smoke section diverges from plan canonical form). Per R37/R39 documented escalation: Option (b) mandate fires — **OR** orchestrator-ratified 8th regex pattern (per R46 orchestrator decision: 8th regex incremental; if R48 surfaces another F21-class peer NOT caught by 8 patterns, R49 mandates Option (b)). |
  | F43 | MEDIUM | `04-phase0-tooling-report.md:191-192` (rendering assertion table) | Rendering assertion table still uses `success (admin/crew)` labels post-R43 split (canonical enum now `success-admin` + `success-crew`). R43 commit 81 fix-round regression budget gap. Per-instance fix: convert to canonical enum values; sweep for remaining action-oriented `success` admin/crew labels. |

- **Orchestrator escalation decision 2026-05-26:** Option (b) refactor deferred; 8th regex + per-instance fixes ratified for R47. Trigger: if R48 surfaces F21-class peer NOT caught by 8 patterns, R49 mandates Option (b) refactor (spec §13.2.3-style structural ratification catalog + per-amendment-commit test assertion).

- **Same-vector status post-R46:**
  - **F21-class: 5 finding-rounds.** R47 ships 8th regex (incremental). Documented Option-(b) trigger at next-round occurrence if 8th pattern doesn't catch.
  - F43 fix-round regression budget gap (R43 commit 81): per-instance + sweep.
  - F34-class round 3 structural defense regression-clean.
  - F38-class closed at R43.
  - All other classes still closed.

- **Repair commit:** closed in R47 (see below).

### Amendment R47 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `22908b7` (post-R47)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R48 adversarial review**

- **F42 sweep results (per-surface):**
  - spec :762 (§9.0 task 0.E row): PATCHED — explicit `--alert-code inconclusive` + R47 note
  - spec :841 (§9.2 smoke 7): PATCHED — explicit `--alert-code inconclusive` + R47 note
  - spec :1316 (§12 F3 self-review historical narrative): HISTORICAL — describes R24 smoke addition
  - plan 04:136 (help-text mirror): DOCUMENTATION — selector contract, not actionable invocation
  - plan 04:213 (R31 was-versus-is): HISTORICAL — quotes pre-R31 verbatim; inline waiver added
  - handoff :1009 / :1480: HISTORICAL audit-trail entries

- **F43 sweep results (per-surface):**
  - plan 04:191 rendering predicate row (success-admin): PATCHED to canonical enum + R47 historical annotation
  - plan 04:192 rendering predicate row (success-crew): PATCHED + R47 historical annotation
  - spec §4.2:517 Band F producer-mapping prose: PATCHED to canonical enum + R47 historical annotation
  - plan 04:58 + plan 04:233 (F40 finding narratives): HISTORICAL — pre-R43 retired wording; inline waivers/qualifiers added
  - handoff §9 R31 :982/:983: HISTORICAL audit-trail

- **F21-class 8th-slot regex** (2 sub-patterns grouped under one structural slot):
  - `outcome-enum:lookup-inconclusive-missing-alert-code`: `/--outcome\s+lookup-inconclusive\b(?![\s\S]{0,140}?--alert-code)/i`
  - `outcome-enum:bare-success-no-actor-suffix`: `/--outcome\s+success(?![-_]?(?:admin|crew))/i`
  - Both reuse existing HISTORICAL_QUALIFIER + WAIVER escape hatches
  - **Total pattern count: 9** (4 prose + 2 producer-table + 1 cleanup-recipe + 2 outcome-enum). Treated as 8 STRUCTURAL SLOTS for Option-(b) threshold tracking; the 2 outcome-enum sub-patterns share one slot per R46 ratification.

- **RED→GREEN evidence:** pre-patch walker fires 5 active-doc sites; post-patch (commit 87 + historical-context waivers at plan 04:58, :213, :233) walker fires 0 active-doc sites. Synthetic broken fixtures still FIRE; synthetic exempted (canonical-corrective + historical-frame + waiver) PASS.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 85 | `5adb946` | docs(spec-m12): R47 F42 — spec §9.0/§9.2 smoke 7 + sweep |
  | 86 | `f2197d8` | docs(plan-m12)+docs(spec-m12): R47 F43 — rendering assertion table sweep success → canonical enum |
  | 87 | `22908b7` | test(cross-cutting): R47 F21-class 8th-slot regex — actionable --outcome divergence detection (RED→GREEN) |

- **Meta-test regression:** **20/20 PASS** across 4 prose-guard files. `reseed-clears-oauth-claim-doc-guard.test.ts`: 16/16 (test count unchanged; +10 negative-case fixtures added INSIDE existing test() blocks growing assertion density not test count).

- **Same-vector status post-R47:**
  - **F21-class: 5 finding-rounds; defense at 9 regex patterns (8 structural slots).** Per R46 orchestrator ladder: if R48 surfaces another F21-class peer NOT caught by these 9 patterns, R49 MANDATES Option (b) refactor — no further regex extension.
  - F43 fix-round regression budget gap closed at R47 per-instance + sweep.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown + 1 commit to `tests/cross-cutting/` (R47 commit 87). Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`. Three live-doc historical-context tweaks at plan 04:58/213/233 were F21-class discipline edits (waiver annotations / inline qualifier insertion) per established convention, not content-bearing rewrites.

---

### Amendment R48 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `aee054f` (post-R47)
- **Verdict:** **needs-attention** (1 HIGH F44 + 1 MEDIUM F45)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F44 | HIGH | `01-phase0-infra.md:30-38` (Phase 0.A admin bootstrap) | **AGENTS.md invariant 3 violation** — plan instructs `lower(trim('<dev-email>'))` in SQL for admin email canonicalization. Bypasses `lib/email/canonicalize.ts` (the ONLY function that touches raw emails before entering system per invariant 3). Plan also falsely claims canonicalize.ts strips plus aliases (live helper only trims + lowercases). Implementer following this can seed admin email that doesn't match OAuth identity → blocked admin access. **NEW class — plan-level inline-email-normalization instruction.** Existing meta-test `tests/admin/no-inline-email-normalization.test.ts` catches code at execution but not plan markdown. Repair: rewrite to canonicalize-first procedure (small `tsx` invocation that imports `canonicalize.ts` and prints canonical value, then SQL inserts that canonical literal); remove false plus-alias claim. Class-sweep all plan instructions for inline email-normalization patterns (`lower(`, `trim(`, `LOWER(EMAIL)`, etc.). |
  | F45 | MEDIUM | `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts:2184-2190` (R47 8th-slot regex) | **R47 regex false-negative.** `(?![\s\S]{0,140}?--alert-code)` lookahead accepts bare `--outcome lookup-inconclusive` if ANY `--alert-code` appears within 140 chars, even if it's a separate command/line. Plan 04:136 documentation `--outcome lookup-inconclusive` + plan 04:137 unrelated `--alert-code <invalid>` mask each other; guard doesn't fire on the unwaived doc line. Repair: constrain selector to same inline code span / table cell / line as the `--outcome` token; add negative fixture (unrelated following line contains `--alert-code` → must FIRE); explicit waiver or rewrite for plan 04:136 doc line. |

- **Same-vector status post-R48:**
  - **F44 NEW class** — plan-level inline-email-normalization instruction violating AGENTS.md invariant 3. 1 round; no priors. R49 ships per-instance fix + class-sweep + decide whether existing `no-inline-email-normalization.test.ts` extends to plan markdown OR new sibling test.
  - **F45 R47 fix-round regression budget gap** — R47 regex too loose. 1 round. Per-instance tightening sufficient.
  - F21-class regex set at 9 patterns / 8 structural slots (per R47 ratification). F45 is a R47 implementation gap not a new F21-class round — keeps Option-(b) threshold tracking intact.
  - All other classes still closed.

- **Repair commit:** closed in R49 (see below).

---

### Amendment R49 — 2026-05-26 (repair)

- **Diff base:** `d30afdd` (post-R48 handoff row)
- **Diff target:** commit 90 (R49 repair triplet, this amendment)
- **Verdict:** **implementer-complete; pending R50 adversarial review**
- **Repair commits:**

  | # | Commit | Subject |
  |---|---|---|
  | 88 | `f47447f` | docs(plan-m12): R49 F44 — canonicalize-first procedure for Phase 0.A admin bootstrap + plan-level sweep |
  | 89 | `6ed611e` | test(cross-cutting): R49 F44 structural defense — new sibling test scans plan/spec markdown for inline-email-normalization instructions |
  | 90 | `b080dee` | test(cross-cutting): R49 F45 — R47 8th-slot regex same-line tightening + negative fixture + plan 04:136 waiver |
  | lint | `0644644` | chore(lint): TS strict-null non-null assertions on FORBIDDEN_PATTERNS array access (orchestrator-committed; out of R49 implementer scope per their flag) |

- **F44 repair detail:**
  - **canonicalize.ts actual semantics** verified at `lib/email/canonicalize.ts:2-6` — the helper does `raw.trim().toLowerCase()` ONLY, returns `null` for `null`/empty after trim. Does NOT strip plus-aliases. The plan's prior claim was false.
  - **Plan 01:30-38 rewrite** — replaced `INSERT INTO ... VALUES (lower(trim('<dev-email>')), now())` with a canonicalize-first procedure: `pnpm tsx -e "import('./lib/email/canonicalize.ts')..."` computes the canonical value via the registered helper into `$CANON_EMAIL`, then SQL inserts the canonical literal directly (no SQL-side normalization). Cites `lib/email/canonicalize.ts:2-6` for actual semantics. Removes false plus-alias claim. Cross-references both meta-tests that enforce the invariant at CI.
  - **Plan-level class-sweep results:**
    - `01-phase0-infra.md:30-38` → **ACTIONABLE-NEEDS-FIX** (repaired in commit 88)
    - `00-overview.md:122` → DOCUMENTATION (live-audit walker file list; not implementer instruction)
    - `03-phase0-tooling-reseed.md:583,864,866` → DOCUMENTATION (DEFERRED `M12-PHASE0C-EMAIL-CANON-EXT` extension contract — names forbidden patterns in order to forbid them in `scripts/validation-*.ts`)
    - `DEFERRED.md:25,30` → DOCUMENTATION (same extension contract)
    - Spec `2026-05-19-solo-dev-ux-validation-design.md` → CLEAN (no inline-email-normalization patterns)
    - Plan 04 `04-phase0-tooling-report.md` → CLEAN for inline-email-norm (the `canonicalize(...)` references at :146-147 describe live `enforceQuota` canonicalization path at the RPC boundary — correct invariant-3 framing, NOT implementer-copyable inline normalization)
  - **Structural defense decision (Option a vs b):** Option (b) ratified — new sibling test `tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts`. Rejected Option (a) (extend existing `tests/admin/no-inline-email-normalization.test.ts`) because the existing test walks `.ts`/`.tsx` source with a TS-grammar-aware `stripComments(src)` helper depending on `/* */` and `//` semantics; markdown lacks those constructs and the forbidden patterns are SQL/prose shapes (`lower(trim(...))`, `LOWER(EMAIL)`, `<email>.toLowerCase()`) distinct from the `.toLowerCase()`/`.trim()` call patterns. Scope creep would have required parallel grammar logic.
  - **RED→GREEN:** with commit 88's plan-file diff reverse-applied (pre-R49 broken state) the new sibling test FIRES at `01-phase0-infra.md:34` `[sql:lower-trim-email]` matched on `VALUES (lower(trim('<dev-email>')), now())`. Restoring the committed state → 10/10 tests pass.

- **F45 repair detail:**
  - **Regex tightening (commit 90)** — replaced `[\s\S]{0,140}?` with `[^\n]{0,140}?` in BOTH copies of the 8th-slot regex (`reseed-clears-oauth-claim-doc-guard.test.ts:2190` + `:2328`). Same-line constraint binds the `--alert-code` co-selector requirement to the same CLI invocation line as the `--outcome lookup-inconclusive` token. Each CLI invocation is on its own line, so same-line is the correct binding.
  - **Negative-case fixture (commit 90)** added at `reseed-clears-oauth-claim-doc-guard.test.ts` post-`waiverF42`: bare `--outcome lookup-inconclusive` on one line + unrelated `--alert-code` on next line — MUST FIRE post-tightening. Companion `f45CanonicalSameLine` fixture (canonical post-R45 same-line form) MUST NOT fire.
  - **Plan 04:136 disposition** — single-line documentation with `--alert-code` BEFORE `--outcome lookup-inconclusive`. Regex anchors at `--outcome lookup-inconclusive` and looks FORWARD; the prior `--alert-code` is invisible to the forward lookahead → regex FIRES on this line both pre-R49 and post-R49 (the tightening doesn't affect this single-line case). Repair: added explicit `<!-- not-f21-class: R43 F40 selector-documentation framing — this row documents the variant-selector CLI contract, not an actionable invocation -->` inline waiver immediately before the doc text. WAIVER_RX in the live walker (`<!--\s*not-f21-class:\s*[^-]`) now matches.
  - **Regex contrast verification (offline):** OLD `[\s\S]` does NOT fire on the cross-line cross-invocation fixture (F45 bug — bypassed). NEW `[^\n]` FIRES correctly.

- **Same-vector status post-R49:**
  - **F44 — closed via per-instance fix + plan-level class-sweep + structural defense (Option b sibling test).** Future plan/spec drift toward inline-email-normalization patterns now fails CI at `tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts`.
  - **F45 — closed via regex same-line tightening + negative fixture + plan 04:136 waiver.** Future cross-line/cross-invocation false-negatives are pinned by the new fixture.
  - F21-class regex set at 9 patterns / 8 structural slots (per R47 ratification); R49 tightens an existing slot, does NOT add a new pattern. Option-(b) structural-refactor threshold tracking intact.
  - All other classes still closed.

- **Meta-test regression count:** 78 passing (`tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts` 52 → +2 new F45 fixtures = 54; `tests/admin/no-inline-email-normalization.test.ts` 52 unchanged… correction: existing F21-class test file 52 tests + new sibling 10 tests + existing code-side meta-test 52 tests = breakdown by file: 52 + 16 + 10 = 78 total tests passing across three meta-test files). Verified locally `pnpm test tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts tests/admin/no-inline-email-normalization.test.ts` → 78 tests, 3 files, 0 failures.

### Amendment R50 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `5109d1e` (post-R49 close-out)
- **Verdict:** **needs-attention** (1 HIGH F46)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F46 | HIGH | `03-phase0-tooling-reseed.md:925` (Phase 0.C failure-mode guidance) | **R49 fix-round regression budget gap + NEW class shape.** Plan 03:925 failure-mode entry says "validation+5a@example.com canonicalizes to validation@example.com via strip-plus" — same false plus-alias claim R49 commit 88 fixed in plan 01:30-38, but NOT swept across plan 03. R49 (B) plan-level sweep classified plan 03:583/864/866 as DOCUMENTATION (correctly — those describe DEFERRED extension contract) but **missed :925** which carries the same FALSE-SEMANTICS-CLAIM. Implementer following this troubleshooting guidance can misdiagnose seed CHECK failures as helper-shape changes or alter fixtures/helper toward a non-existent strip-plus contract. R49 commit 89 structural defense catches inline-normalization patterns but doesn't catch false claims about canonicalize.ts semantics — **DIFFERENT class shape**. Repair: rewrite :925 to actual contract (`validation+5a@example.com` canonicalizes to itself except for case/outer whitespace; troubleshooting hint: inspect for payload path that skipped `canonicalize()` or supplied non-canonical value). Sweep ALL plan + spec for similar `strip-plus` / `canonicalizes to.*@example.com` / "strips plus aliases" / equivalent false-semantics claims. Consider extending R49 commit 89 structural defense with new regex pattern for false-semantics-claim shape. |

- **Same-vector status post-R50:**
  - F46 NEW class shape (false-semantics-claim about registered helper) — 1 round; no priors. Per-instance + sweep at R51.
  - F44 / F45 closed at R49 regression-clean.
  - F21-class regex set holds at 9 patterns / 8 structural slots.
  - All other classes still closed.

- **Repair commit:** closed in R51 (see below).

### Amendment R51 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `5a40863` (post-R51)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R52 adversarial review**

- **F46 repair (commit 91):** plan 03:925 rewritten — `validation+5a@example.com` canonicalizes to ITSELF (already lowercase + no outer whitespace); helper does `raw.trim().toLowerCase()` ONLY (cited `lib/email/canonicalize.ts:2-6`); + and 5a alias segment preserved. Troubleshooting hint: inspect for payload path that skipped canonicalize() OR supplied malformed/non-canonical value. Pre-R51 false claim explicitly retired + cross-referenced R49 commit 88 parallel fix.

- **(B) Class-sweep results (false-semantics-claims):**
  - `03-phase0-tooling-reseed.md:925` → PATCHED at commit 91
  - `01-phase0-infra.md:30,:48` → CLEAN (R49 commit 88 already corrected)
  - spec `:146,:156,:158` → CLEAN (CITATION — synthesized fixture format prose, not a strip-plus claim)
  - `06-phase1-matrix-walk.md:185` → CLEAN (HISTORICAL pre-R13 narrative; no semantics claim)
  - `03-phase0-tooling-reseed.md:583,:864,:866` → CLEAN (DEFERRED-extension contract per R49 (B))
  - handoff `:1615,:1643,:1678` → CLEAN (audit-trail / convergence-log records; F46_EXCLUDED_PATHS)

- **Structural defense extension (commit 92)** — Option (a) ratified (extend R49 commit 89 sibling test):
  - 3 new patterns added: `prose:plus-alias-canonicalizes-to-non-plus` (backreffed `\1@\2` regex); `prose:strip-plus-claim` (forward order); `prose:strip-plus-claim-reverse` (reverse order)
  - NEW `PatternSpec.scope` field (`"respects-exclusions"` | `"all-files"`) — F44 patterns keep `EXCLUDED_PATHS`; F46 prose patterns use stricter `F46_EXCLUDED_PATHS = {HANDOFF_FILE}` only (prose claims actionable in any source surface)
  - NEW `NEGATION_QUALIFIER_RX` bypasses "does NOT strip" / "never stripped" / "preserves the +" / "canonicalizes to ITSELF" / "raw.trim().toLowerCase() only"
  - `HISTORICAL_QUALIFIER_RX` extended with "previously claimed" / "that claim was FALSE" / "R51 commit 9N F46 amendment"
  - **RED→GREEN evidence:** pre-R51 plan 03:925 (`git show 5d1f534:`) fires all 3 F46 patterns; post-R51 commit 91 → 0 findings. 4 synthetic broken (FIRE) + 5 passing fixtures (NEGATION / HISTORICAL / no-anchor / cross-domain backref / canonicalizes-to-ITSELF).

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 91 | `60c44d5` | docs(plan-m12): R51 F46 — rewrite plan 03:925 to actual canonicalize.ts semantics |
  | 92 | `5a40863` | test(cross-cutting): R51 F46 structural defense — extend doc-guard with false-semantics-claim patterns |

- **Meta-test regression:** **89 tests / 3 files PASS** — `no-inline-email-normalization-in-plan-doc-guard.test.ts` 13→21 (+8 R51 fixtures); `reseed-clears-oauth-claim-doc-guard.test.ts` unchanged; `tests/admin/no-inline-email-normalization.test.ts` unchanged.

- **Same-vector status post-R51:** F46 NEW class shape closed via per-instance + structural defense extension. F44/F45 regression-clean. F21-class regex holds at 9 patterns / 8 slots. All other classes still closed.

- **Scope discipline:** plan + handoff markdown + 1 test file extension. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`.

---

### Amendment R52 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `dbd3661` (post-R51)
- **Verdict:** **needs-attention** (1 HIGH F47)
- **R52 invocation note:** prior R52 invocation hung mid-investigation (codex worker PID 23913 died at ~21:04:37 with `git log` exit; state JSON stuck at `running`). Cancelled via `codex-companion cancel review-mpn4g4x7-wf1h1q`; re-fired fresh at `review-mpn4q5rt-ynuayv` with bounded prompt (`≤10 verification commands`). Re-fire completed cleanly.
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F47 | HIGH | `03-phase0-tooling-reseed.md:543-564` (`validation_finalize_all_atomic` RPC body) | **NEW class — RPC TOCTOU race on singleton state.** Finalizer reads `combos_seeded_dates` snapshot, validates in PL/pgSQL, then UPDATEs `last_seed_date` without (a) a shared advisory lock with `mint_validation_fixture_atomic` AND (b) a `WHERE combos_seeded_dates = <snapshot>` guard. Concurrent reseed/retry between validation+update can stamp stale `last_seed_date` for an older complete set while singleton now contains newer per-combo dates → check-seed permanently inconsistent. Repair: compare-and-swap (Option b) — `UPDATE ... WHERE key='validation_seed' AND combos_seeded_dates = v_combos_dates_snapshot`; fail/retry if zero rows updated. TOCTOU-safe + simpler than shared advisory lock. Add regression test interleaving per-combo mint between finalizer validation and update. |

- **R49 commit 89 X.3 audit fix (orchestrator commit `a88883e`):** CI X.3 trust-domain audit (`tests/cross-cutting/no-m9-5-surfaces.test.ts`) flagged R49 commit 89 doc-guard for mentioning retired M9.5 surface `crew_member_auth` inside its regex alternation at line 127. Defensive inclusion was meaningless (table dropped at M11.5 G3 cutover; no current SQL can reference it). Removed `crew_member_auth` from regex; X.3 audit + R49 guard both pass (22/22). Pushed to main to unblock CI per stop-hook directive.

- **Same-vector status post-R52:**
  - F47 NEW class (RPC TOCTOU race on singleton state): 1 round; no priors. Per-instance fix at R53.
  - F44/F45/F46 closures regression-clean (post X.3 audit fix).
  - F21-class regex set holds at 9 patterns / 8 structural slots.
  - All other classes still closed.

- **Repair commit:** pending R53 implementer dispatch (inline Agent; F47 compare-and-swap repair + regression test spec).

---

### Amendment R53 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `6359bdc` (post-R52 handoff row + X.3 audit fix at `a88883e`)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R53 adversarial review**

- **F47 repair (commit 93):** plan `03-phase0-tooling-reseed.md` finalizer RPC body rewritten — compare-and-swap (CAS) defense added at the UPDATE block:
  - DECLARE block extended with `v_rowcount integer` for `GET DIAGNOSTICS ... ROW_COUNT` capture.
  - UPDATE clause extended with `AND combos_seeded_dates = v_combos_dates` (matches the snapshot the FOREACH validation loop read). If a concurrent `mint_validation_fixture_atomic` merged a new key into `combos_seeded_dates` between the finalizer's SELECT and UPDATE, the equality check fails and UPDATE returns 0 rows.
  - Post-UPDATE `GET DIAGNOSTICS v_rowcount = ROW_COUNT` + zero-rowcount RAISE EXCEPTION `'validation_finalize_all_atomic: combos_seeded_dates changed between snapshot and update; concurrent mint_validation_fixture_atomic detected — retry the finalize call. (TOCTOU defense per R52 F47 + R53 commit 93 compare-and-swap repair)'`.
  - Block comment (~35 lines) added BEFORE the SELECT — documents the TOCTOU surface (read-then-write straddles statements within one PL/pgSQL block, distinct from mint RPC's atomic per-statement UPSERT under per-show advisory lock), CAS rationale, and explicit shared-advisory-lock rejection rationale (would either serialize all mints contra spec §3.3 parallelism contract OR leave mint side unlocked at the new key preserving TOCTOU).

- **(B) Regression test spec (plan 03 Task 0.C.4 Step 8.5 — new step inserted between Step 8 and Step 9):** `tests/db/validation-finalize-all-atomic.test.ts` extended with 5-substep DB-side integration test exercising the CAS surface:
  1. Setup baseline mint of R1 — assert `combos_seeded_dates = {R1: $TODAY_ISO}`.
  2. N=10 concurrent trial runs: client A `validation_finalize_all_atomic(['R1'], $TODAY_ISO)` raced against client B `mint_validation_fixture_atomic('R2', <R2_payload>)`; asserts EITHER CAS-RAISE on at least one trial OR consistent post-state when no race observed. Test FAILs only on inconsistent post-state (last_seed_date stamped while singleton lost R1, OR rowcount 0 without exception).
  3. **Deterministic CAS-fire variant** via TEST-ONLY wrapper `validation_finalize_all_atomic_test_with_sleep` that injects `pg_sleep(2)` between SELECT and UPDATE phases (CREATE in test setup, DROP in `afterAll`). Client A starts wrapper, test waits 500ms, client B mutates singleton, client A awaited — asserts `CONCURRENT_MODIFICATION_RACE` exception message matches R53 commit 93 string verbatim.
  4. Concrete-failure-mode prose documents what the test catches (CAS WHERE-clause omitted, GET DIAGNOSTICS absent, UPDATE silently 0-row).
  5. Idempotency probe: two consecutive identical finalizer calls (no intervening mint) MUST both succeed.
  - DB-side rationale: TOCTOU surface lives in PL/pgSQL local state (`v_combos_dates`); application-level mock cannot exercise the race.

- **(C) Class-sweep — TOCTOU surfaces on singleton state across M12 plan RPCs:**

  | RPC | Pattern | Verdict |
  |---|---|---|
  | `mint_validation_fixture_atomic` (`03:213-505`) | Single-statement UPSERT with `ON CONFLICT (key) DO UPDATE SET combos_seeded_dates = public.validation_state.combos_seeded_dates \|\| jsonb_build_object(p_combo, ...)`. NO prior SELECT/snapshot of singleton state; the merge happens server-side inside a single statement under PostgreSQL row-level locking on the ON CONFLICT path. PLUS holds `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` per spec invariant 2. | **SAFE — atomic primitive** (no read-then-write pattern). |
  | `validation_finalize_all_atomic` (`03:543-564`) | SELECT into v_combos_dates → FOREACH validate → UPDATE last_seed_date. Read-then-write straddles statements; mutating singleton between SELECT and UPDATE is the TOCTOU race. | **TOCTOU-RISK — needs CAS (closed at R53 commit 93).** |
  | `validation-resolve-alias` (`03:716-731`) | Read-only jsonb lookup against `validation_state.alias_map`. No write path. | **NO-PATTERN — not read-then-write.** |
  | Other M12-plan RPCs touching `validation_state` | None — the only writers are the two RPCs above. `tests/db/admin-rls-runtime.test.ts` (X.6) reads via information_schema (no write); admin UI surfaces (M11.5) do not touch `validation_state`. | **N/A — no other RPC writes the singleton.** |

  Class-sweep result: **1 TOCTOU-risk peer (the finalizer itself), 0 additional peers, 1 SAFE neighbor, 1 NO-PATTERN neighbor.** Per AGENTS.md cross-cutting #5 "class-sweep before patching adversarial findings": F47 is a 1-of-1 instance, not a class with 3+ peers → per-instance fix sufficient at R53. Structural defense (e.g., a doc-guard meta-test asserting every RPC reading `validation_state` singleton followed by UPDATE carries a CAS-WHERE clause) NOT shipped at R53 — threshold not met. If a future M12 amendment adds a SECOND RPC with the same read-then-write pattern, the structural-defense calibration rule (AGENTS.md "structural defenses... ship in that round's repair commit") applies at that point.

- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 93 | `6b864c6` | docs(plan-m12): R53 F47 — validation_finalize_all_atomic compare-and-swap repair + regression test spec + class-sweep |

- **Meta-test regression:** **163 tests / 23 files PASS** for `pnpm test tests/cross-cutting/` (no test files modified at R53; spec/plan markdown only). The 3 doc-guard test files cited in the R51 row (`no-inline-email-normalization-in-plan-doc-guard.test.ts`, `reseed-clears-oauth-claim-doc-guard.test.ts`, `tests/admin/no-inline-email-normalization.test.ts`) hold at their R51 counts within the larger 23-file suite. No structural defense added (class-sweep returned 1-of-1).

- **Same-vector status post-R53:**
  - F47 NEW class (RPC TOCTOU race on singleton state): 1 round, 1 peer, per-instance closure via CAS. Threshold for structural defense (3+ peers OR 3+ rounds) not met.
  - F44/F45/F46 closures regression-clean.
  - F21-class regex set holds at 9 patterns / 8 structural slots.
  - All other classes still closed.

- **Scope discipline:** plan + handoff markdown only. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/`.

### Amendment R54 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `2772162` (post-R53)
- **Verdict:** **needs-attention** (1 HIGH F48)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F48 | HIGH | `03-phase0-tooling-reseed.md:621-627` (single-combo vs all-combo reseed semantics) | **NEW class — single-combo vs all-combo `last_seed_date` semantic gap.** Plan calls `validation_finalize_all_atomic` only for `--combo all`; single-combo reseed updates `combos_seeded_dates[combo]` but never `last_seed_date`. Smoke 6 requires `reseed --combo R1` → `check-seed --combo R1`. Predicate (b) (`last_seed_date != $VALIDATION_TODAY_ISO`) applies to any requested set → on fresh/next-day stack: R1 freshly minted but `last_seed_date` stale → predicate (b) FAILS → smoke 6 blocks OR implementer weakens predicate (b) reopening partial-reseed false-green class. Orchestrator-recommended repair: **Option (b)** — keep `last_seed_date` as all-combos-only semantics; add predicate (b') for single-combo `check-seed --combo <single>` reading `combos_seeded_dates[combo]` for per-combo freshness. Preserves "all-combos completion stamp" meaning; smoke 6 prerequisite + check-seed dispatch updated. |

- **Same-vector status post-R54:**
  - F48 NEW class (1 round); per-instance design choice + propagation. Implementer decides Option (a) vs (b) per codebase grounding.
  - F47 closed at R53 (CAS pattern shipped + class-sweep 1-of-1).
  - F46/F45/F44 closures regression-clean.
  - F21-class regex set holds at 9 patterns / 8 slots.
  - All other classes still closed.

- **Repair commit:** R55 commit 94 (pending SHA; see R55 section below).

### Amendment R55 — 2026-05-26 (F48 repair — single-combo vs all-combo `last_seed_date` semantic gap)

- **Diff base:** `b4b2c38`
- **Diff target:** post-R54 (`ba5de8b`) + commit 94 (this dispatch)
- **Verdict:** repair-only (no new adversarial review fired in R55 — R55 is the inline-Agent F48 repair commit set; next adversarial round if any is R56).
- **Design decision — Option (b) ratified.** Keep `last_seed_date` as the "all-combos completion stamp" written exclusively by `validation_finalize_all_atomic`. Add predicate (b') for single-combo dispatch reading `combos_seeded_dates[<single>]`. Re-scope predicate (b) to `--combo all` invocations only.
  - **Justification:** spec §3.3.2 + §15.27 framed the two-RPC split specifically so `last_seed_date` would mean "all combos completed today"; Option (a) (any reseed stamps `last_seed_date`) would dilute that semantic and re-open the partial-reseed false-green class that the R3/R10 amendment was built to prevent (`last_seed_date = today` while some combos in `combos_seeded_dates` still lag).  Option (a) would also need either an extended finalizer that accepts subset combos or a parallel subset-finalizer, both of which would require fanning the F47 CAS pattern (R53 commit 93) to a new write surface and re-running the class-sweep. Option (b) preserves the F47 CAS topology unchanged (CAS still scopes to `--combo all` exclusively; single-combo writes inherit the mint RPC's per-show advisory lock).
- **F48 per-instance fix (commit 94 — see SHA table below):** plan `03-phase0-tooling-reseed.md` predicate list expanded from 11 to 12 predicates (a, b, b', c-g, i, k, l, m, n); predicate (b) re-scoped with prose "Applies ONLY when invoked as `check-seed --combo all`"; new predicate (b') prose "Applies ONLY when invoked as `check-seed --combo <single>` ... `combos_seeded_dates[<single>] != $VALIDATION_TODAY_ISO`"; dispatch logic inlined immediately above the predicate list ("If the value equals `all` ... evaluator runs (a, b, ...); if single-combo enum ... evaluator runs (a, b', ...)"). Spec §3.3.2 predicate list updated in lockstep with matching (b) scope + (b') addition.
- **F48 regression test spec (plan 03 Task 0.C.5 Step 1 extension):** test fixture-sets `last_seed_date` to yesterday's ISO via service-role UPDATE; runs `reseed --combo R1` (mint stamps `combos_seeded_dates['R1']` but does NOT touch `last_seed_date`); asserts `check-seed --combo R1` exits 0 (predicate (b') reads per-combo stamp, matches today); symmetric negative — `check-seed --combo all` against the same stack exits 1 with predicate (b) diagnostic. Concrete failure mode: future amendment that collapses dispatch to "predicate (b) for any requested set" → smoke 6 blocks on fresh/next-day single-combo stacks.
- **Smoke 6 alignment (plan 05 Task 0.F.6 Step 1):** prerequisite `reseed --combo R1` + `check-seed --combo R1` unchanged; inline R55 alignment note added explaining that the second invocation passes via predicate (b') dispatch (closing the pre-R55 F48 gap where stale `last_seed_date` from an earlier day's `--combo all` run would have blocked).
- **Reseed script contract (plan 03 Step 6):** `--combo <single>` path documented as "stamps `combos_seeded_dates[<single>]` only; does NOT call `validation_finalize_all_atomic`; does NOT touch `last_seed_date`"; F47 CAS interaction explicitly called out as unchanged (CAS scopes to all-combos finalizer exclusively).
- **Same-vector status post-R55:**
  - F48 NEW class closed via Option (b) per-instance fix + dispatch logic + regression test spec (1 round, 1 instance). Threshold for structural defense (3+ peers OR 3+ rounds) not met — F48 is a 1-of-1 dispatch-semantic instance, not a class with peers.
  - F47 CAS pattern (R53 commit 93) untouched and regression-clean (Option b ratification preserves the all-combos-only CAS topology).
  - F21-class regex set holds.
  - All other classes still closed.
- **Repair commit:** commit 94 (`727afeb`).

  | # | SHA | Title |
  |---|---|---|
  | 94 | `727afeb` | `docs(plan-m12)+docs(spec-m12): R55 F48 — Option (b) single-combo dispatch + predicate (b') + smoke 6 prerequisite + regression test spec` |

### Amendment R56 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `140cbc5` (post-R55)
- **Verdict:** **needs-attention** (1 HIGH F49 — F48-class round 2)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F49 | HIGH | `03-phase0-tooling-reseed.md:483-501` (mint RPC initial INSERT) | **F48-class round 2 same-vector.** R55 Option (b) closed predicate-side semantic ("`last_seed_date` stamped only by `validation_finalize_all_atomic`"); R56 surfaces INSERT-side bypass — mint RPC's initial `validation_state` singleton creation stamps `last_seed_date = v_validation_today_iso` on first use. If first operation is `validation:reseed --combo R1`, global all-combos stamp is set without finalizer ever running. After enough single-combo reseeds same day → `check-seed --combo all` predicate (b) PASSES without `validation_finalize_all_atomic`. F47 CAS contract bypassed. Repair: make mint RPC initial INSERT incapable of stamping fresh all-combos date. Recommended Option (ii) — `last_seed_date NULL` on initial INSERT; predicate (b) treats NULL as stale (`last_seed_date IS NULL OR last_seed_date != $VALIDATION_TODAY_ISO`); DDL bumps `last_seed_date` from NOT NULL → nullable. Add regression: start from no validation_state row → `reseed --combo R1` → assert `last_seed_date IS NULL` AND `check-seed --combo all` FAILS until `validation_finalize_all_atomic` executes. |

- **Same-vector status post-R56:**
  - **F48-class: 2 rounds** (R54 F48 predicate-side + R56 F49 INSERT-side). Below threshold-3; per-instance fix at R57. If R58 surfaces another F48-class hit, structural defense mandate fires.
  - F47 closed at R53; F46/F45/F44 regression-clean.
  - F21-class regex set holds at 9 patterns / 8 slots.
  - All other classes still closed.

- **Repair commit:** closed in R57 (see below).

### Amendment R57 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `8009f21` (post-R57)
- **Dispatch mode:** inline Agent
- **Verdict:** **implementer-complete; pending R58 adversarial review**

- **F49 repair (commit 95 — `8009f21`):**
  - **(A) DDL change:** `validation_state.last_seed_date date NOT NULL` → `last_seed_date date NULL` at plan 02:140 + master-spec mirror :405 + spec §3.3.2:225. Plan 02 schema test :107 asserts `is_nullable="YES"` to pin nullable contract.
  - **(B) Mint RPC INSERT fix (plan 03:483-501):** `last_seed_date` REMOVED from both INSERT column-list AND value-list — initial singleton creation produces NULL. ON CONFLICT DO UPDATE SET pre-R57 already excluded the column; re-confirmed.
  - **(C) Predicate (b) NULL handling:** plan 03:724 + spec §3.3.2:351 — `last_seed_date != $VALIDATION_TODAY_ISO` → `last_seed_date IS NULL OR last_seed_date != $VALIDATION_TODAY_ISO`. Separate NULL diagnostic ("…has never executed; run reseed --combo all…") + stale diagnostic.
  - **(D) F47 CAS interaction:** UNCHANGED. Finalizer's `combos_seeded_dates = v_combos_dates` CAS WHERE clause unaffected; mint never writes `last_seed_date` now structurally enforced via (B), so no new TOCTOU surface.
  - **(E) Regression test spec:** plan 03 Task 0.C.5 Step 1 — DELETE singleton row → `reseed --combo R1` → assert `last_seed_date IS NULL` AND `combos_seeded_dates['R1']=today` → `check-seed --combo R1` exits 0 (b') → `check-seed --combo all` exits 1 with NULL diagnostic (b) → `reseed --combo all` stamps `last_seed_date=today` → `check-seed --combo all` exits 0.
  - **(F) Class-sweep results:** only `validation_finalize_all_atomic` writes `last_seed_date` (plan 03:619 finalizer SET clause); only predicate (b) reads it (predicate (b') reads `combos_seeded_dates`). No peers. Spec sections updated: §3.3 verification-command row (151) + §3.3.2 DDL (225) + §3.3.2 mint paragraph (347) + §3.3.2 predicate (b) (351).

- **Repair commit:**

  | # | SHA | Title |
  |---|---|---|
  | 95 | `8009f21` | docs(plan-m12)+docs(spec-m12): R57 F49 — mint RPC INSERT-side last_seed_date bypass closure |

- **Meta-test regression:** **23 test files / 163 tests PASS** in `tests/cross-cutting/` (no test changes; markdown-only repair).

- **Same-vector status post-R57:**
  - F48-class round 2 closed at R57 via per-instance fix + class-sweep (0 peers). Per R56 row ladder: if R58 surfaces another F48-class hit, structural defense mandate fires per threshold-3.
  - F47 closed at R53 (CAS); F46/F45/F44/F40-F43 closures regression-clean.
  - F21-class regex set holds at 9 patterns / 8 slots.
  - All other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown only. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/cross-cutting/*`.

### Amendment R58 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `dcc6dae` (post-R57)
- **Verdict:** **needs-attention** (1 HIGH F50 — R57 fix-round regression budget gap; migration drift-safety)
- **Finding:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F50 | HIGH | `02-phase0-validation-state.md:141-178` (validation_state DDL idempotency) | **R57 fix-round regression budget gap — migration not drift-safe.** Canonical migration declares `last_seed_date date NULL` but uses `CREATE TABLE IF NOT EXISTS` — declaration only applies on first creation. No follow-up `ALTER COLUMN last_seed_date DROP NOT NULL`. Pre-R57 draft specified NOT NULL; any prod-equivalent OR dev stack that applied earlier M12 draft keeps NOT NULL constraint. R57 mint RPC INSERT omitting last_seed_date then fails on drift'd stacks → F49 closure path broken. **Classification:** migration discipline (per AGENTS.md "CHECK/enum migration matrix" rule: apply-twice idempotency). NOT F48-class round 3 (semantic vs migration drift-safety distinct mechanisms); threshold-3 stays armed for genuine F48-class recurrence. Repair: add idempotent `ALTER TABLE public.validation_state ALTER COLUMN last_seed_date DROP NOT NULL` immediately after CREATE TABLE block in plan 02 + spec §3.3.2 mirror; extend schema test to assert nullable on existing-NOT-NULL stack; sweep for other M12 DDL changes lacking drift-safety. |

- **Same-vector status post-R58:**
  - F50 R57 fix-round regression budget gap (migration drift-safety): 1 round; per-instance fix at R59.
  - F48-class: 2 rounds (R54 + R56); threshold-3 trigger remains armed for genuine F48-class recurrence at R60+.
  - F47 closed at R53; all other classes still closed.

- **Repair commit:** pending R59 implementer dispatch (inline Agent; F50 ALTER COLUMN DROP NOT NULL + spec mirror + schema test extension + sweep for other M12 DDL drift-safety gaps).

### Amendment R59 — 2026-05-26

- **Diff base:** `da1f2b3` (post-R58 handoff)
- **Diff target:** `c82a9e3` (commit 96 — R59 repair)
- **Verdict:** **implementer-complete; pending R60 adversarial review**
- **Repair (per F50 instructions):**

  | Surface | Change |
  |---|---|
  | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:141-178` | Inserted idempotent drift-repair `ALTER TABLE public.validation_state ALTER COLUMN last_seed_date DROP NOT NULL;` immediately after `CREATE TABLE IF NOT EXISTS` block, with inline comment citing R59 F50 + AGENTS.md apply-twice idempotency rule. Sequence: CREATE TABLE IF NOT EXISTS → ALTER COLUMN DROP NOT NULL (R59 drift-repair) → DO $$ DROP/ADD CONSTRAINT (R12 enum-drift) → ALTER COLUMNs (R16 alias_map/combos_seeded_dates drift-repair). |
  | `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md:232+` | Mirrored the same drift-repair stanza into spec §3.3.2 canonical DDL block with parallel inline rationale. Spec and plan DDL are now byte-equivalent on this stanza. |
  | `02-phase0-validation-state.md` Task 0.B.2 Step 1 schema test (`tests/db/validation-state.test.ts` body) | Added a second `test()` block `ALTER COLUMN DROP NOT NULL drift-repair on pre-R57 NOT NULL stack (R59 F50)`. Setup forces `SET NOT NULL` (simulating pre-R57 stack), asserts is_nullable="NO", applies the canonical migration's `DROP NOT NULL`, asserts is_nullable="YES", then re-applies to verify apply-twice idempotency (no-op on already-nullable column). |

- **(B) sweep — other M12 DDL drift-safety gaps:**

  | Surface | Type | Classification | Action |
  |---|---|---|---|
  | Plan 02 §validation_state DDL — `last_seed_date` nullability | Column constraint changed across R-rounds (R57: NOT NULL → NULL) | **DRIFT-UNSAFE** → repaired this round | ALTER COLUMN DROP NOT NULL added (this commit) |
  | Plan 02 §validation_state DDL — `alias_map`, `combos_seeded_dates` | Column added mid-amendment (R12 alias_map, R3 combos_seeded_dates) | DRIFT-SAFE | Already use `ADD COLUMN IF NOT EXISTS` + `ALTER COLUMN SET DEFAULT` + `ALTER COLUMN SET NOT NULL` + DO $$ type-drift fail-loud. No change needed. |
  | Plan 02 §validation_state DDL — `validation_state_combos_check` CHECK enum | Enum list changed across R-rounds (R8 split R7/R8, R11 added SW-SHOW_LAST) | DRIFT-SAFE | Already uses `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` inside DO $$. No change needed. |
  | Plan 02 §validation_state DDL — admin_only RLS policy | Policy shape changed across R-rounds (R9, R15 fold-in) | DRIFT-SAFE | Already uses `DROP POLICY IF EXISTS` + `CREATE POLICY`. No change needed. |
  | Plan 02 §validation_state DDL — REVOKE/GRANT block | Added R17 F15 PostgREST DML lockdown | DRIFT-SAFE | `REVOKE`/`GRANT` are inherently idempotent (PostgreSQL no-ops on identical grant state). No change needed. |
  | Plan 03 `mint_validation_fixture_atomic` function body | Function definition (DDL via `CREATE OR REPLACE FUNCTION`) | DRIFT-SAFE | Function bodies use `CREATE OR REPLACE FUNCTION` which replaces whole body atomically; no in-place column/constraint mutation. SET clause changes (R27 F27 archived/published) operate on row data via UPDATE, not on schema. No change needed. |
  | Plan 03 `validation_finalize_all_atomic` function body | Function definition | DRIFT-SAFE | Same as above. R53 F47 CAS predicate operates on row data, not schema. No change needed. |
  | Plan 03 / Plan 04 — table CREATE/ALTER statements | None (verified via grep — only existing-table references) | N/A — no DDL | M12 amendment scope does not introduce or modify any table other than `validation_state`. Pre-existing CHECK constraints (`crew_members.email`, `show_share_tokens.share_token`) are read-only references, not modified. |
  | Spec §3.3.2 DDL block | Mirror of plan 02 DDL | **DRIFT-UNSAFE** → repaired this round | ALTER COLUMN DROP NOT NULL added (this commit). |

  **(B) sweep result:** 1 surface drift-unsafe (`last_seed_date` nullability — the F50 instance). 0 peers. Per F50 instructions, peer count < 3 → **per-instance fix only at R59; no structural defense ships this round**. Structural defense for "migration drift-safety for column constraint changes" remains deferred until threshold-3 (3+ peers) is reached. The (B) sweep table itself is preserved in the R59 row so a future reviewer surfacing a peer can see the audit trail.

- **Structural defense decision:** **deferred** (1 peer < threshold-3). The drift-safety class is round 1 of a new class shape; per the AGENTS.md recurring-bug response ladder, structural defenses (doc-guard scanning every M12 plan DDL with `CREATE TABLE IF NOT EXISTS` for follow-up ALTER coverage on mid-amendment column-constraint changes) ship at 3+ rounds. A future R-round surfacing another DDL drift-safety hit triggers the doc-guard; document the class in the AGENTS.md "CHECK/enum migration matrix" rule body as the candidate structural defense.

- **Meta-test regression:** **23 test files / 163 tests PASS** in `tests/cross-cutting/` (no test changes this round; markdown-only repair). The new schema-test block lands in `tests/db/validation-state.test.ts` when Phase 0.B executes — it is not a `tests/cross-cutting/` member.

- **Same-vector status post-R59:**
  - F50 (migration drift-safety): closed at R59 via per-instance fix + (B) sweep covering all M12 DDL surfaces. 0 peers found. Structural defense deferred per threshold-3 ladder. If R60+ surfaces another DDL drift-safety hit, doc-guard structural defense fires per AGENTS.md recurring-bug ladder rung 2.
  - F48-class: 2 rounds (R54 + R56); threshold-3 trigger remains armed.
  - F47 closed at R53; F46/F45/F44/F40-F43 closures regression-clean; F21-class regex set holds at 9 patterns / 8 slots; all other classes still closed.

- **Scope discipline:** spec + plan + handoff markdown only. Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/cross-cutting/*`. The schema-test extension lives in the plan markdown's prescribed test body (Task 0.B.2 Step 1) — not in a tracked test file under `tests/`.

### Amendment R60 — 2026-05-26

- **Diff base:** `b4b2c38`
- **Diff target:** `4af844d` (post-R59)
- **Verdict:** **needs-attention** (2 HIGH; both anti-tautology on test specs)
- **Findings:**

  | # | Severity | Section | Disposition |
  |---|---|---|---|
  | F51 | HIGH | `02-phase0-validation-state.md:369-400` (R17 F15 PostgREST DML lockdown test, plan-spec'd for Phase 0.B Step 8 runtime authoring) | **Anti-tautology gap.** Test uses generic authenticated JWT + accepts ANY 42501/error as success. Without REVOKE block, `admin_only` RLS policy already denies non-admin INSERT/UPDATE/DELETE → test passes irrespective of whether REVOKE actually landed. **Admin-authenticated bypass path uncovered** — admin with table grants could go around the RPC/advisory-lock topology and test wouldn't catch. Repair: assert table-level privileges DIRECTLY via `pg_catalog.has_table_privilege` for `anon`/`authenticated` (3 verbs: INSERT, UPDATE, DELETE — verify false); add admin-authenticated probe that fails SPECIFICALLY because privileges are revoked (not because RLS denies non-admin). |
  | F52 | HIGH | `02-phase0-validation-state.md:157-160` (R59 commit 96 schema test) | **Anti-tautology gap.** Test simulates pre-R57 NOT NULL stack → runs hard-coded ALTER inside test → asserts is_nullable="YES". Hardcoded ALTER independently performs the repair, so a future migration regression (deleting ALTER from validation_state DDL) STILL passes. Repair: run actual migration artifact against test database (e.g., apply `02-phase0-validation-state.md` DDL or generated migration SQL file), then assert is_nullable="YES". |

- **Same-vector status post-R60:**
  - F51 + F52 share class shape "structural defense test tautology" (2 instances in same round). Per-instance fix at R61; if R62 surfaces another anti-tautology gap on a different structural defense test, the class enters threshold-3 territory.
  - F50 closed at R59 per-instance (drift-repair landed); but F52 surfaces the test-for-drift-repair was tautological.
  - F48-class still at 2 rounds; trigger remains armed.
  - All other classes still closed.

- **Repair commits:** R61 implementer dispatch (inline Agent; F51 + F52 anti-tautology test-spec tightening) — `e796580` (F51 3-layer defense) + `d42c5d8` (F52 migration-artifact apply).

### Amendment R61 — 2026-05-26 (repair)

- **Diff base:** `d0b892b`
- **Diff target:** pending R62 cross-CLI adversarial review
- **Verdict:** **R60 findings closed; pending R62 fresh adversarial review**
- **Repair commits:**

  | # | SHA | Title |
  |---|---|---|
  | 97 | `e796580` | `docs(plan-m12): R61 F51 — PostgREST DML lockdown test 3-layer defense` |
  | 98 | `d42c5d8` | `docs(plan-m12): R61 F52 — drift-repair test applies actual migration artifact` |

- **F51 verification quote** (3-layer defense at `02-phase0-validation-state.md:380-477`):
  - Layer 1 (`pg_catalog.has_table_privilege` via psql): "For each role in {anon, authenticated}, for each verb in {INSERT, UPDATE, DELETE}, `has_table_privilege(role, 'public.<table>', verb) = false`. Proves REVOKE landed REGARDLESS of RLS policy state." Catches: future amendment drops the REVOKE block but leaves `admin_only` RLS in place; pre-R61 Layer 3 would falsely pass on this stack via RLS denial.
  - Layer 2 (admin-authenticated PostgREST probe): "A client whose JWT email matches `is_admin()=true` issues INSERT/UPDATE/DELETE. Without the REVOKE block this admin would PASS the admin_only RLS USING/WITH CHECK predicate and the DML would succeed. With the REVOKE block in place the admin client receives `42501 permission denied for table` at the table-grant check, BEFORE RLS evaluates." Catches: admin-bypass surface that anon/authenticated probes structurally cannot.
  - Layer 3 (anon + authenticated probes, tightened): "Require `permission denied for table` substring. Excludes RLS-policy violation messages (`new row violates row-level security policy` / generic `permission denied` without `for table`)." Catches: defense-in-depth at the path-end + future grant-by-role-attribute mechanism that bypasses table-grant catalog.
  - New env var requirement: `SUPABASE_TEST_ADMIN_JWT` (Phase 0.B test bootstrap registers as required; fail-loud if unset, not skip).

- **F52 verification quote** (migration-artifact apply at `02-phase0-validation-state.md:154-188`):
  - "R61 F52 amendment — tautology audit. The pre-R61 test ran a hardcoded `ALTER TABLE ... DROP NOT NULL` inline INSIDE the test body, which independently performed the drift-repair regardless of what the migration artifact said. R61 closes the gap by routing the drift-repair through the canonical migration file — the test FAILs if the ALTER is deleted from the migration."
  - Test body: locates migration via `readdirSync(migrationsDir).filter((f) => /_validation_state\.sql$/.test(f))` — fails loud on zero/multiple matches; regex sanity-check on migration body (`/ALTER\s+TABLE\s+public\.validation_state\s+ALTER\s+COLUMN\s+last_seed_date\s+DROP\s+NOT\s+NULL/i`); applies full migration via new `runPsqlFile` helper (`execFileSync("psql", [..., "-v", "ON_ERROR_STOP=1", "-f", filePath])`); asserts `is_nullable="YES"` post-apply; re-applies migration file for apply-twice idempotency at the migration-artifact grain.
  - Concrete failure mode the test now catches: "a future amendment deletes the `ALTER COLUMN last_seed_date DROP NOT NULL` from the migration. The regex sanity-check AND the is_nullable assertion both FAIL — regression is pinned at the migration-artifact grain, not at the test-body grain."

- **(C) Class-sweep results — "structural defense test tautology" peer audit:**

  | Test spec | Verdict | Reasoning |
  |---|---|---|
  | R49 c89 `tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts` | TIGHT | `readdirSync` + `readFileSync` walker over `docs/superpowers/specs/` + `docs/superpowers/plans/` + `AGENTS.md` (verified at file:65-68). Regex matches FORBIDDEN_PATTERNS against live doc content; not tautological — production prose drift triggers RED. |
  | R51 c92 structural defense extension (F46 false-semantics class) | TIGHT | Extends c89 walker with strip-plus / false-semantics regex patterns; same live-walker mechanism; live prose drift triggers RED. |
  | R53 c93 finalizer-TOCTOU CAS regression test at Task 0.C.4 Step 8.5 | TIGHT | TEST-ONLY wrapper `validation_finalize_all_atomic_test_with_sleep` injects `pg_sleep(2)` BETWEEN the SELECT and UPDATE in PL/pgSQL; concurrent client B mutates singleton during the sleep; asserts client A raises `CONCURRENT_MODIFICATION_RACE` matching the R53 commit 93 exception text. Deterministic DB-side interleaving; not application-layer mocked. |
  | R55 c94 predicate (b') regression at Task 0.C.5 Step 1 | TIGHT | Exercises both halves: `--combo R1` PASSes with stale `last_seed_date` (predicate b' reads `combos_seeded_dates['R1']`); `--combo all` FAILs with predicate (b) diagnostic on the same stale-stack. Failure mode named: future amendment collapses dispatch logic → falls back to predicate (b) for any requested set → test fails on `--combo R1` PASS arm. |
  | R57 c95 F49 mint-RPC initial-INSERT bypass regression | TIGHT | Wipes singleton (`DELETE FROM validation_state`); runs `validation:reseed --combo R1`; asserts `last_seed_date IS NULL` (mint RPC's initial INSERT must omit `last_seed_date`); positive control via `--combo all` path proves finalizer DOES stamp. Concrete failure-mode statement: future amendment re-introduces `last_seed_date` into mint RPC's INITIAL INSERT column-list. |
  | Task 0.C.8 `validation-tooling-tz-pin.test.ts` (deferred) | TIGHT (spec) | Walker pattern mirrors `tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts` (R8 structural defense): `readdirSync` scan roots, `readFileSync` each, regex for `current_date`, check against acceptable-context regexes. Reports `file:line:context` for violations. Live source walk; not tautological. |
  | Task 0.C.9 `email-canonicalization.test.ts` extension (deferred) | TIGHT (spec) | Extends `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` to walk `scripts/validation-*.ts`. Live-walker pattern same as existing audit surface. Bad-fixture (`raw email .toLowerCase().trim() without canonicalize import`) confirms RED phase. |

  **Conclusion:** 5 existing test specs + 2 deferred test specs audited; **0 peers exhibit anti-tautology**. F51 + F52 are the only two anti-tautology instances in M12; per-instance fix lands at R61 commits 97 + 98. Class remains at 2 instances; structural defense (doc-guard asserting every structural defense test spec includes a "this test FAILS if <named regression>" failure-mode statement) does NOT fire under R61 (threshold-3 ladder rung 2 not reached).

- **Same-vector status post-R61:**
  - F51 + F52 closed per-instance. Anti-tautology class at 2 instances post-R61; threshold-3 ladder rung 2 (structural defense) not triggered.
  - F50 closed at R59 + R61 (F52 test-spec strengthened to apply migration artifact, completing the F50 contract pinning).
  - F48-class still at 2 rounds; trigger remains armed.
  - All other classes still closed.

- **Out-of-scope flags:** Zero changes to `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `tests/cross-cutting/*`. Per-instance test-spec edits live in the plan markdown (`02-phase0-validation-state.md`) at the test-body grain prescribed for Phase 0.B runtime authoring.

- **Meta-test regression count:** 0 (no live `tests/cross-cutting/*` files modified; existing meta-tests structurally unchanged).

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
