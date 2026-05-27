# Phase 0.A — Prod-equivalent infrastructure stand-up

> Per spec §9 and §9.0 task 0.A. Estimate: 0.5–1 day (excluding async provisioning latency — Supabase project creation ~5 min, Drive service-account API approval can be same-day or 1–2 days).
>
> Goal: stand up the prod-equivalent stack against which every later Phase 0 and Phase 1 task runs. No application code is touched in this phase — only project-creation and env-var wiring.

---

### Task 0.A.1: Create Supabase prod project

**Files:**
- No code changes. UI work in Supabase dashboard.

- [ ] **Step 1:** Sign into Supabase dashboard with the project owner's account.
- [ ] **Step 2:** Create a NEW project (distinct from the existing dev project). Name suggestion: `fxav-crew-pages-validation`. Region: closest to dev's iPhone location (smoke test 2 latency).
- [ ] **Step 3:** Wait for provisioning (~5 minutes). Capture the project ref (the `xxx` in `xxx.supabase.co`) and the service_role key (Settings → API → service_role secret).
- [ ] **Step 4:** Verify project URL responds: `curl -sI https://<project-ref>.supabase.co/rest/v1/ -H "apikey: <anon-key>"` returns 200 or 401 (not DNS-fail). 200/401 means the project is live.
- [ ] **Step 5:** Note the project ref + service_role secret. **This step captures the Supabase target values ONLY** (the J3-claim-email is the dev's pre-existing real Google account email and is wired in Task 0.A.5 — not derived from the new Supabase project). The canonical per-CLI env-var contract — including the literal env-var names + which CLI needs which — lives in spec §9.1.2 (R21 commit 44 F20 amendment + R27 commit 58 F10-class Option D refactor — §9.1.2 is the SOLE source of truth for the canonical env-var literals; this Step 5 deliberately does NOT inline-list them). Task 0.A.5 wires every var named in §9.1.2 into Vercel + `.env.local`; the Supabase project ref captured here populates the `VALIDATION_SUPABASE_*` placeholders in `.env.local.example` (the only other surface authorized to carry own-enumerations, per the structural-exclusivity walker).

---

### Task 0.A.2: Apply ALL repo migrations to the new Supabase project

**Files:**
- No new code. Run existing migrations.

- [ ] **Step 1:** Set up the Supabase CLI to point at the new project: `npx supabase link --project-ref <project-ref>`.
- [ ] **Step 2:** Apply migrations: `npx supabase db push`. Confirm all migrations under `supabase/migrations/*.sql` apply cleanly.
- [ ] **Step 3:** Confirm the resulting schema is correct via `npx supabase db pull --dry-run` (no diff expected). If there's a diff, investigate before proceeding.
- [ ] **Step 4:** Insert a known-good admin email into `public.admin_emails`. **R3 comprehensive-sweep amendment:** verified live DDL at `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:16-30` — PK column is `email` (NOT `email_canonical`); a CHECK constraint enforces `email = lower(trim(email))`. **R49 commit 88 F44 amendment (AGENTS.md invariant 3 — "email canonicalization at every boundary; `lib/email/canonicalize.ts` is the only function that touches raw emails before they enter the system"):** canonicalize the dev-email value via the registered helper FIRST, then insert the canonical literal. Do NOT use inline `lower(trim(...))` in the SQL — that creates a new canonicalization boundary outside the registered helper (the same invariant the meta-tests `tests/admin/no-inline-email-normalization.test.ts` + `tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts` enforce at CI). The live helper at `lib/email/canonicalize.ts:2-6` performs `raw.trim().toLowerCase()` ONLY (returns `null` for `null`/empty after trim) — it does NOT strip plus-aliases or perform any other transformation; the helper's canonical output is byte-identical to `lower(trim(...))` for any well-formed email, BUT the contract is that the helper is the single authorized surface, not its current implementation. Procedure:

```bash
# 1) Compute the canonical form via the registered helper (one-liner; no script needed).
#    Replace <dev-email> with the dev's real Google account email (e.g., Ed.Weiss412@gmail.com).
CANON_EMAIL=$(pnpm tsx -e "import('./lib/email/canonicalize.ts').then(m => process.stdout.write(m.canonicalize(process.argv[1] ?? '') ?? ''))" "<dev-email>")
echo "$CANON_EMAIL"  # sanity-check the output (lowercase + trimmed, no plus-alias stripping)
```

Then, in the Supabase SQL editor, insert the canonical literal directly (no SQL-side normalization):

```sql
-- Substitute the literal value of $CANON_EMAIL from step (1) above for <canonical-dev-email>.
INSERT INTO public.admin_emails (email, added_at)
VALUES ('<canonical-dev-email>', now())
ON CONFLICT (email) DO NOTHING;
```

This makes the dev an admin on the new project. The `lower(trim(email))` CHECK constraint on the table is the safety net (per AGENTS.md invariant 3: "schema-level CHECK is the safety net, not the primary mechanism") — it will accept the canonical literal because canonicalize already produced lowercase+trimmed output. **R49 F44 amendment caveat:** earlier rounds of this step claimed `lib/email/canonicalize.ts` strips plus-aliases for OAuth-identity lookups — that claim was FALSE (verified live at `lib/email/canonicalize.ts:2-6`). The helper does `trim().toLowerCase()` only; plus-aliases are preserved. The corrected procedure above does not depend on plus-alias semantics either way.
- [ ] **Step 5:** **NO commit at this step** — this is project-config, not source-code. Capture the migration-push log in the dev's working notes.

---

### Task 0.A.3: Create Drive service account for prod-equivalent watched folder

**Files:**
- No code changes. UI work in Google Cloud Console.

- [ ] **Step 1:** In Google Cloud Console, create a new project (or use the existing one) for FXAV-validation. Enable the Google Drive API.
- [ ] **Step 2:** Create a NEW service account (distinct from the dev one). Name: `fxav-validation-drive`. Download the JSON key.
- [ ] **Step 3:** In Drive, create a new shared folder (the watched folder for validation). Share it with the service account's email (Editor permission). Name suggestion: `FXAV Validation Shows`.
- [ ] **Step 4:** Capture the Drive folder ID (the `xxx` in the folder's URL `https://drive.google.com/drive/folders/xxx`). This is the `watched_folder` value the wizard will pin in Phase 0.A.5.
- [ ] **Step 5:** **NO commit** — service account JSON is a secret; never commit. Store it locally for the next step.

---

### Task 0.A.4: Create Vercel production-target deployment (no custom domain)

**Files:**
- No code changes. UI work in Vercel dashboard.

- [ ] **Step 1:** In Vercel dashboard, create a NEW project linked to the FXAV-Webpage-Template repo. Name: `fxav-crew-pages-validation`. Default branch: `main`.
- [ ] **Step 2:** **DO NOT add a custom domain.** Production deployments work fine on `*.vercel.app` URLs; per spec §9.1, no custom domain is in M12 scope.
- [ ] **Step 3:** Trigger an initial production deployment: push to `main` OR click "Redeploy" in Vercel. Wait for completion.
- [ ] **Step 4 (M12.1 T5 Step 2a — R5 F13 stable-alias amendment):** Capture the **stable project production alias** `<project-name>.vercel.app` (e.g., `fxav-crew-pages-validation.vercel.app`) — NOT the per-deployment URL output by `vercel deploy` (which has the form `<project-name>-<hash>-<team>.vercel.app` and is immutable per deployment). Verify via `npx vercel project ls` showing the project's primary domain, OR by checking the Vercel dashboard for the project's stable production URL. The alias auto-points at the latest production deployment, so subsequent redeploys (Task 0.A.5 step 6) transparently route cron traffic to the current code + env vars. The pg_cron + pg_net architecture (M12.1) bakes this URL into `cron.job.command` at T3 migration time via the `app.fxav_vercel_url` GUC + `format()` substitution; using the per-deployment URL means subsequent redeploys leave the cron firing against the OLD deployment indefinitely.
- [ ] **Step 5 (M12.1 T5 Step 3 — rationale rewrite):** Verify the deployment is "Production-target" — Vercel project page should show the URL labeled "Production" (not "Preview"). This matters because runtime env vars (including `CRON_SECRET`) are scoped to production deployments; the pg_cron + pg_net architecture (M12.1) calls the production URL specifically, and a preview URL would 401 every cron firing.
- [ ] **Step 6:** **NO commit** — this is project-config.

---

### Task 0.A.4.5: Populate Vault + set GUC + apply M12.1 migrations against validation Supabase

Per M12.1 sub-amendment (2026-05-26). This task lands the operational state the M12.1 architecture requires before env-var wiring.

**Files:**
- No code changes. SQL editor + Supabase Dashboard Vault UI operations against the validation Supabase project.

- [ ] **Step 1:** Apply the M12.1 migrations to the validation Supabase project: `npx supabase db push` — applies the three new migrations (`enable_pg_net`, `cron_secret_vault`, `schedule_cron_jobs`) on top of the migrations applied in Task 0.A.2. The `schedule_cron_jobs` migration WILL FAIL with a `app.fxav_vercel_url GUC must be set` exception on first run; this is intentional (fail-loud) — proceed to Step 2.
- [ ] **Step 2 (R5 F13 — stable-alias GUC):** Set the GUC to the stable project alias captured in Task 0.A.4 Step 4. In the Supabase SQL editor, run `alter database postgres set app.fxav_vercel_url = 'https://<project-name>.vercel.app';` (e.g., `https://fxav-crew-pages-validation.vercel.app` — the stable alias, NOT the per-deployment URL). The setting takes effect on new connections. Reconnect the SQL editor session before Step 4 re-apply.
- [ ] **Step 3 (R23 F47 — Vault UI required, NOT SQL editor):** Populate the Vault secret value via the **Supabase Dashboard Vault UI** (Project Settings → Vault → `fxav_cron_secret` → Edit). The Vault UI updates the encrypted secret value via the Supabase API, bypassing SQL statement logging entirely.

    **DO NOT use the SQL editor for this step.** Per Supabase Vault docs (https://github.com/supabase/vault#turning-off-statement-logging), SQL statements containing secret literals can be logged unencrypted by PostgreSQL's statement-logging infrastructure (`log_statement = 'all'` or `log_min_duration_statement`). A `select vault.update_secret(<id>, '<token>', ...);` call would expose the bearer token in `postgres_logs` (Supabase) + any downstream log-shipping destination. With the bearer in logs, anyone with log-read access can authenticate every `/api/cron/*` endpoint.

    Procedure:
    1. Generate the bearer locally: `openssl rand -hex 32`. Save to your secret store (locked notes / password manager).
    2. Open Supabase Dashboard → validation project → Project Settings → Vault.
    3. Find the `fxav_cron_secret` row (created by T2.2 migration with placeholder `unset-populate-via-vault-ui-or-update`).
    4. Click Edit → paste the generated bearer → Save.
    5. Verify the secret was updated via `select name, description from vault.secrets where name = 'fxav_cron_secret';` (returns name + description but NOT the secret value — safe to log).

    Save the same token value locally — Task 0.A.5 wires the matching `CRON_SECRET` env var into Vercel Production scope. The Vercel Production env-var input is also a UI surface (not SQL-logged); use the Vercel Dashboard's "Add Environment Variable" form, NOT a `vercel env add CRON_SECRET ...` CLI call that could land in shell history.

    **Secret-handling checklist for CRON_SECRET (R23 F47):**
    - [ ] Generated via `openssl rand -hex 32` (one-shot; no echo to shell that survives in history)
    - [ ] Pasted into Supabase Vault UI ONLY (NOT SQL editor)
    - [ ] Pasted into Vercel Dashboard env-var UI ONLY (NOT CLI)
    - [ ] Stored in password manager (NOT in migration files, shell history, SQL snippets, or git)
    - [ ] Verified via NAME/DESCRIPTION query only, never `select decrypted_secret ...` outside the cron schedule body that consumes it
- [ ] **Step 4:** Re-run `npx supabase db push` to re-apply `schedule_cron_jobs` now that the GUC + Vault entry are populated. Confirm via `select jobname, schedule from cron.job where jobname like 'fxav\_cron\_%' escape '\';` — should return 7 rows.
- [ ] **Step 5 (R26 F51 orphan-cleanup verification):** Verify the orphaned `cleanup-bootstrap-nonces` cron was removed by T3: `select count(*) from cron.job where jobname = 'cleanup-bootstrap-nonces';` must return 0. `select count(*) from cron.job where jobname not like 'fxav\_cron\_%' escape '\';` should return 0 (no non-fxav cron remains).
- [ ] **Step 5a (R12 F31 + R13 F34 + R16 F37 + R17 F38 — validation-env meta-test apply):** Run `pg-cron-coverage.test.ts` against the validation Supabase project to pin the SAME contract that T2.1/T2.2/T3 proved on the local dev DB.

    Get the validation pooler URL from Supabase Dashboard → Project Settings → Database → Connection string (Session pooler, NOT Transaction pooler).

    **Operator invocation (validation env):**
    ```bash
    PG_CRON_COVERAGE_TARGET=validation \
      TEST_DATABASE_URL="<validation-project-pooler-URL>" \
      VALIDATION_SUPABASE_PROJECT_REF="<project-ref-from-Task-0.A.1>" \
      pnpm test tests/cross-cutting/pg-cron-coverage.test.ts
    ```

    Test asserts at setup time that the 4 env-var guards hold (mode=validation; TEST_DATABASE_URL non-local; VALIDATION_SUPABASE_PROJECT_REF set; TEST_DATABASE_URL contains the project ref). Expect PASS for all layers (0a pg_net installed, 0b vault entry, 7-job assertion with command-contains-net.http_get + vault.decrypted_secrets + Bearer auth-header-shape + NOT-net.http_post + active=true; non-fxav snapshot; orphan-absent). Local-PASSES-validation-FAILS would surface validation-specific drift; per AGENTS.md cross-cutting #4 this step is the validation-env equivalent of CI green being a separate gate from local green.
- [ ] **Step 5b (observability probe — M12.1 handoff §10):** Wait one cron interval (5 min). Confirm at least one `fxav_cron_sync` firing landed via the joined query (jobname lives on `cron.job`, NOT `cron.job_run_details`):

    ```sql
    select j.jobname, jrd.start_time, jrd.end_time, jrd.status, jrd.return_message
      from cron.job_run_details jrd
      join cron.job j on j.jobid = jrd.jobid
     where j.jobname = 'fxav_cron_sync'
     order by jrd.start_time desc limit 5;
    ```

    Expect at least one row with `status = 'succeeded'`. NOTE: per spec §9.1.3 pg_net async semantics, `status = 'succeeded'` proves only that the SQL command (the `net.http_get(...)` enqueue) succeeded — NOT that Vercel returned 2xx. The downstream side effect (Smoke 3 Layer 3) is the binding gate; this probe is Layer 1 diagnostic confirmation that the scheduler is firing.

- [ ] **Step 6:** **NO commit** — this is per-environment operational state, not source code.

---

### Task 0.A.5: Wire env vars in Vercel + locally

**Files:**
- Modify: `.env.local.example` (document the M12 validation env vars per spec §9.1.2 — the canonical CLI command-by-command env-var contract; §9.1.2 is the SOLE source of truth and this row deliberately does NOT inline-restate the literal env-var names. The 2026-05-26 picker-pivot rebase retired `VALIDATION_JWT_SIGNING_SECRET` along with Phase 0.D — the M9.5 signLinkJwt consumer was retired at M11.5 G3 cutover. R35 commit 71 F33 propagation: extends the template to include the R33 commit 68 `VALIDATION_ADMIN_EMAIL` helper var — scoped to the `validation:report-fixtures --outcome rate-limit-admin` outcome only, NOT part of the canonical 4-var contract for the broader validation tooling. See spec §1.5 "solo-dev IS the validation" + spec §3.3 R13-amendment paragraph for the rationale behind the J3 claim-email contract — but for the literal env-var names, follow §9.1.2.)
- No `.env.local` commit — `.env.local` is gitignored.

- [ ] **Step 1: Write the .env.local.example update first (TDD-style starting point).**

```
# .env.local.example additions for M12 validation tooling (see spec §3.3 step 5
# + §9.1.2 post-2026-05-26 picker-pivot rebase + R13 commit 30 J3 claim-email
# amendment).

# All validation env vars per spec §9.1.2 MUST be set for the relevant
# CLIs to function. The three SUPABASE_* vars MUST equal the Vercel
# Production-scope values for the project backing the *.vercel.app
# production deployment. (Picker-pivot rebase 2026-05-26 deleted
# VALIDATION_JWT_SIGNING_SECRET — the M9.5 signLinkJwt surface that
# consumed it was retired at M11.5 G3 cutover. The picker cookie's
# signing key, PICKER_COOKIE_SIGNING_KEY, is set at the Vercel runtime
# layer for the deployment as part of M11.5; no validation CLI consumes
# it.)
#
# R35 commit 71 F33 — VALIDATION_ADMIN_EMAIL added below as a fifth
# variable. It is NOT part of the canonical validation env-var contract
# (which remains the SUPABASE trio + J3 claim email — see the
# structural-exclusivity walker at
# tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts);
# instead it is a per-outcome HELPER variable scoped to a single
# CLI/outcome (validation:report-fixtures --outcome rate-limit-admin
# per spec §9.1.2). Cross-reference §9.1.2 for the authoritative
# per-CLI mapping; do NOT count ADMIN_EMAIL inside the canonical
# cardinality.

# Canonical per-CLI env-var map: spec §9.1.2 table (R21 commit 44 F20
# amendment + R27 commit 58 F10-class Option D refactor) is the
# authoritative command-by-command env-var contract — the SOLE source
# of truth for which CLI needs which env-var literals. The block below
# documents the literal values the dev fills in locally (template/
# config role, not contract definition); this .env.local.example file
# is the second of TWO surfaces authorized to carry canonical env-var
# literal own-enumerations (the first being spec §9.1.2 itself). Every
# other M12 doc surface MUST cross-reference §9.1.2 rather than re-
# listing literal names — enforced at CI time by the structural-
# exclusivity walker at tests/cross-cutting/reseed-clears-oauth-claim-
# doc-guard.test.ts. See spec §9.1.2 for the canonical command-by-
# command env-var contract.
# <!-- canonical-env-var-source: keep — this .env.local.example block is
# the operator-facing config template that holds the literal values the
# dev fills in locally; the structural-exclusivity walker whitelists
# blocks carrying this marker. Defense-in-depth: paired with the spec
# §9.1.2 source-of-truth marker. -->
VALIDATION_SUPABASE_URL=
VALIDATION_SUPABASE_SECRET_KEY=
VALIDATION_SUPABASE_PROJECT_REF=

# R13 commit 30 J3 OAuth-walk fixture-impossibility fix (R15 commit 35
# canonical rejected-domain set extension per F14 finding): the dev's REAL
# Google account email. J3 leg (c) (06-phase1-matrix-walk.md Task 1.6
# leg c step 2) requires the dev to sign in to Google AS the alias_5a_lead
# identity for combo R1 to trigger claim_oauth_identity. Google OAuth
# cannot authenticate against placeholder/dev-only reserved domains —
# the CANONICAL REJECTED SET (single source of truth, mirrored across
# spec §3.3 step 5 R13-amendment paragraph + plan §0.C.5 predicate (k)
# + plan §0.C.3 fixture-build TS guard + plan §0.C.4 mint RPC defense-
# in-depth):
#   - example.com, example.org, example.net  (RFC 2606)
#   - *.test, *.invalid, *.localhost, bare localhost  (RFC 6761)
#   - *.local, dev.local  (mDNS RFC 6762 + project-conventional)
# So the reseed cannot use the synthesized validation+R1-alias_5a_lead@example.com
# placeholder for THIS one specific row. Per spec §1.5 "solo-dev IS the
# validation": the dev's personal Google account becomes the alias_5a_lead
# identity for combo R1; the dev signs in as themselves. validation:reseed
# reads this var and writes it as crew_members.email for combo R1's
# alias_5a_lead (all other combos keep the synthesized
# validation+<combo>-<alias>@example.com format — see spec §3.3
# R13-amendment paragraph for combo-isolation rationale).
# validation:check-seed predicate (k) fails if this var is still set to
# ANY domain in the canonical rejected set at seed time.
VALIDATION_J3_CLAIM_EMAIL=

# R33 commit 68 + R35 commit 71 F33 — per-outcome HELPER variable
# scoped to validation:report-fixtures --outcome rate-limit-admin
# (spec §9.1.2 report-fixtures row). The dev's REAL admin email goes
# here. Required for `validation:report-fixtures --outcome
# rate-limit-admin`; canonicalized by enforceQuota per
# `lib/reports/rateLimit.ts:76` (the live admin POST writes
# canonicalize(<admin email>) into report_rate_limits.identity, so
# the harness MUST seed the same canonical form or the production
# quota deny path never fires on the next admin POST). NOT part of
# the canonical validation env-var contract — only this one outcome
# reads it; the other 7 outcomes use the
# validation:m12-fixture-<outcome>:<uuid> synthetic-identity scheme
# per plan §0.E.1 (so leaving this var unset is safe for every CLI
# / outcome combination except rate-limit-admin). Set to the same
# email seeded into admin_emails for the prod-equivalent Supabase
# project (see 0.A.2). See spec §9.1.2 report-fixtures row for the
# authoritative per-outcome usage contract.
VALIDATION_ADMIN_EMAIL=
```

- [ ] **Step 2: Verify the file change is sensible:** `git diff .env.local.example` shows only the additions, no existing-var edits.
- [ ] **Step 3: Set the M12 validation env vars in Vercel Production scope** (Settings → Environment Variables, scope: **Production** only — NOT Preview or Development) per the canonical CLI command-by-command env-var contract at spec §9.1.2. Paste the captured Supabase values from 0.A.1 + 0.A.4 into the corresponding rows the §9.1.2 reseed row names. **M12.1 T5 amendment:** additionally set `CRON_SECRET` in Vercel Production scope to the same bearer-token value populated into the validation Supabase Vault in Task 0.A.4.5 step 3. The byte-for-byte match is load-bearing: `app/api/cron/_auth.ts:7` compares the incoming `Authorization` header against `process.env.CRON_SECRET`, and the cron job bodies pass the Vault-stored value as the bearer; mismatched values produce 401 from every cron firing (fail-loud).
- [ ] **Step 3a: Operational note** — set `VALIDATION_J3_CLAIM_EMAIL` to the dev's real Google account email (the one Google OAuth signs the dev in as during the J3 walk). This is an operational instruction for one specific row of the §9.1.2 contract, NOT a re-enumeration of the contract — see R13 commit 30 + spec §1.5 for why the J3 OAuth-claim walk needs a real Google email rather than a synthesized placeholder.
- [ ] **Step 4: Mirror those env-var values into `.env.local`** (gitignored — do NOT commit the secrets) so local CLIs read the same values as Vercel Production scope.
- [ ] **Step 5: Set up the existing runtime env vars** if not already in Vercel Production scope: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, `WATCHED_FOLDER_ID`, `HASH_FOR_LOG_PEPPER`, `PICKER_COOKIE_SIGNING_KEY` (the M11.5 picker cookie's HMAC signing key — 64 hex chars; runtime-only), plus any other vars `.env.local.example` lists for runtime. These are the production-target deployment's normal env contract; validation only ADDS the `VALIDATION_`-prefixed vars per spec §9.1.2 (R35 commit 71 F33: cross-reference §9.1.2 for the authoritative per-CLI list; the `.env.local.example` template above carries every literal the dev must set locally — including the per-outcome helper `VALIDATION_ADMIN_EMAIL` added in R33 commit 68).
- [ ] **Step 6: Trigger another production redeploy** in Vercel so the new env vars take effect.
- [ ] **Step 6a (M12.1 T5 Step 2b — R5 F13 + R18 F40 baked-URL verify):** Inspect the baked URLs in `cron.job.command` post-redeploy. In Supabase SQL editor, run:

    ```sql
    select jobname, substring(command from 'url := ''([^'']+)''') as baked_url
      from cron.job
     where jobname like 'fxav\_cron\_%' escape '\'
     order by jobname;
    ```

    **Confirm exactly 7 rows return** (matches the §9.1.3 / pg-cron-jobs.json job table). **R18 F40 per-row check:** for each row, assert:

    1. **Scheme + host equals stable alias:** `baked_url` starts with `https://<project-name>.vercel.app/` (your captured stable alias from Task 0.A.4 Step 4) — NOT a per-deployment URL (`https://<project-name>-<hash>-<team>.vercel.app/...`).
    2. **Route path matches jobname:** `fxav_cron_sync` → `/api/cron/sync`; `fxav_cron_keepalive` → `/api/cron/keepalive`; etc. (7 pairs per pg-cron-jobs.json).

    If any row's host is per-deployment, T3 was applied with a stale `app.fxav_vercel_url`; correct via `alter database postgres set app.fxav_vercel_url = '<stable-alias>';` then re-run the affected `cron.schedule()` calls manually with the corrected URL. If any row's route is wrong, the T3 migration body has a route-string typo — fix the migration + reapply.
- [ ] **Step 7: Verify the deployment can reach the new Supabase:** open the production URL in a browser. Click sign-in. Confirm Google OAuth lands you as admin (the email canonicalized in 0.A.2 step 4). If sign-in fails with "unauthorized", admin_emails was not seeded correctly — go back to 0.A.2.
- [ ] **Step 8: Commit `.env.local.example`** (only the documentation update — secrets stay in `.env.local`).

```bash
git add .env.local.example
git commit -m "$(cat <<'EOF'
chore(validation): document VALIDATION_* env vars in .env.local.example

Phase 0.A — adds the M12 validation tooling env-var placeholders per
the canonical CLI command-by-command env-var contract at spec §9.1.2
(R21 commit 44 F20 amendment + R27 commit 58 F10-class Option D
refactor; §9.1.2 is the SOLE source of truth for the canonical
literals — this commit message intentionally does not re-list them).
The .env.local.example block carries every var the §9.1.2 contract
names, including the R13 commit 30 J3-claim-email amendment that
closes the R12 F10 finding (placeholder/dev-only reserved domains
are not Google-OAuth-routable; the canonical rejected set per R15
commit 35 covers RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-
conventional dev). Per spec §1.5 "solo-dev IS the validation" the
dev's real Google account becomes the alias_5a_lead identity for
combo R1. VALIDATION_JWT_SIGNING_SECRET retired with Phase 0.D per
2026-05-26 picker-pivot rebase. Actual values stay in .env.local
(gitignored).
EOF
)"
```

---

### Task 0.A.6: Verify Phase 0.A close-out conditions

- [ ] **Step 1: Confirm all four Phase 0.A artifacts exist:**
  1. Supabase prod project responding at `VALIDATION_SUPABASE_URL`
  2. Drive service account + shared watched folder
  3. Vercel production-target deployment at `*.vercel.app` URL
  4. M12 validation env vars set in Vercel Production scope AND mirrored to local `.env.local`; documented in `.env.local.example` — per the canonical CLI command-by-command env-var contract at spec §9.1.2 (post-2026-05-26 picker-pivot rebase retired `VALIDATION_JWT_SIGNING_SECRET` with Phase 0.D; the R13 commit 30 J3-claim-email amendment is captured in the §9.1.2 reseed row's contract).
- [ ] **Step 2: Run the "admin sign-in" smoke as a Phase-0.A close-out probe** (NOT smoke 1 yet — that runs in Phase 0.F after everything is in place): sign into the Vercel production URL via Google, confirm admin role lands.
- [ ] **Step 3: Continue to Phase 0.A.1** (M11.5 carry-over: SignInOrSkipGate footer copy + catalog code), or skip directly to Phase 0.B if the M11.5-IMP carry-over tasks are deferred.

---

### Task 0.A.1: M11.5-IMP-1 — `SIGN_IN_OR_SKIP_FOOTER_REASSURANCE` catalog code + SignInOrSkipGate footer wire-up

Per dispatch brief §3.C item 1 + DEFERRED.md `M11.5-IMP-1` (2026-05-24 deferred from M11.5 §B impeccable v3 attestation). Picker spec §7.1a item 7 mandates a reassurance footer on the SignInOrSkipGate ("Crew don't have to sign in. Skip works for everyone."). The component does not currently render it; the catalog code does not exist.

**Files:**
- Modify: `lib/messages/catalog.ts` (add new code)
- Regenerate: `lib/messages/__generated__/spec-codes.ts` (the spec-codes generator picks up the new catalog entry)
- Modify: `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx` (render the footer via `messageFor()`)

- [ ] **Step 1: TDD — write failing component test** at `tests/components/auth/SignInOrSkipGate.test.tsx`: render the component in Mode A, assert the reassurance footer text "Crew don't have to sign in" appears, and the catalog code `SIGN_IN_OR_SKIP_FOOTER_REASSURANCE` is wired via the messageFor() helper. Expect FAIL.
- [ ] **Step 2: Add the catalog entry** to `lib/messages/catalog.ts` in alphabetical position (between `SHOW_*` entries). Shape per picker-pivot spec §7.1a item 7: `crewFacing` = "Crew don't have to sign in. Skip works for everyone." (or the dev's final-pass copy per picker-pivot spec UX contract). `dougFacing` = null. `helpHref` = "/help/picker#sign-in-or-skip" (verify that fragment anchor exists in `/help/picker` or add it in this task). `title` / `longExplanation` = null (footer is inline, not a banner).
- [ ] **Step 3: Run `pnpm gen:spec-codes`** to regenerate `lib/messages/__generated__/spec-codes.ts`. Confirm the new code appears.
- [ ] **Step 4: Wire the component:** in `_SignInOrSkipGate.tsx`, render `messageFor('SIGN_IN_OR_SKIP_FOOTER_REASSURANCE').crewFacing` inside a footer element below the CTAs (Skip primary + Sign-in secondary). Style per `DESIGN.md` typographic hierarchy (smaller than CTAs, text-text-subtle on bg-surface tint).
- [ ] **Step 5: Test passes.** Run impeccable v3 critique + audit pair on the diff (external attestation per `feedback_impeccable_external_attestation_required` — fresh subagent OR user-invoked, NOT the same Opus session that wrote the change).
- [ ] **Step 6: Commit.**

```bash
git add lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx tests/components/auth/SignInOrSkipGate.test.tsx
git commit -m "feat(catalog): add SIGN_IN_OR_SKIP_FOOTER_REASSURANCE; wire SignInOrSkipGate footer (M11.5-IMP-1)"
```

- [ ] **Step 7: Update DEFERRED.md** — mark `M11.5-IMP-1` as `**RESOLVED <SHA>**` with the commit SHA per the de facto practice.

---

### Task 0.A.2: M11.5-IMP-2 — picker-show-strip with show metadata

Per dispatch brief §3.C item 2 + DEFERRED.md `M11.5-IMP-2` (trigger explicitly names: "M12 amendment session adds show metadata to picker render scope OR resolver shape is extended"). Picker spec §7.1 item 2 + §7.6 inventory require a show identifier strip with `data-testid="picker-show-strip"` between the brand strip and the "Who are you?" heading. Currently absent.

**Files:**
- Modify: `lib/auth/picker/resolveShowPageAccess.ts` (extend the picker-rendering arms to carry `showTitle` + `showDates`) OR `app/show/[slug]/[shareToken]/page.tsx` (add a separate metadata fetch alongside the existing `loadRoster`)
- Modify: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (render the strip)

**Decision point at task start:** the dev picks ONE of:

- **Option α — extend resolver shape.** Add `show: { title: string; dates: string }` to each picker-rendering arm of `ResolveShowPageAccessResult` (the `no_auth/first_contact`, `epoch_stale`, `removed_from_roster`, `identity_invalidated` arms — the ones that render the picker). The resolver fetches `shows.title` + `shows.dates` in the same query that reads `shows.published` + `shows.archived`. Pros: structurally cleanest; one query path. Cons: shape change touches the resolver contract + the H8 doc-guard exhaustiveness test (`tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts`).
- **Option β — separate metadata fetch.** In `app/show/[slug]/[shareToken]/page.tsx`, add a `loadShowMetadata(showId)` helper called alongside `loadRoster`. Pros: no resolver-shape churn; H8 doc-guard untouched. Cons: an extra DB round-trip per picker render; the page route now has two parallel fetches.

Recommend α. Document choice in the task close-out commit.

- [ ] **Step 1: TDD — write failing component test** at `tests/components/picker/PickerInterstitial-show-strip.test.tsx`: render PickerInterstitial with mock show metadata, assert the element with `data-testid="picker-show-strip"` exists between the brand strip (data-testid="picker-brand-strip") and the "Who are you?" heading; verify the rendered text matches the mock title + dates. Expect FAIL.
- [ ] **Step 2: Implement** the chosen option (α or β):
  - **α:** edit `lib/auth/picker/resolveShowPageAccess.ts` to add `show: { title, dates }` to the four picker-rendering arms; update the test exhaustiveness fixture to cover the new field; update the page-route consumer in `app/show/[slug]/[shareToken]/page.tsx` to pass `result.show` through to `<PickerInterstitial show={...} />`.
  - **β:** add `lib/data/loadShowMetadata.ts` (`requireAdmin()` NOT needed — show metadata is publicly visible by design); call it alongside loadRoster in the page route; pass `show` to `<PickerInterstitial>`.
- [ ] **Step 3: Edit `_PickerInterstitial.tsx`** to render the `picker-show-strip` element between brand strip and heading. Style per `DESIGN.md` typographic hierarchy (small heading scale, text-text on bg-surface tint).
- [ ] **Step 4: Test passes.** Run impeccable v3 critique + audit pair on the diff (external attestation per AGENTS.md invariant 8).
- [ ] **Step 5: Commit + mark DEFERRED.md `M11.5-IMP-2` as RESOLVED.**

```bash
git commit -m "feat(picker): render picker-show-strip with show metadata (M11.5-IMP-2; option {α|β})"
```

---

### Task 0.A.3: M11.5-IMP-4 — DESIGN.md §1.2 contrast amendments for picker color pairs

Per dispatch brief §3.C item 3 + DEFERRED.md `M11.5-IMP-4` (2026-05-24 deferred from M11.5 §B impeccable v3 attestation). DESIGN.md §1.2 "Contrast summary" doesn't list two color pairs the picker uses: `text-text on bg-stale-tint` (picker banner row) and `text-text-subtle on bg-surface-sunken` (claimed-row treatment). Both pairs almost certainly hit AA body floor on the chosen tints but the table doesn't pre-compute them.

**Files:**
- Modify: `DESIGN.md` (add two rows to §1.2 "Contrast summary" table)

- [ ] **Step 1: Compute the contrast ratios.** Use a WCAG contrast calculator (e.g., `https://webaim.org/resources/contrastchecker/`) against the live tokens in `app/globals.css` `@theme` block. The two pairs:
  - `text-text on bg-stale-tint` — read both color values from `app/globals.css`, compute ratio.
  - `text-text-subtle on bg-surface-sunken` — same procedure.
- [ ] **Step 2: Add two rows to DESIGN.md §1.2** following the existing table format (Light mode ratio | Dark mode ratio | WCAG level | Notes).
- [ ] **Step 3: Verify each ratio meets AA body floor (4.5:1).** If either fails, the task surfaces a DESIGN.md amendment that must be discussed before commit — the picker tints would need adjustment in `app/globals.css`. (Not an expected outcome — the tints were chosen against AA — but the computation is the verification step that gives certainty.)
- [ ] **Step 4: Impeccable v3 critique + audit pair on DESIGN.md** (external attestation per AGENTS.md invariant 8 — DESIGN.md changes are UI-quality artifacts).
- [ ] **Step 5: Commit + mark DEFERRED.md `M11.5-IMP-4` as RESOLVED.**

```bash
git commit -m "docs(design): add contrast rows for picker stale-tint + surface-sunken pairs (M11.5-IMP-4)"
```

---

### Task 0.A.7: Move to Phase 0.B

- [ ] **Step 1: Move to Phase 0.B** (`02-phase0-validation-state.md`) — the validation_state migration + master-spec amendments + test baseline updates.

---

## Phase 0.A failure modes

- **Supabase migrations fail to apply.** Usually a missing extension or a permission issue. Investigate before proceeding; do NOT manually edit migrations to "make them apply".
- **Drive service-account creation rejected.** Google Cloud sometimes requires billing-enabled or admin approval. If so, escalate; M12 cannot proceed without a real Drive watched folder.
- **Vercel deployment fails.** Check env-var completeness; the production-target build needs every runtime env var the app reads.
- **Sign-in works but admin role doesn't land.** Re-canonicalize the dev's email per `lib/email/canonicalize.ts`'s rules and re-INSERT into `public.admin_emails`. The canonicalization is THE invariant (per master spec X.5).
