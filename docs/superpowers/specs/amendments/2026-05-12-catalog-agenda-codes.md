# §12.4 amendment — AGENDA_* crew-facing catalog rows

**Date**: 2026-05-12
**Owner**: Eric Weiss (M9 milestone owner)
**Spec target**: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §12.4
**Authorizing context**: M9 Task 9.0.A1 (handoff `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M9-polish.md` §3 + §A). Triggered by R2 codex adversarial review of Task 9.0 commit `49bc26b` (finding 2 — M7-D2 introducing new catalog codes requires explicit spec authorization).
**Type**: Additive. Supersedes nothing.

## Summary

Add two crew-facing display codes to §12.4 covering the two distinct error states `AgendaPdfViewer` surfaces when the agenda asset proxy at `app/api/asset/agenda/[show]/[id]/route.ts` returns a non-success status:

- **`AGENDA_GONE_FOR_CREW`** — HTTP 410 from the proxy (agenda deleted / replaced with non-PDF / `headRevisionId` unaddressable).
- **`AGENDA_UNAUTHENTICATED`** — HTTP 401 from the proxy (signed-link JWT expired / crew-binding absent / no credentials).

Both codes are CREW-FACING ONLY. `dougFacing` is `—` (null); no `helpfulContext` YAML entry per the §12.4 appendix invariant (lines 2853-2856 of the spec) that omits null-dougFacing codes.

Distinct from a transient infrastructure failure (which routes through the existing 5xx path's catalog code and retries inline). The 410 case is non-retryable (Doug must re-share). The 401 case is recoverable by reopening Doug's signed link.

## Why now

Today's `AgendaPdfViewer` collapses every PDF load failure to a single retry-able message ("couldn't open the agenda right now"). The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) — retrying spins forever — and wrong for 401 (link expired) where the user has a different recovery path (reopen Doug's message). M7-D2 (deferred from M7 Task 7.9 §12 `/impeccable audit` Finding G.3, 2026-05-11; see `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/DEFERRED.md` M7-D2) routes these distinct error classes to distinct catalog rows so `messageFor(...)` returns the right copy.

Per `AGENTS.md` §1.5 (no raw error codes in user-visible UI) + §1.7 (spec is canonical), adding new MessageCodes requires explicit spec authorization. This amendment is that authorization.

## Section placement

Insert the two new rows in §12.4 between lines 2752 and 2757 of the live spec — between `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` and `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`. The natural neighborhood is "linked-asset / staged-asset crew-facing errors." Both new rows belong to the same domain (a linked asset's status changed in a way crew see directly).

Order within the insertion window: `AGENDA_GONE_FOR_CREW` first, then `AGENDA_UNAUTHENTICATED`. Alphabetical by code suffix; also matches "permanent → recoverable" severity ordering.

## Canonical rows

Verbatim §12.4 table rows (markdown pipe-delimited; copy into the live spec):

```markdown
| `AGENDA_GONE_FOR_CREW` | `AgendaPdfViewer` (via the proxy at `app/api/asset/agenda/[show]/[id]/route.ts`) received HTTP **410 Gone**. Triggers: (a) Drive returned `notFound` (file deleted, trashed, or unshared); (b) `mimeType !== 'application/pdf'` (operator pasted a non-PDF link); (c) `headRevisionId` no longer addressable. Distinct from a transient network failure (which retries via the standard 5xx path). Non-retryable from the crew side — Doug must re-share or replace the link. | — | "This agenda isn't available anymore. Ask Doug for the new link." | Crew → message Doug |
| `AGENDA_UNAUTHENTICATED` | `AgendaPdfViewer` proxy returned HTTP **401 Unauthorized**. Triggers: (a) the crew's signed-link JWT expired between page load and PDF fetch; (b) the JWT validates but no `crew_members` row binds it to the show (cross-show link reuse); (c) the request arrived without credentials. The crew member reopens Doug's most recent share link to mint a fresh JWT. | — | "Your link to this agenda expired. Reopen Doug's latest message to view it." | Crew → reopen signed link |
```

## `helpfulContext` YAML appendix

**No entries added.** Per the §12.4 appendix invariant at spec lines 2853-2856: codes whose `dougFacing` is `—`/null are OMITTED from the YAML appendix. The X.1 extractor normalizes missing keys to `helpfulContext: null` and fails the build if a null-dougFacing code carries a `helpfulContext` entry. Both `AGENDA_*` codes have `dougFacing: —`, so they are absent from the YAML.

## Cross-cutting impact

1. **`lib/messages/catalog.ts`** (M9 Task 9.4) adds two typed entries:

   ```ts
   AGENDA_GONE_FOR_CREW: {
     dougFacing: null,
     crewFacing: "This agenda isn't available anymore. Ask Doug for the new link.",
     followUp: "Crew → message Doug",
     helpfulContext: null,
   },
   AGENDA_UNAUTHENTICATED: {
     dougFacing: null,
     crewFacing: "Your link to this agenda expired. Reopen Doug's latest message to view it.",
     followUp: "Crew → reopen signed link",
     helpfulContext: null,
   },
   ```

2. **`components/agenda/AgendaPdfViewer.tsx`** (M9 Task 9.M7-D2) derives the HTTP status from `react-pdf`'s `onLoadError` payload (or a HEAD-fetch fallback) and routes:

   - 410 → `messageFor('AGENDA_GONE_FOR_CREW').crewFacing`
   - 401 → `messageFor('AGENDA_UNAUTHENTICATED').crewFacing`
   - Other (5xx, network) → existing retry-able copy (unchanged catalog code).

3. **`tests/messages/catalog.test.ts`** asserts both new codes are present with their canonical copy + null dougFacing + null helpfulContext. The codes-coverage test walks every `MessageCode` enum entry against the catalog.

4. **`tests/messages/_metaAdminAlertCatalog.test.ts`** is NOT extended — these codes are not `admin_alerts` producers (they have null dougFacing and emit no admin alert). Per M9 handoff §13 (codex R2 finding 3 closure), they belong in the codes-coverage test only.

5. **X.1 spec extractor parity** — the `scripts/extract-spec-codes.ts` deep-compare picks up the new §12.4 rows once they land in the spec body. Running the extractor before this amendment is absorbed into the spec would report orphans; running after the spec absorption converges.

## Spec body integration

After ratification, two things happen in order:

1. The two row lines above are inserted into `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` between line 2752 (`EMBEDDED_RECOVERY_REQUIRES_RESTAGE`) and line 2757 (`DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`).
2. This amendment file remains in place as the historical record. The §3 "ratified amendments" record in `00-overview.md` adds a reference to this file.

The spec body integration commit subject: `docs(spec): integrate §12.4 amendment — AGENDA_* catalog rows`. Separate from this amendment commit so the ratification record and the spec body cut are distinguishable in git history.

## Ratification record

- **Authored**: 2026-05-12
- **Effective SHA**: TBD (backfill on commit of this file)
- **Spec body integration SHA**: TBD (separate commit; tracks when the rows land in the live spec body)
- **Supersedes**: nothing (purely additive)
- **Authorized by**: Eric Weiss (M9 milestone owner per ROUTING.md M9 row)
- **Cross-CLI adversarial review**: required before spec body integration; single-round expected given the small surface (2 rows, parameterless copy, no parity ambiguity)
- **Reviewer**: GPT-5.5 / Codex (per ROUTING.md M9 row: Opus implements → Codex reviews)

## Self-consistency check (run inline before commit)

1. ✅ Both crewFacing strings are parameterless (no `<...>` placeholders) — X.1 extractor handles parameterless rows without `interpolate` calls.
2. ✅ §13.1 channel boundary held: copy directs the crew member to Doug (show-content question), NOT to the developer (which would be a `<ReportButton>` flow). M8 R2 M2 reference: the §13.1 inversion that shipped via a critique disposition is exactly the kind of error this check guards against.
3. ✅ followUp uses the "Crew → ..." convention consistent with other crew-only rows in §12.4.
4. ✅ Section neighborhood (line 2752 ↔ 2757) doesn't break ordering ambiguity: 2752 is `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, 2757 is `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`. Both are linked-asset / Drive-derived crew-facing errors. AGENDA_* rows slot into the same theme.
5. ✅ `helpfulContext` invariant honored: both rows have null dougFacing → no YAML appendix entry → X.1 parity test passes.
6. ✅ Distinct from existing codes: no name collision with any current §12.4 entry (verified via `grep "AGENDA_" docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` returns no pre-existing rows).
7. ✅ Distinct from existing trigger semantics: the agenda PDF surface is unique to this proxy; no other §12.4 row covers the same observation.
