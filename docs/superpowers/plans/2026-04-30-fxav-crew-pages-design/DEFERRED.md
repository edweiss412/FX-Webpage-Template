# Deferred Items Log

Non-blocking findings from milestone adversarial reviews that were intentionally deferred rather than fixed in-milestone. Each item names a suggested home milestone where it should be picked up. **This is not a TODO list to clear automatically** — every entry has context for why it was deferred and where the right place to address it is.

When picking up a deferred item:
1. Move it from "Open" to "In progress" with the milestone it landed in.
2. Resolve it in that milestone's handoff doc convergence log.
3. Update the row to "Resolved" with the commit SHA + milestone reference.

---

## Open

### M2-D1 — Hardcoded admin allow-list rotation

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `ADMIN_EMAILS` is env-driven (set once in `.env.local` per spec §14.3), but there is no documented rotation procedure, audit trail, or in-product UX for adding/removing admins. Today the only path is "edit env, redeploy."
**Why deferred:** Out of M2 schema scope. Doesn't block anything functional — admins work, the allow-list is honored. It's an ops-hardening question.
**Suggested home:** M9 (polish) or X.* (cross-cutting). Could also land as a separate ops doc rather than code.

### M2-D2 — Static-vs-runtime breadth for the 21 admin-table RLS matrix

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** AC-2.5 tests pin the §4.3 admin-only table list (21 tables × 4 verbs = 84 cells) at schema-introspection time. There is no runtime probe that the *live* policy set still matches §4.3 after future migrations land. A future migration could silently drop or weaken a policy and current tests wouldn't catch it.
**Why deferred:** M2's introspection coverage is correct for "what shipped at M2." Runtime drift detection is a separate concern, and the right time to add it is when there are actually multiple migrations in play (M3+).
**Suggested home:** X.6 (traceability matrix walker) — it already enumerates spec sections, can be extended to assert live-policy parity. Alternatively land it as part of the next M2-touching migration.

### M2-D3 — `transportation.show_id` single-row uniqueness model

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Schema treats `(show_id)` as the unique key on `transportation`, allowing only one transport row per show. Spec §4 / parser output supports a single transport block per show, but production-shaped sheets sometimes carry multiple drivers/vehicles per show.
**Why deferred:** Matches current spec + parser. Changing it requires a spec amendment, not a fix-in-place. Until a real fixture demands multi-driver, the constraint is intentional.
**Suggested home:** Treat as a spec question. If/when a fixture surfaces with multi-driver, open a brainstorming session for a spec amendment, then schema-bump in a new migration (NOT an edit of the M2 file).

### M2-D4 — Missing introspection pin for `crew_members_show_id_name_key`

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** The `crew_members_show_id_name_key` named unique constraint exists in the migration but is not asserted by name in `tests/db/schema-introspection.test.ts`. Other named constraints in the same table are pinned.
**Why deferred:** Cosmetic — the constraint is in place and functions correctly; it's just missing from the introspection allow-list. Unlikely to drift in isolation.
**Suggested home:** Fold into the next M2-touching change (e.g., when M5/M6 add code that depends on the constraint). One-line test addition.

### M2-D5 — Seed's hardcoded restage fixture filename

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `supabase/seed.ts` hardcodes a specific raw-fixture filename for the restage scenario rather than deriving it from `fixtures/shows/raw/`. If that fixture is renamed or replaced, seed silently breaks.
**Why deferred:** Works against today's fixture set. The general fix (glob + filter) is mild refactoring that's easier to do alongside the next seed change rather than in isolation.
**Suggested home:** Whenever seed is next touched (likely during M4 tile development when a new fixture variant is needed for testing).

### M4-D1 — ShowStatusTile event_details key probing should route through parser canonical-key authority

**Source:** M4 catch-up code-quality review, 2026-05-03 Important Minor 2
**Description:** `components/tiles/ShowStatusTile.tsx` probes for the dress-code value across stringly-typed key candidates `["dress_code", "dress code", "dress", "attire"]`. Tile should consume the canonical key only; parser should expose a `CANONICAL_KEY_MAP` (or similar) that decides the variant collapse upstream.
**Why deferred:** Crosses into M1-parser territory. Out of M4 catch-up scope; the tile-side variant-tolerant probe is acceptable until the parser exposes canonical keys.
**Suggested home:** M1 follow-up touch OR a cross-cutting key-canonicalization task. When picked up, simplify the tile to read `event_details.dress_code` only, parser-side guarantees the canonical form.

### M4-D2 — Tile reorder by persona urgency

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 1 HIGH)
**Description:** Tile mount order in `app/show/[slug]/page.tsx` is parser-output order (Lodging→Venue→Crew→Contacts→Schedule→Audio→Video→Lighting→Transport→ShowStatus→Financials→PackList→Notes). Crew on the venue floor scans top-to-bottom; the answer to "what's my call time" (ScheduleTile + relevant scope tile) sits buried 5+ tiles in. PackListTile (set/strike-day primary answer) renders 12th.
**Why deferred:** Reorder is a UX/IA judgment call that benefits from a proper `/impeccable shape` session — the canonical v3 flow we skipped on this milestone. Doing it under M4 close-out pressure would risk a parser-order-to-persona-order refactor without the design context.
**Suggested home:** M9 polish with explicit `/impeccable shape <crew page reorder>` session before crafting. Group tiles by Today / Logistics / People / Reference, OR introduce a "Today" cluster that promotes 1-2 today-relevant tiles above the general grid.

### M4-D3 — Header weight competes with RightNowCard for the page hero

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 5 MEDIUM)
**Description:** `components/layout/Header.tsx` show title is `text-2xl sm:text-3xl font-bold` — same scale as the RightNowCard lead. The eyebrow `client_label` is the same `text-xs uppercase` as every tile heading. Result: header competes visually with both the hero card and the tile grid; nothing dominates.
**Why deferred:** Visual-rebalance call that benefits from a `/impeccable shape` session.
**Suggested home:** M9 polish. Either shrink the header (smaller title, condense to a sticky-thin bar) so the RightNowCard wins the page's primary moment unambiguously, OR commit to header-as-context (smaller title, drop the orange hairline which fights the RightNowCard's accent dot for the eye).

### M4-D4 — RightNowCard data-* test attribute relocation

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 6 MEDIUM)
**Description:** `components/right-now/RightNowCard.tsx` carries 3 `data-*` test attributes (`data-state`, `data-rendered-state`, `data-treatment`) on a screen-reader-traversed `<p>`. Over-instrumented for a hero element.
**Why deferred:** Relocation requires updating the e2e tests that read these attributes (transition matrix, AC-4.3 tests). Mechanical but non-trivial; safer to do alongside the broader M9 polish pass.
**Suggested home:** M9 polish. Move test-only attributes onto a sibling `<span data-testid="right-now-debug" hidden>` outside the AT tree. Update e2e tests at the same time.

### M4-D5 — `--tracking-eyebrow` token consolidation

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 7 LOW)
**Description:** Five different `tracking-[...]` values for uppercase eyebrows across Section + KeyValue + Header + RightNowCard + Footer (`0.12em` / `0.14em` / `0.18em` / `0.22em` / inline arbitrary values). Token-discipline contract violation — inline arbitrary values where a named token would unify the spec.
**Why deferred:** LOW finding; cosmetic. Easy to do but not blocking anything.
**Suggested home:** M9 polish. Add `--tracking-eyebrow` (and maybe `-eyebrow-strong`) to `app/globals.css` `@theme`, document in DESIGN.md §2, replace the 5 inline values.

### M4-D6 — `tests/e2e/crew-page.spec.ts:118` desktop-chromium viewport bug

**Source:** Task 4.13 spec compliance review, 2026-05-03 (pre-existing failure flagged)
**Description:** Task 4.2's `crew-page.spec.ts:118` test asserts 2-col grid without `setViewportSize(390, ...)`. On `desktop-chromium` (1280×800 default) the grid renders 4 cols, so the assertion fails. Pre-existing failure introduced at commit `c518006` (predates Task 4.13). The current `playwright.config.ts` testMatch may be excluding it from `desktop-chromium` — verify.
**Why deferred:** Not introduced by Task 4.13; pre-existing. Minor scope.
**Suggested home:** Next M4-touching change OR M9 polish. Either add `await page.setViewportSize({ width: 390, height: 667 })` at the top of the test, OR scope the test's testMatch to `mobile-safari` only.

### M5-D1 — /me page lacks "what's next" anchor

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C1, P0)
**Description:** `app/me/page.tsx` renders shows as an identical card grid (DESIGN.md anti-pattern: "no identical card grids"). Crew member with multiple shows must visually scan every card to find the one happening today/tomorrow. The most-soonest show should be visually emphasized (larger card, "Tomorrow" / "In 3 days" relative-time chip) and the rest grouped under "Upcoming" / "Past" headers.
**Why deferred:** UX/IA judgment call best handled in a dedicated `/impeccable shape /me page reorder with what's-next anchor` session, not under M5 close-out pressure. Spec §7.3 says `/me` lists shows; visual hierarchy across the list is M9 polish territory.
**Suggested home:** M9 polish.

### M5-D2 — Bootstrap shell has no liveness signal or timeout

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C2, P0)
**Description:** `app/show/[slug]/p/Bootstrap.tsx` "Connecting…" state has no animated indicator and no timeout. On slow venue Wi-Fi, frozen and working states look identical. User stares at static text for 2-8 seconds with no feedback. No retry mechanism if the bootstrap mint or redeem-link POST stalls.
**Why deferred:** Animation choice + timeout-with-retry UX is best designed in a `/impeccable animate` + `/impeccable shape` session, not bolted on under M5 close-out. The §A redeem-link route is correct; this is a pure §B presentation polish.
**Suggested home:** M9 polish. Consider: animated dot per `--duration-normal` + 6s timeout flipping to "Still working… [Retry]" intermediate state.

### M5-D3 — AlertBanner shows only top alert, no queue depth, no Resolve confirmation

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C3, P1)
**Description:** `components/admin/AlertBanner.tsx` SELECTs `LIMIT 1` and shows only the topmost unresolved alert. Doug has no signal that more alerts are queued. Resolve button has no confirmation step — accidental tap on a P0 alert (REPORT_ORPHANED_LOST_LEASE etc.) silently resolves without undo. Also missing `raised_at` display ("Raised 14 minutes ago").
**Why deferred:** Banner UX (queue badge, two-tap confirm, raised_at format) is shape work that benefits from a `/impeccable shape components/admin/AlertBanner.tsx` session. M5 ships the catalog wiring + RLS + Server Action correctly; the visual polish around queue depth and confirmation is M9 territory.
**Suggested home:** M9 polish.

### M5-D4 — Sign-in page lacks FXAV brand mark and Google G icon

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C4, P1)
**Description:** `app/auth/sign-in/page.tsx` has no FXAV wordmark above the headline. `SignInButton.tsx` has text-only "Sign in with Google" with no Google G SVG. Trust signal missing on the highest-stakes form on the site (where users hand over Google credentials). Also violates Google's official Sign-In button brand guidelines.
**Why deferred:** Requires brand asset sourcing (FXAV wordmark; Google's official G SVG download). Better handled in a coordinated polish pass with proper assets + Google brand-guide conformance, not under M5 close-out.
**Suggested home:** M9 polish.

### M5-D5 — Help/recovery copy assumes Doug is reachable (P2)

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C5, P2 — non-blocking, recorded for completeness)
**Description:** Bootstrap.tsx error path and SignInButton inline error both fall back to "Try again" or "ask Doug." Doug-on-stage cannot be reached. Self-serve fallbacks ("Sign in with Google instead" link from bootstrap error; "Go to my shows" link from no-fragment state; "View show list" secondary path on sign-in) would let crew members recover without Doug.
**Why deferred:** P2 — copy iteration is best handled with `/impeccable clarify` after the structural shape work in M5-D1 / M5-D2 lands.
**Suggested home:** M9 polish, after M5-D1 / M5-D2.

### M5-D6 — Audit-pass minor findings batched (P2-P3)

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Findings P2 #3, P2 #5, P2 #7, P3 #2, P3 #3 — batched)
**Description:** Five small audit findings deferred:
1. `<details>` UA marker not styled / no `list-style: none` reset (`components/messages/ErrorExplainer.tsx:93-98`).
2. SignInButton inline error not associated with button via `aria-describedby` (`app/auth/sign-in/SignInButton.tsx:118-145`).
3. AlertBanner `role="status" aria-live="polite"` on SSR-only region — comment-documented; consider `aria-atomic="true"` for future client-injection.
4. Bootstrap connecting state has no `aria-live` for state transitions.
5. Sign-in page `<header>` lacks `aria-labelledby` (only matters when multiple `<header>` elements stack).
**Why deferred:** All P2/P3. Low-impact a11y polish that benefits from a coordinated pass rather than scattered fixes.
**Suggested home:** M9 polish.

### M5-D7 — Accent button drift across §B surfaces (Systemic)

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #1)
**Description:** SignInButton, AlertBanner Resolve, /me sign-out — three "accent button" variants across §B with diverging className composition. SignInButton has the canonical pattern (transition-colors, focus-ring-offset, disabled treatment). AlertBanner Resolve was aligned in commit `1678000`; the systemic concern remains: there's no shared `<AccentButton>` atom. Future button surfaces will continue to diverge.
**Why deferred:** Atom extraction is M6+ territory (when M6's UI components introduce a 4th button variant, the case for extraction will be clear). Premature extraction at 3 variants is YAGNI.
**Suggested home:** M6 or first M-task that introduces a 4th accent button variant.

### M5-D8 — Inline error copy duplication; no catalog routing (Systemic)

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #2)
**Description:** SignInButton (`app/auth/sign-in/SignInButton.tsx:139-141`) and Bootstrap (`app/show/[slug]/p/Bootstrap.tsx:96-99`) both hand-code generic operator-friendly copy with no routing through `lib/messages/lookup.ts`. As §A's catalog grows (`BOOTSTRAP_NETWORK_ERROR`, `OAUTH_INITIATE_FAILED` candidates), these strings should route through ErrorExplainer.
**Why deferred:** §A coordination ask. §A would add the catalog entries; §B would swap the inline strings for ErrorExplainer renders. Not a §B-internal fix.
**Suggested home:** Coordinate with §A in M6 or whenever the catalog next gets touched.

### M5-D1 — OAuth callback structured operator-log entries

**Source:** M5 adversarial review (2026-05-04, round 1, MEDIUM)
**Description:** app/auth/callback/route.ts emits OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID only as redirect query codes (lines 32-50). Spec AC-5.14 requires the matching structured operator-log entry for invalid next, missing/expired PKCE state, and exchange failures so redirect tampering and state-mixup failures are visible to operators independent of the affected user.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or a write to admin_alerts that doesn't match the spec's eventual shape. M5 §A close-out captured this as carry-forward.
**Suggested home:** M6 (drive-sync) or M8 (bug-report) — whichever lands the operator-log sink first. When picking up: add the OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID emit calls in callback/route.ts:32-50 alongside the sink, with regression tests covering invalid next, missing PKCE, and exchange failure paths.

### M5-D2 — Redeem-link structured operator-log entries

**Source:** M5 round-4 adversarial review (2026-05-04, §B finding, MEDIUM)
**Description:** `app/api/auth/redeem-link/route.ts` emits redeem-link failure producer codes only as JSON responses: `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, and `ADMIN_SESSION_LOOKUP_FAILED`. These cover replay/body-cookie mismatch, bootstrap nonce expiry, signing-key rotation, leaked/tampered JWTs, cross-show JWT attempts, missing crew bindings, version drift, floor/surgical revocations, and infrastructure failures. Operators need a structured sink independent of the affected user's browser response.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or an `admin_alerts` write that does not match the spec's eventual operator-log shape.
**Suggested home:** M6 (drive-sync) or M8 (bug-report) — whichever lands the operator-log sink first. When picking up: add emit calls in `app/api/auth/redeem-link/route.ts` for every producer code listed above, with tests for replay, key rotation, nonce expiry, no-crew/version/revocation outcomes, and `ADMIN_SESSION_LOOKUP_FAILED` infrastructure paths.

---

## Resolved

### M2-D6 — App-side advisory-lock helper shape deferred to consumer milestones

**Status:** **Resolved at SHA `dc68471` (M5 Pin-2 extension #2 — `feat(auth): add show advisory lock helper`)**. A Git commit cannot contain its own final SHA without changing that SHA, so this row was authored in the same commit that ships `lib/db/advisoryLock.ts` with a reference-by-name; the SHA is backfilled here in a follow-up orchestrator commit.

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Plan-wide invariant §1.2 mandates per-show advisory locks on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`, with tests asserting the lock is held. M2 ships the schema that supports this; the actual helper and the lock-held tests live with the code paths that hold the lock (M5 auth, M6 sync).
**Resolution:** Added `lib/db/advisoryLock.ts` with `withShowAdvisoryLock(showId, mode, fn)` where `mode ∈ { 'try' | 'block' }`. The lock key is derived from `hashtext('show:' || shows.drive_file_id)` per spec §1.2, and `tests/db/advisory-lock.test.ts` asserts a competing transaction cannot acquire the same advisory key while the callback runs.
