import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const M6_SYNC_CODES = [
  "STALE_WRITE_ABORTED",
  "STALE_PUSH_ABORTED",
  "STALE_MANUAL_REPLAY_ABORTED",
  "CONCURRENT_SYNC_SKIPPED",
  "STAGED_PARSE_REVISION_RACE",
  "STAGED_PARSE_REVISION_RACE_COOLDOWN",
  "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
  "STAGED_PARSE_SOURCE_GONE",
  "STAGED_PARSE_OUTDATED",
  "STAGED_PARSE_RESTAGED_INLINE",
  "STAGED_PARSE_SUPERSEDED",
  "STALE_DISCARD_REJECTED",
  "WIZARD_SESSION_SUPERSEDED",
  "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
  "WIZARD_ISOLATION_INDEXES_MISSING",
  "LIVE_ROW_CONFLICT",
  "FINALIZE_OWNED_SHOW",
  "WEBHOOK_HEADERS_MISSING",
  "WEBHOOK_NOOP_ALREADY_SYNCED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "LINKED_ASSET_DRIFTED",
  "REEL_DRIFTED",
  "MISSING_REVIEWER_CHOICE",
  "INVALID_REVIEWER_ACTION",
  "PENDING_SYNC_NOT_FOUND",
  "SHOW_BUSY_RETRY",
  "SYNC_FILE_FAILED",
  "SYNC_INFRA_ERROR",
  "SYNC_STEP_TIMEOUT",
  "DRIVE_METADATA_MISSING",
  "SHEET_UNAVAILABLE",
  "LOCK_OWNERSHIP_ASSERTION_FAILED",
] as const;

const M6_PIN2_EXTENSION_ROUTE_CODES = [
  "FINALIZE_OWNED_SHOW",
  "MISSING_REVIEWER_CHOICE",
  "INVALID_REVIEWER_ACTION",
  "PENDING_SYNC_NOT_FOUND",
  "SHOW_BUSY_RETRY",
  "STALE_DISCARD_REJECTED",
  "STAGED_PARSE_OUTDATED",
  "STAGED_PARSE_SOURCE_GONE",
  "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
  "STAGED_PARSE_SUPERSEDED",
  "SYNC_INFRA_ERROR",
  "WIZARD_SESSION_SUPERSEDED",
] as const;

describe("M6 sync message catalog", () => {
  test.each(M6_SYNC_CODES)("%s is cataloged before admin UI renders it", (code) => {
    const entry = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null } | undefined>)[
      code
    ];

    expect(entry, `${code} missing from MESSAGE_CATALOG`).toBeDefined();
  });

  test.each(M6_PIN2_EXTENSION_ROUTE_CODES)(
    "%s emitted by Pin-2 extension routes is cataloged",
    (code) => {
      const entry = (MESSAGE_CATALOG as Record<string, { dougFacing: string | null } | undefined>)[
        code
      ];

      expect(entry, `${code} missing from MESSAGE_CATALOG`).toBeDefined();
      expect(entry?.dougFacing, `${code} needs Doug-facing copy`).toEqual(expect.any(String));
    },
  );
});
