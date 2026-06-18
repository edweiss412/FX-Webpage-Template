# Crew Show-Page Redesign — Phase 2: Shell + nav + primitives + projection alert

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Read `00-overview.md` first (binding shared contracts, verified-facts digest, file structure, meta-test inventory). This repo uses **Vitest** (`pnpm vitest run <path>`), not Jest. Playwright via `pnpm exec playwright test <path> --project=mobile-safari`. Every task: failing test (ACTUAL code) → run-to-fail → minimal impl (ACTUAL code) → run-to-pass → commit. NO placeholders. Derive every expected value from the fixture (never hardcode). UI files are Opus-owned (invariant: AGENTS.md routing).

**Phase scope (Phase 2 of 4):** `lib/crew/resolveActiveSection.ts` + `lib/crew/selectPrimaryContact.ts`; the five `components/crew/primitives/*`; `components/crew/RightNowHero.tsx`; `app/show/[slug]/[shareToken]/_CrewShell.tsx`; `components/crew/CrewSubNav.tsx` + `components/crew/CrewSectionTransition.tsx`; `page.tsx` searchParams widening + the deep-link-preservation auth boundary (`validateNextParam` allow-listed show-section query + the `clearIdentity`/`selectIdentity` recovery redirects — R4-HIGH-1); the preview-as route swap; `loading.tsx`; the `upsert_admin_alert` failedKeys-union-merge migration + the `TILE_PROJECTION_FETCH_FAILED` four-part lockstep + meta-test extensions + the validation-backed dedup test.

**Inputs (depend on Phase 1 being green):** `lib/crew/resolveKeyTimes.ts`, `ProjectedRoomRow`, the new `buildRightNowContext` signature (`{ show, dateRestriction, hotelReservations, rooms }`), `dates.loadIn`. The sections themselves (`components/crew/sections/*`) and `selectPrimaryContact`'s *consumers* land in Phase 3; this phase defines `selectPrimaryContact` and pins its determinism test (test 31) because the shell + a stub Today reference it.

**CRITICAL ORDERING (§4.13 / §10 sequencing — non-negotiable):** the `TILE_PROJECTION_FETCH_FAILED` alert plumbing + minimal `_CrewShell` producer + `_metaAdminAlertCatalog` registration (Task 8, ONE commit — R1-HIGH-1: these are mutually dependent via the union⊆registry check), the `upsert_admin_alert` migration (Task 9) + its validation-backed dedup test (Task 10), the full `_CrewShell` render extending the minimal producer (Task 11), and the `_metaSentinelHidingContract` extension (Task 4) must **all be GREEN in Phase 2** — *before* Phase 4 deletes the `_ShowBody.tsx` always-rendered `notes-tile` alert path. The section-independent observability must be live before its render-bound predecessor is removed. **Intra-phase dependency order:** Tasks 1–7 (helpers/primitives/hero/nav/loading) are independent; then **Task 8 (alert plumbing + minimal producer) → Task 9 (migration) → Task 10 (validation dedup test) → Task 11 (full `_CrewShell`, incl. the mixed-viewer accumulation test which needs Task 10's live RPC) → Tasks 12–13 (page wiring)**. This is restated in **Phase exit criteria**.

**Live-code anchors (base `a2884c3f`, from 00-overview verified-facts):** `page.tsx` renders `ShowBody` at `:129`/`:166`, awaits `searchParams: Promise<{ gate?: string }>` at `:71`/`:74`, `gateSkip` guard `:182`. `_ShowBody.tsx`: malformed-projection guard `:113-121`, `buildRightNowContext` call `:122-127`, `notes-tile` catch-all `:403-431` (keys `:410` hotel/rooms/contacts ungated + transportation gated `:416`), `ShowRealtimeBridge renderVersion` `:469`, Footer report props `:509-539`, `nowDate()` `:133`. Preview-as `app/admin/show/[slug]/preview/[crewId]/page.tsx` renders `ShowBody` `:233`, `PageProps` `:51-53` (no `searchParams`), `force-dynamic` `:48`. Migration `supabase/migrations/20260505000000_upsert_admin_alert.sql` (plain upsert, body `:13-20`). `upsertAdminAlert` helper `lib/adminAlerts/upsertAdminAlert.ts:42-55`, `AdminAlertCode` union `:3-34` (no `TILE_PROJECTION_FETCH_FAILED`). Catalog `TILE_SERVER_RENDER_FAILED` `lib/messages/catalog.ts:1690-1702`; §12.4 prose table at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2934` + helpfulContext map `:3117`. `_metaAdminAlertCatalog.test.ts` registry `:57-98`, union⊆registry assertion `:372-377`, `INTERPOLATED_DOUG_FACING_CODES` `:331-337`. `_metaSentinelHidingContract.test.ts` `TILES_DIR` `:83`, `listTileFiles()` `:235-239`. `RightNowCard.tsx` clock `:355` (`useState(()=>new Date())`), tick+visibilitychange `:380-389`, `selectRightNowState` re-derive per render. Existing `tests/admin/upsertAdminAlert.test.ts:58-67` reads the OLD migration file and asserts `+ 1` / `context = excluded.context` — **do not edit the old file**; the new migration is a separate file.

---

### Task 1: `resolveActiveSection` (test 1)

**Files:** `lib/crew/resolveActiveSection.ts` (new), `tests/crew/resolveActiveSection.test.ts` (new)

- [ ] Write `tests/crew/resolveActiveSection.test.ts` with ACTUAL assertions covering the §9 test-1 matrix. _Failure mode: an invalid `?s=` renders a broken/empty shell, or a non-entitled `?s=budget` leaks Budget._
  ```typescript
  import { describe, expect, test } from "vitest";
  import { resolveActiveSection, BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

  describe("resolveActiveSection", () => {
    test("absent/empty/unknown → today", () => {
      for (const raw of [undefined, "", "bogus", "TODAY", "venue "]) {
        expect(resolveActiveSection(raw, { budgetVisible: false })).toBe("today");
      }
    });
    test("each base id resolves to itself", () => {
      for (const id of BASE_SECTION_IDS) {
        expect(resolveActiveSection(id, { budgetVisible: false })).toBe(id);
      }
    });
    test("budget gated by budgetVisible (single predicate)", () => {
      expect(resolveActiveSection("budget", { budgetVisible: false })).toBe("today");
      expect(resolveActiveSection("budget", { budgetVisible: true })).toBe("budget");
    });
  });
  ```
- [ ] Run to fail: `pnpm vitest run tests/crew/resolveActiveSection.test.ts`.
- [ ] Implement `lib/crew/resolveActiveSection.ts` with the EXACT 00-overview signature:
  ```typescript
  export type SectionId = "today" | "schedule" | "venue" | "travel" | "crew" | "gear" | "budget";
  export const BASE_SECTION_IDS = ["today", "schedule", "venue", "travel", "crew", "gear"] as const;
  const ALL_IDS = new Set<SectionId>([...BASE_SECTION_IDS, "budget"]);

  export function resolveActiveSection(
    raw: string | undefined,
    opts: { budgetVisible: boolean },
  ): SectionId {
    if (raw === undefined || !ALL_IDS.has(raw as SectionId)) return "today";
    if (raw === "budget" && !opts.budgetVisible) return "today";
    return raw as SectionId;
  }
  ```
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): resolveActiveSection with single-predicate Budget gate`.

---

### Task 2: `selectPrimaryContact` determinism (test 31)

**Files:** `lib/crew/selectPrimaryContact.ts` (new), `tests/crew/selectPrimaryContact.test.ts` (new)

> Defined here (shell-adjacent); its render consumer (Today "Need something") lands in Phase 3. Pin its determinism now (test 31).

- [ ] Write `tests/crew/selectPrimaryContact.test.ts`. Build `ContactRow[]` fixtures with the FIRST entry unactionable (blank/sentinel phone+email) and a LATER one actionable; assert the actionable one is chosen identically across `[...arr]` and `[...arr].reverse()`; all-unactionable → `null`; tie-break by `kind` then `name` when ≥2 actionable. Derive expected `name` from the fixture, not a literal. _Failure mode: a nondeterministic / blank-phone "Need something" card; flaky screenshots._
  ```typescript
  import { describe, expect, test } from "vitest";
  import type { ContactRow } from "@/lib/parser/types";
  import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";

  const mk = (over: Partial<ContactRow>): ContactRow =>
    ({ kind: "venue", name: "", phone: null, email: null, notes: null, ...over } as ContactRow);

  describe("selectPrimaryContact", () => {
    test("prefers an actionable contact regardless of array order", () => {
      const unactionable = mk({ name: "Front Desk", kind: "venue", phone: "TBD", email: "" });
      const actionable = mk({ name: "AV Lead", kind: "in_house_av", phone: "555-0100" });
      const order1 = selectPrimaryContact([unactionable, actionable]);
      const order2 = selectPrimaryContact([actionable, unactionable]);
      expect(order1?.name).toBe(actionable.name);
      expect(order2?.name).toBe(order1?.name);
    });
    test("none actionable → null", () => {
      expect(selectPrimaryContact([mk({ phone: "N/A", email: "TBA" })])).toBeNull();
    });
    test("tie-break by kind then name across orderings", () => {
      const a = mk({ name: "Bravo", kind: "in_house_av", phone: "555-0001" });
      const b = mk({ name: "Alpha", kind: "venue", phone: "555-0002" });
      const r1 = selectPrimaryContact([a, b]);
      const r2 = selectPrimaryContact([b, a]);
      expect(r1?.name).toBe(r2?.name);
    });
  });
  ```
- [ ] Run to fail.
- [ ] Implement `lib/crew/selectPrimaryContact.ts` (signature from 00-overview). Use `shouldHideGenericOptional` for the sentinel/empty test on `phone`/`email`; "actionable" = at least one of phone/email is non-sentinel; tie-break sort by `(kind, name)` (stable, total order); return first actionable in sorted order, else `null`.
  ```typescript
  import type { ContactRow } from "@/lib/parser/types";
  import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

  export function selectPrimaryContact(contacts: ContactRow[]): ContactRow | null {
    const actionable = contacts.filter(
      (c) => !shouldHideGenericOptional(c.phone ?? "") || !shouldHideGenericOptional(c.email ?? ""),
    );
    if (actionable.length === 0) return null;
    return [...actionable].sort(
      (a, b) => a.kind.localeCompare(b.kind) || (a.name ?? "").localeCompare(b.name ?? ""),
    )[0] ?? null;
  }
  ```
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): deterministic selectPrimaryContact (actionable-first)`.

---

### Task 3: Presentational primitives (SectionCard, KeyValueRows, DayCard, KeyTimesStrip)

**Files:** `components/crew/primitives/SectionCard.tsx`, `KeyValueRows.tsx`, `DayCard.tsx`, `KeyTimesStrip.tsx` (all new); `tests/components/crew/primitives.test.tsx` (new)

> `PersonRow` is split into Task 5 (it is the first primitive that reads a generic-optional field — `notes` — so the `_metaSentinelHidingContract` extension lands with it). The four here cover SectionCard/KeyValueRows/DayCard/KeyTimesStrip guards (§4.6 + §4.8).

- [ ] Write `tests/components/crew/primitives.test.tsx` (jsdom, `@testing-library/react`) asserting the §4.8 guard matrix per primitive, deriving expected from the fixture:
  - `SectionCard`: omits `icon`/`title`/`action` when the prop is absent; always renders `children`.
  - `KeyValueRows`: a row whose `v` is `""`/absent is omitted (assert the omitted `k` label is **not** in the DOM; present rows render `k`+`v`+optional `sub`).
  - `DayCard`: `today` flag applies the pinned style hook (`data-today="true"`); `meta` null → phase line alone, no meta node.
  - `KeyTimesStrip`: all-absent anchors → renders nothing (`container.firstChild` null); partial `{ set, strike }` (no `show`) → exactly Set + Strike rows, no Show row (assert by counting `[data-anchor]` nodes derived from the fixture's present keys). _Failure mode: a blank row/strip rendering; a present anchor dropped; a label leaking for an empty value._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/primitives.test.tsx`.
- [ ] Implement the four primitives with EXACT 00-overview prop contracts. Use existing `@theme` tokens (no inline `tracking-[…]` — banned by `tests/styles/eyebrow-tracking.test.ts`). `KeyValueRows` omits a row when `shouldHideGenericOptional(v)`. `KeyTimesStrip` value column uses `tabular-nums`; each present anchor row carries `data-anchor="set|show|strike"`; returns `null` when all three absent. Add a `data-testid` per primitive for downstream layout asserts (Phase 4): `section-card`, `key-value-rows`, `day-card`, `key-times-strip`.
  - Props: `SectionCard {icon?, title?, action?, children}`; `KeyValueRows {rows: {k, v, sub?, icon?}[]}`; `DayCard {day, phase, today, meta?}`; `KeyTimesStrip {anchors: KeyTimeAnchors}` (import `KeyTimeAnchors` from `@/lib/crew/resolveKeyTimes`).
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): SectionCard/KeyValueRows/DayCard/KeyTimesStrip primitives`.

---

### Task 4: `PersonRow` primitive + EXTEND `_metaSentinelHidingContract` walk (test 10, meta-test #1)

**Files:** `components/crew/primitives/PersonRow.tsx` (new), `tests/components/crew/personRow.test.tsx` (new), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (modify)

> This is the FIRST `components/crew/` component that reads a generic-optional field (`person.notes`), so the meta-test directory walk extension lands in the SAME commit (00-overview meta-test inventory #1; spec wp-10 — pre-flight). The sentinel-hiding contract must enforce on `components/crew/` from this commit forward.

- [ ] First extend the meta-test so it would FAIL on a `components/crew/` file that reads a generic-optional field without `shouldHideGenericOptional`. In `_metaSentinelHidingContract.test.ts`, change `listTileFiles()` (`:235-239`) to walk both `components/tiles/` AND recursively `components/crew/sections/` + `components/crew/primitives/` (return relative-qualified entries; `readTileSource` resolves from the correct base). Keep the `.tsx` filter + `NON_TILE_FILES` exemption set. Add a sanity assertion that at least one `components/crew/` file is in the list. _Failure mode: a new section/primitive reads venue/notes/contact/room fields without sentinel-hiding and CI stays green._
- [ ] Write `tests/components/crew/personRow.test.tsx` (test 10 matrix), expected derived from fixture:
  - phone-only → `tel:` button present, no `mailto:`; email-only → inverse; neither → no action column; both → both buttons.
  - `tel:`/`mailto:` href sanitization (sentinel/blank phone → no `tel:`).
  - nameless contact (`name` blank) with phone/email → row renders with the `fallbackLabel` + tap actions (preserves `ContactsTile` nameless-contact behavior).
  - `notes` present → rendered; `notes` sentinel (`"TBD"`) → hidden.
  - name AND role AND phone AND email all absent → row omitted (`container.firstChild` null).
  _Failure mode: empty action buttons; bad hrefs; dropping a nameless-but-actionable contact or contact notes during the tile→section port._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/personRow.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts`.
- [ ] Implement `components/crew/primitives/PersonRow.tsx` (EXACT 00-overview props: `{person: {name?, role?, fallbackLabel?, phone?, email?, notes?, you?, lead?, primary?}}`). Port the dead-link guards from `CrewTile`/`ContactsTile`: render `tel:`/`mailto:` only when `digitsOnly(phone).length > 0` and non-sentinel; route `notes` through `shouldHideGenericOptional`; name-absent → render `fallbackLabel`; `you`/`lead`/`primary` set their badge/style hooks. Call/email buttons carry `aria-label` and `min-h-tap-min` (≥44px, §4.19). `data-testid="person-row"`.
- [ ] Run to pass (BOTH the personRow test AND the meta-test). `pnpm tsc --noEmit`. Commit `feat(crew-page): PersonRow primitive + extend sentinel-hiding walk to components/crew`.

---

### Task 5: `RightNowHero` (tests 5, 6, 22b)

**Files:** `components/crew/RightNowHero.tsx` (new), `tests/components/crew/rightNowHero.test.tsx` (new)

> `RightNowHero` IS `RightNowCard` re-skinned to the hero's 5 slots (§4.3/§4.16). It owns the client clock (`useState(()=>new Date())`, `RightNowCard.tsx:355`), the 60s tick + `visibilitychange` refresh (`:380-389`), re-derives `selectRightNowState(now, context.dates, context.dateRestriction, { timezone })` per tick, and carries the `lastGood`/`morph-to-last-good` + `transitionTreatment` 66-pair + `prefersReducedMotion` machinery verbatim. Props `{ context }` ONLY — no `state`, no `initialNow`, no server seed. Does NOT call `nowDate()`.

- [ ] Write `tests/components/crew/rightNowHero.test.tsx` (jsdom + fake timers). Build `RightNowContext` fixtures via the new `buildRightNowContext` (Phase 1) for representative kinds; derive the expected eyebrow/lead/progress/treatment from the §4.3 12-row map applied to the fixture (do NOT hardcode copy — assert structural slots + the kind's row). Cases:
  - **Test 5 (12-state map):** for each of the 12 kinds, the hero renders the mapped eyebrow + lead; degraded kinds (`dateless`/`unknown`/`viewer_unconfirmed`) carry the stale-tint hook AND no stats node; `show_day_n` renders N progress segments derived from `total`; travel-day kinds render hotel name/dates stats only (assert NO `flight`/`next-call` stat node — Phase-1 source boundary).
  - **Test 5 re-derive across day boundary:** mount at a `frozennow` in `show_day_1`, advance fake timers past a day boundary + dispatch `visibilitychange`, assert the hero RE-DERIVES to the next kind (e.g. `show_day_2` or `viewer_off_day`) — proving it owns the live clock and does not freeze the SSR state.
  - **Test 6 (stat guards):** empty/all-null stats → no strip node; a non-finite numeric in a stat → that stat omitted (other stats remain).
  - **Test 22b (client-clock freeze):** with `new Date` overridden to a fixed instant at mount, the rendered state is deterministic post-hydration (no drift) and the component reads `new Date()`, NOT a `nowDate`/server seed.
  _Failure mode: a state missing/mis-skinned; fabricated stats on degraded states; out-of-scope flight/call stats; a hero that renders a precomputed SSR state and goes stale after a tab sits open; the hero depending on `nowDate()` breaking `RightNowCard` parity._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx`.
- [ ] Implement `components/crew/RightNowHero.tsx` (`'use client'`, `export function RightNowHero(props: { context: RightNowContext }): JSX.Element`). Lift the `RightNowCard` clock + state-derivation + `lastGood`/`morph` + `AnimatePresence mode="wait" initial={false}` + `transitionTreatment` machinery; re-skin `renderBody` output into the 5 hero slots (eyebrow + live-dot, lead, detail, progress segments, stats ≤3 with one accented) per the §4.3 map. Container `min-h-(--spacing-right-now-min-h)` held constant through crossfade (Dimensional invariant #4, asserted in Phase 4). Stats two-level omission per §4.8/Task-6. `data-testid="right-now-hero"`; stat strip `data-testid="right-now-stats"`; degraded tint hook `data-degraded="true"`.
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): RightNowHero (RightNowCard re-skinned to 5 hero slots)`.

---

### Task 6: `CrewSubNav` + `CrewSectionTransition` (test 13 partial, test 28 partial — client islands)

**Files:** `components/crew/CrewSubNav.tsx`, `components/crew/CrewSectionTransition.tsx` (both new); `tests/components/crew/crewSubNav.test.tsx` (new)

> `CrewSubNav` is `'use client'`: builds the next URL from `useSearchParams` (replacing only `s`, preserving `gate`), `router.push(url, { scroll: false })`. `CrewSectionTransition` wraps the server-rendered active section as `children`, keyed by section id, framer crossfade `initial={false}`, reduced-motion-safe (§4.10). Full nav addressability + back-button + gate-preservation are Playwright-asserted in Phase 4 (test 13/28); this task pins the unit-level URL-building + structure.

- [ ] Write `tests/components/crew/crewSubNav.test.tsx` (jsdom; mock `next/navigation` `useRouter`/`usePathname`/`useSearchParams`). Assert:
  - With `useSearchParams` = `gate=skip`, clicking the "venue" tab calls `router.push` with a URL whose query has BOTH `s=venue` AND `gate=skip` (rebuilt from current params, not a bare `?s=venue`) and `{ scroll: false }`. _Failure mode: tab-click clobbers `gate` (the test-13 tab-click case)._
  - The active section's tab carries `aria-current="page"`; non-active tabs do not.
  - Both the desktop tab row (`hidden min-[720px]:flex`) and the mobile bottom bar (`min-[720px]:hidden`) render in the DOM (CSS-only switching, §4.7); each inside a `<nav aria-label="Show sections">`.
  - Budget tab renders iff `budgetVisible` prop true.
- [ ] Run to fail: `pnpm vitest run tests/components/crew/crewSubNav.test.tsx`.
- [ ] Implement `CrewSubNav.tsx`: props `{ activeSection: SectionId; budgetVisible: boolean }`. Tabs = `BASE_SECTION_IDS` (+ `budget` iff `budgetVisible`). On tab activation: `const next = new URLSearchParams(useSearchParams().toString()); next.set("s", id); router.push(\`${pathname}?${next}\`, { scroll: false })`. `aria-current` from `activeSection`. After push, reset scroll region to top (§4.1a — `window.scrollTo(0,0)` in the click handler). Tap targets ≥44px (`min-h-tap-min`). Tab indicator transitions via `--duration-fast` `--ease-out-quart` (instant under reduced-motion, token-driven). `data-testid="crew-sub-nav"`, each tab `data-section={id}`.
- [ ] Implement `CrewSectionTransition.tsx` (`'use client'`): props `{ sectionId: SectionId; children: ReactNode }`. `<AnimatePresence mode="wait" initial={false}><motion.div key={sectionId} ...>{children}</motion.div></AnimatePresence>`; crossfade + 4px translateY, `--duration-normal` (220ms) `--ease-out-quart`; reduced-motion via the shared `usePrefersReducedMotion()` (`lib/a11y/usePrefersReducedMotion.ts`) collapsing duration to 0. Render the wrapper unconditionally (never branch the tree SHAPE on reduced-motion — the M12.11 framer trap); `data-testid="crew-section-transition"`. On `sectionId` change, move focus into the section landmark (§4.19) — leave the focusable region to the section; the wrapper exposes the keyed boundary.
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): CrewSubNav (gate-preserving ?s= push) + CrewSectionTransition crossfade`.

---

### Task 7: `loading.tsx` (test 35 partial — skeleton, NO Budget tab)

**Files:** `app/show/[slug]/[shareToken]/loading.tsx` (new), `tests/components/crew/loading.test.tsx` (new)

> The route has NO `loading.tsx` today (verified-facts). It must render a shell-matching skeleton during the initial fetch + picker/auth flow, with ONLY the 6 base section tabs — NEVER the conditional Budget tab (its `financialsVisible` gate is unknown pre-projection; §4.17).

- [ ] Write `tests/components/crew/loading.test.tsx`: render `Loading` (default export of `loading.tsx`), assert it contains a Header band placeholder, a sub-nav placeholder, and an empty section frame node; assert it renders the 6 base tab labels/placeholders and **no** node containing the text `Budget` (case-insensitive scan of the rendered DOM). Assert no em-dash and no raw error code appears in the skeleton (DESIGN.md §9 / invariant 5). _Failure mode: blank first paint; a lead-gated Budget tab flashing during load/auth/picker._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/loading.test.tsx`.
- [ ] Implement `app/show/[slug]/[shareToken]/loading.tsx` (default-exported component). Skeleton: Header band + `CrewSubNav`-shaped placeholder rendering the 6 base tabs (or unlabelled placeholders) and an empty section frame at `min-h-(--spacing-right-now-min-h)`. Use only existing `@theme` tokens. Not in the screenshot manifest (§4.17). `data-testid="crew-loading-skeleton"`.
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): loading.tsx shell skeleton (6 base tabs, never Budget)`.

---

### Task 8: `TILE_PROJECTION_FETCH_FAILED` alert plumbing — four-part lockstep + `_metaAdminAlertCatalog` registration + the MINIMAL `_CrewShell` producer, ONE commit (R1-HIGH-1; tests 16/29/36 catalog half, meta-test #2)

**Files:** `lib/adminAlerts/upsertAdminAlert.ts` (modify), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (modify), `lib/messages/catalog.ts` (modify), `lib/messages/__generated__/spec-codes.ts` (regenerated), `tests/messages/_metaAdminAlertCatalog.test.ts` (modify), **`app/show/[slug]/[shareToken]/_CrewShell.tsx` (CREATE — minimal producer)**, `tests/components/crew/crewShellAlert.test.tsx` (new)

> **Why these land together (R1-HIGH-1 — they are MUTUALLY DEPENDENT, no green per-commit path exists otherwise):** `_metaAdminAlertCatalog` already enforces **union⊆registry** (`:372-377`), so adding `TILE_PROJECTION_FETCH_FAILED` to the `AdminAlertCode` union (Layer 1, needed for the typed `upsertAdminAlert({ code })` to compile) **requires** adding it to `ADMIN_ALERTS_CODES`, which **requires** an `ADMIN_ALERTS_WRITE_SITES` producer entry, which **requires** `_CrewShell.tsx` to exist and contain the upsert. Splitting these makes some intermediate commit red (a union member with no registry row, or a write-site pattern matching a non-existent file). So this task lands the full four-part lockstep (master-spec §12.4 prose + `gen:spec-codes` + `catalog.ts` row + `AdminAlertCode` union) **plus** the `_metaAdminAlertCatalog` registration **plus** a **MINIMAL `_CrewShell.tsx`** whose only job is the server-side projection-alert upsert (the producer), in **ONE commit** where `tsc`, `x1-catalog-parity`, and `_metaAdminAlertCatalog` are all green together. **Task 11 then EXTENDS this minimal `_CrewShell`** with the full render (Header → nav → section → Footer, the fail-closed guard, the report-prop port) — Task 11 is an extension, not a from-scratch create. No DB change — `admin_alerts.code` is unconstrained `text`.

- [ ] Extend the meta-test FIRST so it fails until all four lockstep layers move. In `_metaAdminAlertCatalog.test.ts`:
  - Add `"TILE_PROJECTION_FETCH_FAILED"` to `ADMIN_ALERTS_CODES` (`:57-98`).
  - Add its `ADMIN_ALERTS_WRITE_SITES` entry: `{ path: "app/show/[slug]/[shareToken]/_CrewShell.tsx", pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"TILE_PROJECTION_FETCH_FAILED"/ }`.
  - Add it to `INTERPOLATED_DOUG_FACING_CODES` (`:331-337`) — its `dougFacing` carries `<sheet-name>` and the producer supplies `sheet_name`.
  - Add a NEW assertion (the registry⊆union direction the test lacks today — it only has union⊆registry at `:372-377`): every code in `ADMIN_ALERTS_CODES` is admitted by `adminAlertCodeUnionMembers()`:
    ```typescript
    test("every registered admin-alert code is admitted by the AdminAlertCode union", () => {
      const union = new Set(adminAlertCodeUnionMembers());
      const missing = ADMIN_ALERTS_CODES.filter((c) => !union.has(c));
      expect(missing).toEqual([]);
    });
    ```
  _Failure mode: a registered code missing from the `AdminAlertCode` union (the typed `upsertAdminAlert({ code })` call wouldn't compile but the meta-test today wouldn't flag a stale registry entry)._
- [ ] Run to fail: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts` (fails: missing union member + missing write-site file).
- [ ] **Layer 1 — `AdminAlertCode` union:** add `| "TILE_PROJECTION_FETCH_FAILED"` to `lib/adminAlerts/upsertAdminAlert.ts:3-34`.
- [ ] **Layer 2 — §12.4 prose:** add a row to the master-spec §12.4 table (under the **Tile error boundaries (server-side)** group, after `TILE_SERVER_RENDER_FAILED` at `:2934`). Columns: code | trigger | dougFacing | crewFacing | followUp. Pattern-match the `TILE_SERVER_RENDER_FAILED` row. No em-dash (use commas/colons/parentheses, §4.18). Example row (adapt copy, keep `*<sheet-name>*` interpolation, crewFacing null since crew never sees it):
  - `| `TILE_PROJECTION_FETCH_FAILED` | the crew-page projection (`getShowForViewer`) reported one or more data-source fetch failures (`tileErrors`); the page rendered, but a data domain (rooms, hotel, contacts, transportation, or financials) could not load. | "*<sheet-name>*: one or more crew-page data sources couldn't load (see the failed sources in the alert detail). The page rendered with the rest of the data; refresh in a minute. Tell the developer if this keeps happening." | — | Doug → refresh / Report; Eric → investigate |`
  - Also add the matching entry to the §12.4 helpfulContext appendix map (near `:3117`, after `TILE_SERVER_RENDER_FAILED`): `TILE_PROJECTION_FETCH_FAILED: "The crew page loaded, but one or more of its data sources (rooms, hotel, contacts, transportation, or financials) failed to fetch from the server. The page rendered with the data that did load. The failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click 'Report' so the developer can investigate."`
- [ ] **Layer 3 — regenerate spec-codes:** `pnpm gen:spec-codes` → updates `lib/messages/__generated__/spec-codes.ts`. Stage the regenerated file.
- [ ] **Layer 4 — `catalog.ts` row:** add a `TILE_PROJECTION_FETCH_FAILED` entry to `MESSAGE_CATALOG` (pattern-match `TILE_SERVER_RENDER_FAILED` `:1690-1702` — `code`, `dougFacing` with `*<sheet-name>*`, `crewFacing: null`, `followUp`, `helpfulContext`, `title`, `longExplanation`, `helpHref: "/help/errors#TILE_PROJECTION_FETCH_FAILED"`). Copy must match the §12.4 prose verbatim (x1 parity compares them). No em-dash.
- [ ] **Create the MINIMAL `_CrewShell.tsx` producer** (Task 11 extends it). Write `tests/components/crew/crewShellAlert.test.tsx` first: render `CrewShell` (async Server Component) with `data.tileErrors = { hotel, rooms, contacts }` populated → EXACTLY ONE `upsertAdminAlert` call, `code: "TILE_PROJECTION_FETCH_FAILED"`, `context.failedKeys` = sorted `['contacts','hotel','rooms']` (derived from the fixture's `tileErrors` keys, not hardcoded), `context.sheet_name === data.show.title`, `context.tileId === 'crew:projection-alert'`, NO `signature`/`viewerVersionToken` key; a HEALTHY projection (`tileErrors={}`) → NO call; the upsert mock rejecting → still renders (fail-quiet). Then implement the minimal shell:
  ```tsx
  // app/show/[slug]/[shareToken]/_CrewShell.tsx  (MINIMAL — Task 11 adds Header/nav/section/Footer/guard)
  import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
  export async function CrewShell({ data, viewer, rawSection, slug, shareToken }: CrewShellProps) {
    const failedKeys = Object.keys(data.tileErrors).sort();
    if (failedKeys.length > 0) {
      try {
        await upsertAdminAlert({ showId: data.show.id, code: "TILE_PROJECTION_FETCH_FAILED",
          context: { sheet_name: data.show.title, tileId: "crew:projection-alert",
            message: PROJECTION_ALERT_MESSAGE, failedKeys } }); // R3-HIGH-1: message is VIEWER-INDEPENDENT (constant) — the per-domain detail lives in `failedKeys`; see note below
      } catch (e) { console.warn("[CrewShell] projection-alert upsert failed (fail-quiet):", e); }
    }
    // R2-HIGH-1: CrewShell is the SINGLE authority for the section + Budget gate — resolve here,
    // after the viewer context, so resolveActiveSection and financialsVisible can never diverge.
    const ctx = resolveViewerContext(viewer, data); // Task 11 wraps this in the fail-closed try/catch
    const activeSection = resolveActiveSection(rawSection, { budgetVisible: financialsVisible(ctx.viewerFlags, ctx.isAdmin) });
    return <div data-testid="crew-shell" data-active-section={activeSection} />; // Task 11 fills the body
  }
  ```
  Carry the inline `// not-subject-to-meta: best-effort observability write, fail-quiet` note OR add the call site to the relevant call-boundary audit (00-overview meta-inventory #7 — decide by checking which audit, if any, walks `app/show/**`).
  - **`PROJECTION_ALERT_MESSAGE` is a module-level CONSTANT (R3-HIGH-1 — viewer-independent):** `const PROJECTION_ALERT_MESSAGE = "One or more crew-page data sources failed to load; the affected domains are listed in the alert detail." ;` (no em-dash). **Do NOT** embed the per-render key count or `failedKeys.join(", ")` in `message` — the §4.13 "e.g. N sources: rooms, hotel" wording is **illustrative**, and taking it literally would VIOLATE the spec's own §4.13 invariants: (a) **viewer-independence** — a lead render's message ("3 sources: rooms, financials, transportation") vs an ordinary-crew render's ("2 sources: rooms, transportation") would store mutually-inconsistent prose against the same union'd `failedKeys`; (b) **the R39 no-op write-bound** — the `WHERE`-gated no-op compares the incoming non-`failedKeys` context to the stored one, so a per-render-varying `message` makes every mixed-viewer sighting a forced update (`last_seen_at` churn) even when the union didn't grow. A constant message keeps `failedKeys` the single source of domain detail (the admin UI renders the domains from `failedKeys`), so both invariants hold. (The §12.4 catalog `helpfulContext`/`dougFacing` `<sheet-name>` interpolation is a SEPARATE surface — the human-facing alert template — unaffected by this `context.message` constant.)
- [ ] Run to pass: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/cross-cutting/codes.test.ts tests/components/crew/crewShellAlert.test.tsx`; `pnpm tsc --noEmit`. All four layers + the producer + both meta-tests green together.
- [ ] Commit `feat(crew-page): TILE_PROJECTION_FETCH_FAILED alert plumbing + minimal CrewShell producer (lockstep + meta-registration + producer, one commit)`.

---

### Task 9: `upsert_admin_alert` failedKeys-union-merge migration (tests 16/29 dedup half, meta-test #4 scaffold)

**Files:** `supabase/migrations/<ts>_upsert_admin_alert_failedkeys_merge.sql` (new), `supabase/__generated__/schema-manifest.json` (regenerated, unchanged for functions), `tests/admin/upsertAdminAlert.test.ts` (modify — add a static-SQL assertion for the NEW file)

> Backward-compatible `create or replace`. The §6 SQL is load-bearing and transcribed VERBATIM below. Do NOT edit the old `20260505000000_upsert_admin_alert.sql` — `tests/admin/upsertAdminAlert.test.ts:58-67` reads it and asserts the old `+ 1` / `context = excluded.context` form; that test must stay green. Reference `p_context` (the original producer arg), NEVER `excluded.context` (R40). Surgical validation apply discipline applies (§6) — Task 10 proves it live.

- [ ] Add a static-SQL assertion to `tests/admin/upsertAdminAlert.test.ts` for the NEW migration file (separate from the existing old-file test): assert the new file contains the union-merge `jsonb_agg(elem order by elem)`, the `lastCountedAt` debounce reference, the `p_context ? 'failedKeys'` guard, and references `p_context` not `excluded.context` in the `where not (...)` clause. Assert it preserves `revoke ... / grant execute ... to service_role`. _Failure mode: the migration drops backward-compat, references `excluded.context` (R40), or omits the union-merge._
- [ ] Run to fail: `pnpm vitest run tests/admin/upsertAdminAlert.test.ts`.
- [ ] Create `supabase/migrations/<ts>_upsert_admin_alert_failedkeys_merge.sql` transcribing §6 EXACTLY:
  ```sql
  create or replace function public.upsert_admin_alert(
    p_show_id uuid,
    p_code text,
    p_context jsonb
  )
  returns uuid
  language sql
  security definer
  set search_path = public, pg_temp
  as $$
    insert into public.admin_alerts (show_id, code, context)
    values (
      p_show_id,
      p_code,
      case when p_context ? 'failedKeys'
           then p_context || jsonb_build_object('lastCountedAt', now())
           else p_context end
    )
    on conflict (coalesce(show_id::text, ''), code) where resolved_at is null
    do update set
      last_seen_at = now(),
      occurrence_count = public.admin_alerts.occurrence_count + (
        case when (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
                  and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
             then 0 else 1 end
      ),
      context = case
        when p_context ? 'failedKeys' then
          (p_context - 'failedKeys')
          || jsonb_build_object('failedKeys',
               (select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
                from (select distinct jsonb_array_elements_text(
                        coalesce(public.admin_alerts.context->'failedKeys','[]'::jsonb)
                        || coalesce(p_context->'failedKeys','[]'::jsonb)) as elem) u))
          || jsonb_build_object('lastCountedAt',
               case when (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
                         and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
                    then public.admin_alerts.context->'lastCountedAt'
                    else to_jsonb(now()) end)
        else p_context
      end
    where not (
      (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
      and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
      and (select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
           from (select distinct jsonb_array_elements_text(
                   coalesce(public.admin_alerts.context->'failedKeys','[]'::jsonb)
                   || coalesce(p_context->'failedKeys','[]'::jsonb)) as elem) u)
          = public.admin_alerts.context->'failedKeys'
      and (p_context - 'failedKeys') = (public.admin_alerts.context - 'failedKeys' - 'lastCountedAt')
    )
    returning id;
  $$;

  revoke all on function public.upsert_admin_alert(uuid, text, jsonb) from public, anon, authenticated;
  grant execute on function public.upsert_admin_alert(uuid, text, jsonb) to service_role;
  ```
  > The `<mergeable>`/`<within>`/`<merged>` placeholders from §6 are inlined above (the SQL fragments they name). The clause references `p_context` (the original arg), NOT `excluded.context` (which carries the INSERT-appended `lastCountedAt` and would never compare equal — R40). The `WHERE not (...)` makes a mergeable + in-window + union-didn't-grow + other-fields-unchanged sighting a true NO-OP (no heap write / no `last_seen_at` churn — R39). No-`failedKeys` producers always pass the `WHERE` and `context = p_context` (backward-compat byte-for-byte).
- [ ] Apply LOCALLY (`psql "$TEST_DATABASE_URL" -f supabase/migrations/<ts>_upsert_admin_alert_failedkeys_merge.sql` or `supabase db query --linked` per the env), then `notify pgrst, 'reload schema'`. `create or replace` is apply-twice idempotent.
- [ ] `pnpm gen:schema-manifest` and stage the regenerated manifest (functions aren't in the column/table manifest so it should be unchanged — commit if it changes, confirm `validation-schema-parity` unaffected).
- [ ] **Surgically apply to the validation project** (`TEST_DATABASE_URL` / `--linked`) + `notify pgrst, 'reload schema'` — `validation-schema-parity` CANNOT catch function drift, so this is the only guard (§6; the dedup test in Task 10 is the proof). Do NOT skip.
- [ ] Run to pass: `pnpm vitest run tests/admin/upsertAdminAlert.test.ts`. Commit `feat(db): upsert_admin_alert failedKeys union-merge + 10-min debounce + WHERE-gated no-op`.

---

### Task 10: Validation-backed RPC dedup test (test 16/29 live half, meta-test #4)

**Files:** `tests/db/upsert-admin-alert-dedup.test.ts` (new)

> Runs against `TEST_DATABASE_URL` (validation project) in `x-audits.yml`. Connection pattern from `tests/notify/deliver-real-db.test.ts:1-12` (`postgres(DB_URL, { max: 1, prepare: false })`, `test.skipIf(!DB_URL)`). Calls the live RPC via `select public.upsert_admin_alert(...)`. Proves the §6 semantics live (the function-drift guard the manifest can't provide).

- [ ] Write `tests/db/upsert-admin-alert-dedup.test.ts`. Each test inserts a unique `shows` row (suffix per `deliver-real-db.test.ts`) and exercises the RPC, then reads `admin_alerts` back. Cleanup in `finally`. Assert ALL §6 properties:
  - **Union-merge / no-shrink (R41/R43):** upsert `failedKeys=['rooms','financials','transportation']` then `failedKeys=['rooms']` → stored `failedKeys` still contains all three (sorted distinct).
  - **Union grows:** `['rooms']` then `['rooms','hotel']` → stored `= ['hotel','rooms']` (sorted).
  - **Write-debounce no-op (R39):** capture `last_seen_at` after the first failedKeys insert; repeat the SAME `failedKeys` + same `message` in-window → `occurrence_count` unchanged AND `last_seen_at` does NOT advance (byte-identical row).
  - **Mixed-viewer consistency + no-churn (R3-HIGH-1 — the critical one):** upsert `failedKeys=['rooms','financials','transportation']` with the **viewer-independent constant `message`** (a lead render), capture `last_seen_at`; then upsert a SUBSET `failedKeys=['rooms','transportation']` with the **SAME constant `message`** (an ordinary-crew render, in-window) → stored `failedKeys` STILL the full union (`financials` preserved), stored `message` UNCHANGED (constant — consistent with the union, NOT the crew's smaller list), `occurrence_count` unchanged, AND `last_seen_at` does **NOT** advance. This proves the no-op holds **because** the message is viewer-independent: the merged union equals the stored union (subset adds no domain) and the non-key context (`message`/`sheet_name`/`tileId`) is identical, so the `WHERE`-gated no-op fires. _Catches: a per-render-varying `message` (the §4.13 illustrative "N sources: ..." form) storing prose inconsistent with the union'd `failedKeys` AND defeating the R39 no-op bound under the exact mixed-viewer scenario this whole design protects (R3-HIGH-1)._
  - **Union-grow / message-change in-window:** `context` + `last_seen_at` update, `occurrence_count` does NOT increment.
  - **Window expiry:** simulate by upserting a row whose `lastCountedAt` is >10min old (insert directly or back-date), then a counted upsert → `occurrence_count` increments.
  - **Concurrency:** two near-concurrent upserts for the same `(show_id, code)` → `occurrence_count` increments at most once, merged `failedKeys` is the union.
  - **Backward-compat:** an upsert with NO `failedKeys` key → increments on every call AND stored `context` is byte-for-byte `p_context` (no `lastCountedAt` injected).
  _Failure mode: the migration didn't reach validation (old non-deduped RPC live → silent context-shrink / per-nav occurrence inflation); a low-visibility render shrinking the row after a lead observed financials._
- [ ] Run: `TEST_DATABASE_URL=<validation> pnpm vitest run tests/db/upsert-admin-alert-dedup.test.ts` → must PASS against the validation project (proves the surgical apply landed). Commit `test(db): validation-backed upsert_admin_alert dedup/debounce contract`.

---

### Task 11: `_CrewShell.tsx` Server Component + server-side projection alert (tests 16/19-port/21/23/36)

**Files:** `app/show/[slug]/[shareToken]/_CrewShell.tsx` (**EXTEND the minimal producer created in Task 8** — do NOT re-create), `tests/components/crew/crewShell.test.tsx` (new)

> **Extends** the minimal `_CrewShell` from Task 8 (which already holds the server-side projection-alert upsert) into the full body. Renders inside `data-testid="crew-shell"`: `Header` → `CrewSubNav` → `ShowRealtimeBridge` → `CrewSectionTransition`(active section) → `Footer`. Today leads with `RightNowHero`. Ports verbatim: the malformed-projection fail-closed guard (`_ShowBody.tsx:113-121`), the Footer report-prop contract (`:509-539`), `ShowRealtimeBridge renderVersion={data.viewerVersionToken}` (`:469`), `nowDate()` server clock (`:133`), `sheetName=data.show.title`. Section components are Phase 3 — use a minimal placeholder `<section data-testid={\`section-${activeSection}\`}>` that renders the section id + (Today only) `RightNowHero` so the shell is testable now; Phase 3 fills the real sections. (The basic projection-alert assertions live in Task 8's `crewShellAlert.test.tsx`; this task adds the **mixed-viewer accumulation** case below.)

EXACT props (00-overview): `CrewShellProps = { data: ShowForViewer; viewer: Viewer; rawSection: string | undefined; slug: string; shareToken?: string; identityChip?: { name: string; role: string; shareToken: string } | null }`. **`identityChip` is ported from `ShowBody` (R4-MEDIUM-2)** — the crew route derives it from the resolved crew row (`page.tsx:171` `{ name: crew.name, role: crew.role, shareToken }`), admin + preview-as pass `null` (`page.tsx:134`); `CrewShell` threads it into `Header` exactly as `_ShowBody.tsx:455-462` does. Add a shell test: a `crew` viewer with `identityChip` set → the Header renders the chip; an `admin` viewer (`identityChip={null}`) and the malformed-projection `TerminalFailure` path render NO chip. **CrewShell resolves `activeSection` ITSELF** (R2-HIGH-1): `const activeSection = resolveActiveSection(rawSection, { budgetVisible: financialsVisible(ctx.viewerFlags, ctx.isAdmin) })` — after the fail-closed `resolveViewerContext` — so the Budget gate (tab + section + direct-URL) has a single authority and preview-as cannot enter `?s=budget` for a non-LEAD previewed crew.

- [ ] Write `tests/components/crew/crewShell.test.tsx`. Mock `@/lib/adminAlerts/upsertAdminAlert` and `@/lib/time/now` (`nowDate`). Render `CrewShell` (await the async Server Component). Assert:
  - **Test 21 (fail-closed):** `data.crewMembers` not an array, for a `crew` viewer AND an `admin_preview` viewer → renders `<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED">` and NO section content (no `data-testid="crew-sub-nav"`, no `section-*`). _Failure mode: malformed projection crashing the Next boundary or regressing to unrestricted per-crew rendering._
  - **Test 23 (renderVersion):** `ShowRealtimeBridge` receives `renderVersion === data.viewerVersionToken`. _Failure mode: stale renders not re-subscribing._
  - **Test 19-port (Footer report props):** `admin_preview` viewer → Footer gets `reportSurfaceOverride='admin'`, `reportSurfaceIdOverride=\`admin-preview-footer-${slug}-${crewMemberId}\``, `reportAutocapture.crewPreview` populated; `crew` viewer → `reportSurfaceOverride='crew'`, no override id, no `crewPreview`. (Test 19 is Phase-4 preview-as-route-level; this pins the prop port at the shell.) _Failure mode: preview-as bug reports mis-filed as generic crew reports._
  - **Test 8 (preview-as Budget gate — R2-HIGH-1):** render `CrewShell` with `viewer={{ kind:"admin_preview", crewMemberId }}` and `rawSection="budget"` for a **non-LEAD** previewed crew (`data.crewMembers[crewMemberId].roleFlags` lacks `LEAD`, and `admin_preview` resolves `isAdmin=false`) → `data-active-section="today"` (Budget NOT entered, no Budget tab, no financials); a **LEAD** previewed crew (or a real admin viewer) with `rawSection="budget"` → `data-active-section="budget"`. _Failure mode: an admin previewing a non-lead reaching Budget via `?s=budget` (lead-only financials leak / dead section) — the divergence R2-HIGH-1 closed._
  - **Test 16 (projection alert — section-independent):** render as a normal `crew` viewer with `rawSection='crew'` with `data.tileErrors = { hotel, rooms, contacts }` populated → EXACTLY ONE `upsertAdminAlert` call with `code: "TILE_PROJECTION_FETCH_FAILED"`, `context.failedKeys` = sorted `['contacts','hotel','rooms']` (assert the payload object, not N calls), `context.sheet_name === data.show.title`, `context.tileId === 'crew:projection-alert'`, and `context` has NO `signature` and NO `viewerVersionToken` key. A HEALTHY projection (`tileErrors={}`) → NO `upsertAdminAlert` call. Derive `failedKeys` from the fixture's `tileErrors` keys (not hardcoded). _Failure mode: the section model dropping the always-on alert; coalescing collapsing multi-domain failures; a viewer-identity field splitting the row; a second producer without the required context keys._
  - **Test 16 (fail-quiet):** `upsertAdminAlert` mock rejects → the page still renders the shell (no raw error UI, no thrown error). _Failure mode: an observability write outage becoming a crew-page render failure._
  - **Test 36(a) (fires on render):** a real dynamic render with `tileErrors` populated → one upsert. (Prefetch-does-not-fire — 36(b) — is structural/Playwright in Phase 4; this pins the render-time write.)
  - **Test 16 (mixed-viewer union accumulation through the REAL projection boundary — R1-MEDIUM-4).** The single-render test above fabricates `tileErrors` directly; this case proves the **viewer-dependent fetch boundary** the spec's §9 test 16 requires (do NOT filter `failedKeys` by visibility; transportation is fetched unconditionally; financials only on lead/admin). Drive it through the REAL projection, not a fabricated `tileErrors`: **(i)** assert the observed-key boundary — using the real `getShowForViewer` (or a faithful mock that replicates `getShowForViewer.ts:350/378/412/455` unconditional fetches + the `:479-507` `if(isLead)` financials skip), a **lead/admin** render against an all-domains-broken projection observes `{contacts, hotel, rooms, transportation, financials}` while an **ordinary-crew** render observes `{contacts, hotel, rooms, transportation}` (financials absent — the projection never fetched it for a non-lead), so each render's `failedKeys` is its own `tileErrors` keys, with `transportation` present on BOTH; **(ii)** accumulation — render as a lead (upsert with `financials` in `failedKeys`) THEN as ordinary crew (upsert without `financials`) on the same `(show_id, code)` → the stored row's `failedKeys` STILL contains `financials` (the §6 RPC union-merges; a lower-visibility render never shrinks the row, R41/R43). This step depends on the §6 migration (Task 9) + the live RPC (Task 10) — so run it after those; the union-preservation half asserts against the real RPC via `tests/db/upsert-admin-alert-dedup.test.ts`'s harness (or inline against `TEST_DATABASE_URL`). Do NOT fabricate a non-lead `tileErrors.financials` (impossible against the real lead-gated projection) and do NOT drop `transportation` from the non-lead observed set. Assert NO raw per-domain pg/fetch error string reaches `context` (only `sheet_name`/`tileId`/`message`/`failedKeys`). _Catches: an implementation filtering keys by visibility; dropping transportation from a non-lead render; a low-visibility crew render shrinking the row after a lead observed financials; raw error text leaking into `admin_alerts.context`; a fabricated non-lead financials fixture the real projection cannot produce._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/crewShell.test.tsx`.
- [ ] Implement `app/show/[slug]/[shareToken]/_CrewShell.tsx` (Server Component, `async`):
  - Port the fail-closed guard verbatim: `try { ctx = resolveViewerContext(viewer, data) } catch (err) { if (err instanceof MalformedProjectionError) return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />; throw err }`.
  - Compute `today = await nowDate()` for server-rendered date logic (Schedule pin lands in Phase 3; the value threads through).
  - **Projection alert (§4.13, server-side, fail-quiet):** already implemented in the Task-8 minimal shell — this task keeps it verbatim: `failedKeys = Object.keys(data.tileErrors).sort()`; iff non-empty, `upsertAdminAlert({ showId, code: "TILE_PROJECTION_FETCH_FAILED", context: { sheet_name: data.show.title, tileId: "crew:projection-alert", message: PROJECTION_ALERT_MESSAGE, failedKeys } })` inside a `try/catch` (fail-quiet). **`message` is the VIEWER-INDEPENDENT constant (R3-HIGH-1)** — never the per-render key list. The `upsertAdminAlert` `{ data, error }` destructure is inside the helper; the shell's contract is the try/catch.
  - Compute once (single authority): `const budgetVisible = financialsVisible(ctx.viewerFlags, ctx.isAdmin); const activeSection = resolveActiveSection(rawSection, { budgetVisible });`.
  - Render `data-testid="crew-shell"` wrapper: `Header` (with status pill + identity chip — the chip prop comes from the caller as today via `identityChip`; preserve) → `CrewSubNav activeSection={activeSection} budgetVisible={budgetVisible}` → `ShowRealtimeBridge showId slug renderVersion={data.viewerVersionToken}` → `CrewSectionTransition sectionId={activeSection}`(placeholder active section; Today leads with `RightNowHero context={buildRightNowContext({ show, dateRestriction: ctx.dateRestriction, hotelReservations: data.hotelReservations, rooms: data.rooms })}`) → `Footer` with the verbatim per-viewer-kind report props (`reportSurfaceOverride`, conditional `reportSurfaceIdOverride`, `reportAutocapture.crewPreview` only for `admin_preview`, `lastSyncedAt`/`lastSyncStatus`). The **same `budgetVisible`** drives both the nav tab and the section resolution — never recomputed divergently.
  - Body `TerminalFailure` carries NO `retryHref` (the body lacks `shareToken` in exactly the malformed case; §4.14).
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): CrewShell server component + section-independent projection-alert upsert`.

---

### Task 12: `page.tsx` searchParams widening + `s`+`gate` redirect preservation (tests 13/28 routing)

**Files:** `app/show/[slug]/[shareToken]/page.tsx` (modify), `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (modify), `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx` (modify), **`lib/auth/validateNextParam.ts` (modify — R4-HIGH-1), `lib/auth/picker/clearIdentity.ts` (modify — `:47`), `lib/auth/picker/selectIdentity.ts` (modify — `:53`)**, `tests/components/crew/showPageRouting.test.tsx` (new), `tests/auth/validate-next-param-show-section.test.ts` (new)

> Widen `searchParams` to `{ gate?; s? }`; pass the **RAW `s`** to `CrewShell` as `rawSection` (R2-HIGH-1 — `CrewShell` resolves `activeSection` + the Budget gate itself). `page.tsx` allow-lists `s` against the section-id set **only for redirect-preservation** (a valid `?s=budget` IS carried; `CrewShell` does the entitlement fallback). Preserve the allow-listed `s` (+ existing `gate`) through ALL paths back to `/show/[slug]/[shareToken]`.
>
> **⚠️ R4-HIGH-1 — the auth boundary needs MORE than redirect-builder edits (verified live).** Three live mechanisms drop `s`, so the spec §4.1 "just add a query param to the builders" is necessary-but-insufficient: **(a)** `validateNextParamDetailed` (`lib/auth/validateNextParam.ts:51`) returns `parsed.pathname` — **it strips the query**, so a sign-in `?next=/show/<slug>/<token>?s=venue` is normalized to `/show/<slug>/<token>` and the section is lost; **(b)** `clearIdentity.ts:47` hard-codes `redirect(\`/show/${slug}/${shareToken}?gate=skip\`)` (no `s`); **(c)** `selectIdentity.ts:53` (claimed-row recovery) redirects to `/auth/sign-in?next=<show url WITHOUT s>` (and even with `s`, (a) would strip it). The `revalidatePath` paths (`clearIdentity.ts:67/90`, `selectIdentity.ts:128`) are in-place (no redirect) — they keep the user's current `?s=` automatically, no change needed. So this task makes ONE surgical, security-preserving change to the next-param validator (allow ONLY `s`∈section-ids + `gate`∈allowed on tokenized show URLs, strip everything else — the OAuth-redirect safety posture is unchanged) plus threads `s` through the two hard-coded redirects. This is still NOT an auth-flow rewrite (the access guards / OAuth origin checks are untouched), but it is more than a builder edit — the builder-only fix the spec implies would silently fail at the validator (the exact path test 28 / wp-24 / wp-26 require).

- [ ] Write `tests/components/crew/showPageRouting.test.tsx`. Since `page.tsx` is a server module with auth, assert via a shared URL-builder helper (extract a small `buildShowReturnUrl(slug, shareToken, { s?, gate? })` that validates `s` against `BASE_SECTION_IDS`+`budget` and appends `gate`) and unit-test it directly:
  - `?s=venue&gate=skip` → builder produces a path carrying BOTH (deep-link survives the round-trip — test 28).
  - invalid `s=bogus` → builder drops `s` (no `?s=bogus` leaks; only allow-listed values carried).
  - `gate` alone / `s` alone → each carried independently (neither clobbers the other — §4.1a dual-param).
  _Failure mode: the picker/auth redirects dropping `s` for shared-link users (the primary deep-link entry path); `s`/`gate` clobber._
- [ ] Write `tests/auth/validate-next-param-show-section.test.ts` (R4-HIGH-1 — the auth-boundary unit test the builder test can't catch). Assert `validateNextParamDetailed`:
  - `/show/<slug>/<token>?s=venue&gate=skip` → `{ ok: true, path: "/show/<slug>/<token>?s=venue&gate=skip" }` (allow-listed query **preserved** — the regression this fixes).
  - `/show/<slug>/<token>?s=bogus&evil=1&token=secret` → `path` carries NO `s` (bogus, dropped), NO `evil`/`token` (not allow-listed) — only the safe subset survives.
  - a NON-show path with a query (`/admin?foo=1`) → query stripped exactly as today (`/admin`) — **no regression** to the OAuth-safety posture for non-show URLs.
  - an off-origin / disallowed-prefix `next` → still `{ ok: false, path: DEFAULT_AUTH_NEXT_PATH }` (the existing rejection unchanged).
  _Failure mode: the validator stripping `s` (the live `:51` behavior) so the sign-in/claimed-row recovery loses the deep-link; OR the fix over-broadly carrying arbitrary query params (a redirect-injection regression)._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/showPageRouting.test.tsx tests/auth/validate-next-param-show-section.test.ts`.
- [ ] Implement:
  - Add `lib/crew/buildShowReturnUrl.ts` (or co-locate) validating `s` against `[...BASE_SECTION_IDS, "budget"]` and appending `gate` when present; used by every builder below.
  - **R4-HIGH-1 — `validateNextParamDetailed` preserves allow-listed show-section query (the core fix).** In `lib/auth/validateNextParam.ts` (`:51` currently `const path = parsed.pathname` — strips the query): when `parsed.pathname` matches the tokenized crew route `^/show/<slug>/<token>$` (use the existing `SLUG_RE`/`TOKEN_RE` if exported, else a local regex), **re-attach ONLY the allow-listed query params** — `s` iff `∈ [...BASE_SECTION_IDS, "budget"]` and `gate` iff `∈` the existing allowed `gate` values — and **drop every other query param** (the OAuth-redirect safety posture is unchanged: non-show paths still return bare `parsed.pathname`; unknown params are never carried). Return `{ ok: true, path: pathWithAllowlistedQuery }`. This is the one surgical security-preserving change that lets `?s=venue` survive the sign-in `next` round-trip (the builder edits below are useless without it — the validator would strip them).
  - **R4-HIGH-1 — `clearIdentity.ts:47`** hard-codes `redirect(\`/show/${input.slug}/${input.shareToken}?gate=skip\`)` → thread the validated `s`: `redirect(buildShowReturnUrl(input.slug, input.shareToken, { s, gate: "skip" }))` (carry `s` when present; `s` must be available to `clearIdentityAndSkip` — pass it from the caller form as a hidden field, validated). The `revalidatePath` paths (`:67`/`:90`) are in-place — no change (the user's current `?s=` is preserved by staying on the URL).
  - **R4-HIGH-1 — `selectIdentity.ts:53`** (claimed-row recovery) redirects to `/auth/sign-in?next=${encodeURIComponent(\`/show/${slug}/${shareToken}\`)}` → include `s` in the encoded show URL via `buildShowReturnUrl(slug, shareToken, { s })`; now-preserved by the validator fix. `:128` `revalidatePath` is in-place — no change.
  - `page.tsx:71` → `searchParams: Promise<{ gate?: string; s?: string }>`; `:74` await `s`. Do NOT pre-resolve `activeSection` here (CrewShell does it). Compute `const allowlistedS = [...BASE_SECTION_IDS, "budget"].includes(s ?? "") ? s : undefined` for the redirect builders only.
  - `admin` arm (`:128`) + `resolved` arm (`:165`): swap `<ShowBody .../>` → `<CrewShell data viewer rawSection={s} slug shareToken={shareToken} identityChip={...} />`, passing `identityChip` **verbatim as today** (R4-MEDIUM-2): admin arm `identityChip={null}` (`page.tsx:134`); resolved/crew arm `identityChip={crew ? { name: crew.name, role: crew.role, shareToken } : null}` (`page.tsx:171`). `CrewShell` threads it into `Header` (Task 11). (admin arm passes `shareToken` too; preview-as omits both in Task 13 — `identityChip` defaults to `null`/undefined there, matching the admin view.)
  - `needs_picker_bootstrap` (`:107-112`): rebuild `nextUrl` via `buildShowReturnUrl(slug, shareToken, { s, gate })` so the post-bootstrap landing keeps the section.
  - sign-in `returnTo`: `_SignInOrSkipGate.tsx` `encodedNext` (`:53-54`) and the `gate=skip` CTA href (`:115`) → carry `s` + `gate` via `buildShowReturnUrl`. Pass `s` down as a prop to `SignInOrSkipGate` (new prop) from `page.tsx`.
  - `gate=skip` page-level honor (`:182`): unchanged guard; the `?gate=skip` CTA already lives in `_SignInOrSkipGate`; ensure the CTA carries `s`.
  - picker selection: `_PickerInterstitial.tsx` `selectIdentityFormAction` re-renders via `revalidatePath` (no redirect) — the post-selection render re-reads the SAME URL which already carries `?s=`; so the section is preserved automatically for the in-place picker. Add a hidden `s` input to the picker forms + the sign-in recovery form (`:77`, `:150`, `:188`) so any GET-form recovery route (claimed rows → `/auth/sign-in?next=`) carries `s` too. Pass `activeSection`/`s` as a prop to `PickerInterstitial` and `selectIdentityFormAction`'s `next`.
  - stale-cleanup (`_StaleCleanupAutoSubmit`): auto-submits + revalidates the current URL (no redirect) → `?s=` preserved in place; no change needed beyond confirming the test covers the in-place case.
- [ ] Run to pass (incl. the validateNextParam test); `pnpm tsc --noEmit`. The full end-to-end auth-boundary proof (deep-link `?s=venue` surviving the real picker / sign-in / claimed-row recovery in a browser) lands as the Phase-4 real-browser test 13/28 (`04` Task 3) — this task pins the unit + integration mechanism (validator + builders + redirect threading). Commit `feat(crew-page): widen searchParams to {gate,s}; preserve s+gate through validateNextParam + picker/sign-in/gate=skip/claimed-row redirects (R4-HIGH-1)`.

---

### Task 13: Preview-as route swap (test 15 prep — `ShowBody`→`CrewShell`)

**Files:** `app/admin/show/[slug]/preview/[crewId]/page.tsx` (modify), `tests/components/crew/previewAsRoute.test.tsx` (new)

> The second `ShowBody` consumer (`:233`). Swap to `CrewShell`, read its own `?s=` (default `today`). `PageProps` (`:51-53`) currently has NO `searchParams` — widen it. Preview-as omits `shareToken` (00-overview). Full preview-as parity (renders `CrewShell`, `?s=venue` resolves) is the Phase-4 Playwright test 15; this task lands the swap + a unit assertion.

- [ ] Write `tests/components/crew/previewAsRoute.test.tsx`: mock `requireAdmin`, `getShowForViewer`, the show/crew lookups, and `nowDate`; render the page with `searchParams` resolving `{ s: "venue" }` → assert `CrewShell` is rendered (`data-testid="crew-shell"` with `data-active-section="venue"`), `viewer.kind === "admin_preview"`, and `shareToken` undefined; default (no `s`) → `data-active-section="today"`. **Budget gate (R2-HIGH-1):** with `{ s: "budget" }` and the previewed crew a **non-LEAD** → `data-active-section="today"` (Budget not entered); with the previewed crew a **LEAD** → `data-active-section="budget"`. _Failure mode: preview-as left on the old flat-grid `ShowBody`; preview not reading its own `?s=`; an admin previewing a non-lead reaching Budget via `?s=budget`._
- [ ] Run to fail: `pnpm vitest run tests/components/crew/previewAsRoute.test.tsx`.
- [ ] Implement: widen `PageProps` (`:51-53`) to `{ params: Promise<{ slug; crewId }>; searchParams: Promise<{ s?: string }> }`; await `s`. Do NOT resolve `activeSection` or `budgetVisible` here — pass the **RAW `s`** to `CrewShell`, which is the single authority (R2-HIGH-1 — the previous `budgetVisible: true` shortcut let a non-LEAD-previewing admin reach `?s=budget`; removed). Swap `<ShowBody slug showId viewer data />` (`:233-238`) → `<CrewShell data viewer={{ kind: "admin_preview", crewMemberId: crewId }} rawSection={s} slug={slug} />` (no `shareToken`). Keep `<PreviewBanner />` above. (CrewShell resolves `budgetVisible = financialsVisible(ctx.viewerFlags, ctx.isAdmin)` where `admin_preview` yields `isAdmin=false`, so Budget is gated on the **previewed crew's** `LEAD` flag — exactly what the admin should see when previewing-as.)
- [ ] Run to pass; `pnpm tsc --noEmit`. Commit `feat(crew-page): preview-as route renders CrewShell + reads its own ?s=`.

---

## Phase exit criteria

All of the following GREEN before Phase 3, and (per §4.13/§10 sequencing) BEFORE Phase 4 deletes the `_ShowBody.tsx` `notes-tile` alert path:

1. `pnpm vitest run tests/crew/ tests/components/crew/ tests/messages/_metaAdminAlertCatalog.test.ts tests/admin/upsertAdminAlert.test.ts tests/components/tiles/_metaSentinelHidingContract.test.ts tests/cross-cutting/codes.test.ts` all pass.
2. `pnpm vitest run tests/db/upsert-admin-alert-dedup.test.ts` passes **against the validation project** (`TEST_DATABASE_URL` set) — proves the `failedKeys`-union-merge RPC is live in validation (the surgical apply landed; the function-drift guard the manifest can't provide).
3. `pnpm tsc --noEmit` clean.
4. **The four lockstep layers moved together** in one commit (Task 8): §12.4 prose + regen `spec-codes.ts` + `catalog.ts` row + `AdminAlertCode` union — `x1-catalog-parity` (3 of 4) + the extended `_metaAdminAlertCatalog` registry⊆union assertion (the 4th) both green.
5. **The server-side projection-alert upsert is live and section-independent** (Task 11, test 16): `failedKeys` = sorted keys of the render's `tileErrors`, no `signature`/`viewerVersionToken`, fail-quiet, one call per render. This MUST be green now — Phase 4 will delete the `_ShowBody.tsx:403-431` `notes-tile` alert path only after this section-independent observability is proven live.
6. `_metaSentinelHidingContract` now walks `components/crew/` (Task 4) — the sentinel-hiding contract enforces on every new section/primitive.
7. Both routes (crew `page.tsx` + preview-as) render `CrewShell`; `?s=`/`gate` preserved through every redirect builder; `loading.tsx` exists with no Budget tab.
8. **Do-not-relitigate (wp-27 / §4.13):** the alert write stays server-side (render-bound) in `CrewShell`. No client island, no server action, no signing/HMAC ticket, no signing secret, no "alert-bridge gate." A finding asking to move it client-side or commit-bind it is out of contract (re-introduces the reverted R30–R38 cascade).
9. The OLD migration file `20260505000000_upsert_admin_alert.sql` is UNCHANGED (its pinning test `tests/admin/upsertAdminAlert.test.ts:58-67` stays green); the new behavior is in the separate `*_upsert_admin_alert_failedkeys_merge.sql` file.
