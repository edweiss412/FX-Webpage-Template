import { describe, it, expect, expectTypeOf } from "vitest";
import type { AgendaEntry, ParsedSheet, ParseResult, ScheduleDay } from "@/lib/parser/types";

describe("AgendaEntry + runOfShow type surface", () => {
  it("AgendaEntry requires start+title, optionals are string|undefined", () => {
    const e: AgendaEntry = { start: "7:15 AM", title: "Opening Keynote" };
    expectTypeOf(e.start).toEqualTypeOf<string>();
    expectTypeOf(e.title).toEqualTypeOf<string>();
    expectTypeOf<AgendaEntry["finish"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["room"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["av"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["trt"]>().toEqualTypeOf<string | undefined>();
    expect(e.title).toBe("Opening Keynote");
  });

  it("ParsedSheet + ParseResult carry an optional runOfShow Record", () => {
    expectTypeOf<ParsedSheet["runOfShow"]>().toEqualTypeOf<
      Record<string, ScheduleDay> | undefined
    >();
    expectTypeOf<ParseResult["runOfShow"]>().toEqualTypeOf<
      Record<string, ScheduleDay> | undefined
    >();
  });

  it("AgendaEntry is NOT reachable from ShowRow (admin-only, R18)", () => {
    // @ts-expect-error — ShowRow must not carry run_of_show / runOfShow
    const _bad: import("@/lib/parser/types").ShowRow["runOfShow"] = undefined;
    void _bad;
  });
});
