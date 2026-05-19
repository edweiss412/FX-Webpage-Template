/**
 * Tests for `getShowForViewer` (Task 4.3, spec §7.4).
 *
 * Strict TDD pattern: this file lists every Step-1 test from the plan.
 * Each test seeds public.shows + public.crew_members + adjacent rows via the
 * service-role client, exercises the helper-under-test, and tears the rows
 * down by show_id (cascade clears children).
 *
 * The helper-under-test uses the service-role client internally per spec §7.4
 * (see prompt + plan: redeemed-link viewers don't carry a Supabase Auth
 * session, so a cookie-bound client cannot read shows_internal under RLS;
 * the helper's `isLead` derivation is the application-layer gate, RLS the
 * second line of defense).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getShowForViewer } from "@/lib/data/getShowForViewer";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PREFIX = "getShowForViewer-test:";

async function seedShow(opts: {
  title: string;
  coiStatus?: string | null;
  financials?: {
    po: string | null;
    proposal: string | null;
    invoice: string | null;
    invoice_notes: string | null;
  } | null;
}): Promise<string> {
  const driveFileId = `${TEST_PREFIX}${crypto.randomUUID()}`;
  const slug = `gsfv-${crypto.randomUUID().slice(0, 12)}`;
  const { data, error } = await admin
    .from("shows")
    .insert({
      drive_file_id: driveFileId,
      slug,
      title: opts.title,
      client_label: "Test Client",
      template_version: "v4",
      coi_status: opts.coiStatus ?? "SENT",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedShow failed: ${error?.message}`);
  if (opts.financials !== null) {
    const financials = opts.financials ?? {
      po: "PO-123",
      proposal: "$10,000",
      invoice: "INV-456",
      invoice_notes: "Net 30",
    };
    const { error: insErr } = await admin
      .from("shows_internal")
      .insert({ show_id: data.id, financials });
    if (insErr) throw new Error(`seed shows_internal failed: ${insErr.message}`);
  }
  return data.id as string;
}

async function seedCrew(opts: {
  showId: string;
  name: string;
  email?: string | null;
  roleFlags: string[];
  role?: string;
}): Promise<string> {
  const { data, error } = await admin
    .from("crew_members")
    .insert({
      show_id: opts.showId,
      name: opts.name,
      email: opts.email ?? null,
      role: opts.role ?? "A1",
      role_flags: opts.roleFlags,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedCrew failed: ${error?.message}`);
  return data.id as string;
}

async function cleanupTestShows(): Promise<void> {
  // Cascade clears crew_members, hotel_reservations, rooms, transportation,
  // contacts, shows_internal via FK on delete cascade.
  await admin.from("shows").delete().like("drive_file_id", `${TEST_PREFIX}%`);
}

describe("getShowForViewer (§7.4)", () => {
  afterEach(async () => {
    await cleanupTestShows();
  });

  test("AC-4.1, AC-5.9 non-LEAD response omits financials but includes coi_status", async () => {
    const showId = await seedShow({ title: "NonLead Show", coiStatus: "SENT" });
    const crewId = await seedCrew({ showId, name: "Bob A1", roleFlags: ["A1"] });

    const r = await getShowForViewer(showId, { kind: "crew", crewMemberId: crewId });

    expect(r.financials).toBeUndefined();
    expect(r.show.coi_status).toBe("SENT");
  });

  test("AC-4.2, AC-5.9 LEAD response includes financials and coi_status", async () => {
    const showId = await seedShow({ title: "Lead Show", coiStatus: "IN PROCESS" });
    const crewId = await seedCrew({
      showId,
      name: "Alice Lead",
      roleFlags: ["LEAD", "A1"],
    });

    const r = await getShowForViewer(showId, { kind: "crew", crewMemberId: crewId });

    expect(r.financials).toBeDefined();
    expect(r.financials?.po).toBe("PO-123");
    expect(r.financials?.proposal).toBe("$10,000");
    expect(r.financials?.invoice).toBe("INV-456");
    expect(r.financials?.invoice_notes).toBe("Net 30");
    expect(r.show.coi_status).toBe("IN PROCESS");
  });

  test("admin response includes financials", async () => {
    const showId = await seedShow({ title: "Admin Show" });

    const r = await getShowForViewer(showId, { kind: "admin" });

    expect(r.financials).toBeDefined();
    expect(r.financials?.po).toBe("PO-123");
  });

  test("stale-role regression: helper re-derives role_flags from DB on every call", async () => {
    const showId = await seedShow({ title: "Demote Show" });
    const crewId = await seedCrew({
      showId,
      name: "Carol Demoted",
      roleFlags: ["LEAD", "A1"],
    });

    const first = await getShowForViewer(showId, { kind: "crew", crewMemberId: crewId });
    expect(first.financials).toBeDefined();

    // Demote in DB — simulate sync.
    const { error } = await admin
      .from("crew_members")
      .update({ role_flags: ["A1"] })
      .eq("id", crewId);
    if (error) throw new Error(`demote update failed: ${error.message}`);

    // SAME identity, fresh call — helper MUST re-read role_flags.
    const second = await getShowForViewer(showId, { kind: "crew", crewMemberId: crewId });
    expect(second.financials).toBeUndefined();
  });

  test("static-analysis: source contains no caller-supplied role_flags or viewerRole signature", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/data/getShowForViewer.ts"), "utf8");
    expect(src).not.toMatch(/role_flags\s*:/);
    expect(src).not.toMatch(/viewerRole\s*:/);
  });

  test("static-analysis: Viewer union exposes identity-only admin_preview without role-bearing caller data", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/data/getShowForViewer.ts"), "utf8");
    const viewerUnion = src.match(/export type Viewer =[\s\S]*?;\n/)?.[0] ?? "";

    expect(viewerUnion).toContain('{ kind: "crew"; crewMemberId: string }');
    expect(viewerUnion).toContain('{ kind: "admin" }');
    expect(viewerUnion).toContain('{ kind: "admin_preview"; crewMemberId: string }');
    expect(viewerUnion.match(/kind: "/g)).toHaveLength(3);
    expect(src).not.toMatch(/impersonate\s*:/);
    expect(src).not.toMatch(/viewerRole\s*:/);
    expect(viewerUnion).not.toMatch(/roleFlags\s*:/);
    expect(viewerUnion).not.toMatch(/role_flags\s*:/);
  });

  test("cross-show regression: foreign crew id throws LINK_NO_CREW_MATCH (no inheritance)", async () => {
    const showA = await seedShow({ title: "Show A — has Alice" });
    const aliceId = await seedCrew({
      showId: showA,
      name: "Alice Lead",
      roleFlags: ["LEAD", "A1"],
    });
    const showB = await seedShow({ title: "Show B — has Bob" });
    await seedCrew({ showId: showB, name: "Bob A1", roleFlags: ["A1"] });

    // Calling with Alice's id but pointing at Show B MUST throw, not silently
    // fall through and return Show B's data with Alice's LEAD flags applied.
    await expect(getShowForViewer(showB, { kind: "crew", crewMemberId: aliceId })).rejects.toThrow(
      "LINK_NO_CREW_MATCH",
    );
  });

  test("admin_preview cross-show regression: foreign crew id fails closed like crew", async () => {
    const showA = await seedShow({ title: "Preview Show A — has Alice" });
    const aliceId = await seedCrew({
      showId: showA,
      name: "Alice Lead",
      roleFlags: ["LEAD", "A1"],
    });
    const showB = await seedShow({ title: "Preview Show B — has Bob" });
    await seedCrew({ showId: showB, name: "Bob A1", roleFlags: ["A1"] });

    await expect(
      getShowForViewer(showB, { kind: "admin_preview", crewMemberId: aliceId }),
    ).rejects.toThrow("LINK_NO_CREW_MATCH");
  });

  test("admin_preview re-derives role_flags from crew_members on every call", async () => {
    const showId = await seedShow({ title: "Preview Demote Show" });
    const crewId = await seedCrew({
      showId,
      name: "Preview Lead",
      roleFlags: ["LEAD", "A1"],
    });

    const first = await getShowForViewer(showId, { kind: "admin_preview", crewMemberId: crewId });
    expect(first.financials).toBeDefined();

    const { error } = await admin
      .from("crew_members")
      .update({ role_flags: ["A1"] })
      .eq("id", crewId);
    if (error) throw new Error(`admin_preview demote update failed: ${error.message}`);

    const second = await getShowForViewer(showId, { kind: "admin_preview", crewMemberId: crewId });
    expect(second.financials).toBeUndefined();
  });

  test("transport projection regression: schedule[*].assigned_names round-trips", async () => {
    const showId = await seedShow({ title: "Transport Show" });
    const crewId = await seedCrew({
      showId,
      name: "Alice",
      roleFlags: ["A1"],
    });
    const schedule = [
      { stage: "Load In", date: "2026-04-15", time: "08:00", assigned_names: ["Alice"] },
      { stage: "Show", date: "2026-04-15", time: "14:00", assigned_names: ["Alice", "Bob"] },
    ];
    const { error } = await admin.from("transportation").insert({
      show_id: showId,
      driver_name: "Driver Dan",
      driver_phone: null,
      driver_email: null,
      vehicle: "Sprinter",
      license_plate: null,
      color: null,
      parking: null,
      schedule,
      notes: null,
    });
    if (error) throw new Error(`seed transportation failed: ${error.message}`);

    const r = await getShowForViewer(showId, { kind: "crew", crewMemberId: crewId });

    expect(r.transportation).not.toBeNull();
    expect(r.transportation?.schedule[0]?.assigned_names).toEqual(["Alice"]);
    expect(r.transportation?.schedule[1]?.assigned_names).toEqual(["Alice", "Bob"]);
  });
});

/**
 * Schedule_phases projection (Task 4.9 prerequisite).
 *
 * `getShowForViewer` returns `show.schedule_phases` populated either from
 * the persisted `event_details.schedule_phases` (preferred path; future
 * sync-side write) OR derived inline from `dates` (M4 baseline — the
 * current seed writes only the parser's `event_details` Record without
 * merging schedule_phases). PackListTile (Task 4.9) reads the projection
 * and MUST receive a non-empty map for shows that have any of
 * travelIn/set/showDays/travelOut.
 */
describe("getShowForViewer — schedule_phases projection (Task 4.9 prerequisite)", () => {
  afterEach(async () => {
    await cleanupTestShows();
  });

  async function seedShowWithDates(opts: {
    title: string;
    dates: {
      travelIn: string | null;
      set: string | null;
      showDays: string[];
      travelOut: string | null;
    };
    eventDetails?: Record<string, unknown>;
  }): Promise<string> {
    const driveFileId = `${TEST_PREFIX}${crypto.randomUUID()}`;
    const slug = `gsfv-${crypto.randomUUID().slice(0, 12)}`;
    const { data, error } = await admin
      .from("shows")
      .insert({
        drive_file_id: driveFileId,
        slug,
        title: opts.title,
        client_label: "Test Client",
        template_version: "v4",
        dates: opts.dates,
        event_details: opts.eventDetails ?? {},
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seedShowWithDates failed: ${error?.message}`);
    return data.id as string;
  }

  test("populates schedule_phases by deriving from dates when event_details.schedule_phases is absent", async () => {
    // Travel In separate from Set → Set day gets ['Set'] only (per M1
    // deriveSchedulePhases logic; Load In is added only when travelIn===set).
    const showId = await seedShowWithDates({
      title: "PackList — derived phases",
      dates: {
        travelIn: "2026-04-14",
        set: "2026-04-15",
        showDays: ["2026-04-16", "2026-04-17"],
        travelOut: "2026-04-18",
      },
    });
    const crewId = await seedCrew({
      showId,
      name: "PL Crew",
      roleFlags: ["A1"],
    });

    const r = await getShowForViewer(showId, {
      kind: "crew",
      crewMemberId: crewId,
    });

    // Set day → ['Set']; last show day compounds Show + Strike;
    // travelOut → ['Load Out']. travelIn maps to nothing (travel-only).
    expect(r.show.schedule_phases["2026-04-15"]).toEqual(["Set"]);
    expect(r.show.schedule_phases["2026-04-16"]).toEqual(["Show"]);
    expect(r.show.schedule_phases["2026-04-17"]).toEqual(["Show", "Strike"]);
    expect(r.show.schedule_phases["2026-04-18"]).toEqual(["Load Out"]);
    expect(r.show.schedule_phases["2026-04-14"]).toBeUndefined();
  });

  test("prefers event_details.schedule_phases when present (forward-compat with future sync writes)", async () => {
    // Future sync layer (M6/M7) may write schedule_phases directly into
    // event_details. The projection MUST honor the persisted value over
    // the derived fallback so a richer (e.g., per-day SCHEDULE block)
    // derivation is not silently overwritten.
    const persistedPhases = {
      "2026-04-15": ["Load In", "Set"],
      "2026-04-16": ["Show"],
      "2026-04-17": ["Show", "Strike"],
    };
    const showId = await seedShowWithDates({
      title: "PackList — persisted phases",
      dates: {
        travelIn: null,
        set: "2026-04-15",
        showDays: ["2026-04-16", "2026-04-17"],
        travelOut: "2026-04-18",
      },
      eventDetails: { schedule_phases: persistedPhases },
    });
    const crewId = await seedCrew({
      showId,
      name: "PL Crew",
      roleFlags: ["A1"],
    });

    const r = await getShowForViewer(showId, {
      kind: "crew",
      crewMemberId: crewId,
    });

    // Persisted map round-trips verbatim — note the absence of
    // 2026-04-18, which the dates-derivation would have populated. The
    // projection must NOT mix derived and persisted entries.
    expect(r.show.schedule_phases).toEqual(persistedPhases);
  });

  test("returns empty schedule_phases when both dates and event_details are empty (degenerate)", async () => {
    const showId = await seedShowWithDates({
      title: "PackList — no dates",
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
    });
    const crewId = await seedCrew({
      showId,
      name: "PL Crew",
      roleFlags: ["A1"],
    });

    const r = await getShowForViewer(showId, {
      kind: "crew",
      crewMemberId: crewId,
    });

    expect(r.show.schedule_phases).toEqual({});
  });
});
