# M12 Orchestrator Handoff Log

**Owner:** Opus 4.7 orchestrator session (renamed `orchestrator-m12`)
**Opened:** 2026-05-26 at HEAD `b4b2c38` (M11.5 close-out)
**Locked deployment path:** M11 ✅ → M11.5 ✅ → **M12 (here)** → M13 v1 launch
**Per-milestone routing:** [`ROUTING.md`](../ROUTING.md) — all phases Opus/Claude Code implementer; Codex cross-CLI reviewer only.

This file is the M12 milestone-orchestrator audit trail. Round-by-round adversarial-review handoffs continue to live in `handoffs/round-NN.md` per [`HANDOFF-TEMPLATE.md`](../HANDOFF-TEMPLATE.md); this file records orchestrator-level decisions (scope, dispatch briefs, triage rulings, milestone transitions).

---

## §1 — Amendment session kickoff (2026-05-26)

### §1.1 — Context

The M12 plan tree was drafted 2026-05-19 with 25 rounds of cross-CLI spec review + 5 rounds of plan review against the **pre-pivot** signed-link auth model. M11.5 closed 2026-05-25 with a ratified pivot to one-share-token + identity picker + optional Google-OAuth-claim. Every M12 reference to per-crew signed links, `crew_member_auth`, `validateLinkSession`, `signLinkJwt`, `JWT_SIGNING_SECRET`, `/show/[slug]/p#t=<jwt>`, `revoked_links` validation usage, `LINK_*` catalog codes, `alias_5a_lead_for_revoke`, `alias_5a_lead_for_query_compromise` is now stale.

Damage scan at amendment kickoff: 172 hits across 12 files for the retired vocabulary (`link_session|signed.link|crew_member_auth|validateLinkSession|signLinkJwt|JWT_SIGNING_SECRET|/p#t=|fragment.token|revoked_links|LINK_EXPIRED|LINK_VERSION_MISMATCH|alias_5a_lead_for_revoke|crewMemberKey|active_signing_key_id`). Spec alone: 50 hits. Every plan file (`00–08`) contains at least one hit; `04-phase0-tooling-link.md` is 100% rewrite (entire file is a JWT-mint/revoke harness against the deleted `lib/auth/jwt.ts`).

Authoritative rebase reference: [`M11.5-delta-for-m12.md`](../../2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md). M11.5 ratified contracts inherit unchanged via delta §6 do-not-relitigate block.

### §1.2 — Scope confirmation (user 2026-05-26)

- **Q1 spec-vs-plan-vs-both** → BOTH. Spec amendment ratified as §15.26 amendment header; plan-only edit would leave plan contradicting AGENTS.md invariant 7 at 50 cites.
- **Q3 J3 picker-pivot shape** → option **(d)** comprehensive: J3 covers (i) admin rotates share-token → iPhone reload hits show-unavailable per M11.5 R2 → admin gives new URL → iPhone re-picks; (ii) admin resets picker-epoch → iPhone reload surfaces `identity_invalidated/session_mismatch` → iPhone re-picks; (iii) Google-OAuth claim path via `claim_oauth_identity` exercising the M11.5 H8 doc-guard's two-reasons `identity_invalidated` contract (`claimed_after_pick` + `session_mismatch`). Plus the M11.5 `validateNextParam` slug-only-rejection negative-auth surface inlined as a band-C row, not a J3 leg (it's a routing-time reject, not a journey).
- **Q2 implementer routing** → separate Opus implementer session for spec + plan tree amendment, same session, sequential. Dispatch brief authored below in §1.3.
- **Carry-over triage**:
  - **AMENDMENT scope:** M11.5-IMP-1 (catalog code), M11.5-IMP-2 (picker-show-strip — note: requires picker resolver shape extension, coordinate with M11.5 author), M11.5-IMP-4 (DESIGN.md §1.2 contrast rows).
  - **EXECUTION scope (Phase 1 / Iteration walks will surface):** M11.5-IMP-3 (/me TerminalFailure dedup), M11.5-IMP-5 (Admin Reset/Rotate polish — 5 sub-items), M11.5-PLAYWRIGHT-HELPERS (4 .skip picker-shaped e2e scenarios; natural home is Phase 0.E adjacency or Phase 1 setup).
  - **CLOSE-OUT scope (decided then, not now):** Test-migration coda (~36h jsdom port, 12 suites). Surface options at M12 close-out: (a) fold into close-out, (b) discrete milestone between M12 close-out and M13 kickoff.
  - **UNTOUCHED:** 4 BACKLOG.md Doug-feedback-gated UX entries — promotion prerequisite is Doug-usage signals from M13+.

### §1.3 — Dispatch brief for implementer session

Authored as one-paste-ready content in `handoffs/M12-amendment-dispatch-brief.md` (next commit). Handed to user; user fires Opus implementer session.

### §1.4 — Adversarial-review posture (amendment session)

- Amendment session self-reviews the amended spec + plan tree, then signals ready for cross-CLI Codex adversarial review.
- Each Codex round is fresh-eyes anchored on `b4b2c38` (M11.5 close-out HEAD); reviewer reads the amended spec + every amended plan file as if first read.
- Inherited do-not-relitigate block ([delta §6](../../2026-04-30-fxav-crew-pages-design/handoffs/M11.5-delta-for-m12.md)) pasted into every adversarial-review brief verbatim — reviewer-never-fixes.
- Iterate until APPROVE OR 40 rounds (per user R0 authorization at original M12 plan kickoff; carried forward to amendment session).
- Round handoffs continue in `handoffs/round-06.md` onward (round-01..05 are pre-rebase, archived as obsolete — not edited, cross-linked via this file).

---

## §2 — Round audit trail (entries appended as rounds fire)

| Round | Date | Codex thread | Verdict | Repair commit | Handoff |
|---|---|---|---|---|---|
| Pre-rebase R1–R5 | 2026-05-19..23 | various | needs-attention (obsolete; pre-pivot) | — | `round-01..05.md` (archived) |
| Amendment R1 | _pending_ | _pending_ | _pending_ | _pending_ | `round-06.md` |

---

## §3 — Open questions

None at amendment kickoff. Spec is being amended; plan derives.

---

## §4 — Notes for future orchestrator turns

- Update memory `project_post_m11_deployment_path.md` (M12 row) at amendment APPROVE'd; at Phase 0 done; at Phase 1 done; at close-out APPROVE'd.
- Whole-milestone close-out is its own gate (per `feedback_whole_milestone_closeout_gate`) — separate from per-phase Codex review. Don't claim M12 done until BOTH per-phase and fresh-eyes whole-milestone APPROVE.
- Test-migration coda decision (fold-into-close-out vs separate milestone) gets surfaced to user at M12 close-out, NOT before.
- Doug-feedback-gated BACKLOG entries stay parked until M13+ produces real-usage signals.
