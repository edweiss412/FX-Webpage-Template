# M12 amendment session — dispatch brief

**Authored:** 2026-05-26 by `orchestrator-m12` Opus 4.7 session at HEAD `b4b2c38`.
**Target session:** fresh Opus 4.7 / Claude Code implementer session.
**Branch:** `main` (M12 amendment lands directly on main per the project's commit-per-task discipline; no feature branch for amendment work — same posture as M11.5 §A/§C catalog/migration edits).
**Read order:** §0 (role) → §1 (read-first) → §2 (do-not-relitigate) → §3 (scope) → §4 (decisions baked in) → §5 (discipline) → §6 (output + handback).

---

## §0 — Your role

You are the **M12 amendment implementer.** You are NOT the orchestrator (`orchestrator-m12` Opus session is that), NOT a reviewer, NOT a Phase 0 / Phase 1 implementer. Your scope is:

1. Amend `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md` to rebase onto M11.5's ratified picker pivot.
2. Amend the plan tree at `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/` (8 markdown files: `00-overview.md` + `01..08-*.md`) to align with the amended spec.
3. Self-review both artifacts against AGENTS.md spec-self-review + writing-plans additions.
4. Signal ready for cross-CLI Codex adversarial review (do NOT fire it yourself — the user does).

You do NOT write production code. You do NOT touch `app/`, `components/`, `lib/`, `scripts/`, `tests/`, `supabase/`. Spec + plan markdown only.

You do NOT relitigate any contract in §2 below. If something in §2 looks wrong, raise it to the user — do NOT silently override.

---

## §1 — Read-first (in order, before any edit)

1. **`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md`** — the authoritative rebase source. 6 sections: changed contracts / retired routes / new admin surfaces / new env vars / new structural meta-tests / inherited do-not-relitigate. Every M12 stale reference traces to a §1–§2 entry here.
2. **`docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/handoffs/M12-orchestrator.md`** — orchestrator-level decisions on scope, J3 shape, carry-over triage. §1.2 records the user's `(d)` decision for J3.
3. **`docs/superpowers/specs/2026-05-23-crew-auth-pivot-show-link-picker.md`** — the M11.5 picker spec. Authoritative for picker semantics, `__Host-fxav_picker` envelope, 11-arm `resolveShowPageAccess` union, two-reasons `identity_invalidated`, `validateNextParam` allowlist.
4. **`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`** §7 (auth) + §13 (reports) — master spec post-pivot. The crew page is now `app/show/[slug]/[shareToken]/page.tsx`; slug-only is rejected.
5. **Current M12 artifacts (target of your edits):**
   - `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/00-overview.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/03-phase0-tooling-reseed.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/04-phase0-tooling-link.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/05-phase0-tooling-report.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/06-phase0-smokes.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/07-phase1-matrix-walk.md`
   - `docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/08-iteration-and-final-sweep.md`
6. **`AGENTS.md`** — invariants 1–9 + spec-self-review additions + writing-plans additions. Notably invariant 7 (spec is canonical) and the **live-code citation pass** (mandatory pre-draft, budget 30–60 min).
7. **`docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/DEFERRED.md`** entries `M11.5-IMP-1`, `M11.5-IMP-2`, `M11.5-IMP-4` — the carry-overs to fold into amendment scope.

---

## §2 — EXPLICITLY DO NOT RELITIGATE

These contracts are ratified. Re-flagging any wastes amendment rounds. Cite `M11.5-delta-for-m12.md` §6 to any reviewer who tries.

### M11.5 close-out inheritance (don't re-derive)

1. **Picker model itself** (one share-token + identity picker + optional OAuth claim) — PRODUCT.md 2026-05-23 ratification. Not a design question.
2. **11-arm `resolveShowPageAccess` discriminated union**, including `no_auth.reason: 'first_contact' | 'google_mismatch'` and `identity_invalidated.reason: 'claimed_after_pick' | 'session_mismatch'`.
3. **`__Host-fxav_picker` cookie envelope** — HMAC-signed, `MAX_SAFE_T_MILLIS = Number.MAX_SAFE_INTEGER`, UUID selection-keys, LRU eviction.
4. **`validateNextParam.ts` allowlist** `^/(show/[a-z0-9-]+/[0-9a-f]{64}|admin(/.*)?|me(/.*)?)$/` — slug-only `/show/<slug>` REJECTED.
5. **M9.5 signed-link surfaces are RETIRED** — `crew_member_auth` table dropped, `lib/auth/jwt.ts` deleted, `app/show/[slug]/p/page.tsx` deleted, 18 `LINK_*` / `CSRF_*` / `ADMIN_LINK_*` catalog codes deleted. Do NOT propose preserving them "for validation tooling compat."
6. **H1–H8 structural meta-tests + R1/R4/R5/R6 extensions LANDED** — extensions only, no churn.
7. **Locked deployment path** — M11.5 → M12 → M13. No detours.
8. **`__Host-fxav_picker` cookie.t source** — ALWAYS RPC return `out_observed_at_millis`, NEVER `Date.now()`.
9. **Step 4(e) `GOOGLE_NO_CREW_MATCH` is TERMINAL** `no_auth/google_mismatch` — does NOT fall through to step 5.
10. **`resetPickerEpoch` uses `requireAdminIdentity()`** (NOT `requireAdmin()`) — needs admin email for `admin_email_hash` context.
11. **6 R41 admin_alert producers** per P-R26 email-posture matrix — 3 email-bearing + 3 email-less.

### Pre-rebase M12 spec contracts (still valid post-rebase)

These survived the pivot. Don't re-derive them either.

12. **Exercise output is only `SIGN-OFF.md` paragraph; no per-cell tracking** (M12 spec §8.1 + §11.3.1).
13. **4 journeys are deliberate; additional journeys are sub-paths or matrix-covered** (M12 spec §5.6).
14. **Solo-dev only; Doug/real-crew NOT in this milestone** (M12 spec §1.5).
15. **Prod-equivalent without custom domain — production-target Vercel + `*.vercel.app` URL** (M12 spec §2 + §9.1).
16. **LEAD unlocks ALL THREE scope tiles unconditionally** (M12 spec §3.4.1).
17. **`dateRestriction` affects Right Now + Schedule only — NOT scope tiles and NOT pack-list** (M12 spec §3.3 R3 row + §3.4.1).
18. **Pack-list visibility gated by `stage_restriction` + day-phase** (M12 spec §3.3.1 + §3.4.1).
19. **`validation_state` is M12's own admin-only deliverable**, unaffected by the picker pivot — table DDL, RLS, master-spec §4.3 admin-only count update (21→22), §4.1 CREATE TABLE block, AC-2.5 line update (21→22 / 84→88) all stand.
20. **MATRIX-INVENTORY.md is plan-time, not exercise-time** (M12 spec §4.1.1 + §11.3.1).
21. **Default-up triage** (M12 spec §7.1) — borderline classifies UP (MUST > SHOULD > NICE).
22. **Final-sweep zero-MUST gate** (M12 spec §7.2 step 7) — sign-off requires CLEAN final sweep.
23. **Spec went through 25 rounds without formal APPROVE per user R0 authorization** (M12 spec §15.25). Don't insist on a 26th round of the pre-pivot spec; the amendment IS the resolution.

---

## §3 — Scope (file-by-file edit list)

### §3.A — Spec amendment

**File:** `docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md`

**Header amendment** (top of file, after the existing title block):

> Add a new ratified-amendment block declaring the M11.5-pivot rebase, citing `M11.5-delta-for-m12.md` as the authoritative diff source. Pattern: mirror how the master spec ratifies its amendments (e.g., the picker pivot's own ratification block in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`).

**§4.2 surface bands table** — rewrite band B and band C rows:
- Band B: replace `/show/[slug]/p` (signed-link fragment path) with `/show/[slug]/[shareToken]/` (tokenized share-link path). Replace "Google-sign-in path" reference at `/show/[slug]` with the M11.5 `validateNextParam` rejection (slug-only is no longer a valid surface). `/me` reference stays — `validateGoogleIdentity` still owns it.
- Band C: replace "Signed-link redemption (fragment-token canonical path) / Expired-link surface / Revoked-link surface" with the picker-equivalent rows: share-link landing → picker render arms (5 picker-rendering states per `resolveShowPageAccess` 11-arm union), `identity_invalidated/claimed_after_pick` surface, `identity_invalidated/session_mismatch` surface, `no_auth/google_mismatch` surface (terminal, NOT fall-through), share-token rotation → show-unavailable surface (per M11.5 R2 close-out, `showUnavailable()` envelope emits `PICKER_SHOW_UNAVAILABLE`), picker-epoch reset → identity_invalidated cascade. Remove "Query-token compromise path" row entirely; replace with a "validateNextParam slug-only rejection" row citing the M11.5 H2 allowlist.

**§5.3 J3 — full rewrite.** New title: **"J3 — Share-link + picker crew end-to-end (real device leg)."**

User decision (Q3 = **option d**): J3 is comprehensive, covering THREE picker-pivot legs:

| Leg | Trigger | Expected outcome | Cite |
|---|---|---|---|
| (a) Share-token rotation | Admin clicks `RotateShareTokenButton`; iPhone reloads old URL | Show-unavailable per M11.5 R2 (`PICKER_SHOW_UNAVAILABLE`); admin distributes new URL; iPhone re-picks identity successfully | M11.5 delta §3 + master spec §7 |
| (b) Picker-epoch reset | Admin clicks `ResetPickerEpochButton`; iPhone reloads same URL | `__Host-fxav_picker` cookie invalidated; resolves to `identity_invalidated/session_mismatch`; iPhone re-picks | M11.5 delta §3 + picker spec §6 (`reset_picker_epoch_atomic`) |
| (c) OAuth-claim path | iPhone picks identity, then Google-signs-in; `claim_oauth_identity` claims the identity; ANOTHER device with a stale picker cookie reloads | First device: `OAUTH_IDENTITY_CLAIMED` confirmation; other device: `identity_invalidated/claimed_after_pick`; covers H8 doc-guard 2-reasons contract | M11.5 delta §6 item 12 + picker spec H8 |

Drop the "Signing-key contract for validation tooling" table entirely. Drop the "Query-token compromise leg" paragraph entirely (validateNextParam routing-time rejection covers it as a band-C row, not a journey leg). Drop the "Expired-link fixture contract" table entirely (share-tokens have no per-URL expiry).

**§3.3 owned-fixture-mappings** — rewrite the R21/R22 paragraphs:
- Remove `crew_member_auth` UPSERT from seed contract. Add picker-equivalent: ensure `shows.share_token` is set (auto-populated by show creation in v1 per master spec §7); ensure `auth_email_canonical` rows exist for the fixture crew rows so picker eligibility resolves; for the J3-(c) OAuth-claim leg, optionally pre-seed `oauth_identity_claims` rows for fixtures that simulate already-claimed identities (verify the actual v1 table name + shape via the live-code citation pass before drafting).
- Remove `revoked_links WHERE revoked_reason LIKE 'validation:%'` cleanup contract. Replace with picker-epoch-reset cleanup (the J3-(b) walk leaves the test fixture's `__Host-fxav_picker` cookies invalidated; re-seed must either bump picker_epoch via RPC OR delete the test browser's cookies — your choice based on what's mechanically simplest for the dev walk).
- Drop `alias_5a_lead_for_revoke` and `alias_5a_lead_for_query_compromise` from the alias list. Add picker-equivalent aliases ONLY IF the J3 legs above need fixture isolation (likely YES for (c) OAuth-claim — the "claimed identity" alias must NOT poison other crew aliases on the same show; suggested names: `alias_5a_lead_for_oauth_claim`, `alias_5a_lead_for_epoch_reset` if needed).

**§3.3.2 `validation_state` table + RLS** — verify unchanged. The migration + master-spec §4.3 amendment + admin-only count update (21→22) all stand. Re-verify the master-spec line numbers haven't drifted since 2026-05-19 (the post-M11.5 master spec may have shifted line numbers; cite the **current** line numbers).

**§5.3 signing-key contract for validation tooling** — DELETE entirely. No JWT signing in v1.

**§9.1.2 validation-tooling reference** — rewrite to match the new Phase 0.D scope (see §3.B below). Most likely outcome: mint-link/revoke-link rows DELETED, replaced with `validation:print-share-url` (read `shows.share_token` + emit canonical URL for iPhone testing) OR DELETED ENTIRELY if J3 walks the admin UI for everything (the M11.5 §F `RotateShareTokenButton` / `ResetPickerEpochButton` / `CurrentShareLinkPanel` are the canonical interface; CLI parity may be unnecessary). Your call — propose to the user via the user's next turn if you want to delete Phase 0.D entirely vs collapse to a 1-script phase.

**Add new §15.26 amendment audit-trail entry** at the bottom (mirror §15.1–§15.25 format): cite this dispatch brief, the M11.5-delta source, the orchestrator handoff doc, and the user's `(d)` decision on J3.

### §3.B — Plan tree amendment

**`00-overview.md`** — update:
- "File structure" block: drop `scripts/validation-mint-link.ts`, `scripts/validation-revoke-link.ts`, `tests/scripts/validation-mint-link.test.ts`, `tests/scripts/validation-signing-env.test.ts`. Add picker-tooling equivalents per the decision you propose for §3.A's §9.1.2 amendment.
- "Disagreement-loop preempt" table: drop signed-link rows (rows about two-token architecture, `crew_member_auth` UPSERT, `alias_5a_lead_for_revoke`, three-env-var mapping, signing key). Add picker-pivot rows per §2 above items 1–11.
- "Plan-wide invariants" section: invariant 7 "Three-env-var mapping for signing" → DELETE. Replace with a new invariant covering the picker tooling's env-var posture (likely `HASH_FOR_LOG_PEPPER` + `PICKER_COOKIE_SIGNING_KEY` — see M11.5 delta §4) if Phase 0.D still ships any CLI.
- "Meta-test inventory" table: verify the email-canonicalization extension row is still warranted post-rebase (it was added for `scripts/validation-reseed.ts` touching emails; reseed still touches emails for the picker fixtures, so likely yes — verify by reading current reseed.ts intent). The `validation-tooling-tz-pin.test.ts` row stands (TZ-pin discipline is not auth-coupled).
- "Phase summaries" estimate column: if Phase 0.D collapses or deletes, update the estimate.

**`01-phase0-infra.md`** — replace `VALIDATION_JWT_SIGNING_SECRET` env-var setup. M11.5 introduces `HASH_FOR_LOG_PEPPER` (already in `.env.local.example`) and `PICKER_COOKIE_SIGNING_KEY` (64 hex chars). Validation tooling needs whatever subset of these its remaining scripts (if any) call. Update `.env.local.example` documentation row accordingly. Keep `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + `VALIDATION_SUPABASE_PROJECT_REF` — those are auth-agnostic.

**`02-phase0-validation-state.md`** — verify master-spec line citations haven't drifted; otherwise minimal changes. The `validation_state` table itself + RLS + admin-tables generator regen + 4 test baseline updates (rls.test.ts, admin-rls-runtime.test.ts × 7, baseline.json, auth.test.ts) all stand. Re-grep the current master spec for the actual line numbers; the `21→22` admin-only count is the load-bearing assertion regardless of where it lives line-number-wise.

**`03-phase0-tooling-reseed.md`** — drop `crew_member_auth` UPSERT from seed contract. Add picker-fixture setup per §3.A's §3.3 rewrite. Drop `revoked_links` cleanup; add picker-epoch-reset cleanup (or browser-cookie-clear procedural step for the dev walk). Drop `alias_5a_lead_for_revoke` / `alias_5a_lead_for_query_compromise` from alias inventory; add J3-(c)-isolation aliases per §3.A.

**`04-phase0-tooling-link.md`** — **largest rewrite. Probably retitle "Phase 0.D — picker-walk tooling" OR delete entirely.** Your call to propose to the user. Two options:
- **Option α — collapse to `validation:print-share-url`.** One CLI script: reads `shows.share_token` for a given combo via service-role client, emits the canonical `/show/<slug>/<shareToken>/` URL for iPhone copy-paste. Useful because the admin UI's `CurrentShareLinkPanel` requires admin auth + browser-side click — CLI is faster for the dev's iPhone-testing loop. ~half-day estimate.
- **Option β — delete Phase 0.D entirely.** J3's three legs all walk the admin UI for the destructive actions (Rotate / Reset) and the admin UI already exposes the share URL via `CurrentShareLinkPanel`. The dev's iPhone testing loop uses admin UI + clipboard. ~zero scope.
Propose α or β in your output to user; default to **α** unless mechanically dispreferred (it's cheap insurance + matches the spirit of "validation tooling is admin-UI parity for CLI-driven workflows"). If α, define the script's contract (positional arg = combo OR show_slug; stdout = JSON `{url, share_token, show_id, expires_at: null}`; localhost guard + target-consistency stamp per existing invariant 6).

**`05-phase0-tooling-report.md`** — verify minimal hits (the 1 found earlier is likely a J3 cross-reference). The M8 report harness is auth-agnostic; this file should need only cleanup, not rewrite.

**`06-phase0-smokes.md`** — smoke 6 (mint-link round-trip via iPhone) rewrite as "share-link + picker round-trip via iPhone." Smoke shape: dev reads `shows.share_token` (via admin UI or `validation:print-share-url`) → opens `/show/<slug>/<shareToken>/` on iPhone → picks identity → verifies crew page renders. Plus a sub-smoke: dev clicks `RotateShareTokenButton` → iPhone reloads → verifies show-unavailable surface (this exercises the new R2 close-out path). Other smokes likely auth-agnostic; verify.

**`07-phase1-matrix-walk.md`** — Task 1.6 J3 full rewrite per §3.A's §5.3 (three legs: rotate / epoch-reset / OAuth-claim). Task 1.0 step 8 band/persona/sub-check mapping must align with §3.A's amended §4.2 (tokenized URLs, picker arms, etc.). Tasks 1.4 (J1), 1.5 (J2), 1.7 (J4), 1.8 (cold-start) likely unaffected; verify by re-reading each.

**`08-iteration-and-final-sweep.md`** — single hit, probably J3 cross-reference; minor cleanup.

### §3.C — Carry-overs to fold into amendment scope

Add these three deferred items as **new amendment-scope tasks** in the plan tree (NOT execution-scope):

1. **`M11.5-IMP-1` — SignInOrSkipGate reassurance footer copy + catalog code.** Catalog code add (suggested name `SIGN_IN_OR_SKIP_FOOTER_REASSURANCE`) is mechanical. Add a Phase 0.A.1 (or new Phase 0.A.bis) task in `01-phase0-infra.md` covering: catalog code add → `spec-codes.ts` regen → SignInOrSkipGate component wires footer. Mark DEFERRED.md entry as "Resolved at M12 amendment SHA <pending>."
2. **`M11.5-IMP-2` — picker-show-strip with show metadata.** Requires `resolveShowPageAccess` return-shape extension (adds `showTitle` + `showDates` to picker-rendering arms) OR a separate metadata fetch in the route page. Per M11.5 §B close-out trigger ("M12 amendment session adds show metadata to picker render scope"). Add a Phase 0.A.2 task: extend resolver shape → component renders strip with `data-testid="picker-show-strip"` per picker spec §7.1 item 2. Impeccable v3 critique + audit pair applies (external attestation per `feedback_impeccable_external_attestation_required`).
3. **`M11.5-IMP-4` — DESIGN.md §1.2 contrast amendments for picker color pairs.** Add two rows to DESIGN.md §1.2 "Contrast summary" table: `text-text on bg-stale-tint` (picker banner row) and `text-text-subtle on bg-surface-sunken` (claimed-row treatment). Mechanical computation. Add a Phase 0.A.3 task; impeccable v3 applies.

### §3.D — Carry-overs to DEFER to execution scope

Do NOT add to amendment plan; let Phase 1 walks surface them naturally:
- **`M11.5-IMP-3`** /me TerminalFailure dedup (trigger: "M12 touches `app/me/page.tsx` for any reason").
- **`M11.5-IMP-5`** Admin Reset/Rotate polish (5 sub-items; trigger: "M12 admin-surface validation pass").
- **`M11.5-PLAYWRIGHT-HELPERS`** 4 picker-shaped .skip scenarios — add a one-line note in `07-phase1-matrix-walk.md` Task 1.2 step 1 (Band A walk) that the 4 .skip suites should be un-skipped + ported as the Band A walk hits them. NOT a separate task; ambient context.

### §3.E — Carry-over to defer to close-out

- **Test-migration coda** (~36h jsdom port, 12 suites). DO NOT add to amendment. Orchestrator surfaces decision at M12 close-out (fold-into-close-out vs separate milestone).

### §3.F — Untouched

- BACKLOG.md 4 Doug-feedback-gated UX entries — do not promote.

---

## §4 — Decisions baked in (user-confirmed; do not relitigate)

1. **Q3 J3 shape = (d) comprehensive.** Three legs per §3.A's §5.3 table.
2. **Spec + plan both amended in this session, sequential.** Spec first, then plan tree.
3. **Amendment lands on `main` directly.** Per project commit-per-task discipline; no feature branch.
4. **Amendment is its own adversarial-review round-trip.** APPROVE OR 40 rounds → Phase 0 execution kickoff.
5. **Round audit trail resumes at `round-06.md`.** Pre-rebase `round-01..05.md` archived as obsolete; do NOT edit.

---

## §5 — Discipline (mandatory)

### §5.1 — Pre-draft live-code citation pass (mandatory; budget 30–60 min)

**Before writing any spec/plan text that names a file, function, field, column, RPC, env var, JWT claim, DOM role, component prop, or test fixture — grep the live codebase and verify it exists with the claimed shape.** This is the #1 source of adversarial-review rounds; the M12 spec's 25 rounds were dominated by live-code-fidelity findings.

Specifically verify before drafting:
- `lib/auth/picker/*.ts` — exact exported signatures + return-union shapes (the M11.5 delta lists them; cross-check against current files).
- `app/admin/show/[slug]/{ResetPickerEpochButton,RotateShareTokenButton,CurrentShareLinkPanel,ShareLinkCopyButton}.tsx` — exact component APIs + props.
- `app/show/[slug]/[shareToken]/page.tsx` — route file exists, named `[shareToken]`.
- `supabase/migrations/` — RPC names `reset_picker_epoch_atomic`, `rotate_show_share_token`, `admin_read_share_token`, `claim_oauth_identity` exist with claimed signatures.
- `shows.share_token` column exists (post-pivot DDL).
- Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` — §4.3 admin-only table count + §4.1 schema-section + AC-2.5 current line numbers (the M12 plan cites specific lines; those may have drifted post-pivot).
- Catalog `lib/messages/catalog.ts` — confirm the 18 removed M9.5 codes are gone AND the 6 added picker codes are present (delta §1 lists all of them).
- `lib/auth/validateNextParam.ts:16` — confirm allowlist regex exactly matches `^/(show/[a-z0-9-]+/[0-9a-f]{64}|admin(/.*)?|me(/.*)?)$/`.

Every spec/plan claim about live code MUST cite `file:line`. Stale citations are the #1 round-1 finding class.

### §5.2 — Numeric sweep

After drafting, grep amended spec + plan for every literal number (admin-only table count, surface-band count, journey count, arm-count in `resolveShowPageAccess`, smoke count, validation-CLI count, etc.) and verify each against the body it describes. M12's spec already burned multiple rounds on stale counts; the rebase will introduce new ones.

### §5.3 — Self-consistency sweep

Grep amended spec + plan for "out of scope" claims, default values, and recurring constants. Same value contradicted across Resolved Decisions / body / test section is the most common round-2 finding.

### §5.4 — Class-sweep zero-out of M9.5 vocabulary

Run this command **after** drafting is complete:

```bash
rg -c -i 'link_session|signed.link|crew_member_auth|validateLinkSession|signLinkJwt|JWT_SIGNING_SECRET|bootstrapCookie|/p#t=|fragment.token|revoked_links|LINK_EXPIRED|LINK_VERSION_MISMATCH|alias_5a_lead_for_revoke|alias_5a_lead_for_query_compromise|crewMemberKey|active_signing_key_id|jwt_token_version' \
  docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md \
  docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/*.md
```

Baseline at amendment kickoff: 172 hits across 12 files (50 in spec, balance in plan tree). Acceptable residual: only historical citations in `§15` (spec audit trail) AND the `handoffs/M12-orchestrator.md` + this file (`handoffs/M12-amendment-dispatch-brief.md`) referencing the retired vocabulary by name as part of the amendment narrative. Everywhere else must be ZERO. Any other residual hit must be explicitly justified in your handback to user.

### §5.5 — Commit-per-task discipline

Per AGENTS.md invariant 6. Suggested commit cadence (8–12 commits total):
- `docs(spec-m12): amendment header + rebase declaration` — spec header + §15.26 entry, no body edits yet (establishes the rebase intent at commit-graph level).
- `docs(spec-m12): rewrite §4.2 surface bands B+C for picker pivot`
- `docs(spec-m12): rewrite §5.3 J3 — three-leg picker walk (rotate / epoch-reset / OAuth-claim)`
- `docs(spec-m12): rebase §3.3 seed contract — drop crew_member_auth, add picker fixtures`
- `docs(spec-m12): delete §5.3 signing-key contract; rewrite §9.1.2 validation-tooling reference`
- `docs(plan-m12): rebase 00-overview + 01-infra for picker pivot`
- `docs(plan-m12): rebase 03-reseed seed contract for picker fixtures`
- `docs(plan-m12): {collapse|delete} 04-tooling-link per Phase 0.D decision`
- `docs(plan-m12): rebase 06-smokes + 07-matrix-walk J3 for three-leg picker walk`
- `docs(plan-m12): fold M11.5-IMP-1 + IMP-2 + IMP-4 into amendment scope`
- `docs(plan-m12): cleanup 02/05/08 + numeric sweep + class-sweep verification`
- `docs(handoff-m12): mark DEFERRED.md M11.5-IMP-1/2/4 resolved at amendment SHA`

Conventional-commits scope `spec-m12` and `plan-m12` are new; precedent for `master-spec` / `validation` / `signoff` scopes is in `00-overview.md` §"How to use this plan" item 4. Verify the convention is acceptable by grepping recent commits; if drift would result, use `m12` bare or `docs(plan):` instead.

### §5.6 — Same-vector recurrence policy

Per AGENTS.md: if 3 consecutive adversarial-review rounds on the amended spec/plan find on the same vector (live-code fidelity, numeric counts, picker semantics), the next round's preparation MUST include a comprehensive re-analysis of that vector before the next review fires. M11.5 spec ran 81 rounds; M12 amendment should be far cheaper since the picker pivot is now ratified, but expect 2–4 rounds minimum.

---

## §6 — Output + handback

### §6.1 — Required outputs

1. Amended spec (1 file) + amended plan tree (8 files).
2. M11.5-IMP-1/2/4 DEFERRED.md entries updated with "Resolved at M12 amendment SHA <hash>" + amendment-commit cite.
3. New `handoffs/round-06.md` opened as a stub per `HANDOFF-TEMPLATE.md` (round NOT fired yet — that's the user's job; you set the file up).
4. Self-review summary at the END of the session, posted to user as a single message: list of files touched, commit SHAs, class-sweep grep output (the §5.4 command's residual hits — should be near-zero outside §15 audit trails), any open questions for orchestrator triage.

### §6.2 — Handback

When your self-review is clean (M9.5 class-sweep zero outside `§15` + `handoffs/M12-*.md`, numeric sweep clean, live-code citations verified, all 12 commits landed):

- Post a single message to user titled "M12 amendment self-review complete; ready for cross-CLI R6."
- Include: file list, commit SHAs, class-sweep residual count, any deferrals you made (e.g., if you chose option β to delete Phase 0.D), any open questions.
- The user will then fire `/codex:adversarial-review` against the amended spec + plan tree. Round audit trail resumes in `round-06.md`.

### §6.3 — Do-not actions

- Do NOT fire `/codex:adversarial-review` yourself (paid cross-CLI; user dispatches).
- Do NOT touch `app/`, `components/`, `lib/`, `scripts/`, `tests/`, `supabase/`.
- Do NOT edit `round-01..05.md` (archived as obsolete).
- Do NOT promote BACKLOG.md Doug-feedback-gated entries.
- Do NOT propose detours from the locked deployment path (no M13 Phase 0, no skipping J3 legs, no parallel Phase 0).
- Do NOT relitigate any §2 contract.

---

## §7 — One-paste-ready kickoff for the implementer session

Paste this as the very first user message in the fresh Opus session:

```
You are the M12 amendment implementer. Your scope, role, and discipline are
all defined in
docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/handoffs/M12-amendment-dispatch-brief.md.

Read that file first, then read in order:
1. docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md
2. docs/superpowers/plans/2026-05-19-solo-dev-ux-validation/handoffs/M12-orchestrator.md
3. docs/superpowers/specs/2026-05-23-crew-auth-pivot-show-link-picker.md
4. docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md (§7 + §13 only)
5. The 9 M12 artifact files listed in dispatch-brief §1 item 5.
6. AGENTS.md.

Begin with the live-code citation pass (dispatch-brief §5.1) BEFORE drafting
any spec/plan text. Budget 30-60 min for that pass.

Confirm your understanding by posting back the live-code citation pass
results + a brief plan-of-attack BEFORE making the first edit. Wait for
user ack before editing.

J3 shape is decided: option (d) comprehensive, three legs (rotate +
epoch-reset + OAuth-claim). Do not relitigate.
```
