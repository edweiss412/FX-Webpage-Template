# Surface the Transport "Load Out" secondary transporter — Design

**Status:** draft → Codex adversarial-review (Stage 1 of an autonomous ship-feature run; user spec-review WAIVED).
**Origin:** the one genuinely-hidden datum found by the deferred-block recon after PR #206. `parseV4Transport` currently **skips** the `Load Out:` contact row (`lib/parser/blocks/transport.ts:264`), so the secondary transporter (name/phone/email) reaches no surface. Everything else the recon examined was already surfaced, intentionally suppressed, or zero-signal (transport/hotels/crew/rooms/ops).

---

## 1. Goal & scope

Capture the `Load Out:` secondary-transporter contact and render it on the two transport surfaces the primary driver already uses:

- **Crew** — a "Load out" row in the "Getting there" card (`components/crew/sections/TravelSection.tsx`).
- **Operator (Step-3 review modal)** — three rows in `TransportBreakdown` (`components/admin/wizard/Step3SheetCard.tsx`).

Because the crew surface reads from the DB (not `ParseResult`), the three fields must be **persisted** → a DB migration is in scope. Both render surfaces are UI → **invariant-8 impeccable dual-gate applies**.

### Non-goals (explicit, do-not-relitigate)
- **No dedup** against the primary driver or crew roster (§7). The contact answers a distinct operational question; suppressing it on name-match is a UX-not-security rabbit hole (`namesRefer`, #133/#142) not worth a cheap render.
- **v2/v1 transport unchanged.** The `Load Out:` label + the `:264` skip live only in `parseV4Transport`; v2/v1 have no load-out concept. `loadout_* = null` in their return objects.
- **`isEmptyTransport` unchanged** (`transport.ts:146-158`). A load-out-only transport row keeps its current empty semantics (the `emitEmptySection` contract is not touched).
- **No new `UNKNOWN_FIELD` / warning.** This is a model+render change, not the #206 unknown-label pattern.

---

## 2. Data model

### 2.1 Parser type — `lib/parser/types.ts:186-196` (`TransportationRow`)
Add three flat optional fields, mirroring the existing driver trio exactly (order: after `driver_email`):

```ts
loadout_name: string | null;
loadout_phone: string | null;
loadout_email: string | null; // canonicalized per §4.1.1, mirror of driver_email
```

Rationale for flat fields on `TransportationRow` (not a `secondary_contacts[]` array): the `public.transportation` table is 1:1 with the show (`show_id … unique`, `20260501000000_initial_public_schema.sql:89`), and there is exactly one `Load Out:` row per sheet (§6, corpus-grounded). An array is YAGNI. Multiple-row handling → §5 first-wins.

`ShowForViewer.transportation` is typed as `TransportationRow | null` directly (`lib/data/getShowForViewer.ts:143`), so the three fields flow to the crew viewer type automatically — no separate viewer type to extend.

### 2.2 DB migration (NEW file, one migration, three surfaces)
Model on the existing `driver_email` column + CHECK (`20260501000000_initial_public_schema.sql:90-101`).

New file `supabase/migrations/2026063000XXXX_transportation_loadout_contact.sql`:
```sql
alter table public.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table public.transportation
  drop constraint if exists transportation_loadout_email_canonical;
alter table public.transportation
  add constraint transportation_loadout_email_canonical check (
    loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
  );

alter table dev.transportation
  add column if not exists loadout_name text,
  add column if not exists loadout_phone text,
  add column if not exists loadout_email text;
alter table dev.transportation
  drop constraint if exists transportation_loadout_email_canonical;
alter table dev.transportation
  add constraint transportation_loadout_email_canonical check (
    loadout_email is null or (loadout_email = lower(trim(loadout_email)) and loadout_email <> '')
  );
```
- **Idempotent (apply-twice safe):** `add column if not exists` + `drop constraint if exists`/`add` (per AGENTS.md CHECK/enum migration matrix). The dev clone mirrors the public table (`20260502000000_dev_schema_clone.sql:142-156`).
- **CHECK body is byte-identical in shape to `driver_email`** — the email-canonicalization audit (`lib/audit/emailCanonicalization.ts:161`) auto-parses any `constraint <table>_<col>_email_canonical check (...)` and validates the body via `checkBodyIsCanonical` (`emailCanonicalization.ts:170-175`: requires `col = lower(trim(col))` AND `col <> ''`). Mirroring the driver form makes it pass with **no spec §17.2 / EMAIL_BOUNDARIES prose change** (the audit is CHECK-body-canonical validation, one-directional — it does NOT require a boundary-prose entry, and does NOT require an email column to have a CHECK).

### 2.3 Email-audit registration (so the audit VALIDATES the new CHECK)
`auditEmailSchemaCheckSources` only scans the three files in `defaultSchemaCheckSources()` (`emailCanonicalization.ts:71-77`). Add the new migration path to that list so the new CHECK is scanned and confirmed canonical (belt-and-suspenders; without it the CHECK is simply unscanned, not a failure). This is the ONLY email-audit code change; no spec prose, no `EMAIL_BOUNDARIES` regen (the generated file is spec-derived and stays byte-identical).

### 2.4 schema-manifest + validation parity
- Regenerate `supabase/__generated__/schema-manifest.json` (`transportation` array, `:381-392`) via `pnpm gen:schema-manifest` — adds `loadout_email/loadout_name/loadout_phone` (alphabetical) and commit it. Layer-1 of the `validation-schema-parity` gate (`tests/db/validation-schema-parity.test.ts`) fails if this is skipped.
- Apply the migration **surgically to the validation project** (`TEST_DATABASE_URL` in main `.env.local`, per `feedback_validation_creds_in_main_env_local`): `psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` + `notify pgrst, 'reload schema';`. Layer-2 of the gate fails if this is skipped.

---

## 3. Parser change — `lib/parser/blocks/transport.ts`

At the skip site (`:263-264`), replace the bare `continue` with a capture (still `continue` after — a load-out is a **contact**, not a schedule leg). `cells` is in scope (`col0 = clean(cells[0])`, `:230`); the load-out row's cell layout is identical to the driver body-row (`:200-202`): `cells[1]`=name, `cells[2]`=phone, `cells[3]`=email.

```ts
// Load-out secondary transporter (col0 like "Load Out:"). Capture name/phone/email
// mirroring the driver body-row read; canonicalize the email at this parser boundary
// (AGENTS.md invariant 3). It is a contact, not a schedule leg — continue after.
if (/^load\s+out\s*:/i.test(col0)) {
  if (loadoutName === null && loadoutPhone === null && loadoutEmail === null) {
    loadoutName = presence(clean(cells[1] ?? ""));
    loadoutPhone = presence(clean(cells[2] ?? ""));
    loadoutEmail = canonicalize(clean(cells[3] ?? ""));
  }
  continue;
}
```

- **Vars:** declare `let loadoutName/loadoutPhone/loadoutEmail: string | null = null;` alongside the driver vars (`:189-191`).
- **Email boundary:** `canonicalize` (`lib/email/canonicalize.ts:2`) trims + lowercases, empty → `null` — the identical treatment applied to `driver_email` at `:194` / `:202`.
- **Returns:** add the three fields to the **v4** return (`:294-297`, the captured vars) and to the **v2** (`:405-408`) and **v1** (`:496-499`) returns as `loadout_*: null` so the type stays total.
- **First-wins guard** (`loadoutName === null && …`): matches the driver body-row `break`-on-first idiom (`:203`). A second `Load Out:` row does not overwrite. See §5.

---

## 4. Write-path completeness matrix

Every layer must move together (a persisted field that skips any layer is a zombie or a silent drop).

| Layer | File:line | Change |
|---|---|---|
| Parser type | `lib/parser/types.ts:186-196` | +3 fields |
| Parser capture | `lib/parser/blocks/transport.ts:264` | skip → capture (v4); v2/v1 returns +`loadout_*:null` |
| DDL (public + dev) | new migration + `dev_schema_clone` shape parity | +3 columns + CHECK |
| Manifest | `supabase/__generated__/schema-manifest.json:381-392` | regen (`pnpm gen:schema-manifest`) |
| Validation project | surgical `psql` apply | +3 columns + CHECK live |
| Email audit | `lib/audit/emailCanonicalization.ts:71-77` | add migration to `defaultSchemaCheckSources()` |
| Cron write | `lib/sync/runScheduledCronSync.ts:1360-1384` (`replaceTransportation`) | INSERT +3 cols; `canonicalize(row.loadout_email)` mirroring `:1375` |
| Cron read-back | `runScheduledCronSync.ts:563-572` | add `loadout_name, loadout_phone, loadout_email` to the change-detection SELECT |
| Seed | `supabase/seed.ts:390-414` | INSERT +3 cols via `sqlNullableString(transportation.loadout_*)` |
| Projection | `lib/data/getShowForViewer.ts:507-509` | +3 `?? null` projections (`.select("*")` already returns the columns) |
| Render — crew | `components/crew/sections/TravelSection.tsx` | §6a |
| Render — modal | `components/admin/wizard/Step3SheetCard.tsx:323-333` | §6b |

**Cron read-back note:** the change-detection SELECT (`:565-567`) is an explicit column list; omitting the new columns there means an operator editing only the load-out contact would produce a false "no change" and the update would be skipped. It MUST include the three columns.

### 4.1 Type-literal shape sweep (required-nullable → every full literal breaks)
The three fields are **required-nullable** (`loadout_*: string | null`), matching the `driver_email: string | null` style — NOT optional. This is the consistent choice (a `loadout_email?:` next to `driver_email: string | null` would read as inconsistent and reintroduce the absent-vs-`undefined` ambiguity in `feedback_optional_field_exactoptional_and_shape_sweep`). Consequence: **every full `TransportationRow` literal must add the three fields (`loadout_*: null`) or typecheck fails.** ~18 test files construct such literals; several go through a local factory (`tests/visibility/scopeTiles.test.ts:151/252`, `tests/parser/blocks/scheduleBookends.test.ts:153`, `tests/components/crew/sections/{TodaySection,ScheduleSection}.bookends.test.tsx`) — one edit each; the rest are inline literals. `tests/parser/blocks/transport.test.ts` uses field-by-field assertions (not a full literal) so it does not break. **Process:** `pnpm typecheck` pinpoints every site; fix each; then run the **FULL** vitest suite (a full-object `toEqual` on a projected/parsed transportation will now include the three fields). This is a dedicated plan task done before the render tasks.

---

## 5. Guard conditions (every input state)

| Condition | Parser | Crew render | Modal render |
|---|---|---|---|
| **full** name/phone/email | all three set | Load-out `TravelRow`: name primary, `phone · email` meta | 3 rows |
| **name-only** (exporter-xlsx corpus case, `fintech.md:63`) | phone/email → `null` | Load-out row: name primary, no meta | 1 row ("Load out") |
| **missing phone** | phone `null` | email promotes to meta via the filter cascade | rows for present fields |
| **missing email** | `canonicalize("")` → `null` | filtered | — |
| **sentinel** (`TBD`/`N/A`) | stored raw (`presence` keeps non-empty; `canonicalize` lowercases but does not sentinel-strip) | `shouldHideGenericOptional` reflows it out | shown **as-parsed** (crew-hides-vs-modal-shows asymmetry — documented, do not "fix") |
| **no load-out row** | all three `null` (init) | `hasLoadout` false → nothing renders | `contentRows` drops empties → nothing |
| **multiple `Load Out:` rows** | first-wins (§3 guard) | first only | first only |

---

## 6. Render

### 6a. Crew — `components/crew/sections/TravelSection.tsx`
In the read block (`:174-184`), read the three fields through `shouldHideGenericOptional` (mirrors the driver reads exactly); this is auto-covered by `_metaSentinelHidingContract` which walks `components/crew/sections/` (meta-test — §8). Build the same promote-first-survivor cascade as the driver (`:236-239`):
```ts
const loadoutFields = [loadoutName, loadoutPhone, loadoutEmail].filter(Boolean) as string[];
const hasLoadout = loadoutFields.length > 0;
const loadoutPrimary = loadoutFields[0] ?? null;
const loadoutMetaLines = loadoutFields.slice(1);
```
Render a second `<TravelRow mode="ground" label="Load out" …>` **immediately after the Driver `TravelRow`** (`:319-330`, inside the "Getting there" `SectionCard`'s `<div className="flex flex-col">`), gated `hasLoadout && loadoutPrimary`, `meta` = `loadoutMetaLines.join(" · ")` in a `tabular-nums` span (identical to the driver's meta JSX). Add `hasLoadout` to the `hasGettingThere` OR-chain (`:250-251`) so a load-out-only transport still renders the card.

**Visibility:** the whole block is already behind `transportTileVisible` (`:164-169`); the load-out is transport PII and correctly inherits the same gate — **no separate visibility path**.

**Guard (render nothing when absent):** `hasLoadout` false → no row emitted → no DOM.

**Dimensional invariants:** `TravelRow` is a flush single-column list item in a `flex flex-col` stack (`:318`); it is NOT inside a fixed-height parent, and it sizes to its own content exactly like the sibling Driver/Vehicle rows. No new parent→child dimension relationship is introduced (the new row is a structural clone of the existing Driver row). A real-browser Playwright assertion is therefore **not required** by the layout-dimensions rule (no fixed-dimension parent); the existing TravelSection layout is unchanged.

**Transition inventory:** the load-out row has exactly two states — present (renders) / absent (no DOM). There is no mode toggle, no animation, no conditional-visibility transition beyond mount/unmount, which is instant (no `AnimatePresence` in this card). **Instant — no animation needed.**

### 6b. Modal — `components/admin/wizard/Step3SheetCard.tsx` `TransportBreakdown` (`:314-333`)
Append three entries to the existing `contentRows([...])` after the driver rows (`:324-326`):
```ts
["Load out", t.loadout_name],
["Load out phone", t.loadout_phone],
["Load out email", t.loadout_email],
```
`contentRows()` (`:112`) already drops empty/nullish values, so absent fields render nothing and the section `count` (`:347`) auto-updates. The modal shows fields **as-parsed** (no `shouldHideGenericOptional`) — the documented, tested crew-hides-vs-modal-shows asymmetry (do not "fix").

---

## 7. Dedup decision — render, do NOT dedup

In the corpus the driver (Tracy Edwards), load-out (Carlos Pineda), and crew (John Carleo / Eric Weiss / Calvin Saller) are disjoint (`fintech.md:20-26`). Even when the same person is both driver and load-out, that is a true data condition worth showing, not a bug to hide. Cost of not-dedup: at most a repeated name across the Driver and Load-out rows — honest and acceptable. Dedup would require `namesRefer` (surname-fragile, UX-not-security) — out of scope.

---

## 8. Flag lifecycle & meta-test inventory

### Flag lifecycle (the 3 new fields)
| Field | Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|---|
| `loadout_name` | `transportation.loadout_name text` | parser `:264` → cron INSERT `:1365` / seed `:404` | projection `:507` → crew TravelRow; modal `t.loadout_name` | "Load out" contact name |
| `loadout_phone` | `…loadout_phone text` | same | projection → crew meta; modal | phone (meta / modal row) |
| `loadout_email` | `…loadout_email text` + CHECK | same, `canonicalize` at parser + cron write | projection → crew meta; modal | email (meta / modal row) |
No zombie columns: every field is written by the parser and reaches both render surfaces.

### Meta-tests this milestone touches
- **`tests/components/tiles/_metaSentinelHidingContract.test.ts`** — auto-covers the new crew reads (it walks `components/crew/sections/`); the load-out reads MUST route through `shouldHideGenericOptional` (they do, §6a). No registry row edit needed; the structural walk picks them up.
- **`validation-schema-parity`** (`tests/db/validation-schema-parity.test.ts`) — the new columns must reach the manifest (Layer 1) and the validation project (Layer 2). §2.4.
- **`x5-email-canonicalization`** (`tests/cross-cutting/email-canonicalization.test.ts`) — the new CHECK is validated once the migration is added to `defaultSchemaCheckSources()` (§2.3); `EMAIL_BOUNDARIES` is unchanged so boundary-parity holds.
- **No advisory-lock surface** touched (no `pg_advisory*` in the changed paths) — declared per AGENTS.md.

---

## 9. CI surface impacts

- **screenshots-drift.** `supabase/seed.ts` loads all `fixtures/shows/raw/*.md`, and the seeded fintech show (`2026-05-fintech-forum-cto-summit.md`) has a full load-out contact → the seeded crew "Getting there" card now renders a "Load out" row. If the fintech crew travel route is in the screenshot manifest, the WebP baseline changes. **Regenerate the affected baseline(s) from the CI pinned-amd64 artifact, never from the local arm64 host** (`feedback_screenshot_capture_runner_bimodality`; `feedback_byte_comparison_ci_gates_pin_capture_environment`). If the fintech crew route is NOT in the manifest, no drift — verify during the plan.
- **validation-schema-parity, x5-email-canonicalization, x-audits** — covered by §2.3/§2.4/§8.
- **`gen:*` prehooks** — `pretypecheck`/`prebuild` run `gen:email-boundaries`; since `EMAIL_BOUNDARIES` is unchanged, the generated file stays byte-identical (no drift).

---

## 10. Test plan (TDD per task)

1. **Parser (`tests/parser/blocks/transport.test.ts`)** — v4 markdown with a `Load Out: | Carlos Pineda | 610-618-0111 | carlosmpdal@gmail.com |` row → `loadout_name/phone/email` captured (email canonicalized: assert lowercased); the driver (from the slash header) is unaffected; a **name-only** load-out row (`| Load Out: | Carlos Pineda | | |`) → name set, phone/email `null`; **no** load-out row → all three `null`; **two** `Load Out:` rows → first-wins; v2/v1 returns carry `loadout_*: null`. Failure mode caught: the `:264` skip silently dropping the contact.
2. **Projection (`tests/data/getShowForViewer*.test.ts` or the transportation projection test)** — a DB row with `loadout_*` set projects the three fields onto `ShowForViewer.transportation`.
3. **Cron round-trip (existing `runScheduledCronSync` test surface)** — `replaceTransportation` persists the three columns (email canonicalized at the write boundary); the change-detection read-back SELECT returns them (so a load-out-only edit is not a false "no change").
4. **Crew render (`tests/components/crew/sections/TravelSection.test.tsx`)** — full contact → a "Load out" `TravelRow` with name primary + `phone · email` meta; name-only → row with no meta; sentinel email → hidden; absent → no "Load out" row in the DOM. Anti-tautology: assert on the load-out row's own `data`/label scoped away from the Driver row (clone-and-remove the Driver row before scanning, or query by the "Load out" label), and derive expected meta from the fixture, not a hardcode.
5. **Modal render (`tests/components/admin/wizard/Step3Review.test.tsx`)** — `TransportBreakdown` renders "Load out"/"Load out phone"/"Load out email" as-parsed; absent fields omitted; `count` reflects the added rows.
6. **Email boundary (`x5`)** — after adding the migration to `defaultSchemaCheckSources()`, `email-canonicalization.test.ts` stays green (new CHECK parsed + canonical; `EMAIL_BOUNDARIES` unchanged).
7. **Migration parity** — local apply + manifest regen + validation apply; `validation-schema-parity` green.

---

## 11. Resolved decisions (do-not-relitigate for the reviewer)

1. **DB migration IS required** — `transportation` is a normalized per-column table (`20260501000000_initial_public_schema.sql:87-101`), not JSONB; crew renders from the DB projection, so persistence is mandatory. Verified.
2. **No spec §17.2 / `EMAIL_BOUNDARIES` edit** — the email-schema-check audit validates CHECK **bodies** are canonical (`auditEmailSchemaCheckSources`, `emailCanonicalization.ts:176-184`), one-directional; a canonical CHECK mirroring `driver_email` passes without a boundary-prose entry, and the audit does not require an email column to carry a CHECK. Verified `emailCanonicalization.ts:161-184`.
3. **Capture only in `parseV4Transport`** — the `Load Out:` label + `:264` skip exist only there; v2/v1 get `loadout_*: null`. Verified.
4. **No dedup** (§7); **`isEmptyTransport` unchanged**; **first-wins on multiples**; **crew-hides-vs-modal-shows asymmetry preserved** (§1 non-goals + §5).
5. **UI dual-gate required** — `TravelSection.tsx` + `Step3SheetCard.tsx` are UI (invariant 8): `/impeccable critique` + `/impeccable audit` on the diff before the Codex whole-diff review; findings fixed or `DEFERRED.md`'d.

---

## 12. Impeccable dual-gate (invariant 8)

Both render surfaces are UI. Before the close-out Codex review: run `/impeccable critique` AND `/impeccable audit` on the affected diff with the canonical v3 preflight (PRODUCT.md → DESIGN.md → register → preflight). HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`. Dispositions recorded in the PR description. The load-out row is a structural clone of the existing Driver row, so the visual surface area is small, but the gate still runs.
