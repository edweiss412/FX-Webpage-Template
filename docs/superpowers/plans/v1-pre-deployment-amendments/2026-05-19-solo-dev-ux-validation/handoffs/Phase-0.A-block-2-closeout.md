# Phase 0.A Block 2 — Close-out + Follow-up Escalations (2026-05-27)

**Status:** Block 2.1 + Block 2.2 (mechanical subset) + Block 2.3 (infrastructure subset) DONE. Block 2.2 items 1-3 + Block 2.3 helper-layer enablement deferred to orchestrator dispatches per scope-discovery findings during execution.

**Executor:** Opus 4.7 / Claude Code (this session — same session that closed Block 1).

**Dispatch context:** Per the Phase-0.A-Block-1-followup-dispatch, Commit A (plan amendments F1-4 + F7) + Commit B (finding 5 /admin redirect fix) were landed BEFORE Block 2 work began. Block 2 scope = M11.5-IMP-3 + IMP-5 + 4-now-5 `.skip` picker e2e scenarios.

## Commit chain (Block 1 follow-up + Block 2)

| SHA | Type | Summary |
|---|---|---|
| `6f73324` | docs(plan-m12) | Commit A — Amend Phase 0.A for findings 1-4 + 7 |
| `0ffd957` | fix(auth)+test(auth) | Commit B initial — redirect unauthed /admin to /auth/sign-in |
| `16bf157` | fix(auth) | Commit B fix-up — TS control-flow narrowing for redirectToSignIn() |
| `f6f62f4` | fix(test)+chore(infra) | Complete middleware.ts class-sweep — drop from 4 remaining scan lists |
| `93684b1` | refactor(me) | Block 2.1 — IMP-3 /me consumes shared TerminalFailure component |
| `65bb627` | feat(admin)+a11y | Block 2.2 — IMP-5 items 4+5 (aria-describedby + confirm-row layout consistency) |
| `46b6512` | test(e2e) | Block 2.3 partial — picker-flow.spec.ts in mobile-safari testMatch + docstring refresh |

## Block 2 task closures

| Task | Outcome |
|---|---|
| **Block 2.1 — IMP-3** /me TerminalFailure dedup | ✓ Mechanical refactor; external impeccable v3 attestation APPROVED (zero HIGH/CRITICAL) |
| **Block 2.2 — IMP-5 items 4+5** (a11y + layout consistency) | ✓ aria-describedby + outer-flex-col layout pattern applied to ResetPickerEpochButton + RotateShareTokenButton; aligns with 3rd surface RevokeRowButton.tsx:103; external impeccable v3 attestation APPROVED (zero HIGH/CRITICAL) |
| **Block 2.2 — IMP-5 items 1+2+3** (UX tuning) | ⏸ ESCALATED — require Doug usage feedback per DEFERRED.md description; see §Escalation below |
| **Block 2.3 — picker-flow infrastructure** | ✓ Added picker-flow.spec.ts to mobile-safari testMatch (was orphaned); refreshed stale docstring |
| **Block 2.3 — picker-flow helper-layer enablement** | ⏸ ESCALATED — scope larger than dispatch implied; see §Escalation below |

## Class-sweep correction (commit f6f62f4)

In addition to the dispatched Block-1 follow-up work, I landed a corrective class-sweep for middleware.ts deletion debt. Commit `dcba2c8` (in the Block 1 work) fixed ONE consumer of the deleted `middleware.ts` file (`tests/cross-cutting/no-jwt-surface.test.ts`), but my original grep missed 4 more surfaces with hardcoded `"middleware.ts"` in their scan arrays:

- `tests/messages/catalog.test.ts:71` — x1 catalog parity audit producedCodes scan
- `tests/auth/advisoryLockRpcDeadlock.test.ts:48` — advisory-lock topology meta-test (this WAS the pre-existing failure I flagged to orchestrator from Block 1 — turned out to be same class, not unrelated)
- `tests/cross-cutting/codes.test.ts:10-11` — x1 ACTIVE_PRODUCER_ROOTS + RETIRED_LITERAL_ROOTS
- `scripts/extract-spec-codes.ts:36` — RENDERED_CONTEXT_ROOTS used by the prebuild spec-codes codegen

All 4 ENOENT'd on `readFileSync('middleware.ts', ...)`. The vestigial-middleware structural defense at `tests/cross-cutting/no-vestigial-middleware.test.ts` (in x6 audit) prevents reintroducing a no-op middleware.ts/proxy.ts going forward; the class is now closed.

**Lesson learned (logged in commit body):** when one test in a class fails post-deletion, sweep the ENTIRE class right away — don't patch only the named instance. `feedback_recurring_bug_response.md` rung 1 (class-sweep before patching) was my missed discipline in commit `dcba2c8`.

## Verification

- TypeScript: `tsc --noEmit` clean across Block 2
- Full vitest run: 3985 passed, 5 skipped, 0 failed
- x1 catalog-parity: 13/13 ✓
- x3 trust-domain: 23/23 ✓
- x6 pg-cron-pivot: 35/35 ✓
- requireAdmin: 9/9 (5 new tests for Block-1 finding 5)
- ResetPickerEpochButton + RotateShareTokenButton: 20/20 (unchanged after Block-2.2 refactor)
- Playwright picker-flow.spec.ts: 6 tests discovered post-testMatch update (1 active runs in CI; 5 stay .skip pending helper-layer dispatch)
- Vercel deploy (Block-1 Commit B): live at https://fxav-crew-pages-validation.vercel.app; unauthed `/admin` → 302 `/auth/sign-in?next=%2Fadmin` confirmed via Playwright

## Escalation 1: IMP-5 items 1, 2, 3 (require Doug usage feedback)

Per DEFERRED.md `M11.5-IMP-5` (line 523): "Each is a UX tuning decision that benefits from Doug's actual usage feedback. Local critique can't ground the trade-offs."

The 3 items I did NOT land (would have been solo product calls without Doug data):

### IMP-5 item 1 — Fold simplified roster into "Share & access" (C3)

**Description:** The simplified "Crew" section + "Preview as a crew member" list are adjacent rosters with similar content. Consider folding the simplified roster into "Share & access" as context.

**Why deferred:** This is an Information-Architecture decision. Doug uses the admin per-show page differently than a designer might anticipate — knowing which roster he reaches for first + how often he switches between them is the empirical data missing for this call. Folding without that data risks worsening Doug's actual workflow.

**Recommended dispatch:** observe Doug's actual usage during validation walks; instrument briefly with a click-counter or just ask post-walk which roster he reached for. Then dispatch the IA refactor with the data behind it.

### IMP-5 item 2 — Two confirm rows (Reset + Rotate) can be open simultaneously (C6)

**Description:** Visually noisy when both are open; not destructive (each action is independently confirmed).

**Why deferred:** This is a state-machine design decision. The "noise" is subjective — Doug may find it useful (parallel comparison of warnings before deciding which is the right action) OR confusing. Local critique can't predict without data.

**Recommended dispatch:** prototype both: (a) status-quo (both can be open); (b) mutually-exclusive (opening one closes the other). Show Doug both during a validation walk and ask. Then dispatch the implementation of the chosen mode.

### IMP-5 item 3 — 2s Copy success-state duration may be too short (A3)

**Description:** "2s Copy-button success-state duration is borderline short for venue-floor phone glance-back."

**Why deferred:** This is a timing decision contingent on Doug's actual scroll cadence + glance-back rhythm. 2s vs 3s vs 5s — local critique can't ground the right number without watching him use it.

**Recommended dispatch:** during validation walks, observe Doug's copy-then-glance-back cadence. Pick the duration that fits empirically (likely 3-4s). Mechanical change (one constant in RotateShareTokenButton.tsx line 26 + matching constant in ShareLinkCopyButton.tsx if applicable).

## Escalation 2: Block 2.3 helper-layer enablement

The dispatch said "4 .skip picker-shaped e2e scenarios — Playwright helpers M11.5-PLAYWRIGHT-HELPERS triggered now that picker UI is in." Implication: enable the 4 `.skip` tests.

Discovery during execution:

1. **Actually 5 `.skip` scenarios** in `tests/e2e/picker-flow.spec.ts`, not 4. The 5th is the Admin Reset+Rotate flow which is admin-side not picker-shaped — the dispatch likely meant the 4 crew-facing picker tests. Worth confirming.

2. **The spec file was ORPHANED from `playwright.config.ts` testMatch.** Even the 1 currently-active test (slug-only-URL 404, line 26) wasn't being run by CI. Block 2.3 fixed that (commit `46b6512`).

3. **The spec file's docstring was stale.** It claimed `supabaseAdmin.ts`, `cookies.ts`, `seedLinkSession.ts` were "deleted by §A G-series cleanup". Reality: only `cookies.ts` and `seedLinkSession.ts` were retired; `supabaseAdmin.ts` and `signInAs.ts` are alive and serve the picker-envelope semantics. Block 2.3 refreshed the docstring.

4. **Helper-layer enablement requires writing 3 new helpers** (NOT a 1-line `.skip` flip):
   - `tests/e2e/helpers/seedShowWithCrew.ts` — writes `shows` + `crew_members` + `show_share_tokens` rows via the service-role client so tokenized URLs resolve.
   - `tests/e2e/helpers/seedPickerCookie.ts` — writes a `__Host-fxav_picker` cookie via Playwright's `context.addCookies` so Mode-B "Continue as guest" can observe the clear.
   - `tests/e2e/helpers/claimStamp.ts` — sets `crew_members.claimed_via_oauth_at` directly so the deactivated-row test (test #4) doesn't depend on running the OAuth callback chain.

5. **Test-body wiring + local-Supabase debugging:** each of the 5 stubs has its Playwright body sketched in its TODO comments; wiring + running + flakiness debugging is hours of work, not minutes.

Per `06-phase1-matrix-walk.md:86`: the deferral context says these scenarios un-skip "opportunistically, NOT a discrete task" — but the actual scope (3 helpers + 5 test bodies + debugging) is non-trivial. Better as a sized dispatch with its own scope contract than as a bundle inside a Block-2 task line.

**Recommended dispatch:** size as a standalone "M11.5-PLAYWRIGHT-HELPERS enablement" dispatch. Probably 2-3 hours of focused work. Pre-requisites: local Supabase running (or validation Supabase available for tests), test-auth endpoint enabled, picker-bootstrap Route Handler responding correctly to the seeded inputs.

## Posture at handback

- HEAD: `46b6512` on main, origin synced, working tree clean
- All Block 2 dispatched mechanical work landed
- Two escalations surfaced with concrete recommended dispatches
- Block-1 finding 5 also fixed (orchestrator-corrected scope from initial dispatch) + Block-1 middleware.ts class-sweep fully closed

Block-2 close-out gate satisfied IF orchestrator agrees with the escalation framing for items 1-3 of IMP-5 and the Block-2.3 helper-layer deferral. If orchestrator wants those landed before Block-2 closes, dispatch them; otherwise this handoff transitions us into Phase 0.B.

## Memory references

This session updated the memory index (per the running orchestrator-discipline retrospective):

- New: `feedback_verify_dashboard_nav_before_guiding.md` (from Block 1) — added 2026-05-27 after 2x Supabase Dashboard nav drift
- No new memories from Block 2 work — the orchestrator's standing memos (`feedback_impeccable_external_attestation_required.md`, `feedback_deferral_discipline.md`, `feedback_recurring_bug_response.md`) governed the decisions

## Watchpoints for next dispatch (Phase 0.B or M11.5-PLAYWRIGHT-HELPERS)

- **`dpl_…zrxkkrxro`** is the current production deployment on the validation alias. Future commits to main MAY auto-deploy via GitHub integration (not currently observed — every deploy this session was via `vercel deploy --prod --yes --archive=tgz` CLI). Worth confirming the integration is wired.
- **Supabase validation DB password** still pending rotation post-Phase-0.A wiring (per Phase-0.A-Block-1-closeout.md watchpoints section). Validation env is throwaway-class so contained.
- **`/admin` 403 path is unit-test-bound** for the authed-but-not-admin case — no second Google account on validation. If walking a validation scenario surfaces a need for a second non-admin account, seed one before relying on the 403 path manually.
- **`vercel.json framework` field** overrides project preset at deploy time, but the Dashboard still reports "Framework Preset: Other". Cosmetic; user can flip Dashboard preset to "Next.js" anytime, but not blocking.
