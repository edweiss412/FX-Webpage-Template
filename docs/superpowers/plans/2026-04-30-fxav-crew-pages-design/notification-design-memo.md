# Notification design memo — push surface for FXAV Crew Pages

> **Status:** Forward-looking design memo. Not yet a spec section, not yet a milestone plan. Captures design principles for whichever future milestone owns the push-notification surface.
>
> **Drafted:** 2026-05-09
> **Updated:** 2026-05-09 with provisional answers to BLOCKER questions §1.1, §1.2, §4.1, §5.1, §6.1, §7.3 from `doug-validation-questions.md` (Eric, pending Doug confirmation).
> **Source:** Conversation thread following ratification of plan amendments 7 + 8 (`00-overview.md`). Triggered by the observation that the spec currently has zero push surface — the dashboard is purely pull, and Doug's natural surface is Drive, not the dashboard.
> **Suggested home:** New milestone (M11+ or post-v1) once core sync + admin surfaces stabilize. Do NOT retrofit into M6–M10 — those have their own scope and ship priorities. This memo is the load-bearing context the future milestone-spec-author should read first.

**Calibrated assumptions** (from validation doc, 2026-05-09):

- **Channel:** email primary for v1; `lib/notify/` abstraction supports SMS as a second channel without re-architecting (build channel-agnostic from day 1, ship email-only).
- **Show count:** 10–15 simultaneous shows is the realistic upper bound. Cross-show coalescing in the daily digest is **mandatory**, not optional.
- **Feedback channel:** reply-to-email is the **primary** feedback path (matches Doug's existing "text or email Eric" habit). One-click "Report a problem" links and structured forms are secondary.
- **Live-edits propagation:** confirmed — once a sheet is in the watched folder, edits flow live. No publish-gate layer; MI staging gates handle the suspicious-change carve-outs.
- **Sharing-as-publishing:** "I shared the link" means final, not draft. Leans toward auto-publish-with-email-undo on FIRST_SEEN_REVIEW, but §7.1 is still open — final call deferred.

---

## The problem this solves

The current spec design assumes Doug will check the dashboard to discover staged events (FIRST_SEEN_REVIEW, MI-6..MI-14 stagings, MI-1..MI-5b hard fails, system errors). Two facts make this assumption fragile:

1. **Doug's surface is Drive.** His natural action is "edit a sheet" or "drag a sheet into the watched folder." He has no intrinsic reason to visit the dashboard unless we tell him to.
2. **The dashboard is invisible until needed.** It's a destination, not an ambient surface. A staging event that requires dashboard attention without a push notification is functionally invisible.

Without push, the entire MI staging system — which is the spec's primary safety mechanism — is calibrated for an operator who isn't watching for it.

---

## Principle 1 — Push, not pull

The dashboard is the system of record (where state is canonical and actionable in detail) but it is NOT the attention surface. The attention surface is whatever channel Doug is already using when something happens — most likely email, possibly SMS for the highest-urgency events.

Every event that requires Doug's attention MUST have a push surface. Events that don't require attention (info-severity: `ROLE_FLAGS_NOTICE`, `TYPO_NORMALIZED`, `DIAGRAMS_TAB_MISSING`, `UNKNOWN_FIELD`, etc.) stay dashboard-only.

---

## Principle 2 — Severity tiering

Three tiers, with explicit assignment of every §12.4 catalog code to one tier:

| Tier                              | Surface                                                       | Codes (initial assignment, calibrate after observation)                                                                                                      |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real-time push** (rare, urgent) | Out-of-band **email** at the moment it happens                | `MI-11_EMAIL_CHANGE`, `MI-12_PROBABLE_RENAME`, `MI-13_NAME_AND_EMAIL_CHANGE`, `MI-14_NO_EMAIL_RENAME`, `FIRST_SEEN_REVIEW`, `SHEET_UNAVAILABLE` (>1h), `DRIVE_FETCH_FAILED` (>2 retries), `MI-1`..`MI-5b` hard fails on a previously-published show |
| **Daily digest** (most things)    | One **email** at a fixed time bundling **across all shows**   | `MI-6`, `MI-7`, `MI-7b`, `MI-8`, `MI-8b`, `MI-8c`, `MI-9_ROLE_FLAGS_DELTA` (LEAD-bit, post-amendment-8), `ONBOARDING_SCAN_REVIEW`, parser soft warnings whose `dougFacing` is non-null |
| **Dashboard-only** (info)         | Visible if he visits, never pushed                            | `ROLE_FLAGS_NOTICE`, `TYPO_NORMALIZED`, `DIAGRAMS_TAB_MISSING`, `UNEXPECTED_PARENT`, all admin-log-only codes, `SYNC_DELAYED_MODERATE` (severe is already real-time) |

**Channel:** email is the v1 primary (Doug works on PC/laptop; email is his ambient surface). The `lib/notify/` abstraction MUST be channel-agnostic (`'email' | 'sms' | 'webhook'` enum) so SMS lands as a follow-on without re-architecting, but the v1 implementation ships email-only.

Tier assignments are calibration questions, not invariants. Watch what Doug ignores in real-time push and demote it to digest; watch what he wishes he'd known sooner in digest and promote it. A digest item that's been sitting unactioned for >24h auto-promotes to real-time on the next tick.

---

## Principle 3 — Push-debounce (delay the email, not the staging)

The MI-8 / MI-8b modtime-stability debounce ratified in plan amendments 7 (2026-05-09) was a SPECIFIC instance of a more general principle. Generalize it:

**Stage immediately. Debounce the push.**

- Phase 1 stages MI-anything immediately on every parse. The dashboard always reflects current state.
- A separate "push scheduler" runs after each cron tick. For each unactioned `pending_syncs` row whose `email_sent_at IS NULL`, it checks: is `now() - file.modifiedTime ≥ PUSH_DEBOUNCE_MS` (~4 min, same constant as `MI8_DEBOUNCE_MS = 240_000`)?
  - If yes → send the push, stamp `pending_syncs.email_sent_at = now()`.
  - If no → skip; try again next tick.
  - If the row is DELETEd in the interim because the staging cleared (Doug fixed it, or the parse no longer trips) → push never fires. Quiet success.

**What this fixes (every variant of the "Doug is mid-edit" failure mode):**

- Doug clears a financial cell, retypes 30s later → MI-8 staging appears in dashboard briefly, clears when corrected, no push. ✅
- Doug deletes 3 crew rows to re-paste them → MI-6 stages briefly, clears, no push. ✅
- Doug renames Alice mid-edit (clear name → retype → clear email → retype) → MI-11 staging appears, mutates, eventually settles. Push fires once at the stable end-state, not five times. ✅
- Doug really did break something and walks away → 4 min after his last edit, push fires. ✅

**Implications for the existing MI-8/MI-8b debounce (amendment 7):** when push-debounce lands, the staging-itself-debounce in amendment 7 becomes redundant — the push-debounce achieves the same UX outcome (no spam from transients) without forcing the dashboard to lie about current state. Plan to retire amendment 7 in the same milestone that ships push-debounce, OR keep it as belt-and-suspenders. Decide at spec-write time; both are defensible.

**Doesn't apply to security-sensitive Apply:** Apply still requires explicit Doug action (dashboard or one-click email). Active links keep working until Apply. So delaying the heads-up email by 4 min has no security cost — Doug controls when the auth bump fires.

---

## Principle 4 — Coalescing

**Show count context (validated 2026-05-09):** Doug runs 10–15 active shows simultaneously. At that scale, per-show emails are untenable even at low staging frequency — coalescing isn't a nice-to-have, it's the only way the push surface stays usable. Per-parse coalescing is already in the spec ("a single `pending_syncs` row aggregates all stage-for-approval events from a single parse run"). The push surface adds two MANDATORY layers on top:

- **Per-show coalescing across syncs.** If Show X already has an unactioned push out (`pending_syncs.email_sent_at IS NOT NULL` and the row still exists), subsequent stagings on the same show update the existing record without firing a new push. Subject becomes "Show X: now 4 items to review (was 2)." **Required, not optional.**
- **Cross-show daily digest is the default for tier-2.** Tier-2 items batch into one daily digest covering all 10–15 active shows. Subject: "FXAV: 3 shows have 7 items to review." Per-show tier-2 emails are NEVER sent — only the cross-show digest. **Required, not optional.** A digest with 0 items is not sent (quiet success).

A push is fired when:

- It's tier-1 (real-time), OR
- It's the daily-digest tick AND there's at least one tier-2 item across any show that hasn't been included in a prior digest yet, OR
- It's a "promotion" (tier-2 item now older than 24h promotes to tier-1).

**Dashboard implication (cross-link to spec §9.1):** at 15 shows, the dashboard list MUST sort by urgency — `(unactioned_staging_count desc, last_modified desc)` — not alphabetically. Alpha order buries the things that need attention. Capture as a follow-up note for whichever milestone owns the dashboard polish (M9 polish or M10 onboarding). Not strictly part of the push surface but emerges from the same scale assumption.

---

## Principle 5 — Quiet success

The system speaks only when it needs something. Specifically:

- If Doug acts on a staging via the dashboard before the debounce expires → no push fires.
- If a staging clears because Doug edited the sheet again → no "never mind" follow-up email.
- If a transient resolves itself → no record in the digest.
- If everything is fine → no email at all (NOT a "everything's fine" status email).

Inverse-test for whether a push is well-calibrated: would Doug be surprised to receive it? If yes, send. If no, suppress.

---

## Principle 6 — Two-way feedback

If we're already in Doug's email asking him to act, that's also the right surface for him to flag things back to us. Every push notification must carry a feedback affordance — Doug should never have to context-switch to the dashboard to tell us something looks wrong.

**Three forms of feedback embedded in every push, ordered by Doug's existing habit (validated 2026-05-09 — his current channel for "something's wrong" is text or email to Eric, conversational not ticket-based):**

1. **Reply-to-email feedback (PRIMARY).** Every push email's `Reply-To:` header points at an ingest address that lands the reply in `feedback_inbox` and (if the body exceeds a min-quality threshold) auto-promotes to a GitHub issue via the existing M8 `/api/report` pipeline. Doug hits reply with freeform notes from any mail client — exactly mirroring his current "text or email Eric" habit. **This is the form to optimize hardest;** it's the lowest-friction path AND matches what Doug already does. Works without clicking any link.

2. **One-click "Report a problem" link.** Secondary path for cases where reply isn't natural (e.g., a digest covering 5 shows where Doug wants to flag one specifically). Pre-filled form / GitHub issue with show + staging + parse context already attached. Doug clicks → optionally types 1–2 sentences → submits.

3. **One-click "This is fine, apply" button.** Tertiary — for low-stakes stagings (non-auth-sensitive: MI-6, MI-7, MI-7b, MI-8, MI-8b, MI-8c), the email carries an Apply-from-email button using a signed action token (short-lived, one-shot). Higher-stakes stagings (MI-11 email change, MI-12/13/14 renames, FIRST_SEEN_REVIEW) still require dashboard click-through so Doug sees the diff. Use sparingly.

The integration with M8's report pipeline is the key insight: we already have a "feedback to dev" surface (GitHub Issues via `/api/report`). Extending it to accept email-originated reports is additive. Doug's mental model becomes "if something's off in the email, hit reply or click the button — same thing happens either way." Match his existing habit (reply-to-email) first; offer structure (forms, buttons) as fallback for cases where reply doesn't fit.

---

## Concrete design sketch

**Schema additions:**

```sql
-- pending_syncs
ALTER TABLE pending_syncs ADD COLUMN email_sent_at timestamptz;
ALTER TABLE pending_syncs ADD COLUMN email_action_token uuid; -- for one-click Apply-from-email
ALTER TABLE pending_syncs ADD COLUMN email_action_token_expires_at timestamptz;

-- new table: push_log
CREATE TABLE push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid REFERENCES shows(id) ON DELETE CASCADE,
  pending_syncs_id uuid, -- nullable; not all pushes are about stagings
  tier text NOT NULL CHECK (tier IN ('realtime', 'digest', 'promotion')),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'webhook')),
  recipient text NOT NULL, -- email address or phone number
  triggered_codes text[] NOT NULL, -- the §12.4 codes this push covers
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_status text CHECK (delivery_status IN ('queued', 'delivered', 'bounced', 'failed')),
  delivery_error text
);

-- new table: feedback_inbox (email-originated feedback before triage)
CREATE TABLE feedback_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_email text NOT NULL,
  source_message_id text, -- email Message-ID for threading
  in_reply_to_push_log_id uuid REFERENCES push_log(id),
  subject text,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  triaged_at timestamptz,
  github_issue_url text -- once promoted to GH issue via /api/report
);
```

**New routes:**

- `POST /api/push/scheduler` — cron-tick endpoint that evaluates `pending_syncs` rows against the push-debounce predicate and sends emails. Per-show advisory locked just like the sync routes.
- `POST /api/email/inbound` — webhook endpoint for the email provider (Resend / Postmark / SES); ingests Doug's replies and creates `feedback_inbox` rows.
- `GET /api/email/action/[token]` — handles one-click Apply-from-email; validates the signed token, runs the standard Apply path with the lock + Drive re-verify, redirects to the dashboard with a success/failure flash.

**Email provider:** prefer a Vercel-Marketplace-native option for OIDC env auth. Resend has a Vercel integration. Postmark has good deliverability. SES is cheapest but requires more config. Decide at spec-write time; the provider is swappable as long as send + inbound webhook are abstracted in `lib/notify/`.

**Constants (add to `lib/sync/constants.ts` or new `lib/notify/constants.ts`):**

```ts
export const PUSH_DEBOUNCE_MS = 240_000; // 4 min — same as MI8_DEBOUNCE_MS
export const DIGEST_HOUR_LOCAL = 8; // send daily digest at 8am operator-local
export const DIGEST_TIMEZONE = 'America/New_York'; // Doug's TZ; configurable per operator in v2
export const PROMOTE_AFTER_HOURS = 24; // unactioned digest item escalates to realtime
export const EMAIL_ACTION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
```

---

## Integration with existing M8 report pipeline (§13.2.3)

The M8 `/api/report` route is the canonical "send feedback to dev" surface. Email-originated feedback should converge to the same pipeline:

- **One-click "Report a problem" link in push** → GET `/api/report/init?show=<id>&staging=<id>` → user-facing form pre-filled with context → POST `/api/report` (existing M8 route, unchanged).
- **Reply-to-email feedback** → email provider webhook → `POST /api/email/inbound` → if the reply text exceeds a min-quality threshold, INSERT `feedback_inbox` row AND auto-promote to `/api/report` with the email body as the report body. If empty / spammy / out-of-band, just stash in `feedback_inbox` for Eric to triage.
- **Both paths emit the existing M8 idempotency-key + GH-issue lookup mechanics.** No new GH integration — the existing one is reused.

This keeps the dev-facing inbox singular: every piece of feedback lands as a GitHub issue regardless of whether it came from the dashboard, email, or SMS.

---

## Open questions to validate with Doug before implementation

The notification-related questions live in the canonical Doug-validation doc:
[`doug-validation-questions.md`](./doug-validation-questions.md) §4 (channels and
timing) and §5 (feedback / communication). Specifically: §4.1 (email vs SMS vs
other), §4.2 (digest send time), §4.3 (reply-to behavior), §4.4 (auto-publish
confirmation), §4.5 (one-click Apply scope), §5.1–§5.3 (feedback affordance
design).

When Doug's answers come in, update the validation doc inline AND propagate
calibrated values into this memo's "Concrete design sketch" section before the
push milestone is specced. That way the memo's design proposal and the
validation answers stay in sync as the single source of truth.

---

## Out of scope for this memo

- **Crew-facing notifications.** This memo is operator-facing only. Crew get info via the crew page; whether they get push notifications about schedule changes is a separate v2 product question.
- **Multi-operator support.** The spec currently assumes a single Doug-equivalent operator per deployment. When/if multi-admin lands (deferred per `M2-D1`), this memo extends with per-admin notification preferences and routing rules.
- **Notification preferences UI.** The first cut wires email to a single env-configured address (`OPERATOR_EMAIL` or similar). Per-operator preferences (mute toggles, frequency caps, channel choice) are a follow-on.
