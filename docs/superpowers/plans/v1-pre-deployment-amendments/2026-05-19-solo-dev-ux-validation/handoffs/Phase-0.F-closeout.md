# Phase 0.F close-out — manual smoke walk (interactive co-pilot)

**Date:** 2026-05-28 → 2026-05-29. **Env:** validation deploy `https://fxav-crew-pages-validation.vercel.app` + Supabase `vzakgrxqwcalbmagufjh`. **Main HEAD at close:** `84b6b41` (+ `fix/screenshots-drift-guc` merging — see Open items). **Mode:** orchestrator drove programmatic legs (CLIs, SQL via service-role REST, Vercel logs, DB verification); user drove physical legs (OAuth, real-device renders, Drive actions).

## Smoke results

| # | Smoke | Result | Evidence |
|---|-------|--------|----------|
| 1 | Admin sign-in | ✅ PASS | Google OAuth → `/me`; `/admin` renders |
| 2 | Share-link + picker (S24 real device) | ✅ PASS | `/show/<slug>/<token>` picker renders + crew page |
| 3 | Cron + Drive → onboarding publish | ✅ PASS | Doug's real folder onboarded end-to-end: `shows` 16→22 (6 real-folder shows published, correct date-slugs + jsonb), watched_folder promoted, staging consumed, all in Active Shows |
| 4 | Admin alert (MI-6) + AlertBanner | ✅ DISPOSITIONED (PASS-via-equivalent) | AlertBanner render surface proven via smoke 7 + 4 live sync-staged alerts on `/admin/show/validation-r1`; MI-6 `>1`-crew-drop logic unit-tested (`lib/parser/invariants.ts:237`). Faithful in-env MI-6 trigger deferred to Phase 1 (onboarded shows parsed 0 crew; R-fixtures aren't Drive-backed) |
| 5 | Wall-clock + fixture-data clock control | ✅ PASS | (Phase 0.C/0.E era) |
| 6 | Picker round-trip + Rotate | ✅ PASS | Single-tap pick; two-tap rotate; `picker_epoch` 2→3 + token rotated atomically (`rotate_show_share_token`); old URL → branded `PICKER_SHOW_UNAVAILABLE`; new URL + `epoch_stale` banner |
| 7 | Report-fixtures harness round-trip (REQUIRED) | ✅ PASS | Band F INCLUDED → harness exit 0 → AlertBanner rendered `REPORT_LOOKUP_INCONCLUSIVE` (human copy) → cleanup 0 `m12-fixture-%` rows across all 3 tables |

## Onboarding defect cluster (smoke 3) — 5 bugs, all FIXED + deployed

Smoke 3's manual walk surfaced a 5-bug M10-onboarding-quality cluster — all crash-on-render / finalize-blockers invisible to mock-based unit tests, all closed:

1. **`.staged` scan-contract crash** (`8b49d83`) — shared `lib/onboarding/scanResponse.ts`.
2. **`triggeredReviewItems.some is not a function`** jsonb-coercion crash across 3 staged-review pages (`e707db3`→`46bef64`→`99110f4`) — shared `lib/staging/triggeredReviewItems.ts`.
3. **Deploy mechanism** — `vercel redeploy` rebuilt stale source; git-connected the Vercel project (push=deploy).
4. **`STAGED_PARSE_REVISION_RACE` false-positive** (`800a430`+`e2864f4`+`16f2bc8`+`3ca0be9`+`4880f27`) — root cause `Date.parse(<Date>)` drops ms; postgres.js returns timestamptz as Date. Compare-by-instant fix + 3 class-swept peers + CI meta-test + real-DB e2e.
5. **finalize-publish 500** (`800a430`-era → `84b6b41`, 10 commits) — `parse_result` stored double-encoded (jsonb string scalar) because `JSON.stringify(obj)` was passed to a `$N::jsonb` param and **postgres.js serializes that param itself**. Comprehensive postgres.js DB-boundary sweep (all `JSON.stringify→$N::jsonb` writes → raw) + fail-closed `asParseResult` coercer + never-empty-500 wrappers on 4 publish routes (new §12.4 codes `ONBOARDING_FINALIZE_INTERNAL_ERROR` + `STAGED_PARSE_RESULT_CORRUPT`) + crew-page read coercion + CI meta-test + real apply→publish e2e. Non-onboarding/cron publish was affected too (shared read) and fixed. Codex R9 APPROVE.

Bugs 4+5 are the same family (postgres.js DB-boundary representation mismatch, mock-invisible, real-DB-only) → triggered a comprehensive DB-boundary audit per AGENTS.md same-vector-recurrence discipline.

## Carried findings (non-blocking for Phase 0; address before M13 launch)

- **MEDIUM — realtime subscriber-token 500.** `/api/realtime/subscriber-token` 500s on validation; dashboard shows the graceful-degradation banner *"A push subscription couldn't be confirmed. We'll fall back to cron until it's resolved."* Likely `SUPABASE_JWT_SECRET` / `SUPABASE_REALTIME_ISS` unset in Vercel Production scope. Degrades correctly to cron (fail-open), so non-blocking — but a real prod-env-config gap. → **M13 prep env-config pass.**
- **MEDIUM — cron 401+200 pairing.** Each cron interval logs a paired 401 + 200 on `/api/cron/sync`. Likely a duplicate job or stale bearer. Non-blocking (the 200 does the work). → **M13 prep.**
- **`NEXT_PUBLIC_SITE_ORIGIN` (prod).** Set in validation; must be set in the M13 prod Vercel project (build-time inlined). Documented in `.env.local.example`.

## Phase 1 carry (real-data parser accuracy)

- **Onboarded shows parsed 0 crew.** All 6 of Doug's real-folder shows published with 0 `crew_members` — the crew-roster section format in the real sheets isn't parser-recognized. Phase 1 matrix walk validates real crew/roster parsing.
- **`MI-3_NO_VALID_DATES` on "East Coast Single Family Office Symposium".** A real-looking show sheet failed date parsing (dates in title, not in parser-read cells). Phase 1 parser-accuracy.
- **MI-6 in-env trigger** (deferred from smoke 4) — exercise on real crew data in Phase 1.

## Open items

- **`fix/screenshots-drift-guc` merging to main** (task #13). Pre-existing 3-stacked CI breakage on the `screenshots-drift` workflow (last green 2026-05-24, pre-M12.1): (1) M12.1 cron-migration GUC guard, (2) `HASH_FOR_LOG_PEPPER` build env, (3) stale `crew_member_auth` seed insert (M11.5 cutover dropped the table). All land-now mechanical infra/seed/test-config fixes; verified green on real CI (run 26643330882). NOT a regression from any Phase-0 work. Merge clears main-branch red + unblocks future PRs.

## Disposition

Phase 0.F close-out gates (Task 0.F.8) all satisfied: Step 1 (smokes 1-7 resolved) ✓; Step 1a (deferred structural defenses `validation-tooling-tz-pin` + `email-canonicalization` green, 19/3) ✓; Step 2 (budget gate — ~2 calendar days, well under 10) ✓. **Phase 0 CLOSED. Proceed to Phase 1** (`06-phase1-matrix-walk.md`).
