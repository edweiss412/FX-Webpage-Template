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
- [ ] **Step 5:** Note the project ref + service_role secret for §3.3 step 5 env vars: `VALIDATION_SUPABASE_URL = https://<project-ref>.supabase.co`, `VALIDATION_SUPABASE_SECRET_KEY = <service_role-secret>`, `VALIDATION_SUPABASE_PROJECT_REF = <project-ref>`.

---

### Task 0.A.2: Apply ALL repo migrations to the new Supabase project

**Files:**
- No new code. Run existing migrations.

- [ ] **Step 1:** Set up the Supabase CLI to point at the new project: `npx supabase link --project-ref <project-ref>`.
- [ ] **Step 2:** Apply migrations: `npx supabase db push`. Confirm all migrations under `supabase/migrations/*.sql` apply cleanly.
- [ ] **Step 3:** Confirm the resulting schema is correct via `npx supabase db pull --dry-run` (no diff expected). If there's a diff, investigate before proceeding.
- [ ] **Step 4:** Insert a known-good admin email into `public.admin_emails`: connect via the Supabase SQL editor and run `INSERT INTO public.admin_emails (email_canonical) VALUES ('<canonicalized-dev-email>');` (canonicalized via `lib/email/canonicalize.ts`'s rules — lowercase, strip-plus, etc.). This makes the dev an admin on the new project.
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
- [ ] **Step 4:** Capture the production `*.vercel.app` URL (the canonical one — NOT a preview URL). This is the dev's working validation URL for every later task.
- [ ] **Step 5:** Verify the deployment is "Production-target" — Vercel project page should show the URL labeled "Production" (not "Preview"). This matters because Vercel Cron Jobs run only on production deployments (smoke test 3).
- [ ] **Step 6:** **NO commit** — this is project-config.

---

### Task 0.A.5: Wire env vars in Vercel + locally

**Files:**
- Modify: `.env.local.example` (document the 4 new VALIDATION_* env vars)
- No `.env.local` commit — `.env.local` is gitignored.

- [ ] **Step 1: Write the .env.local.example update first (TDD-style starting point).**

```
# .env.local.example additions for M12 validation tooling (see spec §5.3 + §3.3 step 5):

# All four MUST equal the Vercel Production-scope values for the project backing
# the *.vercel.app production deployment (spec R16 + R22 amendments).

VALIDATION_SUPABASE_URL=
VALIDATION_SUPABASE_SECRET_KEY=
VALIDATION_SUPABASE_PROJECT_REF=
VALIDATION_JWT_SIGNING_SECRET=
```

- [ ] **Step 2: Verify the file change is sensible:** `git diff .env.local.example` shows only the additions, no existing-var edits.
- [ ] **Step 3: Set the four env vars in Vercel** (Settings → Environment Variables, scope: **Production** only — NOT Preview or Development): paste the captured values from 0.A.1 + 0.A.4.
- [ ] **Step 4: Set the four env vars locally** in `.env.local` (gitignored — do NOT commit the secrets): same values as Vercel Production scope.
- [ ] **Step 5: Set up the existing Supabase service-role + Drive service-account env vars** if not already in Vercel Production scope: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, `JWT_SIGNING_SECRET`, `WATCHED_FOLDER_ID`, plus any other vars `.env.local.example` lists for runtime. These are the production-target deployment's normal env contract; validation only ADDS the four VALIDATION_-prefixed vars.
- [ ] **Step 6: Trigger another production redeploy** in Vercel so the new env vars take effect.
- [ ] **Step 7: Verify the deployment can reach the new Supabase:** open the production URL in a browser. Click sign-in. Confirm Google OAuth lands you as admin (the email canonicalized in 0.A.2 step 4). If sign-in fails with "unauthorized", admin_emails was not seeded correctly — go back to 0.A.2.
- [ ] **Step 8: Commit `.env.local.example`** (only the documentation update — secrets stay in `.env.local`).

```bash
git add .env.local.example
git commit -m "$(cat <<'EOF'
chore(validation): document 4 VALIDATION_* env vars in .env.local.example

Phase 0.A — adds VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY,
VALIDATION_SUPABASE_PROJECT_REF, VALIDATION_JWT_SIGNING_SECRET as
placeholders documenting M12 validation tooling env contract (spec §5.3
+ §3.3 step 5). Actual values stay in .env.local (gitignored).
EOF
)"
```

---

### Task 0.A.6: Verify Phase 0.A close-out conditions

- [ ] **Step 1: Confirm all four Phase 0.A artifacts exist:**
  1. Supabase prod project responding at `VALIDATION_SUPABASE_URL`
  2. Drive service account + shared watched folder
  3. Vercel production-target deployment at `*.vercel.app` URL
  4. Four VALIDATION_* env vars set in Vercel Production scope AND local `.env.local`; documented in `.env.local.example`
- [ ] **Step 2: Run the "admin sign-in" smoke as a Phase-0.A close-out probe** (NOT smoke 1 yet — that runs in Phase 0.F after everything is in place): sign into the Vercel production URL via Google, confirm admin role lands.
- [ ] **Step 3: Move to Phase 0.B** (`02-phase0-validation-state.md`) — the validation_state migration + master-spec amendments + test baseline updates.

---

## Phase 0.A failure modes

- **Supabase migrations fail to apply.** Usually a missing extension or a permission issue. Investigate before proceeding; do NOT manually edit migrations to "make them apply".
- **Drive service-account creation rejected.** Google Cloud sometimes requires billing-enabled or admin approval. If so, escalate; M12 cannot proceed without a real Drive watched folder.
- **Vercel deployment fails.** Check env-var completeness; the production-target build needs every runtime env var the app reads.
- **Sign-in works but admin role doesn't land.** Re-canonicalize the dev's email per `lib/email/canonicalize.ts`'s rules and re-INSERT into `public.admin_emails`. The canonicalization is THE invariant (per master spec X.5).
