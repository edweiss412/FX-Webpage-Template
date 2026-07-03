# User-facing warning for non-clickable (bare-filename) agenda links — Design

**Date:** 2026-07-03
**Branch / worktree:** `fix/agenda-link-not-clickable` @ `/Users/ericweiss/fxav-agenda-link` (off `origin/main` `d061f8a0`)
**Lineage:** `BL-SCAN-SSE-BODY-NULL-CODE` sibling — the audit-#4 backlog item "user-facing data-quality catalog code for malformed agenda links."
**Autonomous-ship:** user-approved; both user-review gates WAIVED. Spec self-review + Codex adversarial-review to APPROVE still run.
**User decision (locked):** warn **only** for bare-filename / descriptive-text links (no clickable target); external `http(s)` URLs stay **silent** to the user.

---

## 1. Problem & goal

An agenda-link cell can parse into a link with **no Drive `fileId`** in two shapes (`parseAgendaLinks`, `lib/parser/index.ts:299-307`): (a) an external `http(s)` URL (`:303`, a working clickable target), or (b) a **bare filename / descriptive text** (`:304-306`, e.g. `agenda_final.pdf` — no clickable target at all). In `enrichAgenda` both reach the `if (!link.fileId)` branch (`lib/sync/enrichAgenda.ts:137`), where today only a **forensic** log fires (`AGENDA_LINK_UNRESOLVED`, `:141-151`, log-only, invisible to admins). So a genuinely broken agenda link — text with nothing to open — produces **no admin-visible signal**; Doug never learns the crew have a dead agenda reference.

**Goal:** add ONE user-facing (Doug-facing) §12.4 data-quality **warning** code, `AGENDA_LINK_NOT_CLICKABLE`, pushed to `result.warnings` **only** for the bare-filename case. External `http(s)` URLs stay silent (a working link, plausibly intentional). The existing forensic `AGENDA_LINK_UNRESOLVED` keeps firing for **all** fileId-less links, unchanged.

**Non-goals:**
- No change to `AGENDA_LINK_UNRESOLVED` (stays broad, log-only).
- No new admin route, no `admin_alerts` row (this is a per-show ParseWarning, exactly like `AGENDA_PDF_UNREADABLE`).
- Not reusing `AGENDA_PDF_UNREADABLE` — its copy ("doesn't point at a readable PDF / crew see the embed only") mis-describes a link with *no target at all*. A purpose-fit new code is correct.

---

## 2. The new code

**`AGENDA_LINK_NOT_CLICKABLE`** — SHOUTY_SNAKE, `AGENDA`-prefixed (so it lands in the existing "crew-schedule" help family, `app/help/errors/_families.ts:73`, with **no** `_families` edit).

**Meaning:** an agenda-link cell holds a filename or descriptive text with no clickable target, so crew have nothing to open.

**Audience:** Doug-facing (`dougFacing` set, `crewFacing: null`) — identical audience shape to the three existing agenda codes (`agendaCodes.test.ts:13-18`). Reaches Doug via the parse-warnings surfaces (sync_log / StagedReviewCard / per-show data-quality), never the crew page or the alert banner.

---

## 3. Emit-site change — `lib/sync/enrichAgenda.ts:137-153`

The sole handler for a fileId-less link is the `if (!link.fileId)` block inside the capped per-link loop (loop at `:133`; every link here already failed chip recovery `:99-130`). The whole scan body is wrapped in the outer `AGENDA_ENRICH_THREW` try/catch, so the scan never breaks.

**Discriminator** — reuse the parser's own regex (`lib/parser/index.ts:303`), `link.url` is typed `string | undefined` (`lib/parser/types.ts:132`):
```ts
const hasClickableTarget = typeof link.url === "string" && /^https?:\/\//.test(link.url);
```
Factor the regex into a shared, exported `const HTTP_URL_PREFIX = /^https?:\/\//;` used by **both** `parseAgendaLinks` and `enrichAgenda` so the classification can't drift. (Placement: a small shared module or an export from the parser; decided in the plan. If a shared export is awkward, define the identical literal in `enrichAgenda` with a comment citing `index.ts:303` as the source of truth — but prefer the shared const.)

**User-facing push** — reuse the `AGENDA_PDF_UNREADABLE` mechanism (local `warn()` helper `:44-46` → `ParseWarning {severity:"warn", code, message}`; array aliased `:87` `const warnings = result.warnings`; precedent pushes at `:188, :222, :290, :370`):
```ts
if (!hasClickableTarget) {
  warnings.push(
    warn(
      "AGENDA_LINK_NOT_CLICKABLE",
      `The agenda link "${link.label}" is just a file name with nothing to open, so crew can't reach the agenda.`,
    ),
  );
}
```
- `warnings.push` is **synchronous** → no try/catch needed (unlike the `await log.warn` forensic).
- Place it **inside** the `if (!link.fileId)` block, guarded by `!hasClickableTarget`, **before** the existing `continue` at `:152`, and **outside** the forensic's try/catch (or its own) so the two channels are independent.
- Message copy is plain-English, no raw code (AGENTS.md invariant 5); final copy in §5.

**Forensic stays:** `AGENDA_LINK_UNRESOLVED` (`:141-151`) is unchanged and keeps firing for **every** fileId-less link (both url shapes). Per-link net behavior:
| link shape | `AGENDA_LINK_UNRESOLVED` (log) | `AGENDA_LINK_NOT_CLICKABLE` (warning) |
|---|---|---|
| bare filename / text (`url` non-http) | fires | **pushed** |
| external `http(s)` URL | fires | **not** pushed |
| `url` undefined (defensive) | fires | **pushed** (no clickable target) |

---

## 4. Full §12.4 lockstep touchpoints

All land in the same PR; several land in the **same commit** (the 3-way lockstep is enforced by x1-catalog-parity).

| # | Touchpoint | File / action |
|---|---|---|
| 1 | §12.4 table row | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (~`:2897` region, after the `AGENDA_PDF_UNREADABLE` row). Columns parsed by `scripts/extract-spec-codes.ts:271-275`: `\| \`AGENDA_LINK_NOT_CLICKABLE\` \| <trigger — cell[1], NOT extracted> \| <dougFacing — cell[2]> \| — \| Doug → check agenda link \|` |
| 2 | §12.4 helpfulContext YAML appendix | Same spec file (~`:3214` region, inside the ```yaml block under the anchor `:3070`). **Mandatory** — `extract-spec-codes.ts:352-365` throws if a non-null-dougFacing code lacks a YAML entry. **Same commit as row 1.** |
| 3 | `gen:spec-codes` | `pnpm gen:spec-codes` (`package.json`) → regenerate + commit `lib/messages/__generated__/spec-codes.ts` (new entry near `:119-124`). |
| 4 | catalog row | `lib/messages/catalog.ts` (template `AGENDA_PDF_UNREADABLE` `:1234-1246`; entry type `MessageCatalogEntry` `:1-11`). Mirror the **shape**: `code`, `dougFacing` set, `crewFacing: null`, `followUp`, `helpfulContext`, `title`, `longExplanation`, `helpHref: "/help/errors#AGENDA_LINK_NOT_CLICKABLE"`. `severity` omitted (absent passes the `severity !== "info"` renderable predicate) — matches `AGENDA_PDF_UNREADABLE`. |
| 5 | `gen:internal-code-enums` | `pnpm gen:internal-code-enums` → `lib/messages/__generated__/internal-code-enums.ts`. **No delta expected** (producer is `lib/sync/enrichAgenda.ts`, which matches none of the script's scanned/gated roots — same as `AGENDA_PDF_UNREADABLE`, confirmed absent). Run it anyway and commit if any delta; x2 asserts the manifest === a fresh regen. |
| 6 | help errors page | `app/help/errors/page.tsx` — **no edit** (renders dynamically by iterating `MESSAGE_CATALOG`, `:34`, filtering `isRenderable`, `:23-31`). |
| 7 | help families | `app/help/errors/_families.ts` — **no edit** (`AGENDA` prefix already in the crew-schedule family, `:73`). |

**Copy consistency (single-source):** the dougFacing string appears in BOTH the §12.4 table (row 1) and — verbatim after regen — in `spec-codes.ts` and `catalog.ts`. x1 deep-matches them field-by-field, so they must be identical. Write the copy once (§5) and paste it into the table row + catalog row; regen derives the rest.

---

## 5. Copy (final)

- **dougFacing** (table cell[2] + catalog + becomes spec-codes): `"An agenda link on _<sheet-name>_ is just a file name or note with nothing to open, so crew can't reach that agenda. Update the cell to a working link (or a Drive file), or let us know if it keeps happening."`
- **crewFacing:** `null` (— in the table).
- **followUp:** `"Doug → check agenda link"`.
- **helpfulContext** (YAML appendix + catalog): `"An agenda-link cell contained a file name or descriptive text instead of a clickable link, so there was nothing for crew to open. Replace it with a working link (or the Drive file) so crew can reach the agenda; if the cell already looks like a link and this keeps appearing, let us know and we'll take a look."`
- **title** (catalog): `"Agenda link isn't clickable"`.
- **longExplanation** (catalog): `"An agenda-link cell held a file name or note with no clickable target, so crew had nothing to open. Update it to a working link or the Drive file; if it already looks right and this persists, let us know and we'll take a look."`
- **helpHref** (catalog): `"/help/errors#AGENDA_LINK_NOT_CLICKABLE"`.
- **§12.4 trigger cell (cell[1], NOT extracted):** `"an agenda-link cell has no clickable target — a bare file name or descriptive text rather than a Drive file or an http(s) URL"`.

Guard for copy: plain-English, no raw error codes (invariant 5). `<sheet-name>` placeholder matches the `AGENDA_PDF_UNREADABLE` dougFacing convention (the surface substitutes it).

---

## 6. CI gates

**Must stay green (apply):**
- **x1-catalog-parity** (`tests/cross-cutting/codes.test.ts` + `extract-spec-codes.test.ts`): `MESSAGE_CATALOG` keys === `SPEC_CODES` keys === `CODE_SCENARIOS` keys (`codes.test.ts:67-71`); deep field match vs §12.4 (`:73-88`); orphan check (`:122-126`) — the raw `warn("AGENDA_LINK_NOT_CLICKABLE", …)` literal in `enrichAgenda.ts` MUST resolve to a `SPEC_CODES`/`RETIRED_CODES` key. `CODE_SCENARIOS` auto-derives (`code-scenarios.ts:13-18`) — no manual edit.
- **x2-no-raw-codes** (`tests/cross-cutting/no-raw-codes.test.ts`): `INTERNAL_CODE_ENUMS.toEqual(extractInternalCodeEnums())` (`:34`, no-op delta for this producer, but the script must be run/committed); `buildForbiddenCodeIndex()` auto-adds the new code (`:76-83`) → any JSX must render it only via `messageFor`/`<ErrorExplainer>`, never a raw literal (this change adds no JSX, so trivially satisfied).
- **Catalog-docs contract** (`tests/messages/_metaErrorCatalogDocs.test.ts:196-207`): renderable entry needs `title`/`longExplanation`/`helpHref` non-null + helpHref `/help/*`; target-class (`:230-240`) — a non-`WARN_`/`PARSE_` code must point at `/help/errors#<code>` (satisfied by the helpHref above).
- **Help family grouping** (`tests/help/errors-grouping.test.tsx`): completeness (`:37-42`), anchor + h3 count (`:44-52`), single CTA (`:54-59`), h2/jump-list parity (`:61-86`) — auto-covered by the `AGENDA` prefix.
- **helpfulContext YAML invariant** (inside `gen:spec-codes`, `extract-spec-codes.ts:352-365`) — surfaced by x1.
- **agenda presence pin** (`tests/messages/agendaCodes.test.ts:13-24`) — **extend** its `test.each` list to include `AGENDA_LINK_NOT_CLICKABLE` (dougFacing truthy + crewFacing null).
- **Full vitest suite + `pnpm typecheck`** before push — new catalog keys can break exact `toEqual` shape assertions elsewhere; vitest strips types.

**Do NOT apply (state to preempt relitigation):**
- **admin-alert catalog** (`_metaAdminAlertCatalog.test.ts`) — only for `from("admin_alerts").upsert` codes (registry = only `AMBIGUOUS_EMAIL_BINDING`); this is a per-show ParseWarning.
- **Route / TRUST_DOMAINS** (x3, `no-jwt-surface.test.ts`) — only for new admin routes; none added.
- **Tile emphasis / sentinel-hiding** (`_metaEmphasisRenderContract`, `_metaSentinelHidingContract`) — tile optional-text concerns, unrelated.

---

## 7. Test surface (TDD)

Add a unit test on `enrichAgenda` (sibling to the existing agenda-code coverage), asserting against `result.warnings` (the data source) and spying on the forensic `log.warn` independently:

1. **Bare-filename link** (`{ label: "Day 1 Agenda", url: "agenda_final.pdf" }`, no fileId) → `result.warnings` contains `{ severity: "warn", code: "AGENDA_LINK_NOT_CLICKABLE" }` AND the forensic `log.warn` fired with `code: "AGENDA_LINK_UNRESOLVED"`. **Failure mode caught:** the warning isn't emitted for the target case.
2. **External http(s) URL** (`{ label: "Day 1 Agenda", url: "https://example.com/agenda" }`, no fileId) → `result.warnings` contains **NO** `AGENDA_LINK_NOT_CLICKABLE` AND the forensic `log.warn` **still** fired `AGENDA_LINK_UNRESOLVED`. **Failure mode caught:** narrowing the user-facing warning accidentally also silenced the broad forensic; or the http-URL case wrongly warns.
3. **Undefined url** (`{ label: "Day 1 Agenda" }`, no fileId, no url) → treated as no-clickable-target → `AGENDA_LINK_NOT_CLICKABLE` pushed + forensic fires. **Failure mode caught:** the `typeof link.url === "string"` guard mis-handles undefined.

Anti-tautology: assert warning presence against `result.warnings[*].code` (the produced data), NOT a rendered container; the forensic assertion uses a `log` spy so the two channels are proven independent. Derive nothing from hardcoded rendered output. Extend `agendaCodes.test.ts` for the catalog-presence pin (separate from the emit test).

### 7.1 Meta-test inventory
No new structural meta-test. **EXTENDS** `tests/messages/agendaCodes.test.ts` (presence pin) and relies on the existing §12.4 gates (x1/x2/_metaErrorCatalogDocs/errors-grouping) which auto-cover the new code. (Declared per the AGENTS.md meta-test-inventory rule.)

---

## 8. Guard conditions & self-consistency

- **Fail-open:** the `warnings.push` is synchronous and inside the outer `AGENDA_ENRICH_THREW` try/catch — it cannot break the scan. The forensic keeps its own try/catch.
- **No raw codes in UI (invariant 5):** the code string reaches Doug only through the catalog copy (`lib/messages/lookup.ts`); this change adds no JSX literal.
- **Discriminator single-sourced:** the `/^https?:\/\//` regex is the parser's own (`index.ts:303`); the plan factors it into one exported const used by both sites (or documents the citation if shared-export is impractical).
- **Copy single-sourced:** the dougFacing + helpfulContext strings are written once (§5) and appear identically in the §12.4 table/YAML and the catalog; x1 enforces the match.
- **Numeric sweep:** 1 new code; 2 spec edits (table + YAML) in one commit; 2 regen'd files (spec-codes always, internal-code-enums no-delta); 1 catalog row; 0 help edits; 1 emit-site change; 1 extended presence test + 1 new emit test. 3 forensic/warning behaviors per §3 table. These are cross-referenced in §3, §4, §7.
