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

> 3. **Cron + Drive integration.** A fixture sheet placed in the prod-tier Drive watched folder is detected by the cron path (`pg_cron` schedule → `pg_net.http_post()` with `Authorization: Bearer $CRON_SECRET` → Vercel route handler `/api/cron/sync` → fetch from Drive service account → parse → propagate) within one cron interval. The new show appears in `/admin` Active Shows panel. Verifies: pg_cron schedule firing + pg_net HTTP reach to Vercel route + handler auth pass + Drive service-account credentials + parser end-to-end + DB write under per-show advisory lock. **M12.1 amendment (2026-05-26):** the firing surface pivoted from Vercel Cron to Supabase pg_cron + pg_net. Observability moved: verify firings via `select * from cron.job_run_details where jobname = 'fxav_cron_sync' order by start_time desc limit 5;` (returns one row per pg_cron firing with command status); the Vercel side observability is the route handler's normal application logs (Vercel Logs tab) — cron-tagged structured log entries appear there as they always did, just initiated by pg_net rather than Vercel-Cron infrastructure.

### §2.3 — Additive new section in M12 spec §9.X — cron architecture (post-§9.1.2, pre-§9.2)

Insert as new §9.1.3 (or wherever the M12 amendment editor judges fit; numbering is a plan-detail). Suggested heading: **§9.1.3 Cron scheduling architecture (M12.1 amendment, 2026-05-26)**.

> Cron jobs fire from Supabase `pg_cron`, not Vercel Cron. The 7 schedules currently declared in `vercel.json` (status quo) are replaced by 7 equivalent `cron.schedule()` calls in a new migration. Each schedule's body is a `pg_net.http_post()` call to the corresponding `*.vercel.app/api/cron/<path>` route, with the `Authorization: Bearer <CRON_SECRET>` header sourced from `supabase_vault.secrets`.
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
> **Auth contract:** the Vercel route handlers continue to use `app/api/cron/_auth.ts` `rejectUnauthorizedCron` (unchanged from M12 R70 HEAD — verified at `app/api/cron/_auth.ts:3-12`). `net.http_post()` (pg_net installs its functions in the `net` schema, NOT `pg_net`) includes the header `{ "Authorization": "Bearer <CRON_SECRET>" }` where `<CRON_SECRET>` is sourced inside the cron job body via `select decrypted_secret from supabase_vault.decrypted_secrets where name = 'fxav_cron_secret'`. Vault is preferred over a Postgres GUC because (a) encrypted at rest, (b) rotation does not require re-deploying a migration, (c) isolates secret value from `pg_settings` visibility. **Vault availability:** `supabase_vault` ships on all Supabase project tiers including free — verify via `\dn supabase_vault` after project provisioning; if absent, escalate to user (Supabase tier change in flight) before proceeding with T2.2.
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
- **M12.1.T3 — 7× `cron.schedule()` migration.** One migration with 7 `cron.schedule()` calls per §2.3 table. Each call body reads the vault secret and `net.http_post()`s the corresponding route.
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
- [x] **Self-consistency sweep:** schedule strings byte-for-byte equal across `vercel.json` (HEAD `ac752d9`), §2.3 table, T3 SQL, §5.1 matrix, and `pg-cron-jobs.json`. Cross-checked by orchestrator grep 2026-05-26.
- [x] **Disagreement-loop preempt:** handoff §7 lists ratified contracts (pg_cron over GH Actions; Vault over GUC; `vercel.json` removal not retention; no handler code changes; sub-amendment dir vs M12 R71+; stop gates A+B+C do NOT carry).
- [x] **Build-vs-runtime gate explicitness:** `CRON_SECRET` is runtime-only; verified at runtime in `_auth.ts:4`. `app.fxav_vercel_url` GUC is connection-time (alter-database default); migration-time prereq-check enforces.
- [x] **Meta-test inventory:** M12.1 CREATES `tests/cross-cutting/no-vercel-cron.test.ts` + `tests/cross-cutting/pg-cron-coverage.test.ts` + `docs/.../pg-cron-jobs.json` canonical source. EXTENDS none.
- [x] **Advisory-lock holder topology:** unchanged from M12 R70 HEAD. Each cron HTTP route's lock acquisition (per AGENTS.md invariant 2 single-holder rule) is preserved; the scheduler change does not move any holder layer. The structural guard test at `tests/auth/advisoryLockRpcDeadlock.test.ts` remains binding without modification.

### §5.1 — Job × layer completeness matrix (fills self-review item above)

| Job | pg_cron jobname | Schedule | pg_net call body | Vercel route handler | Meta-test row (pg-cron-coverage) | §2.3 table row |
|---|---|---|---|---|---|---|
| Sync | `fxav_cron_sync` | `*/5 * * * *` | POST to `<vercel-url>/api/cron/sync` | `app/api/cron/sync/route.ts` | row 1 | ✅ |
| Keepalive | `fxav_cron_keepalive` | `0 12 * * *` | POST to `<vercel-url>/api/cron/keepalive` | `app/api/cron/keepalive/route.ts` | row 2 | ✅ |
| Refresh watch | `fxav_cron_refresh_watch` | `0 * * * *` | POST to `<vercel-url>/api/cron/refresh-watch` | `app/api/cron/refresh-watch/route.ts` | row 3 | ✅ |
| GC watch | `fxav_cron_gc_watch` | `15 * * * *` | POST to `<vercel-url>/api/cron/gc-watch` | `app/api/cron/gc-watch/route.ts` | row 4 | ✅ |
| Asset recovery | `fxav_cron_asset_recovery` | `*/15 * * * *` | POST to `<vercel-url>/api/cron/asset-recovery` | `app/api/cron/asset-recovery/route.ts` | row 5 | ✅ |
| Diagram GC | `fxav_cron_diagram_gc` | `30 * * * *` | POST to `<vercel-url>/api/cron/diagram-gc` | `app/api/cron/diagram-gc/route.ts` | row 6 | ✅ |
| Report reaper | `fxav_cron_report_reaper` | `0 6 * * *` | POST to `<vercel-url>/api/cron/report-reaper` | `app/api/cron/report-reaper/route.ts` | row 7 | ✅ |

---

## §6 — Out of scope

- **No prod migration of the bootstrap-nonces signing-key cron.** It already uses `cron.schedule()` (line 36) and is not in the `vercel.json` crons block; it's an independent pg_cron job. Untouched.
- **No M13 launch path changes** beyond the cron architecture pivot itself. The M13 prod project will be created with Hobby tier (or Pro at the dev's later discretion) but Hobby is sufficient post-M12.1.
- **No GitHub Actions cron experimentation.** §1.1 documents the comparison; pg_cron is the chosen path.
- **No retry-semantics expansion.** pg_net's call body is fire-and-forget (the route handler's own logic owns retries, same as current Vercel Cron behavior). If `pg_net.http_post()` itself fails (network, timeout), the next scheduled firing handles it — same semantics as Vercel Cron.

---

## §7 — Open questions for self-review / adversarial review

- Should `net.http_post()` calls have a timeout configured (default is none)? Resolved in T3 SQL: 30s per call via `timeout_milliseconds := 30000`. Matches the longest expected sync run; surfaces in plan T3.
- Should the 7 `cron.schedule()` calls be in one migration or seven? Resolved: one migration, atomic; the calls do not depend on each other but a partial-apply leaves cron coverage incomplete.
- How does the bootstrap signing-key cron interact with the M12.1 cron set? Resolved: independent; both run in `cron.job`. No interaction; the `fxav_cron_*` jobname prefix avoids any collision with the existing bootstrap-job name. T4 meta-test asserts non-fxav cron count > 0 (preservation invariant).
- Structural defense pinning `jobname` → `schedule` → `route` in code (not just docs)? Resolved: yes; `pg-cron-coverage.test.ts` reads `pg-cron-jobs.json` (the canonical JSON sibling) and asserts DB state matches. The §2.3 table in this spec is a human-readable view of the same JSON.
- **Supabase Vault `create_secret()` API signature** — the M12.1 plan T2.2 uses `supabase_vault.create_secret(new_secret := ..., new_name := ..., new_description := ...)` named-arg form. Per Supabase docs the function is `vault.create_secret(secret_value text, name text, description text)` (positional) OR the named-arg form, depending on Supabase version. **Implementer verifies the signature against `\df supabase_vault.create_secret` on the validation project BEFORE T2.2 commits**; adjust the migration if necessary. Marked as a verify-at-execution-time item, not a draft-time blocker.
- **`net.http_post` vs `pg_net.http_post`** — Resolved: `net.http_post()` is correct. pg_net installs functions in the `net` schema; `pg_net.http_post` would return "function does not exist". Cited in §2.3 amended text + T3 SQL.
