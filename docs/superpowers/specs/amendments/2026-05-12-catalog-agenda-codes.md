# §12.4 amendment — AGENDA_* crew-facing catalog rows

**Date**: 2026-05-12
**Owner**: Eric Weiss (M9 milestone owner)
**Spec target**: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §12.4
**Authorizing context**: M9 Task 9.0.A1 (handoff `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M9-polish.md` §3 + §A). Triggered by R2 codex adversarial review of Task 9.0 commit `49bc26b` (finding 2 — M7-D2 introducing new catalog codes requires explicit spec authorization).
**Type**: Additive. Supersedes nothing.

## Summary

Add two crew-facing display codes to §12.4 covering the two crew-recoverable error states `AgendaPdfViewer` surfaces when the agenda asset proxy at `app/api/asset/agenda/[show]/[id]/route.ts` returns a non-success status:

- **`AGENDA_GONE_FOR_CREW`** — HTTP **410 OR 403** from the proxy. Covers every asset-side and authorization-side failure whose crew-recovery is "ask Doug for a fresh link." The comprehensive trigger taxonomy (every Drive metadata branch, the validator chain's revoked-link fallback, cross-show mismatches, pre-flight size gate, Range total-size guard, etc.) lives in the implementation: `app/api/asset/agenda/[show]/[id]/route.ts` + `lib/auth/validateCrewAssetSession.ts`. Test coverage of the full status→code mapping lives in Task 9.M7-D2.
- **`AGENDA_UNAUTHENTICATED`** — HTTP **401** from the proxy. Covers every live 401 outcome — no credentials, expired link sessions (`SESSION_NOT_FOUND`, `SESSION_ABSOLUTE_TIMEOUT`, `SESSION_IDLE_TIMEOUT`), key rotation (`LINK_SESSION_KEY_ROTATED`), Google fallthrough — whose crew-recovery is "reopen Doug's link." Comprehensive trigger map lives in `lib/auth/validateLinkSession.ts` + `lib/auth/validateGoogleSession.ts` + `lib/auth/validateCrewAssetSession.ts`.

Both codes are CREW-FACING ONLY. `dougFacing` is `—` (null); no `helpfulContext` YAML entry per the §12.4 appendix invariant (lines 2853-2856 of the spec) that omits null-dougFacing codes.

Distinct from a transient infrastructure failure (which routes through the existing 5xx path's catalog code and retries inline). The 410/403 case is non-retryable from the crew side. The 401 case is recoverable by reopening Doug's signed link.

**Why 410 and 403 collapse to one row**: the proxy currently emits status-only responses for both 410 and 403 (no machine-readable distinction). `AgendaPdfViewer` cannot — and should not need to — distinguish asset-gone from revoked-link from cross-show, because the crew-side recovery is identical. Splitting would require expanding the proxy contract to emit JSON error codes; out of M7-D2 / v1-polish scope. The cross-show 403 case is rare and (per `SHOW_REALTIME_CROSS_SHOW_FORBIDDEN` / `SHOW_VERSION_CROSS_SHOW_FORBIDDEN` in §12.4) is an admin-info security signal whose crew-facing recovery is identical to a stale link cookie.

**Implementation owns the taxonomy** (added at R3 amendment-review repair): this amendment authorizes two new `MessageCode` enum entries + their exact `crewFacing` copy + their §12.4 section placement. The comprehensive mapping of "which HTTP status from which validator/route branch produces which code" is owned by `components/agenda/AgendaPdfViewer.tsx`, the proxy route, the validators, and their test suites. Review rounds R1–R3 surfaced repeated factual gaps when the amendment text tried to enumerate the proxy taxonomy exhaustively — because runtime behavior of three composed validators + an async stream + Range guards is not the spec's domain. The trigger taxonomy at the spec layer is non-exhaustive by design; Task 9.M7-D2's TDD checklist is where the exhaustive status→code coverage lives.

## Why now

Today's `AgendaPdfViewer` collapses every PDF load failure to a single retry-able message ("couldn't open the agenda right now"). The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) — retrying spins forever — and wrong for 401 (link expired) where the user has a different recovery path (reopen Doug's message). M7-D2 (deferred from M7 Task 7.9 §12 `/impeccable audit` Finding G.3, 2026-05-11; see `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/DEFERRED.md` M7-D2) routes these distinct error classes to distinct catalog rows so `messageFor(...)` returns the right copy.

Per `AGENTS.md` §1.5 (no raw error codes in user-visible UI) + §1.7 (spec is canonical), adding new MessageCodes requires explicit spec authorization. This amendment is that authorization.

## Section placement

Insert the two new rows in §12.4 between lines 2752 and 2757 of the live spec — between `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` and `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`. The natural neighborhood is "linked-asset / staged-asset crew-facing errors." Both new rows belong to the same domain (a linked asset's status changed in a way crew see directly).

Order within the insertion window: `AGENDA_GONE_FOR_CREW` first, then `AGENDA_UNAUTHENTICATED`. Alphabetical by code suffix; also matches "permanent → recoverable" severity ordering.

## Canonical rows

Verbatim §12.4 table rows (markdown pipe-delimited; copy into the live spec):

```markdown
| `AGENDA_GONE_FOR_CREW` | `AgendaPdfViewer` proxy at `app/api/asset/agenda/[show]/[id]/route.ts` returned HTTP **410 Gone** OR **403 Forbidden** — every asset-side and authorization-side failure whose crew-recovery is "ask Doug for a fresh link." Covers asset-gone (Drive errors, mimeType mismatch, oversize, missing-from-`agenda_links`), unpublished-show + non-admin viewer, revoked-link-session fallback, cross-show link/Google envelope, and viewer-show mismatch. Distinct from transient network failure (retry-able 5xx path) and from mid-stream byte-limit (which surfaces as an aborted body, not 410). See `route.ts` + `lib/auth/validateCrewAssetSession.ts` for the comprehensive header-emitting trigger list; Task 9.M7-D2 owns the exhaustive status→code TDD coverage. | — | "This agenda isn't available anymore. Ask Doug for a fresh link." | Crew → message Doug |
| `AGENDA_UNAUTHENTICATED` | `AgendaPdfViewer` proxy returned HTTP **401 Unauthorized** — every live 401 outcome from the link-or-Google validator chain whose crew-recovery is "reopen Doug's most recent signed link." Covers no-credentials, recoverable session-expiry (`SESSION_NOT_FOUND` / `SESSION_ABSOLUTE_TIMEOUT` / `SESSION_IDLE_TIMEOUT`), terminal `LINK_SESSION_KEY_ROTATED`, and Google `continue` fallthroughs (missing auth session, no user/email, no crew match). Distinct from 403 cross-show (covered by `AGENDA_GONE_FOR_CREW`) and 410 revoked-link (also `AGENDA_GONE_FOR_CREW`). See `lib/auth/validateLinkSession.ts` + `lib/auth/validateGoogleSession.ts` + `lib/auth/validateCrewAssetSession.ts` for the comprehensive trigger list; Task 9.M7-D2 owns the exhaustive status→code TDD coverage. | — | "Your link to this agenda expired. Reopen Doug's latest message to view it." | Crew → reopen signed link |
```

## `helpfulContext` YAML appendix

**No entries added.** Per the §12.4 appendix invariant at spec lines 2853-2856: codes whose `dougFacing` is `—`/null are OMITTED from the YAML appendix. The X.1 extractor normalizes missing keys to `helpfulContext: null` and fails the build if a null-dougFacing code carries a `helpfulContext` entry. Both `AGENDA_*` codes have `dougFacing: —`, so they are absent from the YAML.

## Cross-cutting impact

1. **`lib/messages/catalog.ts`** (M9 Task 9.4) adds two typed entries:

   ```ts
   AGENDA_GONE_FOR_CREW: {
     dougFacing: null,
     crewFacing: "This agenda isn't available anymore. Ask Doug for a fresh link.",
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

2. **`components/agenda/AgendaPdfViewer.tsx`** (M9 Task 9.M7-D2) derives the HTTP status from `react-pdf`'s `onLoadError` payload (or a HEAD-fetch fallback against the proxy URL when `react-pdf` doesn't expose status) and routes:

   - 410 OR 403 → `messageFor('AGENDA_GONE_FOR_CREW').crewFacing`
   - 401 → `messageFor('AGENDA_UNAUTHENTICATED').crewFacing`
   - Other (5xx, network) → existing retry-able copy (unchanged catalog code).

   The 410-or-403 merge is deliberate; per the "Why 410 and 403 collapse" rationale in the Summary, the crew's recovery action is identical for both status families. Task 9.M7-D2's TDD checklist needs:
   - one test case per terminal status code (proxy mocked to 410, 403, 401, 500) asserting the right catalog row is rendered;
   - additional 401 sub-cases: `SESSION_NOT_FOUND`, `SESSION_ABSOLUTE_TIMEOUT`, `SESSION_IDLE_TIMEOUT`, `LINK_SESSION_KEY_ROTATED` (all 4 sub-paths from `validateLinkSession`) all map to `AGENDA_UNAUTHENTICATED`;
   - one explicit negative-coverage test for mid-stream `ByteLimitExceededError`: assert the crew sees the existing 5xx / retry-able copy, NOT `AGENDA_GONE_FOR_CREW`, because the streaming-path byte-limit failure is not 410-observable.

3. **`tests/messages/catalog.test.ts`** asserts both new codes are present with their canonical copy + null dougFacing + null helpfulContext. The codes-coverage test walks every `MessageCode` enum entry against the catalog.

4. **`tests/messages/_metaAdminAlertCatalog.test.ts`** is NOT extended — these codes are not `admin_alerts` producers (they have null dougFacing and emit no admin alert). Per M9 handoff §13 (codex R2 finding 3 closure), they belong in the codes-coverage test only.

5. **X.1 spec extractor parity** — the `scripts/extract-spec-codes.ts` deep-compare picks up the new §12.4 rows once they land in the spec body. Running the extractor before this amendment is absorbed into the spec would report orphans; running after the spec absorption converges.

## Spec body integration

After ratification, two things happen in order:

1. The two row lines above are inserted into `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` between line 2752 (`EMBEDDED_RECOVERY_REQUIRES_RESTAGE`) and line 2757 (`DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`).
2. This amendment file remains in place as the historical record. The §3 "ratified amendments" record in `00-overview.md` adds a reference to this file.

The spec body integration commit subject: `docs(spec): integrate §12.4 amendment — AGENDA_* catalog rows`. Separate from this amendment commit so the ratification record and the spec body cut are distinguishable in git history.

## Ratification record

- **Authored**: 2026-05-12 at SHA `946b811`
- **Finalized**: 2026-05-12 at SHA `ac905da` (after R1+R2+R3 amendment-review iterations; R4 verdict APPROVE confirmed convergence)
- **Spec body integration SHA**: backfilled in the integration commit immediately after this line
- **Supersedes**: nothing (purely additive)
- **Authorized by**: Eric Weiss (M9 milestone owner per ROUTING.md M9 row)
- **Cross-CLI adversarial review**: completed across 4 rounds (R1 needs-attention → R1 repair `ac5983d`; R2 needs-attention → R2 repair `d34c910`; R3 needs-attention → R3 repair `ac905da`; R4 APPROVE)
- **Reviewer**: GPT-5.5 / Codex (per ROUTING.md M9 row: Opus implements → Codex reviews)
- **Convergence lesson** (recorded for future amendments): R1–R3 surfaced same-vector recurrence on trigger enumeration. R3's structural shift ("implementation owns the taxonomy") closed the loop in a single round. Future amendments touching runtime route taxonomy should stay at HTTP-status + crew-recovery level from the start; comprehensive trigger enumeration belongs in implementation + tests, not spec amendment text.

## Self-consistency check (run inline before commit)

1. ✅ Both crewFacing strings are parameterless (no `<...>` placeholders) — X.1 extractor handles parameterless rows without `interpolate` calls.
2. ✅ §13.1 channel boundary held: copy directs the crew member to Doug (show-content question), NOT to the developer (which would be a `<ReportButton>` flow). M8 R2 M2 reference: the §13.1 inversion that shipped via a critique disposition is exactly the kind of error this check guards against.
3. ✅ followUp uses the "Crew → ..." convention consistent with other crew-only rows in §12.4.
4. ✅ Section neighborhood (line 2752 ↔ 2757) doesn't break ordering ambiguity: 2752 is `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, 2757 is `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`. Both are linked-asset / Drive-derived crew-facing errors. AGENDA_* rows slot into the same theme.
5. ✅ `helpfulContext` invariant honored: both rows have null dougFacing → no YAML appendix entry → X.1 parity test passes.
6. ✅ Distinct from existing codes: no name collision with any current §12.4 entry (verified via `grep "AGENDA_" docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` returns no pre-existing rows).
7. ✅ Distinct from existing trigger semantics: the agenda PDF surface is unique to this proxy; no other §12.4 row covers the same observation.
8. ✅ Implementation-owns-taxonomy disclaimer present (R3 amendment-review repair, codex review of SHA d34c910): the canonical rows summarize at HTTP-status level + crew-recovery level. The comprehensive trigger taxonomy lives in the implementation (the route, the validators, the catalog file, and Task 9.M7-D2's TDD checklist) — not in the amendment text. R1–R3 of the amendment review surfaced repeated factual gaps when the amendment attempted exhaustive enumeration, because runtime composed-validator + async-stream behavior is not the spec's domain.
9. ✅ The 410-or-403 merge to one catalog row is justified inline in the Summary (proxy emits status-only bodies; user-recovery is identical; cross-show 403 follows the existing pattern of `SHOW_REALTIME_CROSS_SHOW_FORBIDDEN` security-signal codes that don't surface to crew). Splitting would require expanding the proxy contract — explicitly out of M7-D2 / v1-polish scope.
10. ✅ Mid-stream `ByteLimitExceededError` exclusion is noted in the AGENDA_GONE_FOR_CREW row text (R2 amendment-review finding 1). Task 9.M7-D2's TDD checklist asserts that case routes through the 5xx retry-able copy.
11. ✅ Copy consistency between canonical row and `lib/messages/catalog.ts` impact block: both use exactly `"This agenda isn't available anymore. Ask Doug for a fresh link."` (R3 amendment-review finding 3 closure — earlier draft had "fresh link" in the canonical row but "new link" in the impact block).
