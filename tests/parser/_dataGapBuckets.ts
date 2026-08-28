/**
 * tests/parser/_dataGapBuckets.ts
 * (wizard-review-attention-menu spec §2 / §12.2 — Task 3)
 *
 * The persisted-ParseWarning code buckets, moved VERBATIM out of
 * `dataGapsClassCompleteness.test.ts` (which imports them back, unchanged) so a
 * second consumer can read them: the I-1 corpus in
 * `tests/lib/admin/warningAttention.test.ts` needs the warn-severity codes that
 * live OUTSIDE `GAP_CLASSES`, and re-listing them there would be a second copy
 * that drifts the first time a code is added.
 *
 * Sizes are pinned by the completeness suite, not here — that suite is still the
 * owner of the partition contract.
 */

/** 8 — warn-severity but semantically benign (parser fixed/adjusted; data landed). */
export const BENIGN_WARN_CODES = new Set<string>([
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
  "FIELD_LABEL_AUTOCORRECTED",
  "LEADING_COLUMN_AUTOCORRECTED",
  "AGENDA_SCHEDULE_TIME_ADJUSTED",
  "AGENDA_SCHEDULE_LOW_CONFIDENCE",
]);

/** 2 — info-severity benign. */
export const BENIGN_INFO_CODES = new Set<string>([
  "TYPO_NORMALIZED",
  "DAY_RESTRICTION_DOUBLE_LOCATION",
]);

/** 11 — persisted warn ParseWarnings, but Drive-asset enrichment, NOT sheet parse. */
export const ASSET_WARN_CODES = new Set<string>([
  "DIAGRAMS_TAB_MISSING",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  "LINKED_FOLDER_OVERFLOW_TRUNCATED",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "REEL_DRIFTED",
  "OPENING_REEL_PERMISSION_DENIED",
  "OPENING_REEL_NOT_VIDEO",
]);

/**
 * Ignore-list — real MESSAGE_CATALOG codes that appear as literals in
 * lib/parser / lib/sync but are NOT counted gap `ParseWarning`s (so they never
 * reach the data-quality badge). This includes admin/sync control codes AND
 * parser hardErrors (`ParseError`, no severity — fatal parse failures, a
 * different surface from warn-severity data gaps). They are collected by the
 * mechanism-agnostic scan, so they MUST be listed here to satisfy
 * `collected ∩ catalog ⊆ partition ∪ ignore`. Grouped by family. Bootstrapped
 * empirically 2026-07-04 (spec §3.2); a NEW code added as a literal fails the
 * scan until classified — safe (fails closed).
 */
export const NON_GAP_CATALOG_CODES = new Set<string>([
  // parser hardErrors (ParseError, not a persisted ParseWarning — fatal, held for
  // review via the parse-failure path, never counted as a warn-severity data gap)
  "VERSION_AMBIGUOUS",
  // admin_alerts / lifecycle codes raised from the sync path (not parse warnings)
  "SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED",
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
  "ONBOARDING_SCAN_REVIEW",
  "ROLE_FLAGS_NOTICE",
  // use-raw decision auto-invalidation (sync path): a content-pinned use-raw decision
  // whose cell changed is dropped + logged via show_change_log, not a parse-warning data gap
  "USE_RAW_DECISION_STALE",
  // sync-problem / infra codes (surface as admin alerts / results, not parse warnings)
  "SHEET_UNAVAILABLE",
  "PARSE_ERROR_LAST_GOOD",
  "RESYNC_SHRINK_HELD",
  "RESYNC_QUALITY_REGRESSED",
  "SYNC_FILE_FAILED",
  "SYNC_INFRA_ERROR",
  "SYNC_STEP_TIMEOUT",
  // The sync_log SINK failed while the operation it observes continued (spec
  // 2026-08-15-sync-log-emit-guard-design). An app_events-only escalation about the
  // LOGGING channel, never a statement about the sheet's data — it says a row is
  // missing from sync_log, not that a field failed to read.
  "SYNC_LOG_EMIT_FAILED",
  "CONCURRENT_SYNC_SKIPPED",
  "WEBHOOK_NOOP_ALREADY_SYNCED",
  "DRIVE_FETCH_FAILED",
  "DRIVE_METADATA_MISSING",
  "LIVE_ROW_CONFLICT",
  "LOCK_OWNERSHIP_ASSERTION_FAILED",
  // staged-parse control codes (staging state machine, not parse warnings)
  "STAGED_PARSE_OUTDATED",
  // finalize consistency gate (Task 11) — the override-snapshot mismatch reuses this
  // existing Phase-D blocking code; a control code surfaced via lookup, not a data gap.
  "STAGED_PARSE_OUTDATED_AT_PHASE_D",
  "STAGED_PARSE_RESTAGED_INLINE",
  "STAGED_PARSE_RESULT_CORRUPT",
  "STAGED_PARSE_REVISION_RACE",
  "STAGED_PARSE_REVISION_RACE_COOLDOWN",
  "STAGED_PARSE_SOURCE_GONE",
  "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
  "STAGED_PARSE_SUPERSEDED",
  "STAGED_REVIEW_ITEMS_CORRUPT",
  // reviewer-choice validation codes (wizard, not parse warnings)
  "DUPLICATE_REVIEWER_CHOICE",
  "EXTRA_REVIEWER_CHOICE",
  "INVALID_REVIEWER_ACTION",
  "MISSING_REVIEWER_CHOICE",
  // pending sync/ingestion + snapshot stuck codes
  "PENDING_INGESTION_NOT_FOUND",
  "PENDING_SYNC_NOT_FOUND",
  "PENDING_SNAPSHOT_DELETE_STUCK",
  "PENDING_SNAPSHOT_PROMOTE_STUCK",
  "PENDING_SNAPSHOT_ROLLBACK_STUCK",
  // wizard-session / isolation codes
  "WIZARD_ISOLATION_INDEXES_MISSING",
  "WIZARD_SESSION_SUPERSEDED",
  "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
  // stale-write / replay abort codes
  "STALE_DISCARD_REJECTED",
  "STALE_MANUAL_REPLAY_ABORTED",
  "STALE_PUSH_ABORTED",
  "STALE_WRITE_ABORTED",
  // unpublish-token lifecycle
  "UNPUBLISH_TOKEN_CONSUMED",
  "UNPUBLISH_TOKEN_EXPIRED",
  // MI11 drive-recheck / hold codes
  "MI11_DRIVE_RECHECK_FAILED",
  "MI11_HOLD_ALREADY_RESOLVED",
  // pull-sheet override control (Task 6) — the S4 "included archived tab changed,
  // re-confirm" warning; surfaced in the override review card, NOT a counted data gap
  // (only PULL_SHEET_ON_ARCHIVED_TAB, the offer, is in GAP_CLASSES).
  "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
  // asset-recovery control codes (cooldown/drift accounting, not persisted parse warnings)
  "ASSET_RECOVERY_BYTES_EXCEEDED",
  "ASSET_RECOVERY_DRIFT_COOLDOWN",
  "ASSET_RECOVERY_REVISION_DRIFT",
]);
