// @vitest-environment jsdom
// Task 3 (modal-state-coverage plan): the applyFixture knob mapping and the
// spec §3.2 derivation-parity walker. Every GalleryModalData field production
// derives from the snapshot must be derived the SAME way here — never injected.
import React from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  applyFixture,
  buildGallerySnapshot,
  buildGalleryModalData,
} from "@/lib/dev/publishedModalFixture";
import { GALLERY_BASE_COUNTS, type ScenarioFixture } from "@/lib/dev/attentionScenarios/types";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { isShowLiveOnDate } from "@/lib/time/showSpan";
import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
import { PublishedDiagramsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ShowRow } from "@/lib/parser/types";

const SLUG = { slug: "gallery" } as const;

function applied(fx: ScenarioFixture, firstSurvivingAlertId?: string) {
  return applyFixture(
    buildGallerySnapshot(),
    fx,
    firstSurvivingAlertId !== undefined ? { firstSurvivingAlertId } : {},
  );
}

describe("GALLERY_BASE_COUNTS pins the real fixture", () => {
  test("base collection sizes match the validation constant", () => {
    const snap = buildGallerySnapshot();
    expect(snap.crew_members.length).toBe(GALLERY_BASE_COUNTS.crew);
    expect(snap.rooms.length).toBe(GALLERY_BASE_COUNTS.rooms);
    expect(snap.hotel_reservations.length).toBe(GALLERY_BASE_COUNTS.hotels);
  });
});

describe("derivation-parity walker (spec §3.2)", () => {
  test("crewEmails derives from email-bearing snapshot rows under the 500 cap", () => {
    const { snapshot, dataOverrides } = applied({ share: { linkActive: true, crewEmails: 3 } });
    const emails = snapshot.crew_members
      .map((r) => (r as Record<string, unknown>).email)
      .filter((e): e is string => typeof e === "string" && e.includes("@"));
    expect(emails.length).toBe(3);
    expect(dataOverrides.crewEmails).toEqual(emails);
  });
  test("previewRoster and crewEmails blank when the roster exceeds 500", () => {
    const { snapshot, dataOverrides } = applied({ volumes: { crew: 501 } });
    expect(snapshot.crew_members.length).toBe(501);
    expect(dataOverrides.crewEmails).toEqual([]);
    expect(dataOverrides.data?.previewRoster).toEqual([]);
  });
  test("exactly 500 rows is NOT over the cap (the contract is > 500, not >= 500)", () => {
    const { snapshot, dataOverrides } = applied({ volumes: { crew: 500 } });
    expect(snapshot.crew_members.length).toBe(500);
    // Under-or-at the cap the emails derive from the snapshot rows and the
    // preview roster is NOT blanked.
    expect(dataOverrides.crewEmails).not.toEqual([]);
    expect(dataOverrides.data?.previewRoster).toBeUndefined();
  });
  test("crewEmails re-derives for EVERY fixture, not just share/over-cap (review A P1)", () => {
    // Emptying the crew must flow into crewEmails — the static base emails
    // leaking through was the review finding.
    const emptied = applied({ empty: ["crew"] });
    expect(emptied.dataOverrides.crewEmails).toEqual([]);
    // An under-cap crew reshape must re-derive from the reshaped snapshot.
    const grown = applied({ volumes: { crew: 9 } });
    const grownEmails = grown.snapshot.crew_members
      .map((r) => (r as Record<string, unknown>).email)
      .filter((e): e is string => typeof e === "string" && e.includes("@"));
    expect(grown.dataOverrides.crewEmails).toEqual(grownEmails);
  });
  test("pickerCrew derives from snapshot rows; archived blanks it", () => {
    const live = applied({ isLive: true });
    expect(live.dataOverrides.pickerCrew).toHaveLength(GALLERY_BASE_COUNTS.crew);
    expect(live.dataOverrides.pickerCrew?.[0]).toMatchObject({ name: "Gallery Crew" });
    const arch = applied({ archived: true, published: false });
    expect(arch.dataOverrides.pickerCrew).toEqual([]);
  });
  test("isLive reshapes dates around GALLERY_NOW consistent with production", () => {
    const { snapshot, dataOverrides } = applied({ isLive: true });
    expect(dataOverrides.isLive).toBe(true);
    const dates = (snapshot.show as Record<string, unknown>).dates as ShowRow["dates"];
    expect(isShowLiveOnDate(dates, "2026-07-01")).toBe(true);
  });
  test("isLive is DERIVED (published && isShowLiveOnDate), never asserted (review A P1)", () => {
    // The validator forbids this combination, but the mapper must not depend on
    // that: an unpublished show cannot derive live, so the badge stays false.
    const unpublished = applied({ published: false, isLive: true });
    expect(unpublished.dataOverrides.isLive).toBe(false);
  });
  test("titleAbsent yields modal title null and storable empty snapshot title", () => {
    const { snapshot, dataOverrides } = applied({ titleAbsent: true });
    expect(dataOverrides.title).toBeNull();
    expect((snapshot.show as Record<string, unknown>).title).toBe("");
  });
  test("archived forces published false and finalizeOwned false in both halves", () => {
    const { snapshot, dataOverrides } = applied({ archived: true, published: false });
    expect(dataOverrides.archived).toBe(true);
    expect(dataOverrides.published).toBe(false);
    expect(dataOverrides.finalizeOwned).toBe(false);
    expect((snapshot.show as Record<string, unknown>).archived).toBe(true);
    expect((snapshot.show as Record<string, unknown>).published).toBe(false);
  });
  test("clientAbsent stores the empty string (DDL NOT NULL) and the adapter absents it", () => {
    const { snapshot } = applied({ clientAbsent: true });
    expect((snapshot.show as Record<string, unknown>).client_label).toBe("");
    expect(buildPublishedSectionData(snapshot, SLUG).clientLabel).toBeNull();
  });
  test("sync trio knobs", () => {
    const never = applied({ neverSynced: true });
    expect(never.dataOverrides.lastSyncedAt).toBeNull();
    expect(never.dataOverrides.lastCheckedAt).toBeNull();
    const noCheck = applied({ checkedAbsent: true });
    expect(noCheck.dataOverrides.lastCheckedAt).toBeNull();
    expect(noCheck.dataOverrides.lastSyncedAt).not.toBeNull();
    const drive = applied({ lastSyncStatus: "drive_error" });
    expect(drive.dataOverrides.lastSyncStatus).toBe("drive_error");
    const notYet = applied({ lastSyncStatus: null });
    expect(notYet.dataOverrides.lastSyncStatus).toBeNull();
  });
  test("openSheetHref always derives from the fixture drive_file_id", () => {
    const { snapshot, dataOverrides } = applied({ titleAbsent: true });
    const raw = (snapshot.show as Record<string, unknown>).drive_file_id;
    const dfid = typeof raw === "string" ? raw : null;
    expect(dataOverrides.openSheetHref ?? buildGalleryModalData().openSheetHref).toBe(
      buildSheetDeepLink(dfid),
    );
  });
  test("alertFlash threads the surviving alert id; absent flash leaves alertId untouched", () => {
    const flash = applied({ alertFlash: true }, "scenario-alert-0");
    expect(flash.dataOverrides.alertId).toBe("scenario-alert-0");
    const noFlash = applied({ titleAbsent: true });
    expect(noFlash.dataOverrides.alertId).toBeUndefined();
  });
});

describe("empty-section knobs", () => {
  test("each empty key empties its collection and flips the adapter branch", () => {
    const { snapshot } = applied({
      empty: ["crew", "venue", "rooms", "hotels", "transport", "contacts", "billing", "agenda"],
      datesAbsent: true,
    });
    const data = buildPublishedSectionData(snapshot, SLUG);
    expect(data.crewMembers).toHaveLength(0);
    expect(data.venue).toBeNull();
    expect(data.rooms).toHaveLength(0);
    expect(data.hotels).toHaveLength(0);
    expect(data.transportation).toBeNull();
    expect(data.contacts).toHaveLength(0);
    expect(data.billing.coiStatus).toBeNull();
    expect(data.agendaBaseline).toHaveLength(0);
  });
});

describe("volume knobs", () => {
  test("crew/rooms/hotels volumes generate deterministic rows past the caps", () => {
    const { snapshot } = applied({ volumes: { crew: 31, rooms: 21, hotels: 13 } });
    expect(snapshot.crew_members).toHaveLength(31);
    expect(snapshot.rooms).toHaveLength(21);
    expect(snapshot.hotel_reservations).toHaveLength(13);
    const again = applied({ volumes: { crew: 31, rooms: 21, hotels: 13 } });
    expect(again.snapshot.crew_members).toEqual(snapshot.crew_members);
  });
  test("hotels: 1 leaves a single hotel; hotelGuests: 7 puts 7 names on hotel 1", () => {
    expect(applied({ volumes: { hotels: 1 } }).snapshot.hotel_reservations).toHaveLength(1);
    const { snapshot } = applied({ volumes: { hotelGuests: 7 } });
    const first = snapshot.hotel_reservations[0] as Record<string, unknown>;
    expect((first.names as string[]).length).toBe(7);
  });
  test("schedule overflow: 15 pure-agenda days of 8 + 1 synthetic-only day", () => {
    const { snapshot } = applied({ volumes: { schedule: "overflow" } });
    const ros = snapshot.internal?.run_of_show as Record<
      string,
      { entries: Array<{ kind?: string }> }
    >;
    const days = Object.keys(ros);
    expect(days).toHaveLength(16);
    const synthetic = days.filter((d) =>
      ros[d]!.entries.some((e) => e.kind === "strike" || e.kind === "loadout"),
    );
    expect(synthetic).toHaveLength(1);
    const agendaDays = days.filter((d) => !synthetic.includes(d));
    for (const d of agendaDays) {
      expect(ros[d]!.entries.filter((e) => e.kind === undefined)).toHaveLength(8);
    }
    expect(ros[synthetic[0]!]!.entries.every((e) => e.kind !== undefined)).toBe(true);
  });
  test("packlist volumes generate adapter-legal cases", () => {
    const { snapshot } = applied({ volumes: { packlist: { cases: 13, itemsPerCase: 9 } } });
    const data = buildPublishedSectionData(snapshot, SLUG);
    expect(data.pullSheet).toHaveLength(13);
    expect(data.pullSheet[0]?.items).toHaveLength(9);
  });
  test("agenda overflow: base link extraction overflows the preview caps", () => {
    const { snapshot } = applied({ volumes: { agenda: "overflow" } });
    const baseline = buildPublishedSectionData(snapshot, SLUG).agendaBaseline;
    const first = baseline[0];
    if (!first || first.block === null) throw new Error("agenda overflow produced no block");
    expect(first.block.droppedSessions).toBeGreaterThan(0);
    expect(first.block.droppedDays).toBeGreaterThan(0);
    expect(first.block.droppedTracks).toBeGreaterThan(0);
  });
  test("agendaLinks: 7 grammar-labeled links (6 visible + badges)", () => {
    const { snapshot } = applied({ volumes: { agendaLinks: 7 } });
    const baseline = buildPublishedSectionData(snapshot, SLUG).agendaBaseline;
    expect(baseline).toHaveLength(6);
    expect(baseline.every((i) => i.badge !== null)).toBe(true);
  });
  test("diagramImages: 13 render a 12-tile grid plus the overflow note", () => {
    const { snapshot } = applied({ volumes: { diagramImages: 13 } }, undefined);
    render(
      <PublishedDiagramsBreakdown
        showId="99999999-9999-4999-8999-999999999999"
        driveFileId="DRIVE_GALLERY"
        diagrams={(snapshot.show as Record<string, unknown>).diagrams}
      />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(12);
    expect(screen.getByText(/\+1 more/)).toBeDefined();
  });
});

describe("share knob", () => {
  test("60 fixed-length emails overflow the mailto batch cap", () => {
    const { snapshot, dataOverrides } = applied({
      share: { linkActive: true, crewEmails: 60 },
    });
    expect(snapshot.crew_members.length).toBeGreaterThanOrEqual(60);
    const emails = dataOverrides.crewEmails ?? [];
    expect(emails).toHaveLength(60);
    const mailtos = buildCrewLinkMailtos({
      emails,
      url: "https://x.test/show/gallery/tok",
      showTitle: "Gallery Preview Show",
    });
    expect(mailtos.length).toBeGreaterThan(1);
  });
  test("3 short emails fit one batch; 0 with empty crew yields none", () => {
    const three = applied({ share: { linkActive: true, crewEmails: 3 } });
    const mailtos = buildCrewLinkMailtos({
      emails: three.dataOverrides.crewEmails ?? [],
      url: "https://x.test/show/gallery/tok",
      showTitle: "Gallery Preview Show",
    });
    expect(mailtos.length).toBe(1);
    const zero = applied({ empty: ["crew"], share: { linkActive: true, crewEmails: 0 } });
    expect(zero.dataOverrides.crewEmails).toEqual([]);
    expect(zero.snapshot.crew_members).toHaveLength(0);
  });
});

describe("base-fixture enrichment (rich base for all)", () => {
  test("event anchor snapshot renders dress code and a boolean chip source", () => {
    const snap = buildGallerySnapshot([], { anchors: { openingReel: true } });
    const details = (snap.show as Record<string, unknown>).event_details as Record<string, unknown>;
    expect(typeof details.dress_code).toBe("string");
    expect(details.polling).toBe("Yes");
  });
  test("venue carries a loading dock; transport row 1 carries loadout, notes, and a route leg; room 1 carries a floor", () => {
    const snap = buildGallerySnapshot();
    const venue = (snap.show as Record<string, unknown>).venue as Record<string, unknown>;
    expect(typeof venue.loadingDock).toBe("string");
    const t = snap.transportation[0] as Record<string, unknown>;
    expect(typeof t.loadout_name).toBe("string");
    expect(typeof t.notes).toBe("string");
    expect((t.schedule as unknown[]).length).toBeGreaterThan(0);
    const room = snap.rooms[0] as Record<string, unknown>;
    expect(typeof room.floor).toBe("string");
  });
});
