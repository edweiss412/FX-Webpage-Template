# Possible Future Work (Backlog)

Speculative work items that **may** become real milestones if and when they're scoped and planned. **Not** currently scheduled work.

## What goes here vs DEFERRED.md

- **`DEFERRED.md`** (per-plan) — work that WILL be done. Has a concrete trigger (e.g., "when seed is next touched") OR is blocked on a planned future milestone (e.g., M11 X.* cross-cutting audit). Every entry has a scheduled or trigger-based home.
- **`BACKLOG.md`** (this file, project-wide) — work that MIGHT be done. No spec, no plan tree, no scheduled milestone, no concrete trigger beyond "if we decide to pursue it." Entries here may never be picked up; that's acceptable. They're captured so the ideas aren't lost, not promised.

The deferred-vs-backlog distinction was codified after the M2-D4 phantom-constraint post-mortem + the M11 mislabeling on 2026-05-19. See memory `feedback_deferral_discipline.md`.

## Promotion path

When a backlog item becomes real work:

1. **Spec it.** Author a spec file at `docs/superpowers/specs/<date>-<name>-design.md`. Run brainstorming + adversarial review per the standard cycle.
2. **Plan it.** Author a plan tree at `docs/superpowers/plans/<date>-<name>/` with phase files + HANDOFF-TEMPLATE + ROUTING.
3. **Number it.** Assign a milestone number that picks up where the sequence ends (M11 next after the current M0–M10 + M11 user-facing-docs slot).
4. **Migrate.** Move the entry from this file to a "Promoted" section (below) with the planned-milestone's name + spec/plan links.
5. **Update `docs/superpowers/plans/README.md`** catalog to list the new milestone.

Promotion is a real decision — same gate as any other milestone (brainstorming + spec self-review + adversarial review + planning + adversarial review). Don't promote casually.

---

## Open backlog (not yet promoted)

### BL-OPS-LOG — Structured operator-log sink + producer wiring

**Origin:** Consolidates four DEFERRED entries from the FXAV crew-pages plan that all blocked on the same nonexistent infrastructure: M5-D9 (OAuth callback structured operator-log), M5-D10 (Redeem-link structured operator-log), M5-D11 (Sign-out teardown structured operator-log), M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR durable notification via Sentry + admin-visible banner).

**Scope (combined from the four originating entries):**

- A `lib/operatorLog/` module that writes structured operator-facing log entries to a durable sink. Sink design TBD — candidates: Supabase table, Sentry, or hybrid (Sentry for high-signal incidents + a Supabase audit table for everything else).
- Producer call sites for:
  - `app/auth/callback/route.ts` — emit `OAUTH_REDIRECT_INVALID` + `OAUTH_STATE_INVALID` alongside the redirect query codes.
  - `app/api/auth/redeem-link/route.ts` — emit every redeem-link failure code (`CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, `ADMIN_SESSION_LOOKUP_FAILED`).
  - `app/auth/sign-out/route.ts` — emit on `deleteSession()` and Supabase `signOut()` failures.
  - Onboarding wizard `ONBOARDING_OPERATOR_ERROR` producer (per M10 Phase 1 R1).
- Admin-visible banner integration so Doug sees the most recent operator-log entries (without having to leave the dashboard).

**Why backlog, not deferred:** The work is real and motivated, but: (a) no spec or plan exists; (b) the sink design needs a brainstorming session (Supabase vs Sentry vs hybrid); (c) no scheduled milestone exists to absorb it; (d) several of the producer surfaces work acceptably today via inline `console.error` or `admin_alerts` UPSERT — operator visibility is degraded, not absent. Picking this up requires first scoping the milestone (spec + plan), not just implementing the producer wiring.

**Promotion prerequisite:** brainstorming session on sink design (Supabase audit table vs Sentry vs hybrid + retention + admin-banner integration shape).

### BL-PUSH-NOTIFICATIONS — Email-primary operator push surface

**Origin:** DEFERRED entry M6-D1 (Push notification surface, operator-facing). Filed 2026-05-09 following ratification of plan amendments 7 + 8 on the FXAV crew-pages plan. Design memo lives at `2026-04-30-fxav-crew-pages-design/notification-design-memo.md`; Doug-validation questions consolidated at `2026-04-30-fxav-crew-pages-design/doug-validation-questions.md` (§4 channels/timing, §5 feedback/communication).

**Scope:** The v1 spec currently has zero push surface. Every staging event (FIRST_SEEN_REVIEW, MI-6..MI-14, MI-1..MI-5b hard fails on existing shows) is functionally invisible to Doug until he visits the dashboard. The MI staging system is calibrated for an operator who isn't watching for it. A push surface — email primary; SMS/webhook optional — would close the loop.

Design memo captures six load-bearing principles: push-not-pull, severity tiering, push-debounce, coalescing, quiet success, two-way feedback. Concrete sketch includes schema additions, route shapes, integration with the existing M8 report pipeline, and action-token signing for one-click acknowledgements.

**Why backlog, not deferred:** Three independent prerequisites: (a) the design memo needs ratification via spec amendment + brainstorming; (b) Doug-validation questions need real answers from Doug's first-show workflow; (c) email-provider integration (Resend / Postmark / SES) requires a vendor decision + account setup + secrets management. Spec amendment + dedicated milestone plan, not a sub-milestone task. The notification-design-memo notes that MI-8/MI-8b modtime-stability debounce (ratified in plan amendment 7) becomes redundant once push-debounce lands — both achieve the same anti-spam UX outcome from different layers, so push-debounce might retire MI-8/MI-8b infrastructure.

**Promotion prerequisite:** Doug-workflow observation from a live v1 deployment (need real data on which staging events Doug actually misses) + email-provider integration decision + spec amendment formalizing the notification design memo.

### BL-PRIVATE-IMAGE-PIPELINE — `next/image` migration for auth-proxied assets

**Origin:** DEFERRED entry M7-D3 (Diagrams gallery `<img>` → `next/image`). Re-deferred at M9 C6b 2026-05-13 after an in-cluster attempt failed P0 (auth cookies don't forward through `/_next/image`; private Cache-Control rewritten to public, breaking revocation propagation).

**Scope:** Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image` to gain LCP optimization on the mobile crew page. Currently they use `<img loading="lazy" decoding="async">` as the manual equivalent — works correctly but doesn't get Next's `/_next/image` optimizer benefits.

Asset URLs are proxied through `/api/asset/diagram/...` which returns auth-checked bytes with `private, max-age=0, must-revalidate`. The `next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer — neither is straightforward.

**Why backlog, not deferred:** The in-cluster M9 attempt failed P0 because the obvious paths (declare proxy origin as `next.config.ts` remote pattern; let `/_next/image` proxy through it) break the auth + cache contract. The right fix requires a private-image-pipeline design — custom loader + transform service, OR signed-URL CDN, OR architectural decision to accept the LCP cost of un-optimized images. Each path is a multi-day brainstorming session.

**Promotion prerequisite:** Private-image-pipeline brainstorming (custom loader vs signed-URL CDN vs accept-the-cost). May fold into a broader "v1.5 perf-and-polish" milestone rather than standalone.

---

## Promoted (was backlog, now scheduled)

_(empty — no items have been promoted yet)_

---

## Items considered for backlog but NOT included

These were on the deferred-vs-backlog audit list (2026-05-19) but determined to be genuine deferrals, not speculative future work. They stay in their plan's DEFERRED.md:

- **M2-D3** (`transportation.show_id` single-row uniqueness) — concrete trigger ("real multi-driver fixture surfaces"); spec question with a clear answer mechanism.
- **M2-D5** (seed hardcoded restage filename) — has a clear technical home ("next seed touch") even if the trigger hasn't fired.
- **M4-D1** (parser canonical-key probe) — clear technical home ("M1 follow-up touch OR cross-cutting key-canonicalization task").
- **M5-D7** (accent button atom) — concrete trigger (4th accent button variant materializes; YAGNI gate).
- **M9-D-C6c-1** (pinch-zoom discoverability hint) — declined with concrete re-open trigger ("FXAV crew explicitly identifies pinch-discovery friction").
