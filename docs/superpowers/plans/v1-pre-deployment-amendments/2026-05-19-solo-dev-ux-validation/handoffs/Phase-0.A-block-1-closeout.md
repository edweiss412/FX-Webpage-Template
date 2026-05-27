# Phase 0.A Block 1 — Close-out + Findings (2026-05-27)

**Status:** Block 1 (Tasks 0.A.1 → 0.A.6) DONE. Block 2 (M11.5 carryovers, tasks 0.A.1 → 0.A.3 under §B of `01-phase0-infra.md`) DEFERRED pending orchestrator triage of findings below.

**Executor:** Opus 4.7 / Claude Code (this session).

**Validation environment now operational end-to-end:**

- Vercel deploy: `https://fxav-crew-pages-validation.vercel.app` (Vercel project ref `prj_DrEdEHu07JHAyoWg8rFVjIdOcw0r`).
- Supabase: validation project ref `vzakgrxqwcalbmagufjh` (region `us-east-2`, pooler `aws-1-us-east-2.pooler.supabase.com`).
- Google OAuth: Web app client wired; signed in successfully as `edweiss412@gmail.com` and landed at `/me`.
- M12.1 pg_cron + pg_net architecture: 7 fxav_cron_* jobs active; Layer 3 binding pass — `net.http_get` to `/api/cron/sync` returns `200 {"ok":true,"processed":[]}`.

## Commit chain (post-M12.1 close, pre-Block-2)

| SHA | Type | Summary |
|---|---|---|
| `faf4f78` | docs(agents) | AGENTS.md cross-cutting #6 §12.4 3-lockstep invariant (M12.1 retrospective) |
| `b5999c8` | fix(routing) | Delete vestigial `middleware.ts` (Next 16 Edge `__dirname` error) + add `no-vestigial-middleware.test.ts` to x6 |
| `6d47059` | fix(infra) | Set `vercel.json` framework=nextjs (project preset was "Other", causing 404 on all routes) |
| `dcba2c8` | fix(test) | Drop `middleware.ts` from JWT-cutover scan list (companion x3 fix-up) |
| `401a126` | chore(validation) | Document VALIDATION_* + CRON_SECRET in `.env.local.example` (Task 0.A.5 Step 8) |

## Block 1 task closures

| Task | Outcome |
|---|---|
| 0.A.1 — Supabase prod project | ✓ ref `vzakgrxqwcalbmagufjh` (us-east-2) |
| 0.A.2 — Apply migrations + seed admin_emails | ✓ 36 base migrations applied; admin_emails seeded |
| 0.A.3 — Drive SA + watched folder | ✓ SA bundle + folder ID stored |
| 0.A.4 — Vercel deploy (no domain) | ✓ stable alias captured; per-deployment URL excluded per R5 F13 |
| 0.A.4.5 — Apply M12.1 migrations + GUC + Vault | ✓ 7 fxav_cron_* rows; pg-cron-coverage 5/5 against validation env; Layer 1+2+3 observability green |
| 0.A.5 — Env vars + .env.local.example commit | ✓ 16 vars in Vercel Production scope; .env.local.example documents the validation tooling additions |
| 0.A.6 — Admin sign-in smoke | ✓ Google OAuth → /me as authenticated admin |

## Findings (PLAN AMENDMENTS NEEDED before next deployment env)

These are bugs in `01-phase0-infra.md` and gaps in the plan structure surfaced by running Phase 0.A end-to-end. Each is recommended for orchestrator triage; some are LAND-NOW (small mechanical plan edits) and one is a NEW-TASK (Google OAuth provider setup).

### F1 — Task 0.A.4.5 Step 2 GUC: `ALTER DATABASE ... SET app.*` denied on Supabase managed PG

**Symptom:** `permission denied to set parameter "app.fxav_vercel_url"` when running `alter database postgres set app.fxav_vercel_url = '...'` via Supabase SQL editor (which connects as `postgres` role).

**Root cause:** On Supabase managed PG, the `postgres` role IS the database owner but does NOT have `SUPERUSER`. The `app.*` custom GUC namespace is restricted by Supabase policy from `ALTER DATABASE`. PG documentation says ALTER DATABASE SET requires the database owner, which `postgres` is — but Supabase's pg_hba/role restrictions deny it anyway.

**Workaround used:** Inline session-level `set_config('app.fxav_vercel_url', '<url>', false)` in the same MCP `apply_migration` call as T3. Within a single transaction, the SET persists and `current_setting()` inside the DO block reads it correctly. `format()` then bakes the URL literally into `cron.job.command`.

**Plan amendment:** Rewrite Step 2 to use the inline-SET approach (preferred) OR add a Step 2-prime amendment documenting the denial and the workaround. Citation: `supabase/migrations/20260527000003_schedule_cron_jobs.sql:44-52` for the original GUC read pattern.

**Persistence consequence:** The GUC is session-only with the workaround. Future re-applies of T3 (e.g., URL change for M13 production) require re-running the inline SET. Acceptable since URL changes are infrequent and re-apply is already part of the redeploy flow.

### F2 — Task 0.A.4.5 Step 5a: pooler hostname `aws-1-` vs docs-example `aws-0-`

**Symptom:** Initial `pg-cron-coverage.test.ts` run against validation failed with `FATAL: (ENOTFOUND) tenant/user postgres.vzakgrxqwcalbmagufjh not found` when using the docs-example pattern `aws-0-us-east-2.pooler.supabase.com`.

**Root cause:** Newer Supabase projects (this one, created 2026-05-26) route through `aws-1-us-east-2.pooler.supabase.com`, not the generic `aws-0-` example pattern shown in https://supabase.com/docs/guides/database/connecting-to-postgres.

**Resolution:** The Connect modal (green button at top of any Dashboard page, deep-link `/dashboard/project/<ref>?showConnect=true&method=session`) is the authoritative source for the actual hostname — pasted that URL with `aws-1-` and the test passed.

**Plan amendment:** Task 0.A.4.5 Step 5a operator-invocation block should call out: "The hostname prefix may be `aws-0-` or `aws-1-` (or other) depending on project age — use the Connect modal value, not the docs example." Citation: `01-phase0-infra.md:110-120`.

### F3 — Task 0.A.5 Step 7 sign-in path

**Symptom:** Plan says "open the production URL in a browser. Click sign-in. Confirm Google OAuth lands you as admin." — but `/` is intentionally bare (just `<h1>FXAV Crew Pages</h1>`; see `app/page.tsx`). No sign-in UI exists on the homepage.

**Root cause:** Post-M11.5 picker pivot, the public homepage was intentionally minimized — there's no sign-in CTA on `/`, no nav, nothing. Actual sign-in entry points:

- `/me` → redirects to `/auth/sign-in?next=/me` (the correct path for admin sign-in)
- `/admin` → 403 directly (the `requireAdmin()` + Next 16 `forbidden()` behavior — no redirect to sign-in for unauthenticated users)
- `/auth/sign-in` → the actual sign-in page with "Sign in with Google" CTA

**Plan amendment:** Step 7 should be: "Open `https://<alias>/me` in a browser. Confirm redirect to `/auth/sign-in?next=/me`. Click 'Sign in with Google'. Complete OAuth as the admin email seeded in 0.A.2. Confirm landing back on `/me` as authenticated."

### F4 — NEW PLAN GAP: Google OAuth provider setup task missing

**Severity:** P0 plan gap. Block 1 cannot fully close out without it. Discovered when attempting Task 0.A.5 Step 7 and getting `{"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}` from Supabase Auth.

**Missing:** A task (call it 0.A.5.5, parallel structurally to 0.A.4.5) that provisions Supabase Auth → Google OAuth provider. Two-side wiring:

**Side 1 — Google Cloud Console** (https://console.cloud.google.com/auth/clients):

1. Create OAuth 2.0 Client ID → Web application
2. Authorized JavaScript origins: `https://<vercel-alias>`
3. Authorized redirect URIs: `https://<supabase-ref>.supabase.co/auth/v1/callback`
4. Copy Client ID + Client Secret

**Side 1.5 — Google Auth Platform → Audience** (https://console.cloud.google.com/auth/audience):

- User type: External
- Publishing status: Testing (in solo-dev validation; switches to Production for M13 launch with brand verification)
- Test users: the admin email seeded in 0.A.2

**Side 1.75 — Google Auth Platform → Data Access** (https://console.cloud.google.com/auth/scopes):

- Add scope: `openid` (manually)
- `userinfo.email` and `userinfo.profile` are added by default
- Verify all three are listed before saving

**Side 2 — Supabase Dashboard → Auth → Providers → Google** (https://supabase.com/dashboard/project/_/auth/providers?provider=Google):

- Toggle Google provider on
- Paste Client ID + Client Secret from Side 1
- Save

**Side 3 — Supabase Dashboard → Auth → URL Configuration** (https://supabase.com/dashboard/project/_/auth/url-configuration):

- Site URL: `https://<vercel-alias>`
- Confirm redirect URLs cover the same domain

**Plan amendment:** Insert as a new task between 0.A.5 and 0.A.6 in `01-phase0-infra.md`. Cite the URL deep-links above as authoritative navigation (not sidebar walk-throughs — the Dashboard UI reorganizes frequently; see also: `~/.claude/projects/<ws>/memory/feedback_verify_dashboard_nav_before_guiding.md`, BUT note that memory file is Opus-internal and not Codex-readable, so the URL deep-links must be inlined into the plan text itself per `feedback_memory_files_invisible_to_codex.md`).

### F5 — `/admin` UX gap (deferred candidate)

**Symptom:** Unauthenticated `GET /admin` returns 403 (`This page could not be accessed.`) rather than redirecting to `/auth/sign-in?next=/admin`.

**Root cause:** `requireAdmin()` (lib/auth/requireAdmin.ts) calls Next 16's `forbidden()` helper for both "not signed in" AND "signed in but not admin" cases. Authenticated-non-admin should 403; unauthenticated should redirect to sign-in.

**Severity:** Not blocking. A typical user landing at `/admin` while signed-out would hit a dead-end without clear next-step. Mild UX bug.

**Recommendation:** File in BACKLOG.md (project-wide, speculative — not part of any milestone yet) OR DEFERRED.md (if scoped to a future M-task that's likely). Per `feedback_deferral_discipline.md`, BACKLOG is the right home unless there's a concrete trigger to fix it.

### F6 — Env-var coverage gap in my Task 0.A.5 list

**Symptom:** Initial Vercel Production env vars I gave the user excluded `DATABASE_URL`. Cron firings (and `withShowAdvisoryLock` more broadly) failed at runtime with `sync_log sink requires DATABASE_URL in production`.

**Root cause:** I filtered the env-var list to "module-load-throw first" (HASH_FOR_LOG_PEPPER) and skipped runtime-only consumers. `.env.local.example` lists `DATABASE_URL=` on line 6 — I should have copied that file's full set rather than constructing my own filter.

**Recommendation:** Task 0.A.5 Step 5 should be made explicit: "set in Vercel Production scope EVERY env var listed in `.env.local.example` (filling in actual values), not a hand-picked subset." Citation: existing wording at `01-phase0-infra.md:244` is loose ("Step 5: Set up the existing runtime env vars if not already in Vercel Production scope: SUPABASE_URL, ..."), with an enumerated list that does not include DATABASE_URL.

### F7 — Vercel project Framework Preset was "Other" not "Next.js"

**Symptom:** After fixing middleware.ts, EVERY route (`/`, `/api/cron/*`, `/admin/*`, etc.) returned `x-vercel-error: NOT_FOUND` from Vercel edge.

**Root cause:** Vercel project was created with Framework Preset = "Other", which serves static files from `public/` only and doesn't route to Next.js's `.next/server/app/` output. Build still ran (auto-detected via `next` in package.json), but Vercel's edge router didn't know to dispatch to Next functions.

**Resolution:** Set `"framework": "nextjs"` in `vercel.json` (commit `6d47059`). Per Vercel docs, this overrides the Dashboard preset at deploy time. The Dashboard still shows "Other" but real behavior matches `nextjs`.

**Plan amendment:** Task 0.A.4 Step 1 should say "Create project with Framework Preset = **Next.js**" (not "Other"). Even though `vercel.json` overrides at deploy, Dashboard-side preset affects discoverability + future deploys. Citation: `01-phase0-infra.md:71`.

### F8 — Vestigial middleware.ts from M11.5 G3 cutover (LANDED FIX)

**Symptom:** Every production route 500'd with `ReferenceError: __dirname is not defined`.

**Root cause:** Commit `05ecf7e` (M11.5 G3 `refactor(auth): delete legacy signed-link surfaces`) stripped middleware.ts's auth body to a no-op `return NextResponse.next()` but left the file. Next 16 deprecated `middleware.ts` (in favor of `proxy.ts`), and the Edge Runtime wrapper around the deprecated file references `__dirname` (a CommonJS Node global), which doesn't exist in V8 isolate.

**Fix landed:** Commit `b5999c8` deleted middleware.ts + added `tests/cross-cutting/no-vestigial-middleware.test.ts` to x6 audit. Companion fix at `dcba2c8` dropped middleware.ts from the JWT-cutover scan list (`tests/cross-cutting/no-jwt-surface.test.ts:21`).

**Action required from orchestrator:** None (already landed). Just noted here for the closeout audit trail.

## Recommended next dispatch sequence

1. **Plan amendment dispatch (Codex or Opus, plan-only changes):**
   - Apply F1, F2, F3, F4, F6, F7 plan-text amendments to `01-phase0-infra.md`.
   - Add new task (F4) for Google OAuth provider setup.
   - File F5 in BACKLOG.md.

2. **Block 2 dispatch (Opus / Claude Code per UI-always-Opus invariant):**
   - M11.5-IMP-1: SIGN_IN_OR_SKIP_FOOTER_REASSURANCE catalog code + SignInOrSkipGate footer wire-up
   - M11.5-IMP-2: picker-show-strip (Option α recommended per dispatch brief)
   - M11.5-IMP-4: DESIGN.md §1.2 contrast amendments

3. **Phase 0.B onward** per the rest of the M12 plan.

## Diff base for next session

HEAD = `401a126` on main, origin synced. Working tree clean.

## Watchpoints for Block 2

- **Drive SA private key rotation** — committed (pre-rotation) Drive SA bundle landed in conversation transcripts during the prior compacted session. User performed rotation 2026-05-26. New bundle stored in env vars; previous bundle is no longer valid.
- **Supabase DB password rotation** — the validation DB password (used in `DATABASE_URL` + `TEST_DATABASE_URL`) landed in a failed-test stderr paste during Phase 0.A.4.5 Step 5a debugging. Validation env is throwaway-class so contained, but worth rotating post-Phase-0.A close-out. Vercel `DATABASE_URL` + local `.env.local TEST_DATABASE_URL` must update lockstep with any rotation.
- **`vercel project inspect` Dashboard metadata drift** — Dashboard still reports Framework Preset "Other" despite `vercel.json` framework=nextjs working at deploy time. Cosmetic; can be fixed by user changing Dashboard preset to "Next.js" but not load-bearing.
