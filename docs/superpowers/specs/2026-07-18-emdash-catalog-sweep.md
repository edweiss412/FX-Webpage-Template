# EMDASH-1 — catalog-wide em-dash sweep (rendered fields)

**Date:** 2026-07-18
**Slug:** `2026-07-18-emdash-catalog-sweep`
**Arc:** ARC 1 of the DEFERRED alert-copy batch (mechanical; NO UI/impeccable gate — touches `lib/messages/**`, the master spec §12.4, and a test only; no `app/` or `components/` files).
**Closes:** DEFERRED.md `ALERT-COPY-EMDASH-1`.

---

## 1. Problem

`DESIGN.md §9` bans em dashes (`—`, U+2014) in **rendered** copy ("No em dashes. Use commas, colons, semicolons, periods, parentheses. Also not `--`."). Enforcement today is pinned only on notify-rendered strings (`tests/notify/templates.test.ts`, the `em-dash audit` describe block) and a handful of component exact-string tests. The message catalog (`lib/messages/catalog.ts`) carries **179** em dashes across its rendered-prose field values (authoritative runtime count — §2, §6.1); that subset is unaudited and violates §9.

## 2. Scope — rendered fields only

A catalog field is in scope iff its value is rendered in the UI. Confirmed rendered surfaces (live-code cited):

| Field | Rendered at | §12.4-coupled? | em dashes (catalog.ts) |
| --- | --- | --- | --- |
| `dougFacing` | admin Doug-facing alert copy (`safeDougFacingTemplate`, BellPanel, PerShowAlertSection) | **YES** | 47 |
| `helpfulContext` | expand/education copy (`components/messages/ErrorExplainer.tsx`, BellPanel expand, `HelpAffordance`) | **YES** | 69 |
| `crewFacing` | crew mobile page copy | **YES** | 4 |
| `followUp` | developer health-alert row body (`components/admin/telemetry/HealthAlertsPanel.tsx:81,111-113` renders `raw?.followUp` via `renderCatalogEmphasis`) | **YES** | 2 |
| `title` | alert titles (BellPanel `rowCopy`, `/help/errors` `<h3>`) | no | 5 |
| `longExplanation` | `/help/errors` `<p>` (`app/help/errors/page.tsx:93`) | no | 52 |
| `dougSummary` | app-health popover (`lib/admin/healthRollup.ts:96` `dougSummaryFor` → `AppHealthPopover.tsx:113` `line.text`) | no | 0 |

**In scope for the sweep: 179 occurrences** across those seven fields (`dougSummary` is 0 today — it carries no em dash — but is in the audit for fails-by-default completeness, so a future health-code addition can't smuggle one in).

### 2.1 Completeness — the rendered-prose field set is type-derived (not ad hoc)

Enumerated against the full `MessageCatalogEntry` type (`lib/messages/catalog.ts:1-40`, the complete `export type … = { … };` block) so the audit provably covers every rendered-prose field:

- **Rendered prose (audited, 7):** `dougFacing`, `crewFacing`, `followUp`, `helpfulContext`, `title`, `longExplanation`, `dougSummary`.
- **Not prose (excluded):** `code` (identifier), `helpHref` (URL — an em dash in a URL is a different bug class, not §9 rendered-prose; the 4 `helpHref` em-dash attributions in raw greps are trailing comments).
- **Enums (excluded, no free text):** `severity`, `adminSurface`, `audience`, `healthWeight`, `resolution`.

> Round-1 correction (Codex): `followUp` was initially scoped out as "never rendered." That was wrong — `HealthAlertsPanel` renders it (line 111-113), and two values carry em dashes (`ROLE_TOKEN_MAPPED`/`ALERT_BELL_FEED_FAILED`: `"none — informational"`, `"none — transient read failure"`). It is now in scope AND is a §12.4-coupled field (present in `SpecCodePayload`), so it rides the three-way lockstep. `HealthAlertsPanel` renders only `title`, `dougFacing`, and `followUp` — all now in scope, no further field missed.

**Explicitly OUT of scope:**
- `helpHref` (URLs) and file comments — not copy.
- `--` (double hyphen) SWEEP: there are 0 existing `--` in rendered-prose values (runtime-verified), so there is nothing to sweep. The widened audit (§6) DOES assert no `--` on the rendered-prose fields as a forward guard so the em-dash sweep cannot introduce one; that guard is green today. (This is not a scope expansion — no existing copy changes for `--`.)
- En dash (`–`, U+2013) and hyphen (`-`) — not banned, not touched.

## 3. §12.4 three-way lockstep (dougFacing, helpfulContext, crewFacing, followUp)

The x1-catalog-parity gate (`tests/cross-cutting/codes.test.ts:68-90`) deep-compares the runtime catalog against `SPEC_CODES` (generated from master spec §12.4) for **exactly** `dougFacing`, `crewFacing`, `followUp`, `helpfulContext`. So an em-dash edit to any of `dougFacing`/`helpfulContext`/`crewFacing`/`followUp` requires the ratified three-way lockstep landing in one commit:

1. **Master spec** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4:
   - `dougFacing`, `crewFacing`, `followUp` — the pipe-table cells (`| CODE | trigger | dougFacing | crewFacing | followUp |`). Note the `followUp` cell also uses whole-cell `—` as its null marker (§3.1 hazard) — only the two `followUp` strings that carry mid-text em dashes are edited.
   - `helpfulContext` — the appendix lines below the `<!-- §12.4 helpfulContext appendix` anchor (format `CODE: "text"`).
2. `pnpm gen:spec-codes` → regenerate `lib/messages/__generated__/spec-codes.ts`.
3. `lib/messages/catalog.ts` — the matching field value.

Never run Prettier on the master spec (repo rule).

### 3.1 HAZARD — `—` is the §12.4 table's null-cell marker

In the §12.4 pipe-table, a lone `—` in a cell is the **null** marker (e.g. `ADMIN_ALERT_NOT_FOUND` row line 2975: `crewFacing` cell = `—` → generator emits `crewFacing: null`). **Only em dashes embedded inside non-null copy text may be replaced. A whole-cell `—` null marker MUST NOT be touched** — converting it turns a `null` into a string and breaks x1 parity for that code.

Distinguish per cell:
- Cell content is a quoted/prose string containing `—` mid-sentence → in scope, replace.
- Cell content is exactly `—` (the whole cell) → null marker, leave.

### 3.2 Safety net

The regen + x1 parity is fail-loud per-code: after all edits, `pnpm gen:spec-codes` + `pnpm test:audit:x1-catalog-parity` will report `catalog <CODE>.<field> differs from §12.4` for any missed propagation OR any accidentally-corrupted null marker. Iterate to green before commit.

## 4. Catalog-only fields (title, longExplanation, dougSummary)

`title`, `longExplanation`, and `dougSummary` are NOT in `SpecCodePayload` (no x1 coupling — verified: `SpecCodePayload` = `{dougFacing, crewFacing, followUp, helpfulContext}`). Their em dashes are edited in `lib/messages/catalog.ts` **only** — no spec edit, no regen needed for these.

## 5. Replacement rules

Each `—` is replaced with the context-appropriate substitute per §9 (comma, colon, semicolon, period, or parentheses) preserving meaning and reading naturally. This is a per-occurrence judgment, not a blind global replace (a blind replace to a single character would read wrong in most sentences). Guidelines:
- Parenthetical aside (`… X — a newer parse — …`) → parentheses or commas.
- Appositive / restatement (`… stale — a newer parse has already been applied`) → colon or semicolon.
- Sentence-joining dash (`Hold on — your previous report …`) → period + capitalize, or comma.
- Title dashes (`Can't undo — this show is archived`) → colon (`Can't undo: this show is archived`).
- Never leave `--`, never introduce a new em dash.

## 6. Widened audit test (the deliverable that pins the class closed)

Add an em-dash assertion to `tests/messages/_metaCatalogCopyHygiene.test.ts` (the existing catalog copy-hygiene meta-test — natural home).

**The audited-field set MUST be derived from a compiler-exhaustive field-policy map, NOT a hard-coded list.** A literal `["dougFacing", …]` array only fails-by-default for new *values* in existing fields; a new *field* added to `MessageCatalogEntry` would be silently unaudited — recreating the exact class this spec closes. Instead:

```ts
type FieldPolicy = "rendered-prose" | "excluded-url" | "excluded-enum" | "excluded-identifier";
// Record<keyof MessageCatalogEntry, …> → adding a field to the type without
// classifying it here is a COMPILE ERROR (exhaustiveness enforced by tsc).
const FIELD_POLICY: Record<keyof MessageCatalogEntry, FieldPolicy> = {
  code: "excluded-identifier",
  severity: "excluded-enum", adminSurface: "excluded-enum", audience: "excluded-enum",
  healthWeight: "excluded-enum", resolution: "excluded-enum",
  helpHref: "excluded-url",
  dougFacing: "rendered-prose", crewFacing: "rendered-prose", followUp: "rendered-prose",
  helpfulContext: "rendered-prose", title: "rendered-prose", longExplanation: "rendered-prose",
  dougSummary: "rendered-prose",
};
const AUDITED_FIELDS = (Object.keys(FIELD_POLICY) as (keyof MessageCatalogEntry)[])
  .filter((f) => FIELD_POLICY[f] === "rendered-prose");
```

The audit walks every entry in the runtime `MESSAGE_CATALOG` and, for each field in `AUDITED_FIELDS`, asserts the value contains **neither `—` (U+2014) nor `--` (double hyphen)** — DESIGN.md §9 bans both, and the replacement rules (§5) forbid a `—`→`--` swap, so the guard covers both to stop a rushed replacement from trading one §9 violation for another. Both checks run on the same `AUDITED_FIELDS` set. (Current `--` count in rendered-prose values: **0** — the `--` assertion is green from the start and is a forward guard, not a sweep; see §7.) Because x1 already pins catalog↔spec for the four coupled fields (dougFacing, crewFacing, helpfulContext, followUp), an em-dash-free runtime catalog transitively guarantees §12.4 is em-dash-free on the coupled fields too (no separate spec-side audit needed).

- Exhaustiveness is **compiler-enforced**: `FIELD_POLICY` is typed `Record<keyof MessageCatalogEntry, FieldPolicy>`, so any future field added to the type fails `pnpm typecheck` until it is explicitly classified `rendered-prose` (audited) or one of the `excluded-*` values. This is the fails-by-default guarantee at the TYPE level, closing the class permanently — not just for new values, but for new fields.
- Current classification (7 rendered-prose + 7 excluded = 14 fields, the full `MessageCatalogEntry` surface) matches §2.1.
- Fail message names `CODE.field` + the offending value slice, matching the file's existing violation-report style.

### 6.1a Existing exact-copy test assertions break when catalog values change

Some tests hardcode catalog copy **substrings** and will fail the moment the swept value changes — this is implementation-blocking, not bookkeeping. The known ARC-1 breaker (grep-verified):

- **`tests/messages/fullSweepCopy.test.ts`** — the `dougFacingSubstring` fixtures at `:38` (`"No action needed — newer selections were left intact"`, code `PICKER_SELECTION_RACE`) and `:220` (`"is stuck — crew pages are still protected"`, code `PENDING_SNAPSHOT_DELETE_STUCK`). Both substrings live verbatim in a catalog `dougFacing` value, so sweeping the catalog breaks these assertions. Update each substring to the swept punctuation in the SAME commit.

**Discriminator — which em-dash test assertions are ARC-1 breakers vs. not** (grep-classified, so the implementer doesn't over-edit):
- **BREAKS (update):** any assertion whose expected string is a verbatim substring of a swept `catalog.ts` rendered-prose value. Confirmed: `fullSweepCopy.test.ts:38,220`.
- **Does NOT break (leave):** assertions of parser titles (`"Strike — GS"`), fixture show/sheet names (`"II — FinTech…"`, `"Validation — Normal day (R1)"`), `describeAlert` output, aria-labels (`"Notifications — 3 unseen"`), and `deriveMessageParams` role-change strings (`"+2 more — see show page."`, `"…changed — see the show page."` — these are `lib/adminAlerts/deriveMessageParams.ts:27,244`, i.e. ARC-2 territory, NOT `catalog.ts`). `not.toContain("—")` assertions (e.g. `RescanSheetButton`, `perShowAlertDataGaps`) stay green or validate the sweep.

**Catch-all: the full `pnpm test` run is authoritative.** Because a verbatim-substring enumeration can miss a test, the implementation MUST run the full suite after the sweep and update EVERY exact-copy assertion that breaks (each fails loudly with the old vs new string), landing those test edits in the sweep commit. `fullSweepCopy.test.ts` is the known set; anything else the full run surfaces is added.

### 6.1 Guard: the test must actually be RED before the fix; authoritative baseline count

TDD order — land the widened audit test FIRST and observe it fail on the current 179 occurrences (RED), then sweep to GREEN. This proves the test exercises the real catalog, not a tautology.

**Counts are from the runtime catalog, not a source-line grep.** A `grep -c '—'` on `catalog.ts` under- or mis-attributes multi-line string values and comment lines. The authoritative per-field inventory the implementer verifies against BEFORE and AFTER the sweep (expect 0 after) is produced by iterating the parsed `MESSAGE_CATALOG` object:

```ts
// pnpm exec tsx <script> — run from the worktree root
import { MESSAGE_CATALOG } from "./lib/messages/catalog";
const FIELDS = ["dougFacing","crewFacing","followUp","helpfulContext","title","longExplanation","dougSummary"] as const;
let total = 0; const per: Record<string, number> = {};
for (const e of Object.values(MESSAGE_CATALOG) as any[])
  for (const f of FIELDS) if (typeof e[f] === "string") { const n = (e[f].match(/—/g) || []).length; per[f] = (per[f] || 0) + n; total += n; }
console.log(per, "TOTAL", total); // baseline: dougFacing 47, helpfulContext 69, longExplanation 52, title 5, crewFacing 4, followUp 2, dougSummary 0 = 179
```

The widened audit test in §6 IS this same runtime-walk asserted to be 0, so the RED→GREEN transition and this command measure the identical surface.

## 7. Out of scope / non-goals

- Notify-template em-dash audit (`tests/notify/templates.test.ts`) — already exists; not modified.
- Any UI/component file — none touched (this is the ARC-1 boundary; ARC 2 owns BellPanel/PerShowAlertSection).
- `--` sweep, en-dash, `→` operator arrows in `followUp`.
- New §12.4 codes or copy changes beyond em-dash substitution.

## 8. Test plan

1. `test(messages)`: widen `_metaCatalogCopyHygiene.test.ts` to assert no `—` AND no `--` across the `AUDITED_FIELDS` set → RED on em dashes (179 failures); the `--` half is green from the start (0 today) and guards the sweep.
2. `fix(messages)`: sweep em dashes — catalog.ts (all seven rendered-prose fields; dougSummary 0 today) + master spec §12.4 (dougFacing/crewFacing/followUp cells + helpfulContext appendix) + `pnpm gen:spec-codes` + update existing exact-copy assertions that embed a swept value (known: `tests/messages/fullSweepCopy.test.ts:38,220`; plus any surfaced by the full run — §6.1a) → GREEN.
3. Gates that must stay green: `test:audit:x1-catalog-parity` (catalog↔§12.4), the new hygiene audit, `tests/notify/templates.test.ts`, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## 9. Files touched

- `lib/messages/catalog.ts` (edit — 179 substitutions across the 6 fields that carry em dashes: dougFacing 47, helpfulContext 69, longExplanation 52, title 5, crewFacing 4, followUp 2; dougSummary is audited but has 0)
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (edit — §12.4 table + appendix, coupled fields dougFacing/crewFacing/followUp/helpfulContext only)
- `lib/messages/__generated__/spec-codes.ts` (regenerated, committed)
- `tests/messages/_metaCatalogCopyHygiene.test.ts` (edit — add compiler-exhaustive rendered-field `—`/`--` audit)
- `tests/messages/fullSweepCopy.test.ts` (edit — update `dougFacingSubstring` fixtures :38, :220 to swept punctuation; §6.1a) + any other exact-copy assertion the full `pnpm test` run surfaces
- `DEFERRED.md` / `DEFERRED-archive.md` (move `ALERT-COPY-EMDASH-1` on completion)
