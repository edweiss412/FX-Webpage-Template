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

### Task 0.F.2: Smoke 2 — Signed-link real-iPhone render

- [ ] **Step 1: Confirm pre-requisite seed:** `pnpm validation:check-seed --combo R1` exits 0.
- [ ] **Step 2: Generate signed link from admin UI** (or via `pnpm validation:mint-link --combo R1 --alias alias_5a_lead --expires-in 900`).
- [ ] **Step 3: Open the canonical URL (`/show/<slug>/p#t=<jwt>`) on the dev's real iPhone in Safari.** Render the crew page within the 15-minute window.
- [ ] **Step 4: Verify:** every documented tile renders. No layout breaks. Mode toggle works (if visible). Mobile viewport renders correctly.
- [ ] If render fails: investigate auth path, signing kid, Supabase data integrity — and re-run Phase 0.D's mint-link smoke for diagnosis.

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
- [ ] **Step 3: Generate a signed link for `alias_5a_lead` in R3,** open on iPhone.
- [ ] **Step 4: Verify:** Right Now card renders `viewer_off_day` copy per master spec §8 line 2413.
- [ ] If state doesn't appear: the `--combo R3` re-seed didn't pin the dates correctly. Inspect `validation_state` and the R3 show's dates.

---

### Task 0.F.6: Smoke 6 — Mint-redeem round-trip (Phase 0.D contract proven end-to-end)

Per spec §9.2 R16 + R22.

- [ ] **Step 1: Prerequisite:** `pnpm validation:reseed --combo R1` + `pnpm validation:check-seed --combo R1` both exit 0.
- [ ] **Step 2: Mint a 15-minute-TTL valid link** for `alias_5a_lead` (the baseline alias, NOT the revoke/query-compromise variants):

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead --expires-in 900 | jq -r .url)
```

- [ ] **Step 3: Open URL on the dev's real iPhone Safari** within the 15-minute window.
- [ ] **Step 4: Verify:** crew page renders.
- [ ] **Failure-isolation procedure (R16):** if smoke 6 fails: (a) re-run `validation:check-seed` to rule out seed staleness; (b) re-verify VALIDATION_JWT_SIGNING_SECRET equals Vercel Production-scope JWT_SIGNING_SECRET; (c) re-mint with a fresh 15-min TTL.

---

### Task 0.F.7: Smoke 7 (CONDITIONAL on Band F disposition) — Report-fixtures harness round-trip

Per spec §9.2 R24. Required when Band F deep report outcomes default to INCLUDED-via-harness. Skipped only when MATRIX-INVENTORY.md pre-dispositions every deep outcome as EXCLUDED-rely-on-structural.

- [ ] **Step 1: Check MATRIX-INVENTORY.md disposition.** If every deep report outcome is EXCLUDED-rely-on-structural with structural-test cite, skip to Phase 0.F.8. Otherwise continue.

- [ ] **Step 2: Run** `pnpm validation:report-fixtures --outcome lookup-inconclusive` against prod-equivalent Supabase.

- [ ] **Step 3: Verify:** the report-failure UI row renders for an admin viewing the affected show or report list (per master spec §13.2.3 contract).

- [ ] **Step 4: Cleanup:** `pnpm validation:report-fixtures --cleanup` (Don't leave fixture rows in the prod-equivalent DB.)

---

### Task 0.F.8: Phase 0 close-out

- [ ] **Step 1: Confirm all required smokes pass.** For default INCLUDED-via-harness disposition: smokes 1-7 all pass. For EXCLUDED disposition: smokes 1-6 pass + MATRIX-INVENTORY.md disposition committed.
- [ ] **Step 2: Run the budget-gate check.** If Phase 0 has consumed >10 calendar days (excluding async-provisioning latency), follow §9.0 budget-gate options:
  - Option 1 (dev-unilateral): defer report-fixtures harness; commit EXCLUDED dispositions.
  - Option 2 (REQUIRES user approval): split into M12a tooling + M12b walk milestones.
  - Option 3 (REQUIRES user approval): re-scope walk coverage (fewer R-combos, role variants, journeys).
- [ ] **Step 3: Move to Phase 1** (`07-phase1-matrix-walk.md`).

---

## Phase 0.F failure modes

- **Smoke 2 (iPhone render) fails.** Most likely: signing kid mismatch (Phase 0.D issue). Re-verify VALIDATION_JWT_SIGNING_SECRET.
- **Smoke 3 (cron) doesn't fire.** Vercel deployment is in Preview, not Production. Re-check Phase 0.A.4.
- **Smoke 4 (admin_alerts) row missing.** MI-6 staging gates may have changed since spec write. Re-read master spec §6 to confirm MI-6 still triggers on crew row deletion.
- **Smoke 7 fails to render outcome state.** Harness wrote the wrong row shape; re-read master spec §13.2.3 row contract.
