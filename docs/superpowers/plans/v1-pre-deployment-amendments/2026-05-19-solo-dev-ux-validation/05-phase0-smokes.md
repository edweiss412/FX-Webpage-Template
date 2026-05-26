# Phase 0.F — Phase 0 smoke tests (1–7) gating Phase 1 start

> Per spec §9.2 closure + §9.0 task 0.F. Estimate: 0.5–1 day.
>
> Goal: run the conditional smoke set. Smokes 1–6 always required; smoke 7 required when Band F deep outcomes default to INCLUDED-via-harness (skipped only when MATRIX-INVENTORY.md pre-dispositions every deep outcome as EXCLUDED-rely-on-structural).
>
> Phase 0 does NOT close until ALL required smokes pass. Failing any required smoke re-opens Phase 0.

---

### Task 0.F.1: Smoke 1 — Admin sign-in

- [ ] Open the Vercel `*.vercel.app` production URL in a browser. Click sign-in. Complete Google OAuth.
- [ ] Confirm landing on `/admin` as admin (per the `admin_emails` seed from Phase 0.A).
- [ ] Verify: Supabase auth + admin role-check + RLS read path all work end-to-end.
- [ ] If sign-in fails: re-canonicalize the dev's email per `lib/email/canonicalize.ts`, re-seed `admin_emails`, retry.

---

### Task 0.F.2: Smoke 2 — Share-link + picker real-iPhone render (post-2026-05-26 picker-pivot rebase)

- [ ] **Step 1: Confirm pre-requisite seed:** `pnpm validation:check-seed --combo R1` exits 0.
- [ ] **Step 2: Open `/admin/show/<R1-slug>` in the desktop admin session.** Read the canonical URL from `CurrentShareLinkPanel` (form: `https://<deploy>.vercel.app/show/<slug>/<64-hex-shareToken>/`). Click `ShareLinkCopyButton` to copy.
- [ ] **Step 3: Open the URL on the dev's real iPhone in Safari** (paste from clipboard via Messages / AirDrop / etc.). Hit `<SignInOrSkipGate>` Mode A → tap "Skip and pick your name" → pick `alias_5a_lead` row → `_ShowBody` renders.
- [ ] **Step 4: Verify:** every documented tile renders. No layout breaks. Mode toggle works (if visible). Mobile viewport renders correctly. LEAD scope tiles (Audio + Video + Lighting) all visible per `lib/visibility/scopeTiles.ts`.
- [ ] If render fails: investigate the picker auth chain (`lib/auth/picker/resolveShowPageAccess.ts` 11-arm union), `show_share_tokens` row presence (via `pnpm validation:check-seed` predicate g), Supabase data integrity.

---

### Task 0.F.3: Smoke 3 — Cron + Drive integration

- [ ] **Step 1: Place a fixture sheet into the prod-tier Drive watched folder** (the one configured in Phase 0.A.3).
- [ ] **Step 2: Wait one cron interval.** Vercel Cron Jobs run only on production deployments — verify cron is enabled in `vercel.json` and that the production URL receives cron pings.
- [ ] **Step 3: Open `/admin` Active Shows panel.** Confirm the new show appears within the cron interval.
- [ ] **Step 4: Verify:** cron schedule firing + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock.
- [ ] If show doesn't appear: check Vercel Cron logs, Drive service-account permissions, `WATCHED_FOLDER_ID` env var.

---

### Task 0.F.4: Smoke 4 — Admin alert write + AlertBanner render

- [ ] **Step 1: Edit a previously-published fixture sheet** to trigger MI-6 crew shrinkage (delete a crew row).
- [ ] **Step 2: Wait one cron interval.**
- [ ] **Step 3: Open `/admin`.** Confirm AlertBanner renders the new MI-6 staging row.
- [ ] **Step 4: Verify:** write path to `admin_alerts` + AlertBanner read query.
- [ ] If banner doesn't render: confirm `admin_alerts` row exists in Supabase SQL editor; if yes, AlertBanner's render path is broken (file a P0 against live code — not M12).

---

### Task 0.F.5: Smoke 5 — Wall-clock + fixture-data clock control

- [ ] **Step 1: Re-seed with `validation:reseed --combo R3`** (off-day fixture).
- [ ] **Step 2: Confirm via Supabase SQL editor** that the R3 fixture's `date_restriction.days` excludes today.
- [ ] **Step 3: Read R3's share URL from `/admin/show/<R3-slug>` (CurrentShareLinkPanel), copy to iPhone, open + skip + pick `alias_5a_lead`.**
- [ ] **Step 4: Verify:** Right Now card renders `viewer_off_day` copy per master spec §8 line 2413.
- [ ] If state doesn't appear: the `--combo R3` re-seed didn't pin the dates correctly. Inspect `validation_state` and the R3 show's dates.

---

### Task 0.F.6: Smoke 6 — Share-link + picker round-trip with Rotate sub-smoke (post-2026-05-26 picker-pivot rebase)

Per spec §9.2 + dispatch brief §3.B option β (admin UI is canonical interface; no CLI parity).

- [ ] **Step 1: Prerequisite:** `pnpm validation:reseed --combo R1` + `pnpm validation:check-seed --combo R1` both exit 0.
- [ ] **Step 2: Read the R1 share URL via the admin UI.** Sign into the production Vercel deployment as admin → open `/admin/show/<R1-slug>` → read the canonical URL from `CurrentShareLinkPanel` (calls `loadShowShareToken` → `admin_read_share_token` RPC; format: `https://<deploy>.vercel.app/show/<R1-slug>/<64-hex-shareToken>/`). Click `ShareLinkCopyButton` to copy to clipboard.
- [ ] **Step 3: Open URL on the dev's real iPhone Safari.** Hit `<SignInOrSkipGate>` Mode A → tap "Skip and pick your name" → pick `alias_5a_lead` → `_ShowBody` renders. Verify crew page (LEAD content) is fully visible.
- [ ] **Step 4: Rotate sub-smoke (exercises M11.5 R2 PICKER_SHOW_UNAVAILABLE close-out).** On the desktop admin: click `RotateShareTokenButton` on the same admin page; confirm the two-tap; observe `CurrentShareLinkPanel` updates with the new URL. On the iPhone: reload the OLD URL (the one previously copied). Expect: `showUnavailable()` envelope renders `PICKER_SHOW_UNAVAILABLE` (NOT a generic 404 — the catalog-driven envelope with crew-facing copy + admin help link). Re-share the new URL from desktop → iPhone repeats the pick (with `epoch_stale` banner because rotation atomically bumped `picker_epoch` per `rotate_show_share_token` RPC).
- [ ] **Failure-isolation procedure:** if smoke 6 fails: (a) re-run `validation:check-seed` to rule out seed staleness; (b) verify `show_share_tokens` row exists for the R1 show (`select share_token from public.show_share_tokens where show_id = (select id from public.shows where slug = '<R1-slug>')`); (c) verify `PICKER_COOKIE_SIGNING_KEY` is set in Vercel Production scope (cookie mint requires it); (d) re-test in fresh Safari private window to rule out stale iPhone cookies.

---

### Task 0.F.7: Smoke 7 (CONDITIONAL on Band F disposition) — Report-fixtures harness round-trip (R31 rewrite — `AlertBanner` rendering surface, not nonexistent admin reports route)

Per spec §9.2 R24. Required when Band F deep report outcomes default to INCLUDED-via-harness. Skipped only when MATRIX-INVENTORY.md pre-dispositions every deep outcome as EXCLUDED-rely-on-structural.

**R31 rewrite rationale:** prior Step 3 said "report-failure UI row renders for an admin viewing the affected show or report list" — no `app/admin/reports` route exists. The `lookup-inconclusive` outcome surfaces through `admin_alerts` → `AlertBanner` on the admin show page (per handoff §9 R31 producer map + plan `04-phase0-tooling-report.md` Task 0.E.2 R31 rewrite).

- [ ] **Step 1: Check MATRIX-INVENTORY.md disposition.** If every deep report outcome is EXCLUDED-rely-on-structural with structural-test cite, skip to Phase 0.F.8. Otherwise continue.

- [ ] **Step 2: Run** `pnpm validation:report-fixtures --outcome lookup-inconclusive --alert-code inconclusive` against prod-equivalent Supabase. Expect exit 0 + stdout `materialized lookup-inconclusive report row <id>`. **R45 commit 84 F41 amendment — explicit `--alert-code inconclusive`.** R43 commit 81 added the `--alert-code <variant>` selector with default `bot-login-missing` per `lookupAlertCode` at `lib/reports/submit.ts:202-208` (default branch resolves to `REPORT_LOOKUP_INCONCLUSIVE`). Smoke 7's canonical assertion (Step 3 below) is `admin_alerts.code='REPORT_LOOKUP_INCONCLUSIVE'`, which is the `default` branch of `lookupAlertCode` — i.e., the `inconclusive` selector variant. R44 surfaced F41 (HIGH): pre-R45 the smoke invoked the harness with no `--alert-code` flag (defaulting to `bot-login-missing` → `GITHUB_BOT_LOGIN_MISSING`), but Step 3 asserted `REPORT_LOOKUP_INCONCLUSIVE` — a guaranteed-fail mismatch. The R45 repair makes the selector explicit at the seed command so smoke intent (canonical inconclusive surface) aligns with the assertion code.

- [ ] **Step 3: Verify rendering surface (real producer-state path).**
  - Open `/admin/show/<fixture-slug>` while signed in as admin.
  - Expect `AlertBanner` to render an admin alert row with code `REPORT_LOOKUP_INCONCLUSIVE` (the same code raised by `lib/reports/submit.ts:691-740` `handleLookupInconclusive`, written via `resolveStateGatedAlert` at `:643-689`; resolved via the `default` branch of `lookupAlertCode` at `lib/reports/submit.ts:202-208` — i.e., `--alert-code inconclusive` per Step 2). The row's `context.validation_tag` should equal `m12-fixture-lookup-inconclusive`.
  - Cross-verify via Supabase SQL editor: `SELECT id, code, context->>'validation_tag' FROM public.admin_alerts WHERE code='REPORT_LOOKUP_INCONCLUSIVE' AND context->>'validation_tag' = 'm12-fixture-lookup-inconclusive' AND resolved_at IS NULL;` returns exactly one row.

- [ ] **Step 4: Cleanup:** `pnpm validation:report-fixtures --cleanup`. Confirm zero `m12-fixture-%` rows remain in `admin_alerts`, `report_rate_limits`, OR `reports` (all three tables — cleanup order: admin_alerts → report_rate_limits → reports per handoff §9 R31).

---

### Task 0.F.8: Phase 0 close-out

- [ ] **Step 1: Confirm all required smokes pass.** For default INCLUDED-via-harness disposition: smokes 1-7 all pass. For EXCLUDED disposition: smokes 1-6 pass + MATRIX-INVENTORY.md disposition committed.

- [ ] **Step 1a: Confirm both deferred structural defenses are committed and green** (per R13 commit 29 + DEFERRED.md entries `M12-PHASE0C-TZ-PIN-METATEST` + `M12-PHASE0C-EMAIL-CANON-EXT`; Phase 0.C Tasks 0.C.8 + 0.C.9):

```bash
pnpm vitest run \
  tests/cross-cutting/validation-tooling-tz-pin.test.ts \
  tests/cross-cutting/email-canonicalization.test.ts
```

Expect both PASS. If either fails or is missing, Phase 0 does NOT close — return to Task 0.C.8 / 0.C.9 in `03-phase0-tooling-reseed.md`.
- [ ] **Step 2: Run the budget-gate check.** If Phase 0 has consumed >10 calendar days (excluding async-provisioning latency), follow §9.0 budget-gate options:
  - Option 1 (dev-unilateral): defer report-fixtures harness; commit EXCLUDED dispositions.
  - Option 2 (REQUIRES user approval): split into M12a tooling + M12b walk milestones.
  - Option 3 (REQUIRES user approval): re-scope walk coverage (fewer R-combos, role variants, journeys).
- [ ] **Step 3: Move to Phase 1** (`06-phase1-matrix-walk.md` — renamed from `07` in 2026-05-26 picker-pivot rebase).

---

## Phase 0.F failure modes

- **Smoke 2 (iPhone render) fails.** Post-2026-05-26 rebase: most likely `PICKER_COOKIE_SIGNING_KEY` missing from Vercel Production scope (the picker cookie can't be HMAC-signed → `selectIdentity` returns `infra_error`). Verify the env var via `vercel env ls`. Secondary causes: `show_share_tokens` row missing (check via SQL editor), `auth_email_canonical` row missing for the fixture crew.
- **Smoke 3 (cron) doesn't fire.** Vercel deployment is in Preview, not Production. Re-check Phase 0.A.4.
- **Smoke 4 (admin_alerts) row missing.** MI-6 staging gates may have changed since spec write. Re-read master spec §6 to confirm MI-6 still triggers on crew row deletion.
- **Smoke 7 fails to render outcome state.** Harness wrote the wrong row shape; re-read master spec §13.2.3 row contract.
