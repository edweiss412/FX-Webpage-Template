import { describe, it, expect } from "vitest";
import type {
  ParseWarning,
  ParseError,
  DateRestriction,
  StageRestriction,
  RoleFlag,
  CrewMemberRow,
  ClientContact,
  ClientContactPerson,
  ShowRow,
  WorkPhase,
  HotelReservationRow,
  RoomKind,
  RoomRow,
  TransportScheduleEntry,
  TransportationRow,
  ContactKind,
  ContactRow,
  PullSheetItem,
  PullSheetCase,
  EmbeddedImageStub,
  LinkedFolderRef,
  LinkedFolderItemStub,
  OpeningReelRef,
  OpeningReelPinned,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
  PersistedDiagrams,
  ParsedSheet,
  ParseResult,
  TriggeredReviewItem,
  InvariantOutcome,
} from "@/lib/parser/types";

describe("parser/types", () => {
  it("exports every canonical type contract", () => {
    // Construct a minimal value of each top-level type to prove the type compiles
    // and the field shape matches the spec. This test is satisfied by the type
    // system at compile time — runtime check is just `expect(true).toBe(true)`.
    const _w: ParseWarning = { severity: "info", code: "X", message: "x" };
    const _e: ParseError = { code: "X", message: "x" };
    const _dr: DateRestriction = { kind: "none" };
    const _sr: StageRestriction = { kind: "none" };
    const _rf: RoleFlag = "LEAD";
    const _restrictionFlag: RoleFlag = "ONLY";
    const _wp: WorkPhase = "Show";
    const _rk: RoomKind = "gs";
    const _ck: ContactKind = "venue";
    expect([_rf, _restrictionFlag]).toEqual(["LEAD", "ONLY"]);
    expect(true).toBe(true);
  });

  it("DateRestriction is exhaustively discriminated", () => {
    const cases: DateRestriction[] = [
      { kind: "explicit", days: ["2026-04-15"] },
      { kind: "unknown_asterisk", days: null },
      { kind: "none" },
    ];
    expect(cases).toHaveLength(3);
  });

  it("ParsedSheet diagrams.embeddedImages is the empty-tuple type at parse time", () => {
    const stub: ParsedSheet["diagrams"]["embeddedImages"] = [];
    expect(stub).toHaveLength(0);
  });

  it("ParsedSheet diagrams.linkedFolderItems is the empty-tuple type at parse time", () => {
    const stub: ParsedSheet["diagrams"]["linkedFolderItems"] = [];
    expect(stub).toHaveLength(0);
  });

  it("OpeningReelPinned compiles with mimeType field (non-null and null variants)", () => {
    const withMime: OpeningReelPinned = {
      driveFileId: "abc123",
      drive_modified_time: "2026-01-01T00:00:00Z",
      headRevisionId: "rev1",
      mimeType: "video/mp4",
    };
    const withNullMime: OpeningReelPinned = {
      driveFileId: "abc123",
      drive_modified_time: "2026-01-01T00:00:00Z",
      headRevisionId: "rev1",
      mimeType: null,
    };
    expect(withMime.mimeType).toBe("video/mp4");
    expect(withNullMime.mimeType).toBeNull();
  });

  it("InvariantOutcome and TriggeredReviewItem unions construct under their declared discriminators", () => {
    const _passOutcome: InvariantOutcome = { outcome: "pass" };
    // Use the simplest TriggeredReviewItem variant (fewest required fields).
    const _reviewItem: TriggeredReviewItem = {
      id: "test-id",
      invariant: "FIRST_SEEN_REVIEW",
    };
    expect(typeof _passOutcome.outcome).toBe("string");
  });
});
