import { describe, it, expect } from "vitest";
import {
  classifyGearItem,
  gearBucketFor,
  isGroupingOnly,
  isSensitiveCanonicalKey,
} from "@/lib/parser/gearClassification";

describe("classifyGearItem — allow-list first, bucket fallback", () => {
  it("DLP DATA PROJECTOR-BARCO W8 → video even with active audio bucket", () => {
    expect(classifyGearItem("DLP DATA PROJECTOR-BARCO W8", "audio")).toBe("video");
  });
  it("6'X10' PROJECTION SCREEN → video; COUNTDOWN CLOCK → video", () => {
    expect(classifyGearItem("6'X10' WIDESCREEN PROJECTION SCREEN", "audio")).toBe("video");
    expect(classifyGearItem("COUNTDOWN CLOCK", "audio")).toBe("video");
  });
  it("CABLING with no allow-list hit inherits the active audio bucket", () => {
    expect(classifyGearItem("CABLING", "audio")).toBe("audio");
    expect(classifyGearItem("CABLING", null)).toBe("other");
  });
  it("SMALL SOUND SYSTEM → audio; AUDIO MIXER - QU16 → audio; (2) KLA SPEAKERS → audio", () => {
    expect(classifyGearItem("SMALL SOUND SYSTEM", null)).toBe("audio");
    expect(classifyGearItem("AUDIO MIXER - QU16", null)).toBe("audio");
    expect(classifyGearItem("(2) KLA SPEAKERS W/ STANDS", null)).toBe("audio");
  });
  it("(2) LED LEKOS → lighting; (12) ROCKVILLE LED UPLIGHTS → lighting; (4) BLIZZARD LED BARS → lighting", () => {
    expect(classifyGearItem("(2) LED LEKOS", null)).toBe("lighting");
    expect(classifyGearItem("(12) ROCKVILLE LED UPLIGHTS", null)).toBe("lighting");
    expect(classifyGearItem("(4) BLIZZARD LED BARS", null)).toBe("lighting");
  });
  it("STRETCHED SPANDEX / PRINTED LOGO → scenic; TRUSS PODIUM → scenic", () => {
    expect(classifyGearItem("(1) PRINTED LOGO SPANDEX SECTION", null)).toBe("scenic");
    expect(classifyGearItem("TRUSS PODIUM", null)).toBe("scenic");
  });
  it("ZOOM LAPTOP PACKAGE backup → video (LAPTOP); unmatched truss bits → other", () => {
    expect(classifyGearItem("MOUNTING HARDWARE", null)).toBe("other");
  });
});

describe("gearBucketFor / isGroupingOnly", () => {
  it("SOUND SYSTEM PACKAGE and SMALL SOUND SYSTEM both set the audio bucket", () => {
    expect(gearBucketFor("SOUND SYSTEM PACKAGE")).toBe("audio");
    expect(gearBucketFor("SMALL SOUND SYSTEM")).toBe("audio");
  });
  it("STAGE LIGHTING PACKAGE and LED UPLIGHTING PACKAGE set the lighting bucket", () => {
    expect(gearBucketFor("STAGE LIGHTING PACKAGE")).toBe("lighting");
    expect(gearBucketFor("LED UPLIGHTING PACKAGE")).toBe("lighting");
  });
  it("only structural bucket-setter PACKAGE headers are grouping-only; real * PACKAGE gear is NOT (R5-HIGH)", () => {
    expect(isGroupingOnly("SOUND SYSTEM PACKAGE")).toBe(true);
    expect(isGroupingOnly("STAGE LIGHTING PACKAGE")).toBe(true);
    expect(isGroupingOnly("LED UPLIGHTING PACKAGE")).toBe(true);
    expect(isGroupingOnly("SMALL SOUND SYSTEM")).toBe(false); // bucket-setter but no PACKAGE suffix → emitted
    expect(isGroupingOnly("ZOOM LAPTOP PACKAGE")).toBe(false); // not a bucket-setter → real gear, emitted
    expect(isGroupingOnly("PTZ CAMERA PACKAGE")).toBe(false);
  });
  it("real * PACKAGE gear classifies to its discipline (not dropped)", () => {
    expect(classifyGearItem("ZOOM LAPTOP PACKAGE", null)).toBe("video"); // LAPTOP
    expect(classifyGearItem("PTZ CAMERA PACKAGE", null)).toBe("video"); // CAMERA
  });
});

describe("isSensitiveCanonicalKey (permission boundary)", () => {
  it.each([
    "budget",
    "po",
    "po_number",
    "ponumber",
    "ponum",
    "p_o",
    "p_o_number",
    "purchase_order",
    "invoice",
    "invoice_notes",
    "proposal",
    "cost",
    "price",
    "quote",
    "estimate",
    "internal",
    "internal_notes",
  ])("%s is sensitive", (k) => expect(isSensitiveCanonicalKey(k)).toBe(true)); // ponumber=PONumber/P.O.Number (R7); p_o_number=P O Number (R6)
  it.each([
    "keynote_requirements",
    "opening_reel",
    "power",
    "internet",
    "additional_notes",
    "backdrop",
    "podium_type",
    "deposit",
    "component",
    "report",
    "polling",
    "position",
    "power_requirements",
  ])("%s is NOT sensitive (no po-prefix over-match)", (k) =>
    expect(isSensitiveCanonicalKey(k)).toBe(false),
  );
});
