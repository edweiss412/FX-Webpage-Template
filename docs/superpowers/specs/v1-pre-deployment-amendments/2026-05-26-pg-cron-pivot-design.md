# M12.1 — pg_cron sub-amendment to Solo-Dev UX Validation spec

**Status:** DRAFT (R0) — pending self-review + adversarial review.
**Amends:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md` (M12 spec, R70 APPROVED 2026-05-26).
**Plan:** `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/`.
**Handoff:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12.1-pg-cron-pivot.md`.

This is a delta spec. Read alongside the M12 spec; the M12 spec's R70-APPROVED contracts remain binding except where this document explicitly amends them.

---

## §1 — Rationale

The M12 amendment ratified a "Vercel-Cron-on-production-target-deployment" architecture (M12 spec §9.1 + §9.2 smoke 3). Phase 0.A execution surfaced an unstated assumption: the `vercel.json` committed at HEAD declares 7 cron entries, of which 5 fire sub-daily (`*/5`, `*/15`, hourly). Vercel's Hobby tier rejects deployments containing crons that exceed daily granularity ("Hobby accounts are limited to daily cron jobs"). The pre-existing `eric-weiss-projects` Vercel team is on Hobby. Phase 0.A.4 (`vercel deploy --prod`) failed.

Three resolution paths were considered (orchestrator triage, 2026-05-26):

- **A.** Upgrade `eric-weiss-projects` → Vercel Pro ($20/mo). Resolves the deploy gate immediately. Couples FXAV's prod architecture to Vercel Pro perpetually.
- **B.** Move project to an existing Pro team. Foreclosed — `vercel teams ls` confirmed no other team on the authenticated account.
- **C.** Strip frequent crons from `vercel.json` and defer smokes 3+4 to a later phase. Materially diverges validation env from spec §9 prod-equivalence; re-opens M12 scope.

**Path D — pivot the production cron architecture to Supabase `pg_cron` + `pg_net`** was identified as the project's preferred direction. This is the canonical sub-amendment: a permanent free-tier path that preserves prod-equivalence (validation env runs the same cron architecture M13 launches on), keeps all 7 cron jobs at their current schedules, and removes Vercel Pro as a load-bearing dependency.

### §1.1 — Why pg_cron + pg_net specifically

Considered alternatives and why pg_cron wins for this project:

| Scheduler | Min granularity | Reliability | Vendor surface | Why not |
|---|---|---|---|---|
| **pg_cron + pg_net** (chosen) | 1 min | Postgres-backed; runs in same process as data layer | Supabase only (already in stack) | — |
| GitHub Actions cron | 5 min | "Best-effort"; documented schedule-skipping under GH load | GitHub (already in stack) | 5x worse granularity than current `*/5` requirement floor; reliability docs explicitly warn against on-time guarantees |
| Cloudflare Workers Cron | 1 min | Reliable | Cloudflare (NEW vendor) | Adds vendor; same granularity as pg_cron with worse stack-locality |
| Upstash QStash | 1 min via cron; ms via API | Reliable; has retry semantics | Upstash (NEW vendor) | Free tier ~500 msg/day; FXAV total = ~458/day (sync 288 + asset-recovery 96 + 3× hourly 72 + 2× daily 2). Tight headroom; one new sub-hourly cron breaches free tier |
| cron-job.org | 1 min | Anecdotal | cron-job.org (NEW vendor, small) | Free third-party with no SLA; vendor risk |
| Vercel Cron (status quo) | 1 min on Pro; daily on Hobby | Reliable | Vercel | Requires $20/mo Pro perpetually for the 5 sub-daily jobs |

pg_cron wins on (a) zero new vendor relationship, (b) 1-min granularity ceiling matches anything except Upstash's ms-API headroom (not currently needed), (c) the project already uses `cron.schedule()` at `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36` for signing-key rotation — established pattern, (d) free tier in perpetuity.

### §1.2 — Pre-existing infrastructure (load-bearing for amendment scope)

Two findings from live-code grep (2026-05-26, pre-draft citation pass per AGENTS.md "live-code citation pass" discipline):

1. **All 7 cron route handlers already validate `Authorization: Bearer $CRON_SECRET`** via `app/api/cron/_auth.ts:3-12` (`rejectUnauthorizedCron`). NOT gated on Vercel's `x-vercel-cron` header injection. Handler code is external-scheduler-compatible without modification. Verified at:
   - `app/api/cron/sync/route.ts:2,7`
   - `app/api/cron/keepalive/route.ts:2,5`
   - `app/api/cron/refresh-watch/route.ts:2,6`
   - `app/api/cron/gc-watch/route.ts:2,6`
   - `app/api/cron/asset-recovery/route.ts:2,6`
   - `app/api/cron/diagram-gc/route.ts:2,6`
   - `app/api/cron/report-reaper/route.ts:4,114`

2. **`pg_cron` extension is already installed** and `cron.schedule()` is in use at `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:1` (extension) + `:36` (the one existing schedule call, for the bootstrap-nonces signing-key rotation). The architectural pattern this amendment adopts is already operational for an unrelated surface.

Missing infrastructure:
- `pg_net` extension — not yet enabled (this amendment enables it)
- Supabase Vault — not yet used (this amendment introduces it for `CRON_SECRET` storage)
- 7× `cron.schedule()` calls for the actual cron jobs — not yet present

---

## §2 — Amendments to the M12 spec

Three changes are binding once this sub-amendment is APPROVED. Two are inline text amendments to the M12 spec; one is an additive new section.

### §2.1 — Amend M12 spec §9.1 Vercel project row (`...solo-dev-ux-validation-design.md:801`)

**Existing text (M12 spec line 801):**

> | **Vercel project** | Linked to the repo's `main` branch (or chosen branch). **Production-target deployment** (NOT preview) — Vercel Cron Jobs run only on production deployments per [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs). **No custom domain; no DNS.** The `*.vercel.app` URL of the production deployment is the dev's working URL for the entire validation. R3 amendment: an earlier draft said "preview deployment"; corrected — preview deployments do not run cron and would falsify smoke test 3. |

**Amended text (replace in place):**

> | **Vercel project** | Linked to the repo's `main` branch (or chosen branch). **Production-target deployment** (NOT preview) — required because runtime env vars (including `CRON_SECRET`) are scoped to production, and the cron HTTP routes target the production URL specifically. **No custom domain; no DNS.** The `*.vercel.app` URL of the production deployment is the dev's working URL for the entire validation. **The `crons` block in `vercel.json` is removed** per M12.1 sub-amendment (2026-05-26); cron scheduling lives in Supabase `pg_cron` + `pg_net` (see §2.3 below + the M12.1 plan). R3 amendment: an earlier draft said "preview deployment" — preview deployments lack production-scope env vars and would 401 every cron HTTP call. M12.1 amendment (2026-05-26): replaced the Vercel-Cron rationale with the env-var-scoping rationale; cron firing no longer originates from Vercel infrastructure. |

### §2.2 — Amend M12 spec §9.2 smoke test 3 (`...solo-dev-ux-validation-design.md:850`)

**Existing text (M12 spec line 850):**

> 3. **Cron + Drive integration.** A fixture sheet placed in the prod-tier Drive watched folder is detected by the cron path (Vercel Cron → fetch from Drive service account → parse → propagate) within one cron interval. The new show appears in `/admin` Active Shows panel. Verifies: cron schedule firing + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock.

**Amended text (replace in place):**

> 3. **Cron + Drive integration.** A fixture sheet placed in the prod-tier Drive watched folder is detected by the cron path (`pg_cron` schedule → `net.http_get()` (NOT http_post — handlers are GET-only per `app/api/cron/*/route.ts` verified at HEAD `001c8e4`) with `Authorization: Bearer $CRON_SECRET` → Vercel route handler `/api/cron/sync` → fetch from Drive service account → parse → propagate) within one cron interval. The new show appears in `/admin` Active Shows panel. Verifies: pg_cron schedule firing + pg_net HTTP reach to Vercel route + handler auth pass + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock. **M12.1 amendment (2026-05-26):** the firing surface pivoted from Vercel Cron to Supabase pg_cron + pg_net. Observability moved: verify firings via the **joined query** `select j.jobname, jrd.start_time, jrd.end_time, jrd.status, jrd.return_message from cron.job_run_details jrd join cron.job j on j.jobid = jrd.jobid where j.jobname = 'fxav_cron_sync' order by jrd.start_time desc limit 5;` — the join is load-bearing because `cron.job_run_details` only has `jobid` (NOT `jobname`); jobname lives on `cron.job` (R3 F7 fix, per pg_cron docs). See plan T5 Step 4 for the full 3-layer observability ladder (pg_cron firing → net._http_response HTTP outcome → downstream side effect as binding proof) and the diagnostic walk-through. The Vercel side observability is the route handler's normal application logs (Vercel Logs tab) — cron-tagged structured log entries appear there as they always did, just initiated by pg_net rather than Vercel-Cron infrastructure.

### §2.3 — Additive new section in M12 spec §9.X — cron architecture (post-§9.1.2, pre-§9.2)

Insert as new §9.1.3 (or wherever the M12 amendment editor judges fit; numbering is a plan-detail). Suggested heading: **§9.1.3 Cron scheduling architecture (M12.1 amendment, 2026-05-26)**.

> Cron jobs fire from Supabase `pg_cron`, not Vercel Cron. The 7 schedules currently declared in `vercel.json` (status quo) are replaced by 7 equivalent `cron.schedule()` calls in a new migration. Each schedule's body is a `net.http_get()` call to the corresponding `*.vercel.app/api/cron/<path>` route, with the `Authorization: Bearer <CRON_SECRET>` header sourced from `vault.secrets`. **HTTP method:** `GET` (NOT POST), because all 7 route handlers export `GET` only (verified via `rg "^export (async )?function (GET|POST)" app/api/cron/` at HEAD `001c8e4` — 7 GET exports, zero POST exports). The bearer-auth contract at `app/api/cron/_auth.ts:3-12` is method-agnostic; it reads the `Authorization` header regardless of HTTP verb.
>
> **pg_net is asynchronous.** `net.http_get()` enqueues a request and returns a `bigint` request_id immediately. The actual HTTP request executes in pg_net's worker process and the response (status_code, headers, body, error_msg) lands in `net._http_response` keyed by that request_id. Consequently, `cron.job_run_details.status = 'succeeded'` proves only that the SQL command (the enqueue) succeeded — it does NOT prove that Vercel returned 2xx or that the handler ran. Smoke 3 observability requires three independent layers: (1) `cron.job_run_details` for scheduler firing, (2) `net._http_response` for HTTP outcome, (3) downstream side effect for end-to-end proof. See the M12.1 plan T5 Step 4 for the 3-layer observability ladder.
>
> **Job → schedule → route mapping (binding; matches current `vercel.json` schedules at HEAD):**
>
> | pg_cron jobname | Schedule | Vercel route |
> |---|---|---|
> | `fxav_cron_sync` | `*/5 * * * *` | `/api/cron/sync` |
> | `fxav_cron_keepalive` | `0 12 * * *` | `/api/cron/keepalive` |
> | `fxav_cron_refresh_watch` | `0 * * * *` | `/api/cron/refresh-watch` |
> | `fxav_cron_gc_watch` | `15 * * * *` | `/api/cron/gc-watch` |
> | `fxav_cron_asset_recovery` | `*/15 * * * *` | `/api/cron/asset-recovery` |
> | `fxav_cron_diagram_gc` | `30 * * * *` | `/api/cron/diagram-gc` |
> | `fxav_cron_report_reaper` | `0 6 * * *` | `/api/cron/report-reaper` |
>
> **Auth contract:** the Vercel route handlers continue to use `app/api/cron/_auth.ts` `rejectUnauthorizedCron` (unchanged from M12 R70 HEAD — verified at `app/api/cron/_auth.ts:3-12`). `net.http_get()` (pg_net installs its functions in the `net` schema, NOT `pg_net`) includes the header `{ "Authorization": "Bearer <CRON_SECRET>" }` where `<CRON_SECRET>` is sourced inside the cron job body via the Supabase Vault decrypted-secrets view, keyed by the `fxav_cron_secret` name. **R25 F50 fix — semantic reference, not literal SQL:** earlier draft inlined the literal SELECT statement here, but the same phrase appears as a forbidden pattern in the doc-guard (R24 F48 pattern 8) for non-cron-body contexts. The cron schedule body in plan T3 SQL is the SOLE legitimate use of the literal SQL phrase; this spec prose describes the sourcing semantically without restating the literal SELECT. Vault is preferred over a Postgres GUC because (a) encrypted at rest, (b) rotation does not require re-deploying a migration, (c) isolates secret value from `pg_settings` visibility. **Vault schema convention (R2 F4 fix):** the Supabase Vault extension NAME is `supabase_vault` but its SQL surface lives in the `vault` schema — functions (`vault.create_secret`, `vault.update_secret`), table (`vault.secrets`), view (`vault.decrypted_secrets`). M12.1 migrations + meta-tests + smoke queries reference the schema `vault`, NOT the extension name `supabase_vault`. **Vault availability:** the `supabase_vault` extension is pre-installed on all Supabase project tiers including free — verify via `\dn vault` (the schema) after project provisioning. **R5 F12 fix:** PostgreSQL's `CREATE EXTENSION ... WITH SCHEMA schema_name` requires the schema to ALREADY EXIST (per PG docs); a fresh non-Supabase environment without the `vault` schema would fail before any vault function call. T2.2 uses the two-statement defensive form `create schema if not exists vault; create extension if not exists supabase_vault with schema vault;` — both idempotent on Supabase managed projects (where Vault is pre-installed) and correctly bootstrapping on environments without it.
>
> **Time zone:** all 7 schedules are interpreted in UTC. pg_cron's default timezone is the cluster setting; Supabase clusters are UTC. Vercel Cron is also UTC. Equivalence is preserved. The `fxav_cron_keepalive` schedule `0 12 * * *` fires at 12:00 UTC daily — matches the pre-pivot Vercel Cron firing time.
>
> **Env var contract delta to §9.1.2:** the `CRON_SECRET` env var (already documented in `_auth.ts:4`) MUST be set in Vercel Production scope AND mirrored into the Vault entry `fxav_cron_secret` in the validation Supabase project. The two values MUST match byte-for-byte. Wired in Phase 0.A.5 (per the M12.1 plan).
>
> **Smoke 3 observability path** is amended per §2.2 above.

### §2.4 — No other M12 spec changes

The §1017 audit-trail row (M12 R3 amendment finding F1 fix) is HISTORICAL and must NOT be edited per AGENTS.md "historical-row preservation" convention. M12.1 has its own audit trail (see this document's §5 below + the M12.1 handoff convergence log).

---

## §3 — Plan delta (cross-reference)

The M12.1 plan at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/` is the binding execution surface. This section names the high-level shape; consult the plan for task-level detail.

Five sub-amendment tasks (sequenced):

- **M12.1.T1 — `vercel.json` crons removal.** Single-commit edit; removes the `crons` block. Unblocks Phase 0.A.4 deploy retry on Hobby tier.
- **M12.1.T2 — `pg_net` extension + Vault `fxav_cron_secret` entry.** Two migrations. Establishes the prerequisites for T3.
- **M12.1.T3 — 7× `cron.schedule()` migration.** One migration with 7 `cron.schedule()` calls per §2.3 table. Each call body reads the vault secret and `net.http_get()`s the corresponding route (GET, NOT POST — see §2.3 HTTP method note).
- **M12.1.T4 — Structural defenses (meta-tests).** Two test files: `tests/cross-cutting/no-vercel-cron.test.ts` (forbidden-substring + no `crons` key in `vercel.json`); `tests/cross-cutting/pg-cron-coverage.test.ts` (DB introspection asserts 7 `cron.job` rows match the §2.3 table). Plus the canonical job table at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` that the meta-test reads.
- **M12.1.T5 — M12 plan amendment.** Edit `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md` to (a) insert new Task 0.A.4.5 between Task 0.A.4 and Task 0.A.5 (populate Vault `fxav_cron_secret` value + set `app.fxav_vercel_url` GUC + apply T2/T3 migrations against validation Supabase), and (b) update Task 0.A.5 step 3 to add `CRON_SECRET` to the Vercel Production-scope env-var set. Phase 0.A executor reads `01-phase0-infra.md` directly; the dispatch brief is a wrapper. Without T5, the executor would resume per the pre-pivot M12 plan and skip Vault population.

Phase 0.A integration: after M12.1 APPROVE + execution (T1-T5), Phase 0.A executor resumes at Task 0.A.4 (Vercel deploy retry, now passing) → Task 0.A.4.5 (new, populate Vault + GUC + apply migrations) → Task 0.A.5 (env-var wiring, now including `CRON_SECRET` set in BOTH Vercel Production scope AND Supabase Vault, with values matching byte-for-byte) → Task 0.A.6 (sign-in probe).

---

## §4 — Live-code citation pass (pre-draft discipline)

Per AGENTS.md "live-code citation pass": every factual claim above about current code/state has been grep-verified against HEAD `ac752d9`. Citation summary:

| Claim | File:line | Verified |
|---|---|---|
| All 7 cron handlers use `rejectUnauthorizedCron` | `app/api/cron/{sync,keepalive,refresh-watch,gc-watch,asset-recovery,diagram-gc,report-reaper}/route.ts` (7 files, all import + invoke) | ✅ |
| `rejectUnauthorizedCron` validates `Authorization: Bearer $CRON_SECRET` | `app/api/cron/_auth.ts:3-12` | ✅ |
| `pg_cron` extension installed | `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:1` | ✅ |
| One existing `cron.schedule()` call (signing-key rotation) | `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36` | ✅ |
| Current `vercel.json` schedules | `vercel.json` (7 entries; §2.3 table matches byte-for-byte) | ✅ |
| Vercel Cron references in M12 spec | `...2026-05-19-solo-dev-ux-validation-design.md:801, :850` (active); `:1017` (HISTORICAL — not edited) | ✅ |
| `pg_net` extension NOT yet enabled | grep of `supabase/` returns zero matches for `pg_net` | ✅ |
| Supabase Vault NOT yet used | grep of `supabase/` returns zero matches for `vault.secrets` / `vault.create_secret` | ✅ |

---

## §4.5 — API surface citation registry (R3 comprehensive re-analysis output)

Per AGENTS.md "same-vector recurrence triggers comprehensive re-analysis (mandatory)": R1 F1 (HTTP verb verification), R2 F4 (Vault schema name), R2 F5 (cron.job_run_details column shape), R2 F6 (matrix POST drift), R3 F7 (jobname-on-job_run_details), R3 F8 (db push re-apply assumption) are all the same class — "verify the named API against the actual implementation, not what you remember." Three rounds with this class triggered comprehensive re-analysis. This registry is the output: every external API surface named in M12.1, with canonical citation + verified signature/columns.

| API surface | Canonical citation | Verified at | First named in M12.1 at | Status |
|---|---|---|---|---|
| `cron.schedule(jobname text, schedule text, command text) returns bigint` | https://github.com/citusdata/pg_cron#contributing | T3 SQL (7 calls) | Plan T3 step 2 | ✅ |
| `cron.unschedule(jobname text) returns boolean` | https://github.com/citusdata/pg_cron#contributing | T3 SQL (idempotency block) + R25 F49 orphan cleanup (`cleanup-bootstrap-nonces` left by M11.5 G3 cutover) | Plan T3 step 2 (R25 F49 fix) | ✅ R25 F49 fixed — T3 unschedule loop also handles the orphaned `cleanup-bootstrap-nonces` cron whose target function + table were dropped by `20260523000099_cutover_drop_m9_5.sql` without cron.unschedule. M12.1 piggybacks the cleanup since it's touching cron.* surface |
| `cron.job` columns (jobid, schedule, command, nodename, nodeport, database, username, active, jobname) | pg_cron README | T3 step 6 (`jobname not like 'fxav\_cron\_%' escape '\'`), T4 meta-test (step 2a checks `active = true`), Smoke 3 join | Plan T3 step 6 + T4.2 step 1 (R4 F10 + R20 F43 fix) | ✅ R4 F10 fixed (escape clause added) + R20 F43 fixed (active=true assertion added; the column was named in this row from R1 but T4.2 assertion didn't check it until R20 — could have passed against silently-disabled jobs) |
| **Supabase CLI `db push` idempotency contract — applies pending migrations ONLY** | https://supabase.com/docs/reference/cli/supabase-db-push | T2.1/T2.2/T3 idempotency checks must execute SQL directly via `psql -f <migration>`, NOT `db push` | Plan T2.1 step 3 + T2.2 step 3 + T3 step 5 (R3 F8 + R20 F42 fix) | ✅ R3 F8 + R20 F42 fixed — R3 F8 caught the anti-tautology negative-regression class (db push doesn't re-execute tracked migrations, so "edit migration, db push, expect FAIL" is a no-op); R20 F42 caught the SAME class at the idempotency-check sites in T2.1/T2.2/T3. All idempotency verifications now use `psql -f` for direct SQL re-execution |
| **PostgreSQL `LIKE` operator metacharacter semantics** | https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE | T3 cron.unschedule predicate + T3 step 4/6 + T4 meta-test + T5 step 4/5 (12 sites total) | Plan T3 SQL | ✅ R4 F10 fixed — `_` in LIKE pattern is single-char wildcard (NOT literal underscore); the escape-clause form `like 'fxav\_cron\_%' escape '\'` is required to make underscores literal. Pre-fix predicate `like 'fxav_cron_%'` would match e.g. `fxavXcronY...` and accidentally unschedule a future non-M12 cron with a similar name |
| `cron.job_run_details` columns (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time) | pg_cron README | Smoke 3 query (Layer 1) | Plan T5 step 4 + Spec §2.2 | ✅ R3 F7 fixed — joined form on jobid → cron.job for jobname |
| `net.http_get(url text, params jsonb default null, headers jsonb default null, timeout_milliseconds int default 5000) returns bigint` | https://github.com/supabase/pg_net + https://supabase.github.io/pg_net/api/ | T3 SQL (7 calls, body uses `url :=`, `headers :=`, `timeout_milliseconds :=` named-arg form, timeout = 300000ms hint) | Plan T3 step 2 | ✅ R1 F1 fixed (was http_post) + R6 F16 fixed (was 30s timeout, now 300s); **R11 F28 caveat:** the Supabase pg_net API reference at https://supabase.github.io/pg_net/api/ notes that `timeout_milliseconds` may be currently ignored / defaults to a worker-internal value depending on the deployed pg_net version. M12.1 passes 300000 as a forward-compatible HINT (will be enforced if and when pg_net's worker honors it); Smoke 3 prose treats `timed_out` field as DIAGNOSTIC-ONLY observation (consistent with R10 F27 Layer 2 diagnostic-only positioning) since its firing depends on version. Layer 3 (downstream side effect) remains the SOLE BINDING PASS criterion regardless of pg_net timeout behavior |
| `net.http_get returns request_id (bigint), HTTP response lands in net._http_response asynchronously` | pg_net README | Spec §2.3 + Smoke 3 Layer 2 | Spec §2.3 R2-fix paragraph | ✅ R2 F5 fixed |
| `net._http_response` columns (id, status_code, content_type, headers, content, timed_out, error_msg, created) | pg_net README | Smoke 3 query (Layer 2) | Plan T5 step 4 | ✅ R2 F5 fixed |
| `vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid` | https://supabase.com/docs/guides/database/vault | T2.2 migration | Plan T2.2 step 1 | ✅ R2 F4 fixed (was supabase_vault.create_secret) |
| `vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void` — but **DO NOT call from SQL editor with literal secret values** per R23 F47; **also DO NOT `select decrypted_secret` from SQL editor for diagnostics** per R24 F48 | Supabase Vault docs + https://github.com/supabase/vault#turning-off-statement-logging | Plan T5 Task 0.A.4.5 step 3 (Vault populate) MUST use Vault Dashboard UI, NOT SQL editor. Plan T5 step 4 Smoke 3 401 diagnostic MUST recover by rotation (Vault UI + Vercel UI), NOT by SELECT-bearer comparison | Plan T5 step 1 + Smoke 3 401 diag (R2 F4 + R23 F47 + R24 F48 fix) | ✅ R2 F4 + R23 F47 + R24 F48 fixed — R23 F47 caught SQL-statement leak; R24 F48 caught the matching SELECT-bearer leak in diagnostic prose (the result display creates the same human-copy exposure surface even though the statement text doesn't contain the secret). Structural defense: T4.3 pattern 8 added — `select decrypted_secret` outside cron schedule body / test file / finding-history context is forbidden by the doc-guard |
| `vault.secrets` table (id, name, description, secret, key_id, nonce, created_at, updated_at) | Supabase Vault docs | T2.2 + T3 prereq-check | Plan T2.2 + T3 | ✅ R2 F4 fixed (was supabase_vault.secrets) |
| `vault.decrypted_secrets` view (decrypted_secret column) | Supabase Vault docs | T3 SQL (7 reads) + T4 meta-test + T5 step | Plan T3 SQL | ✅ R2 F4 fixed (was supabase_vault.decrypted_secrets) |
| `create extension supabase_vault with schema vault` | Supabase Vault docs | T2.2 migration | Plan T2.2 step 1 | ✅ R2 F4 fixed |
| **`supabase db push` applies PENDING migrations only — already-tracked migrations are NOT re-run** | https://supabase.com/docs/reference/cli/supabase-db-push | T4 anti-tautology procedure | Plan T4 step 3 | ✅ R3 F8 fixed — procedure now uses `cron.unschedule()` for live-state mutation OR `supabase db reset` for migration re-apply |
| `supabase_migrations.schema_migrations` (migration tracking table) | Supabase CLI docs | T4 anti-tautology procedure rationale | Plan T4 step 3 (post-R3-fix) | ✅ R3 F8 fixed |
| `current_setting(name text, missing_ok boolean default false) returns text` | PostgreSQL docs | T3 prereq-check (`app.fxav_vercel_url` GUC read) | Plan T3 SQL | ✅ |
| `alter database <db> set app.fxav_vercel_url = '...';` (operator-facing GUC config) | PostgreSQL docs | T3 prereq-check + Phase 0.A.4.5 step 2 | Plan T5 step 1 (M12 plan amendment) | ✅ |
| **Vercel stable project alias vs per-deployment URL** | Vercel docs (https://vercel.com/docs/deployments/generated-urls) | Phase 0.A.4 step 4 (capture) + Phase 0.A.4.5 step 2 (set GUC) + Phase 0.A.5 step 6a (verify baked URL) | Plan T5 step 2a + 2b (M12 plan amendment) | ✅ R5 F13 fixed — stable alias `<project-name>.vercel.app` auto-points at latest production deployment; per-deployment URL `<project>-<hash>-<team>.vercel.app` is immutable and would route cron traffic to the OLD deployment after every redeploy. cron.job.command bakes the URL at migration time, so the wrong choice persists until migration re-apply |
| **PostgreSQL `CREATE EXTENSION ... WITH SCHEMA` requires pre-existing schema** | https://www.postgresql.org/docs/current/sql-createextension.html ("The named schema must already exist") | T2.2 migration two-statement bootstrap | Plan T2.2 step 1 | ✅ R5 F12 fixed — `create schema if not exists vault;` precedes `create extension if not exists supabase_vault with schema vault;` for fresh-environment compatibility |
| **CI gate wiring (.github/workflows/x-audits.yml + package.json test:audit:xN script naming)** | M11 + M12 x-audits convention | T4.4 step 1-4 + new test:audit:x6-pg-cron-pivot script + new audit-x6-pg-cron-pivot CI job | Plan T4.4 | ✅ R5 F11 fixed — CI-safe tests (no-vercel-cron + pg-cron-pivot-doc-guard) wired into x-audits.yml; pg-cron-coverage marked local-only (live DB required, out of CI scope) |
| **PostgreSQL `ESCAPE` clause requires single-character escape string** | https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE | All 12 LIKE escape-clause sites in M12.1 use `escape '\'` (single backslash) | Plan T3 SQL, T4 meta-test, T5 step 4/5/6a, Smoke 3 verification | ✅ R6 F14 fixed — earlier R5-fix new Task 0.A.5 step 6a used `escape '\\'` (double backslash) which PG parses as a 2-char string and errors at `ESCAPE`. All 12 sites now use single-backslash form. Markdown source must NOT double the backslash inside code blocks (code blocks are literal); doubling would produce invalid SQL when copied |
| **Test-file self-exclusion from prose-guard walkers** | Project convention (M11.5 + M12 doc-guard pattern) | T4.1 + T4.3 walker exclusion | Plan T4.1 step 1 + T4.3 step 2 (R6 F15 fix) | ✅ R6 F15 fixed — no-vercel-cron.test.ts + pg-cron-pivot-doc-guard.test.ts each excluded from their own walks (the test file MUST contain forbidden literals to define them as regex patterns; a naive scan-self would fail the test against itself). Implementation via `if (filePath === __filename) continue;` skip OR `SELF_EXEMPT` constant. Anti-tautology assertion pins that exactly one file is exempt (no broader allowlist) |
| **AGENTS.md Invariant 1 TDD-per-task** for migration/doc tasks | AGENTS.md invariant 1 ("failing test → minimal implementation → passing test → commit") | T2.1 + T2.2 + T5 each get Step 0 TDD-red verification (pg-cron-coverage Layer 0a/0b for migration prereqs; pg-cron-pivot-doc-guard assertions A-D for T5 M12-plan amendments) | Plan T2.1 step 0, T2.2 step 0, T5 step 0; T4.2 step 1 (Layer 0a/0b); T4.3 step 1a (assertions A-D) | ✅ R7 F17 fixed — TDD-red phases now explicitly defined for tasks that R0-R6 had structured as "write migration first, verify later." The structural meta-tests (pg-cron-coverage, pg-cron-pivot-doc-guard) carry the per-task red-then-green assertions |
| **Timeout-prose consistency sweep** | M12 self-consistency-sweep discipline (§5.11) | All M12.1 docs mentioning timeout values must agree on the chosen value (300s); Smoke 3 diagnostic prose at plan T5 step 4 Layer 2 + diagnostic ladder | Plan T5 step 4 (R6 F16 + R7 F19 fix) | ✅ R6 F16 changed T3 SQL timeout 30s → 300s; R7 F19 swept the stale Smoke 3 diagnostic prose that still referenced 30s. Future timeout changes MUST sweep both T3 SQL + Smoke 3 prose + spec §4.5 row; the §5.11 mandatory pre-commit grep check catches this class |
| **`net.http_request_queue` lifecycle: deleted on execution** | https://supabase.com/docs/guides/database/extensions/pg_net ("waiting requests are stored in net.http_request_queue and deleted upon execution") | Smoke 3 Layer 2 uses TWO queries (response inspection + cron.job_run_details with baked-in URL) cross-referenced by timestamp proximity, NOT a JOIN on request_queue | Plan T5 step 4 Layer 2 (R8 F21 + R9 F24 fix) | ✅ R9 F24 fixed — R8 F21 fix joined `net._http_response.id = net.http_request_queue.id` to recover URL per response, but Supabase docs confirm queue rows are DELETED post-execution, so the JOIN returns zero rows for successful requests. Corrected: two-query timestamp-proximity correlation. cron.job_run_details.command is preserved indefinitely + contains the URL via T3 SQL format() interpolation. Durable audit-table approach deferred to BACKLOG.md for diagnostic-level certainty under concurrent firings |
| **`workflow_dispatch:` trigger for on-demand CI verification** | GitHub Actions docs (https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch) + AGENTS.md cross-cutting #4 "local-passes-CI-fails is its own bug class" | T4.4 step 2a adds `workflow_dispatch:` to `.github/workflows/x-audits.yml`; T4.4 step 3a verifies via `gh workflow run x-audits.yml --ref <branch>` | Plan T4.4 step 2a + 3a (R8 F22 fix) | ✅ R8 F22 fixed — added workflow_dispatch trigger + dispatch verification step. Cross-cutting #4 mandates real-CI-green as a separate close-out gate from local-green; new x-audit jobs need an on-demand run path so the operator can prove the gate actually fires in GitHub Actions, not just locally |
| **Validation-env meta-test apply (analog of local-passes-CI-fails for DB)** | AGENTS.md cross-cutting #4 + project Vitest live-DB convention (TEST_DATABASE_URL env var with localhost fallback; .env.local is NOT auto-loaded) + mode-gated test discipline (R16 F37) + project-ref guard (R17 F38) | Task 0.A.4.5 step 5a runs pg-cron-coverage.test.ts against the validation project after migration apply, with 3 env vars (`PG_CRON_COVERAGE_TARGET=validation` + `TEST_DATABASE_URL` + `VALIDATION_SUPABASE_PROJECT_REF`) + 4-guard validation-mode assertion | Plan T5 step 1 Task 0.A.4.5 step 5a (R12 F31 + R13 F34 + R16 F37 + R17 F38 fix) | ✅ R12 F31 + R13 F34 + R16 F37 + R17 F38 fixed. **R17 F38 underspecification fix:** R13 F34 said the validation guard "asserts TEST_DATABASE_URL contains the validation project ref" but didn't specify the source for the expected ref. Without a source, the guard could only check "not local" — silently allowing a different remote Supabase project to pass. Resolved: `VALIDATION_SUPABASE_PROJECT_REF` env var (already in §9.1.2 canonical contract per R35 commit 71) is now required + asserted to appear as a substring in TEST_DATABASE_URL. Closes both silent-local AND silent-wrong-remote fallthrough classes |
| **Doc-guard regex bidirectional regression (negative + positive paired cases)** | Same-vector recurrence calibration (R4 F9 + R6 F15 + R10 F26 + R13 F33 = 4 hits of "structural defense regex too broad") | T4.3 Step 4 expanded: every forbidden pattern has BOTH a negative-regression case (introduce a violation → expect FAIL) AND a positive-regression case (legitimate near-violation in prose/inverse/diagnostic context → expect PASS) | Plan T4.3 step 4 (R13 F33 structural-defense calibration) | ✅ R13 F33 fixed (4th hit of class) — comprehensive bidirectional regression-set proves each pattern catches real drift WITHOUT false-positiving on legitimate prose. Pattern 1 (supabase_vault.SQL-call) + Pattern 2 (net.http_post SQL-call) regexes refined to require `(` follow-context (function-call only); prose mentions allowed. **8 patterns** × 2 regression cases = 16+ test cases pin the bidirectional contract (Pattern 8 added in R24 F48; bidirectional fixtures inventoried in R26 F52) |

**Maintenance contract:** any future amendment to M12.1 that introduces a new API surface MUST add a row here with canonical citation + verified signature/columns BEFORE the spec/plan edit references it. Pre-commit grep check (§5.11) catches stale references; this registry is the positive-side enumeration.

---

## §5 — Self-review checklist (per AGENTS.md spec self-review additions)

Status: R1 self-review completed by drafting Opus session 2026-05-26. See R1 amendments inline above.

- [x] **Guard conditions:** addressed. Vercel-side: `_auth.ts:7` returns 401 when `expected !== Bearer <provided>` (fail-loud). Vault-side: T3 prereq-check block raises if vault entry missing; placeholder default value forces 401 if not populated. GUC-side: T3 prereq-check raises if `app.fxav_vercel_url` unset.
- [x] **Mode boundaries:** N/A — single mode (production scheduling).
- [x] **Cap/truncation:** N/A — fixed 7-job set; the canonical job-table JSON (T4) makes this closed-set contract explicit.
- [x] **Rendered vs conceptual:** spec deltas in §2.1 + §2.2 are exact-string replacements; named so.
- [x] **Dimensional invariants:** N/A — non-UI.
- [x] **Transition inventory:** N/A — non-UI.
- [x] **Existing-code citations:** done in §4 above; grep-verified at HEAD `ac752d9`.
- [x] **Numeric sweep:** 7 jobs consistent across §2.3 table + §5.1 matrix + plan T3 SQL + plan T4 meta-test + pg-cron-jobs.json. 5 tasks (T1-T5), 6 commits (T1, T2.1, T2.2, T3, T4, T5) consistent across spec §3 + plan 00-overview + handoff §3.
- [x] **Tier × domain completeness matrix:** §5.1 below — 7 jobs × {pg_cron jobname, schedule, pg_net call body, Vercel route handler, meta-test row, §2.3 table row}.
- [x] **CHECK/enum migration matrix:** N/A — no schema changes beyond extension enables + vault entry.
- [x] **Flag lifecycle table:** N/A — no boolean flags.
- [x] **Self-consistency sweep:** schedule strings byte-for-byte equal across `vercel.json` (HEAD `ac752d9`), §2.3 table, T3 SQL, §5.1 matrix, and `pg-cron-jobs.json`. HTTP method/verb (GET, `net.http_get`) consistent across §2.3 + §5.1 matrix + T3 SQL + T4 meta-test (R2 F6 fix re-swept the §5.1 matrix; R0 / R1-fix had left stale "POST to" + "net.http_post" rows). Vault schema (`vault.*` NOT `supabase_vault.*`) consistent across §2.3 + T2.2 + T3 + T4 + T5 (R2 F4 fix). Cross-checked by orchestrator grep 2026-05-27.
- [x] **Disagreement-loop preempt:** handoff §7 lists ratified contracts (pg_cron over GH Actions; Vault over GUC; `vercel.json` removal not retention; no handler code changes; sub-amendment dir vs M12 R71+; stop gates A+B+C do NOT carry).
- [x] **Build-vs-runtime gate explicitness:** `CRON_SECRET` is runtime-only; verified at runtime in `_auth.ts:4`. `app.fxav_vercel_url` GUC is connection-time (alter-database default); migration-time prereq-check enforces.
- [x] **Meta-test inventory:** M12.1 CREATES `tests/cross-cutting/no-vercel-cron.test.ts` + `tests/cross-cutting/pg-cron-coverage.test.ts` + `docs/.../pg-cron-jobs.json` canonical source. EXTENDS none.
- [x] **Advisory-lock holder topology:** unchanged from M12 R70 HEAD. Each cron HTTP route's lock acquisition (per AGENTS.md invariant 2 single-holder rule) is preserved; the scheduler change does not move any holder layer. The structural guard test at `tests/auth/advisoryLockRpcDeadlock.test.ts` remains binding without modification.

### §5.1 — Job × layer completeness matrix (fills self-review item above)

| Job | pg_cron jobname | Schedule | pg_net call body | Vercel route handler | Meta-test row (pg-cron-coverage) | §2.3 table row |
|---|---|---|---|---|---|---|
| Sync | `fxav_cron_sync` | `*/5 * * * *` | `net.http_get` GET `<vercel-url>/api/cron/sync` | `app/api/cron/sync/route.ts` (exports GET) | row 1 | ✅ |
| Keepalive | `fxav_cron_keepalive` | `0 12 * * *` | `net.http_get` GET `<vercel-url>/api/cron/keepalive` | `app/api/cron/keepalive/route.ts` (exports GET) | row 2 | ✅ |
| Refresh watch | `fxav_cron_refresh_watch` | `0 * * * *` | `net.http_get` GET `<vercel-url>/api/cron/refresh-watch` | `app/api/cron/refresh-watch/route.ts` (exports GET) | row 3 | ✅ |
| GC watch | `fxav_cron_gc_watch` | `15 * * * *` | `net.http_get` GET `<vercel-url>/api/cron/gc-watch` | `app/api/cron/gc-watch/route.ts` (exports GET) | row 4 | ✅ |
| Asset recovery | `fxav_cron_asset_recovery` | `*/15 * * * *` | `net.http_get` GET `<vercel-url>/api/cron/asset-recovery` | `app/api/cron/asset-recovery/route.ts` (exports GET) | row 5 | ✅ |
| Diagram GC | `fxav_cron_diagram_gc` | `30 * * * *` | `net.http_get` GET `<vercel-url>/api/cron/diagram-gc` | `app/api/cron/diagram-gc/route.ts` (exports GET) | row 6 | ✅ |
| Report reaper | `fxav_cron_report_reaper` | `0 6 * * *` | `net.http_get` GET `<vercel-url>/api/cron/report-reaper` | `app/api/cron/report-reaper/route.ts` (exports GET) | row 7 | ✅ |

**R2 F6 fix:** matrix rows above corrected from "POST to" → "`net.http_get` GET" + handler `(exports GET)` annotation. Pre-fix matrix carried stale R0 wording from before the R1 F1 http_get repair; R1 F6 caught the incomplete sweep. The matrix is binding (T3 commit text + self-review §5.11 cite it); a future amendment author must keep this matrix synchronized with the T3 SQL and the canonical `pg-cron-jobs.json`. **Pre-commit grep check (mandatory before any M12.1 commit):** `rg -n "POST to|net\.http_post" docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/` should return zero matches outside R1/R2 finding-history contexts. If any non-history match surfaces, the matrix has drifted.

---

## §6 — Out of scope

- **No M12.1 work on `cleanup-bootstrap-nonces` beyond unscheduling the orphan.** Per R25 F49: that cron's target function + table were dropped by M11.5 G3 cutover (`20260523000099_cutover_drop_m9_5.sql`) without `cron.unschedule()`. T3's idempotency block now unschedules the orphan. M12.1 does NOT re-implement nonce cleanup or signing-key rotation; those concerns live in BACKLOG.md if/when they resurface (the bootstrap-nonces table was retired with M11.5 picker pivot, so there is currently nothing to clean up).
- **No M13 launch path changes** beyond the cron architecture pivot itself. The M13 prod project will be created with Hobby tier (or Pro at the dev's later discretion) but Hobby is sufficient post-M12.1.
- **No GitHub Actions cron experimentation.** §1.1 documents the comparison; pg_cron is the chosen path.
- **No retry-semantics expansion.** pg_net's call body is fire-and-forget (the route handler's own logic owns retries, same as current Vercel Cron behavior). If `net.http_get()` itself fails (network, timeout), the next scheduled firing handles it — same semantics as Vercel Cron.

---

## §7 — Open questions for self-review / adversarial review

- Should `net.http_get()` calls have a timeout configured (default is 5s per pg_net)? Resolved in T3 SQL: **300s** per call via `timeout_milliseconds := 300000` — matches Vercel Functions' default `maxDuration` so a long-running route (notably `runScheduledCronSync` with many Drive files) doesn't trigger a premature pg_net timeout that would set `net._http_response.timed_out=true` for a still-running handler. **R6 F16 fix:** R0-R5 drafts used 30s which was shorter than the sync route's plausible runtime (sequential per-show + per-file processing with 30s per-file step timeouts at `lib/sync/runScheduledCronSync.ts`); a multi-file watched folder could exceed 30s easily. Surfaces in plan T3.
- Should the 7 `cron.schedule()` calls be in one migration or seven? Resolved: one migration, atomic; the calls do not depend on each other but a partial-apply leaves cron coverage incomplete.
- How does the (now-orphaned) `cleanup-bootstrap-nonces` cron interact with the M12.1 cron set? Resolved (R25 F49 + R26 F51): the orphan is unscheduled by T3 as a side-effect cleanup. The `fxav_cron_*` jobname prefix + LIKE-scoped unschedule preserves any FUTURE non-fxav cron added before T3 ships, but as of plan-draft time the orphan is the only non-fxav row that existed in `cron.job` and it is being explicitly removed. T4 meta-test asserts (a) snapshot-equality of the non-fxav set across T3 application (excluding the orphan from both sides — proves T3's LIKE scope is correct regardless of what other non-fxav crons exist) AND (b) `count(*) = 0 from cron.job where jobname = 'cleanup-bootstrap-nonces'` post-T3 (proves the orphan was removed).
- Structural defense pinning `jobname` → `schedule` → `route` in code (not just docs)? Resolved: yes; `pg-cron-coverage.test.ts` reads `pg-cron-jobs.json` (the canonical JSON sibling) and asserts DB state matches. The §2.3 table in this spec is a human-readable view of the same JSON.
- **Supabase Vault `create_secret()` API signature** — R2 F4 resolution amended: the function is `vault.create_secret()` (schema `vault`, not `supabase_vault`). M12.1 plan T2.2 uses the named-arg form `vault.create_secret(new_secret := ..., new_name := ..., new_description := ...)`. Per Supabase Vault docs the positional form is `vault.create_secret(new_secret text, new_name text default null, new_description text default '')`. **Implementer verifies the signature against `\df vault.create_secret` on the validation project BEFORE T2.2 commits**; adjust the migration if necessary. Marked as a verify-at-execution-time item, not a draft-time blocker.
- **`net.http_get` vs `net.http_post`** — Resolved (R1 F1 fix): `net.http_get()` is correct. The 7 route handlers at `app/api/cron/*/route.ts` export `GET` only (zero POST exports verified at HEAD `001c8e4`); `net.http_post()` would produce 405 Method Not Allowed from Next.js. R0 draft used `http_post`; R1 codex finding F1 (HIGH, conf 0.97) caught the mismatch; R1 repair updated all 7 schedule call bodies in T3 SQL + spec §2.3 + spec §3 + T4 meta-test contract (asserts `command` contains `net.http_get(`, NOT `net.http_post(`).
- **`net` vs `pg_net` schema** — Resolved: `net.http_get()` is correct. pg_net installs functions in the `net` schema; `pg_net.http_get` would return "function does not exist". Cited in §2.3 amended text + T3 SQL.
