// BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH (spec 2026-08-09-m-wave-2-design
// §2.3): crew-page integration pair for anchor freshness. A stale-anchor fixture
// (anchors present, data revision advanced past the anchors' revision) must render
// the `#gid=0` FALLBACK sheet link, not a deep link built from anchors that
// describe an older workbook layout. Written against the live tree as the task's
// RED: today no comparison exists anywhere, so the stale fixture renders a deep
// link and the fallback assertion fails.
//
// DB-backed (local Supabase, the tests/data/getShowForViewer.test.ts pattern):
// seeds a real shows row, projects through the REAL getShowForViewer, renders the
// REAL SourceLink primitive from the projection — the exact crew-page seam.
// @vitest-environment jsdom
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { getShowForViewer } from "@/lib/data/getShowForViewer";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PREFIX = "anchorFreshness-test:";
const R1 = "2026-08-01T00:00:00.000Z";
const R2 = "2026-08-02T00:00:00.000Z";
const ANCHOR: SourceAnchor = { title: "INFO", gid: 42, a1: "B7" };

const seeded: string[] = [];

async function seedShow(row: Record<string, unknown>): Promise<{
  showId: string;
  driveFileId: string;
  crewMemberId: string;
}> {
  const driveFileId = `${TEST_PREFIX}${crypto.randomUUID()}`;
  const slug = `anchor-${crypto.randomUUID().slice(0, 12)}`;
  const { data, error } = await admin
    .from("shows")
    .insert({
      drive_file_id: driveFileId,
      slug,
      title: "Anchor Freshness Show",
      client_label: "Anchor Client",
      template_version: "v4",
      coi_status: "SENT",
      published: true,
      dates: { travelIn: null, set: null, showDays: ["2026-08-20"], travelOut: null },
      ...row,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  const showId = (data as { id: string }).id;
  seeded.push(showId);
  const { data: crew, error: crewErr } = await admin
    .from("crew_members")
    .insert({ show_id: showId, name: "Anchor Tester", role: "A1", role_flags: [] })
    .select("id")
    .single();
  if (crewErr || !crew) throw new Error(`crew seed failed: ${crewErr?.message}`);
  return { showId, driveFileId, crewMemberId: (crew as { id: string }).id };
}

afterEach(async () => {
  cleanup();
  for (const id of seeded.splice(0)) {
    await admin.from("shows").delete().eq("id", id);
  }
});

async function renderedHref(showId: string, crewMemberId: string): Promise<string | null> {
  const projection = await getShowForViewer(showId, { kind: "crew", crewMemberId });
  const { container } = render(
    React.createElement(SourceLink, {
      driveFileId: projection.driveFileId,
      anchor: (projection.sourceAnchors as Record<string, SourceAnchor>)["crew"] ?? null,
    }),
  );
  return container.querySelector("a")?.getAttribute("href") ?? null;
}

describe("crew-page anchor freshness (integration pair)", () => {
  test("MISMATCHED stamp: the rendered sheet link is the #gid=0 fallback, never a stale deep link", async () => {
    const { showId, driveFileId, crewMemberId } = await seedShow({
      source_anchors: { crew: ANCHOR },
      last_seen_modified_time: R2,
      source_anchors_modified_time: R1, // anchors computed from an OLDER revision
    });
    const href = await renderedHref(showId, crewMemberId);
    expect(href).toBe(`https://docs.google.com/spreadsheets/d/${driveFileId}/edit#gid=0`);
  });

  test("NULL stamp (provenance unknown): fallback too", async () => {
    const { showId, driveFileId, crewMemberId } = await seedShow({
      source_anchors: { crew: ANCHOR },
      last_seen_modified_time: R2,
      source_anchors_modified_time: null,
    });
    const href = await renderedHref(showId, crewMemberId);
    expect(href).toBe(`https://docs.google.com/spreadsheets/d/${driveFileId}/edit#gid=0`);
  });

  test("MATCHED stamp: the deep link renders with gid and range", async () => {
    const { showId, driveFileId, crewMemberId } = await seedShow({
      source_anchors: { crew: ANCHOR },
      last_seen_modified_time: R2,
      source_anchors_modified_time: R2,
    });
    const href = await renderedHref(showId, crewMemberId);
    expect(href).toBe(`https://docs.google.com/spreadsheets/d/${driveFileId}/edit#gid=42&range=B7`);
  });
});
