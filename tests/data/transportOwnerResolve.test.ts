import { describe, expect, it } from "vitest";
import { resolveTransportOwners } from "@/lib/data/transportOwnerResolve";
import type { TransportationRow } from "@/lib/parser/types";

const leg = (assigned_names: string[]) => ({ stage: "s", date: null, time: null, assigned_names });
const tx = (over: Partial<TransportationRow>): TransportationRow => ({
  driver_name: null,
  driver_phone: null,
  driver_email: null,
  loadout_name: null,
  loadout_phone: null,
  loadout_email: null,
  vehicle: null,
  license_plate: null,
  color: null,
  parking: null,
  schedule: [],
  notes: null,
  ...over,
});
const crew = (id: string, name: string) => ({
  id,
  name,
});

describe("resolveTransportOwners", () => {
  it("1. garbled driver 'Doug Larson Loadout' resolves to Doug via covers", () => {
    const roster = [crew("doug", "Doug Larson")];
    expect(resolveTransportOwners(tx({ driver_name: "Doug Larson Loadout" }), roster)).toEqual([
      "doug",
    ]);
  });
  it("2. nickname 'Bill Werner' resolves to William via namesRefer", () => {
    const roster = [crew("will", "William Werner")];
    expect(resolveTransportOwners(tx({ driver_name: "Bill Werner" }), roster)).toEqual(["will"]);
  });
  it("3. first-name-only 'Doug' resolves via namesRefer", () => {
    expect(
      resolveTransportOwners(tx({ driver_name: "Doug" }), [crew("doug", "Doug Larson")]),
    ).toEqual(["doug"]);
  });
  it("4. merged 'Doug Larson Bill Werner' resolves to BOTH (benign over-match)", () => {
    const roster = [crew("doug", "Doug Larson"), crew("bill", "Bill Werner")];
    const got = resolveTransportOwners(tx({ driver_name: "Doug Larson Bill Werner" }), roster);
    expect(got.sort()).toEqual(["bill", "doug"]);
  });
  it("5. leg assigned_names garble resolves", () => {
    expect(
      resolveTransportOwners(tx({ schedule: [leg(["Doug Larson Loadout"])] }), [
        crew("doug", "Doug Larson"),
      ]),
    ).toEqual(["doug"]);
  });
  it("6. external 'ABC Charters' resolves to nobody", () => {
    expect(
      resolveTransportOwners(tx({ driver_name: "ABC Charters" }), [crew("doug", "Doug Larson")]),
    ).toEqual([]);
  });
  it("7. sentinels + lone initials never resolve (would leak a stranger's tile)", () => {
    expect(resolveTransportOwners(tx({ driver_name: "N/A" }), [crew("a", "Alice Adams")])).toEqual(
      [],
    );
    expect(resolveTransportOwners(tx({ driver_name: "TBA" }), [crew("n", "Nick Nolan")])).toEqual(
      [],
    );
    expect(resolveTransportOwners(tx({ driver_name: "TBD" }), [crew("a", "Alice Adams")])).toEqual(
      [],
    );
    expect(resolveTransportOwners(tx({ driver_name: "-" }), [crew("a", "Alice Adams")])).toEqual(
      [],
    );
    expect(resolveTransportOwners(tx({ driver_name: "A" }), [crew("a", "Alice Adams")])).toEqual(
      [],
    );
  });
  it("8. null transportation / empty roster → []", () => {
    expect(resolveTransportOwners(null, [crew("doug", "Doug Larson")])).toEqual([]);
    expect(resolveTransportOwners(tx({ driver_name: "Doug Larson" }), [])).toEqual([]);
  });
  it("9. viewer as driver AND leg-tagged dedups to one id", () => {
    const roster = [crew("doug", "Doug Larson")];
    expect(
      resolveTransportOwners(
        tx({ driver_name: "Doug Larson", schedule: [leg(["Doug Larson"])] }),
        roster,
      ),
    ).toEqual(["doug"]);
  });
  it("10. slash-merged 'David Johnson / Doug Larson' resolves Doug", () => {
    expect(
      resolveTransportOwners(tx({ driver_name: "David Johnson / Doug Larson" }), [
        crew("doug", "Doug Larson"),
      ]),
    ).toEqual(["doug"]);
  });
  it("11. resolves against the current crew name only — a non-matching name does not resolve", () => {
    // Post field-override teardown the alias set is `[current name]` (no pre-override
    // sheet_name alias). A member whose current name does not refer to the driver token
    // is not resolved — the sheet is the single source of truth for the name.
    expect(
      resolveTransportOwners(tx({ driver_name: "Doug Larson Loadout" }), [
        crew("doug", "Doug Newname"),
      ]),
    ).toEqual([]);
    // The same member, once their sheet name matches, resolves via covers.
    expect(
      resolveTransportOwners(tx({ driver_name: "Doug Larson Loadout" }), [
        crew("doug", "Doug Larson"),
      ]),
    ).toEqual(["doug"]);
  });
  it("12. malformed decoded JSONB is total (never throws) — page-critical projection guard", () => {
    const roster = [crew("doug", "Doug Larson")];
    const bad1 = tx({ driver_name: 42 as unknown as string });
    const bad2 = tx({
      schedule: [{ stage: "s", date: null, time: null, assigned_names: [null] } as never],
    });
    const bad3 = tx({ schedule: null as unknown as [] });
    expect(() => resolveTransportOwners(bad1, roster)).not.toThrow();
    expect(() => resolveTransportOwners(bad2, roster)).not.toThrow();
    expect(() => resolveTransportOwners(bad3, roster)).not.toThrow();
    expect(resolveTransportOwners(bad1, roster)).toEqual([]);
    expect(resolveTransportOwners(bad2, roster)).toEqual([]);
    expect(resolveTransportOwners(bad3, roster)).toEqual([]);
  });
});
