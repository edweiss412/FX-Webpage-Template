# Deferred Items Log

Non-blocking findings from milestone adversarial reviews that were intentionally deferred rather than fixed in-milestone. Each item names a suggested home milestone where it should be picked up. **This is not a TODO list to clear automatically** — every entry has context for why it was deferred and where the right place to address it is.

When picking up a deferred item:

1. Move it from "Open" to "In progress" with the milestone it landed in.
2. Resolve it in that milestone's handoff doc convergence log.
3. Update the row to "Resolved" with the commit SHA + milestone reference.

---

## Open

### M6-D1 — Push notification surface (operator-facing)

**Source:** Conversation thread 2026-05-09 following ratification of plan amendments 7 + 8 (MI-8/MI-8b debounce, MI-9 LEAD-bit narrowing). Triggered by the observation that the spec's MI staging system requires Doug to check the dashboard to discover staged events, but Doug's natural surface is Drive — not the dashboard.
**Description:** The spec currently has zero push surface. Every staging event (FIRST_SEEN_REVIEW, MI-6..MI-14, MI-1..MI-5b hard fails on existing shows) is functionally invisible to Doug until he visits the dashboard. The MI staging system is calibrated for an operator who isn't watching for it. A push surface (email primary; SMS/webhook optional) is required to close the loop. Design memo: [`notification-design-memo.md`](./notification-design-memo.md) — captures six load-bearing principles (push-not-pull, severity tiering, push-debounce, coalescing, quiet success, two-way feedback), a concrete design sketch with schema additions and route shapes, and integration with the existing M8 report pipeline. Doug-validation questions consolidated in [`doug-validation-questions.md`](./doug-validation-questions.md) (§4 channels/timing, §5 feedback/communication, plus §1–§3 covering the workflow questions the push design depends on).
**Why deferred:** Out of M6–M10 scope; the core sync + admin + onboarding surfaces need to stabilize first. Push depends on a real email-provider integration (Resend / Postmark / SES) and on Doug's actual workflow being observed, not assumed. The design memo also notes that the MI-8/MI-8b modtime-stability debounce ratified in plan amendment 7 becomes redundant once push-debounce lands — both achieve the same anti-spam UX outcome from different layers.
**Suggested home:** New milestone (M11+ or post-v1) once core sync + admin surfaces stabilize. Spec amendment + dedicated milestone plan rather than retrofit into an existing milestone — the surface is too cross-cutting (schema, routes, email provider, report-pipeline integration, action-token signing) for a sub-milestone task.

### M2-D1 — Hardcoded admin allow-list rotation

**Source:** M2 adversarial review, Round 1 advisory note
**Description (corrected 2026-05-12 at M9 Task 9.0 close):** The admin allow-list is HARDCODED IN A POSTGRES MIGRATION (`supabase/migrations/20260501002000_rls_policies.sql:23-37`, the `public.is_admin()` function — `array['dlarson@fxav.net', 'edweiss412@gmail.com']`). The `ADMIN_EMAILS` env var listed at spec §14.3:3290 and `.env.local.example:26` is **NOT consumed by any code path**. Original deferral text claimed env-driven; live mechanism is migration-driven. There is no documented rotation procedure, audit trail, or in-product UX for adding/removing admins. Today the only path is "edit migration, deploy."
**Why deferred:** Out of M2 schema scope. Doesn't block anything functional — admins work, the allow-list is honored. It's an ops-hardening question.
**Suggested home:** **M9 polish — C9 cluster (routed 2026-05-12 at Task 9.0).** Shipping as code-driven self-service UI: spec amendment to §14.3 retiring the zombie env var + replacing the hardcoded array with an `admin_emails` table lookup + `/admin/settings/admins` page with add/revoke Server Actions. See `handoffs/M9-polish.md` §A Cluster C9 for the full task list. Original alternative dispositions (X.\* cross-cutting; ops doc only) were considered and rejected at 9.0 in favor of the self-service UI path.

### M2-D2 — Static-vs-runtime breadth for the 21 admin-table RLS matrix

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** AC-2.5 tests pin the §4.3 admin-only table list (21 tables × 4 verbs = 84 cells) at schema-introspection time. There is no runtime probe that the _live_ policy set still matches §4.3 after future migrations land. A future migration could silently drop or weaken a policy and current tests wouldn't catch it.
**Why deferred:** M2's introspection coverage is correct for "what shipped at M2." Runtime drift detection is a separate concern, and the right time to add it is when there are actually multiple migrations in play (M3+).
**Suggested home:** **M9 polish — C9 cluster Task 9.C9.0.5 (routed 2026-05-12 at R1 review repair of Task 9.0 commit `00620cb`).** Codex adversarial review of the 9.0 scope commit flagged that C9's `is_admin()` replacement (M2-D1) without a runtime RLS guard would be a structural gap — the exact gap M2-D2 describes. Closure path: Task 9.C9.0.5 creates `tests/db/admin-rls-runtime.test.ts` as a permanent 8N-cell behavioral-parity meta-test (DERIVED from `pg_policies` at runtime). Resolved-SHA backfilled here once C9.0.5 + C9.1 ship.

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

### M4-D4 — RightNowCard data-\* test attribute relocation

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

### M5-D9 — OAuth callback structured operator-log entries

**Source:** M5 adversarial review (2026-05-04, round 1, MEDIUM)
**Description:** app/auth/callback/route.ts emits OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID only as redirect query codes (lines 32-50). Spec AC-5.14 requires the matching structured operator-log entry for invalid next, missing/expired PKCE state, and exchange failures so redirect tampering and state-mixup failures are visible to operators independent of the affected user.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or a write to admin_alerts that doesn't match the spec's eventual shape. M5 §A close-out captured this as carry-forward.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus auth-route producers would double the review surface. When picking up: add the OAUTH_REDIRECT_INVALID and OAUTH_STATE_INVALID emit calls in callback/route.ts:32-50 alongside the sink, with regression tests covering invalid next, missing PKCE, and exchange failure paths.

### M5-D10 — Redeem-link structured operator-log entries

**Source:** M5 round-4 adversarial review (2026-05-04, §B finding, MEDIUM)
**Description:** `app/api/auth/redeem-link/route.ts` emits redeem-link failure producer codes only as JSON responses: `CSRF_DENIED`, `CSRF_NONCE_EXPIRED`, `CSRF_KEY_ROTATED`, `LINK_REDEEM_KEY_ROTATED`, `SESSION_NOT_FOUND`, `LINK_NO_CREW_MATCH`, `LINK_VERSION_MISMATCH`, `LINK_REVOKED_FLOOR`, `LINK_REVOKED_SURGICAL`, and `ADMIN_SESSION_LOOKUP_FAILED`. These cover replay/body-cookie mismatch, bootstrap nonce expiry, signing-key rotation, leaked/tampered JWTs, cross-show JWT attempts, missing crew bindings, version drift, floor/surgical revocations, and infrastructure failures. Operators need a structured sink independent of the affected user's browser response.
**Why deferred:** The structured operator-log sink does not yet exist — per CF-PIN-3, operator-log writes are scheduled for M6/M8 alongside the sink itself. Producing entries now would require either a stub sink or an `admin_alerts` write that does not match the spec's eventual operator-log shape.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus redeem-link producers would double the review surface. When picking up: add emit calls in `app/api/auth/redeem-link/route.ts` for every producer code listed above, with tests for replay, key rotation, nonce expiry, no-crew/version/revocation outcomes, and `ADMIN_SESSION_LOOKUP_FAILED` infrastructure paths.

### M5-D11 — Sign-out teardown failure structured operator-log producers

**Source:** M5 round-10 adversarial review (2026-05-04, §B finding, MEDIUM)
**Description:** `app/auth/sign-out/route.ts` logs `deleteSession()` and Supabase `signOut()` failures via `console.error` only and returns 500 ADMIN_SESSION_LOOKUP_FAILED with cookies preserved (R10 #2 fail-loud contract — security-correct: lets the user retry instead of seeing a fake-success while a copied cookie/token remains server-side valid). But the failure has no durable operator trail — if the user closes the browser without retrying, the partial-teardown state disappears into ephemeral logs. Operators need a structured sink to detect sign-out teardown failures (real signals of suspected-compromise sign-outs that didn't fully revoke).
**Why deferred:** The structured operator-log sink does not yet exist — same reason as M5-D9 / M5-D10. Producing entries now would require either a stub sink or a write to `admin_alerts` that doesn't match the spec's eventual shape.
**Suggested home:** M11 ops-hardening. M8 kickoff verified M6 / M6.5 / M7 did not land `lib/operatorLog/`, and M8 chose not to introduce the sink because §13.2.3 report-pipeline lease/recovery work is already the milestone's convergence risk; landing operator-log storage plus sign-out producers would double the review surface. When picking up: add emit calls in `app/auth/sign-out/route.ts` for the two failure branches (link_sessions delete error, Supabase signOut error), with regression tests asserting an operator-log entry is written before the 500 response.

### M7-D1 — Gallery + agenda lightbox entry/exit motion

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (round 1)
**Description:** Wrap `GalleryLightbox` and `AgendaSheet` openings in a `framer-motion` `AnimatePresence` transition: opacity 0→1 and `scale: 0.96 → 1` enter / reverse exit. Duration consumes `--duration-normal` (220ms) and easing consumes `--ease-out-quart` from DESIGN.md §5. Gate motion via `prefers-reduced-motion` so the existing `app/globals.css` reduction sets duration to 0ms.
**Why deferred:** Shipping the lightbox + sheet without an entry crossfade is a perceptible "first-pass implementation" tell against native phone galleries (Apple Photos / Google Photos both use a brief shared-element scale). v1 ships functional + accessible (focus trap, page counter, swipe carries information about position) but the polish moment is M9's job to land alongside the other motion-touch tasks. AC-7.1 / AC-7.2 / AC-7.7 do not require entry motion; M7 close was not blocked.
**Suggested home:** M9 polish.

### M7-D2 — AgendaPdfViewer error states routed through messageFor

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.3)
**Description:** Replace the single "couldn't open the agenda right now" copy in `components/agenda/AgendaPdfViewer.tsx` with a `messageFor(...)` lookup so 410 / 401 / 500 surface distinct crew-facing copy (per AGENTS.md §1.5 — no raw error codes, but also: distinct user-facing messages should map to distinct catalog entries). Inspect `react-pdf`'s `onLoadError` payload to derive an HTTP status hint. If `react-pdf` doesn't expose status, run a HEAD fetch against the proxy URL first and route on its status. Add new §12.4 catalog rows where needed: `AGENDA_GONE_FOR_CREW` (410) and `AGENDA_UNAUTHENTICATED` (401) with crew-facing copy that suggests reopening Doug's link.
**Why deferred:** v1 collapses every PDF load failure to a single retry-able message. The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) where retrying spins. The fix needs new catalog rows and the X.1 spec extractor parity test pinned, which is more scope than the M7 close-out could absorb. AC-7.1 closes at M7 — the proxy route + inline embed works; only the failure-state copy is deferred.
**Suggested home:** M9 polish OR earlier if a §12.4 catalog row for crew-facing PDF errors lands.

### M7-D3 — Diagrams gallery `<img>` → `next/image`

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (`@next/next/no-img-element` lint warnings)
**Description:** Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image`. Asset URLs are proxied through `/api/asset/diagram/...` which already returns auth-checked bytes with `private, max-age=0, must-revalidate` — `next/image`'s `/_next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer. Most likely path: declare the proxy origin as a `next.config.ts` remote pattern (same origin) and let `next/image` proxy through it; verify the resulting Cache-Control is still `private` so revocation propagates.
**Why deferred:** The current `<img loading="lazy" decoding="async">` is the manual equivalent and works fine on the mobile crew page (390px, single column at the right density). The lint warning is informational, not a ban. The `next/image` migration needs a careful interaction-test against the proxy's auth + cache contract — too much scope for the close-out. AC-7.4 closes at M7 — the bytes go through the proxy route, no Drive URL leaks; the LCP optimization is the only deferral.

**M9 close-out update (2026-05-13):** M7-D3 STAYS DEFERRED. M9 C6b attempted the migration (commit d433c32) and Codex adversarial review returned BLOCK with a P0 finding: `/_next/image` does NOT forward the user's auth cookies to the upstream `/api/asset/diagram/...` route (server-side fetch under a different request context — every request authenticates as anonymous and gets 401/403); AND `/_next/image` rewrites the proxy's `Cache-Control: private, max-age=0, must-revalidate` to public-cache headers, violating §6 watchpoint 12. Reverted at commit 22623ad. Adoption requires either (a) a custom Next.js image loader that forwards cookies AND preserves private caching, or (b) a different image pipeline entirely. The C6b commits DID close two adjacent items: runtime `<img onError>` fallback in both Gallery + GalleryLightbox so 4xx/5xx at load time routes to the existing unavailable placeholder (P1 of the C6b round-1 review). The lint-suppression rationale comment captures the contract.

**Suggested home:** Future milestone with a private-image-pipeline brainstorming session.

### M7-D4 — Pinch-zoom inside lightbox figures — RESOLVED 2026-05-13 (M9 C6c)

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (LD persona red flag)
**Description:** Add `react-zoom-pan-pinch` (or equivalent) inside each `<figure>` of `GalleryLightbox.tsx` so a crew member can pinch-zoom a diagram for detail (truss positions, stage plot dimensions). Embla's swipe gesture must be temporarily disabled while a zoom is in flight; restore on pinch-end. Verify gesture priority: pinch wins over swipe when two fingers are down; single-finger swipe still navigates between images.
**Resolution (M9 C6c, 2026-05-13):** Shipped via `react-zoom-pan-pinch@4.0.3`. Single-finger pan when zoomed; Embla `watchDrag` gated on `wasZoomedRef` boundary; chevrons auto-reset zoom. Reset chip absolutely-positioned inside the relative image container so the figure does not reflow on mount. 28 jsdom unit tests + impeccable critique + audit dual gate passed. See shape brief `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/shape-sessions/2026-05-13-pinch-zoom-lightbox.md` and handoff §12 for the convergence log. Real-device iOS smoke is the remaining manual verification per shape brief §14.

### M9-D-C1-2 — Next 16 + Turbopack `next/font/google` dev-mode fetch hang

**Source:** M9 C1 R3+R4 e2e implementation, 2026-05-14. Discovered while wiring the active layout-invariants suite and its sm:>=640px companion.
**Description:** `pnpm dev` (Next 16 + Turbopack default bundler) hangs the first request to any route whose layout imports `next/font/google` Inter — `app/show/[slug]/layout.tsx:31` is the trigger for the crew page. Reproducer:
1. Start the dev server.
2. Authenticate via `/api/test-auth/set-session` (admin email).
3. Curl `/show/<slug>` with the admin cookies.
4. The dev server holds 8 ESTABLISHED HTTPS connections to `fonts.gstatic.com` (and 1 to `fonts.googleapis.com`) and never sends a render response. The fonts URLs themselves are reachable in <100ms via direct curl from the same shell, so the network is fine — Next 16's font-fetch path (or its Turbopack integration) drops the responses on the floor.

This is the same class of bug tracked upstream:
- vercel/next.js#78472 — "Error while requesting resource" with `next/font/google` using `next dev --turbopack`
- vercel/next.js#71618 — Google fonts not bundled in Next.js 15 turbopack dev builds
- vercel/next.js#92671 — `next/font/google` fails to build on 16.2.3 — Turbopack font resolution broken

**Current workaround (in this repo):** the C1 R3+R4 e2e suites require the production build path. Run sequence:
1. `JWT_SIGNING_SECRET=… ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=… pnpm build`
2. Same env + `pnpm start -H 127.0.0.1` (background)
3. `MS_ONLY=1 pnpm exec playwright test crew-page --project=mobile-safari --workers=1`

`MS_ONLY=1` (added to `playwright.config.ts` in C1 R3) elides the dev-build / prod-build / prod-runtime-flip webservers so the manually-started production server isn't competed against by playwright's auto-spawned `pnpm dev` and so the with-admin-dev-flag.mjs lock can't race builds.

**Why deferred:** The bug is not in this repo's code — it's a Next.js Turbopack regression. The C1 e2e suite proves the dimensional invariants in production-build mode, which is the right gate (production is what crew uses). The dev-mode hang is a developer-experience papercut, not a correctness gap.

**Likely fix (untested on this repo):** Next.js 16.2.4 shipped a related fix via PR #92713 — bumped `reqwest` to v0.13.2 to resolve `http2 feature is not enabled` for Turbopack font fetching. Upstream root cause was Windows-on-ARM64 specifically; our hang is on macOS, so the same patch may or may not resolve our symptom — but the underlying HTTP/2 client library bump likely has broader effects worth testing. We are currently on Next.js 16.0.0.

**Trigger to remove the workaround:**
- Upgrade Next.js to ≥16.2.4 (the version containing PR #92713's reqwest bump).
- Smoke-test by running `pnpm dev` and curl-ing the show page with admin cookies — if it returns 200 with a today-band-tiles section in <2s, the bug is fixed for our environment.
- If still hung, file a fresh upstream issue with macOS-specific reproduction (we have a clean repro: production build serves in ~150ms, dev build holds 8 ESTABLISHED HTTPS connections to fonts.gstatic.com indefinitely).
- Once dev mode works: drop `MS_ONLY` env-guard from `playwright.config.ts`; restore default playwright command (CI=1 builds the artifact, `pnpm start` runs it, all 4 webservers spawn under the original lock-serialized order).
- Update `tests/e2e/crew-page.spec.ts` header comment to reflect the new run-sequence.

**Suggested home:** Pair with the next Next.js minor/major upgrade — specifically the 16.0 → 16.2.4+ bump. Track in the upgrade PR's checklist.

### M9-D-C6c-1 — Pinch discoverability hint (declined HIGH from C6c critique)

**Source:** M9 C6c `/impeccable critique`, 2026-05-13 (HIGH-1 finding from the LLM design review)
**Description:** Reviewer flagged the absence of a first-time discoverability hint for pinch-zoom on the lightbox. Suggested mitigations: a one-shot subtle chip ("Pinch to zoom · double-tap to reset") that fades out after 2s on first open per session, OR a persistent low-contrast hint in the header alongside "Diagrams · N of M".
**Why deferred (accepted residual risk, AGENTS.md invariant 8):** Pinch-zoom is a gesture-universal convention on mobile (iOS Photos, every consumer image viewer teaches it culturally). Mobile crew members will instinctively try pinch on any photographic image. The "stuck while zoomed" failure mode the hint primarily protects against is already handled by the Reset chip (which is visible by definition when scale > 1, the only state where the user could be stuck). Adding a persistent hint chip would compete for header chrome real-estate against the page indicator (1 of N) and the close button on a 390px viewport; a session-scoped one-shot hint adds localStorage state machinery and an additional dismiss interaction surface. No user-research signal that discoverability is an actual barrier on this surface. Recommendation revisits if FXAV venue-floor crew feedback explicitly identifies pinch-discovery friction in a future round.
**Suggested home:** Re-open when there is a real-user data point. Currently no scheduled milestone.

### M7-D5 — Sentinel-hiding helper for diagrams + agenda emptiness

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.5)
**Description:** Add `shouldHideDiagrams(diagrams, agendaLinks)` to `lib/visibility/emptyState.ts` so the §8.3 generic-optional sentinel-hiding contract has a single source of truth for diagram-tile emptiness. Register the new helper in `tests/components/tiles/_metaSentinelHidingContract.test.ts` so the meta-contract walks DiagramsTile alongside the other sentinel-bearing tiles.
**Why deferred:** DiagramsTile currently uses inline boolean checks (`items.length > 0`, `agendaLinks.some((link) => Boolean(link.fileId))`). Both are MEDIA-presence checks, not text-sentinel checks — they don't pattern-match the existing `shouldHideGenericOptional` (which hides "TBD" / "N/A" / "TBA"). The audit flagged this as a §1.9 meta-test coverage gap rather than a bug. v1 works correctly; the helper extraction is a discipline polish. AC-7.2 + AC-7.7 close at M7 — DiagramsTile returns null on whole-tile-missing per §8.3 already.
**Suggested home:** M9 polish.

---

## Resolved

### M6-D12 — Amendment 9 first-seen auto-publish + 24h unpublish undo

**Status:** **Resolved at SHA `badbb15` (M6.5 coda — Amendment 9 first-seen auto-publish + 24h unpublish undo)**. Cross-model adversarial review APPROVED. M6 amended AC-6.11 now satisfied.

**Source:** M6 §A adversarial review round 3, 2026-05-09
**Description:** Retire live-path `FIRST_SEEN_REVIEW` emission for first-seen sheets in `cron`, `push`, and `manual` modes. Auto-apply first-seen live sheets when MI-1..MI-14 all pass; continue hard-failing MI-1..MI-5b to `pending_ingestions` and staging MI-6..MI-14 trips with the specific MI sentinel. Add `shows.unpublish_token` and `shows.unpublish_token_expires_at`. Emit `SHOW_FIRST_PUBLISHED` after auto-publish. Implement `POST /api/show/[slug]/unpublish?token=...` with token consumed, expired, and success branches; emit `SHOW_UNPUBLISHED` and revoke affected links on success. Keep onboarding-scan first-seen sheets in explicit-review mode with `ONBOARDING_SCAN_REVIEW`.
**Resolution:** Shipped in M6.5 coda (see `handoffs/M6.5-amendment-9.md`). Schema columns added with paired-NULL CHECK; live-path FIRST_SEEN_REVIEW retired and replaced with `auto_publish_ready` branch in Phase1Result; auto-publish wired through phase2 under the per-show advisory lock with 24h undo token, SHOW_FIRST_PUBLISHED emission, and Realtime broadcast invalidation; POST /api/show/[slug]/unpublish route handles success/expired/consumed/not-found branches with idempotent re-attempt + link revocation + SHOW_UNPUBLISHED emission. Onboarding-scan ONBOARDING_SCAN_REVIEW preserved per the exception. Meta-test registries (Supabase call-boundary, advisory-lock single-holder, admin_alert catalog) extended.

### M2-D6 — App-side advisory-lock helper shape deferred to consumer milestones

**Status:** **Resolved at SHA `dc68471` (M5 Pin-2 extension #2 — `feat(auth): add show advisory lock helper`)**. A Git commit cannot contain its own final SHA without changing that SHA, so this row was authored in the same commit that ships `lib/db/advisoryLock.ts` with a reference-by-name; the SHA is backfilled here in a follow-up orchestrator commit.

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Plan-wide invariant §1.2 mandates per-show advisory locks on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`, with tests asserting the lock is held. M2 ships the schema that supports this; the actual helper and the lock-held tests live with the code paths that hold the lock (M5 auth, M6 sync).
**Resolution:** Added `lib/db/advisoryLock.ts` with `withShowAdvisoryLock(showId, mode, fn)` where `mode ∈ { 'try' | 'block' }`. The lock key is derived from `hashtext('show:' || shows.drive_file_id)` per spec §1.2, and `tests/db/advisory-lock.test.ts` asserts a competing transaction cannot acquire the same advisory key while the callback runs.
