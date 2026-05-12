# Handoff — M8: Bug-report pipeline (AC-8.1..AC-8.13)

**Handed off:** 2026-05-12 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — §A pipeline = GPT-5.5 / Codex CLI; §B `ReportButton` UI = Opus 4.7 / Claude Code. Two concurrent terminals coordinating through this doc.
**Adversarial reviewer:** Opus 4.7 / Claude Code (per ROUTING.md M8 row — backend-heavy milestone, weaker reviewer side; compensate with the meta-test pre-declaration in §13 and the convergence-loop iteration rule in §10).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/08-bug-report.md`

> M8 is the §13.2.3 epic: idempotent `/api/report` submission, atomic quota reservation, GitHub Issues integration, lock-free retry with fail-closed recovery, `lease_holder` ownership protocol, and a daily reaper aligned with the `created_at` horizon. Three ratified spec amendments live here (§3 below); the spec patch already landed during plan-loop rounds 24+. M8's job is to ship the runtime that satisfies them and pin them with structural meta-tests so the contracts survive future edits.

---

## 0. Implementer split (split-mode milestone)

Per ROUTING.md M8 row: "split-mode: GPT-5.5 / Codex (pipeline) + Opus 4.7 / Claude Code (ReportButton)." Almost all of M8 is invariant-dense backend; the UI surface is a single button + modal. **M8 is asymmetric enough that two pin-stops would be over-engineered.** One pin-stop, late and final.

### §A — backend tasks (Codex; ship first; UI consumes these contracts)

- **Task 8.1** — `lib/reports/leaseProtocol.ts` + `tests/db/reports-schema.test.ts`. Lease-ownership helpers (acquire / extend / release, idempotency-key dedup). Schema gate test verifies M2-shipped columns (`idempotency_key uuid NOT NULL` with unique index, `processing_lease_until timestamptz`, `lease_holder uuid` with partial-not-null index). If any column is missing, fix Task 2.2 — DO NOT add a parallel migration here.
- **Task 8.2** — `lib/github/issues.ts` + `tests/github/issues.test.ts`. Octokit wrapper: `createIssue` (with the `fxav-app:report` reserved-label append + `CreatedIssue` normalized shape), `findIssueByMarker(idempotencyKey, cutoffIso)` against `octokit.rest.issues.listForRepo` (creator + since + state + reserved-label filter, paginated to exhaustion, 1000-page sanity cap), `LookupInconclusive` discriminated error class with six codes (`BOT_LOGIN_MISSING`, `PAGINATION_ERROR`, `PAGINATION_BOUND`, `SHAPE_ERROR`, `DUPLICATE_LIVE_MATCHES`, `OPEN_ISSUE_WITH_ORPHAN_LABEL`).
- **Task 8.3** — `app/api/report/route.ts` + `lib/reports/submit.ts` + `tests/reports/auth.test.ts`. Route skeleton, auth dispatch via `validateLinkSession` / `validateGoogleSession` / `requireAdmin`, 401 on triple-rejection, 501 stub for downstream layering.
- **Task 8.3a** — `lib/reports/rateLimit.ts` + modify `lib/reports/submit.ts` + `tests/reports/quota.test.ts`. Atomic UPSERT (`INSERT .. ON CONFLICT (kind, identity, hour_bucket) DO UPDATE SET count = count + 1 RETURNING count`); 11th admin / 4th crew → 429 with `REPORT_RATE_LIMITED_ADMIN` / `REPORT_RATE_LIMITED_CREW` (AC-8.3, AC-8.6, AC-8.10).
- **Task 8.3b** — modify `lib/reports/submit.ts` + `tests/reports/happyPath.test.ts` + `tests/reports/firstSubmitRace.test.ts`. Conflict-safe reservation: `INSERT .. ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, lease_holder`; INSERT-first, quota-on-claim; lease_holder UUID stamped at reservation; tail UPDATE fenced with `AND lease_holder = $myToken`; the shared `handleTailUpdateMiss(key, newIssue, myLeaseHolder, fallbackShowId)` helper implements Cases A/B/C/Reaped (AC-8.1..8.5, AC-8.9).
- **Task 8.3c** — modify `lib/reports/submit.ts` + `lib/github/issues.ts` + `tests/reports/retry5xx.test.ts`. AC-8.11 coverage + lock-free transaction-boundary contract (NO `SELECT FOR UPDATE`; GitHub I/O happens between transactions, never inside one). Implementation lives in 8.3e; this task contributes the contract assertions.
- **Task 8.3d** — modify `lib/github/issues.ts` + `.env.local.example` + `tests/reports/unknownOutcome.test.ts` + `tests/reports/lookupFailClosed.test.ts`. Single authoritative recovery primitive (`findIssueByMarker` via `listForRepo`); fail-closed on `LookupInconclusive`; six discriminator codes route to dedicated `admin_alerts` codes per the routing table (`GITHUB_BOT_LOGIN_MISSING` global, `REPORT_DUPLICATE_LIVE_MATCHES` per-show, `REPORT_OPEN_ORPHAN_LABEL` per-show, otherwise `REPORT_LOOKUP_INCONCLUSIVE`); reserved `fxav-app:report` label is the recovery scan filter (NOT `bug-report`); 24h `created_at` horizon enforced via DB-derived `cutoffIso` (NEVER `Date.now`); orphan-cleanup `state='closed' && state_reason='not_planned'` issues skipped REGARDLESS of label presence; open-with-orphan-label fails closed; `DUPLICATE_LIVE_MATCHES` fails closed. `GITHUB_BOT_LOGIN` env var added to `.env.local.example` and §14.3.
- **Task 8.3e** — `tests/reports/concurrentRetry.test.ts` + `tests/reports/lateSuccess.test.ts`. **The canonical `expiredLeaseRetry(key, depth)` helper lives here.** AC-8.13 concurrent retry + late-success guard + slow-original lease-stolen race + DB-time horizon classification + Case D' lease-just-expired recursion (bounded at depth 3 with `REPORT_LEASE_THRASHING` 503 alert) + state-gated `admin_alerts` UPSERTs (two-gate retry + unconditional fallback with `raced_back` / `raced_back_twice` discriminators) + per-show alert scoping via `entryShowId` capture + `BOT_LOGIN_MISSING` dual-alert (global + per-row). The pseudocode at `08-bug-report.md:606-1101` is authoritative; do NOT improvise an alternative SQL flow.
- **Task 8.3f** — `app/api/cron/report-reaper/route.ts` + modify `vercel.json` + `tests/reports/reaper.test.ts`. Daily cron (`0 6 * * *`); `DELETE FROM reports WHERE github_issue_url IS NULL AND created_at < now - interval '24 hours' AND processing_lease_until < now`; live-lease rows preserved; `STALE_ORPHAN_REPORT` audit entries written for each deleted row.
- **Task 8.3g** — `scripts/verify-spec-amendment-3.sh` + `package.json` script wiring (`verify:spec-amendment`). **STATUS: spec patch ALREADY APPLIED during the plan adversarial-review loop (rounds 24+).** Only Steps 3a / 3b remain: author the verification script (exact-count assertions; section-scoped extraction; multi-line `perl -0777` matching) and run it (`pnpm verify:spec-amendment`). Iterate the spec patch if any assertion fails. Wire into CI alongside `pnpm test`.
- **Task 8.5** — `tests/messages/codes-coverage.test.ts` + extend `lib/messages/catalog.ts` with the §12.4 REPORT_* codes. Two-way parity assertion: every code in source → in catalog; every code in catalog → emitted from at least one synthesizable scenario. Overlaps with AC-X.1 but this is the M8 deliverable.

### §B — UI tasks (Opus; after Pin-stop 1; consumes finalized POST /api/report contract)

- **Task 8.4** — `components/shared/ReportButton.tsx` + `components/shared/ReportModal.tsx` + modify `components/layout/Footer.tsx` + e2e tests. **Note plan path is `components/shared/`, NOT `components/admin/`** — the button serves BOTH admin and crew surfaces per §13.1 (admin parse panel "Report this" + footer "Something looks wrong?"). Modal owns the `idempotency_key` lifecycle: ONE key per attempt, reused across every retry / cancel / draft edit / tab refresh; rotates ONLY on terminal success (HTTP 2xx + `body.ok === true`) OR explicit "Start a new report anyway" opt-in. Persistence: `sessionStorage` keyed by `fxav-report-attempt-<surfaceId>`, holds `{ idempotencyKey, draft, status, surfaceId }`, cleared ONLY by terminal success or user opt-in. The state machine is at `08-bug-report.md:1321-1349`; do NOT simplify away the persistence contract. Compile-time autocaptures: `surface`, `crewPreview`, `fieldRef`, `parseWarnings`, `rawSnippet`, `viewerVisibleSection`, `userAgent`, `lastSyncTimestamp`, `staleTier`, `rightNowState`.

### Coordination protocol

- Disjoint by file path; neither implementer commits files outside their list without an explicit handoff note appended to this doc.
- Both sessions commit per task per AGENTS.md §1.6 (`<type>(<scope>): <summary>`; common scopes for M8 are `reports`, `github`, `report`, `messages`, `db`, `spec`).
- Both sessions append to the convergence log; don't rebase or squash each other's commits.
- Per-session UI hard rule: §A NEVER touches `components/**` or non-api `app/**`. §B NEVER touches `lib/reports/**`, `lib/github/**`, `app/api/report/**`, `app/api/cron/report-reaper/**`, `lib/messages/catalog.ts`, or migrations.

### Pin-stop sequence — single pin, final (§A → §B handshake gate)

There is one pin-stop. M8's asymmetry — Codex owns 10 backend tasks (8.1–8.3g + 8.5) and Opus owns one UI task (8.4) — makes a second pin-stop redundant: Opus has a single contract dependency (the `/api/report` request/response shape) and can ship the entire modal once that shape is finalized. **If Codex believes after reading the plan that a second pin-stop is justified, propose an extension to Pin-stop 1 rather than introducing Pin-stop 2.**

**Pin-stop 1 (FINAL)**: the `POST /api/report` HTTP contract. Pinned items:

- **Request payload type** — `RequestBody` in `lib/reports/submit.ts` (or `app/api/report/route.ts`). Exact field shape, optional vs required, value enums (`reported_by_kind`, `reporter_role` snapshot shape, optional `crewPreview` / `fieldRef` / `parseWarnings` / `rawSnippet` / `viewerVisibleSection` / `userAgent` / `lastSyncTimestamp` / `staleTier` / `rightNowState`), and the **`idempotency_key` rule** — client-generated `crypto.randomUUID` per spec §13.2.3, sent in the body (NOT a header). Per Pin-stop spec, the server MUST validate this is a UUID v4 and reject malformed keys with 400.
- **Success response type** — `{ ok: true, status: 'created' | 'duplicate' | 'recovered', github_issue_url?: string }`. Admin surfaces receive `github_issue_url`; crew surfaces MUST NOT (privacy §13.2.3 / Task 8.3b step 6). HTTP status: 201 for `created`, 200 for `duplicate` and `recovered`.
- **Error code union** — `{ ok: false, code: <REPORT_* code from §12.4> }`. Concrete codes the modal must handle: `REPORT_RATE_LIMITED_ADMIN` (429), `REPORT_RATE_LIMITED_CREW` (429), `IDEMPOTENCY_IN_FLIGHT` (409), `REPORT_LOOKUP_INCONCLUSIVE` (502), `REPORT_HORIZON_EXPIRED` (410), `REPORT_LEASE_THRASHING` (503), plus 401 for anonymous and 400 for malformed body / bad UUID.
- **`idempotency_key` UUID generation rule** — client mints `crypto.randomUUID` and persists it in `sessionStorage` per the lifecycle in §B Task 8.4. Server treats the key as authoritative; never overwrites.
- **ETA shape** — the response is synchronous (no 202 + polling); GitHub call timeout is 15s; quota and lease are released on ROLLBACK. The modal SHOULD NOT poll a status endpoint; if a 502 or 409 is returned, the modal stays in `failed-retryable` and offers Retry / Resume.

**Codex's report at Pin-stop 1 MUST include:**

1. The pin-stop SHA (orchestrator passes to Opus as the rebase base for §B's start).
2. The exact `RequestBody`, `SuccessResponse`, and `ErrorResponse` types pasted as a `.d.ts`-style block in a `### Pinned contract @ <SHA>` subsection appended at the bottom of this §0.
3. Any deviations from the plan — flagged explicitly.
4. Verification gate: `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin-stop SHA.

After Pin-stop 1 clears, Opus starts Task 8.4 in parallel. Codex continues with Tasks 8.3c–8.3g + 8.5 (lease_holder ownership tests, recovery flow tests, reaper cron, admin_alerts emissions, catalog parity). **§A and §B work concurrently from this point onward**; they reconverge at the milestone close-out for adversarial review.

**If Pin-stop 1 reveals a missing surface §B needs** (e.g., a `terminal-success` discriminator field the modal can key off): treat it as a pin-stop extension, NOT a new pin number. Update §0's bullet list inline, have §A extend the contract, re-pin at a new SHA.

**Anti-pattern:** Codex resuming work past Pin-stop 1 without orchestrator confirmation. The pin sequence is strictly ordered for §A's first batch (8.1, 8.2, 8.3, 8.3a, 8.3b) → Pin-stop 1 → parallel.

### What is NOT in either list

- New migrations on `reports` / `admin_alerts` / `report_rate_limits` — **M2 owns the schema** (Task 2.2 from `02-schema-rls.md`). M8 only EXTENDS / CONSUMES. Task 8.1 explicitly forbids adding parallel migrations.
- Push notification / email surface — DEFERRED to M11+ (per `DEFERRED.md` M6-D1; spec §13.2 has zero push surface in v1).
- Operator-log structured sink — **M5-D9 / M5-D10 / M5-D11 are the inherited decision** (see §6 watchpoint 11.6 + §11(d) below). All three M5 deferrals routed the structured operator-log sink to "M6 (drive-sync) or M8 (bug-report) — whichever lands the sink first." M6 / M6.5 / M7 did NOT land it. **M8 inherits the decision: either land the sink in this milestone (and resolve all three deferrals at close), or push to M9+ explicitly and document why.** The decision MUST be surfaced at kickoff and recorded in §11(d); silently deferring without a documented disposition is the failure mode.

### Pinned contract @ `1d55cb5` (Pin-stop 1, 2026-05-12)

Codex closed Tasks 8.1, 8.2, 8.3, 8.3a, 8.3b at SHA `1d55cb5` (final commit `fix(reports): close pin-stop review findings`; preceded by the 5 plan-canonical task commits `f4b7be8` → `a7834ce`). Adversarial-review round 2 returned APPROVED with no blocking findings. `pnpm test && pnpm lint && pnpm typecheck` exited 0 at the pin SHA (182 files / 2570 tests pass; 0 lint errors; 2 pre-existing M7 `<img>` warnings deferred via M7-D3). Pin SHA → Opus rebases §B against `1d55cb5`.

```ts
export type RequestBody = {
  idempotency_key: string; // UUID v4; route rejects malformed/non-v4 as 400
  show_id: string; // UUID v4; route rejects malformed/non-v4 as 400
  message?: string | null;
  surface?: string | null;
  reporter_role?: string | null;
  crewPreview?: Record<string, unknown> | null;
  fieldRef?: Record<string, unknown> | null;
  parseWarnings?: unknown[] | null;
  rawSnippet?: string | null;
  viewerVisibleSection?: string | null;
  userAgent?: string | null;
  lastSyncTimestamp?: string | null;
  staleTier?: string | null;
  rightNowState?: Record<string, unknown> | null;
};

export type SuccessResponse = {
  ok: true;
  status: "created" | "duplicate" | "recovered";
  github_issue_url?: string; // admin only; omitted for crew responses per §13.2.3 privacy
};

export type ErrorResponse = {
  ok: false;
  code?: string;
};
```

**Pin-stop 1 caveats for §B (Opus's ReportButton/ReportModal work consumes these — handle accordingly):**

1. **`expired_pending_recovery` → 409 `IDEMPOTENCY_IN_FLIGHT` is the Pin-stop stub.** Until Task 8.3c lands, a retry whose lease has expired and whose row is still unresolved returns 409 (not the eventual 502 `REPORT_LOOKUP_INCONCLUSIVE` / 410 `REPORT_HORIZON_EXPIRED` differentiation). §B modal handles 409 by keeping the modal in `failed-retryable` and offering Resume — this behavior is correct for both the Pin-stop stub and the post-8.3c full implementation, so §B does NOT need to wait.
2. **Create-time GitHub failures currently return `REPORT_LOOKUP_INCONCLUSIVE`.** Reviewer approved this for the Pin-stop but flagged that §B user-facing copy should be neutral ("we couldn't confirm whether your report went through, please try again") rather than implying only lookup failure ("our recovery lookup failed"). When §B wires `lib/messages/lookup.ts` for `REPORT_LOOKUP_INCONCLUSIVE`, the catalog entry must read as a generic "outcome unknown — retry safely" message, not as a recovery-specific message. This matches the catalog copy already in §12.4 reference ("We couldn't confirm whether your previous report went through. Please try again in a few minutes.").
3. **Orphan-close-failure → no alert (non-blocking hardening deferred).** If the orphan-cleanup `octokit.issues.update` itself fails (network error mid-close), the `admin_alerts.REPORT_ORPHANED_LOST_LEASE` UPSERT is currently NOT written. Approved as non-blocking for Pin-stop 1. Will be revisited in a later task or in the convergence loop; §B does not consume this path.

---

## 1. Spec sections in scope

Plan §M8 cites `Spec context: §13 entire section, §17.1 milestone 8`. In practice every M8 task brushes one or more of:

- **§13.1** — "Something looks wrong?" footer button + admin "Report this" button surfaces; idempotency-key persistence contract.
- **§13.2** — Report destination GitHub Issues: repo / token env vars; per-issue `<!-- fxav-report-id: <key> -->` body marker; the reserved `fxav-app:report` provenance label (operationally protected — operators MUST NOT add/remove); `bug-report` + `reporter:admin` / `reporter:crew` + area labels (static set).
- **§13.2.1** — admin issue body template.
- **§13.2.2** — crew issue body template (NO crew name/email in issue body or labels — privacy contract).
- **§13.2.3** — Submission flow (post-amendment): INSERT-first + quota-on-claim + lease-ownership protocol + lock-free retry via `findIssueByMarker` + fail-closed on `LookupInconclusive` + `created_at` 24h horizon + reaper predicate. **The three ratified amendments live here**; see §3 below.
- **§4.1** — `reports` table schema: `idempotency_key uuid NOT NULL` unique, `processing_lease_until timestamptz`, `lease_holder uuid`, `show_id`, `reported_by_kind`, `reported_by`, `reporter_role`, `context`, `message`, `github_issue_url`, `created_at`. **M2 owns this**; Task 8.1 verifies presence via `pg_get_indexdef`.
- **§4.6** — `admin_alerts` UPSERT contract for new M8 producer codes: `REPORT_ORPHANED_LOST_LEASE` (per-show), `GITHUB_BOT_LOGIN_MISSING` (global, `show_id IS NULL`), `REPORT_LOOKUP_INCONCLUSIVE` (per-show), `REPORT_DUPLICATE_LIVE_MATCHES` (per-show), `REPORT_OPEN_ORPHAN_LABEL` (per-show), `REPORT_LEASE_THRASHING` (per-show), `STALE_ORPHAN_REPORT` (global; reaper audit entry). All per-show codes key off the `(coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL` partial unique index; concurrent incidents on different shows produce distinct rows.
- **§12.4** — Error-code catalog: every M8-introduced code MUST appear in `lib/messages/catalog.ts` with non-null `dougFacing` (per M5 R21 F2 — distilled into AGENTS.md §1.5). Per Task 8.5, two-way parity test against §12.4 prose.
- **§14.3** — Environment variable table: `GITHUB_BOT_LOGIN` added (Task 8.3d); existing `GITHUB_API_TOKEN` + `GITHUB_REPO` referenced.
- **§17.1** — Per-milestone acceptance criteria AC-8.1..AC-8.13.

## 2. Acceptance criteria

Per plan file `08-bug-report.md` task-header AC references. Every AC ID must have at least one passing assertion.

- **AC-8.1** — Admin click → GH issue with §13.2.1 body + `reporter:admin` label. [Task 8.3b]
- **AC-8.2** — Row recorded with `reported_by_kind='admin'`, `github_issue_url` populated. [Task 8.3b]
- **AC-8.3** — 11th admin report within 1h → 429 `REPORT_RATE_LIMITED_ADMIN`. [Task 8.3a]
- **AC-8.4** — Crew submission → §13.2.2 body, NO crew name/email in issue, `reporter:crew` label. [Task 8.3b]
- **AC-8.5** — Row recorded with `reported_by_kind='crew'`, `reported_by=<crew_members.id>`, `reporter_role` snapshot, `github_issue_url` populated. [Task 8.3b]
- **AC-8.6** — 4th crew submission in 1h from same `crew_members.id` → 429 `REPORT_RATE_LIMITED_CREW`. [Task 8.3a]
- **AC-8.7** — Crew submission with no valid session → 401. [Task 8.3]
- **AC-8.8** — Every error code surfaced anywhere in the app maps to a row in §12.4 (test asserts no orphan codes). [Task 8.5; overlaps with AC-X.1]
- **AC-8.9** — Same `idempotency_key` POSTed twice → same `github_issue_url`, no duplicate issue, exactly one `reports` row. [Task 8.3b]
- **AC-8.10** — 4 concurrent crew submissions from same `crew_members.id` → exactly 3 succeed, 4th 429. Atomic UPSERT guarantees no race-through. [Task 8.3a]
- **AC-8.11** — GitHub 5xx after row reservation; row stays NULL; retry within lease → 409 `IDEMPOTENCY_IN_FLIGHT`; after lease expiry → `findIssueByMarker` returns null → re-call `createIssue` → exactly one issue. [Task 8.3c + Task 8.3e]
- **AC-8.12** — GitHub create succeeds (marker present) but response dropped; retry after lease expiry → `findIssueByMarker` finds existing issue via list endpoint → UPDATE row → exactly one issue. [Task 8.3d + Task 8.3e]
- **AC-8.13** — Concurrent-retry race: two retries after lease expiry; first claims, second returns 409; exactly one issue. [Task 8.3e]

## 3. Spec amendments in scope

All three of the §13.2.3 ratified amendments apply to M8 — M8 is the milestone that ships their runtime. The spec patch was applied during the plan-loop rounds 24+ (Task 8.3g STATUS line); M8 ships the verification script (`scripts/verify-spec-amendment-3.sh`) and runs it as a CI gate.

- [x] **Amendment 1 — `listForRepo` recovery contract.** Verbatim from AGENTS.md §13.2.3:

  > Recovery uses `octokit.rest.issues.listForRepo`, not code search. GitHub's code-search index lags tens of seconds; the list endpoint is immediately consistent with create writes. Filter by `creator: GITHUB_BOT_LOGIN, since: <T-24h>, state: 'all'`, scan page bodies for `<!-- fxav-report-id: <key> -->`, and additionally filter returned issues by `issue.created_at >= <T-24h>` client-side (since `since` filters by last-updated, not create-time). `LookupInconclusive` returns 502 and never authorizes `createIssue`.

  Adds the reserved-label filter `labels: 'fxav-app:report'` to the `listForRepo` call (plan amendment to §13.2 — every report carries this RESERVED, APP-SPECIFIC label; operationally protected). The recovery scan filters on the reserved label only; the generic `bug-report` is not load-bearing for recovery.

- [x] **Amendment 2 — `created_at` horizon + lease-expired reaper predicate.** Verbatim from AGENTS.md §13.2.3:

  > Retention horizon and reaper predicate align on `reports.created_at`, with lease-expired race fix.
  >
  > - `expiredLeaseRetry`: rejects rows where `created_at < now - interval '24 hours'` (return 410 `REPORT_HORIZON_EXPIRED`, do NOT call `createIssue`). Lease-claim UPDATE additionally requires `created_at >= now - interval '24 hours'` to fence the boundary at the serialized step.
  > - 8.3f reaper: deletes rows where `github_issue_url IS NULL AND created_at < now - interval '24 hours' AND processing_lease_until < now`. The third clause prevents the reaper removing a row a retry actively holds. A row whose `created_at` is past 24h but whose lease is still live is preserved; it becomes reapable only after the lease expires.

- [x] **Amendment 3 — `lease_holder uuid` ownership protocol.** Verbatim from AGENTS.md §13.2.3:

  > `lease_holder uuid` ownership protocol. Stamped at reservation, rotated on every lease re-acquisition. Required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE. A 0-row tail UPDATE triggers orphan cleanup: close GH issue with `state_reason: 'not_planned'`, add `fxav-orphan-lost-lease` label, INSERT `admin_alerts` `REPORT_ORPHANED_LOST_LEASE`. If re-SELECT returns null, return 410 `REPORT_HORIZON_EXPIRED`.

  Implementation contract: the shared helper `handleTailUpdateMiss(key, newIssue, myLeaseHolder, fallbackShowId)` in `lib/reports/submit.ts` (per plan Task 8.3b step 7 / Task 8.3e tail-UPDATE block) implements Cases A (URL matches mine — DO NOT close), B (URL differs — close mine as orphan), C (URL still NULL — close mine as orphan, return 409), and Reaped (row missing — close mine, return 410). The `fallbackShowId` argument preserves per-show alert keying across original-worker and retry-worker callers; only falls back to NULL if neither caller has an in-memory show id.

The other six plan amendments are NOT M8's responsibility:

- [ ] Amendment 4 — `{v1, v2, v4}` parser registry — **N/A — only M1.**
- [ ] Amendment 5 — v4 single-marker simplification — **N/A — only M1.**
- [ ] Amendment 6 — Sheets modtime-CAS binding — **N/A — only M6.**
- [ ] Amendment 7 — MI-8 / MI-8b modtime-stable debounce — **N/A — only M6.**
- [ ] Amendment 8 — MI-9 LEAD-bit narrowing + `ROLE_FLAGS_NOTICE` — **N/A — only M6.**
- [ ] Amendment 9 — First-seen auto-publish + 24h unpublish undo — **N/A — deferred as M6-D12.**

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3, M4, M5, M6, M7 closed. Current `git log` head at handoff authoring is `9ed1962 docs(handoff): record R7 APPROVED — M7 cross-model convergence loop closed`. Working tree clean.
- [ ] **Pre-flight tests passing in isolation** (do NOT parallelize Vitest with Playwright):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 (M7 close-out baseline — re-verify at kickoff).
  - `pnpm test:e2e --project=mobile-safari` exits 0 (M7 close-out baseline).
  - `pnpm dlx supabase db reset && pnpm db:seed` applies cleanly.
- [x] **Specific files present from prior milestones**:
  - All M0–M7 deliverables.
  - `lib/messages/catalog.ts` + `lib/messages/lookup.ts` (M5-shipped, M6/M7-extended). M8 EXTENDS with `REPORT_*` + `GITHUB_BOT_LOGIN_MISSING` codes (some already present per `lib/messages/catalog.ts:671-690` — `REPORT_ORPHANED_LOST_LEASE`, `GITHUB_BOT_LOGIN_MISSING`, `REPORT_LEASE_THRASHING` are already in the catalog; verify the others are added by Task 8.3d/8.5).
  - `lib/auth/**` (M5-shipped): `validateLinkSession`, `validateGoogleSession`, `validateGoogleIdentity`, `requireAdmin`. Task 8.3 dispatches to all three.
  - `tests/auth/_metaInfraContract.test.ts` (M5-shipped). M8 EXTENDS with `lib/reports/**` + `lib/github/**` helpers OR creates an analogous `tests/reports/_metaInfraContract.test.ts` per §13 below.
  - `tests/messages/_metaAdminAlertCatalog.test.ts` (M5-shipped, M6/M7-extended). M8 EXTENDS with new producer codes.
  - `tests/auth/advisoryLockRpcDeadlock.test.ts` (M5-shipped). **M8 does NOT extend** — reports are cross-show; no advisory-lock surface.
  - `vercel.json` — M6 added 5 cron schedules; M7 added asset-recovery + diagram-gc. M8 ADDS one more: `0 6 * * * /api/cron/report-reaper` (verify cadence at Task 8.3f close).
  - **`reports` schema columns** (M2-shipped per `02-schema-rls.md` Task 2.2 + spec §4.1:553-562): `idempotency_key uuid NOT NULL` with `reports_idempotency_key_idx` unique index; `processing_lease_until timestamptz`; `lease_holder uuid`. **Verify presence at kickoff** via `pg_get_indexdef` — if any are missing, fix Task 2.2 (do NOT add a parallel migration).
- [ ] **NEW M8 modules / routes that do NOT yet exist** (Codex creates):
  - `lib/reports/leaseProtocol.ts` (Task 8.1)
  - `lib/github/issues.ts` (Task 8.2)
  - `app/api/report/route.ts` (Task 8.3)
  - `lib/reports/submit.ts` (Task 8.3 + 8.3a–e)
  - `lib/reports/rateLimit.ts` (Task 8.3a)
  - `app/api/cron/report-reaper/route.ts` (Task 8.3f)
  - `scripts/verify-spec-amendment-3.sh` (Task 8.3g step 3a)
- [ ] **NEW M8 modules / routes that do NOT yet exist** (Opus creates):
  - `components/shared/ReportButton.tsx` (Task 8.4)
  - `components/shared/ReportModal.tsx` (Task 8.4)
  - Modification to `components/layout/Footer.tsx` (Task 8.4)
- [ ] **Env vars set in `.env.local`**:
  - `GITHUB_API_TOKEN` (already documented in §14.3 from M5/M6 era — verify present in `.env.local.example`).
  - `GITHUB_REPO` (same — verify).
  - **`GITHUB_BOT_LOGIN`** — NEW for M8 (Task 8.3d adds to `.env.local.example` + §14.3). Required at runtime; absence triggers `BOT_LOGIN_MISSING` `LookupInconclusive` + the dedicated global `GITHUB_BOT_LOGIN_MISSING` admin_alert.
- [ ] **`vercel.json` cron registry**: M6 + M7 contributed 7 entries. M8 ADDS one new entry: `report-reaper` cadence per Task 8.3f.

If any required pre-flight command fails, do NOT start the next M8 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Every invariant ticked here is exercised by M8's code paths.

- [x] **TDD per task** (always applies, §1.1). Failing test → minimal implementation → passing test → commit. Self-review runs after.

- [ ] **Per-show advisory lock** (§1.2). **N/A for M8** — reports are cross-show; no per-show `pg_advisory*` surface in `lib/reports/**` or `lib/github/**`. The §1.2 single-holder rule is preserved by M8 doing nothing new in this domain. **Regression invariant:** `! rg "pg_advisory" lib/reports lib/github app/api/report app/api/cron/report-reaper` returns zero matches. If a future M8 patch adds an advisory lock, AGENTS.md §1.2 + the M5 R20 deadlock class applies; extend `tests/auth/advisoryLockRpcDeadlock.test.ts` and document the holder layer in this section before merging.

- [ ] **Email canonicalization at boundary** (§1.3). **N/A for M8 NEW surfaces.** Reports do NOT carry user emails — `reported_by` is either `crew_members.id` (crew) or the admin's email (already canonicalized by `requireAdmin` at the session layer). M8 does not introduce any new email-reading surface. The M6-extended glob in `tests/admin/no-inline-email-normalization.test.ts` covers `lib/admin/**` + `lib/sync/**`; `lib/reports/**` and `lib/github/**` have no email-reading surface so the test passes trivially. If a future M8 patch adds email reads, AGENTS.md §1.3 applies and the meta-test glob must extend.

- [ ] **No global sync cursor** (§1.4). **N/A for M8.** M8 does NOT touch sync watermarks. `! rg "lastPollAt" lib/reports lib/github app/api/report` returns zero (M5/M6 already-pinned invariant preserved).

- [x] **No raw error codes in user-visible UI** (§1.5). **APPLIES to ReportButton + ReportModal.** Every user-facing error message renders through `lib/messages/lookup.ts` `messageFor(code, params?)`. The catalog extension in Task 8.3d / Task 8.5 adds per-§12.4 entries for `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_HORIZON_EXPIRED`, `GITHUB_BOT_LOGIN_MISSING` (admin-only banner), `REPORT_DUPLICATE_LIVE_MATCHES` (admin-only banner), `REPORT_OPEN_ORPHAN_LABEL` (admin-only banner), `REPORT_LEASE_THRASHING` (admin-only banner). **Static-analysis regression:** `tests/messages/codes-coverage.test.ts` (Task 8.5) asserts the two-way parity; AC-X.2 (cross-cutting) will catch any raw-code leak in `components/**`. Opus's §B work routes all surface-visible copy through `messageFor`.

- [x] **Commit per task** (§1.6). One task per commit. Conventional-commits format. Common scopes for M8: `reports`, `github`, `report`, `messages`, `db`, `spec`. Plan's per-task Step 3/5 already names canonical commit subjects — use them verbatim.

- [x] **Spec is canonical** (§1.7). M8 introduces the three §13.2.3 amendments — already ratified and patched into the spec via Task 8.3g's already-applied patch. **No new spec changes in M8 implementation work.** If a finding during convergence requires a fourth amendment, that's a P0 — surface and pause; do not silently fix.

- [x] **UI quality gate (impeccable v3 critique + audit pair)** (§1.8). **APPLIES to §B Task 8.4.** UI surface ships in this milestone (`components/shared/ReportButton.tsx`, `components/shared/ReportModal.tsx`, modified `components/layout/Footer.tsx`). The dual run happens AFTER §B implementation closes and BEFORE adversarial review. Both `/impeccable critique` and `/impeccable audit` run with the canonical v3 preflight gates. Findings + dispositions in §12 below. **Lightweight pass expected** (one button + one modal; not a full-page surface) but mandatory.

- [x] **Supabase call-boundary discipline** (§1.9). **APPLIES to every `lib/reports/**` and `lib/github/**` helper that calls Supabase or Octokit.** Every Supabase call destructures `{ data, error }`; returned-error and thrown-error paths distinguished; infra faults surface as discriminable typed results (e.g., `{ kind: 'infra_error' }` or a typed `*InfraError` thrown), never as silent `continue` or benign auth signals. Octokit calls follow the same pattern — `LookupInconclusive` is the discriminated infra error class for `findIssueByMarker`; `createIssue` failures route through the cataloged 502/503 path. Every helper subject to this contract registers in the meta-test per §13.

## 6. Watchpoints from prior adversarial review

M8 has not yet been implemented; no prior M8 convergence log exists. Watchpoints below carry forward M5/M6/M7 classes that apply to M8's surfaces plus the M8-specific failure modes the plan / spec amendments codify. **Round-1 reviewer scans the diff against this list first.**

### M5/M6/M7-carry-forward classes (still active in M8)

1. **Supabase call-boundary discipline (M5 R3–R22 — six consecutive bug-class rounds; M6/M7 inherited).** M8's analogous registry is a new `tests/reports/_metaInfraContract.test.ts` (per §13 below — registers every `lib/reports/**` + `lib/github/**` helper that calls Supabase or Octokit). Every helper either registers a row OR carries an inline `// not-subject-to-meta: <reason>` comment. **Pre-emptive registration at task time eliminates the round-14 discovery class** — memory `feedback_meta_test_at_plan_time_not_round_n.md` codifies this; AGENTS.md §1.9 mandates it for plans touching DB writes.

2. **`admin_alerts.upsert(...)` requires non-null `dougFacing` and returned-error inspection (M5 R21 F2 + R22 F1; M6 R10 / M7 carry-forward).** Every catalog code used in production `admin_alerts.upsert` MUST have non-null `dougFacing`. M8 introduces / consumes 7 admin_alerts producer codes: `REPORT_ORPHANED_LOST_LEASE`, `GITHUB_BOT_LOGIN_MISSING`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT`. Three are already in `lib/messages/catalog.ts:671-690`; the rest must land by Task 8.3d / 8.5. **Returned-error from `.upsert(...)` MUST throw and route to the cataloged 503 path, NOT silently continue.**

3. **Class-sweep code-shape-based, not name-list-based (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`).** When a reviewer surfaces a bug, grep the codebase for the same SHAPE BEFORE patching only the named instance. M5/M6/M7 review rounds each surfaced parallel surfaces beyond the named one. **M8-specific risk classes** (each is a SHAPE, not a name list):
   - Every URL-writing UPDATE to `reports.github_issue_url` (must carry `AND lease_holder = $myToken` predicate).
   - Every `octokit.rest.issues.create` call (must include the `fxav-app:report` reserved label in addition to caller labels).
   - Every `admin_alerts.upsert` for per-show codes (must include `show_id` argument; global codes have `show_id = NULL`).
   - Every horizon comparison (`created_at` predicate; MUST use Postgres `now()`, NEVER `Date.now`).
   - Every `findIssueByMarker` caller (MUST pass DB-derived `cutoffIso`, NEVER `Date.now`-derived).

4. **Negative-regression verification (memory `feedback_negative_regression_verification.md`).** Every new test in M8 MUST have its production-side fix stashed and the test confirmed-failing before shipping. **Especially critical for:**
   - Late-success guard tests (Task 8.3e — the original tail must NOT close the live recovered issue when retry already wrote MY URL into the row).
   - State-gated `admin_alerts` UPSERT tests (Task 8.3e — the `INSERT .. SELECT FROM reports WHERE ...` form yields 0 rows when state flips between SELECT and UPSERT; re-dispatch fresh).
   - Lease-thrashing recursion-bound tests (Task 8.3e — at depth 3, the row's actual state at write time determines terminal/contention/503; a tautological test would just count recursions).
   - Per-show alert scoping tests (Task 8.3e Reaped path — `entryShowId` capture; per-show partial unique index).

5. **Iterate adversarial review until APPROVE (memory `feedback_iterate_until_convergence.md`).** Round-3 cap is for value-judgment loops, NOT for halting when each round surfaces NEW bugs. **M8 should expect 5–15 rounds** — it is invariant-dense in a way comparable to M5 (R3–R22 + SR1–SR9) and M7 (R1–R7 backend + R20–R26 frontend HTTP-semantics): the 3 spec amendments layer onto a 4-state row lifecycle (reserved → leased → URL-set → reaped) with a separate atomic-NULL-or-orphan-cleanup branch per case, plus 7 distinct `admin_alerts` codes with per-show vs global routing and per-row-vs-state-gated emission paths. Plan accordingly.

6. **Fix-round regression budget (memory `feedback_class_sweep_before_patch.md` + AGENTS.md writing-plans additions).** When a fix in round N patches surface S for class C, round (N+1) preparation must include: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test still passes, (c) note both in the round closure. M5 R19→R20 introduced a CRITICAL deadlock by patching a hole on a surface that already had a wrapper. M7 R3→R3.1 reverted an R2 false positive that broke typecheck because the regression budget wasn't followed at R2 close. **M8 risk class:** patching `handleTailUpdateMiss` cases on one path (original-worker tail) without re-greppping the retry-worker tail — both callers share the helper but pass different `fallbackShowId` arguments; a fix to one without verifying the other can collapse per-show keying.

7. **Meta-tests at plan time, not round N (memory `feedback_meta_test_at_plan_time_not_round_n.md` + AGENTS.md §1.9).** §13 below pre-declares M8's meta-test extensions. Land them in the first task that touches the relevant surface — not at round 14. Pre-declaring eliminates the rounds before they happen.

8. **Same-vector recurrence triggers comprehensive re-analysis (AGENTS.md §1, line 75 — codified after M7 R20–R26).** 3 consecutive rounds on the same vector → comprehensive re-analysis BEFORE next review fires. **M8-specific candidate vectors** (each could plausibly recur across 3 rounds):
   - The 6 `LookupInconclusive` discriminator codes' routing to `admin_alerts` (per-show vs global; per-row alert vs operator-config alert).
   - The 4 Cases (A/B/C/Reaped) in `handleTailUpdateMiss` × 2 callers (original-worker tail + retry-worker tail).
   - The DB-time-vs-`Date.now` horizon classification (every place that touches `created_at`, the GitHub `cutoffIso`, the lease-claim WHERE clause, the reaper WHERE clause).
   - The state-gated `admin_alerts` UPSERT pattern (two-gate retry + unconditional fallback + re-dispatch on each gate miss).

   If round N+3 still surfaces a same-vector finding after the comprehensive audit, the analysis is structurally incomplete — stop patching, deep-dive spec + diff together until convergence is structural.

9. **codex exec needs stdin closed (memory `feedback_codex_exec_needs_stdin_closed.md`).** `codex exec ... "$prompt"` hangs forever waiting on stdin EOF in non-interactive contexts; ALWAYS append `< /dev/null`. Monitor codex worker CPU% (0.0% for 2+ min = stdin hang). Already encoded in `/codex:adversarial-review` and `/codex:rescue` (whether dispatched `--fresh` or `--resume-last` — see §10 step 4 for which to pick); do NOT raw-shell `node codex-companion.mjs` for M8 reviews.

10. **echo append discipline (memory `feedback_echo_append_newline_trap.md`).** Never use `echo "X" >> .env.local.example` or similar — no trailing newline guarantee. Use `printf '\n%s\n'` and verify with `git diff` for `.env.local.example`. Task 8.3d appends `GITHUB_BOT_LOGIN=...` — use `printf` and verify; M0 R1 + M4 R7 both shipped malformed entries this way.

11. **Verify review findings against external API spec (memory `feedback_verify_review_findings_against_external_api_spec.md`).** Cross-model reviews can confidently misdiagnose API semantics — M7 R2 false-positively flagged `supportsAllDrives` on `revisions.*` (the field doesn't apply to revisions; typings reject it). **M8 risk class:** the Octokit `issues.listForRepo` parameter shape — `since`, `creator`, `labels`, `state`, `per_page`, `page`. Verify any finding against the live `@octokit/rest` typings + GitHub REST API docs (`https://docs.github.com/en/rest/issues/issues#list-repository-issues`) before patching. The `since` parameter is **last-updated time**, NOT created-time — the plan's client-side `created_at` post-filter (Amendment 1) exists exactly because of this asymmetry; don't accidentally remove it under a review-finding pressure.

11.6. **Inherited operator-log sink decision (M5-D9 / M5-D10 / M5-D11).** All three M5 deferrals routed structured operator-log writes to "M6 (drive-sync) or M8 (bug-report) — whichever lands the sink first." `lib/operatorLog/` does NOT exist at M8 kickoff (M6 / M6.5 / M7 did not land it). **M8 inherits the decision** — either ship the sink in this milestone alongside `admin_alerts` emissions and close all three deferrals, or push to M9+ explicitly and update `DEFERRED.md` with the new home + the reason. **The failure mode is silent deferral** — finishing M8 with the three deferrals still pointing at M8 (or M6) is a discipline regression. The decision MUST be made at kickoff, surfaced to the orchestrator, and recorded in §11(d) with the chosen option (A: land in M8 / B: push to specific later milestone with rationale).

11.5. **M6.5 / Amendment 9 inheritance — sync layer is fully converged at M8 kickoff.** M6-D12 (plan Amendment 9: first-seen auto-publish + 24h unpublish undo) was resolved in M6.5 at SHA `badbb15` (see `DEFERRED.md` "Resolved" section). M8 inherits a sync layer where: (a) live-path first-seen sheets auto-publish (no `FIRST_SEEN_REVIEW` step); (b) the `POST /api/show/[slug]/unpublish` route provides a 24h undo window; (c) `lib/messages/catalog.ts:350-369` contains the new admin_alerts codes `SHOW_FIRST_PUBLISHED` and `SHOW_UNPUBLISHED`. **M8 catalog discipline:** EXTEND `lib/messages/catalog.ts` with the new `REPORT_*` + `GITHUB_BOT_LOGIN_MISSING` + `STALE_ORPHAN_REPORT` codes; DO NOT recreate the file, DO NOT conflict on code naming with `SHOW_FIRST_PUBLISHED` / `SHOW_UNPUBLISHED`. The `tests/messages/_metaAdminAlertCatalog.test.ts` registry already covers the M6.5 codes; M8's extension adds rows for the M8 producer codes alongside. **Implication for §A first commit:** at Task 8.3d / 8.5 close, run `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` and verify both the M6.5 and M8 codes are present — a regression that drops either set is a P0.

### M8-specific watchpoints

12. **Amendment 1 — `listForRepo` recovery contract is the single source of truth.** **No fallback to code search.** Static-analysis regression: `! rg "issuesAndPullRequests|octokit\\.rest\\.search" lib/reports lib/github app/api/report` returns zero matches. The `findIssueByMarker` helper is the ONLY recovery primitive — any new code path that wants to look up issues by marker MUST call it (not raw `listForRepo`, not raw search). The structural meta-test in §13 below (`_amendmentContractMetaTest.test.ts`) asserts this.

13. **Amendment 1 — `since` filter is by last-updated, NOT created-time.** The `since: cutoffIso` parameter bounds the result set but is INSUFFICIENT for the 24h create-time horizon. Client-side `issue.created_at >= cutoffMs` post-filter is REQUIRED. Test: synthesize an issue created 25h ago whose body was edited 1h ago (last-updated < 24h → returned by `since` filter), marker matches → `findIssueByMarker` MUST return null because `created_at < cutoff` AND `expiredLeaseRetry` MUST return 410 `REPORT_HORIZON_EXPIRED`.

14. **Amendment 1 — `LookupInconclusive` NEVER authorizes `createIssue`.** All six discriminator codes (`BOT_LOGIN_MISSING`, `PAGINATION_ERROR`, `PAGINATION_BOUND`, `SHAPE_ERROR`, `DUPLICATE_LIVE_MATCHES`, `OPEN_ISSUE_WITH_ORPHAN_LABEL`) return 502 to the client (or 502 + global alert for `BOT_LOGIN_MISSING` + per-row state-gated alert when row is genuinely stuck). **Class-sweep regression:** `expiredLeaseRetry`'s try/catch around `reconcileBeforeCreate` is the only code path that handles `LookupInconclusive`; assert via static analysis that no other call site catches the class and proceeds to `createIssue`. (The meta-test in §13 below pins this.)

15. **Amendment 1 — Reserved-label provenance filter.** `findIssueByMarker`'s `listForRepo` call passes `labels: 'fxav-app:report'`. The generic `bug-report` label is NOT load-bearing for recovery. `createIssue` MUST attach both `bug-report` (for human triage) AND `fxav-app:report` (for recovery provenance) — the helper's reserved-label append (per Task 8.3d's `CreatedIssue` shape + `FXAV_APP_REPORT_LABEL` constant) is mandatory. **Test:** every `octokit.rest.issues.create` call includes the reserved label; recovery scans without it return null (forensically present, not recoverable).

16. **Amendment 2 — combined predicate horizon enforcement.** Three places enforce the 24h `created_at` horizon and they MUST agree:
    - `expiredLeaseRetry` entry check (rejects past-horizon rows with 410 BEFORE any GitHub call).
    - Lease-claim UPDATE WHERE clause (`AND created_at >= now - interval '24 hours'`).
    - Reaper DELETE WHERE clause (`AND created_at < now - interval '24 hours' AND processing_lease_until < now`).

    A row past-horizon AND lease-live is preserved by the reaper (third clause) but rejected by `expiredLeaseRetry` (entry check); the divergence is intentional — the retry can't make progress and the reaper waits for the worker to release the row. **Test the boundary explicitly:** `created_at = now - 23h 59m` + lease expired → reaper preserves, retry passes entry, claim succeeds; `created_at = now - 24h 1m` + lease expired → reaper deletes, retry returns 410.

17. **Amendment 2 — Live-lease + past-horizon preservation.** The third clause `AND processing_lease_until < now` prevents the reaper from deleting a row whose lease is held by an in-flight retry. **Negative-regression test:** synthesize `created_at = now - 25h` + `processing_lease_until = now + 5m` (a retry just refreshed) + `github_issue_url IS NULL`. Reaper runs. Row IS NOT deleted. After lease expires, next reaper pass deletes it. Without the live-lease clause, the in-flight worker's tail UPDATE would race against the DELETE.

18. **Amendment 3 — `lease_holder` AND clause on EVERY URL-writing tail UPDATE.** Two callers share the contract: original-worker tail (Task 8.3b step 7) and retry-worker tail (Task 8.3e). Both pass through `handleTailUpdateMiss(key, newIssue, myLeaseHolder, fallbackShowId)`. **Class-sweep:** `rg "UPDATE reports.*github_issue_url" lib/reports` — every match MUST also contain `AND lease_holder =`. The structural meta-test in §13 below asserts this. Without it, a stolen-lease worker can corrupt the row (close someone else's live issue, double-write the URL).

19. **Amendment 3 — Orphan cleanup is a SINGLE atomic Octokit `issues.update` call.** Sets `state='closed'` + `state_reason='not_planned'` + `labels` (including `fxav-orphan-lost-lease`) atomically. Even if a future regression splits the call into separate update + add-label calls, `findIssueByMarker`'s orphan-skip filter treats `state='closed' && state_reason='not_planned'` as orphan REGARDLESS of label presence. The label is a positive signal but not required. **Test the partial-cleanup case:** marker-bearing closed issue with `state_reason='not_planned'` but missing the orphan label → recovery STILL skips it.

20. **Amendment 3 — Per-show alert keying via `fallbackShowId`.** The `(coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL` partial unique index keys per-show on `show_id`. Two reaped-row lost-lease incidents on different shows MUST produce two distinct `admin_alerts` rows. Original-worker tail passes `request.body.show_id` (in scope from the reservation INSERT); retry-worker tail passes `entryShowId` (captured from `expiredLeaseRetry`'s entry-time row read). Only fall back to NULL if neither caller has an in-memory show id. **Without the helper parameter, both incidents collapse into a single global row** (per-show separation lost; dashboard's per-show router can't surface the second show's leak).

21. **`LookupInconclusive` re-dispatch state-gated UPSERT pattern.** Several review-finding classes converge on this pattern (per plan Task 8.3d / 8.3e):
    - State SELECT first; if row reaped → 410, no alert; if URL set → 200, no alert; if lease live → 409, no alert.
    - State-gated UPSERT (`INSERT .. SELECT FROM reports WHERE github_issue_url IS NULL AND ...`) — yields 0 rows if state flipped between SELECT and UPSERT.
    - On 0-row, re-dispatch fresh (single retry); second gate; if second gate also misses, unconditional fallback with `raced_back_twice = true` discriminator.

    **The plan codifies a 2-gate + unconditional-fallback pattern.** Do not collapse to a single-gate UPSERT — the re-dispatch is the load-bearing protection against false 502/503 alerts when another worker resolves the row mid-flight. M8 review will almost certainly find an edge case here; the comprehensive-re-analysis rule applies if 3 rounds on this vector fire.

22. **`expiredLeaseRetry(key, depth)` recursion bound + thrashing alert.** Case D' (lease-just-expired between failed claim UPDATE and re-SELECT) recurses with `depth + 1`. Recursion is bounded at depth 3; at the depth limit the function emits 503 `REPORT_LEASE_THRASHING`. **State re-classification at depth limit** (per plan Task 8.3e top of function) — a row that was resolved/reaped/reclaimed by another worker between recursion levels MUST return the correct terminal/contention status (200 / 410 / 409) before the 503. Without it, a successful resolution under heavy contention would still emit a false thrashing alert.

23. **Reaper / retry consistency** (Amendment 2). For any row that's BOTH past-horizon AND lease-expired-and-unresolved, `expiredLeaseRetry` returns 410 AND the reaper's predicate matches it on the same UTC timestamp. Test the symmetry directly: same row state → both code paths agree.

24. **Pre-draft code-verification pass (AGENTS.md writing-plans rule).** Before Codex writes any test that names a specific column, RPC argument, RLS policy, constraint, or fixture shape, grep against the live codebase. **M8 risk classes:**
    - `reports` table columns: name verification via `pg_get_indexdef` (Task 8.1 step 1).
    - `admin_alerts` UPSERT shape: `(coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL` partial unique index — verify exact constraint name against the M2 migration.
    - Octokit response shape: `r.data` is array for `listForRepo`; `r.data.html_url` (not `url`) for `issues.create`; `r.data.number` for issue number; `r.data.labels` may be `string[]` or `{ name: string }[]` (per Octokit typings — already handled in plan Task 8.3d).

25. **Self-consistency sweep at M8 close.** Static-grep regressions to run before milestone close:
    - `! rg "octokit\\.rest\\.search|searchIssuesByMarker" lib/reports lib/github app/api/report` returns zero.
    - `rg "UPDATE reports.*github_issue_url" lib/reports` — every match contains `AND lease_holder =`.
    - `rg "octokit\\.rest\\.issues\\.create" lib/github lib/reports` — every match passes labels containing `fxav-app:report` (via the helper's auto-append OR explicit caller arg).
    - `! rg "Date\\.now|Date\\.parse" lib/reports lib/github` — every match either (a) is inside `findIssueByMarker` consuming a DB-derived `cutoffIso` (Date.parse on the ISO string is OK — same DB clock both sides) or (b) carries a `// not-DB-time: <reason>` comment.
    - `! rg "lastPollAt" lib/reports lib/github` returns zero (M5 invariant preserved).
    - `rg "admin_alerts" lib/reports lib/github` — every `.upsert(` call (or `INSERT .. ON CONFLICT`) for a per-show code carries `show_id` argument; for global codes (`GITHUB_BOT_LOGIN_MISSING`, `STALE_ORPHAN_REPORT`) `show_id` is NULL.

## 7. Test commands

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright.
- **Vitest unit / reports / github tests** (new M8 patterns):
  - `pnpm test tests/db/reports-schema.test.ts` (Task 8.1)
  - `pnpm test tests/github/issues.test.ts` (Task 8.2)
  - `pnpm test tests/reports/auth.test.ts` (Task 8.3)
  - `pnpm test tests/reports/quota.test.ts` (Task 8.3a)
  - `pnpm test tests/reports/happyPath.test.ts` (Task 8.3b)
  - `pnpm test tests/reports/firstSubmitRace.test.ts` (Task 8.3b)
  - `pnpm test tests/reports/retry5xx.test.ts` (Task 8.3c)
  - `pnpm test tests/reports/unknownOutcome.test.ts` (Task 8.3d)
  - `pnpm test tests/reports/lookupFailClosed.test.ts` (Task 8.3d)
  - `pnpm test tests/reports/concurrentRetry.test.ts` (Task 8.3e)
  - `pnpm test tests/reports/lateSuccess.test.ts` (Task 8.3e)
  - `pnpm test tests/reports/reaper.test.ts` (Task 8.3f)
  - `pnpm test tests/messages/codes-coverage.test.ts` (Task 8.5)
- **Existing meta-tests (M5/M6/M7-shipped; M8 extends in §13)**:
  - `pnpm test tests/auth/_metaInfraContract.test.ts` (M5-shipped; M8 may extend OR M8 creates `tests/reports/_metaInfraContract.test.ts` analog — decide at Task 8.1 close)
  - `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` (M8 extends with new producer codes)
- **NEW M8 meta-tests** (§13 below):
  - `pnpm test tests/reports/_metaInfraContract.test.ts` (NEW — per §13 row 1)
  - `pnpm test tests/reports/_amendmentContractMetaTest.test.ts` (NEW — per §13 row 4)
- **Spec amendment verification gate**:
  - `pnpm verify:spec-amendment` — wraps `scripts/verify-spec-amendment-3.sh`. Wire into CI alongside `pnpm test`. Must exit 0 before Task 8.3g commits.
- **Playwright e2e** (after §B Task 8.4 ships):
  - `pnpm test:e2e tests/e2e/report-modal.spec.ts --project=mobile-safari` — full submit flow + retry + cancel-preserves-key + tab-refresh-hydration + terminal-success rotation + explicit "Start a new report anyway."
- **Cron route smoke** (after Task 8.3f ships):
  - `curl -X POST $NEXT_PUBLIC_SITE_ORIGIN/api/cron/report-reaper` (with cron auth header) — expect 200 and `sync_log` (or dedicated audit) rows reflecting reaped row IDs.
- **Self-consistency static-grep gates** (run at Task 8.3g close):
  - `! rg "octokit\\.rest\\.search|searchIssuesByMarker" lib/reports lib/github app/api/report` returns zero.
  - `! rg "lastPollAt" lib/reports lib/github` returns zero.
- **Supabase reset + seed**: `pnpm dlx supabase db reset && pnpm db:seed` (after Task 8.3f's cron schedule is added to `vercel.json`).

## 8. Exit criteria

- [ ] All §A tasks in `08-bug-report.md` (8.1–8.3g + 8.5) checked off (`- [x]` on every step).
- [ ] §B Task 8.4 checked off.
- [ ] All AC-8.1..AC-8.13 each have at least one passing assertion.
- [ ] All M8 backend files exist with documented contracts (full list in §4 above).
- [ ] `scripts/verify-spec-amendment-3.sh` exists, is executable, wired into `pnpm verify:spec-amendment`, and exits 0 on the current spec.
- [ ] `vercel.json` cron registry adds the `report-reaper` entry.
- [ ] `lib/messages/catalog.ts` extended with all M8 producer codes (verbatim §12.4 copy; non-null `dougFacing`).
- [ ] `tests/reports/_metaInfraContract.test.ts` created with every M8 helper + route registered (or `// not-subject-to-meta: <reason>` annotated).
- [ ] `tests/reports/_amendmentContractMetaTest.test.ts` created with structural guards (every URL-writing UPDATE has the lease_holder AND clause; no code-search call sites; no `Date.now`-derived horizon comparisons).
- [ ] `tests/messages/_metaAdminAlertCatalog.test.ts` extended with new producer codes.
- [ ] `tests/messages/codes-coverage.test.ts` exists and passes (AC-8.8; overlap with AC-X.1).
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `pnpm verify:spec-amendment` exits 0.
- [ ] Self-consistency sweep gates from §6 watchpoint 25 all pass.
- [ ] All commits follow `<type>(<scope>): <summary>` format. One commit per task per AGENTS.md §1.6.
- [ ] **Impeccable evaluation §12 closed** on §B's UI surface (ReportButton + ReportModal). Zero unresolved HIGH/P0/P1 findings.
- [ ] Adversarial review (per `superpowers:adversarial-review` with Opus 4.7 / Claude Code per ROUTING.md) ran to convergence — recorded in convergence log below.
- [ ] Working tree clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.

## 9. Sandbox / git protocol

- [ ] **§A (Codex CLI with relaxed sandbox):** commits run in-session. Verify before starting that the sandbox is actually relaxed — run `git status` first; if it errors with permission-denied, switch to the patch-then-commit-outside protocol per HANDOFF-TEMPLATE.md §9 bullet 2. M5 + M6 + M7 all ran successfully with the relaxed sandbox.
- [x] **§B (Claude Code):** commits run in-session, no sandbox issue. Use `Bash` for `git add` + `git commit`.

Per AGENTS.md "Codex-specific notes": default reasoning level to high. Don't narrate tool calls. Match output verbosity to the task. Codex's known strength is broader integration footprint; the risk is bigger patches than necessary — before declaring a task done, grep the repo for parallel surfaces the change should also touch (e.g., the original-worker tail mirrors the retry-worker tail; the per-show alert codes all share the `(coalesce(show_id::text, ''), code)` UPSERT shape).

## 10. Adversarial review handoff

After §A + §B converge on backend + UI:

1. §A summarizes what was built and confirms each per-task checklist is `- [x]`. §B does the same.
2. The adversarial reviewer (Opus 4.7 / Claude Code per ROUTING.md M8 row) is invoked via `/codex:adversarial-review --base badbb15 --scope branch` (M6.5 close-out is the M8 implementation baseline; scopes the diff to M8 implementation only, not post-M7 housekeeping). If the kickoff SHA differs (post-handoff doc commits land before §A starts), capture the actual milestone-base SHA in §0 of the convergence log. Inputs: spec §13 + §13.2.1 + §13.2.2 + §13.2.3 + §4.1 + §4.6 + §12.4 + §14.3 + §17.1, the M8 plan (`08-bug-report.md`), this handoff, and the diff `git diff <M8-base-SHA>..HEAD -- 'lib/reports/**' 'lib/github/**' 'app/api/report/**' 'app/api/cron/report-reaper/**' 'components/shared/ReportButton.tsx' 'components/shared/ReportModal.tsx' 'components/layout/Footer.tsx' 'lib/messages/catalog.ts' 'tests/reports/**' 'tests/github/**' 'tests/db/reports-schema.test.ts' 'tests/messages/codes-coverage.test.ts' 'tests/messages/_metaAdminAlertCatalog.test.ts' 'tests/e2e/report-modal.spec.ts' 'scripts/verify-spec-amendment-3.sh' 'vercel.json' '.env.local.example' 'docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md'`. The path filter is exhaustive, not representative; if a path is missing here add it at kickoff.
3. Reviewer iterates with implementers until convergence (no new issues raised in a round) or until ambiguity requires a human decision. **Per the M5/M6/M7 retrospective, expect 5–15 rounds.** The meta-test inventory in §13 below should reduce churn but won't eliminate it.
4. Each round's findings are routed by file path:
   - Backend (`lib/reports/**`, `lib/github/**`, `app/api/report/**`, `app/api/cron/report-reaper/**`, `lib/messages/catalog.ts`, `tests/reports/**`, `tests/github/**`, `scripts/**`, migrations) → Codex via `/codex:rescue --fresh` for the FIRST repair dispatch of a round, inlining the full review verdict + findings + class-sweep evidence in the prompt; subsequent same-round repair dispatches CAN use `--resume-last` since a warm task thread now exists for the round (per the corrected `feedback_adversarial_review_repair_routing.md` — `task` threads and `adversarial-review` threads are isolated per-class in codex-companion; the previously-documented "`--resume-last` continues the review thread" claim was false, confirmed by the M8 R1 failure: companion emitted `"No previous Codex task thread was found for this repository"`).
   - UI (`components/shared/ReportButton.tsx`, `components/shared/ReportModal.tsx`, `components/layout/Footer.tsx`, `tests/e2e/report-modal.spec.ts`) → Opus inline (this session).
   - Cross-implementer findings get coordinated through this doc's convergence log.
5. **Adversarial review must keep full-milestone scope, not narrow per-round** (memory `feedback_adversarial_review_full_milestone_scope.md`). Each round anchors to the M8 milestone-base SHA, not the previous round's fix-base. The final APPROVE attests to the whole milestone, not just the latest fix.
6. **Every review round starts fresh-eyes.** Round-N review focus text leads with a fresh-eyes audit of the full current milestone diff against the spec / plan / watchpoints (memory `feedback_review_prompt_fresh_eyes_first.md`). Prior findings + commit SHAs are allowed only as a secondary regression checklist after the fresh-eyes instruction.
7. Convergence is logged at the bottom of this file.
8. **Canonical invocation discipline.** Cross-CLI Codex reviews go through `/codex:adversarial-review` with proper `CLAUDE_PLUGIN_DATA` per-session scoping. Do NOT raw-shell `node codex-companion.mjs`. (Per memory `feedback_adversarial_review_canonical_invocation.md`.)
9. **Class-sweep before patching findings; meta-contract test when bug class recurs.** Both rules are load-bearing project invariants per AGENTS.md and the M5/M6/M7 retrospectives. M8 §13 below pre-declares meta-tests so the rule kicks in at plan time.
10. **Same-vector recurrence rule** (AGENTS.md §1 line 75; codified after M7 R20–R26). 3 consecutive rounds on the same vector → comprehensive re-analysis BEFORE the next review fires. M8 candidate vectors enumerated in §6 watchpoint 8.

## 11. Cross-milestone dependencies

**(a) M2 schema (`reports`, `admin_alerts`, `report_rate_limits`).** M2 shipped the schema; M8 only consumes. Task 8.1 verifies the columns + index are present via `pg_get_indexdef`. If anything is missing, **fix Task 2.2 (do NOT add a parallel migration in M8).**

> **Recommended disposition:** Codex verifies at Task 8.1 kickoff. If any column is missing (`idempotency_key uuid NOT NULL`, `processing_lease_until timestamptz`, `lease_holder uuid`, the partial-not-null index for fast reaper scans), surface to orchestrator immediately and update Task 2.2.

**(b) M4 message catalog (`lib/messages/catalog.ts` + `lib/messages/lookup.ts`).** M5-shipped, M6/M7-extended. M8 EXTENDS with the REPORT_* + GITHUB_BOT_LOGIN_MISSING codes (some already present per `lib/messages/catalog.ts:671-690`; verify and add the rest by Task 8.3d / 8.5).

> **Recommended disposition:** Codex extends the catalog in Tasks 8.3d / 8.5 in the same commits that produce each code. The `tests/messages/_metaAdminAlertCatalog.test.ts` registry adds rows in the same commit.

**(c) M5 advisory-lock helper (`lib/db/advisoryLock.ts`).** **NOT consumed by M8** — reports are cross-show; no per-show `pg_advisory*` surface. The §1.2 invariant is preserved by M8 doing nothing new in this domain.

> **Recommended disposition:** No-op. If a future M8 patch adds an advisory lock, document the holder layer in §5 above before merging and extend `tests/auth/advisoryLockRpcDeadlock.test.ts`.

**(d) M5-D9 / M5-D10 / M5-D11 — operator-log structured sink (INHERITED DECISION).** Three M5 deferrals route the structured operator-log sink to "M6 (drive-sync) or M8 (bug-report) — whichever lands the sink first." **M6 did NOT ship it. M6.5 did NOT ship it. M7 did NOT ship it.** Verify at M8 kickoff: `ls lib/operatorLog/ 2>&1` returns "No such file or directory." **M8 is the last milestone with the deferral name on the menu — either ship it or rename the deferral home.** Silently finishing M8 with the three deferrals still pointing at M6/M8 is a discipline regression.

**Kickoff decision (2026-05-12): Option B — push to M11 ops-hardening.**

Verified `ls lib/operatorLog/ 2>&1` returns "No such file or directory." M8 will not land the structured operator-log sink. Rationale: M8's ratified scope is the §13.2.3 report pipeline and `admin_alerts` emissions; landing the sink here would require new operator-log storage plus auth-route producer work in `app/auth/callback/route.ts`, `app/api/auth/redeem-link/route.ts`, and `app/auth/sign-out/route.ts`, doubling the review surface while the §13.2.3 lease/recovery amendments are the milestone's convergence risk. `DEFERRED.md` now renames M5-D9 / M5-D10 / M5-D11 to M11 ops-hardening with this rationale.

**(e) M2 / cross-cutting (`reports.show_id` foreign-key behavior on show deletion).** Plan does not specify; spec §4.1 schema may declare an FK constraint. If a show is deleted while reports exist for it, the FK cascade behavior determines whether the reports are also deleted. **Verify at Task 8.1 kickoff** by reading the M2 migration; if `ON DELETE` is unspecified, surface as a cross-cutting question.

**(f) M9 polish + admin_alerts UI.** M9 (per ROUTING.md) is all-Opus polish. The `admin_alerts` UI (banner, queue depth, two-tap confirm, raised_at format — see DEFERRED.md M5-D3) is M9 territory. M8 PRODUCES the alert rows; M9 may refine the banner. **M8 does not block on M9.** M9 will refine the UI for the codes M8 produces.

**(g) X.* cross-cutting (`tests/messages/codes-coverage.test.ts` — Task 8.5).** AC-8.8 (`every error code surfaced anywhere in the app maps to a row in §12.4`) is the M8 deliverable for the AC-X.1 (`§12.4 catalog ↔ runtime parity`) cross-cutting test. The two are aligned but not identical — AC-X.1 will exercise the test more thoroughly in the cross-cutting X.* milestone. M8 ships the test scaffolding; X.* will harden the parser-side spec-prose extraction.

> **Recommended disposition:** Task 8.5 ships the two-way parity test against `lib/messages/catalog.ts`; the §12.4 spec-prose extraction half can be a TODO marked for X.*.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**APPLIES — §B Task 8.4 ships UI surface.** The dual run happens AFTER §B implementation closes and BEFORE adversarial review. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

UI surface reviewed:

- `components/shared/ReportButton.tsx`
- `components/shared/ReportModal.tsx`
- Modified `components/layout/Footer.tsx` (the integration touchpoint)

Lightweight pass expected (one button + one modal; not a full-page surface). The modal is the more substantial deliverable — the idempotency-key lifecycle state machine, `sessionStorage` persistence, resume UI with draft pre-fill, "Start a new report anyway" warning copy, terminal-success rotation logic. Likely heuristic categories:

- **A.x accessibility floor**: focus trap inside the modal dialog; initial focus on textarea; focus restoration on close; `aria-live` on submit-status transitions; `role="status"` for the resume / new-report banner.
- **C.x tap-target sizing**: footer button + modal CTAs ≥44px on mobile.
- **G.x error-state copy**: every server-error code routed through `lib/messages/lookup.ts`; resume copy + new-report warning copy reviewed for clarity.
- **H.x animation**: modal open/close transitions respect `prefers-reduced-motion`.

Findings + dispositions in the table format established by M5 / M7:

```
critique findings: <Finding ID> — <severity> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
audit findings: <P0-P3> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
```

- [x] `/impeccable critique components/shared/ReportButton.tsx components/shared/ReportModal.tsx components/layout/Footer.tsx` — Design Health Score **38/40** (Strong). Deterministic CLI scan `npx impeccable --json` returned `[]` (zero AI-slop / absolute-ban findings). Cognitive load: 0 failures (low/good). Persona walkthroughs (Doug + crew on venue floor) — no P0/P1 red flags. Five P2/P3 findings surfaced.
- [x] `/impeccable audit components/shared/ReportButton.tsx components/shared/ReportModal.tsx components/layout/Footer.tsx` — Audit Health Score **20/20** (Excellent). A11y 4/4 (focus trap + ARIA + 44px tap targets + reduced-motion); Performance 4/4; Responsive 4/4; Theming 4/4 (full DESIGN.md token compliance); Anti-Patterns 4/4 (CLI scan clean).
- [x] `DEFERRED.md` updated — none required; all 5 P2/P3 findings fixed in-milestone per user disposition.
- [x] Dispositions inline below.

### §12 dispositions (zero unresolved HIGH/P0/P1)

```
critique findings:
  C1 — P2 — No Cmd/Ctrl+Enter submit shortcut — disposition: fixed in §B commit (textarea keydown handler; default Enter still inserts newline)
  C2 — P2 — Subhead "we'll get a person on it" is ambiguous — disposition: fixed in §B commit (surface-specific copy: crew "Doug will see your report"; admin "This files a GitHub issue for Eric to triage")
  C3 — P3 — Success state lacks ✓ icon affirmation — disposition: fixed in §B commit (inline SVG check; `report-modal-success-icon` testid)
  C4 — P3 — Drag handle is visual-only — disposition: kept as visual sheet indicator (no cursor-grab — would imply nonexistent drag); decision documented in code comment
  C5 — P3 — Subhead copy ambiguity — duplicate of C2 above
audit findings:
  A1 — P2 — No fetch timeout (modal could hang on a stalled connection) — disposition: fixed in §B commit (AbortController + 30s default timeout; configurable via submitTimeoutMs prop for tests)
  (No P0/P1/Other findings.)
```

The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged. §12 is closed; convergence log appends below as the full-milestone adversarial review proceeds.

## 13. Meta-test inventory (AGENTS.md writing-plans rule — pre-declared at handoff time)

Per AGENTS.md §1.9 + the M5/M6/M7 retrospectives: pre-declare the meta-tests at plan/handoff time, NOT round 14. M4 §8.3 (8 rounds), M5 R14–R18 (6 rounds), M6 R8–R13 (5 rounds) all became cheap once the meta-test landed; the rounds disappear when the registry exists from day 1.

For each candidate class below, **create / extend / N/A — <reason>**:

- [x] **(NEW) Supabase + GitHub call-boundary discipline — CREATE `tests/reports/_metaInfraContract.test.ts`** (analogous to `tests/auth/_metaInfraContract.test.ts` M5-shipped and `tests/sync/_metaInfraContract.test.ts` M6-shipped). Registers every M8 helper subject to AGENTS.md §1.9 and asserts each surfaces infra throws as discriminable infra-failure (not benign continue). Initial registry rows: `leaseProtocol.acquire`, `leaseProtocol.extend`, `leaseProtocol.release`, `submitReport` (the route's main entry), `enforceQuota`, `reconcileBeforeCreate`, `findIssueByMarker`, `createIssue`, `handleTailUpdateMiss`, `expiredLeaseRetry`, every M8 route handler (`app/api/report/route.ts`, `app/api/cron/report-reaper/route.ts`). New call sites EITHER add a registry row OR carry `// not-subject-to-meta: <reason>`. The meta-test mocks Supabase to throw at construction / `getUser` / `rpc` / `from` / `select` / `update` / `insert` / `upsert` / `delete` AND mocks Octokit to throw at `issues.create` / `issues.update` / `issues.listForRepo`, asserting each helper surfaces a discriminable infra-failure result.

- [x] **(NEW) `admin_alerts` catalog completeness — EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** (M5-shipped, M6/M7-extended). New M8 rows: `REPORT_ORPHANED_LOST_LEASE`, `GITHUB_BOT_LOGIN_MISSING`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT` (plus the `REPORT_HORIZON_EXPIRED` client-facing code if it appears in `admin_alerts` upserts anywhere — verify at Task 8.3d close). Every code with non-null `dougFacing`. Producer enumeration in the registry; the test scans for unregistered `admin_alerts.upsert(...)` (or `INSERT INTO admin_alerts ... ON CONFLICT ... DO UPDATE`) calls across `lib/reports/**` + new M8 route handlers + the reaper.

- [x] **(NEW) `tests/messages/codes-coverage.test.ts`** (Task 8.5). Two-way parity: every code in source → in catalog; every code in catalog → emitted from at least one synthesizable scenario. M8 deliverable for AC-8.8; overlaps with AC-X.1 (cross-cutting will harden the spec-prose-extraction half).

- [x] **(NEW) Amendment contract structural meta-test — CREATE `tests/reports/_amendmentContractMetaTest.test.ts`** (M8-introduced structural class). Three structural guards corresponding to the three §13.2.3 amendments:
  1. **Amendment 1 — no code-search call sites:** asserts that no code path in `lib/reports/**`, `lib/github/**`, or `app/api/report/**` calls `octokit.rest.search.issuesAndPullRequests` (or anything matching `octokit.rest.search.*`). The single recovery primitive is `findIssueByMarker` via `listForRepo`.
  2. **Amendment 3 — every URL-writing UPDATE has the `lease_holder` AND clause:** scans `lib/reports/**` for every SQL UPDATE statement (or `db.query` call with `UPDATE reports`) that mutates `github_issue_url`; asserts the WHERE clause contains `lease_holder = ` (parameter reference). Without this, a stolen-lease worker can corrupt the row.
  3. **Amendment 2 — no `Date.now`-derived horizon comparisons:** scans `lib/reports/**` and `lib/github/**` for `Date.now()` references; allows only the form `Date.parse(<dbDerivedString>)` inside `findIssueByMarker` (single allow-listed call site), OR an inline `// not-DB-time: <reason>` annotation. The horizon predicate is authoritative in SQL (`created_at < now - interval '24 hours'`), never in JS.

  This is the structural backstop for the three amendments — without it, future refactors can silently violate any of the three contracts without breaking unit tests. The amendment-3 row mirrors the M7 reel 4-column atomic-NULL meta-test pattern (`tests/sync/_reelColumnAtomicContract.test.ts`).

- [N/A] **Supabase call-boundary discipline (`tests/auth/_metaInfraContract.test.ts`)** — **N/A — M8 creates its own analogous `tests/reports/_metaInfraContract.test.ts` (row 1 above) because the reports surface is large enough to warrant a dedicated registry, mirroring M6's choice to create `tests/sync/_metaInfraContract.test.ts`.** New auth-side helpers in M8 (if any — currently none) would extend the existing M5-shipped auth meta-test.

- [N/A] **Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`)** — **N/A — M8 introduces no new `pg_advisory*` surfaces.** Reports are cross-show; the lock surface is empty for `lib/reports/**` (per §5 invariant 2 above). If a future M8 patch adds an advisory lock, this row becomes mandatory.

- [N/A] **Sentinel hiding in optional text (`tests/components/tiles/_metaSentinelHidingContract.test.ts`)** — **N/A — M8's UI surface (ReportButton + ReportModal) does not render tile-shape optional text** (no `'TBD'` / `'—'` / `'FALSE'` sentinel risk; the modal text is user-typed draft + server-derived status copy). The existing M4 meta-test continues to cover the tile-render contract.

- [N/A] **No-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`)** — **N/A — M8 doesn't read emails from any source.** The M6-extended glob already covers `lib/admin/**` + `lib/sync/**`; `lib/reports/**` and `lib/github/**` have no email-reading surface so the test passes trivially. If a future M8 patch adds email reads, AGENTS.md §1.3 applies and the meta-test glob must extend.

The four create / extend rows above are mandatory at M8 close. Empty rows silently lie.

---

## Field discipline notes (carry-forward from M5 / M6 / M7 handoffs)

- **"Spec sections in scope" is exhaustive, not representative.** M8 brushes §13.1 + §13.2 + §13.2.1 + §13.2.2 + §13.2.3 + §4.1 + §4.6 + §12.4 + §14.3 + §17.1 — listed all ten.
- **"AC list" uses canonical AC IDs.** M8 covers AC-8.1..AC-8.13 (13 entries) plus the AC-8.8 / AC-X.1 overlap.
- **"Pre-handoff state" is verified by command, not assertion.** Every "tests passing" check has a command.
- **"Watchpoints" is the most valuable section.** M5/M6/M7-carry-forward classes 1–11 + M8-specific 12–25 — preload the reviewer rather than discover at round N.
- **"Exit criteria" includes the convergence step.** M8 is not done at "tests pass"; it's done at "tests pass AND adversarial review converged AND impeccable §12 closed on §B's UI surface."

---

## Convergence log

_(Append here after impeccable evaluation closes and adversarial review begins.)_

### §A backend pre-reconvergence review (Codex implementer → Claude reviewer)

- **Base:** `badbb15` (M6.5 close / scoped M8 implementation baseline).
- **Round 1 verdict:** `NEEDS_ATTENTION`.
  - HIGH — `lib/reports/submit.ts` `handleLookupInconclusive` collapsed the plan-mandated 2-gate state-gated alert flow by ignoring the `upsertStateGatedLookupAlert` boolean and returning false 502s.
  - HIGH — `lib/reports/submit.ts` depth-3 `REPORT_LEASE_THRASHING` path had the same single-gate collapse and could return false 503s.
  - MEDIUM — `lib/github/issues.ts` defaulted missing `GITHUB_REPO` to `edweiss412/FX-Webpage-Template` instead of failing closed.
- **Fix SHA:** `bb520af` (`fix(reports): close state-gated alert review findings`).
  - Added shared `resolveStateGatedAlert` first-gate → redispatch → second-gate → redispatch → unconditional `raced_back_twice` fallback.
  - Routed both lookup-inconclusive and lease-thrashing producers through the shared helper.
  - Removed the hardcoded GitHub repo fallback and added fail-closed coverage for missing `GITHUB_REPO`.
  - Added regression coverage in `tests/reports/stateGatedAlert.test.ts`, `tests/github/issues.test.ts`, `tests/reports/_amendmentContractMetaTest.test.ts`, and `tests/reports/_metaInfraContract.test.ts`.
- **Round 2 verdict:** `APPROVED` (`Findings: none`).
- **Verification at approval:** `pnpm test && pnpm lint && pnpm typecheck && pnpm verify:spec-amendment` passed. Lint emitted only the pre-existing Next `<img>` warnings in `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx`.

### §B UI close-out (Opus / Claude Code implementer) — 2026-05-12

- **Base:** §A approval at `73291f8` + §0 pinned contract at `1d55cb5`.
- **Files shipped:**
  - `components/shared/ReportModal.tsx` (NEW) — state machine + sessionStorage lifecycle + bottom-sheet/dialog topology + 6 states (composing / submitting / failed-retryable / succeeded / expired / new-report-warning).
  - `components/shared/ReportButton.tsx` (NEW) — trigger button + conditional modal mount; surface variants (crew text / admin accent).
  - `components/layout/Footer.tsx` (modified) — receives `showId` + `showSlug` props; mounts the crew-surface ReportButton when in scope.
  - `app/show/[slug]/page.tsx` (modified) — passes `showId` + `slug` to Footer.
  - `components/admin/StagedReviewCard.tsx` (modified) — receives `showId` prop; mounts the admin-surface "Report this parse" button with per-row autocapture (stagedId, driveFileId, sourceKind, triggeredReviewItems, parseSummaryLine / warningSummary).
  - `components/admin/ParsePanel.tsx` (modified) — forwards `showId` prop to each StagedReviewCard.
  - `app/admin/show/[slug]/page.tsx` (modified) — passes `showId={show.id}` to ParsePanel.
  - `lib/messages/catalog.ts` (modified) — added crew-facing copy to `REPORT_LEASE_THRASHING` (was admin-only; the modal can render this code if the route returns 503 to a crew caller).
  - `tests/components/report/ReportModal.test.tsx` (NEW) — 35 tests covering submit body shape, idempotency-key reuse across nonterminal paths (502, 409, close+reopen, edited draft, plain cancel), key rotation on terminal success (201 admin / 201 crew / 200 duplicate / 200 recovered) + explicit Start-fresh opt-in, sessionStorage scoping per surface, full state-machine transitions, surface-specific copy, ✓ icon, Cmd/Ctrl+Enter shortcut, fetch timeout abort.
  - `tests/components/report/ReportButton.test.tsx` (NEW) — 7 tests covering surface-appropriate label, tap target, conditional modal mount, autocapture flow, sessionStorage scope isolation.
  - `tests/e2e/report-modal.spec.ts` (NEW) — mobile-safari Playwright happy path + 502 retry + close/reopen resume + Start-a-new-report warning flow with mocked /api/report (deferred to CI run; matches M7 pattern).
- **AC coverage attested by §B:**
  - AC-8.1 / AC-8.2 — admin click → modal → 201 path → admin success state shows GitHub link. ✓
  - AC-8.4 / AC-8.5 — crew submission → no `github_issue_url` in success state regardless of route return (privacy contract per §13.2.3). ✓ (test "succeeded (crew) does NOT render github_issue_url even if route returns one")
  - AC-8.7 — anonymous → 401 handled via fallback network/generic copy (route-level enforcement; modal-side covered via mock).
  - AC-8.11 / AC-8.12 — 502 retry + close/reopen resume use the SAME idempotency_key. ✓
  - AC-8.13 — concurrent-retry race protected at the route level; modal-side honors `IDEMPOTENCY_IN_FLIGHT` 409 with key reuse. ✓
  - AC-8.9 — same `idempotency_key` POSTed twice → 200 duplicate path; modal treats as terminal, clears sessionStorage, rotates key for next attempt. ✓
- **Pin-stop caveats from §0 dispatched:**
  - Caveat #1 (`expired_pending_recovery` → 409 stub): modal handles 409 by staying in failed-retryable with Retry — behavior identical for stub and post-8.3c implementation. ✓
  - Caveat #2 (`REPORT_LOOKUP_INCONCLUSIVE` neutral copy): catalog entry already reads "We couldn't confirm whether your previous report went through. Please try again in a few minutes." (NOT "lookup failed"). Test "Pin-stop caveat #2: copy must NOT imply only lookup failure" pins it. ✓
  - Caveat #3 (orphan-close-failure → no alert): §B does not consume this path; §A's territory.
- **Impeccable §12 — see above.** Health Scores 38/40 (critique) + 20/20 (audit). Zero P0/P1; five P2/P3 all fixed in-milestone.
- **Verification at §B close-out:**
  - `pnpm test`: 193 files passed, 1 skipped; 2643 tests passed, 5 skipped (+6 from §B).
  - `pnpm lint`: 0 errors, 2 pre-existing M7-D3 `<img>` warnings.
  - `pnpm typecheck`: passed.
- **Working tree:** clean except for this convergence-log update.
- **Next:** full-milestone adversarial review (Opus reviewer per ROUTING.md M8 row) anchored on the §A milestone-base SHA, including the §B diff.

### Full-milestone adversarial review (Codex reviewer → implementer)

- **Base:** `badbb15` (M6.5 close / scoped M8 implementation baseline).
- **Scope:** `git diff badbb15..HEAD` over the M8 path filter (39 files, 5701 insertions; full filter in §10 step 2).
- **Pre-flight gates at R1 dispatch:** all green.
  - `pnpm test`: 193 files / 2643 tests pass (1 / 5 skipped).
  - `rg "octokit\.rest\.search|searchIssuesByMarker" lib/reports lib/github app/api/report`: empty (Amendment 1).
  - `rg "lastPollAt" lib/reports lib/github`: empty (§1.4).
  - `rg "Date\.now|Date\.parse" lib/reports lib/github`: only the 2 allow-listed `Date.parse(cutoffIso)` / `Date.parse(issue.created_at)` sites in `lib/github/issues.ts` `findIssueByMarker` (Amendment 2 shape).
  - All 3 `UPDATE reports ... github_issue_url` UPDATE call sites carry `AND lease_holder = $myToken` (Amendment 3 sweep), with the documented exception `writeRecoveredIssueUrl` at `lib/reports/submit.ts:268-283` (post-recovery write bounded by horizon).
  - `lib/github/issues.ts:169` `createIssue` auto-appends `FXAV_APP_REPORT_LABEL` via `labelsWithReserved` (reserved-label provenance).
- **R1 dispatch operational notes (carried forward for future rounds):**
  - First two dispatches at 16:34Z and 21:08Z failed with non-review tooling errors — Codex quota exhausted, then auth-token rotation after `codex login` was re-run. Re-dispatch at 21:13Z executed normally. Cached focus prompt at `/tmp/m8-r1-focus.txt` (full fresh-eyes + 15 priority vectors) was reused verbatim.
  - Companion invocation: `node "$CLAUDE_PLUGIN_ROOT/scripts/codex-companion.mjs" adversarial-review --background --base badbb15 --scope branch "$FOCUS" < /dev/null` with `CLAUDE_PLUGIN_ROOT=/Users/ericweiss/.claude/plugins/cache/openai-codex/codex/1.0.4` and per-session `CLAUDE_PLUGIN_DATA` / `CODEX_COMPANION_SESSION_ID` envs.
  - Codex emitted one false-start intermediate verdict ("can't review without inspecting code") immediately after loading the using-superpowers skill, then self-corrected and ran the actual review.
- **R1 verdict (2026-05-12 21:17Z, job `review-mp34nj6e-q4j2xl`):** `NEEDS_ATTENTION`.
  - **HIGH** — `lib/reports/submit.ts:101-199` — Report issues do not use the §13.2.1/§13.2.2 templates and admin attribution is not durable. `reporterFor` stores `reported_by = "admin"` (literal string) instead of `<admin email>` per AC-8.2; `issueInput` builds a minimal body (surface + freeform message + show_id + reporter_kind + marker) that omits all the autocapture context already gathered in `reportContext`, plus admin email, show title/slug, field ref, parse warnings, raw snippet, last sync, drive file ID, reporter URL (admin) and role flags, visible section, page state, last sync, stale tier (crew). Also, `reporterFor` doesn't return / persist `reporter_role` per AC-8.5. Confirmed by re-reading `lib/reports/submit.ts:101-200` against spec §13.2.1, §13.2.2, AC-8.1, AC-8.2, AC-8.4, AC-8.5.
  - **HIGH** — `app/show/[slug]/page.tsx:742` — Crew footer report mount sends no autocaptured page context. The live crew page mounts `<Footer asOf={null} showId={showId} showSlug={slug} />` without `reportAutocapture`, so the modal POST only carries the user's draft + `surface: "crew"`. Required crew autocapture (viewerVisibleSection, userAgent, lastSyncTimestamp, staleTier, rightNowState, fieldRef, parseWarnings, rawSnippet) is absent at the integration boundary. Confirmed: `Footer.tsx:56,73,101-108` already accepts and forwards `reportAutocapture` correctly; `components/admin/StagedReviewCard.tsx:492-512` shows the wiring pattern is implemented for admin surface but missing on crew page mount. Class-sweep: only one Footer mount in scope (signed-link `app/show/[slug]/p/page.tsx` doesn't render its own Footer; neither does `app/show/[slug]/layout.tsx` nor `app/layout.tsx`).
  - **MEDIUM** — `tests/reports/_metaInfraContract.test.ts:3-17` — M8 infra-contract meta-test registry is incomplete. Imports only 8 helpers (`acquireReportLease`, `extendReportLease`, `releaseReportLease`, `createIssue`, `closeIssueAsOrphan`, `findIssueByMarker`, `enforceQuota`, `resolveStateGatedAlert`). Missing exported production surfaces that have neither a registry row nor `// not-subject-to-meta:` annotation: `submitReport` (`lib/reports/submit.ts:670`), `handleTailUpdateMiss` (`lib/reports/submit.ts:612`), `reserveQuota` (`lib/reports/rateLimit.ts:89`), `runReportReaper` (`app/api/cron/report-reaper/route.ts:23`), `POST` (`app/api/report/route.ts:89`), cron `GET` (`app/api/cron/report-reaper/route.ts:61`). Violates AGENTS.md §1.9 and handoff §13 row 1 promised registry.
- **R1 routing:**
  - HIGH-1 (issue templates + admin attribution) — `[§A/backend]` → Codex `task --background --write --fresh` dispatch with full R1 verdict + finding + class-sweep evidence inlined as upfront context (`/tmp/m8-r1-rescue-fresh.txt`). The initial dispatch attempted `--resume-last` per the prior (incorrect) workflow guidance and failed with `errorMessage: "No previous Codex task thread was found for this repository"` — the companion's `task` and `adversarial-review` job classes are isolated per-class, so `--resume-last` on a `task` job NEVER reaches a `review` thread. The corrected workflow + retrospective memory update landed in this session (see `memory/feedback_adversarial_review_repair_routing.md` and §10 step 4 above).
  - HIGH-2 (crew autocapture wiring) — `[§B/UI]` → patched inline in this Opus session at SHA `a7ff26f` (`fix(report): wire crew Footer autocapture + userAgent fallback (R1 H2)`): `app/show/[slug]/page.tsx:742` now passes `reportAutocapture={{ rightNowState: rightNowCtx }}` through the Footer's existing prop; `components/shared/ReportModal.tsx` auto-attaches `navigator.userAgent` at submit time when the caller doesn't override. Two new tests in `tests/components/report/ReportModal.test.tsx` (R1 H2 navigator fallback + caller-override precedence) pass; full `pnpm test` 2645/2650 pass; `pnpm lint` clean (only pre-existing M7-D3 `<img>` warnings); `pnpm typecheck` clean.
  - MEDIUM-3 (meta-test registry) — `[§A/backend]` → bundled into the same Codex `--fresh` dispatch as HIGH-1.
- **Codex regression-check summary (R1 §3):** Amendment 1/2/3 code-shape sweeps passed; §A R1-R2 `bb520af` state-gated alert fix preserved through subsequent backend commits (5636708, 423325c, efa4d57, 1954798).
- **R1 closure verification at HEAD `b60f7b0`:** `pnpm test` 194 / 2655 pass (1 / 5 skipped — +10 over the §B-close baseline of 193 / 2645, accounting for the 8 new issueBody.test.ts cases + 2 new ReportModal.test.tsx cases). `pnpm typecheck` exit 0. `pnpm lint` clean (only pre-existing M7-D3 `<img>` warnings). No UI files touched by §A rescue (`git diff --stat a7ff26f..HEAD | grep -E "components/|app/(show|admin)/"` returned empty). Working tree clean. Per Codex's final report at `task-mp35y0zd-fm8hv3`: 24 exported helpers / routes in `lib/reports/**`, `lib/github/**`, `app/api/report/**`, `app/api/cron/report-reaper/**` = 14 registry rows + 10 `// not-subject-to-meta:` annotations.

- **R2 verdict (2026-05-12 22:10Z, job `review-mp36lj8i-bzvjur`):** `NEEDS_ATTENTION`. Two MEDIUM findings; R1 H1/H2/M3 regression checks passed.
  - **MEDIUM** — `app/api/cron/report-reaper/route.ts:64-78` — Reaper deletes stale reports without producing the required `admin_alerts` signal. Handoff §4.6 / §13 inventory list `STALE_ORPHAN_REPORT` as a global `admin_alerts` producer code; the implementation inserts a `sync_log` row instead. `tests/messages/_metaAdminAlertCatalog.test.ts` also omits `STALE_ORPHAN_REPORT` from the producer registry. Class-sweep (`rg "STALE_ORPHAN_REPORT" --include "*.ts" --include "*.tsx"`): only one production write site (the reaper); catalog entry exists at `lib/messages/catalog.ts:812-813`.
  - **MEDIUM** — `components/shared/ReportModal.tsx:374-377` — Crew modal subhead reads `"Doug will see your report."`, which directly inverts spec §13.1 (line 2982): the spec mandates `"This goes to the developer, not Doug. For show-content questions, message Doug directly."` The original impeccable §12 C2 disposition that authorized the inverted copy was wrong against the spec. The wording matters — it prevents the bug-report flow from drifting into a PM / content-escalation path. Class-sweep (`grep "Doug" components/shared/ReportModal.tsx components/shared/ReportButton.tsx`): one production copy site; one test asserting the wrong wording at `tests/components/report/ReportModal.test.tsx:703`.
- **R2 routing:**
  - MEDIUM-M2 (crew modal subhead) — `[§B/UI]` → patched inline in this Opus session at SHA `9a79c4e` (`fix(report): crew modal subhead matches §13.1 channel-boundary copy (R2 M2)`). Replaced subhead with verbatim spec wording. Split the surface-specific test into two sharper assertions (crew + admin) with a negative-regression check that the inverted wording does NOT appear. Tests 37/37 pass on ReportModal suite. Impeccable §12 C2 disposition now wrong against the spec — flagged for future impeccable runs to spec-check copy before approving wording changes.
  - MEDIUM-M1 (reaper → admin_alerts) — `[§A/backend]` → Codex `task --background --write --fresh` dispatch (`task-mp36t2lr-uh7bka`, started 2026-05-12 22:13Z) with the R2 verdict text + class-sweep evidence + open routing question (global vs per-show) + suggested SQL UPSERT pattern inlined. Per the corrected workflow (memory `feedback_adversarial_review_repair_routing.md`), this is R2's first §A repair so `--fresh` was the correct flag. Codex closed at SHA `215e5e8` (`fix(reports): reaper emits STALE_ORPHAN_REPORT admin_alerts UPSERT (R2 M1)`). Routing decision (Codex chose, orchestrator confirmed): **per-show admin_alerts rows, no sync_log dual-write**. Rationale: the deleted row carries `show_id`; per-show keying preserves actionable triage and matches the canonical partial-unique recurrence semantics used by REPORT_ORPHANED_LOST_LEASE / REPORT_LOOKUP_INCONCLUSIVE / etc. Single durable sink (admin_alerts) keeps recurrence in one unresolved row. The handoff §4.6 "global" annotation is therefore CORRECTED: STALE_ORPHAN_REPORT is per-show, not global; the inventory text should be reconciled in a future docs pass. Codex implemented the fix in its sandbox but could not commit due to `.git/index.lock EPERM`; the orchestrator (Opus session) committed verbatim with co-authorship attribution.
- **R2 closure verification at HEAD `215e5e8`:** Codex's report: `pnpm test` 194 / 2659 pass (+4 over R1 baseline = 2 issueBody fixture cases + per-show reaper assertions). `pnpm lint` clean. `pnpm typecheck` exit 0. `pnpm verify:spec-amendment` exit 0. Negative-regression verified by TDD red before production edit. Orchestrator will re-verify and gate on `pnpm test` before dispatching R3.
- **R2 Codex regression-check summary:** R1 H1 / H2 / M3 fixes all still passing per the R2 §3 verdict; no reopened issues in the inspected surfaces.
