# Notify email batching — one email per kind per recipient per tick

**Date:** 2026-07-16
**Status:** Draft (autonomous-ship pipeline; user gates waived)
**Problem:** The realtime notify cron sends one email per candidate per recipient. A wizard run publishing 7 shows mints 7 `auto_publish_undo` candidates and lands 7 near-identical emails in the same minute (observed 2026-07-16). The same fan-out shape exists for per-show sync problems and stuck ingestions. Email should feel useful, not noisy.

## 1. Scope

Batch same-group realtime candidates into ONE email per recipient per notify tick, inside `deliverRealtimeCandidates` (`lib/notify/deliver.ts:389`). Three batch groups:

| Group | Candidate kinds (`lib/notify/detect/candidates.ts:56-60`) | Ledger `kind` | Template family |
| --- | --- | --- | --- |
| `published` | `auto_publish_undo` | `auto_publish_undo` | `renderAutoPublishUndo` (`lib/notify/templates/autoPublishUndo.ts:50`) |
| `sync_problems` | `show`, `global` | `realtime_problem` | `renderRealtimeProblem` (`lib/notify/templates/realtimeProblem.ts:43`) |
| `stuck_files` | `ingestion` | `realtime_problem` | `renderRealtimeProblem` |

**Out of scope (explicit):** `deliverDigest` (`lib/notify/deliver.ts:461`) — already one email per recipient per day; `lib/drive/watchEscalation.ts` — singleton escalation email; `email_deliveries` schema (`supabase/migrations/20260602000004_b3_email_deliveries.sql`, kind CHECK widened in `20260612000002_m12_13_undo_schema.sql:13-15`) — unchanged; reconciliation (`lib/notify/detect/emailDeliveryFailed.ts`) — unchanged; candidate detection (`lib/notify/detect/candidates.ts:119`) — unchanged; `runNotify.ts` toggle gating and `kept` filtering (`lib/notify/runNotify.ts:321-324`) — unchanged; no UI, no DB migration. One NEW advisory-lock surface exists (the single-flight guard, §2.1b) — it introduces a new hashkey with a single JS-side holder and touches none of invariant 2's guarded tables.

## 2. Behavior contract

### 2.1 Loop restructure (`deliverRealtimeCandidates`)

Current shape: `for candidate → for recipient → isCandidateCurrent → deliverOneRecipient` (`lib/notify/deliver.ts:408-448`), one send per (candidate, recipient).

New shape:

```
for recipient (canonicalized via lib/email/canonicalize.ts — invariant 3, unchanged):
  if recipient canonicalizes empty → skipped += (number of candidates), continue   [today: per-candidate skip in deliverOneRecipient:325-329]
  active ← isRecipientActive(recipient)   [once per recipient; today per candidate×recipient, deliver.ts:340]
  if !active → skipped += (number of candidates), continue
  for group in [published, sync_problems, stuck_files]:
    members ← []
    for candidate in group (input order preserved):
      if !isCandidateCurrent(candidate)            → skipped += 1, continue
      ledger ← existingLedger(kind, candidate.dedupKey, recipient)
      if ledger.status = 'sent'
         or (ledger.status = 'failed' and attempt_count ≥ SEND_RETRY_CAP)  → skipped += 1, continue
      members.push(candidate)
    if members empty → no send
    else → send ONE email for members (see 2.2–2.4)
```

Guard conditions: `input.candidates` empty → zero sends, `{kind:"ok", sent:0, failed:0, skipped:0, retryLater:0}`. `input.recipients` empty → same (caller already short-circuits at `runNotify.ts:325`, but the function must not throw). A group with zero candidates simply produces no email.

`SEND_RETRY_CAP = 3` (`lib/notify/constants.ts:18`). `existingLedger` / `isRecipientActive` / `upsertSent` / `upsertFailed` keep their current signatures and SQL (`lib/notify/deliver.ts:180-282`).

### 2.1b Single-flight guard (adversarial R1)

Batch idempotency keys derive from membership (§2.2), so two concurrent delivery passes could compute DIFFERENT provider keys for the SAME member (run 1 sends `{A}`, run 2 sends `{A,B}`) — a regression against today's stable per-candidate key. Batched delivery is therefore **single-flight**: `deliverRealtimeCandidates` opens a DEDICATED lock client (`postgres(databaseUrl(), {max:1})`, separate from the work connection) and wraps the entire delivery pass in `lockSql.begin(...)` whose first statement is `select pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery'))`. **Transaction-scoped, not session-scoped, deliberately:** a transaction is pinned to one Postgres backend under EVERY pooling mode (direct, session pooler, Supavisor transaction pooler — the deployed `DATABASE_URL`/`TEST_DATABASE_URL` may be a pooler URL, e.g. the non-loopback pooler `pnpm preflight` warns about), so acquire → held-across-sends → release cannot split across backends the way `pg_advisory_lock`/`pg_advisory_unlock` statements can. The lock releases automatically at commit/rollback/connection-drop; there is no unlock statement to mis-route. Work SQL (eligibility, ledger writes) stays on the EXISTING work connection with today's per-statement autocommit — ledger rows persist immediately, never held hostage by the lock transaction. If the try-lock returns false, the pass returns `{kind:"ok", sent:0, failed:0, skipped:0, retryLater:0, lockSkipped:true}` — no sends, no ledger writes; the next tick delivers. `lockSkipped` is a new OPTIONAL field on the ok arm of `DeliveryResult` (`lib/notify/deliver.ts:22-24`); `runNotify` already forwards the whole result as `detail` (`lib/notify/runNotify.ts:371`), so no caller change.

Lock-holder topology (AGENTS.md invariant-2 discipline, applied to a new key): hashkey `notify:realtime-delivery` has **zero existing holders** (`rg "pg_advisory|pg_try_advisory" lib/ supabase/` shows only `show:<drive_file_id>`-keyed holders and their RPC layer); the single holder is the JS-side guard in `deliverRealtimeCandidates`. No RPC or SECURITY DEFINER function touches this key. `email_deliveries` is not one of invariant 2's five guarded tables — this lock is a new, independent surface and must stay single-layer.

`deliverDigest` does NOT take this lock: its provider key is already membership-independent (`digest:<dateET>`, `lib/notify/deliver.ts:478`), so concurrent digest passes stay provider-deduped exactly as today.

**Residual (documented, accepted):** if the provider accepts a batch but NOT all member `upsertSent` rows persist — process crash, DB timeout/connection loss mid-writes, or a thrown `upsertSent` at member k (members 1..k-1's rows persist via per-statement autocommit; the pass then returns `infra_error` per `deliver.ts:452-453`) — the row-less members re-enter the next tick's batch, and if membership ALSO changed by then, the new batch key differs and the provider cannot dedup them. Today's path has the same post-provider-accept failure window but a stable per-candidate key, so the provider (Resend, 24h idempotency TTL) absorbs the retry. Post-batching, the consequence is a duplicate informational email for those members (undo links remain valid — same token; problem emails are stateless), only when a post-accept persistence failure **and** a membership change coincide. Closing it fully would need a durable pre-send claim (a `sending` ledger status = CHECK widening + migration + reconciliation changes in `emailDeliveryFailed.ts`) — deliberately out of scope; revisit only if observed.

### 2.2 Idempotency key

Batch key derives from member identity: `combinedDedupKey = members.map(m => m.dedupKey).sort().join("|")`, then `baseKey(kind, combinedDedupKey, recipient)` (`lib/notify/idempotencyKey.ts:5`). On `idempotency_conflict`, one resend with `reissueKey(kind, combinedDedupKey, recipient)` (`lib/notify/idempotencyKey.ts:10`) — same two-attempt pattern as today (`lib/notify/deliver.ts:352-364`).

The provider-facing key length is CONSTANT regardless of membership size: `baseKey` returns `fxav:<kind>:<sha256 hex>` — the (arbitrarily long) `combinedDedupKey` is hash INPUT, never part of the emitted key (`idempotencyKey.ts:3-7`). No provider header/length concern exists at any N.

**N=1 back-compat invariant:** a single-member batch's `combinedDedupKey` equals that member's `dedupKey`, so the Resend idempotency key is byte-identical to today's. Deploy-skew safe: an email attempted pre-deploy and retried post-deploy dedups at the provider.

Membership change between ticks (member sent, capped, or expired) produces a different combined key — correct, because the email content differs. `|` cannot collide: dedup keys are `showId:code:epoch`, `global:SYNC_STALLED:epoch`, `ingestion:driveFileId:epoch`, `showId:mintId` (`lib/notify/detect/candidates.ts:137-244`) — none contains `|` (UUIDs, codes, epochs, hex mintId, Drive file IDs).

### 2.3 Send outcome → ledger (per member, atomic batch)

One provider send per batch; ALL members share the outcome:

- **ok** → `upsertSent` per member with the shared `provider_message_id`; `sent += members.length`.
- **retry_later** or post-reissue `idempotency_conflict` → no ledger writes; `retryLater += members.length` (mirrors `lib/notify/deliver.ts:371-374`).
- **failed** → `upsertFailed` per member (per-member `attempt_count` increments) and, for each member whose failed-ledger write landed (the `status <> 'sent'` guard at `lib/notify/deliver.ts:278`), one `EMAIL_DELIVERY_FAILED` alert via `upsertAdminAlert` with that member's context recipe (`contextFor`, `lib/notify/deliver.ts:82-111` — the `auto_publish_undo` recipe stays EXACTLY `{slug, title, expires_at, mintId}` per §4.3 R14). Counts are defined by LANDED ledger writes: `failed += 1` per member whose failed-row upsert landed; `skipped += 1` per member whose write the guard suppressed — exactly today's per-candidate semantics (`lib/notify/deliver.ts:376-387`) applied member-wise.

Rows keep today's exact shape — `(kind, dedup_key, recipient)` unique key (`20260602000004_b3_email_deliveries.sql:19`), per-member `dedup_key`, `show_id`, `triggered_codes`, `context`. Reconciliation in `emailDeliveryFailed.ts` (which reconstructs per-member dedup keys, e.g. lines 140-193 and the `auto_publish_undo` mintId path at 212-229) is untouched by construction. Raw bearer token still never persists (candidates.ts:48-53 contract).

Per-member retry-cap consequence: members at cap drop out of the next tick's batch; remaining members form a new (smaller) batch with a new combined key and fresh sends. A member permanently capped while others succeed is the intended outcome.

### 2.4 Rendering

`EmailSource` union (`lib/notify/deliver.ts:45-47`) generalizes from one candidate to a member list; the `published` group stays **per-recipient** (each member's undo link binds `r = recipientBindingFor(recipient, showId, mintId)` — `autoPublishUndo.ts:51`; rendering still happens only after canonicalization + active-recipient check, preserving R17). `sync_problems` / `stuck_files` remain static per batch.

**N=1 renders the existing single templates byte-identical** — `renderAutoPublishUndo` and `renderRealtimeProblem` untouched; existing template tests (`tests/notify/autoPublishUndoTemplate.test.ts`, `tests/notify/templates.test.ts`) keep passing unmodified.

**N≥2 batch templates** (new functions in the same two template files):

- `published` (subject em-dash-free, count first):
  - Subject: `FXAV: ${N} shows published themselves`
  - Body: intro line `${N} shows published themselves and are now live for the crew.` then one block per show: escaped title, `The undo window closes <closesAtAbsolute(expiresAt)> (<aboutHours> from now).` (reuses the ET formatters at `autoPublishUndo.ts:33-48`), link `Take this show offline` → `${origin}/show/${slug}/unpublish?token=${token}&r=${r}` with that show's own recipient-bound `r`. Shared closing paragraph once: the existing `whatUndoDoes` + `ignoring` copy (`autoPublishUndo.ts:60-62`).
- `sync_problems`:
  - Subject: `FXAV: sync problems on ${N} shows` (when the batch contains a `global` member and N counts all members, "shows" is still the noun; a batch that is ONLY the global candidate is N=1 and renders the existing single template).
  - Body: one line per member = the member's existing single-email body text (`show`: catalog `dougFacing` via `messageFor`/`plainCatalogText` with the `<sheet-name>` fill rules at `realtimeProblem.ts:48-60`; `global`: `SYNC_STALLED` catalog copy at `realtimeProblem.ts:71-78`) prefixed by the escaped show title (or `Syncing` for global). One dashboard link at the end → `${origin}/admin`. Invariant 5 (no raw codes) holds because every line goes through the catalog resolvers.
- `stuck_files`:
  - Subject: `FXAV: ${N} new sheets need attention`
  - Body: one line per member = `resolveIngestionCopy({code, driveFileName})` (`realtimeProblem.ts:67-70`) prefixed by the escaped file name. One dashboard link → `${origin}/admin`.

All dynamic values HTML-escaped via `escapeHtml` (`lib/notify/templates/escapeHtml.ts`); text part mirrors HTML paragraph-for-paragraph like the current templates; the placeholder guard (`assertNoUnresolvedPlaceholder` usage at `realtimeProblem.ts:31-34`) applies per member line.

**Cap:** a batch email lists at most **20** members (input order — detection queries order oldest-first, `candidates.ts:151,167,184,201`). Members beyond 20 render as one closing line `…and ${N-20} more — open the dashboard: ${origin}/admin` (published group: `…and ${N-20} more — manage shows from the dashboard: ${origin}/admin`; in-app undo exists, so no capability is lost — the emailed link is a convenience, not the only path). **Truncation is display-only:** all N members are in the send's membership, share the idempotency key, and get ledger rows. 20 is a single named constant (`BATCH_EMAIL_MAX_ITEMS`) in `lib/notify/constants.ts`.

### 2.5 Counts contract

`DeliveryResult` shape unchanged (`lib/notify/deliver.ts:22-24`). `sent`/`failed`/`skipped`/`retryLater` stay **per member** (not per email), so `runNotify.ts`'s summary (`sent: delivery.sent` at `runNotify.ts:371`) and the cron route's `statusFor` semantics are unchanged. Tests may additionally observe email count via the sendEmail spy call count.

### 2.6 Digest path

`deliverDigest` keeps calling the shared per-recipient machinery with a single static content item (batch of one). Zero behavior change; `dedup_key = digest:<dateET>` unchanged (`lib/notify/deliver.ts:478`).

## 3. Failure/edge matrix (guard conditions)

| Input state | Behavior |
| --- | --- |
| 0 candidates / 0 recipients | ok result, all counts 0, no sends |
| Recipient canonicalizes empty | all candidates counted skipped for that recipient; other recipients unaffected |
| Recipient inactive (revoked) | same as above; checked once per recipient |
| All group members non-current | skipped per member, no send, no ledger rows |
| Mixed: A sent-before, B fresh | batch = {B}; A skipped; B's email is the N=1 single template |
| Mixed: A failed 2 attempts, B fresh | batch = {A, B}; on failure A→attempt 3 (capped), B→attempt 1 |
| A capped, B fresh | batch = {B} |
| Send throws / SQL throws | caught by existing try/catch → `{kind:"infra_error"}` (`deliver.ts:452-453`) |
| Batch > 20 members | one email, 20 rendered + overflow line, ledger rows for all |
| Same show re-minted token | new mintId → new dedupKey → new member; old member fails currentness (token equality guard, `deliver.ts:147-167`) and is skipped |
| Concurrent delivery pass (overlapping ticks) | second pass fails `pg_try_advisory_xact_lock` → `{kind:"ok", …all 0, lockSkipped:true}`; no member is ever in two in-flight batch keys (§2.1b) |
| Provider accepted, not all member rows persisted | row-less members retry next tick; duplicate possible only if membership also changed — documented residual (§2.1b) |

## 4. Testing

TDD per task (invariant 1). All existing tests in `tests/notify/` must pass; expected touch points:

- `tests/notify/deliver.test.ts`, `deliver-auto-publish-undo.test.ts` — extend for batching: one sendEmail call per group per recipient; per-member ledger writes with shared message id; combined idempotency key; N=1 key/content byte-parity vs current behavior (anti-tautology: derive expected key by calling `baseKey` with the member's own dedupKey and assert equality, proving the N=1 collapse rather than re-hashing the same input twice).
- New batch-template tests: N=2 and N=21 (cap boundary: 20 rendered + overflow line naming the correct remainder), pluralized subjects, per-show `r` binding distinct per member (assert two members' hrefs carry different `r` and each verifies via `recipientBindingFor`), HTML escaping of titles containing `<x>`, text/html parity.
- Failure path: batch send failure writes N failed rows + N `EMAIL_DELIVERY_FAILED` alerts with per-member context (assert the undo context recipe keys exactly).
- Real-DB suites (`deliver-real-db.test.ts`, `deliver-auto-publish-undo-real-db.test.ts`, `email-delivery-failed-undo-real-db.test.ts`) — verify per-member rows still reconcile.
- Single-flight (§2.1b): concurrency test where a second `deliverRealtimeCandidates` pass runs while the lock is held (real-DB: a competing connection holds an open transaction with `pg_try_advisory_xact_lock` taken; unit: fake lock sql returning locked=false) → second returns all-zeros + `lockSkipped`, zero sendEmail calls, zero ledger writes. Plus lock-release test: after a pass completes (success AND thrown-error paths — the `begin` block commits or rolls back either way), a fresh try-lock on another connection succeeds. Failure mode caught: the R1 duplicate-delivery scenario (run 1 `{A}` + run 2 `{A,B}` both sending A under different provider keys).
- Post-accept persistence failure (§2.1b residual): provider returns ok, `upsertSent` throws at member k → result `infra_error`, members 1..k-1 have sent rows, members k.. have none. Failure mode caught: a regression that either swallows the fault (reporting ok with missing rows) or rolls back the already-persisted members' rows.
- Key-length invariance: 25-member batch's idempotency key matches `/^fxav:[a-z_]+:[0-9a-f]{64}$/` and equals the same members re-ordered (sort determinism).
- Concrete failure modes caught: double-send of already-sent member (ledger regression); shared `r` across members (capability leak across shows); raw code in batch body (invariant 5); overflow line lying about the remainder count.

Meta-test inventory: no new registries. `tests/notify/_metaInfraContract.test.ts` continues to cover this module's Supabase-boundary posture (deliver.ts uses raw `postgres` — already `not-subject-to-meta` shaped, unchanged); no new mutation surface (no new route/action — `tests/log/_metaMutationSurfaceObservability.test.ts` discovery unaffected).

## 5. Resolved decisions (in-session, 2026-07-16)

1. Scope = all fan-out kinds (undo + show problems + ingestion), not undo-only.
2. One email per group, not one combined all-groups email (triage-from-subject; good news never shares a subject with alarms).
3. Approach = batch at delivery time (no debounce window, no digest-only fold).
4. Autonomous ship approved (AGENTS.md checkpoint).

## 6. Watchpoints (do-not-relitigate preempts)

- **Per-member ledger rows are deliberate** (vs one batch row): preserves the `(kind, dedup_key, recipient)` unique key (`20260602000004:19`), reconciliation key reconstruction (`emailDeliveryFailed.ts:140-193,212-229`), and late-arrival dedup. A batch-level row would require schema + reconciliation rewrites for zero user-visible gain.
- **Counts stay per member** — `statusFor`/run-summary compatibility (`runNotify.ts:368-372`).
- **N=1 byte-parity** is a hard requirement, not an optimization: it keeps existing template/idempotency tests as the regression net and makes deploy skew a non-event.
- **`global` joins `sync_problems`** rather than staying its own email: it is a sync problem; a stall coinciding with per-show problems should read as one incident. Singleton-global still renders today's exact email (N=1 rule).
- **Truncation at 20 is display-only** and loses no capability (in-app undo exists — the unpublish flow is reachable from the show's admin page; `deliver.ts:153` documents in-app undo consuming tokens).
