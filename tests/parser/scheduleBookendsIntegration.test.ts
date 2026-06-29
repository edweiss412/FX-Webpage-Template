import { parseSheet } from "@/lib/parser";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Integration: deriveScheduleBookends (Tasks 4-5) wired into the parseSheet
// pipeline (Task 7). Grounded in the real DCI-RPAS fixture, which carries a SET
// load-in (dates.set 2025-03-24, loadIn 10:00 AM), a GS Strike Time (3/26 @
// 12:00pm on a show day), and a transport Pick Up Venue (3/26 @ 2:00 PM).
const FIXTURE = "fixtures/shows/raw/2025-03-dci-rpas-central.md";

describe("parseSheet wires deriveScheduleBookends into runOfShow", () => {
  it("synthesizes SET Load In, per-room Strike, and Load Out entries", () => {
    const md = readFileSync(FIXTURE, "utf8");
    const r = parseSheet(md, FIXTURE);
    const ros = r.runOfShow;
    expect(ros).toBeDefined();

    // SET day Load In (kind absent ⇒ agenda), placed on dates.set.
    const setDay = r.show.dates.set!;
    const loadIn = ros![setDay]!.entries.find((e) => e.title === "Load In");
    expect(loadIn).toBeDefined();
    expect(loadIn!.start).toBe(r.show.dates.loadIn!);
    expect(loadIn!.kind).toBeUndefined();

    // Strike (kind:"strike") on the room's own date.
    const strike = ros!["2025-03-26"]!.entries.find((e) => e.kind === "strike");
    expect(strike).toBeDefined();
    expect(strike!.title).toBe("Strike — General Session");
    expect(strike!.start).toBe("12:00pm");

    // Load Out (kind:"loadout") from the transport Pick Up Venue stage.
    const loadOut = ros!["2025-03-26"]!.entries.find((e) => e.kind === "loadout");
    expect(loadOut).toBeDefined();
    expect(loadOut!.title).toBe("Load Out");
    expect(loadOut!.start).toBe("2:00 PM");

    // No off-schedule warning for the unmodified fixture (3/26 is a show day).
    expect(r.warnings.some((w) => w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(false);
  });

  it("emits SCHEDULE_STRIKE_DATE_OFF_SCHEDULE when a strike date is off-schedule", () => {
    const md = readFileSync(FIXTURE, "utf8");
    // Push the GS Strike Time date off the show's schedule (8/30 is not a show day).
    const offSchedule = md.replace("3/26 @ 12:00pm", "8/30 @ 12:00pm");
    expect(offSchedule).not.toBe(md);
    const r = parseSheet(offSchedule, FIXTURE);
    expect(r.warnings.some((w) => w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
    // The off-schedule strike entry is still present (admin-visible).
    expect(r.runOfShow!["2025-08-30"]!.entries.some((e) => e.kind === "strike")).toBe(true);
  });
});

// ── SET cell-derived labels (D-SET1) — RFI/PCF has a label-before SET cell ──
const RFI_FIXTURE = "fixtures/shows/exporter-xlsx/redefining-fi.md";

describe("parseSheet — SET cell-derived run-of-show labels (D-SET1)", () => {
  it("does NOT persist/project the parse-transient setAgendaRaw on show.dates", () => {
    const md = readFileSync(RFI_FIXTURE, "utf8");
    const r = parseSheet(md, RFI_FIXTURE);
    expect("setAgendaRaw" in r.show.dates).toBe(false);
  });

  it("RFI/PCF SET cell → run-of-show shows 'Room Access', not 'Setup'", () => {
    const md = readFileSync(RFI_FIXTURE, "utf8");
    const r = parseSheet(md, RFI_FIXTURE);
    const setEntries = r.runOfShow![r.show.dates.set!]!.entries.map((e) => e.title);
    expect(setEntries).toContain("Room Access");
    expect(setEntries).not.toContain("Setup");
  });
});
