# Needs-attention holds rollup — design

**Date:** 2026-08-03. **Backlog:** `BACKLOG.md` § `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` ("pending MI-11 holds do not surface on the needs-attention page"). **Origin deferral:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md` §11.

Pending MI-11 identity holds (`sync_holds`, `kind='mi11_pending'`) are visible only inside the show they belong to (the per-show changes feed). The needs-attention rollup — the `/admin/needs-attention` page, the dashboard inbox, the AdminNav badge, and the digest email — does not know they exist. An unopened show can therefore sit on a held identity change indefinitely with zero cross-show signal. This spec adds the missing cross-show holds read and rolls open holds into all four surfaces.

## 1. Goals

- An open MI-11 hold surfaces as a card in the needs-attention item list (page + dashboard inbox), counts toward the AdminNav badge, and appears in the digest email, until it is approved or rejected.
- Approve/reject stay where they live today (the per-show changes feed inside the `?show=` modal); the rollup only announces and deep-links.
- No DB changes: no migrations, no new RPCs, no RLS edits, no new mutation surfaces.

### 1.1 Resolved scope — do not relitigate

Ratified by the owner during brainstorming on 2026-08-03 (this document is the ratification record; the mockup artifact the choices were made against is session-local and not repo state):

| #   | Decision                                                                                                                                                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Surfaces: Option C** — page, dashboard inbox, badge, AND digest email all include open holds.                                                                                                                                                        | Owner choice over "page only" and "inbox surfaces only". Badge/page lockstep is preserved by construction (§6).                                                                                                                                                                                                                                                                                                                                                  |
| R2  | **Digest includes a hold only while it is uncleared.**                                                                                                                                                                                                 | Automatic: approve deletes the hold rows (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:455`), reject converts `kind` to `'undo_override'` (`supabase/migrations/20260608000002_mi11_gate_rpcs.sql:70`). Every read in this spec filters `kind='mi11_pending'`, so a cleared hold vanishes from all four surfaces with no acknowledgement bookkeeping. Do not propose an acknowledged/snoozed state; none is wanted.                                     |
| R3  | **Grouping: one card per show.** A show with exactly one open hold renders that hold's summary; a show with N>1 renders a count line.                                                                                                                  | Owner choice ("Style 3") over per-hold cards and always-count cards.                                                                                                                                                                                                                                                                                                                                                                                             |
| R4  | **Progressive disclosure without actions ("Reveal A").** Expanding a multi-hold card reveals the per-hold catalog summaries — the SAME generated copy the per-show feed shows, which for an email change includes the old and new addresses (R8) — plus a link to the show. NO inline approve/reject in the rollup. | The owner's ratified choice was disclosure-without-actions versus disclosure-with-inline-approve/reject; the owner explicitly declined inline actions. "Names only" in the session shorthand meant "no action controls", not a redaction contract — the identical summaries are already visible to the same admin audience in the per-show feed. Do not propose moving `Mi11GateActions` into the inbox — that duplicates a gated mutation surface for no ratified need. |
| R5  | **Read path: service-role read inside the existing loaders** (approach 1). No SECURITY DEFINER RPC, no PostgREST grant change.                                                                                                                         | `sync_holds` is deliberately service-role-only (`supabase/migrations/20260608000000_sync_holds.sql:46-47`, F9 read posture per the header comment at `20260608000000_sync_holds.sql:4`); the per-show feed already reads it exactly this way (`lib/sync/feed/readShowChangeFeed.ts:37`).                                                                                                                                                                         |
| R6  | **Archived shows are excluded** from all four surfaces.                                                                                                                                                                                                | Consistency with the sync-problem stream's `shows.archived=false` filter (`lib/admin/loadNeedsAttention.ts:213`). An archived show's holds become reachable again by unarchiving; a terminal archived show's rows die with the show (`on delete cascade`, `supabase/migrations/20260608000000_sync_holds.sql:8`).                                                                                                                                                |
| R7  | **Stream totals count shows-with-open-holds, not hold rows** (§6).                                                                                                                                                                                     | Keeps cards, badge, `totalCount`, and `overflowCount` arithmetic mutually honest — one card per show means one count unit per show.                                                                                                                                                                                                                                                                                                                              |
| R8  | **Per-hold copy is generated by `shapeHoldEntry`, never re-authored.**                                                                                                                                                                                 | The gallery-parity contract: hold summaries are "GENERATED … from the disposition, never authored, so a catalog that invented its own copy would diverge on sight" (`lib/sync/feed/shapeHoldEntry.ts:4-5`). The rollup reuses the same generator; only the multi-hold count line and the disclosure affordance copy are new (§7).                                                                                                                                |

### 1.2 Round-1 triage record

Adversarial round 1 (Codex, 2026-08-03, verdict BLOCKING) — every finding accepted and repaired in this revision; dispositions recorded so later rounds verify instead of re-deriving:

| Finding                                                                            | Disposition                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 digest 20-item slice could silently drop holds                                   | Accepted → D8: the digest call now threads an explicit uncapped `cap` (sum of its stream input lengths). Per-email bounding stays where it is honest: `renderDigest`'s own `DIGEST_MAX_SHOWS` slice with a source-derived overflow count (`lib/notify/templates/digest.ts:151`). |
| F2 R4 "names only" contradicted §7 rendering full summaries                         | Accepted → R4 reworded to its ratified substance (no action controls; summaries are the R8 generated copy, addresses included).                                                                                                            |
| F3 embed/Date-typed rows reaching `groupHoldRows`                                   | Accepted → §4 adapter contract: each reader flattens + string-normalizes BEFORE the pure core; `groupHoldRows` requires flat rows with `created_at: string` and non-null `slug`.                                                            |
| F4 D1 vs §6 contradiction on count-helper reuse                                     | Accepted → the count helper now CALLS `loadOpenIdentityHolds` and counts groups (§6). One query, one registry contract, lockstep by construction.                                                                                          |
| F5 cap-order divergence between two hold queries                                    | Structurally removed by the F4 resolution (single query). Cap-induced undercount documented once in §10.                                                                                                                                   |
| F6 transition inventory missed single↔multi + refresh-while-expanded                | Accepted → §7 inventory now enumerates the three states and compound rows.                                                                                                                                                                 |
| F7 disclosure control contract unspecified                                          | Accepted → §7 specifies a client island mirroring `IgnoredSheetsDisclosure` (button, `aria-expanded`, `aria-controls`, stable panel id, focus classes, CollapsePanel).                                                                     |
| F8 `holdCount` NaN/zero guards                                                      | Accepted → `holdCount` is no longer an input anywhere; it is DERIVED as `summaries.length` at every layer. NaN/negative/zero are unrepresentable; zero-length groups are skipped.                                                          |
| F9 test-plan gaps (archived, undo_override, sentinel, tie-break, Date, >20 digest, clear-through e2e) | Accepted → §9 rows 6–13.                                                                                                                                                                                                                   |
| F10 bounded-reads registry + existing count-helper infra row                        | Accepted → §9 registry inventory names `tests/admin/_metaBoundedReads.test.ts` rows and the EXPANSION of the existing `loadNeedsAttentionCount` contract row.                                                                              |
| F11 `sourceTotals` undecided                                                        | Accepted → D9: `DigestModel.sourceTotals` gains `holdShows: number`.                                                                                                                                                                       |
| F12 missing completeness matrix                                                     | Accepted → §11.                                                                                                                                                                                                                            |

## 2. Current state (verified 2026-08-03)

- **Store.** `public.sync_holds` (`supabase/migrations/20260608000000_sync_holds.sql:6-19`): `id, show_id → shows(id) on delete cascade, drive_file_id, domain, entity_key, held_value jsonb, proposed_value jsonb, base_modified_time, kind, reservation_collisions, created_at, created_by`. `kind in ('mi11_pending','undo_override')` (`20260608000000_sync_holds.sql:27`); `mi11_pending` rows carry `proposed_value->>'disposition' in ('email_change','rename','removal')` (`20260608000000_sync_holds.sql:30-37`); unique `(show_id, domain, entity_key)` (`20260608000000_sync_holds.sql:39-41`); RLS enabled, all revoked from `anon, authenticated`, granted to `service_role` (`20260608000000_sync_holds.sql:45-47`).
- **Only existing read:** `readShowChangeFeed(showId)` (`lib/sync/feed/readShowChangeFeed.ts:80`) — per-show, service-role client built by `createFeedSupabaseClient` (`readShowChangeFeed.ts:37`), holds query selects `id, entity_key, held_value, proposed_value, base_modified_time, created_at` filtered `eq("show_id", showId).eq("kind", "mi11_pending")` (`readShowChangeFeed.ts:121-127`). No cross-show read exists in `lib/` or `app/` (backlog row, re-verified).
- **Hold → display shaping:** `shapeHoldEntry(hold)` (`lib/sync/feed/shapeHoldEntry.ts:90`) produces `summary` via `renderPendingSummary` (`shapeHoldEntry.ts:40`) from the catalog codes `mi11_pending_email_change` (`shapeHoldEntry.ts:46`), `mi11_pending_rename_folded` (`shapeHoldEntry.ts:67`), `mi11_pending_rename` (`shapeHoldEntry.ts:73`), `mi11_pending_removal` (`shapeHoldEntry.ts:80`), interpolating `{name}/{old}/{new}` from `entity_key`/`held_value`/`proposed_value`. Input type `HoldRow` (`shapeHoldEntry.ts:11-18`) — note `created_at: string`.
- **Rollup assembly:** `loadNeedsAttention` (`lib/admin/loadNeedsAttention.ts:30`) reads three streams on a cookie-bound `createSupabaseServerClient` — `pending_ingestions`, `pending_syncs`, inbox-routed `admin_alerts` — each as a bounded row read (`.limit(cap + 1)`) plus an exact head-count, then delegates to the pure `buildNeedsAttention` (`lib/admin/needsAttention.ts:231`). Item variants: `pending_ingestion`, `first_seen`, `existing_staged`, `sync_problem` (`lib/admin/needsAttention.ts:83-120`). Merged sort: newest-first on `sortKey` (string `localeCompare`), tie-break `id` ascending (`needsAttention.ts:272-275`); single slice to `cap`, which DEFAULTS to `RENDER_CAP = 20` when the caller passes none (`needsAttention.ts:74-76`, `needsAttention.ts:279`); the page threads `PAGE_RENDER_CAP = 100` (`needsAttention.ts:23`).
- **Badge:** `loadNeedsAttentionCount` (`lib/admin/needsAttentionCount.ts:11`) — head-counts only, cookie client, consumed by the admin layout badge and `app/api/admin/needs-attention-count/route.ts`.
- **Digest:** `buildDigestModel` (`lib/notify/digest.ts`) queries `pending_ingestions`/`pending_syncs` via its raw `sql` tag, normalizes timestamps through `asIso` (`digest.ts:76` — postgres.js returns `Date` for `timestamptz`), feeds `buildNeedsAttention` with NO `cap` (`digest.ts:200`) and no `syncProblems` (defaulted `[]`, `lib/admin/needsAttention.ts:67-70`), groups via `groupTitleFor`/`itemCopy`/`slugFor` (`lib/notify/digest.ts:82-108`), no-sends on zero items (`digest.ts:228`), and records `sourceTotals: { ingestions, syncs, shows }` (`digest.ts:19-24`) which `deliver.ts` persists into delivery context (`lib/notify/deliver.ts:711`). The email template applies its own `DIGEST_MAX_SHOWS` slice with a source-derived overflow count (`lib/notify/templates/digest.ts:151`).
- **Deep link:** `/admin?show=<slug>` mounts the published review modal (`app/admin/page.tsx:161`), which mounts `ChangesSection` (`components/admin/showpage/PublishedReviewModal.tsx`) — the surface with the feed and `Mi11GateActions` approve/reject.
- **Card precedent:** the `sync_problem` card in `NeedsAttentionInbox` (`components/admin/NeedsAttentionInbox.tsx:113-135`): bordered tile, `CardHeader` with `status="warn"`, `title ?? slug` fallback line, copy line, `Link` with slug-discriminated `aria-label`. `NeedsAttentionInbox` is a SERVER component (no `"use client"`; `ItemCard` in the same file, `NeedsAttentionInbox.tsx:60`).
- **Disclosure precedent:** `IgnoredSheetsDisclosure` (`components/admin/IgnoredSheetsDisclosure.tsx:12`) — a client island owning ONLY open/closed state; server-rendered children passed by slot; real `<button>` with `aria-expanded` + `aria-controls` pointing at an always-mounted `CollapsePanel` region; decorative chevron `aria-hidden`; `min-h-tap-min` tap floor; `focus-visible:ring-2 focus-visible:ring-focus-ring` focus classes (`IgnoredSheetsDisclosure.tsx:60`).
- **Seeding:** the dev materializer already inserts `sync_holds` rows (`lib/dev/materialize/run.ts:252`), so e2e can seed real holds.

## 3. Design decisions

<!-- spec-lint: ignore — the D1 row names the planned new file lib/admin/identityHolds.ts -->

| #   | Decision                                                                                                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One pure grouping core + one PostgREST reader, consumed by BOTH admin helpers.** Pure `groupHoldRows` (new file lib/admin/identityHolds.ts) turns flat, pre-normalized hold+show rows into per-show groups. `loadOpenIdentityHolds` (same file) is the service-role PostgREST reader; `loadNeedsAttention` uses its groups, and `loadNeedsAttentionCount` calls the SAME function and takes `groups.length`. The digest reuses only `groupHoldRows`, over rows from its own `sql` query. | One query and one grouping semantics for page, inbox, and badge — lockstep and overflow behavior identical by construction (kills the two-query divergence class). Shaping ≤200 summaries for a badge count is negligible waste at FXAV scale.                                                                     |
| D2  | **The holds read is one bounded read, not rows+head-count.** Up to `HOLDS_ROW_CAP = 200` rows ordered `created_at desc`; the stream total = number of distinct show groups in the read. No separate head-count probe.                                                                                          | The stream total must count SHOWS (R7); PostgREST cannot head-count a distinct column. The table is structurally small — unique `(show_id, domain, entity_key)` bounds rows to crew-size × shows for two domains at FXAV scale (tens). §10 documents the cap-overflow limit.                                       |
| D3  | **The two admin helpers construct a service-role client for the holds leg only**; existing cookie-client legs untouched. Any holds-leg fault follows each helper's existing infra posture (§8).                                                                                                                | R5. Precedent for a server-only admin read on service-role: `readShowChangeFeed` (`lib/sync/feed/readShowChangeFeed.ts:37`). Both helpers already run strictly server-side behind admin gating.                                                                                                                    |
| D4  | **Builder input is pre-grouped and pre-normalized.** `buildNeedsAttention` gains optional `identityHolds: NeedsAttentionIdentityHoldInput[]` + `totalCounts.identityHolds`; both default to `[]`/`0` so existing callers are byte-identical.                                                                   | Mirrors the `syncProblems` optionality contract (`lib/admin/needsAttention.ts:67-70`). Grouping in the builder would force the digest's raw-SQL rows through a PostgREST-shaped interface.                                                                                                                        |
| D5  | **Card `sortKey` = the group's newest `created_at`, as a raw string.** Readers own delivering strings (§4); the pure layers never see a `Date`.                                                                                                                                                                | Same convention as every other stream (string sort keys compared with `localeCompare`, `lib/admin/needsAttention.ts:271-275`); a show's card floats to where its most recent hold landed.                                                                                                                          |
| D6  | **Disclosure is client-side expand/collapse of already-loaded summaries — no lazy fetch.** The loader always carries every group's per-hold summaries (bounded by D2's row cap).                                                                                                                               | At ≤200 rows total there is nothing worth a second round-trip; keeps the inbox a pure render of `NeedsAttention`.                                                                                                                                                                                                  |
| D7  | **No new instrumentation.** All new code paths are reads; the only mutation surfaces in the feature's orbit (`mi11_approve_hold` / `mi11_reject_hold` RPC callers) are untouched.                                                                                                                              | Invariant 10 applies to mutation surfaces; there are none here. Invariant 2 (advisory locks) likewise N/A — no writes to locked tables.                                                                                                                                                                            |
| D8  | **The digest's builder call threads an explicit cap equal to the sum of its stream input lengths** (`ingestions.length + syncs.length + identityHolds.length`), so the builder slice can never drop an item from the digest.                                                                                   | F1: the digest previously inherited the DEFAULT 20-item slice (`needsAttention.ts:74-76`, `digest.ts:200`) — an open hold behind 20 newer items would silently vanish from email, violating R2's "until cleared". Per-email bounding remains at the template layer, where `renderDigest` slices to `DIGEST_MAX_SHOWS` with a SOURCE-derived overflow line (`lib/notify/templates/digest.ts:151`) — honest truncation, not silent. Side effect (deliberate, documented): pending-stream items beyond 20 also stop being silently dropped from the digest. |
| D9  | **`DigestModel.sourceTotals` gains `holdShows: number`** (count of hold GROUPS fed to the builder).                                                                                                                                                                                                             | F11: `sourceTotals` is persisted durable telemetry (`lib/notify/deliver.ts:711`); a holds-only digest must not record `{ingestions: 0, syncs: 0, shows: N}` with nothing explaining the N. Additive field; existing readers unaffected.                                                                             |

## 4. Read path (new file lib/admin/identityHolds.ts)

<!-- spec-lint: ignore — code block sketches the planned new module's exports -->

```ts
// Flat, reader-normalized input row. READERS own flattening + normalization:
// groupHoldRows never sees a nested embed, a Date, or a null slug.
export type IdentityHoldRow = {
  id: string;
  show_id: string;
  slug: string; // readers drop slug-less rows before this layer
  title: string | null;
  entity_key: string;
  held_value: unknown;
  proposed_value: Disposition; // shapeHoldEntry's own input contract
  base_modified_time: string | null;
  created_at: string; // ALWAYS a string — never a Date (D5)
};

export type IdentityHoldGroup = {
  showId: string;
  slug: string;
  title: string | null;
  summaries: string[]; // newest-first; length >= 1; each from shapeHoldEntry(row).summary
  newestCreatedAt: string; // raw created_at of the group's newest hold
};
// NOTE: no holdCount field ANYWHERE — every layer derives it as summaries.length (F8).

export const HOLDS_ROW_CAP = 200;

export function groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[];
export async function loadOpenIdentityHolds(): Promise<
  { kind: "ok"; groups: IdentityHoldGroup[] } | { kind: "infra_error"; message: string }
>;
```

- **Query** (service-role client, `createSupabaseServiceRoleClient` at `lib/supabase/server.ts:79`):
  `from("sync_holds").select("id, show_id, entity_key, held_value, proposed_value, base_modified_time, created_at, shows!inner(slug, title)").eq("kind", "mi11_pending").eq("shows.archived", false).order("created_at", { ascending: false }).limit(HOLDS_ROW_CAP + 1)`.
  Every await destructures `{ data, error }`; returned-error, thrown-error, and client-construction-throw all map to `{ kind: "infra_error" }` (invariant 9). Registry row in `tests/admin/_metaInfraContract.test.ts`.
- **Reader-side adaptation (the F3 contract).** `loadOpenIdentityHolds` flattens each row's `shows` embed handling BOTH object and array shapes (the existing defensive pattern at `lib/admin/loadNeedsAttention.ts:264-276`); a row whose embed yields no `slug` is skipped with `log.warn("identity hold missing show slug", { source: "admin.loadOpenIdentityHolds", holdId })`. PostgREST returns `created_at` as a string already; the reader passes it through untouched. The DIGEST reader (§8) owns the same normalization for its transport: postgres.js parses `timestamptz` to `Date`, so its SQL casts created_at and base_modified_time to text at the query (§8), keeping `IdentityHoldRow.created_at: string` true on both paths.
- **Row-shape guard.** A `mi11_pending` row without a recognized `disposition` cannot exist under the shape CHECK (`20260608000000_sync_holds.sql:30-37`); defensively, `shapeHoldEntry`'s removal fallback arm (`shapeHoldEntry.ts:79-84`) renders any unrecognized shape, so no throw path exists.
- **Overflow.** If more than `HOLDS_ROW_CAP` rows come back: `log.warn("sync_holds row cap exceeded", { source: "admin.loadOpenIdentityHolds" })`, drop the sentinel row, group what was read. Consequence documented ONCE in §10 and shared by page, inbox, and badge (they all consume this one function, D1). Never an error, never silent.
- **Grouping (`groupHoldRows`, pure).** Group by `show_id` preserving input order (already newest-first from either reader's `order by created_at desc`): the first row of a group supplies `slug`/`title`/`newestCreatedAt`; each row contributes `shapeHoldEntry(row).summary` in order. Groups order newest-first by construction; `summaries[0]` is the newest hold's summary. Empty input → `[]`. The function trusts the `IdentityHoldRow` contract (readers pre-filter); it performs no logging.

## 5. Builder + item variant (`lib/admin/needsAttention.ts`)

```ts
export type NeedsAttentionIdentityHoldInput = IdentityHoldGroup; // structural re-export

// new item variant
| {
    variant: "identity_hold";
    key: string;              // `hold-show:${showId}`
    showId: string;
    slug: string;
    title: string | null;
    summaries: string[];      // newest-first; length >= 1
    copy: string;             // summaries.length === 1 ? summaries[0] : count line (§7)
    activityAt: string | null;
  }
```

- `BuildNeedsAttentionInput` gains `identityHolds?: NeedsAttentionIdentityHoldInput[]` and `totalCounts.identityHolds?: number` (defaults `[]` / `0` — D4).
- Merged entry: `sortKey = newestCreatedAt ?? ""`, `id = showId` (tie-break axis), one entry per group. A group with `summaries.length === 0` is skipped (defensive; unreachable from `groupHoldRows`). There is NO `holdCount` input to validate — the count is `summaries.length` (F8), so NaN/zero/negative counts are unrepresentable.
- `copy`: `summaries.length === 1` → `summaries[0]` verbatim (R8). Otherwise the §7 count line with `summaries.length` interpolated.
- Output `NeedsAttention` gains `identityHoldTotal: number` (mirrors `syncProblemTotal`, `lib/admin/needsAttention.ts:131`); `totalCount` adds the stream total (§6).

## 6. Count semantics (lockstep across surfaces)

Single definition: **the identity-holds stream total is the number of non-archived shows with at least one open `mi11_pending` hold** (R7) — operationally, `loadOpenIdentityHolds().groups.length`.

| Surface                                                              | Source of the number                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page / dashboard `totalCount`, `overflowCount`, `identityHoldTotal`  | `loadOpenIdentityHolds()` inside `loadNeedsAttention`, threaded as `totalCounts.identityHolds = groups.length`                                                                                        |
| AdminNav badge (`loadNeedsAttentionCount`)                            | THE SAME `loadOpenIdentityHolds()` call; holds contribution = `groups.length`. No second query exists (D1), so filters, ordering, and cap behavior cannot diverge from the page — including above the row cap. |
| Digest                                                                | `groupHoldRows(sqlRows).length` (its own transport, same pure core; recorded as `sourceTotals.holdShows`, D9)                                                                                          |

## 7. UI: cards + disclosure

New `identity_hold` branch in `NeedsAttentionInbox` (`components/admin/NeedsAttentionInbox.tsx`), modeled on the `sync_problem` card (`NeedsAttentionInbox.tsx:113-135`): bordered tile, `CardHeader` `status="warn"`, label `Held change` when `summaries.length === 1`, `Held changes` otherwise; title line `title ?? slug` (the existing card convention — an empty-string `title` renders as the existing cards would render it; no novel guard); then:

- **Single hold (`summaries.length === 1`).** Copy line = `summaries[0]` (`text-sm text-text-subtle`, same classes as the sync-problem copy line). Footer `Link` to `/admin?show={slug}` — text `Review →` (matches existing card link copy), `data-testid={`needs-attention-link-identity-hold-${showId}`}`, `aria-label` `` `Review held change for ${title ?? slug} (${slug})` `` (slug discriminator per the WCAG 2.4.4 note at `NeedsAttentionInbox.tsx:123-125`). No disclosure affordance. Entirely server-rendered.
- **Multiple (`summaries.length > 1`).** Copy line = count line: `` `${summaries.length} held changes waiting` ``. Below it, a NEW client island `IdentityHoldDisclosure` (new file components/admin/IdentityHoldDisclosure.tsx) mirroring the `IgnoredSheetsDisclosure` composition contract (`components/admin/IgnoredSheetsDisclosure.tsx:12`): the island owns ONLY open/closed state; the disclosed content is passed as server-rendered `children`.
  - **Trigger:** a real `<button type="button">` with visible text `Show details` (collapsed) / `Hide details` (expanded), decorative chevron (`aria-hidden`, rotates with state like the precedent), `aria-expanded={open}`, `aria-controls={panelId}` where `panelId = `identity-hold-panel-${showId}``, `min-h-tap-min` tap floor, and the precedent's focus classes (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg`, `IgnoredSheetsDisclosure.tsx:60`). `aria-label` = `` `Show details for ${summaries.length} held changes for ${title ?? slug}` `` (and the Hide variant) — begins with the visible text, satisfying label-in-name.
  - **Panel:** always-mounted `CollapsePanel` (the precedent's height-morph region — `aria-controls` resolves unconditionally) with `id={panelId}`, containing the `summaries` list: each summary its own line (`text-sm text-text-subtle`), capped at `HOLD_SUMMARIES_RENDER_CAP = 10` lines followed by a literal line `` `and ${summaries.length - 10} more` `` when longer (bounded-list rule; unreachable at FXAV scale, cheap to pin).
  - **Footer `Link`** (same contract as the single-hold card, `aria-label` `` `Review held changes for ${title ?? slug} (${slug})` ``) sits OUTSIDE the panel, visible in both collapsed and expanded states — disclosure reveals detail, never gates navigation.
- **Card `data-testid`:** `needs-attention-item-identity-hold-{showId}` (both modes).

**Guard conditions.** `title` null → `slug` renders (both label sites above state the fallback; empty-string `title` follows the existing `title ?? slug` convention unchanged). `summaries` empty → the builder skipped the group; the component never receives it (§5). `activityAt` null or empty → the builder already maps empty `sortKey` to `null` (`lib/admin/needsAttention.ts:283`), and `CardHeader` omits the timestamp for null `activityAt` (`NeedsAttentionInbox.tsx:47`). `summaries.length` is the ONLY count anywhere (F8).

**Mode boundaries.** Two modes, forked EXACTLY on `summaries.length === 1`: single (no island, no panel, no toggle — the copy line IS the summary) and multi (count copy + island + panel). Shared elements across both modes: tile frame, `CardHeader`, title line, footer link. The `IdentityHoldDisclosure` island exists only in multi mode.

### Transition Inventory

Visual states: **single**, **multi-collapsed**, **multi-expanded**. (Expansion state lives in the client island, keyed by React tree position under `item.key = hold-show:${showId}`, which is stable across refreshes of the same show.)

| From → To                        | Treatment                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| single → multi-collapsed         | instant — a data refresh re-renders the card with the island mounted collapsed. No animation.                                                                                                                    |
| multi-collapsed → single         | instant — island unmounts with its panel. No animation.                                                                                                                                                          |
| multi-collapsed → multi-expanded | `CollapsePanel` height-morph (the precedent's standard treatment) — the ONLY animated pair.                                                                                                                      |
| multi-expanded → multi-collapsed | `CollapsePanel` height-morph (reverse).                                                                                                                                                                          |
| single → multi-expanded          | unreachable in one step: a refresh mounts the island in its default collapsed state.                                                                                                                             |
| multi-expanded → single          | instant — when a refresh drops `summaries.length` to 1, the card renders single mode: island and panel unmount, any open state is discarded with them. No exit animation.                                        |

Compound rows: (a) summaries CHANGE while expanded (a reject converts one hold, `20260608000002_mi11_gate_rpcs.sql:70`) — the list re-renders in place, instant, panel stays open; (b) the whole group clears while expanded (approve deletes the rows, `20260608000002_mi11_gate_rpcs.sql:455`) — the card unmounts entirely on the next refresh, no exit animation (consistent with every other inbox card's removal); (c) toggle clicked while a `router.refresh()` is in flight — the island's local state updates immediately and the refreshed payload re-renders around it; if the refreshed data keeps multi mode the open state survives (same tree position), otherwise rule "multi-expanded → single" applies.

### Dimensional Invariants

None introduced: the inbox is a flow-layout list of tiles; this feature adds no fixed-height or fixed-width parent with flex/grid children, so there are no parent-to-child dimension relationships to pin and the plan's layout-dimensions task is N/A (restated in §9).

**Mechanical gate pre-checks** (pre-code checklist, AGENTS.md "Pre-code mechanical UI gate"): no em-dashes or raw codes in the new copy strings (count line, `Show details` / `Hide details`, `and N more`, `Review →`, aria-labels); tap targets `min-h-tap-min` (trigger AND footer link); type/token classes reuse the sync-problem card's exact classes; no new color tokens (reuses the existing warn treatment — no `DESIGN.md` change, no contrast pin needed).

The needs-attention PAGE (`app/admin/needs-attention/page.tsx`) and dashboard render the same component; no page-level change beyond the loader threading. No new routes; `PROTECTED_ROUTES` untouched.

## 8. Digest + error handling

**Digest changes** (`lib/notify/digest.ts`):

- New holds query on the existing `sql` tag (string casts per §4's adapter contract; the inner join guarantees non-null `slug`):

  ```sql
  select sh.id, sh.show_id, sh.entity_key, sh.held_value, sh.proposed_value,
         sh.base_modified_time::text, sh.created_at::text, s.slug, s.title
  from sync_holds sh join shows s on s.id = sh.show_id
  where sh.kind = 'mi11_pending' and s.archived = false
  order by sh.created_at desc
  ```

- Rows → `groupHoldRows` → `identityHolds` input; `totalCounts.identityHolds = groups.length`; `sourceTotals.holdShows = groups.length` (D9).
- The `buildNeedsAttention` call threads `cap: ingestions.length + syncs.length + identityHolds.length` (D8) — nothing is sliced at the model layer; `renderDigest`'s `DIGEST_MAX_SHOWS` slice remains the per-email bound with its honest overflow line (`lib/notify/templates/digest.ts:151`).
- `groupTitleFor` → `item.title`; `itemCopy` → `item.copy` (single-hold: the generated summary; multi: the count line); `slugFor` → `item.slug` (extends the switches at `lib/notify/digest.ts:82-108`).

**Error handling:**

| Surface                  | Holds-leg fault behavior                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadNeedsAttention`     | Same contract as its other streams: any holds-leg fault → the whole call returns `{ kind: "infra_error", message }` (`lib/admin/loadNeedsAttention.ts:28`). No partial-stream success; that is the existing all-or-nothing posture and it stays.                                                 |
| `loadNeedsAttentionCount` | `loadOpenIdentityHolds` returning `infra_error` → `{ kind: "infra_error" }` (`lib/admin/needsAttentionCount.ts:9`); badge falls back to its existing infra behavior. The cookie legs and the holds leg fail independently — a holds fault is not maskable by healthy pending counts (§9 test 10). |
| Digest                   | The holds query runs inside `buildDigestModel`'s existing try posture: a thrown SQL fault propagates exactly like a `pending_ingestions` query fault today. No catch-and-continue — a digest that silently omits holds would violate R2.                                                          |

No new user-visible fault copy (existing surfaces own their infra rendering); no raw codes anywhere (invariant 5 — rendered strings are catalog-generated summaries and the §7 literals).

## 9. Tests

Unit (jest):

1. **`groupHoldRows`** — grouping, order preservation (groups newest-first; summaries newest-first), empty input, single-row group, multi-show interleaved rows.
2. **`buildNeedsAttention` identity_hold** — single-hold copy = `summaries[0]`; multi-hold copy = count line with `summaries.length`; sort interleaving against other streams (fixture-derived timestamps — assert the merged ORDER derived from fixture values, never a hardcoded order); `totalCount`/`overflowCount`/`identityHoldTotal` arithmetic when the stream total exceeds rendered cards; defaults byte-identical when `identityHolds`/`totalCounts.identityHolds` omitted (regression fence for D4); empty-summaries group skipped.
3. **`loadOpenIdentityHolds`** — invariant-9 shape (returned error, thrown error, construction failure each → typed `infra_error`); embed flattening handles object AND array shapes; slug-less row skipped with warn; registry row in `tests/admin/_metaInfraContract.test.ts`.
4. **Count helper** — holds contribution = `groups.length` via the SAME `loadOpenIdentityHolds` (spy pins the call — no second query shape exists to drift); EXPAND the existing `loadNeedsAttentionCount` contract row in `tests/admin/_metaInfraContract.test.ts:263-267` to name the holds leg.
5. **Component** — single-hold card: summary + link, NO island; multi-hold: count line collapsed, toggle expands to summaries + link; `aria-expanded`/`aria-controls`/panel id wiring; summaries cap line at 11+ holds (`and N more` derived from fixture length); `title ?? slug` fallback branch; footer link present in both disclosure states.
6. **Archived exclusion (R6)** — an archived show's open hold produces no group (loader query filter), no badge contribution, and no digest item (SQL filter). All three asserted.
7. **`undo_override` exclusion (R2)** — a present `undo_override` row for a show with no `mi11_pending` rows yields nothing on any surface (covers reject-conversion, not just approve-deletion).
8. **Cap boundary** — exactly `HOLDS_ROW_CAP` rows: no warn, all grouped; `HOLDS_ROW_CAP + 1`: warn emitted, sentinel dropped, groups derived from the capped set (undercount pinned as the DOCUMENTED behavior, §10).
9. **Tie-break** — two groups with equal `newestCreatedAt` order by `showId` ascending.
10. **Independent fault injection** — cookie legs succeed while the service-role holds leg fails → `infra_error` (both helpers); service-role construction throw specifically covered.
11. **Digest string normalization** — the digest row adapter delivers `created_at` as a string to `groupHoldRows` (fixture rows typed as the SQL text-cast transport produces); a type-level test pins `IdentityHoldRow["created_at"]` as `string`.
12. **Digest uncapped (D8)** — more than 20 merged items including an old hold: the hold is present in the model; `sourceTotals.holdShows` recorded; holds-only digest sends (item count > 0 → not `no_send`, `lib/notify/digest.ts:228`).

e2e (Playwright, extends the existing needs-attention spec files): seed via the dev materializer — one single-hold show and one 3-hold show; assert the page renders both cards with the correct copy fork, badge count includes both shows (expected number derived from the seeded fixture), expansion reveals the three summaries, the card link lands on `/admin?show={slug}` with approve/reject visible, and — follow-through — approving the single hold then reloading shows the card GONE and the badge decremented (clear-through, §9 test-gap F9). Anti-tautology: scope card-copy assertions to `needs-attention-item-identity-hold-{showId}`, never page-wide text search (the per-show feed renders the same summaries).

Layout-dimensions task: N/A (§7 Dimensional Invariants). Transition-audit task: applies — the plan task lists every conditional render in the new card + island, asserts the single animated pair is the `CollapsePanel` morph and everything else is instant with no `AnimatePresence`, and exercises compound row (a): summaries change while expanded.

Meta-test / structural-registry inventory (declared):

- `tests/admin/_metaInfraContract.test.ts` — NEW row for `loadOpenIdentityHolds`; EXPANDED contract text on the existing `loadNeedsAttentionCount` row (`tests/admin/_metaInfraContract.test.ts:263-267`).
- `tests/admin/_metaBoundedReads.test.ts` — the new module path lib/admin/identityHolds.ts added to `READ_MODULES` (`_metaBoundedReads.test.ts:30`); `sync_holds` added to `UNBOUNDED_TABLES` (`_metaBoundedReads.test.ts:58`).
- NOT touched (declared): `AUDITABLE_MUTATIONS` (no mutation surfaces), advisory-lock topology tests (no writes), `PROTECTED_ROUTES` (no new routes), alert catalog (no new codes), DML-lockdown registries (no grant changes), schema manifest / validation parity (no migrations), sentinel-hiding registry (no optional-text tiles).

## 10. Documented limits

- **Row cap.** Beyond `HOLDS_ROW_CAP = 200` open hold rows, the read truncates: groups derive from the newest 200 rows, older holds temporarily invisible in the ROLLUP ONLY (the per-show feed remains complete), `log.warn` emitted. Because page, inbox, AND badge consume the single `loadOpenIdentityHolds` read (D1), all three under-report IDENTICALLY — no cross-surface skew from the cap. Unreachable at FXAV scale (unique-constraint bound, D2); never silent, never corrupting.
- **Badge/page skew window.** The badge and page read at different instants; a hold approved between the two reads can skew the badge by one until the next badge refresh. Identical to the existing pending-streams skew; not new.
- **Digest timing.** A hold created and cleared entirely between two digest sends never appears in any digest. Intended (R2): the digest reports open holds at send time, not hold history.
- **Digest email length.** With the D8 uncapped model, a pathological item flood is bounded by the TEMPLATE's `DIGEST_MAX_SHOWS` slice with its honest overflow line (`lib/notify/templates/digest.ts:151`) — the bound moved from a silent model-layer slice to a visible template-layer one.

## 11. Completeness matrix (tier × layer)

Single domain (identity holds); every layer accounted:

| Layer                                | Action                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Table DDL / CHECKs / RLS / grants    | N/A — untouched; the feature reads the existing table under the existing service-role-only posture (R5).                       |
| RPC read/write (`mi11_*` gate RPCs)  | N/A — untouched; approve/reject stay on the per-show surface (R4).                                                             |
| PostgREST read (service-role)        | NEW `loadOpenIdentityHolds` (§4), consumed by both admin helpers (D1).                                                          |
| Raw-SQL read (digest transport)      | NEW holds query with text casts (§8), same pure core.                                                                       |
| Cookie-client reads                  | Untouched (existing pending/alert legs).                                                                                        |
| Builder (pure)                       | `identityHolds` input + `identity_hold` variant + `identityHoldTotal` (§5).                                                     |
| UI                                   | Inbox card branch + `IdentityHoldDisclosure` island (§7); page/dashboard inherit via the shared component.                      |
| Badge                                | Count-helper holds leg via `loadOpenIdentityHolds` (§6).                                                                        |
| Email                                | Digest model (D8 cap, D9 `sourceTotals.holdShows`); template unchanged (its slice already honest).                              |
| Durable telemetry                    | `sourceTotals` persisted at `lib/notify/deliver.ts:711` gains `holdShows` (additive).                                           |
| Tests / registries                   | §9 rows 1–12 + e2e + the two registry touches.                                                                                   |

## 12. Implementation shape (for writing-plans)

<!-- spec-lint: ignore — names the planned new files lib/admin/identityHolds.ts and components/admin/IdentityHoldDisclosure.tsx -->

Single milestone, one branch (`feat/needs-attention-holds-rollup`), ~3 phases: (1) `lib/admin/identityHolds.ts` (pure grouping + reader) + builder variant + infra-contract/bounded-reads registry tests; (2) count helper + inbox card + `IdentityHoldDisclosure` island + component tests; (3) digest + e2e + impeccable dual gate (invariant 8 — UI surface) + whole-diff review. UI throughout → Opus implements (routing rule); per the owner's 2026-08-03 instruction the implementation + closeouts run in a NEW Opus pane dispatched after plan approval, with this session's pipeline marker handed over per the AGENTS.md takeover protocol. Codex adversarial review per phase artifact (spec, plan) and whole-diff before merge; real CI green; merge.

## 13. Deferred

- Inline approve/reject in the rollup ("Reveal B") — declined R4; re-open only on an explicit owner request.
- Hold history / acknowledged states — declined R2.
- Digest per-hold detail beyond the shared item copy (the generated summaries already carry old/new values; richer per-hold email layout is not requested).
