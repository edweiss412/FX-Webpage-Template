# Surface unknown EVENT-DETAILS labels to the operator — Design Spec

**Source:** post-cluster fidelity audit (2026-06-30). **Routing:** parser/warnings (non-UI) → Opus. **Class:** PARSED-NOT-SURFACED (silent-keep). **No DB / catalog / UI change.**

## Goal

Today the **only** parser block that surfaces an unrecognized row label to the operator is the VENUE block (`venue.ts:297-311` → `UNKNOWN_FIELD` warning + `raw_unrecognized`). Every other block silently drops or silently keeps unknown labels. The highest-value, safest place to close this is the **EVENT DETAILS** block: it is the free-form "specs" section where operators add ad-hoc fields, and a genuinely-unknown label there is currently **normalize-and-KEPT** into `event_details` under a non-whitelisted key (`event.ts:200-206`) — so it is stored but rendered by NOTHING (the crew Tech-specs card + the modal both iterate the closed `EVENT_DETAILS_LABELS`), i.e. effectively invisible. Surface those via the existing `UNKNOWN_FIELD` operator-review pipeline so the operator sees "we found a row we don't recognize" and can report it / ask for the field to be added — instead of it vanishing.

Extract the venue emit into a shared helper, adopt it in event-details (flag-and-KEEP — purely additive, no data loss), and **defer** the structural/columnar/unscoped blocks with documented rationale.

## Background / recon grounding

- **The venue pattern (template):** a row whose `col0` resolves to no canonical via the central alias map (`col0Canon === null`), inside an active block scope and not a terminator/blank, pushes BOTH a `{severity:'warn', code:'UNKNOWN_FIELD', blockRef:{kind:'venue'}, rawSnippet:'<key> | <value>'}` warning AND a `{block,key,value}` entry to `agg.rawUnrecognized` (`venue.ts:293-311`; `RawUnrecognized` shape `warnings.ts:13`; merged verbatim `index.ts:624`).
- **`UNKNOWN_FIELD` is fully registered + block-GENERIC downstream.** §12.4 catalog (`catalog.ts:1013-1025`), spec-codes, internal-enums all exist; `operatorActionableWarnings` (`dataGaps.ts:152-170`) selects it; `attachSourceCellAnchors` (`showDayTimeAnchors.ts:136-149`) resolves its deep link generically via `sources.region[blockRef.kind]`. **A new emitter REUSES the code** — NO catalog/spec/dataGaps/x1 change. `summarizeDataGaps` deliberately does NOT count `UNKNOWN_FIELD` (it is operator-actionable-anchored, not a data-gap tally) — keep that.
- **`'details'` is a valid `RegionId`** (`buildSheetDeepLink.ts:38`; event-details deep links already exist), and `event.ts` already emits `FIELD_LABEL_AUTOCORRECTED` with `blockRef:{kind:'details'}` (`event.ts:218-224`) — so the event-details warning+deeplink surface is already wired; we add a second code on the same surface.
- **event.ts genuinely-unknown branch** (`event.ts:200-206`): for a two-column row whose label is not an exact canonical and not a fuzzy hit, `const key = toCanonicalKey(col0); if (key && val && !isSensitiveCanonicalKey(key)) writeField(result, key, val);` — non-sensitive unknowns are KEPT (under a non-whitelisted key → unrendered); sensitive-looking labels (PO#/Budget/Invoice via `isSensitiveCanonicalKey`) are silently DROPPED.
- **Block safety classification (why event-details only):** event-details is closed-vocab (`CANONICAL_KEY_MAP`) + header-anchored (`EVENT_DETAILS_HEADER_RE`) + terminator-bounded → an unknown residue is unambiguous, LOW false-positive. By contrast: `ops.ts` is a clean 5-label map but whole-document-scanned (no block scope → would flag every non-ops row); `crew.ts`/`hotels.ts` are columnar (col0 is data, not labels); `transport.ts` has an open-vocab schedule (pattern-allowlist, not a closed map); `rooms.ts` is multi-format (only the v4 path is closed-map). These are unsafe/noisy or need refactoring → **deferred** (see Out of scope).
- **Live false-positive check:** across 3 live shows (Consultants, East Coast, RPAS) every event-details label used the standard template vocabulary already in `CANONICAL_KEY_MAP` → genuinely-unknown-but-kept labels are rare → low warning volume. And flag-and-KEEP makes even a false positive harmless: a soft, dismissable, non-blocking warning while the value is still stored.

## Resolved Decisions

1. **Scope = the EVENT DETAILS block only** (plus a behavior-preserving venue refactor to share the helper). The other blocks are deferred (Out of scope) with rationale.
2. **Flag-and-KEEP (purely additive).** In the genuinely-unknown, non-sensitive, value-present branch (`event.ts:205`), keep the existing `writeField` AND additionally emit `UNKNOWN_FIELD` + `raw_unrecognized`. No data-loss behavior change. **Sensitive-looking unknown labels stay silently dropped and are NOT flagged** — flagging would leak the value into the warning `rawSnippet` (the §12.4 `UNKNOWN_FIELD` copy + `rawSnippet` are operator-visible). This preserves the existing privacy posture.
3. **Reuse `UNKNOWN_FIELD`; `blockRef.kind = 'details'`.** No new §12.4 code (no catalog/spec-codes/internal-enums/x1 change). The deep link resolves to the event-details region (`'details'` RegionId).
4. **Shared helper `emitUnknownField(agg, { block, kind, key, value })`** in `lib/parser/warnings.ts`, mirroring `emitFieldUnreadable`/`emitUnknownSection`. Refactor `venue.ts:293-311` to call it (behavior-preserving — `block:'venue'`, `kind:'venue'`); event-details calls it with `block:'event_details'`, `kind:'details'`. The `block` value names the source (and the diagnostic message + `raw_unrecognized.block`); `kind` is the deep-link `RegionId` (they differ for event-details: block `event_details`, region `details`).

## Shared helper — `lib/parser/warnings.ts`

```ts
/**
 * Emit an UNKNOWN_FIELD operator-review warning + a structured raw_unrecognized
 * entry for a row whose label resolved to no known field inside a block scope.
 * `block` names the source (diagnostic message + raw_unrecognized.block); `kind`
 * is the deep-link RegionId (usually == block, but event-details uses 'details').
 * Mirrors emitFieldUnreadable/emitUnknownSection. (unknown-label coverage)
 */
export function emitUnknownField(
  agg: ParseAggregator | undefined,
  opts: { block: string; kind: string; key: string; value: string },
): void {
  if (!agg) return;
  const key = opts.key.trim();
  const value = opts.value ?? "";
  agg.warnings.push({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${opts.block} row label: '${key}'`,
    blockRef: { kind: opts.kind },
    rawSnippet: `${key} | ${value}`,
  });
  agg.rawUnrecognized.push({ block: opts.block, key, value });
}
```

## Surface 1 — venue refactor (behavior-preserving)

Replace the inline warning-push + `rawUnrecognized.push` in `venue.ts:299-310` with one call:
```ts
emitUnknownField(agg, { block: "venue", kind: "venue", key: col0.trim(), value: rawVal });
```
The emitted warning + `raw_unrecognized` entry are byte-identical to today (message `Unrecognized venue row label: '<key>'`, `blockRef.kind:'venue'`, `rawSnippet:'<key> | <value>'`, `raw_unrecognized {block:'venue',key,value}`). All existing venue tests stay green. (The `inVenueFieldScope`/blank/terminator guards stay in `venue.ts` exactly as-is — only the emit lines move into the helper.)

## Surface 2 — event-details adoption (flag-and-keep)

In `event.ts:200-206`, the genuinely-unknown else-branch:
```ts
} else {
  // Genuinely-unknown label. Keep non-sensitive (unchanged) AND surface it to the
  // operator (it is stored under a non-whitelisted key → rendered by nothing, so
  // without this it vanishes). Sensitive-looking labels stay silently dropped and
  // are NOT flagged (flagging would leak the value via the warning rawSnippet).
  const key = toCanonicalKey(col0);
  if (key && val && !isSensitiveCanonicalKey(key)) {
    writeField(result, key, val);
    emitUnknownField(agg, { block: "event_details", kind: "details", key: col0, value: val });
  }
}
```
(`agg` is already a param of `parseEventDetails`, `event.ts:123`; `emitUnknownField` imported from `@/lib/parser/warnings`.)

## Guard conditions

- Known exact label → matched above, `continue`; never reaches the unknown branch (no flag).
- Fuzzy-corrected label → handled in the fuzzy branch (`FIELD_LABEL_AUTOCORRECTED`, unchanged); not flagged as unknown.
- Single-column row (label only, no value, `col1` falsy) → `event.ts:209` skip; never flagged (no value to keep/leak).
- Sensitive-looking unknown (`isSensitiveCanonicalKey(key)` true) → dropped as today, NOT flagged (privacy).
- `toCanonicalKey(col0)` empty → not kept, not flagged.
- Sentinel value (`TBD`/`N/A`) under an unknown label → still kept + flagged (the LABEL is unknown regardless of value; the operator should see the unrecognized row). Consistent with venue (which flags regardless of value).
- `agg` undefined (parser called without an aggregator) → helper no-ops; no throw.
- Empty result after the loop → existing `emitEmptySection` path unchanged.

## Cross-cutting touchpoints

- **§12.4 / catalog / spec-codes / internal-enums / x1 parity:** NO change — `UNKNOWN_FIELD` is already registered; both emitters reuse it. (x1 stays green; no new code minted.)
- **`dataGaps.ts`:** NO change — `UNKNOWN_FIELD` is already in `OPERATOR_ACTIONABLE_ANCHORED`, deliberately NOT in `DATA_GAP_CODES`. The event-details warning becomes operator-actionable automatically.
- **Deep-link region:** NO change — `'details'` is already a `RegionId` with a `REGION_ANCHOR_SPEC` entry; the deep link resolves via `blockRef.kind:'details'`.
- **Operator-warning render surfaces** (`PerShowActionableWarnings`, `StagedReviewCard`, Step-3 `Step3SheetCard`): NO change — they render `operatorActionableWarnings` generically; the new event-details `UNKNOWN_FIELD` flows through unchanged. **No UI file is modified → invariant 8 (impeccable) N/A.**
- **No DB change** — `shows_internal.raw_unrecognized` already persists the generic `{block,key,value}[]`.

## Meta-test inventory

- **Creates** a `warnings.test.ts` unit test for `emitUnknownField`. **Extends** the event-block parser tests for the new emission. No structural meta-test created/extended (the §12.4 lockstep is unchanged; no auth/DB/advisory-lock surface). The x1 catalog-parity gate must stay green (assert no new code).

## Test plan (anti-tautology)

1. **`emitUnknownField` unit** (`tests/parser/warnings.test.ts`): calling it pushes exactly one `UNKNOWN_FIELD` warning (`blockRef.kind` = the passed `kind`, `rawSnippet` = `'<key> | <value>'`) AND one `raw_unrecognized` `{block,key,value}`; `agg` undefined → no-op, no throw; key is trimmed. Failure mode: helper drift from the venue-emitted shape.
2. **Venue regression** (`tests/parser/warnings.test.ts:138-188` + `tests/parser/blocks/venue.test.ts`): the existing venue `UNKNOWN_FIELD` + `raw_unrecognized` assertions stay green after the refactor (byte-identical output). Failure mode: the refactor changing venue's emitted warning/entry.
3. **Event-details flag-and-keep** (event-block test): an EVENT DETAILS block with a genuinely-unknown non-sensitive labeled row (e.g. `| Rigging | 2 motors |`) → (a) `result.<key>` is STILL written (value kept — assert the parsed `event_details` contains it), AND (b) exactly one `UNKNOWN_FIELD` warning with `blockRef.kind:'details'` + `rawSnippet` containing the label, AND (c) one `raw_unrecognized {block:'event_details', key, value}`. A KNOWN label (e.g. `Stage Size`) → NO `UNKNOWN_FIELD`. A SENSITIVE unknown (e.g. a `PO#`/budget-like label that `isSensitiveCanonicalKey` flags) → dropped, NO `UNKNOWN_FIELD` (assert neither warning nor a leaked value). Failure modes: silent-keep regression; sensitive-label leak; flagging a known/fuzzy label.
4. **Operator-actionable + x1**: assert the event-details `UNKNOWN_FIELD` is selected by `operatorActionableWarnings` (so it reaches the operator panel + deep-links to `details`); run `tests/cross-cutting/codes.test.ts` (x1) — stays green (no new code).

## Out of scope / deferred (documented rationale → BACKLOG note)

- **ops.ts** — clean closed 5-label vocab but whole-document scan (no block anchor); adopting would flag every non-ops row. Needs re-anchoring to its INFO region FIRST. Deferred.
- **rooms.ts** — only the v4 bare-label path is a closed map; v2 GS/BO are regex scanners → adopting v4-only = asymmetric coverage. Deferred (needs uniform cell-loop rewrite first).
- **crew.ts / hotels.ts** — columnar (col0 is people/values, not labels); no per-row label vocabulary to be "unknown" against. Column-header typos already surface via `COLUMN_HEADER_AUTOCORRECTED`. Not applicable.
- **transport.ts** — open-vocab schedule stages (pattern allowlist, not a closed map); metadata labels are few but coexist with the open schedule. High noise. Deferred.
- Adding `UNKNOWN_FIELD` to `DATA_GAP_CODES` / a counted tally — no; it stays operator-actionable-anchored (existing convention).
