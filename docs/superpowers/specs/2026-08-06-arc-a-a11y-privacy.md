# Arc A — a11y/privacy cluster (travel-date suppression, live-region residue, channel-announcer strip, share-link cue)

**Date:** 2026-08-06 · **Authoring branch:** `docs/arc-a-spec` · **Implementation branch:** `feat/a11y-privacy-cluster` · **Status:** DRAFT

## §0 Why this arc exists, and its scope

The M-wave's W-UI cross-model review (2026-08-05) filed three sibling findings — a privacy leak in the crew Travel section, four live regions its new AST walk surfaced as mis-mounted, and five dead `role="status"` attributes left behind by the channel-announcer migration — and the 2026-07-25 impeccable critique deferred a share-link visibility cue that the user un-deferred into this arc on 2026-08-06. Four ledger entries, one implementation branch, all UI-touching (dual-gate work). Scope brief of record: the arc A scope brief in the session briefs directory (FX-worktrees, _briefs, arc-a — outside the repo; its ratified decisions are restated in full in §1.1, which is the in-repo capture of record); batch topology: the ABC authoring kickoff brief beside it.

Claimed entries (invariant 12, marked on `docs/arc-a-spec`, handed off to `feat/a11y-privacy-cluster` per §3):

1. `BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK` (BACKLOG.md) — fix 3 mechanical sites, record the ratified ruling on the 4th, archive.
2. `BL-LIVE-REGION-AST-WALK-RESIDUE` (BACKLOG.md) — repair the four PENDING sites, archive with the walk-blindness limit re-homed.
3. `BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS` (BACKLOG.md) — per-site verification executed (below), wire the three uncovered outcome messages, strip the five dead attributes, archive.
4. `SHARELINK-CUE-VISIBILITY-1` (DEFERRED.md) — ratified un-defer; ship the scroll-to-cue with transition inventory + reduced-motion arm, archive.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-06 by the user (the arc A scope brief; this section is the in-repo capture of record) unless another source is cited.

1. **Peer attendance days: Option A — exact days visible to every viewer; coordination wins.** Owner ruling 2026-08-06 (decision memo artifact `claude.ai/code/artifact/1f0752d8-4563-4ed0-87df-ed82f56110d9`). Zero code at `components/crew/sections/CrewSection.tsx` (`partialAttendanceLabel` call, symbol anchor; drafting-time locator :191). Do not redesign the chip, do not add capability branches. The ruling is recorded on the entry refutation-style (the entry's own Header.tsx precedent, BACKLOG.md `BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK` body) and in the `lib/crew/dateSuppression.ts` header.
2. **Global header show date is REFUTED as a leak site** — recorded in the entry (BACKLOG.md, the "One candidate is REFUTED" paragraph); do not re-raise. The privacy question is dates that imply the VIEWER's own schedule, not any rendered date.
3. **SHARELINK-CUE-VISIBILITY-1 is un-deferred INTO this arc by the user.** Do not re-litigate the deferral rationale; DO satisfy its stated requirements: a transition inventory for the new motion surface and a `prefers-reduced-motion` arm (§2.4).
4. **Cross-component live-region gate blindness is a documented limit, out of scope.** No whole-program analysis. The limit re-homes to the guard-file header when the entry archives (§2.2).
5. **Never delete a real announcement** (scope brief, entry 3). A dead region (inserted together with its text) is not a real announcement, but an outcome message with no channel path may not be left silent by the strip: it is wired or the region is kept with a reasoned exemption row (§2.3 table).
6. **Autonomy: both user review gates WAIVED** (user grant 2026-08-06, kickoff brief). Fable authors spec + plan; a fresh Opus pane implements. Stop only for a genuinely NEW question.
7. **All AGENTS.md invariants bind** — TDD (1), conventional commits (6), impeccable dual-gate (8: every entry here touches `components/`/`app/`), worktree-only (11), ledger claims (12), pre-code mechanical UI checklist.

## §2 Per-entry contracts

Entry bodies in BACKLOG.md/DEFERRED.md are the spec-of-record for evidence; this section states what the arc ADDS: the decision, scope boundary, and acceptance shape. Every code claim below was grep-verified 2026-08-06 in the pre-draft citation pass (three parallel read-only agents over the live worktree at `a0e41551c`); anchors are file + symbol — line numbers are drafting-time locators.

### §2.1 BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK — withhold viewer-schedule dates at three sites

**Mechanism (exists; zero new plumbing).** `lib/crew/dateSuppression.ts` exports exactly one function, `suppressesDates(restriction: DateRestriction): boolean`, true iff `restriction.kind === "unknown_asterisk"`. `TravelSection` (`components/crew/sections/TravelSection.tsx`, single exported component) already computes `const ctx = resolveViewerContext(viewer, data)` and `ViewerContext` carries `dateRestriction: DateRestriction` (`lib/data/viewerContext.ts`, field sourced from `viewerCrew.dateRestriction`, fallback `{ kind: "none" }`). The fix imports `suppressesDates`, computes `const hideDates = suppressesDates(ctx.dateRestriction)` once, and gates the three sites. This is the same shape `ScheduleSection.tsx` and `TodaySection.tsx` already use (e.g. `TodaySection.tsx` hotel rows: `hideDates ? [{ k: "Hotel", v: firstHotel.hotel_name ?? "", span: 2 }] : [check-in/check-out rows]`).

**Site contracts (what renders under `hideDates`):**

- **Ground-transport leg dates** (inside `legs.map(...)`; guard var `dateIsPrimary = leg.date !== null`, drafting locators :409/:439). Under `hideDates`, `dateIsPrimary` is forced false, so `primary` falls through to the existing non-date arm `leg.time ?? leg.stage` — the same rendering a null-date leg already gets. The `<time dateTime={leg.date}>` element must not mount (the datetime attribute is itself the leak).
- **Hotel check-in/out** (gate `res.check_in !== null || res.check_out !== null`, drafting locator :514). Under `hideDates` the `<dl>` with Check in / Check out rows does not mount; the hotel card renders name and its other non-date fields exactly as it does when both fields are null. This mirrors the `TodaySection` hotel treatment (name survives, dates do not).
- **Personal flight dates** (`seg.date ? formatFlightDate(seg.date) : (seg.dateRaw ?? "")`, drafting locator :603). Under `hideDates` BOTH arms are suppressed — `seg.dateRaw` is a raw date string and leaks identically — rendering the empty string. The Today/next-flight chip derived from `seg.date === flightTodayIso` (drafting locators :610-613) is ALSO suppressed under `hideDates`: "your flight is today" is exactly a viewer-schedule date claim.

**Guard conditions.** `hideDates` is computed from `ctx.dateRestriction`, which is total: `resolveViewerContext` falls back to `{ kind: "none" }` for admin/preview/missing-crew viewers, so every non-`unknown_asterisk` viewer (including `days`-listed partials, whose gated rendering elsewhere is unchanged by this arc) renders exactly today's output. No new prop; no partial-data state introduced.

**Fourth site — zero code.** `CrewSection`'s peer attendance label reads the PEER's `member.dateRestriction` via `partialAttendanceLabel` (renders "Partial (dates TBD)" for an `unknown_asterisk` peer — `lib/crew/partialAttendance.ts`). Ratified Option A (§1.1 item 1): visible to every viewer. The entry gains a refutation-style ruling paragraph (its own Header.tsx precedent as the template) and archives with all four sites dispositioned.

**Header bookkeeping.** The `lib/crew/dateSuppression.ts` header's gated list (currently: agenda days, key-times strip, schedule day derivation, Today Tonight rows) gains the three TravelSection sites; its NOT-GATED list (which today names exactly these three sites plus the roster label, citing this entry) shrinks to the roster label carrying the Option A ruling. Same commit as the code change — the header is the surface inventory of record.

**Tests (accept shape).** Existing TravelSection suites (`tests/components/crew/sections/TravelSection.test.tsx`, `tests/components/crew/sections/TravelSection.flight.test.tsx`, `tests/components/crew/sections/TravelSection.transportIdPath.test.tsx`) never exercise `dateRestriction`; the fixture pattern of record is `ScheduleSection.test.tsx`'s `withRestriction({ kind: "unknown_asterisk", days: null })` over `makeShowForViewer` (`tests/fixtures/showForViewer.ts`, default `{ kind: "none" }`). New cases per site assert, for an `unknown_asterisk` viewer: no fixture date string (ISO or formatted) reaches `container.textContent`, no `<time>` element with a `dateTime` mounts in the gated subtree, AND the non-date content (leg time/stage, hotel name, flight airline/route) still renders; a `{ kind: "none" }` twin case pins today's output unchanged. Anti-tautology: expected date strings derive from the fixture's own values (the `ALL_DATES` leak-sweep idiom in `ScheduleSection.test.tsx`), never hardcoded literals; the negative assertions run against the specific gated subtree where siblings could independently render a date, per the writing-plans anti-tautology rule.

### §2.2 BL-LIVE-REGION-AST-WALK-RESIDUE — repair the four PENDING sites

**Mechanism of record.** `tests/components/_metaLiveRegionMounting.test.ts` declares `PENDING: ReadonlyMap<string, string>` and enforces exactness: a row whose file yields zero `conditionalStatusRegions(...)` hits FAILS (the stale-row assertion names the file and directs removing the row). Repairing a site therefore means: fix the mounting so the AST walk finds no unexempted conditional status region in that file, and remove the PENDING row in the same commit — the meta-suite is the executable RED/GREEN for every site.

**Site contracts** (fix shape = the class's canonical move: the region mounts unconditionally in a parent that persists across the transition it announces; text is inserted INTO the persistent region):

1. `components/admin/dev/MaterializeCard.tsx` — region currently inside `result === null ? null : (...)`. Hoist the `role="status"` region above the result gate; the result content renders into it (or beside it with the announcement text into the region — plan pins the exact structure).
2. `app/admin/settings/admins/RevokeRowButton.tsx` — the couldn't-confirm warning (rendered "Couldn’t confirm. Refresh to check.", the apostrophe an `&rsquo;` entity in source) is inserted with its text after a failed revoke. A persistent key-stable region already exists in this file (`key="arm-expiry-region"`, `data-testid="arm-expiry-announce"`) as the in-file precedent; the fix gives the couldn't-confirm path the same shape (its own persistent region or the existing one — plan decides against the meta-suite's per-file expectations; `REGISTERED_SITES` counts RevokeRowButton at 1).
3. `components/admin/wizard/step3ReviewSections.tsx` — two moves in one file: (i) the `-report-status` span inside `ReportIssueSection` is gated on the send outcome it reports; it hoists above the outcome gate (the `expanded` form gate above it is a surface gate, eligible for the meta-suite's existing surface-gate exemption treatment iff the walk still flags it — plan verifies against `conditionalStatusRegions` output). (ii) `AgendaBreakdown`'s parsing region sits below the §4.6 guard `if (baseline.length === 0) return null;` — per the entry's own words, the region has to live ABOVE that guard, in the parent that persists across it. The persisting parent is the agenda section's `render` in `step3Sections` (rendered through `BreakdownSection`/`ModalSectionChrome`); the region moves there. The entry's accepted first-paint limit rides along: "Later transitions (loading → ready, ready → error) still announce correctly; only first paint cannot."
4. `components/admin/wizard/Step3ReviewModal.tsx` — the publish-error span ("Couldn't update the publish selection. Try again.") is mounted but its enclosing row is the final else-arm of the `resolution ? ... : isDirtyRescan ? ... : isFinalizeDemoted ? ... : (...)` chain. The region hoists above the chain so it persists across all four arms.

**Documented limit (re-homed, not fixed).** The cross-component walk blindness (a gate in a parent component hiding a child's region) stays a documented limit — §1.1 item 4. On archive, the limit statement moves to the guard file's header (`_metaLiveRegionMounting.test.ts`), which is the owning surface's limits record per the AGENTS.md filing bar; the archive entry cross-references it.

**Tests.** The meta-suite is structural proof. Each site additionally keeps/gains a behavioural assertion that its message still renders on the triggering state (existing component suites; plan enumerates which files pin which message), so the hoist cannot silently drop the text. Announcement-side behavioural coverage (region pre-exists its text) follows the pattern the class's prior repairs used.

### §2.3 BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS — verify per site, wire the gaps, strip the dead attributes

**Verification executed (2026-08-06 pre-draft probe; this table IS the per-site verification the entry demands).** `UndoAnnounceContext` (`components/admin/undoAnnounceContext.ts`) exposes `announce: (message: string) => void`. Announce-call census against each card's displayed messages:

| Site (symbol anchor; drafting locator) | Card message | Channel coverage | Disposition |
|---|---|---|---|
| `RoleRecognizeControl.tsx` saved card (:209) | `COPY.SAVED_HEADING` + summary | COVERED — `announce(...)` in `save()` success path | Strip `role="status"` |
| `RoleRecognizeControl.tsx` stale/conflict card (:257) | `COPY.STALE_COPY` / `COPY.CONFLICT_COPY` | NOT carried — `save()` only sets phase | WIRE: announce the stale/conflict copy on those branches, then strip |
| `RecentAutoAppliedStrip.tsx` undo-all confirm prompt (:506) | "Undo all {n} roster changes…?" | NOT carried | Strip WITHOUT wiring, reason recorded: an inline confirmation prompt is interactive content adjacent to the control the operator just activated (focus lands on its buttons), not a status transition; announcing prompts through a status channel is the wrong semantics. Recorded as a reasoned no-wire row in the guard header. |
| `RecentAutoAppliedStrip.tsx` error card (drafting locator :686, currently :688; `data-testid="auto-applied-error"`) | "We couldn't load recently auto-applied changes right now. Refresh to try again." | NOT carried — the file's one announce is success-shaped and lives in a different component (`GroupSection`) | WIRE: announce the load-failure message when the fetch resolves `infra_error`, then strip. This is the entry's named suspect site; the probe confirms it. |
| `ReSyncButton.tsx` success message (:362) | `summarizeResult(...)` ("Synced. …") | NOT carried — the file's one announce covers only the `shrink_held` pause branch | WIRE: announce the success summary on the success branch, then strip |

**Wiring contract.** Announce calls fire from the state-transition handler (the same place the card's state is set), never from render; message text is the SAME string the card displays (single source — the copy constant or the computed summary), so card and announcement cannot drift. No new copy, no §12.4 rows (these are existing catalog-mediated or component-local strings; no raw-code rendering).

**Bookkeeping in `_metaLiveRegionMounting.test.ts`, same commits as the sites they describe:** the `CHANNEL_ANNOUNCERS` header rows update as sites resolve; `CHANNEL_ANNOUNCE_CALLS` counts move (RoleRecognize 1→2, RecentAutoApplied 1→2, ReSync 1→2); `REGISTERED_SITES` rows for the five stripped attributes drop. The confirm-prompt no-wire reason lands in the header (it is the file's site inventory of record).

**Tests.** Per wired site: a behavioural case asserting the announce fires with the displayed message on the triggering transition (spy on the context value; assert against the same constant the card renders — anti-tautology: the expectation reads the copy constant, not a duplicated literal). Per stripped site: the existing card-rendering assertions still pass (text visible), and the meta-suite proves no `role="status"` remains.

### §2.4 SHARELINK-CUE-VISIBILITY-1 — scroll the URL block to the cue

**Trigger and mechanism.** `ShareHub.tsx` holds `flash: number | null` (a nonce: bumped on token rotation via the render-phase `prevToken !== token` branch; cleared by timer `SHARE_LINK_FLASH_MS` and by the close/`linkActive` predicate). The cue element is the crew-URL `<code>` (`data-testid="admin-current-share-link-url"`, keyed by token, flagged `data-share-link-flash` while flash is non-null) inside the row `data-testid="admin-current-share-link-row"`, at the top of the popover scroller (`data-testid="share-hub-popover"`). New behaviour: **on every null→non-null and n→n+1 flash edge** (i.e. whenever `flash` changes to a non-null value — each rotation re-fires), an effect scrolls the URL row into view inside the popover scroller, using the repo's existing archive-scroll idiom (rAF + `querySelector` + `typeof target.scrollIntoView !== "function"` jsdom guard — the guard comment in `ShareHub.tsx` is the precedent, sibling instances in `PublishedReviewModal.tsx`, `CrewRowActions.tsx`, `ShowReviewSurface.tsx`). No ref exists on the URL row today; the effect resolves it by `querySelector` on the popover subtree (matching the archive idiom) or a new ref — plan pins one.

**Reduced-motion arm (ratified requirement).** Snapshot `window.matchMedia("(prefers-reduced-motion: reduce)").matches` inside the effect (the repo's one-shot idiom — `GalleryLightbox.tsx`, `ReviewModalShell.tsx`; the `usePrefersReducedMotion` hook is for render-time params and returns `null` on first render, wrong for an event-time decision). Reduced motion: the scroll still happens but INSTANT (`behavior: "auto"`); default: `behavior: "smooth"`. Rationale: the cue's information ("the link changed, here it is") is the accessibility payload — skipping the scroll entirely would withhold it from exactly the users who asked for less motion; instant relocation delivers it without animation. Note the flash HIGHLIGHT under reduced motion is already ratified as "NO cue at all" (`DESIGN.md` §SHARE_LINK_FLASH_MS row) — that decision is untouched; the scroll is a separate, new surface and gets its own arm.

### Transition Inventory

New motion surface (§2.4's scroll cue); N=3 visual states of the cue system: idle, flash-active, flash-active-mid-scroll. No other entry in this arc adds or changes a visual state: §2.1 removes date content under an existing viewer kind (instant, matches the null-date render today), §2.2 moves where regions mount without changing what is visible, §2.3 strips attributes and adds announce calls with no visual delta.

| Pair | Treatment |
|---|---|
| idle → flash-active (rotation confirmed) | scroll popover to URL row (`smooth`, or instant under reduced motion) + existing flash keyframes (`share-link-flash-bg`/`-ring`; none under reduced motion — existing contract) |
| flash-active → idle (timer `SHARE_LINK_FLASH_MS`, or popover close / link deactivation) | instant — no animation needed (existing flash clear; scroll position stays where it is; no scroll-back) |
| flash-active → flash-active (re-rotation mid-flash; nonce n→n+1) | re-fire the scroll (idempotent if already in view: `scrollIntoView` on a visible target is a no-op-scale adjustment); flash keyframes restart via the `key={token}` remount — existing behaviour |
| Compound: popover closes mid-scroll | the effect's rAF fires against a detached/hidden node; `scrollIntoView` on a detached node is a silent no-op, the jsdom-shape guard already tolerates absence; flash cleared by the close predicate — no residue |
| Compound: rotation while popover scrolled anywhere | same as idle → flash-active — the scroll's entire purpose; no positional precondition |

**Tests.** (a) e2e, on the EXISTING harness: `tests/e2e/admin-lifecycle-layout.spec.ts` already monkeypatches `Element.prototype.scrollIntoView` into a `window.__siv` recording array (testid + options + popover `scrollTop` before/after) at 390x560, with the geometry premise asserted (popover overflows; target beyond the fold). A new case on that harness drives the rotate flow (open popover → scroll down to rotate control → arm → confirm) and asserts a `__siv` record whose testid is the URL row and — geometry premise first: the row's top is above the fold's scrolled-past region — that the popover `scrollTop` decreased after the call (the row is at the TOP; scrolling to it from the rotate control means scrolling up). The presence-plus-geometry split mirrors the existing archive-scroll case's anti-tautology note. (b) jsdom, in `shareHubFlashState.test.tsx` (production-ancestry mount already established there): define `Element.prototype.scrollIntoView` as a spy; assert it fires on the flash edge with the reduced-motion-dependent `behavior`, and does NOT fire on non-edge re-renders. Expected `behavior` values derive from the mocked `matchMedia` state (anti-tautology: the test sets the media state and derives the expectation from the same constant map the implementation uses is FORBIDDEN — the test hardcodes the two literal behavior strings per media state, which is the data-source side here).

### Dimensional Invariants

None new: the arc introduces no fixed-dimension parent with flex/grid children and no box-model change on any surface (scrolling mutates `scrollTop`, not layout; §2.1–§2.3 are attribute/gate/copy-free-position changes). If implementation introduces one after all, the plan's layout-dimensions rule fires and this section gains the relationship + a real-browser `getBoundingClientRect` assertion. Absence of entries here is a claim the impeccable audit checks.

## §3 Sequencing + claim-handoff protocol

Handoff-by-overlap, the L-wave §3 pattern (its capture: `docs/superpowers/specs/2026-08-06-l-wave-design.md` §3):

1. `docs/arc-a-spec` (this branch) claims all four entries (Stage 0 commit, pushed 2026-08-06).
2. BEFORE this branch's PR merges: the implementation worktree + branch `feat/a11y-privacy-cluster` is created off `origin/main`; from the MAIN checkout, `pnpm ledger:claims --check <the four ids>` must exit 1 naming `docs/arc-a-spec` and ONLY it (the planned-handoff signature; any other branch = real collision, stop). The implementation branch marks all four `**Status:** IN PROGRESS · **Branch:** feat/a11y-privacy-cluster`, commits, pushes.
3. THEN this branch's last pre-merge commit removes its four markers. At no instant is any entry undeclared on origin; the transient dual-declaration is the designed handoff state.
4. This branch's PR (spec + plan + implementer handoff doc + marker handoff) merges first — docs-only, preflight skip declared in the PR body. The Opus implementer executes from the HANDOFF doc in the arc's plan directory (created on this branch alongside the plan).
5. The implementation branch strips each entry's marker inside its archive move; any surviving markers strip in the PR's last pre-merge commit (invariant 12).
6. Ledger contention: `feat/l-wave-docs` (PR #720, merged), the L-wave push/emdash units, and sibling arcs C/B edit BACKLOG.md/DEFERRED.md. Claims are id-disjoint; `git merge origin/main` before opening the PR and again before merge; resolve ledger conflicts per-entry, preserving both sides.

## §4 Documented limits (this arc's own)

1. **Cross-component live-region gate blindness stays.** The AST walk sees one file at a time; a parent-component gate hiding a child's region is invisible to it. Re-homed to the guard-file header on archive (§2.2); a future whole-program pass is a separate decision.
2. **First paint of the agenda parsing region cannot announce** (entry's own accepted limit, preserved verbatim in the fix and the archive).
3. **The undo-all confirm prompt is deliberately not announced** (§2.3 table, reasoned no-wire row in the guard header). Re-open trigger: a screen-reader user reporting the prompt is missed.
4. **The scroll cue's reduced-motion arm scrolls instantly rather than skipping** (§2.4 rationale). The flash highlight's separate no-cue-under-reduced-motion contract is untouched. Re-open trigger: user feedback that any auto-scroll is unwanted under reduced motion.
5. **Travel-date suppression covers the three named sites plus the four already-gated surfaces.** The dateSuppression header is the inventory of record; a NEW date-rendering surface must add itself there (review-time discipline, not a new guard — same posture as the existing header contract).
6. **Peer attendance stays visible to all viewers by owner ruling** (§1.1 item 1). Re-open trigger: the owner revisits the coordination-vs-privacy call.

## §5 Meta-test / registry inventory (pre-declared for the plan)

- **EXTENDS:** `tests/components/_metaLiveRegionMounting.test.ts` — PENDING rows removed as sites repair (the suite's own exactness check forces this), `CHANNEL_ANNOUNCERS`/`CHANNEL_ANNOUNCE_CALLS`/`REGISTERED_SITES` updated in lockstep with each site commit (§2.2, §2.3). No new meta-test file.
- **CREATES:** no new structural guard. New behavioural cases land in existing suites (`TravelSection*.test.tsx`, the wired components' suites, `shareHubFlashState.test.tsx`, `admin-lifecycle-layout.spec.ts`).
- **Invariant-9/10 registries:** no new Supabase call site, no new mutation surface (all changes are client-render/announce/scroll; no route, no server action). A plan-time discovery to the contrary adds the registry row in the same commit.
- **§12.4 catalog:** untouched — no new user-visible error code; all copy is existing component-local constants (§2.3 wiring reuses the displayed strings verbatim).
- **Advisory locks:** untouched.

## §6 Acceptance criteria

- **AC-A1 (travel leak):** for an `unknown_asterisk` viewer, no leg date, hotel check-in/out, flight date/dateRaw, or today-flight chip renders in TravelSection (asserted per §2.1's test shape, fixture-derived date strings, `<time dateTime>` absence included); a `{ kind: "none" }` viewer's output is byte-identical to today's; the dateSuppression header lists the three sites as gated and carries the Option A ruling; the entry is archived with all four sites dispositioned (three fixed, one ruled).
- **AC-A2 (live regions):** all four PENDING rows removed with their files clean under `conditionalStatusRegions`; the meta-suite green; each repaired site's message still renders (behavioural assertion) and its region pre-exists the text; the walk-blindness limit re-homed to the guard header; entry archived.
- **AC-A3 (channel announcer):** the three uncovered outcome messages announce through `UndoAnnounceContext` on their transitions with the displayed string; all five `role="status"` attributes stripped; the confirm-prompt no-wire reason recorded in the guard header; `CHANNEL_ANNOUNCE_CALLS`/`REGISTERED_SITES` counts consistent; entry archived.
- **AC-A4 (share-link cue):** the scroll fires on every flash edge, targeting the URL row, smooth by default and instant under reduced motion; e2e case green on the 390x560 harness with its geometry premise; jsdom edge/non-edge cases green; transition inventory shipped as specced; entry archived out of DEFERRED.md.
- **AC-A5 (process):** claim handoff per §3 with no undeclared instant; TDD per task; conventional commits; impeccable dual-gate run on the implementation diff with P0/P1 fixed or DEFERRED-entried; `impeccable-gate:` marker line in the closeout; cross-model diff review APPROVE (round cap 4); real CI green before merge; main ff'd to `0 0`.

## §7 Impeccable gate

The implementation branch touches `components/crew/**`, `components/admin/**`, `app/admin/**` — invariant-8 UI surfaces throughout. `/impeccable` setup gates run BEFORE code (context.mjs load PRODUCT.md + DESIGN.md → register read); critique + audit run on the implementation diff at close; P0/P1 fixed or DEFERRED-logged; the closeout carries the filled `impeccable-gate:` marker line. The pre-code mechanical checklist (em-dash ban in new copy — §2.3 wiring adds no new copy, §2.4 adds none; 44px tap targets — no new interactive element; canonical classes) applies to every diff hunk. This authoring branch itself ships no UI surface.

impeccable-gate: N/A — no UI surface (authoring branch; the implementation branch's filled marker lands in its closeout)
