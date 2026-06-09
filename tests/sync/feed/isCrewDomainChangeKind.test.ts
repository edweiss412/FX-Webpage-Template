import { describe, expect, test } from "vitest";
import { isCrewDomainChangeKind } from "@/lib/sync/feed/readShowChangeFeed";

describe("isCrewDomainChangeKind", () => {
  test.each(["crew_added", "crew_removed", "crew_renamed"])(
    "crew-domain kind %s is undo-eligible",
    (kind) => expect(isCrewDomainChangeKind(kind)).toBe(true),
  );
  // Canonical taxonomy (00-overview resolutions #3 + #13): change_kind is
  // ALWAYS structural, NEVER an MI-* value. Renames are 'crew_renamed'; a
  // gate-resolved MI-11 email change logs as 'crew_email_changed' (NOT undoable).
  test.each(["crew_email_changed", "field_changed", "section_shrunk", "asset_drift"])(
    "non-crew kind %s is notification-only",
    (kind) => expect(isCrewDomainChangeKind(kind)).toBe(false),
  );
});
