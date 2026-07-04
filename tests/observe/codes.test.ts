import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resolveCodeText } from "@/scripts/observe";

describe("observe codes", () => {
  test("known code → catalog copy (asserted against MESSAGE_CATALOG)", () => {
    const code = Object.keys(MESSAGE_CATALOG)[0]!;
    const out = resolveCodeText(code);
    const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
    // out must include the entry's title or dougFacing text if present
    const expected = entry.title ?? entry.dougFacing ?? entry.crewFacing ?? "";
    if (expected) expect(out).toContain(expected);
    expect(out).toContain(code);
  });
  test("forensic / unknown code → benign not-in-catalog message, no throw", () => {
    const out = resolveCodeText("DEFINITELY_NOT_A_CATALOG_CODE_XYZ");
    expect(out.toLowerCase()).toContain("not in the message catalog");
  });
  test("no arg → lists all catalog codes", () => {
    const out = resolveCodeText(undefined);
    for (const c of Object.keys(MESSAGE_CATALOG).slice(0, 3)) expect(out).toContain(c);
  });
});
