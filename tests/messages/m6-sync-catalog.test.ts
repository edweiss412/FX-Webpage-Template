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
  "EMBEDDED_ASSET_DRIFTED",
  "REEL_DRIFTED",
  "MISSING_REVIEWER_CHOICE",
  "EXTRA_REVIEWER_CHOICE",
  "DUPLICATE_REVIEWER_CHOICE",
  "INVALID_REVIEWER_ACTION",
  "PENDING_SYNC_NOT_FOUND",
  "SHOW_BUSY_RETRY",
  "SYNC_FILE_FAILED",
  "SYNC_INFRA_ERROR",
  "SYNC_STEP_TIMEOUT",
  "DRIVE_METADATA_MISSING",
  "SHEET_UNAVAILABLE",
  "LOCK_OWNERSHIP_ASSERTION_FAILED",
  "SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED",
  "UNPUBLISH_TOKEN_CONSUMED",
  "UNPUBLISH_TOKEN_EXPIRED",
] as const;

const M6_PIN2_EXTENSION_ROUTE_CODES = [
  "FINALIZE_OWNED_SHOW",
  "MISSING_REVIEWER_CHOICE",
  "EXTRA_REVIEWER_CHOICE",
  "DUPLICATE_REVIEWER_CHOICE",
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

  test("reviewer-choice validation entries match §12.4 copy and helpful context", () => {
    expect(MESSAGE_CATALOG.MISSING_REVIEWER_CHOICE).toMatchObject({
      dougFacing:
        "We need your decision for every item — looks like one was skipped. Refresh and try again.",
      crewFacing: null,
      followUp: "Doug → refresh admin",
      helpfulContext:
        "When you Apply a sheet, every triggered review item needs your decision. Your submission was missing a decision for at least one item — usually because the form's state got out of sync with the items the server was tracking. Refresh the admin page (the panel will re-render with the current items) and re-submit your decisions.",
    });
    expect(MESSAGE_CATALOG.EXTRA_REVIEWER_CHOICE).toMatchObject({
      dougFacing:
        "Something doesn't match between what you reviewed and what we have on file. Refresh and try again.",
      crewFacing: null,
      followUp: "Doug → refresh admin",
      helpfulContext:
        "Your Apply submission carried a decision for an item the server isn't tracking — usually because the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page so the panel re-renders against the current staged parse, then re-submit your decisions.",
    });
    expect(MESSAGE_CATALOG.DUPLICATE_REVIEWER_CHOICE).toMatchObject({
      dougFacing: "We got the same decision twice for one item. Refresh and try again.",
      crewFacing: null,
      followUp: "Doug → refresh admin",
      helpfulContext:
        "Your Apply submission carried two decisions for the same item id. The form should normally prevent this; you've reached this code via a stale or duplicated form state. Refresh the admin page and re-submit your decisions cleanly.",
    });
    expect(MESSAGE_CATALOG.INVALID_REVIEWER_ACTION).toMatchObject({
      dougFacing: "That action isn't valid for this item. Refresh and try again.",
      crewFacing: null,
      followUp: "Doug → refresh admin",
      helpfulContext:
        "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item's invariant). Your submission carried an action value that isn't in the allowed list for one of the items — usually because the form was hand-edited or the page is running a stale build. Refresh the admin page and re-submit using the form controls.",
    });
  });

  test("Amendment 9 first-publish and unpublish entries match §12.4 copy", () => {
    expect(MESSAGE_CATALOG.SHOW_FIRST_PUBLISHED).toMatchObject({
      severity: "info",
      dougFacing:
        "_<sheet-name>_ is now live for crew at its share-token URL. _<crew-count>_ crew, _<show-date>_. **Made a mistake?** Archive the show from its page — its crew link switches off until you unarchive and republish.",
      crewFacing: null,
      followUp: null,
      helpfulContext:
        "We auto-published this show because the parse looked clean — all the safety checks passed. The crew page is now live at its share-token URL. If you dragged in the wrong sheet or weren't ready, archive the show from its per-show page — that stops the share-token URL from resolving until you unarchive and republish.",
    });
    expect(MESSAGE_CATALOG.SHOW_UNPUBLISHED).toMatchObject({
      dougFacing:
        "_<sheet-name>_ has been unpublished. Its share-token URL no longer works. Drag the sheet back into your watched folder when you're ready to publish again.",
      crewFacing: null,
      followUp: "Doug → optionally re-share when ready",
      helpfulContext:
        "You clicked Unpublish on a recently-published show. The show is now archived, its share-token URL no longer resolves, and crew can no longer reach the page. Nothing is lost — your sheet is unchanged. Drag it back into the watched folder when you're ready to publish for real.",
    });
  });
});
