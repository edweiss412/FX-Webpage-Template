# Finalize blocker rows: show the parsed show title, not the raw `drive_file_id`

**Status:** design approved (2026-06-29). Implements DEFERRED.md **RESCAN-1** (P3), broadened to both publish-blocker lists.

## Problem

Every row in the publish-blocker lists labels its sheet by the opaque Drive file id (e.g. `1N1PKmhc…`). The per-sheet Re-scan button (#180) made each blocked row actionable, so the unreadable identifier is now salient. Doug should see the **show title** he recognises, not the id.

**Four** render sites across **three** components show the raw id today (confirmed by sweep — these are the only components importing `per_row`/`CasPerRowEntry`/`PerRowFailure`):

- `components/admin/FinalizeButton.tsx:281` — Phase B blocked rows (`race_row` state, `PerRowFailure[]`, from `POST /api/admin/onboarding/finalize`).
- `components/admin/FinalizeButton.tsx:310` — Phase D blocked rows (`cas_per_row` state, `CasPerRowEntry[]`, from `POST /api/admin/onboarding/finalize-cas`).
- `components/admin/RunFinalCASButton.tsx:121` — Phase D blocked rows (`cas_per_row`, same `CasPerRowEntry` shape).
- `components/admin/ResumeFinalizeButton.tsx:136` — Phase B blocked rows (`race_row` state, its own `PerRowFailure` copy at L28, from `POST /api/admin/onboarding/finalize`; this is the re-entry button rendered by `FinalizeInProgress.tsx`).

## Goal

Each blocked row labels its sheet by the parsed show title (`ParseResult.show.title`, `lib/parser/types.ts:349`), falling back to the raw `drive_file_id` only when no title is derivable (a sheet that failed to parse, or a legacy-ambiguous manifest row). The raw id is dropped from display in the common case; it survives only as the React `key` and the `RescanSheetButton driveFileId` prop.

## Design

### Resolved decision: optional field + client fallback

`display_name` is an **optional** field (`display_name?: string`) on the per-row wire entry. The server populates it with the parsed show title wherever a parse result is in hand; the client renders `row.display_name ?? row.drive_file_id`. Rationale (verified against live code):

- `finalize-cas/route.ts` `errorResponse(status, code, extra: Record<string, unknown>)` (L146-152) types `per_row` loosely — the legacy-ambiguous path (`ONBOARDING_LEGACY_ROW_AMBIGUOUS`, L703) and the unparseable-payload failure (`!parsed.ok`, L361) both produce entries with **no** title available. An optional field with a client fallback degrades gracefully on exactly those paths instead of rendering blank.
- The client already filters `per_row` to `code !== "OK"` and renders every survivor (`RunFinalCASButton.tsx:78`), so the wire type must tolerate entries that legitimately lack a title.

### Shared helper (DRY, defensive)

New file `lib/onboarding/blockerDisplayName.ts`:

```ts
import type { ParseResult } from "@/lib/parser/types";

// The show title for a per-row blocker label, or null when none is derivable.
// Accepts `unknown` and never throws: it runs on the FAILURE path (a row may
// carry a corrupt/legacy/double-encoded parse_result jsonb), so it must degrade
// to null rather than surface a JsonbCoercionError/TypeError. Empty/whitespace
// titles collapse to null so they never reach the wire.
export function parsedShowTitle(pr: ParseResult | unknown): string | null {
  // A legacy row may store parse_result double-encoded (a JSON string of the object) —
  // asParseResult (lib/db/coerceJsonbObject.ts:133) decodes that shape, so a title is
  // derivable. Decode a string defensively (never throw on the failure path); anything
  // unparseable/corrupt collapses to null → the row falls back to the id.
  let obj: unknown = pr;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  const title = (obj as { show?: { title?: unknown } } | null | undefined)?.show?.title;
  return typeof title === "string" && title.trim() !== "" ? title : null;
}
```

This addresses the spec round-2 MEDIUM advisory (double-encoded Phase B rows now yield a title instead of falling back to the id), without pulling in the throwing `asParseResult` on the error path.

Both routes import it. It is also reused in `finalize-cas/route.ts`'s existing `syntheticFileMeta` (L334), replacing `parsed.parseResult.show.title ?? row.drive_file_id` with `parsedShowTitle(parsed.parseResult) ?? row.drive_file_id` (only behaviour change: an empty-string title now falls back to the id instead of rendering `""` — an improvement; §Testing item 6 pins no existing test asserts the empty-title case).

### Single-choke-point enrichment (structural defense)

`display_name` is set at the **one place each route collects its per-row results into the response array**, NOT at each individual failure `return`. This is deliberate: the per-row failure branches are many and were under-enumerated in spec round 1 (the same class as the `lib/db/coerceJsonbObject.ts` R3→R4 "mirror the type, don't hand-pick the returns" lesson). Enriching at the single `push` makes coverage total by construction — a new failure branch added later is covered automatically.

**`finalize/route.ts` (Phase B):** the only collection point is `perRow.push(result)` at **L1068**, inside `for (const row of approvedRows)` (L1017). Every `PerRowResult` — from `processApprovedRow` (failure returns L710/L723/L733/L748/L797/L897 + OK) and from the loop-level `FirstSeenProvenanceRaceError` catch (L1062) — flows through it. Replace with:

```ts
perRow.push(
  result.code === OK_CODE
    ? result
    : { ...result, display_name: parsedShowTitle(row.parse_result) ?? undefined },
);
```

`row` is the `PendingFinalizeRow` (`parse_result: ParseResult`, L100); `parsedShowTitle` guards the legacy-corrupt-jsonb case without throwing. `PerRowResult`'s failure variant (L115, carries `re_apply_url` L131) gains `display_name?: string`.

**`finalize-cas/route.ts` (Phase D):** the only collection point is the `shadowResults.push(...)` loop at **L713-L717** (`for (const row of await readShadowRows(...))`). Re-parse the shadow payload only on the blocked path (the error path; OK rows skip it):

```ts
const r = await deps.withRowTx(row.drive_file_id, (rowTx, pipelineTx) =>
  applyShadow(rowTx, pipelineTx, row, affectedShowIds),
);
if (r.code === "OK") { shadowResults.push(r); continue; }
const parsed = parseShadowPayloadForApply(row.payload); // lib/onboarding/shadowPayload.ts:75
shadowResults.push({
  ...r,
  display_name: parsed.ok ? parsedShowTitle(parsed.parseResult) ?? undefined : undefined,
});
```

`ShadowApplyResult` (L55) gains `display_name?: string`. `shadowResults` flows into `per_row` at L720/L737 unchanged. The legacy-ambiguous literal (`ONBOARDING_LEGACY_ROW_AMBIGUOUS`, L703) is a **separate** `per_row` producer that does not pass through this loop and keeps emitting `{drive_file_id, code}` (no title is derivable there — see Out of scope); its rows fall back to the id on the client.

### Wire shape (client types — all THREE components)

Each gains `display_name?: string` on its per-row entry type:

- `FinalizeButton.tsx`: `PerRowFailure` (L46) and `CasPerRowEntry` (L73).
- `RunFinalCASButton.tsx`: `CasPerRowEntry` (L30).
- `ResumeFinalizeButton.tsx`: `PerRowFailure` (L28).

### UI render (4 sites across 3 components)

At each site, replace the raw-id label with the resolved name, dropping the id from display:

- `FinalizeButton.tsx:281` — `<span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>`
- `FinalizeButton.tsx:310` — `<span className="font-medium">{row.display_name ?? row.drive_file_id}</span>`
- `RunFinalCASButton.tsx:121` — `<span className="font-medium">{row.display_name ?? row.drive_file_id}</span>`
- `ResumeFinalizeButton.tsx:136` — `<span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>`

The `<li key={…drive_file_id}>` keys, the `data-testid={…-reapply-${…drive_file_id}}` attributes (`FinalizeButton.tsx:288`, `ResumeFinalizeButton.tsx:143`), and the `RescanSheetButton driveFileId={…drive_file_id}` props are all unchanged — the id stays in the data, only its visible `<span>` label is replaced.

## Guard conditions

- **`display_name` undefined** (parse-failed sheet, legacy-ambiguous row, or any per_row producer not covered): render the `drive_file_id` (the `?? row.drive_file_id` fallback). This is the only path on which the id is still shown.
- **`display_name` empty string:** impossible — `parsedShowTitle` returns `null` for empty/whitespace titles, so an empty title never reaches the wire; the row falls back to the id.
- **`title` is the show title, not the file name:** chosen deliberately (consistent with how shows appear elsewhere in the app); the Drive file name is not used.

## Out of scope

- `ONBOARDING_LEGACY_ROW_AMBIGUOUS` rows keep showing the id (no parse result exists at that point; deriving a name would need a manifest join not justified for this legacy edge).
- No change to the Re-scan button, the clean/dirty rule, the lock topology, or any error-code copy.

## Invariants / non-touchpoints

- **No new §12.4 message code** → no catalog three-way lockstep, no `gen:internal-code-enums`, no `_families.ts` prefix, no emphasis-render registry, no `x1`/`x2` impact. (`display_name` is data, not a code.)
- **No new route** → no `lib/audit/trustDomains.ts` (`x3`) change.
- **No schema migration** → no `validation-schema-parity` impact (the title comes from already-stored `parse_result`/shadow `payload`).
- **No advisory-lock change** → lock topology untouched.
- **UI surface (`components/`)** → invariant 8 applies: `/impeccable critique` + `/impeccable audit` on the **three** component diffs (`FinalizeButton`, `RunFinalCASButton`, `ResumeFinalizeButton`); HIGH/CRITICAL fixed or deferred before cross-model review.
- **No raw error codes in UI** (invariant 5): unaffected — `display_name` carries a human title or the id, never a code.

## Testing

TDD per task. Every test states the failure mode it catches; values derive from fixtures, never hardcoded (anti-tautology).

1. **Helper unit (`tests/onboarding/blockerDisplayName.test.ts`):** `parsedShowTitle` returns the title for (a) a real `ParseResult` object and (b) a **double-encoded** JSON string of a valid parse (`JSON.stringify({show:{title:"X"}})` → `"X"`); returns `null` for `{show:{}}` / `{show:{title:""}}` / `{show:{title:"  "}}` / a non-JSON string / `null` / `undefined` — and **never throws** on any of them. Catches: a corrupt failure-path row throwing instead of degrading; legacy double-encoded rows needlessly falling back to the id.
2. **finalize-cas route (real DB):** a shadow row that blocks with `STAGED_PARSE_OUTDATED_AT_PHASE_D` returns `per_row[i].display_name === <the fixture's parsed show.title>` (read the expected value from the seeded `payload`, not a literal). Catches: blocked rows ship without the title.
3. **finalize-cas parse-failure:** a shadow row whose `payload` is unparseable blocks and its `per_row` entry has `display_name === undefined` (→ client will show the id). Catches: the blocked path throwing on re-parse, or emitting a bogus name.
4. **finalize route (Phase B):** asserted in the **mocked** `tests/onboarding/finalize.test.ts` (the purpose-built fake-DB harness that already drives a `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` per_row failure, L476) — it controls the approved fixture's `parse_result.show.title` exactly and forces the failure code, which a real-DB Phase B failure (a genuine revision race) cannot do deterministically. The choke-point enrichment is thin glue over the helper (which carries the title-derivation logic under its own unit test, item 1). Assert the blocked per_row carries `display_name === <the fixture title>`; a second fixture with an empty `show.title` asserts `display_name` is **absent** (`exactOptionalPropertyTypes` — the property is omitted, not `undefined`-valued). Catches: the second/third blocker list left on the raw id; the choke-point enrichment missing a branch.
5. **Component (all THREE):** for `FinalizeButton`, `RunFinalCASButton`, and `ResumeFinalizeButton`, render the blocked list from a per-row fixture with `display_name: "Some Show Title"` + a distinct `drive_file_id`; assert the title is shown and the `drive_file_id` is **not** present as the row label (clone-and-strip the `RescanSheetButton`/reapply subtree — whose `data-testid`/`driveFileId` still contain the id — before the negative assertion so it can't be satisfied by a sibling). A second fixture with `display_name: undefined` asserts the row falls back to showing the `drive_file_id`. Catches: id still rendered; fallback broken; a component left unconverted.
6. **No-empty-title-regression:** grep the existing finalize-cas tests for any assertion on `syntheticFileMeta`'s `name` with an empty-string title; confirm none exists (the helper's empty→id change is safe). State the grep in the plan.
7. **Negative-regression:** for each route test, confirm the assertion fails if the choke-point enrichment is reverted (mutate to push the bare `result` → test red).

## Files

- Create: `lib/onboarding/blockerDisplayName.ts` (`parsedShowTitle`)
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` (`ShadowApplyResult` + the `shadowResults.push` choke point + `syntheticFileMeta` reuse + `parseShadowPayloadForApply`/`parsedShowTitle` imports)
- Modify: `app/api/admin/onboarding/finalize/route.ts` (`PerRowResult` + the `perRow.push` choke point at L1068 + `parsedShowTitle` import)
- Modify: `components/admin/FinalizeButton.tsx` (`PerRowFailure` + `CasPerRowEntry` types + 2 render sites)
- Modify: `components/admin/RunFinalCASButton.tsx` (`CasPerRowEntry` type + 1 render site)
- Modify: `components/admin/ResumeFinalizeButton.tsx` (`PerRowFailure` type + 1 render site)
- Tests: `tests/onboarding/blockerDisplayName.test.ts` (helper), `tests/onboarding/*` (route DB tests), `tests/components/admin/*` (render tests for all three components)
- Update: `DEFERRED.md` (mark RESCAN-1 resolved)
