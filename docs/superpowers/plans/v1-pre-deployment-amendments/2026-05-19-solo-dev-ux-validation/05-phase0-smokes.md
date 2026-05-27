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
- [ ] **Step 2: Wait one cron interval (5 min).** Post-M12.1 (2026-05-26 pg_cron pivot per M12.1 spec §2.3) cron firing originates from Supabase `pg_cron` + `pg_net`, NOT from Vercel Cron. Observability uses a 3-layer ladder; **Layer 3 (downstream side effect — show appears in `/admin` Active Shows) is the SOLE BINDING PASS criterion per R10 F27 + R11 F28**. Layers 1 + 2 are DIAGNOSTIC ONLY (pg_net response correlation cannot reliably attribute responses to specific cron jobs under concurrent firings — R9 F24). If Layer 3 fails, walk Layers 1 + 2 diagnostically to localize.

  1. **Scheduler fired (pg_cron) — DIAGNOSTIC:** Supabase SQL editor:
     ```sql
     select j.jobname, jrd.start_time, jrd.end_time, jrd.status,
            jrd.return_message, jrd.command
       from cron.job_run_details jrd
       join cron.job j on j.jobid = jrd.jobid
      where j.jobname = 'fxav_cron_sync'
      order by jrd.start_time desc limit 5;
     ```
     Expect at least one row created within the last 5 min with `status = 'succeeded'`. NOTE: `status = 'succeeded'` proves only that the SQL command (the `net.http_get(...)` enqueue) succeeded, NOT that Vercel returned 2xx or that the handler ran. pg_net is asynchronous.

  2. **HTTP request landed (pg_net) — DIAGNOSTIC, correlated by timestamp proximity:** TWO queries:
     ```sql
     -- 2a: latest pg_net responses (response keyed by id; no URL column)
     select id, status_code, content_type, timed_out, error_msg, created
       from net._http_response
      order by created desc limit 10;

     -- 2b: cron firings with command (URL baked in by T3 format())
     select j.jobname, jrd.start_time, jrd.end_time, jrd.status, jrd.command
       from cron.job_run_details jrd
       join cron.job j on j.jobid = jrd.jobid
      where j.jobname like 'fxav\_cron\_%' escape '\'
        and jrd.start_time > now() - interval '10 minutes'
      order by jrd.start_time desc;
     ```
     Expect a response created shortly after the cron.job_run_details start_time with `status_code = 200` and `error_msg is null`. `status_code = 401` = Vault bearer does not match Vercel `CRON_SECRET` (fail-loud). `status_code = 405` = HTTP-method mismatch (should be impossible if T4 meta-test passes). `timed_out = true` = pg_net worker abandoned the request (R11 F28: pg_net-version-dependent; `timeout_milliseconds` may be ignored in current versions — DIAGNOSTIC-ONLY observation).

  3. **Downstream side effect — THE BINDING PASS CRITERION:** the new show appears in `/admin` Active Shows panel. **THIS LAYER ALONE DECIDES SMOKE 3 PASS/FAIL.** A show appearing in `/admin` Active Shows proves the full pipeline executed end-to-end: pg_cron fired AND pg_net reached Vercel AND auth passed AND the parser ran AND the DB write under per-show advisory lock landed.

- [ ] **Step 3: Verify:** pg_cron schedule firing + pg_net HTTP reach to Vercel route + handler auth pass + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock.
- [ ] If show doesn't appear, walk the 3 observability layers in order:

  **Layer 1 (cron.job_run_details):** if no recent row OR `status='failed'`, the scheduler didn't fire — check that T3 migration applied (`select jobname from cron.job where jobname like 'fxav\_cron\_%' escape '\'` returns 7 rows) and that the cluster's pg_cron worker is running.

  **Layer 2 (net._http_response cross-referenced with cron.job_run_details by timestamp proximity):** if no recent response row, the pg_net call enqueued but the worker hasn't processed it (rare; retry in 30-60s).
  - `status_code=401`: `CRON_SECRET` mismatch between Vercel env var and Vault entry. **R24 F48: DO NOT verify by selecting `decrypted_secret`; that exposes the bearer in SQL editor / browser / session history.** Instead, recover by ROTATING: generate a new bearer via `openssl rand -hex 32`; paste into Vault Dashboard UI (Project Settings → Vault → `fxav_cron_secret` → Edit → Save); paste the SAME value into Vercel Dashboard env-var UI for `CRON_SECRET`; redeploy Vercel. Next cron firing should return `status_code=200`. If 401 persists post-rotation, re-verify Vercel env-var was saved (Dashboard view, NOT a CLI command that could show the value) and confirm the Vault entry's `updated_at` reflects the rotation (`select name, description, updated_at from vault.secrets where name = 'fxav_cron_secret';` is safe — no `decrypted_secret` returned).
  - `status_code=405`: HTTP method mismatch — should not happen if T4 meta-test is green; check T3 SQL for `net.http_post` drift.
  - `timed_out=true`: pg_net worker abandoned the request (R11 F28 version-dependent). Check Vercel Logs for the `/api/cron/sync` route's actual execution time.
  - `error_msg` present: pg_net could not reach Vercel — DNS/network issue at Supabase egress.

  **Layer 3 (Vercel Logs tab + downstream state):**
  - 2xx but show not in Active Shows: handler ran but parser/DB write failed — check Drive service-account permissions, `GOOGLE_DRIVE_FOLDER_ID` env var, Supabase logs for advisory-lock contention.

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

- [ ] **Step 1: Prerequisite:** `pnpm validation:reseed --combo R1` + `pnpm validation:check-seed --combo R1` both exit 0. **R55 commit 94 F48 alignment note:** the second invocation passes by virtue of check-seed's single-combo dispatch routing to predicate (b') (`combos_seeded_dates['R1'] = $VALIDATION_TODAY_ISO`, written by the mint RPC) rather than predicate (b) (which scopes to `--combo all` only, reading the finalizer-owned `last_seed_date`). Pre-R55 the smoke would have blocked on a fresh/next-day stack where `last_seed_date` was stale from a prior day's `--combo all` run (or never set); the R55 single-combo dispatch contract closes that gap. See plan 03 Task 0.C.5 predicate list (lines around predicate (b'/b)) for the dispatch contract.
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
- **Smoke 3 (cron) doesn't fire.** Post-M12.1 pivot the cron firing surface is Supabase `pg_cron` + `pg_net`, NOT Vercel Cron. Walk the 3-layer observability ladder at Smoke 3 Step 2 to localize:
  - **Layer 1 (`cron.job_run_details`)** shows no recent row → pg_cron scheduling failed (check T3 migration applied via `select jobname from cron.job where jobname like 'fxav\_cron\_%' escape '\';` + pg_cron worker process running).
  - **Layer 2 (`net._http_response`)** shows no recent row OR `error_msg` present → pg_net failed to reach Vercel (check VPC/egress).
  - **Layer 3 (show in `/admin` Active Shows)** is the SOLE BINDING PASS criterion per R10 F27 (Layer 3 failure with Layers 1+2 green = bearer auth mismatch OR Drive permissions OR handler runtime error — check Vercel Logs).
- **Smoke 4 (admin_alerts) row missing.** MI-6 staging gates may have changed since spec write. Re-read master spec §6 to confirm MI-6 still triggers on crew row deletion.
- **Smoke 7 fails to render outcome state.** Harness wrote the wrong row shape; re-read master spec §13.2.3 row contract.
