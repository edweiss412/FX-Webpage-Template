# EMDASH-1 — catalog-wide em-dash sweep (rendered fields)

**Date:** 2026-07-18
**Slug:** `2026-07-18-emdash-catalog-sweep`
**Arc:** ARC 1 of the DEFERRED alert-copy batch (mechanical; NO UI/impeccable gate — touches `lib/messages/**`, the master spec §12.4, and a test only; no `app/` or `components/` files).
**Closes:** DEFERRED.md `ALERT-COPY-EMDASH-1`.

---

## 1. Problem

`DESIGN.md §9` bans em dashes (`—`, U+2014) in **rendered** copy ("No em dashes. Use commas, colons, semicolons, periods, parentheses. Also not `--`."). Enforcement today is pinned only on notify-rendered strings (`tests/notify/templates.test.ts`, the `em-dash audit` describe block) and a handful of component exact-string tests. The message catalog (`lib/messages/catalog.ts`) carries **178** em dashes; the rendered-field subset is unaudited and violates §9.

## 2. Scope — rendered fields only

A catalog field is in scope iff its value is rendered in the UI. Confirmed rendered surfaces (live-code cited):

| Field | Rendered at | §12.4-coupled? | em dashes (catalog.ts) |
| --- | --- | --- | --- |
| `dougFacing` | admin Doug-facing alert copy (`safeDougFacingTemplate`, BellPanel, PerShowAlertSection) | **YES** | 45 |
| `helpfulContext` | expand/education copy (`components/messages/ErrorExplainer.tsx`, BellPanel expand, `HelpAffordance`) | **YES** | 65 |
| `crewFacing` | crew mobile page copy | **YES** | 4 |
| `followUp` | developer health-alert row body (`components/admin/telemetry/HealthAlertsPanel.tsx:81,111-113` renders `raw?.followUp` via `renderCatalogEmphasis`) | **YES** | 2 |
| `title` | alert titles (BellPanel `rowCopy`, `/help/errors` `<h3>`) | no | 5 |
| `longExplanation` | `/help/errors` `<p>` (`app/help/errors/page.tsx:93`) | no | 51 |

**In scope for the sweep: 172 occurrences** across those six fields.

> Round-1 correction (Codex): `followUp` was initially scoped out as "never rendered." That was wrong — `HealthAlertsPanel` renders it (line 111-113), and two values carry em dashes (`ROLE_TOKEN_MAPPED`/`ALERT_BELL_FEED_FAILED`: `"none — informational"`, `"none — transient read failure"`). It is now in scope AND is a §12.4-coupled field (present in `SpecCodePayload`), so it rides the three-way lockstep. `HealthAlertsPanel` renders only `title`, `dougFacing`, and `followUp` — all now in scope, no further field missed.

**Explicitly OUT of scope:**
- `helpHref` (URLs) and file comments — not copy.
- `--` (double hyphen). §9 also bans `--`, but DEFERRED `ALERT-COPY-EMDASH-1` is scoped to em dashes; `--` is a separate, unfiled concern. Not swept here (noted so a reviewer doesn't relitigate: intentional scope boundary).
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

## 4. Catalog-only fields (title, longExplanation)

`title` and `longExplanation` are NOT in `SpecCodePayload` (no x1 coupling — verified: `SpecCodePayload` = `{dougFacing, crewFacing, followUp, helpfulContext}`). Their em dashes are edited in `lib/messages/catalog.ts` **only** — no spec edit, no regen needed for these.

## 5. Replacement rules

Each `—` is replaced with the context-appropriate substitute per §9 (comma, colon, semicolon, period, or parentheses) preserving meaning and reading naturally. This is a per-occurrence judgment, not a blind global replace (a blind replace to a single character would read wrong in most sentences). Guidelines:
- Parenthetical aside (`… X — a newer parse — …`) → parentheses or commas.
- Appositive / restatement (`… stale — a newer parse has already been applied`) → colon or semicolon.
- Sentence-joining dash (`Hold on — your previous report …`) → period + capitalize, or comma.
- Title dashes (`Can't undo — this show is archived`) → colon (`Can't undo: this show is archived`).
- Never leave `--`, never introduce a new em dash.

## 6. Widened audit test (the deliverable that pins the class closed)

Add an em-dash assertion to `tests/messages/_metaCatalogCopyHygiene.test.ts` (the existing catalog copy-hygiene meta-test — natural home). It walks every entry in the runtime `MESSAGE_CATALOG` and, for each **rendered** field `[dougFacing, crewFacing, helpfulContext, followUp, title, longExplanation]`, asserts the value contains no `—` (U+2014). Because x1 already pins catalog↔spec for the four coupled fields (dougFacing, crewFacing, helpfulContext, followUp), an em-dash-free runtime catalog transitively guarantees §12.4 is em-dash-free on the coupled fields too (no separate spec-side audit needed).

- `developer` and `helpHref`/comment content are excluded from the walk (not rendered copy). `followUp` IS included (it renders in HealthAlertsPanel).
- Fail message names `CODE.field` + the offending value slice, matching the file's existing violation-report style.
- Test is **fails-by-default**: a future catalog addition with an em dash in a rendered field trips it.

### 6.1 Guard: the test must actually be RED before the fix

TDD order — land the widened audit test FIRST and observe it fail on the current 172 occurrences (RED), then sweep to GREEN. This proves the test exercises the real catalog, not a tautology.

## 7. Out of scope / non-goals

- Notify-template em-dash audit (`tests/notify/templates.test.ts`) — already exists; not modified.
- Any UI/component file — none touched (this is the ARC-1 boundary; ARC 2 owns BellPanel/PerShowAlertSection).
- `--` sweep, en-dash, `→` operator arrows in `followUp`.
- New §12.4 codes or copy changes beyond em-dash substitution.

## 8. Test plan

1. `test(messages)`: widen `_metaCatalogCopyHygiene.test.ts` em-dash audit across rendered fields → RED (172 failures).
2. `fix(messages)`: sweep em dashes — catalog.ts (all six rendered fields) + master spec §12.4 (dougFacing/crewFacing/followUp cells + helpfulContext appendix) + `pnpm gen:spec-codes` → GREEN.
3. Gates that must stay green: `test:audit:x1-catalog-parity` (catalog↔§12.4), the new hygiene audit, `tests/notify/templates.test.ts`, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## 9. Files touched

- `lib/messages/catalog.ts` (edit — 172 substitutions across 6 rendered fields)
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (edit — §12.4 table + appendix, coupled fields dougFacing/crewFacing/followUp/helpfulContext only)
- `lib/messages/__generated__/spec-codes.ts` (regenerated, committed)
- `tests/messages/_metaCatalogCopyHygiene.test.ts` (edit — add rendered-field em-dash audit)
- `DEFERRED.md` / `DEFERRED-archive.md` (move `ALERT-COPY-EMDASH-1` on completion)
