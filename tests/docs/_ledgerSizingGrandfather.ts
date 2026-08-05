/**
 * The frozen grandfather registry for `tests/docs/_metaLedgerSizing.test.ts`.
 *
 * Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §3.3.
 *
 * WHAT THIS IS. The set of open ledger entries that carried no parseable
 * `**Effort:**` at the moment the sizing guard landed. They are exempt so the
 * guard can fail-by-default for NEW entries without a corpus-wide sizing pass
 * first — and sizing them in bulk would be guessing, which the 2026-08-03
 * sizing commit already ruled out ("an estimate on an undecided scope is a
 * guess wearing a label").
 *
 * CAPTURED, NOT PREDICTED. The list below was produced by the same parser the
 * guard uses, against the tree at capture time. The spec snapshotted 42 ids
 * while it was being written; the DEFERRED re-heading task then surfaced three
 * more entries to the walker and the demotion tasks archived others, so the
 * captured set lawfully differs from that number. The capture moment is
 * authoritative — see the spec's own amendment note.
 *
 * RATCHET-ONLY. Removing an id is ordinary work: size the entry, drop its row,
 * done — and the guard FAILS on an id that is listed but no longer needs to be,
 * so the registry cannot quietly accumulate dead rows. Adding an id is a
 * reviewed act that needs a stated reason in the PR; nothing here is a place to
 * park a new unsized entry.
 */
export const LEDGER_SIZING_GRANDFATHERED: readonly string[] = [
  "BL-TASK-ENROLLMENT-SINGLE-DEPTH",
  "BL-ADOPTION-PIN-REACHABILITY-BLIND",
  "BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY",
  "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE",
  "BL-CI-STALE-BRANCH-PROTECTION-COMMENT",
  "BL-PG-CRON-COVERAGE-UNRUN",
  "BL-E2E-COVERAGE-SCANNER-EXCLUSION-FILTERS",
  "BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT",
  "BL-DEV-GATE-GALLERY-SPEC-ROT",
  "BL-NULLCODE-STAMP-BATCH-2",
  "BL-AGENDA-PROSE-SECOND-DAY",
  "BL-AGENDA-POSITIONAL-DAYSET-FALLBACK",
  "BL-PREPARE-INTERNAL-FAULT-KIND",
  "BL-CRON-WORKBOOK-FAULT-CODE",
  "BL-EXPORT-BLANK-ROW-SEGMENTATION",
  "BL-TRANSPORT-ID-RESOLUTION",
  "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS",
  "BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE",
  "BL-FITWITHINCLIP-DOUBLE-ANCESTOR-WALK",
  "BL-ADMIN-SEMANTIC-Z-INDEX-SCALE",
  "BL-ATTENTION-PANEL-NAME-LEADING-SECTION",
  "BL-PRIVATE-IMAGE-PIPELINE",
  "BL-ADMIN-PER-SHOW-HISTORY",
  "BL-NON-CREW-UNDO",
  "BL-EM-DASH-POLICY",
  "BL-CREW-SHEET-TEMPLATE-V2",
  "BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST",
  "BL-CI-UNIT-GATE-EXCLUSIONS",
  "BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING",
  "STEP3-GALLERY-TAP-TARGETS-1",
  "NEWTAB-A11Y-RESIDUE-1",
  "VOICEOVER-ANNOUNCER-SPOTCHECK",
  "SHARELINK-COPY-REF-ORDERING-PROOF",
  "SHARELINK-CUE-VISIBILITY-1",
  "SHARELINK-CUE-FORCED-COLORS-1",
  "SHARELINK-CONSTANTS-INVENTORY-1",
  "ATTENTION-INDEX-JUMP-FOCUS-1",
  "ATTENTION-INDEX-ROW-DESTINATION-NAME-1",
  "UNDO-FAILURE-REANNOUNCE-1",
  "UNDO-UNCATALOGUED-CODE-CARD-1",
  "UNDO-DIALOG-LABEL-CONSTANT-1",
];
