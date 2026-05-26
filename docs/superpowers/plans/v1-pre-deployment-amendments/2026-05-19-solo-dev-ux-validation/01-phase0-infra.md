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
- [ ] **Step 4:** Insert a known-good admin email into `public.admin_emails`. **R3 comprehensive-sweep amendment:** verified live DDL at `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:16-30` — PK column is `email` (NOT `email_canonical`); a CHECK constraint enforces `email = lower(trim(email))`. Connect via the Supabase SQL editor and run:

```sql
INSERT INTO public.admin_emails (email, added_at)
VALUES (lower(trim('<dev-email>')), now())
ON CONFLICT (email) DO NOTHING;
```

This makes the dev an admin on the new project. (`lib/email/canonicalize.ts` strips plus-aliases for OAuth-identity lookups; the admin_emails table's CHECK only requires `lower(trim(...))`, so the plain canonical form works.)
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
- Modify: `.env.local.example` (document the 4 new VALIDATION_* env vars; the 2026-05-26 picker-pivot rebase removed `VALIDATION_JWT_SIGNING_SECRET` along with Phase 0.D — the M9.5 signLinkJwt consumer was retired at M11.5 G3 cutover. The R13 commit 30 amendment adds `VALIDATION_J3_CLAIM_EMAIL` — the dev's real Google account email used by the J3 leg (c) OAuth-claim walk; see spec §3.3 R13-amendment paragraph and spec §1.5 "solo-dev IS the validation".)
- No `.env.local` commit — `.env.local` is gitignored.

- [ ] **Step 1: Write the .env.local.example update first (TDD-style starting point).**

```
# .env.local.example additions for M12 validation tooling (see spec §3.3 step 5
# + §9.1.2 post-2026-05-26 picker-pivot rebase + R13 commit 30 J3 claim-email
# amendment).

# All four MUST be set for validation tooling to function. The three SUPABASE_*
# vars MUST equal the Vercel Production-scope values for the project backing
# the *.vercel.app production deployment. (Picker-pivot rebase 2026-05-26
# deleted VALIDATION_JWT_SIGNING_SECRET — the M9.5 signLinkJwt surface that
# consumed it was retired at M11.5 G3 cutover. The picker cookie's signing
# key, PICKER_COOKIE_SIGNING_KEY, is set at the Vercel runtime layer for
# the deployment as part of M11.5; no validation CLI consumes it.)

VALIDATION_SUPABASE_URL=
VALIDATION_SUPABASE_SECRET_KEY=
VALIDATION_SUPABASE_PROJECT_REF=

# R13 commit 30 J3 OAuth-walk fixture-impossibility fix: the dev's REAL
# Google account email. J3 leg (c) (06-phase1-matrix-walk.md Task 1.6
# leg c step 2) requires the dev to sign in to Google AS the alias_5a_lead
# identity for combo R1 to trigger claim_oauth_identity. Google OAuth
# cannot authenticate against the RFC 2606 reserved domains
# (example.com / example.org / example.net), so the reseed cannot use
# the synthesized validation+R1-alias_5a_lead@example.com placeholder
# for THIS one specific row. Per spec §1.5 "solo-dev IS the validation":
# the dev's personal Google account becomes the alias_5a_lead identity
# for combo R1; the dev signs in as themselves. validation:reseed reads
# this var and writes it as crew_members.email for combo R1's alias_5a_lead
# (all other combos keep the synthesized validation+<combo>-<alias>@example.com
# format — see spec §3.3 R13-amendment paragraph for combo-isolation
# rationale). validation:check-seed predicate (k) fails if this var is
# still set to a placeholder example.com / example.org / example.net
# domain at seed time.
VALIDATION_J3_CLAIM_EMAIL=
```

- [ ] **Step 2: Verify the file change is sensible:** `git diff .env.local.example` shows only the additions, no existing-var edits.
- [ ] **Step 3: Set the four env vars in Vercel** (Settings → Environment Variables, scope: **Production** only — NOT Preview or Development): paste the captured values from 0.A.1 + 0.A.4 for the SUPABASE_* trio; set `VALIDATION_J3_CLAIM_EMAIL` to the dev's real Google account email (the one Google OAuth signs the dev in as during the J3 walk; see R13 commit 30 + spec §1.5).
- [ ] **Step 4: Set the four env vars locally** in `.env.local` (gitignored — do NOT commit the secrets): same values as Vercel Production scope.
- [ ] **Step 5: Set up the existing runtime env vars** if not already in Vercel Production scope: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, `WATCHED_FOLDER_ID`, `HASH_FOR_LOG_PEPPER`, `PICKER_COOKIE_SIGNING_KEY` (the M11.5 picker cookie's HMAC signing key — 64 hex chars; runtime-only), plus any other vars `.env.local.example` lists for runtime. These are the production-target deployment's normal env contract; validation only ADDS the four `VALIDATION_`-prefixed vars.
- [ ] **Step 6: Trigger another production redeploy** in Vercel so the new env vars take effect.
- [ ] **Step 7: Verify the deployment can reach the new Supabase:** open the production URL in a browser. Click sign-in. Confirm Google OAuth lands you as admin (the email canonicalized in 0.A.2 step 4). If sign-in fails with "unauthorized", admin_emails was not seeded correctly — go back to 0.A.2.
- [ ] **Step 8: Commit `.env.local.example`** (only the documentation update — secrets stay in `.env.local`).

```bash
git add .env.local.example
git commit -m "$(cat <<'EOF'
chore(validation): document 4 VALIDATION_* env vars in .env.local.example

Phase 0.A — adds VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY,
VALIDATION_SUPABASE_PROJECT_REF, and VALIDATION_J3_CLAIM_EMAIL as
placeholders documenting M12 validation tooling env contract (spec §3.3
step 5; §9.1.2 post-rebase; R13 commit 30 J3 claim-email amendment).
VALIDATION_J3_CLAIM_EMAIL closes the R12 F10 finding: example.com is
RFC 2606 reserved → Google OAuth rejects → J3 leg (c) unwalkable as
designed. Per spec §1.5 "solo-dev IS the validation" the dev's real
Google account becomes the alias_5a_lead identity for combo R1.
VALIDATION_JWT_SIGNING_SECRET retired with Phase 0.D per 2026-05-26
picker-pivot rebase. Actual values stay in .env.local (gitignored).
EOF
)"
```

---

### Task 0.A.6: Verify Phase 0.A close-out conditions

- [ ] **Step 1: Confirm all four Phase 0.A artifacts exist:**
  1. Supabase prod project responding at `VALIDATION_SUPABASE_URL`
  2. Drive service account + shared watched folder
  3. Vercel production-target deployment at `*.vercel.app` URL
  4. Four VALIDATION_* env vars set in Vercel Production scope AND local `.env.local`; documented in `.env.local.example` (post-2026-05-26 picker-pivot rebase — `VALIDATION_JWT_SIGNING_SECRET` retired with Phase 0.D; R13 commit 30 added `VALIDATION_J3_CLAIM_EMAIL`)
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
