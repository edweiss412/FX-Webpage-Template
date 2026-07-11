import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  ParseWarning,
  UseRawResolution,
  DateOrderFields,
} from "@/lib/parser/types";

// Task 1 (spec §6): ParseWarning gains an optional `resolution` payload carrying
// the parsed transform value, the raw replacement, and the content hash used to
// pin admin "use the sheet's raw value" decisions. These are type-only assertions
// plus a trivial runtime round-trip — no parser behavior yet.
describe("UseRawResolution / DateOrderFields type surface", () => {
  it("DateOrderFields carries the four date slots with showDays as string[]", () => {
    expectTypeOf<DateOrderFields["travelIn"]>().toEqualTypeOf<string | null>();
    expectTypeOf<DateOrderFields["set"]>().toEqualTypeOf<string | null>();
    expectTypeOf<DateOrderFields["showDays"]>().toEqualTypeOf<string[]>();
    expectTypeOf<DateOrderFields["travelOut"]>().toEqualTypeOf<string | null>();
  });

  it("a resolvable:true rooms resolution type-checks with parsed+replacement+contentHash", () => {
    const res: UseRawResolution = {
      resolvable: true,
      contentHash: "deadbeef",
      parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "40x60", floor: "2" },
      replacement: { kind: "rooms", name: "Grand Ballroom 40x60 Fl 2", dimensions: null, floor: null },
    };
    expect(res.resolvable).toBe(true);
    if (res.resolvable) {
      expect(res.parsed.kind).toBe("rooms");
      expect(res.replacement.kind).toBe("rooms");
      expect(res.contentHash).toBe("deadbeef");
    }
  });

  it("a resolvable:false resolution carries a reason and no payload", () => {
    const res: UseRawResolution = { resolvable: false, reason: "empty-raw" };
    expect(res.resolvable).toBe(false);
    if (!res.resolvable) {
      expect(res.reason).toBe("empty-raw");
    }
  });

  it("ParseWarning.resolution is optional (undefined on a non-recoverable warning)", () => {
    const legacy: ParseWarning = {
      severity: "warn",
      code: "SOME_OTHER_CODE",
      message: "x",
    };
    expect(legacy.resolution).toBeUndefined();
    expectTypeOf<ParseWarning["resolution"]>().toEqualTypeOf<UseRawResolution | undefined>();

    const recoverable: ParseWarning = {
      severity: "warn",
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      message: "x",
      resolution: {
        resolvable: true,
        contentHash: "abc123",
        parsed: { kind: "rooms", name: "A", dimensions: null, floor: null },
        replacement: { kind: "rooms", name: "A", dimensions: null, floor: null },
      },
    };
    expect(recoverable.resolution?.resolvable).toBe(true);
  });
});
