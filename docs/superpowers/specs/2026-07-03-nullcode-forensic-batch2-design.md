# BL-NULLCODE-STAMP-BATCH-2 — forensic code stamps on 35 null-code log sites — Design

**Date:** 2026-07-03
**Branch / worktree:** `fix/nullcode-forensic-batch2` @ `/Users/ericweiss/fxav-nullcode-batch2` (off `origin/main` `2aeb778e`)
**Lineage:** the residual of audit #4 / PR-2 (#245) — `BL-NULLCODE-STAMP-BATCH-2`.
**Autonomous-ship:** user-approved; both user-review gates WAIVED. Spec self-review + Codex adversarial-review to APPROVE still run.

---

## 1. Problem & goal

35 `log.error` / `log.warn` call sites persist to `app_events` (error+warn ALWAYS persist, code-independent) but carry **no `code:` field**, so they land as null-code rows: forensically un-queryable and un-groupable. This batch stamps each with a durable, discriminable **forensic code** — a pure observability enrichment.

**Goal:** add a `code: "<SHOUTY_SNAKE>"` field to the existing fields object of each of the 35 calls, and register all 35 in the `NEW_FORENSIC_CODES` set of `tests/log/_metaAdminOutcomeContract.test.ts`.

**Zero behavior change:** the stamp adds one field to an object already passed to `log.error`/`log.warn`. No control flow, no response, no rendering, no new emission changes. The log already fired; it now carries a code.

---

## 2. Why these are strip-exempt (no §12.4 work)

`stripLogEmissionCalls` removes every `log.*()` / `logAdminOutcome()` span **before** `codeProducerLiterals()` scans for §12.4 producers (`PRODUCER_RE` = `code:` literals). A `code:` inside a `log.error(...)`/`log.warn(...)` call is therefore invisible to the producer scan → it is **not** a §12.4 producer and needs **no** catalog row, no `gen:spec-codes`, no help page, no `_families`, no `trustDomains`. The sole registry is `NEW_FORENSIC_CODES`, whose **Assertion 4** proves none of these codes leak into the producer set (`[...NEW_FORENSIC_CODES].filter(c => producers.has(c))` must be `[]`, meta-test `:243-246`).

**Untouched CI gates (state explicitly to preempt relitigation):** `x1-catalog-parity`, `x2-no-raw-codes`, help `_families`, `_metaAdminAlertCatalog`, `_metaEmphasisRenderContract`, `trustDomains`. Only `_metaAdminOutcomeContract` (Assertions 3 + 4) is touched. The FULL suite still runs before push (source-scanning meta-tests).

---

## 3. Scope — the 35 sites (current lines, `2aeb778e`)

Re-verified against the current base (PRs #247/#249 merged): all 35 still exist, still lack a `code:`. 3 are `warn`, 32 are `error`. No new/removed sites.

### 3.1 `app/api/**` (20 sites)
| file:line | lvl | forensic code |
|---|---|---|
| `app/api/observe/client-error/route.ts:104` | warn | `CLIENT_ERROR_MIRROR_RATE_CAPPED` |
| `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts:84` | error | `IGNORED_SHEET_UNIGNORE_FAILED` |
| `app/api/admin/staged/[fileId]/discard/route.ts:38` | error | `LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED` |
| `app/api/admin/staged/[fileId]/discard/route.ts:49` | error | `LIVE_STAGED_DISCARD_GETUSER_THREW` |
| `app/api/admin/staged/[fileId]/discard/route.ts:53` | error | `LIVE_STAGED_DISCARD_GETUSER_FAILED` |
| `app/api/admin/onboarding/reap-stale-sessions/route.ts:62` | error | `REAP_STALE_SESSIONS_INFRA_FAILED` ⚠️ (renamed — §4) |
| `app/api/admin/show/staged/[stagedId]/apply/route.ts:193` | error | `LIVE_STAGED_APPLY_FAILED` |
| `app/api/admin/staged/[fileId]/apply/route.ts:185` | error | `LIVE_STAGED_APPLY_SNAPSHOT_PROMOTION_FAILED` |
| `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts:267` | error | `WIZARD_IGNORE_SUPERSEDED_ALERT_WRITE_FAILED` |
| `app/api/admin/onboarding/finalize-cas/route.ts:884` | error | `FINALIZE_CAS_UNEXPECTED_FAILURE` |
| `app/api/admin/onboarding/finalize-cas/route.ts:966` | error | `FINALIZE_CAS_STREAM_UNEXPECTED_FAILURE` |
| `app/api/admin/onboarding/finalize/route.ts:1339` | error | `FINALIZE_UNEXPECTED_FAILURE` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:230` | error | `WIZARD_STAGED_APPLY_SUPERSEDED_ALERT_WRITE_FAILED` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:243` | error | `WIZARD_STAGED_APPLY_FAILED` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts:283` | error | `WIZARD_STAGED_APPROVE_FAILED` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts:172` | error | `WIZARD_STAGED_UNAPPROVE_FAILED` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts:170` | error | `WIZARD_STAGED_DISCARD_SUPERSEDED_ALERT_WRITE_FAILED` |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts:181` | error | `WIZARD_STAGED_DISCARD_FAILED` |
| `app/api/admin/onboarding/scan/route.ts:277` | error | `ONBOARDING_SCAN_FAILED` |
| `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:555` | error | `PENDING_INGESTION_RETRY_SUPERSEDED_ALERT_WRITE_FAILED` |

### 3.2 `app/` non-api — UI-Opus (10 sites)
| file:line | lvl | forensic code |
|---|---|---|
| `app/admin/actions.ts:83` | error | `ADMIN_RESOLVE_CANONICAL_EMAIL_NULL` |
| `app/admin/show/[slug]/page.tsx:154` | error | `ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED` |
| `app/admin/show/[slug]/page.tsx:171` | error | `ADMIN_SHOW_LOOKUP_FAILED` |
| `app/admin/show/[slug]/page.tsx:177` | error | `ADMIN_SHOW_LOOKUP_THREW` |
| `app/admin/show/[slug]/page.tsx:221` | error | `ADMIN_SHOW_CHANGE_FEED_READ_FAILED` |
| `app/admin/show/[slug]/page.tsx:240` | error | `ADMIN_SHOW_CREW_LOOKUP_FAILED` |
| `app/admin/show/[slug]/page.tsx:248` | error | `ADMIN_SHOW_CREW_LOOKUP_THREW` |
| `app/admin/show/[slug]/page.tsx:291` | error | `ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_FAILED` |
| `app/admin/show/[slug]/page.tsx:299` | error | `ADMIN_SHOW_INTERNAL_PARSE_WARNINGS_READ_THREW` |
| `app/show/[slug]/[shareToken]/_CrewShell.tsx:168` | warn | `CREW_PROJECTION_ALERT_UPSERT_FAILED` |

### 3.3 `lib/**` (5 sites)
| file:line | lvl | forensic code |
|---|---|---|
| `lib/auth/picker/selectIdentity.ts:56` | warn | `PICKER_IDENTITY_CLAIMED_TAMPER` |
| `lib/admin/loadAppEvents.ts:53` | error | `APP_EVENTS_READ_RETURNED_ERROR` |
| `lib/admin/loadAppEvents.ts:67` | error | `APP_EVENTS_READ_THREW` |
| `lib/admin/loadCronHealth.ts:53` | error | `CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR` |
| `lib/admin/loadCronHealth.ts:60` | error | `CRON_HEALTH_APP_EVENTS_READ_THREW` |

**Line numbers are advisory** — the implementer relocates each site by its **message string + surrounding catch/function context** (anchors captured in the plan), not by line, since drift is possible.

---

## 4. The one producer collision — `reap-stale-sessions`

`REAP_STALE_SESSIONS_FAILED` already exists as a **§12.4 producer** (`lib/messages/catalog.ts:184-195`) and the reap route both logs null-code at `:62` AND returns `errorResponse(500, "REAP_STALE_SESSIONS_FAILED")` at `:63`. Stamping the log with the literal `REAP_STALE_SESSIONS_FAILED` and adding it to `NEW_FORENSIC_CODES` would **fail Assertion 4** (the name is in `codeProducerLiterals()`). **Resolution: the forensic log code is `REAP_STALE_SESSIONS_INFRA_FAILED`** (verified absent from catalog + meta-test) — distinct from the returned producer, so the response contract is unchanged and the log gains a discriminable forensic code. The other 34 proposed codes have **zero** collisions (verified against `catalog.ts`, `SANCTIONED_CODES`, `NEW_FORENSIC_CODES`).

---

## 5. Excluded adjacent sites (do NOT touch — preempt reviewer confusion)

Four `log.error`/`warn` calls in these same files ALREADY carry a `code:` and are correctly **out of scope**:
- `app/api/admin/staged/[fileId]/apply/route.ts:30/45/53` — the readAdminEmail trio already has `code: "LIVE_STAGED_APPLY_LOOKUP_FAILED"` (meta-test `:192`). This is the **apply**-route mirror of the **discard**-route trio (§3.1 sites 3-5, which ARE still null-code). Do not conflate.
- `finalize-cas/route.ts:805/807` — per-row hard-fail, `code: result.code` (severity-routed, strip-exempt already).
- `finalize/route.ts:1323/1325` — per-row hard-fail, `code: failure.code`.
- `pending_ingestions/[id]/retry/route.ts:566` — `code: "PENDING_INGESTION_ACTION_FAILED"` (meta-test `:169`). The same file's `:555` superseded-alert-write IS null-code and IS in scope (§3.1 site 20).

---

## 6. Special-case call shapes

- **`selectIdentity.ts:56`** — the message arg is `JSON.stringify({event:"picker.identity_claimed", tamper:true, …})`; the fields object is the **2nd** arg (carries `source: "auth.picker.selectIdentity"`). The `code:` goes in that 2nd-arg fields object, NOT inside the stringified blob. It stays a `log.warn` (forensic-only; no `admin_alerts` upsert added — this batch is pure code-stamping, the alerting decision is out of scope and noted in BACKLOG if wanted later).
- **`_CrewShell.tsx:168`** — fail-quiet projection-alert upsert `log.warn`; `code:` added to its fields object.
- **`scan/route.ts:277`** — SSE-stream catch `log.error`; add `code: "ONBOARDING_SCAN_FAILED"`. The adjacent SSE body separately emits `code:null` to the client (`:282`) — that is a **separate user-facing surface**, out of scope for this forensic batch → BACKLOG item `BL-SCAN-SSE-BODY-NULL-CODE` (§9). Do not conflate the two.
- **All others** — a `code: "X"` key is added to the existing fields object literal (the object already containing `source:` and often `error:`).

---

## 7. UI-Opus disposition (impeccable dual-gate RUNS on the app/ non-api subset)

The 10 §3.2 sites are `app/` non-api files → **UI surface by the path-based definition of invariant 8** (any file under `app/` except `app/api/**`). Invariant 8 is a hard constraint (P0 regardless of test status), and this spec does **not** claim an unciteable exception. Therefore:

- **The impeccable v3 dual-gate RUNS** on the affected `app/` non-api diff: `/impeccable critique` AND `/impeccable audit`, with the canonical v3 preflight (PRODUCT.md → DESIGN.md → register → preflight signal). HIGH/CRITICAL findings are fixed or explicitly `DEFERRED.md`-logged. Dispositions land in the PR body + handoff, per invariant 8.
- **Expected outcome:** both gates pass with no HIGH/CRITICAL, because the change adds only a server-side `code:` field inside an RSC-loader catch (`page.tsx`), a Server-Action guard (`actions.ts`), and a fail-quiet upsert (`_CrewShell.tsx`) — **zero rendering delta** (no JSX/DOM/CSS/token/copy change). The gate is run to honor the invariant's letter, and its clean result is the recorded disposition — not an a-priori "N/A" claim.
- **Authorship:** Opus owns these edits (this session + its own subagent); no Codex UI authorship, per the routing rule.

This is the correct autonomous posture: run the required gate rather than assert it away. (Empirically the critique/audit will have no rendering surface to flag; that clean result is what ships.)

---

## 8. Test surface (TDD)

The change is a pure registry + field addition; the **structural meta-test IS the test**.

### 8.1 `tests/log/_metaAdminOutcomeContract.test.ts` — the registry + per-site structural guard (EXTENDED)

Two additions to the meta-test:

**(a) Registry membership.** Add all 35 forensic codes to `NEW_FORENSIC_CODES` (meta-test `:134`). **Assertion 4** (`:243-246`) then proves none leak into `codeProducerLiterals()` — a code that's secretly a §12.4 producer fails here. These are `log.error`/`warn` codes, NOT `logAdminOutcome` → **zero** additions to `SANCTIONED_CODES` and **zero** to `AUDITABLE_MUTATIONS`.

**(b) Per-site "inside-a-log-span" structural guard (closes Codex spec-R1/R2 HIGH — class-closing, all 35).** Add a `NULLCODE_BATCH2_STAMPS: ReadonlyArray<{ file: string; code: string }>` registry (35 rows). Import the canonical `stripLogEmissionCalls` from `@/lib/messages/__internal__/stripLogEmissionCalls` (already used by sibling tests `tests/cross-cutting/codes.test.ts`, `tests/messages/catalog.test.ts`). It removes every `log.error|warn|info|debug( … )` / `logAdminOutcome( … )` span with balanced-paren + string/comment awareness. For **every** row, read the file's source `src` and assert:

1. `src` contains the code literal `"<CODE>"` — the stamp exists; AND
2. `stripLogEmissionCalls(src)` does **NOT** contain `"<CODE>"` — i.e. the literal is **exclusively inside a `log.*()` span**. A code placed in a comment, a constant, an adjacent object, or any non-log position **survives** stripping → the assertion fails.

This is strictly stronger than "file contains `code:` somewhere + a log call somewhere" (the R2 gap): it proves each of the 35 codes is *inside a log emission span*, per-site, reusing the project's canonical span-identifier (not fragile custom parsing). Because each forensic code is unique and appears exactly once, and each must sit inside a log span, the presence-check (1) + inside-span-check (2) together pin each code to a real null-code-fixing log call.

**Why (b) also settles "wrong argument" for 34 of 35:** a `code:` in the stamp form is an **object property**, and for 34 sites the `log.*()` message arg is a plain string literal — so a `code:` property inside the log span can only be the *fields* object (the 2nd arg). Structural placement therefore equals correct placement for those 34. The **sole exception is `selectIdentity.ts:56`**, whose message arg is `JSON.stringify({…})` — an object literal that could itself carry a `code:` — so (b) alone can't tell the fields arg from the blob there; that one site is covered at runtime in §8.2.

Cross-guard: assert the `NULLCODE_BATCH2_STAMPS` code set == the 35 codes added to `NEW_FORENSIC_CODES` in (a) (no drift), and all 35 are distinct.

### 8.2 Runtime emission tests (proves the code reaches the sink in the fields arg)
On top of the structural guard, assert at runtime that the stamped code reaches `log`'s fields argument:
- **`selectIdentity.ts:56` (REQUIRED — the one site (b) can't fully pin):** drive the `PICKER_IDENTITY_CLAIMED` tamper branch; spy on `log.warn` and assert it was called with a **fields object** (2nd arg) containing `code: "PICKER_IDENTITY_CLAIMED_TAMPER"` — NOT inside the `JSON.stringify` message. This is the decisive test for the fields-vs-message ambiguity.
- **`loadAppEvents` + `loadCronHealth`** (lib, easily unit-testable): force the returned-error and thrown paths; assert `log.error` called with `code: "APP_EVENTS_READ_RETURNED_ERROR"` / `_THREW` / `CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR` / `_THREW` in its fields arg.
- **`reap-stale-sessions`**: force the catch; assert `log.error` called with `code: "REAP_STALE_SESSIONS_INFRA_FAILED"` AND the response body still returns the unchanged `REAP_STALE_SESSIONS_FAILED` producer (proves the rename didn't alter the response contract).
- Concrete failure modes caught: (selectIdentity) a code buried in the stringified message instead of the fields arg; (loaders) a registry entry with no real emission; (reap) the rename leaking into the response code.

### 8.3 Full-suite gate
Run the FULL vitest suite before push (source-scanning meta-tests: `_metaAdminOutcomeContract`, `codeProducers`, and any `code:`-scanning gate). Typecheck (`pnpm typecheck`) before push (vitest strips types).

### 8.4 Meta-test inventory
**EXTENDS** `tests/log/_metaAdminOutcomeContract.test.ts` (35 new `NEW_FORENSIC_CODES` entries). No new meta-test file. (Declared per AGENTS.md meta-test-inventory rule.)

---

## 9. Out of scope → BACKLOG

- `BL-SCAN-SSE-BODY-NULL-CODE` — `scan/route.ts:282` SSE result body emits a user-facing `code:null`; arguably warrants a real §12.4 code so the client can catalog-look-up. Separate user-facing surface + expensive 3-way; deferred (§6).
- `BL-PICKER-TAMPER-ADMIN-ALERT` — whether `selectIdentity.ts:56` (a security/tamper breadcrumb) should ALSO raise an `admin_alerts` upsert, not just a forensic log. This batch is forensic-only (§6); the alerting decision is deferred.

---

## 10. Guard conditions & self-consistency

- **No behavior change:** every edit adds exactly one `code:` field to an existing fields object. No new `log.*` call, no removed field, no control-flow change. (The reap rename does NOT touch the returned `errorResponse` code.)
- **AGENTS.md invariants:** no advisory-lock change; no PostgREST-DML change; **no raw error code in UI** — these codes are never rendered (they're `app_events` columns; §7).
- **Numeric sweep:** 35 sites total (20 app/api + 10 UI-Opus + 5 lib); 3 warn + 32 error; 35 new `NEW_FORENSIC_CODES`; 0 `SANCTIONED_CODES`; 0 `AUDITABLE_MUTATIONS`; 1 rename (reap); 4 excluded-adjacent sites; 2 BACKLOG items. Cross-referenced in §3, §4, §5, §8, §9.
