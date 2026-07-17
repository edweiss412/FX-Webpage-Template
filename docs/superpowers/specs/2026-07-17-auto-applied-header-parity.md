# Spec — "Recently auto-applied" header parity + strip gap fix

**Date:** 2026-07-17
**Slug:** `auto-applied-header-parity`
**Owner:** Opus / Claude Code (UI surface — invariant-8 impeccable gate applies)
**Status:** Draft → self-review → Codex adversarial review

---

## 1. Problem

On the admin dashboard (`/admin`, desktop ≥1240px), the right-hand "Needs attention" sidebar column stacks three things vertically with `gap-3`: the **Needs attention** header row, the `NeedsAttentionInbox`, and the `RecentAutoAppliedStrip` ("Recently auto-applied"). Two defects, reported from a live screenshot on the validation deploy:

1. **Detached gap.** When the inbox is populated, a large empty band appears above the "Recently auto-applied" heading — the strip floats far below the inbox content instead of sitting directly beneath it.
2. **Header asymmetry.** The "Needs attention" header carries a **count chip** and a **`?` HoverHelp** affordance (Dashboard.tsx:741-760); the "Recently auto-applied" header (RecentAutoAppliedStrip.tsx:557) is a bare `<SectionHeading>` — no count, no help.

## 2. Root causes (cited)

1. **Gap.** `NeedsAttentionInbox`'s populated-branch root is `flex h-full flex-col gap-2` (`components/admin/NeedsAttentionInbox.tsx:182`). The sidebar column is stretched to match the tall Shows column (`min-[1240px]:items-stretch`, `components/admin/Dashboard.tsx:623`); the inner desktop container is `h-full` (`Dashboard.tsx:739`). `h-full` on the inbox balloons it to fill that stretched height, top-aligns its short content, and leaves dead space at the inbox's bottom — which lands between the inbox and the strip. The empty-state branch (`NeedsAttentionInbox.tsx:170`, testid `admin-needs-attention-empty`) has **no** `h-full`, so the defect only manifests when the inbox has items.

2. **Header asymmetry.** The strip's section heading is rendered bare in both the `ok` and `infra_error` returns (`RecentAutoAppliedStrip.tsx:534-536` and `:557-559`) with no sibling chip or help affordance.

## 3. Goals / non-goals

**Goals**

- G1. Remove the detached gap: the strip renders directly beneath the inbox content, regardless of column stretch. Leftover column height falls to the bottom of the column.
- G2. Give the "Recently auto-applied" header a count chip = total un-dispositioned auto-applied backlog (`renderedCount + overflowCount`) and a `?` HoverHelp linking to existing help anchor `/help/admin/review-queues#re-stage`.
- G3. Full walker coverage for the new help affordance: a new concrete row in the affordance matrix, and a seeded un-dispositioned `auto_apply` `show_change_log` row so the deep-link walker finds the strip (and its tooltip) on `/admin`.

**Non-goals**

- No change to strip behavior (accept/undo/collapse), per-group count badges, `KindDotCluster`, or the loader query.
- No new help doc page or anchor — `#re-stage` ("Live-show changes", `app/help/admin/review-queues/page.mdx:50`) already documents auto-applied crew/field/schedule changes exactly.
- No change to the mobile `NeedsAttentionSummaryCard` (its `autoAppliedCount` chip already exists).
- No advisory-lock topology change (see §7).

## 4. Design

### 4.1 Gap fix (G1)

Drop `h-full` from the populated inbox root only:

```
- <div data-testid="needs-attention-inbox" className="flex h-full flex-col gap-2">
+ <div data-testid="needs-attention-inbox" className="flex flex-col gap-2">
```

`components/admin/NeedsAttentionInbox.tsx:182`. Nothing else changes. The empty-state branch is untouched (already `h-full`-free). The desktop container (`Dashboard.tsx:739`) keeps `h-full min-h-0`; with the inbox now sized to content, header + inbox + strip pile at the column top with `gap-3` and the stretched column's extra height falls below the strip.

**Why not `flex-1`:** making the inbox `flex-1 min-h-0` would still fill remaining space and re-push the strip to the bottom — the opposite of the goal. Content-sizing (`h-full` removed, no grow) is correct.

### 4.2 Header parity (G2) — dashboard-only

**Scope decision (Codex R1 finding 2).** `RecentAutoAppliedStrip` is SHARED: the dashboard renders it at `headingLevel={4}` (`Dashboard.tsx:777-780`), and the mobile `/admin/needs-attention` page renders it at `headingLevel={2}` (`app/admin/needs-attention/page.tsx:105-108`). The count chip + `?` help are a **dashboard-header-parity** request; putting a `dashboard`-named help testid on the needs-attention page would (a) mis-name the affordance for its route, (b) duplicate that page's own `help-affordance--needs-attention-page--tooltip` header help, and (c) leave a second surface the desktop-only walker never covers. **Therefore the chip + help render ONLY when `headingLevel === 4` (dashboard).** The `/admin/needs-attention` header stays byte-for-byte as today (bare heading).

Extract a single `StripHeader` sub-component rendered by BOTH the `ok` and `infra_error` returns (one `<HoverHelp>` call site total — the affordance parity meta-test scans call sites, so a single definition keeps it clean). The `<HoverHelp>` literal stays unconditionally present in source (satisfying the parity scanner); its *rendering* is gated at runtime by `showAffordances`:

```tsx
function StripHeader({
  SectionHeading,
  headingId,
  count,          // null when there is no data to count (infra_error, or non-dashboard)
  showAffordances, // true only on the dashboard (headingLevel === 4)
}: {
  SectionHeading: "h2" | "h4";
  headingId: string;
  count: number | null;
  showAffordances: boolean;
}) {
  const heading = (
    <SectionHeading id={headingId} className="text-base font-semibold text-text-strong">
      Recently auto-applied
    </SectionHeading>
  );
  // Non-dashboard (headingLevel 2, /admin/needs-attention): return the ORIGINAL
  // bare heading — no wrapper div, byte-for-byte identical DOM to today. The
  // flex-row chrome exists ONLY on the dashboard (Codex R4 finding 2).
  if (!showAffordances) return heading;
  return (
    <div className="flex items-center gap-2">
      {heading}
      {count !== null ? (
        <span
          data-testid="recent-auto-applied-count-chip"
          className="inline-flex items-center rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-subtle"
        >
          {count}
        </span>
      ) : null}
      <HoverHelp
        label="Help: Recently auto-applied"
        testId="recent-auto-applied-help"
        rootTestId="help-affordance--dashboard-recently-auto-applied--tooltip"
        learnMore={{ href: "/help/admin/review-queues#re-stage" }}
      >
        <p>
          Changes that already went live on their own — crew added, removed, or renamed, plus
          schedule and field edits. Accept to clear them from this list, or undo the ones you
          didn&apos;t want.
        </p>
      </HoverHelp>
    </div>
  );
}
```

Both call sites pass `showAffordances={headingLevel === 4}`. On the dashboard: `count = data.kind === "ok" ? data.renderedCount + data.overflowCount : null` (chip hidden only in the `infra_error` no-data case). On `/admin/needs-attention` (`headingLevel === 2`): `showAffordances={false}` → `StripHeader` returns the **bare `<SectionHeading>`**, no wrapper div, DOM byte-for-byte identical to today (the `<HoverHelp>` literal stays in source unconditionally, satisfying the parity scanner, but is never reached at runtime on this route).

- Count chip classes are copied verbatim from the "Needs attention" chip (`Dashboard.tsx:743-748`) so the two headers read as one system.
- The heading keeps `id={headingId}` so the section's `aria-labelledby` (RecentAutoAppliedStrip.tsx:553/531) still resolves; the chip + help sit as siblings inside the flex row.
- Dashboard `ok` branch count = the TRUE backlog total, identical to the value Dashboard computes for the mobile summary chip (`Dashboard.tsx:485-487`). Dashboard `infra_error` → `count={null}` (help still shown). Non-dashboard → chip + help both suppressed.

### 4.3 Affordance matrix row (G3)

Add one `concrete` row to `AFFORDANCE_MATRIX` (`app/help/_affordanceMatrix.ts`):

```ts
{
  kind: "concrete",
  sourceSurface: "Dashboard - Recently auto-applied strip header (desktop inbox)",
  sourceRoute: "/admin",
  affordance: "? tooltip",
  testid: "help-affordance--dashboard-recently-auto-applied--tooltip",
  target: "/help/admin/review-queues#re-stage",
  visibleAt: "desktop",
  owningMilestone: "Auto-applied header parity (2026-07-17)",
},
```

- `visibleAt: "desktop"` — the strip lives in `dashboard-inbox-desktop` (`hidden min-[720px]:flex`, Dashboard.tsx:738-739), so it is desktop-only, exactly like `help-affordance--dashboard-needs-attention--tooltip`.
- Testid matches `CONCRETE_TESTID_RE = /^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more|legend)$/` (`tests/help/_affordance-matrix-shape.test.ts:9`).
- Not a substring of, nor a superset of, any existing concrete id (parity precondition, `tests/help/_metaAffordanceMatrixParity.test.ts:47-55`).

**Shape-test count updates (both in `tests/help/_affordance-matrix-shape.test.ts`):** the exact sorted testid array (:42-72) gains the new id; `toHaveLength(18)` (:102) → `19`, with the comment extended.

### 4.4 Walker seed (G3)

Add an idempotent, non-locked `show_change_log` insert to `supabase/seedWalkerFixtures.ts`, mirroring the existing `alertSeedSql()` precedent (`seedWalkerFixtures.ts:234-258` — a non-locked-table insert on the base-seed RPAS show, guarded + delete-then-insert idempotent):

```ts
// One un-dispositioned auto-applied change on the base-seed RPAS show so the
// dashboard's "Recently auto-applied" strip (and its ? help affordance) renders
// for the deep-link walker. show_change_log is NOT in the per-show advisory-lock
// table set (plan-wide invariant 2: shows/crew_members/crew_member_auth/
// pending_syncs/pending_ingestions) — no lock needed. Idempotent via the stable
// created_by sentinel.
//
// NON-UNDOABLE by design (Codex R1 finding 1): change_kind='field_changed' is
// outside UNDOABLE_KINDS (loader:70 = {crew_added,crew_removed,crew_renamed}),
// so the strip renders an Accept-only row and NO Undo control — the walker only
// needs the strip + help visible, and a `crew_added` fixture would have surfaced
// an Undo button whose RPC (undo_change tombstones `crew_members where name =
// entity_ref`) deterministically fails with a null entity_ref / no matching crew
// row. field_changed's diff is `{kind:"none"}` (buildDiff loader:82-101) so it
// renders its summary sentence — no after_image / entity_ref / crew row needed.
function autoAppliedSeedSql(): string {
  return `
    do $$
    begin
      if not exists (select 1 from public.shows where slug = ${sqlString(RPAS_SLUG)}) then
        raise exception 'base-seed show ${RPAS_SLUG} missing — run pnpm db:seed before seedWalkerFixtures';
      end if;
    end $$;

    delete from public.show_change_log where created_by = ${sqlString(AUTO_APPLIED_SENTINEL)};

    insert into public.show_change_log
      (show_id, drive_file_id, occurred_at, source, change_kind, summary,
       status, individually_undoable, created_by)
    select id, drive_file_id, ${sqlTimestamp(SEED_TIMESTAMP)}, 'auto_apply', 'field_changed',
      'Updated the main-stage call time', 'applied', false, ${sqlString(AUTO_APPLIED_SENTINEL)}
      from public.shows where slug = ${sqlString(RPAS_SLUG)};
  `;
}
```

- `AUTO_APPLIED_SENTINEL = "seed-fixture:walker-auto-applied"` — a stable `created_by` sentinel in the `seed-fixture:` namespace.
- `change_kind = 'field_changed'` ∈ `STRIP_KINDS` (`lib/admin/loadRecentAutoApplied.ts:63-69`) but NOT in `UNDOABLE_KINDS` (loader:70) → Accept-only row, no Undo. `individually_undoable=false` is belt-and-suspenders.
- `acknowledged_at` is omitted → defaults `null` (`supabase/migrations/20260706130000_show_change_log_acknowledged.sql:2`), satisfying the loader's `.is("acknowledged_at", null)` filter (loader:152).
- Composed into the seeder's SQL alongside `alertSeedSql()` — a sibling top-level statement, NOT inside the advisory-lock transaction block (invariant 2 does not cover `show_change_log`).

**Capture isolation (screenshots).** `seedWalkerFixtures.ts` runs only in the walker e2e setup, never in screenshot capture (base-seed-only). To guarantee a base-seed-only run leaves no strip row behind, add to the base seed's cleanup block (`supabase/seed.ts`, near the existing seed-prefix deletes ~:559-565):

```sql
delete from public.show_change_log where created_by like 'seed-fixture:%';
```

`show_change_log` is unlocked, so this is a plain delete needing no advisory lock (the surrounding deletes that DO touch locked tables already hold their locks; this one does not need one). It runs before base shows are re-seeded and removes any sentinel row from a prior walker run.

## 5. Guard conditions

| Input / state | Behavior |
| --- | --- |
| `data.kind === "ok"`, `groups.length === 0` | Strip returns `null` (unchanged, RecentAutoAppliedStrip.tsx:549). Header never renders — no count chip, no orphan help. |
| `data.kind === "ok"`, `renderedCount + overflowCount === 0` but a group exists | Not reachable — a rendered group implies ≥1 row → count ≥ 1. If it somehow occurs, chip shows `0` (harmless). |
| `data.kind === "infra_error"` (dashboard) | Header renders `count={null}` → no chip, HoverHelp present. Error sentence unchanged. |
| `overflowCount > 0` | Chip counts the full backlog (`rendered + overflow`), matching the existing overflow note below the list (RecentAutoAppliedStrip.tsx:571-578). |
| `headingLevel === 2` (mobile needs-attention page) | `SectionHeading = "h2"`, `showAffordances = false` → `StripHeader` early-returns the **bare `<SectionHeading>`** (no `flex` wrapper div, no chip, no help) — DOM byte-for-byte identical to today (Codex R4 finding 2). The page's own `help-affordance--needs-attention-page--tooltip` header help is unchanged. |
| Seeded walker row's Undo | None rendered — `field_changed` ∉ `UNDOABLE_KINDS`, so no Undo control exists to fail (Codex R1 finding 1). Accept renders and is a no-op-safe fixture affordance the walker never actuates. |
| Walker seed run twice | `delete ... where created_by = sentinel` then insert → exactly one row (idempotent). |
| Base-seed-only run (screenshots) | Base cleanup removes sentinel rows; `seedWalkerFixtures` not run → strip absent → no baseline drift. |

## 6. Dimensional invariants

The header flex row (`flex items-center gap-2`) has no fixed-dimension parent with stretch-dependent children — chip and help are `inline-flex`/intrinsic, heading is text. **No `getBoundingClientRect` layout task required** (no fixed-height parent → flex-child height contract). The gap fix removes a height constraint rather than adding one; its correctness is verified by a real-browser assertion that the strip's top is adjacent to the inbox bottom (see §8), not by a parent↔child height equality.

## 7. Advisory-lock holder topology

The plan touches `pg_advisory*` **only** by NOT adding to it: the new `show_change_log` seed insert is on an unlocked table (invariant 2's set is `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`). `WALKER_DRIVE_FILE_IDS` and its sorted-order lock sweep (`seedWalkerFixtures.ts:33-53`, pinned by `tests/db/seed-restage-fixture.test.ts`) are **unchanged** — no new drive_file_id, no lock reorder. The base-seed cleanup delete on `show_change_log` also needs no lock. `tests/auth/advisoryLockRpcDeadlock.test.ts` is not extended (no new lock surface).

**No new `pending_syncs`/locked-table write anywhere, including tests (Codex R4/R6).** The gap adjacency test does NOT insert `pending_syncs`; it runs under `help-docs-desktop` and READS `/admin`, where the inbox is already populated by the pre-existing locked `seed-fixture:walker-first-seen` `pending_syncs` row (seeded inside `seedWalkerFixtures.ts`'s advisory-lock transaction) and the strip is rendered by the sentinel `auto_apply` `show_change_log` row. Zero new mutation → no lock-topology surface added.

## 8. Meta-test inventory + test plan

**Meta-tests touched (declared per writing-plans rule):**
- `tests/help/_affordance-matrix-shape.test.ts` — EXTENDED (new row in sorted list + count 18→19). Fails-by-default if the row/count drift.
- `tests/help/_metaAffordanceMatrixParity.test.ts` — auto-covers the new `<HoverHelp>` call site (must reference the live matrix testid). No edit needed; passes once the row + call site both land.
- `tests/e2e/deep-link-walker.spec.ts` — the new concrete row is auto-registered via `allWalkableRows`; walks at desktop, asserts the tooltip visible on `/admin` and its "Learn more →" resolves to `#re-stage`. Requires the walker seed (§4.4). NOT edited.
- `tests/e2e/help-docs-setup.ts` — EDITED: add a seed-postcondition assertion (exactly one eligible sentinel `show_change_log` row: `created_by='seed-fixture:walker-auto-applied'` AND `source='auto_apply'` AND `status='applied'` AND `acknowledged_at IS NULL`) so an ineffective seed fails BEFORE the walker, closing the "walker false-passes via infra_error branch" gap (Codex R5).
- `tests/db/seed-restage-fixture.test.ts` — NOT touched (no `WALKER_DRIVE_FILE_IDS` change); must stay green (regression check).

**New / updated unit tests (TDD):**
- `RecentAutoAppliedStrip.test.tsx` — (a) dashboard header (`headingLevel={4}`) renders `recent-auto-applied-count-chip` with `renderedCount + overflowCount`; (b) dashboard header renders the HoverHelp with `rootTestId="help-affordance--dashboard-recently-auto-applied--tooltip"` and `learnMore` href `/help/admin/review-queues#re-stage`; (c) dashboard `infra_error` branch renders the help but NO count chip; (d) `headingLevel={2}` (needs-attention page) renders NEITHER chip NOR help (queryByTestId null) AND the `Recently auto-applied` heading is NOT wrapped in a `flex items-center gap-2` div — assert its `parentElement` is the strip `<section>`, not a flex wrapper (bare-DOM contract, Codex R4 finding 2); (e) existing per-group `auto-applied-count-${showId}` badges unaffected.
  - Anti-tautology: assert the chip text equals `renderedCount + overflowCount` derived from the fixture (e.g. `4 + 3 = 7`), not a hardcoded literal divorced from the fixture.
- `NeedsAttentionInbox` gap: a real-browser (Playwright) test added to `deep-link-walker.spec.ts`, guarded `test.skip(project.name !== "help-docs-desktop", …)` since that spec ALSO runs in the mobile `help-docs` project (390×844) where the desktop inbox is hidden (Codex R8). Under `help-docs-desktop` (1280×800): It first calls the existing `setDashboardAdminState()` helper (deep-link-walker.spec.ts:36) to clear the help-docs wizard mode (`pending_wizard_session_id`) so the dashboard — not the wizard — renders (Codex R7; same prep the walker's `/admin` rows use). Then it READS `/admin` — inbox populated by the pre-existing locked `walker-first-seen` `pending_syncs` seed, strip rendered by the sentinel `auto_apply` seed — and asserts the strip section's `getBoundingClientRect().top` is within a small tolerance of the inbox's `bottom + gap-3` (12px) — i.e. no detached band. **Also asserts the ok-path rendered: `recent-auto-applied-count-chip` visible AND `auto-applied-error` absent (Codex R5).** No new DB write (Codex R6). jsdom cannot compute layout, so this is a Playwright test (project rule). Concrete failure mode it catches: reintroducing `h-full` (or `flex-1`) on the inbox re-opens the gap.

**Full-suite + gates:**
- `pnpm test` (Vitest) green.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green.
- Deep-link walker (help-docs-desktop project) green with the seed applied.
- Invariant 8: `/impeccable critique` + `/impeccable audit` on the UI diff; P0/P1 fixed or DEFERRED.md'd before cross-model review.
- screenshots-drift: NOT required (per project CI config). Verify locally via the pinned Docker flow that the two `/admin` baselines (empty-state fixture) are unchanged; regenerate only if unexpected drift appears (§4.1 argues there is none).

## 9. Numeric sweep

- Concrete affordance-row count: **18 → 19** (single source: `_affordance-matrix-shape.test.ts:102` + sorted array :42-72). No other file hardcodes the concrete count.
- `gap-3` = 12px — the inbox↔strip gap after the fix (the container's existing gap, unchanged).
- `renderedCount + overflowCount` — the chip value; equals `Dashboard.tsx:485` `autoAppliedCount`. One canonical definition, referenced not re-derived.
- `WALKER_DRIVE_FILE_IDS.length` stays **4** (no new fixture drive_file_id).

## 10. Files touched

| File | Change |
| --- | --- |
| `components/admin/NeedsAttentionInbox.tsx` | Remove `h-full` from populated root (:182). |
| `components/admin/RecentAutoAppliedStrip.tsx` | Extract `StripHeader`; render in both branches with count chip + HoverHelp. |
| `app/help/_affordanceMatrix.ts` | +1 concrete row. |
| `tests/help/_affordance-matrix-shape.test.ts` | Sorted list +1; count 18→19; comment. |
| `supabase/seedWalkerFixtures.ts` | +`autoAppliedSeedSql()` + sentinel const, composed into the seeder SQL. |
| `supabase/seed.ts` | +1 cleanup delete for `created_by like 'seed-fixture:%'`. |
| `tests/components/admin/RecentAutoAppliedStrip.test.tsx` | Header parity assertions (TDD). |
| `tests/e2e/deep-link-walker.spec.ts` | New real-browser inbox↔strip adjacency + ok-path test, reusing existing locked seeds (no new DB write). |
| `tests/e2e/help-docs-setup.ts` | Seed-postcondition assertion for the sentinel row (Codex R5). |

No migration (`show_change_log` already exists); no `validation-schema-parity` impact.

## 11. Disagreement-loop preempts (for the reviewer)

- **Why seed on RPAS, not a new fixture show:** `show_change_log` is unlocked, so no new `WALKER_DRIVE_FILE_IDS` entry is warranted; a new locked fixture would force a lock-order edit + `seed-restage-fixture.test.ts` change for zero benefit. The `alertSeedSql()` precedent (:234) already attaches a non-locked fixture to RPAS the same way.
- **Why reuse `#re-stage`, not a new anchor:** `review-queues#re-stage` ("Live-show changes") documents auto-applied crew/field/schedule changes verbatim — the exact content of the strip. A new anchor would duplicate it.
- **Why the count chip in the header and not just per-group badges:** the request is header parity with "Needs attention," whose header carries a section total. Per-group badges remain; the header chip is the section roll-up.
- **Screenshot drift:** the `h-full` removed is on the populated branch; the two `/admin` baselines use the 0-pending RPAS fixture → empty-state branch (no `h-full`) → provably unaffected.
- **Chip + help are dashboard-only (Codex R1 finding 2):** the shared strip also renders on `/admin/needs-attention` (`headingLevel={2}`); gating the new chrome on `headingLevel === 4` keeps a `dashboard`-named affordance on the dashboard, avoids duplicating that page's existing header help, and matches the single desktop matrix row. Not a scope cut — the request was dashboard-header parity.
- **Seeded fixture is non-undoable (Codex R1 finding 1):** `field_changed` avoids the broken-Undo path a `crew_added` fixture would create (undo RPC keys on `entity_ref`→`crew_members`, which the fixture wouldn't populate). The walker only needs the strip + tooltip visible.
- **`StripHeader` returns the BARE heading when `!showAffordances` (Codex R4 finding 2):** no wrapper `div` on `/admin/needs-attention` → that shared route's DOM is byte-for-byte unchanged. The flex chrome is dashboard-only; the needs-attention page is not brought into scope.
- **Gap test adds ZERO new DB writes (Codex R4/R6):** it does not insert `pending_syncs`; it runs under `help-docs-desktop` and READS `/admin`, where the inbox is populated by the pre-existing locked `walker-first-seen` seed and the strip by the sentinel `auto_apply` seed. No lock-topology surface added — the earlier "lock-free fixture is fine" argument is withdrawn in favor of adding no mutation at all.
