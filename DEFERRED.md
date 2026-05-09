# Deferred Work

## M6-D12 — Amendment 9 first-seen auto-publish + 24h unpublish undo

Status: deferred from M6 §A after adversarial review round 3 (2026-05-09).

Carrier: M6 coda or the next orchestrator-assigned backend pin before final M6 close.

Scope:

- Retire live-path `FIRST_SEEN_REVIEW` emission for first-seen sheets in `cron`, `push`, and `manual` modes.
- Auto-apply first-seen live sheets when MI-1..MI-14 all pass; continue hard-failing MI-1..MI-5b to `pending_ingestions` and staging MI-6..MI-14 trips with the specific MI sentinel.
- Add `shows.unpublish_token` and `shows.unpublish_token_expires_at`.
- Emit `SHOW_FIRST_PUBLISHED` after auto-publish.
- Implement `POST /api/show/[slug]/unpublish?token=...` with token consumed, expired, and success branches; emit `SHOW_UNPUBLISHED` and revoke affected links on success.
- Keep onboarding-scan first-seen sheets in explicit-review mode with `ONBOARDING_SCAN_REVIEW`.

Reason: Amendment 9 was ratified after the Pin-stop 2 extension code path and is larger than the Tasks 6.8-6.10 review-repair scope. The current M6 backend still follows the pre-amendment live first-seen staging behavior and must not be reported as satisfying amended AC-6.11.

Blocking note: M6 final close cannot claim Amendment 9 / amended AC-6.11 behavior until this item ships and passes its own adversarial review.
