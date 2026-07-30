// Spec 2026-07-27-export-blank-row-segmentation §6 T1 — mid-block section-start
// predicate + crew-role-cell discriminator. Failure modes pinned: a
// case-insensitive or prefix-happy isMidBlockSectionStart regression re-admits
// the 85 probe-1 corpus hits (mixed-case FORM/INFO rows shredding live sheets);
// a single-token isCrewRoleCell loosening re-admits the probe-4 false-positive
// classes (GS Strike Time, Setup / Load In Date / Time, agenda cells).
import { describe, it, expect } from "vitest";
import { isMidBlockSectionStart, isCrewRoleCell } from "@/lib/parser/knownSections";

describe("isMidBlockSectionStart (spec §2.1)", () => {
  it("uppercase exact registry headers start a new block", () => {
    expect(isMidBlockSectionStart("HOTEL")).toBe(true);
    expect(isMidBlockSectionStart("TRANSPORTATION")).toBe(true);
  });

  it("bare-CR breaks line 1: a header followed by CR-joined detail still starts a block (whole-diff r2)", () => {
    // Reverting the bare-CR split leaves line1 = "HOTEL\rFour Seasons", whose
    // lowercase letters disqualify it — this assertion fails on that revert.
    expect(isMidBlockSectionStart("HOTEL\rFour Seasons")).toBe(true);
  });

  it("uppercase family prefixes start a new block (first line of a fused cell)", () => {
    expect(isMidBlockSectionStart("GENERAL SESSION - GRAND BALLROOM A/B")).toBe(true);
    expect(isMidBlockSectionStart("GENERAL SESSION\nGRAND BALLROOM")).toBe(true);
  });

  it("mixed-case shapes never split (probe-1 corpus classes)", () => {
    expect(isMidBlockSectionStart("General Session Room Name")).toBe(false);
    expect(isMidBlockSectionStart("In House AV")).toBe(false);
    expect(isMidBlockSectionStart("Driver")).toBe(false);
    expect(isMidBlockSectionStart("Hotal Contact Info")).toBe(false);
    expect(isMidBlockSectionStart("general session")).toBe(false);
  });

  it("CLIENT is excluded (corpus-verified mid-block label)", () => {
    expect(isMidBlockSectionStart("CLIENT")).toBe(false);
  });

  it("empty, whitespace, and non-boundary tokens never split", () => {
    expect(isMidBlockSectionStart("")).toBe(false);
    expect(isMidBlockSectionStart("   ")).toBe(false);
    expect(isMidBlockSectionStart("DATESOMETHING")).toBe(false);
  });
});

describe("isCrewRoleCell (spec §3.1 arm 3)", () => {
  it("full and partial role phrases match (>=2 distinct tokens on one line)", () => {
    expect(isCrewRoleCell("- Load In / Set / Strike / Load Out - LEAD")).toBe(true);
    expect(isCrewRoleCell("Load In/Set/Strke/Load Out")).toBe(true); // live typo row
    expect(isCrewRoleCell("- Load In / Set ONLY")).toBe(true);
    expect(isCrewRoleCell("- Load Out / Strike ONLY")).toBe(true);
  });

  it("single-token shapes never match (probe-4 classes)", () => {
    expect(isCrewRoleCell("GS Strike Time")).toBe(false);
    expect(isCrewRoleCell("Setup / Load In Date / Time")).toBe(false);
    expect(isCrewRoleCell("9:00PM - LOAD IN")).toBe(false);
    expect(isCrewRoleCell("LOADING DOCK")).toBe(false);
  });

  it("two tokens on one line match even outside a roster shape (suppression, not this predicate, excludes the DRESS row)", () => {
    expect(isCrewRoleCell("Set/Strike: Black Pants")).toBe(true);
  });

  it("tokens split across &#10; lines do not match (multiline agenda cells)", () => {
    expect(isCrewRoleCell("8:00AM - LOAD IN&#10;5:00PM - LOAD OUT")).toBe(false);
    expect(isCrewRoleCell("8:00AM - LOAD IN\n5:00PM - LOAD OUT")).toBe(false);
  });
});
