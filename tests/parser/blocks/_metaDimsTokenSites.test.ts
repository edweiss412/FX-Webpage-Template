// tests/parser/blocks/_metaDimsTokenSites.test.ts
//
// STRUCTURAL PIN (spec §C companion-surface invariant 1). The dims token appears at
// SEVEN sites in rooms.ts that MUST widen together via the shared _dimsToken.ts
// fragments so they cannot drift. This meta-test asserts:
//   (a) No re-inlined `'\s*x` dims literal survives in rooms.ts EXCEPT the single
//       allow-listed headerDayMarker superset (pinned by its exact pattern string).
//   (b) The dangling-separator cleanup references DIMS_SEP (not a bare `x`).
//   (c) Behavioral: dimsFullRe()/dimsStartRe() reject `2026 x 40` and accept
//       `2026' x 40'` (guards the 4-digit-bare hole).
//   (d) Behavioral matched-pair: a `50′×45′` token is captured identically by the
//       DAY-header path (rooms.ts:1218) and the harvestSameNameHeaderDims fallback
//       (rooms.ts:1274), asserted via parseRooms on two fixture shapes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRooms } from "@/lib/parser/blocks/rooms";
import { dimsFullRe, dimsStartRe } from "@/lib/parser/blocks/_dimsToken";

const ROOMS_SRC = readFileSync(join(process.cwd(), "lib/parser/blocks/rooms.ts"), "utf8");

// The ONE deliberately-inlined superset (headerDayMarker) — digit-UNGATED, unit-OPTIONAL.
const ALLOWLISTED_167 = String.raw`/^\s*\d+\s*(?:['′]|ft\b)?\s*[x×]\s*\d/i`;

describe("seven-site dims-token invariant (spec §C invariant 1)", () => {
  it("(a) no re-inlined old dims literal survives except the allow-listed 167 superset", () => {
    // The allow-listed superset appears EXACTLY once and does NOT itself contain `'\s*x`.
    expect(ROOMS_SRC.split(ALLOWLISTED_167).length - 1).toBe(1);
    const withoutAllow = ROOMS_SRC.split(ALLOWLISTED_167).join("");
    // Every OLD dims-token regex literal (134/875/934/1214/1270/1486) contained the
    // substring `'\s*x` (feet-mark immediately followed by the `\s*` separator gap);
    // after widening every site composes the shared fragments, so NONE survives.
    expect(withoutAllow.includes("'\\s*x")).toBe(false);
  });

  it("(b) the dangling-separator cleanup references DIMS_SEP, not a bare x", () => {
    expect(ROOMS_SRC).toContain("DIMS_SEP");
    // The old cleanup literal `/\s*x\s*$/i` is gone.
    expect(ROOMS_SRC.includes("/\\s*x\\s*$/i")).toBe(false);
  });

  it("(c) 4-digit-bare hole stays closed: 2026 x 40 rejected, 2026' x 40' accepted", () => {
    expect(dimsFullRe().exec("2026 x 40")).toBeNull();
    expect(dimsFullRe().exec("2026' x 40'")?.[1]).toBe("2026' x 40'");
    expect(dimsStartRe(false).test("2026 x 40")).toBe(false);
    expect(dimsStartRe(false).test("2026' x 40'")).toBe(true);
  });

  it("(d) matched pair: 50′×45′ captured identically via DAY header (:1218) and fallback (:1274)", () => {
    // Shape 1 — dims RIDE the DAY-range header directly (routes through the :1218 loop).
    const rideDayHeader = [
      "| SALON A&#10;DAY 1 & 2&#10;50′×45′ | |",
      "| :---: | :---: |",
      "| BO Setup | TBD |",
      "| BO Set Time | TBD |",
      "| BO Audio | NONE |",
      "",
    ].join("\n");
    const r1 = parseRooms(rideDayHeader, "v1").filter((r) => r.kind === "breakout");
    expect(r1).toHaveLength(1);
    expect(r1[0]!.dimensions).toBe("50′×45′");

    // Shape 2 — the DAY-range header carries NO dims; a SAME-first-line-name non-DAY
    // header carries them (routes through the harvestSameNameHeaderDims :1274 fallback).
    const sameNameFallback = [
      "| SALON A&#10;DAY 1 & 2 | |",
      "| :---: | :---: |",
      "| BO Setup | TBD |",
      "| BO Set Time | TBD |",
      "| BO Audio | NONE |",
      "",
      "| SALON A&#10;50′×45′ | |",
      "| :---: | :---: |",
      "| BO Setup | TBD |",
      "| BO Audio | NONE |",
      "",
    ].join("\n");
    const r2 = parseRooms(sameNameFallback, "v1").filter((r) => r.kind === "breakout");
    const salonA = r2.find((r) => (r.name ?? "").toUpperCase().includes("SALON A"));
    expect(salonA).toBeDefined();
    expect(salonA!.dimensions).toBe("50′×45′");
  });
});
