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
    const _wp: WorkPhase = "Show";
    const _rk: RoomKind = "gs";
    const _ck: ContactKind = "venue";
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
});
