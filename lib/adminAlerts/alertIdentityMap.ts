// Per-code "at-a-glance identity" declarations (spec §3.1 / §4).
//
// `ALERT_IDENTITY_MAP` is pure data: for each of the 42 admin_alerts codes,
// it declares HOW to identify that code's entity, as an ordered list of
// segment producers, OR declares the code `{ kind: "global" }` — an
// explicit, first-class "this code has no per-entity identity" value (not
// an omission). The completeness meta-test (`_metaAlertIdentityMap.test.ts`,
// spec §8.3) requires every code in the production write-site registry to
// appear here as one or the other.
//
// This module does no I/O and no resolution — `resolveAlertIdentities`
// (spec §3.2, a later task) consumes these declarations against each row's
// already-sanitized `IdentityContext` (see `identityTypes.ts`) to produce
// rendered `AlertIdentity` segments.

/**
 * One segment producer in a code's identity declaration (spec §3.1).
 *
 * - `showName` — resolve the row's effective show (`show_id` /
 *   `identityContext.resolution.show_id` / `drive_file_id`) to
 *   `shows.title`, labelled "Show".
 * - `sheetName` — same resolution as `showName`, labelled "Sheet" (the
 *   Google Sheet title IS the show title; `shows.drive_file_id` is unique).
 * - `crewName` — resolve `identityContext.resolution[key]` (a
 *   `crew_member_id`) to `crew_members.name`, show-scoped (spec §3.2).
 * - `contextField` — read a safe literal value already present in the
 *   projected `identityContext.display` (`file_name`, `sheet_name`, `repo`,
 *   `attempted_action`, `role_change_crew_names`, …). Restricted to
 *   allowlisted scalar/derived fields — diagnostic keys (`reason`,
 *   `error_name`, `rpc_error_code`, error messages) are never permitted
 *   (spec §3.1 "Entity-identity only"). `format` is an optional pure
 *   display transform (e.g. joining a capped name list); it is NOT I/O.
 * - `count` — the numeric value of `identityContext.counts[key]`.
 * - `email` — the authoritative OAuth/session email for this code (source
 *   resolved per-code by `resolveAlertIdentities`, spec §3.2 — never a
 *   crew-row fallback). Tagged `pii: true` downstream.
 */
export type SegmentSpec =
  | { kind: "showName" }
  | { kind: "sheetName" }
  | { kind: "crewName"; key: string }
  | { kind: "contextField"; key: string; label: string; format?: (value: string) => string }
  | { kind: "count"; key: string; label: string }
  | { kind: "email" };

/**
 * A code's identity declaration: either an explicit `global` (no per-entity
 * identity — system-wide or already-specific-in-copy), or an ordered list
 * of segment producers (must be non-empty per the completeness meta-test).
 */
export type IdentityMapEntry = { kind: "global" } | { segments: SegmentSpec[] };

/**
 * The full 45-code matrix (spec §4). 14 `global` entries, 31 with >=1
 * segment. Row numbers in comments match the spec §4 table for traceability.
 */
export const ALERT_IDENTITY_MAP: Record<string, IdentityMapEntry> = {
  // 1. AMBIGUOUS_EMAIL_BINDING — Show · email · "N crew rows"
  AMBIGUOUS_EMAIL_BINDING: {
    segments: [
      { kind: "showName" },
      { kind: "email" },
      { kind: "count", key: "crew_member_count", label: "crew row" },
    ],
  },

  // 2. OAUTH_IDENTITY_CLAIMED — Crew · email (new rows) · Show
  OAUTH_IDENTITY_CLAIMED: {
    segments: [
      { kind: "crewName", key: "crew_member_id" },
      { kind: "email" },
      { kind: "showName" },
    ],
  },

  // 3. PICKER_BOOTSTRAP_RPC_FAILED — Show (via identityContext.show_id)
  PICKER_BOOTSTRAP_RPC_FAILED: {
    segments: [{ kind: "showName" }],
  },

  // 4. PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED — global (justified: no show
  //    was resolvable, so no entity exists to name; context.slug is the
  //    raw unresolved URL fragment, not an identity).
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: { kind: "global" },

  // 5. CALLBACK_CLAIM_THREW — global (show_id null; only error_name
  //    diagnostic in context).
  CALLBACK_CLAIM_THREW: { kind: "global" },

  // 6. PICKER_SELECTION_RACE — Show · Crew (stale)
  PICKER_SELECTION_RACE: {
    segments: [{ kind: "showName" }, { kind: "crewName", key: "stale_crew_member_id" }],
  },

  // 7. PICKER_EPOCH_RESET — Show
  PICKER_EPOCH_RESET: {
    segments: [{ kind: "showName" }],
  },

  // 8. ASSET_RECOVERY_BYTES_EXCEEDED — Sheet
  ASSET_RECOVERY_BYTES_EXCEEDED: {
    segments: [{ kind: "sheetName" }],
  },

  // 9. ASSET_RECOVERY_REVISION_DRIFT — Sheet
  ASSET_RECOVERY_REVISION_DRIFT: {
    segments: [{ kind: "sheetName" }],
  },

  // 10. ASSET_RECOVERY_DRIFT_COOLDOWN — Sheet
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    segments: [{ kind: "sheetName" }],
  },

  // 11. WATCH_CHANNEL_ORPHANED — global (justified: folder-/diagnostic-
  //     scoped, no resolvable per-show entity; the pre-existing
  //     error_message <code> block is unchanged by this spec).
  WATCH_CHANNEL_ORPHANED: { kind: "global" },

  // 12. WEBHOOK_TOKEN_INVALID — global (only channel_id/reason
  //     diagnostics; sheet not resolvable).
  WEBHOOK_TOKEN_INVALID: { kind: "global" },

  // 13. EMBEDDED_RECOVERY_REQUIRES_RESTAGE — Sheet (via ctx:drive_file_id)
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    segments: [{ kind: "sheetName" }],
  },

  // 14. LIVE_ROW_CONFLICT — Sheet `file_name` (literal, ctx:file_name)
  LIVE_ROW_CONFLICT: {
    segments: [{ kind: "contextField", key: "file_name", label: "Sheet" }],
  },

  // ONBOARDING_SHEET_UNREADABLE — global (folder-level setup-scan alert; context
  // carries folder_id + failed_drive_file_ids, no per-entity identity).
  ONBOARDING_SHEET_UNREADABLE: { kind: "global" },

  // 15. ROLE_FLAGS_NOTICE — Sheet · crew name(s) (cap 3, "+N more") ·
  //     "N role change(s)" — info-severity: per-show + CLI only, NOT
  //     banner (severity/surface routing is a resolver/render concern,
  //     not part of this identity declaration).
  ROLE_FLAGS_NOTICE: {
    segments: [
      { kind: "sheetName" },
      { kind: "contextField", key: "role_change_crew_names", label: "Crew" },
      { kind: "count", key: "role_change_count", label: "role change" },
    ],
  },

  // 16. DRIVE_FETCH_FAILED — Sheet `sheet_name` (literal, ctx:sheet_name)
  DRIVE_FETCH_FAILED: {
    segments: [{ kind: "contextField", key: "sheet_name", label: "Sheet" }],
  },

  // 17. PARSE_ERROR_LAST_GOOD — already SPECIFIC (sheet in copy) — global entry
  PARSE_ERROR_LAST_GOOD: { kind: "global" },

  // 18. SHEET_UNAVAILABLE — already SPECIFIC (sheet in copy) — global entry
  SHEET_UNAVAILABLE: { kind: "global" },

  // 18b. RESYNC_SHRINK_HELD — already SPECIFIC (sheet in copy) — global entry
  RESYNC_SHRINK_HELD: { kind: "global" },
  // 18c. RESYNC_QUALITY_REGRESSED — already SPECIFIC (sheet in copy) — global entry
  RESYNC_QUALITY_REGRESSED: { kind: "global" },

  // 19. SYNC_STALLED — global (truly system-wide)
  SYNC_STALLED: { kind: "global" },

  // 20. EMAIL_DELIVERY_FAILED — Show (if present); resolver surfaces the
  //     segment only when show_id is present on the row.
  EMAIL_DELIVERY_FAILED: {
    segments: [{ kind: "showName" }],
  },

  // 21. EMAIL_NOT_CONFIGURED — global (truly system-wide)
  EMAIL_NOT_CONFIGURED: { kind: "global" },

  // 22. SHOW_FIRST_PUBLISHED — already SPECIFIC (sheet/crew/date in copy;
  //     info-severity) — global entry
  SHOW_FIRST_PUBLISHED: { kind: "global" },

  // 23. SHOW_UNPUBLISHED — already SPECIFIC (sheet in copy) — global entry
  SHOW_UNPUBLISHED: { kind: "global" },

  // 24. PENDING_SNAPSHOT_PROMOTE_STUCK — Show
  PENDING_SNAPSHOT_PROMOTE_STUCK: {
    segments: [{ kind: "showName" }],
  },

  // 25. PENDING_SNAPSHOT_ROLLBACK_STUCK — Sheet (via ctx:drive_file_id)
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    segments: [{ kind: "sheetName" }],
  },

  // 26. PENDING_SNAPSHOT_DELETE_STUCK — Show
  PENDING_SNAPSHOT_DELETE_STUCK: {
    segments: [{ kind: "showName" }],
  },

  // 27. OPENING_REEL_PERMISSION_DENIED — Sheet (via ctx:drive_file_id)
  OPENING_REEL_PERMISSION_DENIED: {
    segments: [{ kind: "sheetName" }],
  },

  // 28. OPENING_REEL_NOT_VIDEO — Sheet (via ctx:drive_file_id)
  OPENING_REEL_NOT_VIDEO: {
    segments: [{ kind: "sheetName" }],
  },

  // 29. REEL_DRIFTED — Sheet (via ctx:drive_file_id)
  REEL_DRIFTED: {
    segments: [{ kind: "sheetName" }],
  },

  // 30. EMBEDDED_ASSET_DRIFTED — Sheet (via ctx:drive_file_id)
  EMBEDDED_ASSET_DRIFTED: {
    segments: [{ kind: "sheetName" }],
  },

  // 31. REPORT_ORPHANED_LOST_LEASE — Show (orphan_url is an action link,
  //     not identity — out of scope here)
  REPORT_ORPHANED_LOST_LEASE: {
    segments: [{ kind: "showName" }],
  },

  // 32. REPORT_LOOKUP_INCONCLUSIVE — Show
  REPORT_LOOKUP_INCONCLUSIVE: {
    segments: [{ kind: "showName" }],
  },

  // 33. GITHUB_BOT_LOGIN_MISSING — global (truly system-wide)
  GITHUB_BOT_LOGIN_MISSING: { kind: "global" },

  // 34. REPORT_DUPLICATE_LIVE_MATCHES — Show
  REPORT_DUPLICATE_LIVE_MATCHES: {
    segments: [{ kind: "showName" }],
  },

  // 35. REPORT_OPEN_ORPHAN_LABEL — Show
  REPORT_OPEN_ORPHAN_LABEL: {
    segments: [{ kind: "showName" }],
  },

  // 36. REPORT_LEASE_THRASHING — Show
  REPORT_LEASE_THRASHING: {
    segments: [{ kind: "showName" }],
  },

  // 37. STALE_ORPHAN_REPORT — Show (if resolvable); report_id is an id,
  //     not identity.
  STALE_ORPHAN_REPORT: {
    segments: [{ kind: "showName" }],
  },

  // 38. TILE_SERVER_RENDER_FAILED — already SPECIFIC (sheet in copy) — global entry
  TILE_SERVER_RENDER_FAILED: { kind: "global" },

  // 39. TILE_PROJECTION_FETCH_FAILED — already SPECIFIC (sheet in copy) — global entry
  TILE_PROJECTION_FETCH_FAILED: { kind: "global" },

  // 40. BRANCH_PROTECTION_DRIFT — repo `repo` (literal, ctx:repo)
  BRANCH_PROTECTION_DRIFT: {
    segments: [{ kind: "contextField", key: "repo", label: "Repo" }],
  },

  // 41. BRANCH_PROTECTION_MONITOR_AUTH_FAILED — repo `repo` (literal, ctx:repo)
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    segments: [{ kind: "contextField", key: "repo", label: "Repo" }],
  },

  // 42. WIZARD_SESSION_SUPERSEDED_RACE — Sheet `file_name` (literal,
  //     durable) · action `attempted_action`
  WIZARD_SESSION_SUPERSEDED_RACE: {
    segments: [
      { kind: "contextField", key: "file_name", label: "Sheet" },
      { kind: "contextField", key: "attempted_action", label: "Action" },
    ],
  },
};
