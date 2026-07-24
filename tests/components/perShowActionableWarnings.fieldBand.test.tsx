// @vitest-environment jsdom
/**
 * tests/components/perShowActionableWarnings.fieldBand.test.tsx
 * (crewwarn-instance-discriminator §2.2-§2.4)
 *
 * The FIELD_UNREADABLE discriminator band: context-aware detail band (field label +
 * member name + quoted unusable value) that makes same-code cards distinguishable.
 * Guard sweep is total over the §2.4 {USABLE, ABSENT}³ domain — the jsonb boundary
 * is unvalidated, so null/number/object/array are all in-domain and must never throw.
 *
 * Anti-tautology: positive expectations derive from the fixture's own field/name/
 * rawSnippet values, never free-floating strings.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const fu = (
  over: Partial<ParseWarning> & { blockRef?: ParseWarning["blockRef"] },
): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: "instance message unused by the band",
  rawSnippet: "call the office",
  blockRef: { kind: "crew", index: 2, name: "Jordan Ellis", field: "phone" },
  ...over,
});
const bands = () => screen.getAllByTestId("per-show-actionable-field-label");

describe("PerShowActionableWarnings — FIELD_UNREADABLE discriminator band", () => {
  test("full mode: phone+email same member render two distinct bands (label + name + quoted value)", () => {
    const items = [
      fu({}),
      fu({
        rawSnippet: "jordan-at",
        blockRef: { kind: "crew", index: 2, name: "Jordan Ellis", field: "email" },
      }),
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    const [a, b] = bands();
    // Middot separator is its own span; gap spacing is CSS, so textContent has no spaces.
    expect(a?.textContent).toBe(`Phone${items[0]!.blockRef!.name}·"${items[0]!.rawSnippet}"`);
    expect(b?.textContent).toBe(`Email${items[1]!.blockRef!.name}·"${items[1]!.rawSnippet}"`);
  });

  test("condensed: name absent, value present", () => {
    render(<PerShowActionableWarnings items={[fu({})]} driveFileId="df" condensed />);
    const band = bands()[0];
    expect(band?.textContent).toBe(`Phone"call the office"`);
    expect(band?.textContent).not.toContain("Jordan Ellis");
  });

  // Spec 2.4 guard sweep: every ABSENT class per input; none throws, no dangling
  // separator, no empty quotes.
  test.each([
    ["missing key", { kind: "crew", index: 2, name: "J" }],
    ["null", { kind: "crew", index: 2, name: "J", field: null }],
    ["empty", { kind: "crew", index: 2, name: "J", field: "" }],
    ["whitespace", { kind: "crew", index: 2, name: "J", field: "   " }],
    ["non-string number", { kind: "crew", index: 2, name: "J", field: 0 }],
    ["non-string object", { kind: "crew", index: 2, name: "J", field: { a: 1 } }],
  ])("ABSENT field (%s) renders no band", (_label, blockRef) => {
    render(
      <PerShowActionableWarnings items={[fu({ blockRef: blockRef as never })]} driveFileId="df" />,
    );
    expect(screen.queryByTestId("per-show-actionable-field-label")).toBeNull();
  });

  test.each([
    ["missing key", { kind: "crew", index: 2, field: "phone" }],
    ["null", { kind: "crew", index: 2, name: null, field: "phone" }],
    ["empty", { kind: "crew", index: 2, name: "", field: "phone" }],
    ["whitespace", { kind: "crew", index: 2, name: "   ", field: "phone" }],
    ["non-string array", { kind: "crew", index: 2, name: [], field: "phone" }],
  ])("ABSENT name (%s, full mode) drops the segment, no dangling separator", (_label, blockRef) => {
    render(
      <PerShowActionableWarnings items={[fu({ blockRef: blockRef as never })]} driveFileId="df" />,
    );
    expect(bands()[0]?.textContent).toBe(`Phone"call the office"`);
  });

  // Builder thunks so the "missing key" case is TRUE property omission (destructure-drop),
  // never an explicit `rawSnippet: undefined` (exactOptionalPropertyTypes forbids that shape).
  const dropSnippet = (): ParseWarning => {
    const { rawSnippet: _omit, ...rest } = fu({});
    return rest as ParseWarning;
  };
  test.each([
    ["missing key", dropSnippet],
    ["null", () => fu({ rawSnippet: null as never })],
    ["empty", () => fu({ rawSnippet: "" })],
    ["whitespace", () => fu({ rawSnippet: "   " })],
    ["non-string number", () => fu({ rawSnippet: 42 as never })],
  ])("ABSENT rawSnippet (%s) drops value + quotes entirely", (_label, build) => {
    render(<PerShowActionableWarnings items={[build()]} driveFileId="df" />);
    expect(bands()[0]?.textContent).toBe("PhoneJordan Ellis");
    expect(bands()[0]?.textContent).not.toContain('"');
  });

  test("junk name + junk rawSnippet with a valid field renders the label alone, no throw", () => {
    render(
      <PerShowActionableWarnings
        items={[
          fu({
            rawSnippet: 42 as never,
            blockRef: { kind: "crew", index: 2, name: [] as never, field: "phone" },
          }),
        ]}
        driveFileId="df"
      />,
    );
    expect(bands()[0]?.textContent).toBe("Phone");
  });

  test("padded known field maps to its label; padded name/value render trimmed; value testid pinned", () => {
    const items = [
      fu({
        rawSnippet: "  call the office  ",
        blockRef: { kind: "crew", index: 2, name: "  Jordan Ellis  ", field: " phone " },
      }),
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    const value = screen.getByTestId("per-show-actionable-field-label-value");
    expect(value.textContent).toBe(`"call the office"`);
    expect(screen.getByTestId("per-show-actionable-field-name").textContent).toBe("Jordan Ellis");
    expect(bands()[0]?.textContent).toBe(`PhoneJordan Ellis·"call the office"`);
  });

  test("delimiter-bearing name/value pairs stay distinguishable: name and value live in separate spans (whole-diff R2)", () => {
    // A single joined string renders these two DISTINCT warnings identically
    // (`Jordan · "office" · "night"`). The band must keep name and value in
    // separate testid'd spans so the (name, value) tuple always differs when
    // the underlying data differs. Expected values derive from the fixtures.
    const a = fu({
      rawSnippet: 'office" · "night',
      blockRef: { kind: "crew", index: 2, name: "Jordan", field: "phone" },
    });
    const b = fu({
      rawSnippet: "night",
      blockRef: { kind: "crew", index: 2, name: 'Jordan · "office"', field: "phone" },
    });
    render(<PerShowActionableWarnings items={[a, b]} driveFileId="df" />);
    const names = screen.getAllByTestId("per-show-actionable-field-name");
    const values = screen.getAllByTestId("per-show-actionable-field-label-value");
    expect(names.map((n) => n.textContent)).toEqual([a.blockRef!.name, b.blockRef!.name]);
    expect(values.map((v) => v.textContent)).toEqual([`"${a.rawSnippet}"`, `"${b.rawSnippet}"`]);
    // The tuples differ even though the naive concatenation would not.
    expect([names[0]!.textContent, values[0]!.textContent]).not.toEqual([
      names[1]!.textContent,
      values[1]!.textContent,
    ]);
  });

  test("stray blockRef.field on a non-FIELD_UNREADABLE code renders no field band (code gate)", () => {
    const stray: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_SECTION_HEADER",
      message: "m",
      rawSnippet: "MYSTERY",
      blockRef: { kind: "unknown_section", field: "phone" },
    };
    render(<PerShowActionableWarnings items={[stray]} driveFileId="df" />);
    expect(screen.queryByTestId("per-show-actionable-field-label")).toBeNull();
  });

  test("unknown USABLE field renders trimmed as-is; 200-char junk label carries wrap class", () => {
    const junk = "x".repeat(200);
    render(
      <PerShowActionableWarnings
        items={[fu({ blockRef: { kind: "crew", index: 2, name: "J", field: ` ${junk} ` } })]}
        driveFileId="df"
      />,
    );
    const label = bands()[0]?.querySelector("span");
    expect(label?.textContent).toBe(junk);
    expect(label?.className).toContain("break-all");
  });

  test("UNKNOWN_FIELD keeps Sheet row band; never both bands on one card", () => {
    const uf: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_FIELD",
      message: "m",
      rawSnippet: "Venue WiFi | pass123",
    };
    render(<PerShowActionableWarnings items={[uf, fu({})]} driveFileId="df" />);
    const cards = screen.getAllByTestId("per-show-actionable-item");
    expect(within(cards[0]!).queryByTestId("per-show-actionable-row-label")).not.toBeNull();
    expect(within(cards[0]!).queryByTestId("per-show-actionable-field-label")).toBeNull();
    expect(within(cards[1]!).queryByTestId("per-show-actionable-field-label")).not.toBeNull();
    expect(within(cards[1]!).queryByTestId("per-show-actionable-row-label")).toBeNull();
  });
});
