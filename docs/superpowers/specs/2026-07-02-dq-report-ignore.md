# Spec — Report + Ignore actions for admin "Data quality" warnings

**Date:** 2026-07-02
**Slug:** `dq-report-ignore`
**Owner:** Opus / Claude Code (UI-owned surface; invariant-8 impeccable dual-gate applies)
**Status:** Draft → self-review → Codex adversarial review → implementation (autonomous ship; user-review gates waived)

---

## 1. Goal

The admin per-show "Data quality" panel (`app/admin/show/[slug]/page.tsx:755-824`) renders advisory parse warnings ("Unrecognized row in sheet", "Auto-corrected a misspelled stage word", …). Today each warning is read-only: a title, an optional gray row-label, a body, and an "Open in Sheet ↗" link. The `UNKNOWN_FIELD` copy literally tells the operator "If it's something you want handled, use Report; otherwise you can ignore this." — but neither a Report control nor an Ignore control exists.

Add two operator actions to each **operator-actionable** Data-quality card:

1. **Report** — a quiet control that opens the existing `ReportModal`, pre-filled with an auto-captured payload (the warning's `code`, `message`, `rawSnippet`, `sourceCell`, `blockRef`, and the show identity) so a dev can act on it. Reuses the existing report pipeline end-to-end; files a GitHub issue.
2. **Ignore / Un-ignore** — dismiss a warning into a collapsible **"Ignored (N)"** subsection at the bottom of the panel; reversible. Ignore state is **content-keyed** and **persists across re-syncs**: an unchanged recurring warning stays ignored; if the flagged content changes, the warning re-surfaces as active.

---

## 2. Resolved decisions (load-bearing; each cites live code)

| # | Decision | Rationale + citation |
|---|----------|----------------------|
| D1 | **Report reuses `ReportButton`→`ReportModal`→`/api/report`.** No new endpoint, no new payload field, no new catalog code. | `ReportAutocapture` already has `parseWarnings?: unknown[]` and `fieldRef?: unknown` (`components/shared/ReportModal.tsx:41-52`); admin failures already route through the catalog inside the modal. `showId` must be the show **UUID** (`show.id`), not slug (`app/api/report/route.ts:15,32-40` validates uuid-v4). |
| D2 | **Ignore state lives in a NEW `public.ignored_warnings` table** keyed `(show_id, fingerprint)`. It does **NOT** mutate `shows_internal.parse_warnings`. | `parse_warnings` is a jsonb array **full-replaced on every apply** (`lib/sync/applyParseResult.ts:190-198`), so any flag written onto a warning object is lost next sync. A separate side table consulted at read time is the only durable model (mirrors the `deferred_ingestions` "durable side-table consulted at scan time" idea, without reusing its whole-sheet grain). |
| D3 | **Fingerprint = `sha256Base64Url(utf8(`${code} ${normalizeSnippet(rawSnippet)}`))`.** Ignorable ⟺ `rawSnippet` is a non-empty string. | `ParseWarning` has **no `id`** (`lib/parser/types.ts:4-21`); content is the only stable key. Reuse `sha256Base64Url` (`lib/crypto/sha256.ts:1-5`); follow the join-then-hash idiom of `lib/notify/idempotencyKey.ts:1-7`. Of the codes reaching the panel, 12 carry `rawSnippet` and 9 do not (enumerated §5.3). |
| D4 | **Table archetype = Pattern A (admin_only RLS), mirroring `admin_alerts`/`reports`.** GRANT DML to anon/authenticated + `enable rls` + `create policy admin_only for all … using(is_admin()) with check(is_admin())`. **No REVOKE lockdown.** | `admin_alerts` (`supabase/migrations/20260501001000_internal_and_admin.sql:268-282` + `20260501002000_rls_policies.sql:147-153`) is the exact analogue: admin-only per-show side table, partial-unique index for dedup. Consequence: trips `admin-rls-runtime` baseline (§9). Must **NOT** be added to `RPC_GATED_TABLES` (that registry is bidirectional — an entry with no live REVOKE fails, `tests/db/postgrest-dml-lockdown.test.ts:813`). |
| D5 | **Write path = POST route handlers using raw `postgres()`, mirroring the alert-resolve route. No advisory lock.** | `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:76-134` writes an admin side-table via `postgres(databaseUrl(), {max:1,idle_timeout:1,prepare:false})` + `sql.begin`, with `requireAdminIdentity()` in try/catch, and takes **no** advisory lock. Our write touches only `ignored_warnings` (not the locked `shows_internal`/`shows`/sync-family set), so invariant-2 does not require a lock (§8.1). |
| D6 | **Failures render a plain human sentence — no §12.4 code.** | `UnignoreButton` (`components/admin/UnignoreButton.tsx:24-78`) renders a static `<p role="alert">That didn't go through. Try again in a moment.</p>` with no catalog code. Invariant 5 bans raw *codes* in the UI, not plain human copy. This sidesteps the entire 3-way catalog lockstep + `x1-catalog-parity`. |
| D7 | **No `logAdminOutcome` telemetry (v1).** | The two closest precedents — alert-resolve and sheet-unignore — emit none and are correctly absent from `AUDITABLE_MUTATIONS` (`tests/log/_metaAdminOutcomeContract.test.ts:13-57`). Ignoring an advisory warning does not mutate published show content. This was the user's explicit v1 scope decision. |
| D8 | **Scope = operator-actionable cards only.** The plain-text data-gap digest (`UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`) stays read-only in v1. | `readDataQuality` flattens the digest to `string[]` (`app/admin/show/[slug]/page.tsx:309-316`), dropping `code`/`rawSnippet` needed for both fingerprinting and autocapture; and `BLOCK_DISAPPEARED` has no `rawSnippet` so is not ignorable anyway. The user's screenshot warnings (`UNKNOWN_FIELD`×4, `STAGE_WORD_AUTOCORRECTED`) are all actionable cards. Deferred: DEFERRED.md entry to extend to the digest. |
| D9 | **Collapsible "Ignored (N)" = native `<details>/<summary>`, chevron-only transform, body appears instantly.** | Matches the two live `<details>` precedents — me-page "Past (N)" (`app/me/page.tsx:237-256`) and `HelpTooltip` — both animate only `group-open:rotate-90` and reveal the body instantly. The panel already declares "present/absent is instant, no animation" (`page.tsx:760`). No `max-height` animation in v1. |
| D10 | **`PerShowActionableWarnings` gains an optional `renderItemControls` render-prop.** Controls appear on the per-show admin panel; **absent** on the `StagedReviewCard` reuse. | The component is shared (`components/admin/StagedReviewCard.tsx:579`). Omitting the prop preserves current read-only behavior in staged review (no persisted show → no `show.id` to key an ignore on). |

---

## 3. Current architecture (grounding)

- **Render.** The panel is inline in the Server Component `app/admin/show/[slug]/page.tsx:755-824`. Heading + `HoverHelp` (`learnMore` → `/help/admin/parse-warnings`) at `:786-805`. Two groups: a flattened digest `<ul>` (`:806-818`, `li[data-testid=per-show-data-quality-item]`) and the actionable cards via `<PerShowActionableWarnings items driveFileId />` (`:822`).
- **Data.** `readDataQuality()` (`:269-317`) reads `shows_internal.parse_warnings` (jsonb `ParseWarning[]`) `.eq('show_id', show.id)`, returning `{ messages: string[]; actionable: ParseWarning[]; failed: boolean }`. `actionableItems = selectActionableForDisplay(dataQuality.actionable)` (`:327` → `lib/parser/dataGaps.ts:202-206`) filters to `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:122-142`) and dedups anchored warnings by `(code,gid,a1)` (`dataGaps.ts:152-170`).
- **Card.** `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx:20-78`) is a pure presentational Server Component: `items: ParseWarning[]; driveFileId: string|null`. Per item derives title = catalog `entry.title` ?? `w.message` ?? "Data quality issue"; row-label = `labelFromRawSnippet(w.rawSnippet)`; body = catalog `entry.helpfulContext`; link = `buildSheetDeepLink(driveFileId, w.sourceCell)`. Keyed `${w.code}-${i}`. Reused on `StagedReviewCard.tsx:579`.
- **Warning model.** `ParseWarning = { severity:'info'|'warn'; code:string; message:string; blockRef?:{kind;index?;iso?;name?}; rawSnippet?:string; sourceCell?:SourceAnchor|null }` (`lib/parser/types.ts:4-21`). No `id`, no `blocking`.
- **Report pipeline.** `ReportButton` (`components/shared/ReportButton.tsx:40-50`) → `ReportModal` (`components/shared/ReportModal.tsx`) → POST `/api/report` (`app/api/report/route.ts`) → `submitReport` (`lib/reports/submit.ts:942-1007`) → GitHub issue. Admin quota 10/hr (`lib/reports/rateLimit.ts:53-55`). Success copy is hardcoded in the modal; failures route through the catalog. `showId` is a uuid.
- **Admin-mutation precedents.** Alert-resolve route (raw `postgres()`, no lock) `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:76-134`; sheet-unignore route (advisory-locked because `deferred_ingestions` is sync-family) `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts:55-94`; `UnignoreButton` (plain-string error) and `PerShowAlertResolveButton` (`bg-bg` neutral button, discriminated-union state) are the two client-button templates. `requireAdminIdentity()` (`lib/auth/requireAdmin.ts:279`) returns `{ email }` canonicalized; throws `AdminInfraError` (`code:'ADMIN_SESSION_LOOKUP_FAILED'`) on infra fault.

---

## 4. Data model — `public.ignored_warnings`

### 4.1 DDL (new migration, `create table` + inline CHECK)

```sql
-- supabase/migrations/<ts>_ignored_warnings.sql  (DDL)
create table public.ignored_warnings (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  fingerprint text not null,
  code text not null,
  ignored_by text not null,
  ignored_at timestamptz not null default now(),
  constraint ignored_warnings_ignored_by_canonical
    check (ignored_by = lower(trim(ignored_by)) and ignored_by <> ''),
  constraint ignored_warnings_unique unique (show_id, fingerprint)
);
create index ignored_warnings_show_idx on public.ignored_warnings (show_id);
```

- `on delete cascade` — rows die with the show (mirrors `admin_alerts`, `crew_members`; unlike `reports` which retains). Chosen because an ignore is a per-show admin preference with no independent value once the show is gone.
- **No `raw_snippet` column (Codex R1 finding).** We do NOT persist raw cell content — some warnings' `rawSnippet` contains PII (e.g. `FIELD_UNREADABLE` carries an unparseable phone/email cell value; `crew.ts` role cells carry names), and the dormant-orphan policy (§5.2) would retain it indefinitely after `parse_warnings` is replaced. Only the one-way `fingerprint` (SHA-256) is stored. Ignored cards in the "Ignored (N)" subsection render from the **current** re-parsed warning (which still carries `rawSnippet`), so no stored copy is required. `code` (a non-PII `[A-Z_]+` enum) is retained for debugging/analytics.
- `ignored_by` = `canonicalize(admin.email)` (invariant 3); the CHECK mirrors `admin_alerts_resolved_by_email_canonical` (`supabase/migrations/20260520000911_add_email_canonical_checks.sql:35-40`).
- `(show_id, fingerprint)` UNIQUE is the idempotency target for `insert … on conflict do nothing`.

### 4.2 RLS + grants (separate migration, per repo convention)

```sql
-- supabase/migrations/<ts+1>_ignored_warnings_rls.sql  (RLS/grants; DDL/RLS split per repo convention)
grant select, insert, update, delete on table public.ignored_warnings to anon, authenticated;
grant all privileges on table public.ignored_warnings to service_role;
alter table public.ignored_warnings enable row level security;
create policy admin_only on public.ignored_warnings
  for all to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

Copied verbatim from `reports`/`admin_alerts` (`supabase/migrations/20260501002000_rls_policies.sql:75-81,147-153`). `is_admin()` defined at `rls_policies.sql:23-39`. This is Pattern A — the admin's cookie-bound authenticated session can read/write via PostgREST because `is_admin()` is true; non-admins are gated. (In practice writes go via superuser `postgres()` and reads via the RLS session client — see §6.)

### 4.2b Migration lifecycle notes

- **Brand-new objects, applied once per environment.** `create table` / `create policy` (plain, matching the `reports`/`admin_alerts` precedent) — the apply-twice DROP-IF-EXISTS/ADD idempotency rule targets *altering existing* constraints, not creating new tables. If a surgical re-apply to the validation project is needed mid-dev, drop the objects first.
- **Inline CHECK is the transitional-window form** (written in `create table`), so it must accept exactly the values the write path produces (canonical lowercased email) — it does. No enum/method migration matrix applies (no enum or CHECK on a mutable method column).
- **Tier × domain matrix:** N/A — this is not a pay/surcharge-domain change; there is no tier × surcharge-domain surface. The only DB object is a single admin-only side table.

### 4.3 Dev-schema shadow

If `to_regclass('dev.ignored_warnings')` requires a shadow mirror, follow the guarded-mirror pattern (`… if to_regclass('dev.X') is not null …`) as in `20260520000911`. **Verify at implementation time** whether `dev.*` mirrors are required for new tables (grep an existing new-table migration); if not required, omit. (Dev shadow is local-seed infra, not a deploy target — validation-schema-parity is public-only.)

---

## 5. Fingerprint + partition

### 5.1 Fingerprint utils — TWO modules (client-safe vs server-only)

**CRITICAL module boundary (Codex R1 finding):** `sha256Base64Url` imports `node:crypto` (`lib/crypto/sha256.ts:1`), which must never be pulled into a `"use client"` bundle. The client component (§7.1) only needs to know whether a warning *has an ignorable snippet* — a pure string check, no hashing. So the logic is split across two files; the client imports ONLY the client-safe one.

**Module A — client-safe (no `node:*` imports): `lib/dataQuality/ignorableSnippet.ts`**
```ts
import type { ParseWarning } from "@/lib/parser/types";

export function normalizeSnippet(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Pure string predicate — safe to import in a client component. */
export function hasIgnorableSnippet(w: Pick<ParseWarning, "rawSnippet">): boolean {
  return typeof w.rawSnippet === "string" && normalizeSnippet(w.rawSnippet).length > 0;
}
```

**Module B — server-only (imports `node:crypto`): `lib/dataQuality/warningFingerprint.ts`**
```ts
// SERVER-ONLY module — never import from a `"use client"` file. This pulls in
// node:crypto (via sha256Base64Url); a client import would break the client bundle.
// Enforced by the client-bundle-boundary meta-test (§9 / AC-13). We do NOT use the
// `server-only` npm package: it is not a dependency here and, being unaliased in
// vitest, would throw in the node test env for every test that transitively imports page.tsx.
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet, hasIgnorableSnippet } from "./ignorableSnippet";

/** Content-key for ignore state. Returns null when the warning is not ignorable. SERVER-ONLY. */
export function warningFingerprint(w: Pick<ParseWarning, "code" | "rawSnippet">): string | null {
  if (!hasIgnorableSnippet(w)) return null;
  const normalized = normalizeSnippet(w.rawSnippet as string);
  return sha256Base64Url(Buffer.from(`${w.code} ${normalized}`, "utf8"));
}
```

- Module B is server-only by convention + the **client-bundle-boundary meta-test** (§9 / AC-13), which asserts no `"use client"` file imports it. (We deliberately do NOT add the `server-only` npm package — it is not a dependency and, unaliased in vitest, would throw in the node test env for any test importing `page.tsx` transitively.) `warningFingerprint` is imported ONLY by `page.tsx` (server component: partition + surfaceId inputs) and the two POST routes (server).
- The client component (§7.1) uses `hasIgnorableSnippet` (Module A) to decide whether to render the Ignore button. It **never** computes the hash and never imports Module B.
- Normalization = trim + collapse internal whitespace runs to a single space. **No lowercasing** (case is content; a case edit re-surfaces, which is acceptable and predictable). A single-space delimiter separates `code` from the snippet; codes are `[A-Z_]+` with no spaces, so the join is uniquely splittable at the first space (no collision).
- The `code` is included in the hash input so different codes sharing a `rawSnippet` (e.g. `ROLE_TOKEN_AUTOCORRECTED` vs `UNKNOWN_ROLE_TOKEN` on the same role cell) get distinct fingerprints.
- **Granularity note:** multiple same-`code` warnings on identical content collapse to one fingerprint, so ignoring one ignores its identical-content siblings. This is acceptable v1 semantics and is already partly the case in display (anchored dedup by `(code,gid,a1)`, `dataGaps.ts:152-170`).
- Fingerprint is computed **server-side only**; clients never compute it — they send `{ code, rawSnippet }` and the server derives it (§6.2). The raw snippet is used transiently server-side to compute the one-way hash and is **not persisted** (§4.1, Codex R1 finding).

### 5.2 Partition (in `page.tsx`, after `Promise.all`)

New read helper `loadIgnoredWarnings(supabase, showId)` (§6.1) returns `Set<string>` of ignored fingerprints for the show. In the page:

```ts
const ignoredFps = ignoredResult.kind === "ok" ? ignoredResult.fingerprints : new Set<string>();
const activeActionable: ParseWarning[] = [];
const ignoredActionable: ParseWarning[] = [];
for (const w of actionableItems) {
  const fp = warningFingerprint(w);
  if (fp && ignoredFps.has(fp)) ignoredActionable.push(w);
  else activeActionable.push(w);
}
```

- `activeActionable` → the existing card list. `ignoredActionable` → the "Ignored (N)" subsection. `N = ignoredActionable.length`.
- A stored ignore whose warning is no longer emitted contributes nothing (dormant row; not counted in N). **v1 orphan policy: leave dormant** — harmless; if the warning recurs it stays ignored (desired). No GC. Documented in §11 + DEFERRED.md.
- If the `loadIgnoredWarnings` read **fails** (infra_error), treat as "no ignores" (`ignoredFps` empty) so every warning shows as active — fail toward *visible*, never hide a warning on a read fault. The panel's existing `failed` degraded state is unaffected (that's the `parse_warnings` read).

### 5.3 Ignorable-set enumeration (verified `rawSnippet` presence)

**Ignorable** (carry non-empty `rawSnippet`): `UNKNOWN_FIELD`, `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`*, `STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`, `COLUMN_HEADER_AUTOCORRECTED`, `SECTION_HEADER_AUTOCORRECTED`, `FIELD_LABEL_AUTOCORRECTED`, `UNKNOWN_ROLE_TOKEN`, `UNKNOWN_DAY_RESTRICTION`, `PULL_SHEET_PARSE_PARTIAL`, `PULL_SHEET_AMBIGUOUS_FORMAT`.
**Not ignorable** (no `rawSnippet`): `BLOCK_DISAPPEARED`, `SCHEDULE_TIME_UNPARSED`, `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE`, `AGENDA_GRID_MALFORMED`, `AGENDA_BLOCK_UNRESOLVED`, `AGENDA_DAY_AMBIGUOUS`, `AGENDA_DAY_TRUNCATED`, `AGENDA_DAY_EMPTIED`, `PULL_SHEET_UNKNOWN_VARIANT`.
*`UNKNOWN_SECTION_HEADER` is a **digest** code (out of scope per D8), so within the actionable set the ignorable rule is fully driven by `hasIgnorableSnippet(w)` — no hardcoded code list. (Sources: `lib/parser/warnings.ts`, `lib/parser/blocks/*.ts`, `lib/parser/blocks/agendaWarnings.ts:3-67`, `lib/parser/pull-sheet.ts`, `lib/sync/blockDisappearance.ts:79-84`.)

---

## 6. Server surfaces

### 6.1 Read: `lib/admin/loadIgnoredWarnings.ts`

Mirror `lib/admin/loadIgnoredSheets.ts:35-85` (Supabase server/RLS client, invariant-9 discipline):

```ts
export type LoadIgnoredWarningsResult =
  | { kind: "ok"; fingerprints: Set<string> }
  | { kind: "infra_error"; message: string };

export async function loadIgnoredWarnings(
  showId: string,
  opts?: { supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>> },
): Promise<LoadIgnoredWarningsResult> {
  let supabase = opts?.supabase;
  if (!supabase) {
    try { supabase = await createSupabaseServerClient(); }
    catch (err) {
      return { kind: "infra_error", message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  try {
    const { data, error } = await supabase
      .from("ignored_warnings").select("fingerprint").eq("show_id", showId);
    if (error) return { kind: "infra_error", message: `ignored_warnings query failed: ${error.message}` };
    return { kind: "ok", fingerprints: new Set((data ?? []).map((r) => r.fingerprint as string)) };
  } catch (err) {
    return { kind: "infra_error", message: `ignored_warnings query threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

- `infra_error` carries a **descriptive `message`** exactly as `loadIgnoredSheets` does (`lib/admin/loadIgnoredSheets.ts:29,48-73`) — the three distinct paths (construction-failed / query-failed / query-threw) each get their own message, which the `tests/admin/_metaInfraContract.test.ts` contract expects (`:29` header + `:227-231` `loadIgnoredSheets` row uses a table-specific "threw" message).
- Every Supabase await destructures `{ data, error }`; construction-throw, query-throw, and returned-error all resolve to `infra_error` (invariant 9). **Register in `tests/admin/_metaInfraContract.test.ts` `infraRegistry`** (§9), with a contract string of the form: "ignored_warnings read (show partition); client construction + .from() throw OR returned error → { kind:'infra_error' } (table-specific message)".
- Called in `page.tsx`'s existing `Promise.all` alongside `readDataQuality()`, keyed on `show.id`.

### 6.2 Write: two POST routes

`app/api/admin/show/[slug]/data-quality/ignore/route.ts` and `.../unignore/route.ts`. Both mirror the alert-resolve route (`resolve/route.ts:76-134`): DI seams (`requireAdminIdentity?`, `withTx?`), raw `postgres()`, **no advisory lock**.

**Request body (both):** `{ code: string; rawSnippet: string }`. Server recomputes `fingerprint = warningFingerprint({ code, rawSnippet })`.

**Ignore handler:**
1. `admin = await deps.requireAdminIdentity()` in try/catch → `ADMIN_SESSION_LOOKUP_FAILED`→`errorResponse(500, code)`, else `errorResponse(403, "ADMIN_FORBIDDEN")`.
2. Parse body; if `code`/`rawSnippet` missing/non-string, or `warningFingerprint(...)` is `null` (empty snippet ⇒ not ignorable), return `errorResponse(400, "BAD_REQUEST")`.
3. Resolve show by `slug` (SELECT `id` FROM shows WHERE slug); 404 `SHOW_NOT_FOUND` if absent.
4. `insert into ignored_warnings (show_id, fingerprint, code, ignored_by) values (…, canonicalize(admin.email)) on conflict (show_id, fingerprint) do nothing` → idempotent. The body's `rawSnippet` is used **only** to compute `fingerprint` server-side; it is never stored (§4.1 — PII).
5. `return NextResponse.json({ status: "ignored" })` (200).
6. Catch-all → `errorResponse(500, "DATA_QUALITY_INFRA_ERROR")` + `log.error`.

**Un-ignore handler:** identical auth/validate/resolve; `delete from ignored_warnings where show_id=$1 and fingerprint=$2` (idempotent no-op if absent); `{ status: "unignored" }`.

- Success/error bodies mirror resolve: `{ status }` on success; `{ ok:false, code }` on error. **Error codes are surfaced to the client only as HTTP status + a machine string the client maps to a plain sentence** (§7.3) — never rendered raw.
- `databaseUrl()` = `TEST_DATABASE_URL ?? DATABASE_URL ?? local` (as resolve route).
- **Register both routes in `lib/audit/trustDomains.ts`** with `chain:['requireAdmin']` (rows exist at `:39/:71/:142`).

---

## 7. UI surfaces (Opus-owned; impeccable dual-gate)

### 7.1 `DataQualityWarningControls` (new client component)

`components/admin/DataQualityWarningControls.tsx` (`"use client"`). Props:

```ts
type Props = {
  slug: string;
  showId: string;            // uuid (show.id)
  warning: ParseWarning;     // full (serializable) object → complete autocapture + fingerprint input
  driveFileId: string | null;
  mode: "active" | "ignored";
  reportSurfaceId: string;   // STABLE + unique per warning IDENTITY (built by page.tsx via buildReportSurfaceId, §7.2)
};
```

Internally: `const ignorable = hasIgnorableSnippet(warning)` (imported from the **client-safe** `lib/dataQuality/ignorableSnippet.ts` — NEVER the server-only fingerprint module, §5.1); POST bodies send `{ code: warning.code, rawSnippet: warning.rawSnippet ?? "" }`. Renders a controls row (`flex items-center gap-3`, `mt-1`) inside the warning card:

- **Report** — `<ReportButton surface="admin" variant="text" label="Report" showId={showId} surfaceId={reportSurfaceId} autocapture={{ parseWarnings:[warning], fieldRef:{ surface:"data-quality", code:warning.code, sourceCell:warning.sourceCell ?? null, blockRef:warning.blockRef ?? null }, rawSnippet: warning.rawSnippet ?? undefined, viewerVisibleSection:"data-quality" }} />`. Quiet text-link treatment (`variant="text"`), always shown. (`ReportButton` supports `variant:"text"|"accent"` + `label` overrides, `components/shared/ReportButton.tsx:40-50`.)
- **Ignore** (`mode==="active"` && `ignorable`) — neutral bordered button (`PerShowAlertResolveButton` treatment: `inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong hover:bg-surface-sunken disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg`). Label "Ignore"/"Ignoring…". POST `…/data-quality/ignore`. On `res.ok && json.status==="ignored"` → `router.refresh()`.
- **Un-ignore** (`mode==="ignored"`) — same neutral treatment, label "Un-ignore"/"Un-ignoring…". POST `…/data-quality/unignore`. `router.refresh()` on success.
- In-flight lock: single `useState` discriminated union `{ kind:"idle" } | { kind:"running" } | { kind:"error" }` (mirror `PerShowAlertResolveButton.tsx:38-91`). `disabled` while running. On failure set `error` and **re-enable**.
- `ring-offset-warning-bg` because the buttons sit on `bg-warning-bg` cards (the token exists for exactly this — `AccentButton` `ringOffset:'warning-bg'`).

### 7.2 Card integration via render-prop (D10) — ORDER-INDEPENDENT stable identity

Add to `PerShowActionableWarnings`:
```ts
renderItemControls?: (w: ParseWarning, i: number) => ReactNode;
```
Inside each `<li>`, after the "Open in Sheet" link: `{renderItemControls ? renderItemControls(w, i) : null}`. `StagedReviewCard.tsx:579` does **not** pass it (unchanged, read-only). `page.tsx` passes a closure returning `<DataQualityWarningControls mode="active" warning={w} … reportSurfaceId={buildReportSurfaceId(slug, w)} />`.

**Two identity requirements that INTERACT (Codex plan-R1 HIGH + spec-R1 HIGH):**
1. **Uniqueness** — two *distinguishable* cards must not share a `ReportModal` `surfaceId` (its sessionStorage draft + idempotency key are scoped by `surfaceId`, `ReportButton.tsx:21`), else drafts leak / the wrong report dedups.
2. **Stability across `router.refresh()`** — ignoring warning A shrinks the active list, so any *sibling* B must keep the SAME React key **and** the SAME `surfaceId`, or B's `<li>` (and the open `ReportButton` modal inside it) remounts and loses its draft. The spec's compound-transition guarantee (§7.6) requires this.

A **display-index-based** key/surfaceId satisfies (1) but VIOLATES (2) (index shifts on refresh). The fix is an **order-independent stable identity** derived from the warning's content + location, used for BOTH the React key and the surfaceId:

```ts
// lib/dataQuality/warningIdentity.ts  (client-safe: pure string, no node:*)
import { normalizeSnippet } from "./ignorableSnippet";
export type IdentityFields = Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet" | "blockRef">;
export function warningIdentityKey(w: IdentityFields): string {
  const cell = w.sourceCell ? `${w.sourceCell.gid}:${w.sourceCell.a1 ?? ""}` : "";
  const snippet = typeof w.rawSnippet === "string" ? normalizeSnippet(w.rawSnippet) : "";
  // blockRef distinguishes reportable-but-NOT-ignorable, no-content warnings
  // (AGENDA_*, BLOCK_DISAPPEARED carry no rawSnippet/sourceCell — only a blockRef).
  // It is stable within a session (from the persisted parse_warnings blob; router.refresh()
  // does not re-parse). NOTE: this is the REPORT/key identity — the IGNORE fingerprint (§5.1)
  // deliberately excludes location/blockRef so a moved row stays ignored.
  const br = w.blockRef ? `${w.blockRef.kind}:${w.blockRef.index ?? ""}:${w.blockRef.iso ?? ""}:${w.blockRef.name ?? ""}` : "";
  return `${w.code}|${cell}|${snippet}|${br}`;
}
/** Per-render UNIQUE React keys: identity + a within-render occurrence suffix for the rare
 *  perfect-duplicate case. Distinguishable items always get suffix 0, so removing a
 *  different-identity sibling never changes another item's key (stability). */
export function stableWarningKeys(items: readonly IdentityFields[]): string[] {
  const seen = new Map<string, number>();
  return items.map((w) => {
    const base = warningIdentityKey(w);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}
```
```ts
// buildReportSurfaceId — SERVER module (hashes the identity so no raw content lands in a DOM attr);
// lives in lib/dataQuality/warningFingerprint.ts (already server-only, imports sha256Base64Url).
export function buildReportSurfaceId(slug: string, w: IdentityFields): string {
  return `admin-dq-${slug}-${sha256Base64Url(Buffer.from(warningIdentityKey(w), "utf8"))}`;
}
```

- **`PerShowActionableWarnings` MUST key its `<li>`s with `stableWarningKeys(items)`** (not `${w.code}-${i}`), so an ignore-driven refresh does not remount surviving siblings. This is a change to the shared component; it is harmless on `StagedReviewCard` (which re-renders fully anyway).
- **`buildReportSurfaceId` omits the display index and the list.** A warning is in exactly one of {active, ignored} at a time, and its identity is order-independent, so the surfaceId is stable across a sibling ignore. Two *perfect-duplicate* cards (same code + content + null `sourceCell`) intentionally share a surfaceId — they are indistinguishable to the user and the ignore fingerprint already collapses them (ignoring one ignores both, so they never separate). The React key still disambiguates them via the occurrence suffix.
- The surfaceId is **separate from the ignore fingerprint** (different salt/shape); it is derived server-side and passed as an opaque string to the client (which never hashes).

### 7.3 Failure copy (plain sentence, D6)

`DataQualityWarningControls` `error` state renders, in a `role="alert"` warning box (`rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text`), a static human sentence:
- ignore: **"Couldn't ignore that warning. Refresh and try again."**
- un-ignore: **"Couldn't un-ignore that warning. Refresh and try again."**

No code, no `ErrorExplainer`. (Precedent: `UnignoreButton.tsx:24-78`.)

### 7.4 "Ignored (N)" collapsible subsection

Rendered by `page.tsx` (or a small `IgnoredWarningsSection` server component) **below** `<PerShowActionableWarnings>`, only when `N > 0`. Native `<details className="group">`:

```
<details data-testid="per-show-ignored-warnings" className="group">
  <summary data-testid="per-show-ignored-summary"
    className="cursor-pointer list-none text-xs font-semibold uppercase tracking-eyebrow text-text-subtle hover:text-text [&::-webkit-details-marker]:hidden">
    Ignored ({N}) <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-90">▸</span>
  </summary>
  <ul className="mt-3 flex flex-col gap-2">
    {/* each ignored warning: same card skin, muted, with Un-ignore + Report controls (mode="ignored") */}
  </ul>
</details>
```

- Collapsed by default. Marker-suppression string copied from `HelpTooltip`. Chevron transform only; body instant (D9).
- Ignored cards use a **muted** variant of the warning skin (e.g. `opacity-75` or `bg-surface-sunken` instead of `bg-warning-bg`) so ignored ≠ active visually. Final treatment decided during the impeccable pass; must keep AA contrast and not rely on color alone (pair with the "Ignored (N)" label + placement).

### 7.5 Panel visibility (empty-state interaction)

The panel currently renders `null` when `messages.length===0 && actionableItems.length===0 && !failed` (`page.tsx:780`). New condition must also keep the panel alive when there are ignored warnings:

Render the panel when `failed || digestMessages.length>0 || activeActionable.length>0 || ignoredActionable.length>0`. When only `ignoredActionable` is non-empty (every active warning ignored), the panel shows the heading + help + the "Ignored (N)" `<details>` and nothing else. When `ignoredActionable.length===0`, no `<details>` renders (mirrors me-page "Past" hidden at 0).

### 7.6 Transition inventory + dimensional invariants

**Dimensional invariants:** N/A — every new element (controls row, `<details>` disclosure, ignored-card list) is normal document flow with no fixed-height/width parent constraining flex/grid children. No `items-stretch`/`h-full` relationships to pin, so no Playwright `getBoundingClientRect` layout-collapse assertion is required. (Stated explicitly per the project's dimensional-invariants rule.)

**Transition inventory** (visual states and their treatments):

| From → To | Trigger | Treatment |
|---|---|---|
| Button `idle → running` | click Ignore/Un-ignore | Instant: `disabled=true`, label swaps ("Ignore"→"Ignoring…"). No animation. |
| Button `running → (row moves)` | success + `router.refresh()` | Server re-render; the card leaves the active list and appears under "Ignored (N)" (or vice-versa). **Instant** — matches the panel's existing "present/absent is instant, no animation" (`page.tsx:760`); no crossfade/height-morph. |
| Button `running → error` | failure response | Instant: re-enable; render plain `role="alert"` sentence (§7.3). No animation. |
| Button `error → running` | retry click | Instant: clear error, disable. |
| `<details>` `collapsed ↔ expanded` | summary toggle | Chevron rotates via `transition-transform group-open:rotate-90` (a transform, DESIGN-compliant); disclosure **body appears instantly** (matches me-page Past + `HelpTooltip`; no `max-height` animation in v1 — D9). |
| Report modal `closed ↔ open` | Report click / dismiss | Owned by the existing `ReportModal` (bottom-sheet/dialog) — unchanged, not in scope. |

**Compound transitions:** clicking Ignore while a *different* warning's Report modal is open. `router.refresh()` re-renders the active list, which now shrinks by one. Because each `<li>` is keyed by `stableWarningKeys` (order-independent) and each `ReportButton`'s `surfaceId` is `buildReportSurfaceId` (order-independent), the surviving sibling B keeps its React key AND its `surfaceId` — so React does NOT remount B's `<li>`, and B's open modal + in-progress draft are preserved (§7.2). **This preservation is the reason index-based keys/surfaceIds are forbidden.** The transition-audit task (Task 14) MUST force a parent re-render with a shifted list (ignore an earlier sibling) and assert the later sibling's key + surfaceId are unchanged; an index-based implementation fails this test.

### 7.7 Flag lifecycle (the ignore "flag")

| Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|
| `public.ignored_warnings` row `(show_id, fingerprint)` | POST `…/data-quality/ignore` (insert on-conflict-do-nothing); POST `…/unignore` (delete) | `loadIgnoredWarnings(show.id)` → `Set<fingerprint>` → partition in `page.tsx` (§5.2) | Warning with a matching fingerprint moves from the active card list into the collapsed "Ignored (N)" subsection; excluded from the active count. Survives `parse_warnings` full-replace (D2). |

No zombie state: the flag is written, read, and applied on every render. A dormant row (warning no longer emitted) has no read match and no output effect (§5.2 orphan policy).

---

## 8. Security & invariants

### 8.1 Advisory lock — NOT required (invariant 2 reasoning)

The ignore write mutates **only** `public.ignored_warnings`, which is **not** in the advisory-locked set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`) and does **not** touch `shows_internal.parse_warnings` (owned by the locked sync). There is no read-modify-write race with the sync: the sync replaces `parse_warnings`; our table is independent and matched by fingerprint at render. Therefore no `pg_advisory*` lock is taken — mirroring the alert-resolve route, which also mutates an admin side-table without a lock. **Single-holder rule is satisfied vacuously (zero holders).** No change to `tests/auth/advisoryLockRpcDeadlock.test.ts`.

### 8.2 PostgREST DML posture

Pattern A (D4): DML GRANTed to anon/authenticated, gated by `admin_only` RLS. No REVOKE ⇒ **must not** appear in `RPC_GATED_TABLES` (`tests/db/postgrest-dml-lockdown.test.ts:135`). Writes in practice go via superuser `postgres()` (RLS-bypassing) inside the admin-gated route; RLS is the defense-in-depth for any direct PostgREST access.

### 8.3 Supabase call-boundary (invariant 9)

Only `loadIgnoredWarnings` touches a Supabase client (read). It destructures `{data,error}` and maps construction-throw / query-throw / returned-error → `infra_error`. Registered in `tests/admin/_metaInfraContract.test.ts` `infraRegistry`. The write routes use raw `postgres()` (not a Supabase client) — same as the resolve route, which carries no meta-registration.

### 8.4 No raw error codes (invariant 5)

The UI never renders a machine code. Ignore/un-ignore failures render plain sentences (§7.3). Report failures render through the existing `ReportModal` catalog path (unchanged).

### 8.5 Email canonicalization (invariant 3)

`ignored_by = canonicalize(admin.email)` at the write chokepoint; enforced by the `ignored_warnings_ignored_by_canonical` CHECK. No raw email enters the table.

---

## 9. Meta-test inventory (mandatory declaration)

| Meta-test / gate | Action |
|---|---|
| `tests/admin/_metaInfraContract.test.ts` `infraRegistry` | **ADD** a row for `lib/admin/loadIgnoredWarnings.ts` (new Supabase read helper). |
| `tests/db/admin-rls-runtime.test.ts` + `admin-rls-runtime.baseline.json` | **ADD** `"ignored_warnings"` to `class_a_tables`; **bump** `toHaveLength(18)`→`19` (Pattern A `admin_only FOR ALL` policy is auto-derived). |
| `tests/db/validation-schema-parity.test.ts` | Auto (no registry). Requires `pnpm gen:schema-manifest` + commit + surgical apply to validation project. |
| `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES` | **NO CHANGE** — must NOT add a row (no REVOKE; bidirectional test would flag an orphan). |
| `tests/log/_metaAdminOutcomeContract.test.ts` | **NO CHANGE** — no `logAdminOutcome` (D7). |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | **NO CHANGE** — no `pg_advisory*` (§8.1). |
| `tests/cross-cutting/codes.test.ts` (x1-catalog-parity) | **NO CHANGE** — no new §12.4 code (D6). |
| `lib/audit/trustDomains.ts` (+ its test if present) | **ADD** two `{ path, chain:['requireAdmin'] }` rows for the ignore/unignore routes. |
| New: `tests/db/ignored-warnings-schema.test.ts` | **CREATE** — structural test pinning columns/constraints/RLS of the new table (mirror any existing `*-schema.test.ts`); MUST assert there is **no `raw_snippet` column**. |
| New: `tests/dataQuality/clientBundleBoundary.test.ts` (structural grep test) | **CREATE** — assert `components/admin/DataQualityWarningControls.tsx` (a `"use client"` file) imports `hasIgnorableSnippet` from `@/lib/dataQuality/ignorableSnippet` and does **NOT** import `@/lib/dataQuality/warningFingerprint`, `@/lib/crypto/sha256`, `node:crypto`, or `sha256`. Structurally pins the Codex-R1 client-bundle boundary so a later refactor can't re-introduce `node:crypto` into the client bundle. |

---

## 10. Guard conditions (per prop / input)

- `DataQualityWarningControls.rawSnippet === null` → Ignore control hidden; Report still shown.
- `rawSnippet` present but whitespace-only → `warningFingerprint` returns `null` → treated as non-ignorable (Ignore hidden). (Server also 400s if such a body is POSTed.)
- `showId` empty/missing → routes 404 `SHOW_NOT_FOUND` (slug resolve). Client always passes `show.id` (always a uuid, `page.tsx:78`).
- `driveFileId === null` → Report autocapture omits sheet link context; `buildSheetDeepLink` already returns `null` (unchanged).
- `code` present but not a known catalog code → title falls back to `w.message` (existing behavior, `PerShowActionableWarnings.tsx:31-36`); fingerprint still computes (code is opaque to the hash).
- `loadIgnoredWarnings` → `infra_error` → treat as empty ignore set (all warnings active; never hide on read fault).
- `N === 0` → no `<details>` rendered.
- All active + all ignored empty, not failed → panel `null` (unchanged).
- Duplicate ignore (same fingerprint) → `on conflict do nothing` (idempotent). Duplicate un-ignore (absent) → delete no-op (idempotent).

---

## 11. Out of scope (v1) / DEFERRED.md entries

- **Bulk "Ignore all N of this type"** — per-warning only in v1 (user decision).
- **Report/Ignore on the data-gap digest group** (`UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`) — requires widening `readDataQuality` to carry warning objects; `BLOCK_DISAPPEARED` remains non-ignorable (no `rawSnippet`). (D8)
- **Ignoring non-`rawSnippet` actionable codes** (`SCHEDULE_*`, `AGENDA_*`, `PULL_SHEET_UNKNOWN_VARIANT`) — no stable content key; not ignorable. These cards show Report only.
- **Orphaned-ignore GC** — dormant ignore rows (warning no longer emitted) are left in place (harmless; keeps recurrence ignored). No cleanup job in v1.
- **`logAdminOutcome` audit trail** for ignore/un-ignore — deferred (D7).
- **max-height expand animation** on the "Ignored (N)" disclosure — instant in v1 (D9).

---

## 12. Watchpoints (do-not-relitigate; for the adversarial reviewer)

- **Ignore does NOT mutate `shows_internal.parse_warnings`.** It is a separate `ignored_warnings` table matched by fingerprint at render (D2, §8.1). Any finding premised on "ignore writes a locked/RPC-gated column" is out of date — verify against §4/§6.
- **No advisory lock is correct**, not an omission — reasoned in §8.1; mirrors the alert-resolve route (`resolve/route.ts`, no lock).
- **Pattern A (admin_only RLS, no REVOKE) is deliberate**, precedented by `admin_alerts`/`reports`. Do not require `RPC_GATED_TABLES` registration (that registry is bidirectional and would fail on an orphan entry, `postgrest-dml-lockdown.test.ts:813`). The consequence — `admin-rls-runtime` baseline bump — IS handled (§9).
- **Plain-sentence failure copy (no §12.4 code) is sanctioned**, precedented by `UnignoreButton`. Invariant 5 bans raw *codes*, not human copy.
- **No `logAdminOutcome` is the v1 decision** (D7), consistent with the resolve/unignore precedents' absence from `AUDITABLE_MUTATIONS`.
- **Digest-group exclusion is a deliberate v1 boundary** (D8), with a DEFERRED entry — not an oversight.
- **AGENTS.md doc drift:** the x1 gate lives at `tests/cross-cutting/codes.test.ts` (not `tests/messages/codes.test.ts`). Not touched by this feature (no new code), but noted for accuracy.

---

## 13. Acceptance criteria (each states the concrete failure mode it catches)

- **AC-1 (fingerprint stability):** `warningFingerprint` returns the same value for two warnings with the same `code` and whitespace-differing `rawSnippet` ("`A  B`" vs "`A B`"), and a *different* value when the non-whitespace content differs. Catches: benign whitespace edits wrongly re-surfacing an ignore; and a genuinely changed row wrongly staying ignored. Derived from the normalization rule, not hardcoded hashes.
- **AC-2 (not-ignorable):** `warningFingerprint({code:'AGENDA_GRID_MALFORMED'})` (no `rawSnippet`) and `{code:'X', rawSnippet:'   '}` both return `null`; `hasIgnorableSnippet` false. Catches: rendering an Ignore button on a non-fingerprintable warning; server accepting an un-fingerprintable ignore.
- **AC-3 (persist across re-sync):** given an `ignored_warnings` row and a freshly-parsed `parse_warnings` array containing the same content, the render partition places that warning in `ignoredActionable` (not active). Catches: full-array replace defeating ignore (the core D2 risk). Test asserts against the partition function output, not the DOM container.
- **AC-4 (content change re-surfaces):** same row, `rawSnippet` edited → new fingerprint → warning appears in `activeActionable`. Catches: location-only keying masking a changed/new problem.
- **AC-5 (ignore route):** POST `…/ignore` with `{code, rawSnippet}` inserts one row (canonical `ignored_by`); a second identical POST is a no-op (idempotent); a non-admin gets 403 `ADMIN_FORBIDDEN`; an infra fault in `requireAdminIdentity` gets 500 `ADMIN_SESSION_LOOKUP_FAILED`; an empty-snippet body gets 400. Catches: duplicate rows, auth bypass, mis-mapped infra vs forbidden.
- **AC-6 (un-ignore route):** POST `…/unignore` deletes the row; absent-row POST is a 200 no-op. Catches: un-ignore failing to reverse; non-idempotent delete.
- **AC-7 (call-boundary):** `loadIgnoredWarnings` returns `infra_error` on client-construction throw, query throw, and returned `error`; the page treats `infra_error` as empty ignore set (warnings visible). Catches: hiding warnings on a DB read fault; silent swallow.
- **AC-8 (StagedReviewCard unaffected):** `PerShowActionableWarnings` without `renderItemControls` renders zero controls (no Report/Ignore) — asserted on the staged-review usage. Catches: leaking interactive controls onto the preview surface.
- **AC-9 (panel visibility):** with all active warnings ignored, the panel renders the heading + "Ignored (N)"; with N=0 and no active/failed, the panel renders nothing. Catches: an empty "Ignored (0)" disclosure resurrecting an otherwise-empty panel; the panel disappearing while ignores exist.
- **AC-10 (no-raw-code):** ignore-failure UI shows the plain sentence and never the string `DATA_QUALITY_INFRA_ERROR`/`ADMIN_FORBIDDEN`. Catches: invariant-5 regression.
- **AC-11 (schema/RLS):** `ignored_warnings` exists with the `(show_id,fingerprint)` unique, `on delete cascade`, `admin_only` RLS, email-canonical CHECK; manifest regenerated; validation project superset holds; and the table has **no `raw_snippet` column** (manifest lists exactly `[code, fingerprint, id, ignored_at, ignored_by, show_id]`). Catches: migration/validation drift (the silently-drifting class) + accidental PII persistence.
- **AC-12 (admin-rls baseline):** `admin-rls-runtime` derives 19 class-A tables including `ignored_warnings`; baseline + count updated. Catches: forgetting the Pattern-A lockstep.
- **AC-13 (client-bundle boundary):** the structural test asserts `DataQualityWarningControls.tsx` (and any other `"use client"` file that renders these controls) imports `hasIgnorableSnippet` from `@/lib/dataQuality/ignorableSnippet` and never imports `@/lib/dataQuality/warningFingerprint`, `@/lib/crypto/sha256`, `node:crypto`, or a bare `sha256`. Catches: re-introducing a `node:crypto` import into a `"use client"` bundle (Codex R1 CRITICAL) — a jsdom unit test would pass while the real client build breaks, so this is a source-grep structural assertion.
- **AC-14 (report surfaceId + key: stable AND unique):** (a) `buildReportSurfaceId` / `warningIdentityKey` return the **same** value for the same warning regardless of its position/index in the list (stability); (b) **distinct** values for warnings differing in `code`, `sourceCell`, or normalized `rawSnippet` (uniqueness for distinguishable cards); (c) `stableWarningKeys` returns per-render-unique keys and — critically — removing an earlier, different-identity item does NOT change a later item's key (the compound-transition property). Catches: (1) two cards sharing a `ReportModal` scope → leaked drafts/wrong-report dedup (spec-R1 HIGH); (2) an index-based key/surfaceId remounting a sibling and destroying its open Report modal on an ignore refresh (plan-R1 HIGH). Expected values derived from fixture identities, not hardcoded ids or indices.

---

## 14. CI touchpoints checklist (pre-merge)

1. New migration applied locally + tested (TDD).
2. `pnpm gen:schema-manifest` → commit `supabase/__generated__/schema-manifest.json`.
3. Apply both migrations surgically to the validation project (`supabase db query --linked` / `psql "$TEST_DATABASE_URL"`), then `notify pgrst, 'reload schema';`.
4. `admin-rls-runtime.baseline.json` + `toHaveLength(19)` updated in the same commit.
5. `tests/admin/_metaInfraContract.test.ts` `infraRegistry` row added.
6. `lib/audit/trustDomains.ts` rows for both routes.
7. Impeccable `/impeccable critique` **and** `/impeccable audit` on the UI diff; HIGH/CRITICAL fixed or DEFERRED.
8. Full test suite green locally, then **real CI green**.
