import { describe, expect, test } from "vitest";
import type { ContactRow } from "@/lib/parser/types";
import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";

const mk = (over: Partial<ContactRow>): ContactRow =>
  ({ kind: "venue", name: "", phone: null, email: null, notes: null, ...over }) as ContactRow;

describe("selectPrimaryContact", () => {
  test("prefers an actionable contact regardless of array order", () => {
    const unactionable = mk({ name: "Front Desk", kind: "venue", phone: "TBD", email: "" });
    const actionable = mk({ name: "AV Lead", kind: "in_house_av", phone: "555-0100" });
    const order1 = selectPrimaryContact([unactionable, actionable]);
    const order2 = selectPrimaryContact([actionable, unactionable]);
    expect(order1?.name).toBe(actionable.name);
    expect(order2?.name).toBe(order1?.name);
  });
  test("none actionable → null", () => {
    expect(selectPrimaryContact([mk({ phone: "N/A", email: "TBA" })])).toBeNull();
  });
  test("tie-break by kind then name across orderings", () => {
    const a = mk({ name: "Bravo", kind: "in_house_av", phone: "555-0001" });
    const b = mk({ name: "Alpha", kind: "venue", phone: "555-0002" });
    const r1 = selectPrimaryContact([a, b]);
    const r2 = selectPrimaryContact([b, a]);
    expect(r1?.name).toBe(r2?.name);
  });
});
