// @vitest-environment jsdom
/**
 * components/crew/sections/RoomsSection.tsx (crew page redesign PR C Task 7; spec §6.2
 * `rooms` row, line 309, lines 317 and 320; AC-9, AC-13).
 *
 * The Rooms section is the crew panel card titled with the registry label "Rooms &
 * scope", card id `gear-room-details`, around the shared room list
 * (components/show-panels/RoomsBody.tsx) with the crew props: no cap, the crew's room
 * label, `h4` names, sentinels hidden, empty disciplines dropped, the viewer's own
 * disciplines labeled and first, no rail and search targets. Below it, the Diagrams
 * block, moved from Venue with its wrapper. Tile ids are kept (plan decision 5).
 *
 * The scope cases moved here from GearSection.test.tsx and the room detail cases from
 * gearRoomDetails.test.tsx, each with the defect it catches. The cap case is inverted
 * with its failure mode kept, and the all-sentinel room case follows decision 6: a
 * room with no scope and no detail still renders its name.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import * as diagramItemsModule from "@/components/crew/diagramItems";
import { RoomsSection } from "@/components/crew/sections/RoomsSection";
import { roomsPanel } from "@/components/crew/sections/roomsRows";
import * as roomsBodyModule from "@/components/show-panels/RoomsBody";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { PersistedDiagrams, RoleFlag } from "@/lib/parser/types";
import { buildSheetDeepLink, CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const ADMIN: Viewer = { kind: "admin" };
const ROOMS_LABEL = showSection("rooms").label;
const EMPTY_STATE = "No rooms on file yet.";

type Room = ShowForViewer["rooms"][number];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A room with every other field absent, as a parsed sheet leaves them. */
const room = (over: Partial<Room> & Pick<Room, "id">): Room =>
  ({ kind: "gs", name: "Grand Ballroom", ...over }) as Room;

function crewWith(flags: RoleFlag[]): Parameters<typeof makeShowForViewer>[0] {
  return {
    crewMembers: [
      {
        id: "c1",
        name: "A",
        email: null,
        phone: null,
        role: "",
        roleFlags: flags,
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  };
}

function renderRooms(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger?: TileRenderLedger,
): HTMLElement {
  const { container } = render(
    <RoomsSection
      {...(ledger === undefined ? ledgerProp() : { ledger })}
      data={data}
      viewer={viewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return container;
}

function withRooms(rooms: unknown, over: Parameters<typeof makeShowForViewer>[0] = {}) {
  const data = makeShowForViewer(over);
  // Set after the fixture, which maps its list: a partial projection may hold no list.
  return { ...data, rooms: rooms as Room[] };
}

const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-card-id="gear-room-details"]');
const roomCards = (root: HTMLElement) => [...panel(root)!.querySelectorAll(":scope > ul > li")];
const scopeRows = (root: HTMLElement, i = 0) => [
  ...root.querySelectorAll<HTMLElement>(`[data-testid="crew-panel-room-${i}-scope"] > li`),
];
const scopeKeys = (root: HTMLElement, i = 0) =>
  scopeRows(root, i).map((row) => row.querySelector('[data-testid="room-scope-key"]')!.textContent);
const headerOf = (root: HTMLElement, i = 0) =>
  root.querySelector<HTMLElement>(`[data-testid="crew-panel-room-${i}-header"]`);

/** A diagrams payload with one available embedded image, named `alt`. */
function diagrams(alt: string): PersistedDiagrams {
  return {
    snapshot_revision_id: REV,
    snapshot_status: "complete",
    linkedFolder: null,
    embeddedImages: [
      {
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        alt,
        sheetsRevisionId: "rev-1",
        embeddedFingerprint: "fp",
        recovery_disposition: "normal",
        snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-1.png`,
      },
    ],
    linkedFolderItems: [],
  };
}

describe("rooms: the panel card", () => {
  test("rooms: the card keeps its id, the registry label, an h3 title and the room list", () => {
    const root = renderRooms(withRooms([room({ id: "r1", audio: "QU32" })]));
    const section = root.querySelector('[data-testid="section-rooms"]');
    expect(section).not.toBeNull();
    const card = panel(root);
    expect(card).not.toBeNull();
    expect(section!.contains(card)).toBe(true);
    expect(card!.getAttribute("data-testid")).toBe("crew-panel-card");
    expect(within(card!).getByRole("heading", { level: 3 })).toHaveTextContent(ROOMS_LABEL);
    expect(root.textContent ?? "").not.toMatch(/Room details|Gear/);
  });

  test("rooms: each name is an h4, and no room carries the admin's rail anchor", () => {
    const root = renderRooms(
      withRooms([room({ id: "r1" }), room({ id: "r2", kind: "breakout", name: "Salon 1" })]),
    );
    expect(
      within(panel(root)!)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(["Grand Ballroom", "Salon 1"]);
    expect(root.querySelector("[data-room-nav]")).toBeNull();
  });

  test("rooms: a nameless room reads its kind, the crew's label, never the admin's Room", () => {
    const root = renderRooms(withRooms([room({ id: "r1", name: "", audio: "QU32" })]));
    expect(within(panel(root)!).getByRole("heading", { level: 4 })).toHaveTextContent(
      "General Session",
    );
  });

  test("rooms: rooms read in compareRooms order, the general session first, then by name", () => {
    const root = renderRooms(
      withRooms([
        room({ id: "r3", kind: "additional", name: "Green Room", setup: "Couches" }),
        room({ id: "r2", kind: "breakout", name: "Salon B", setup: "Rounds" }),
        room({ id: "r4", kind: "breakout", name: "Salon A", setup: "Theater" }),
        room({ id: "r1", kind: "gs", name: "Zebra Ballroom", setup: "Classroom" }),
      ]),
    );
    expect(
      within(panel(root)!)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(["Zebra Ballroom", "Salon A", "Salon B", "Green Room"]);
    // The card at each place holds that room's own setup line, so the sort reaches
    // the targets and the rows together.
    expect(headerOf(root, 1)).toHaveTextContent("Theater");
    expect(headerOf(root, 2)).toHaveTextContent("Rounds");
  });

  test("rooms: the card's source link prefers gear_scope (the GEAR tab), else the rooms region", () => {
    const base = { driveFileId: "DRIVE123" };
    const rooms = [room({ id: "r1", audio: "(1) QU32" })];
    const link = (data: ShowForViewer) =>
      panel(renderRooms(data))!
        .querySelector('[data-slot="section-card-action"] a[data-slot="source-link"]')
        ?.getAttribute("href");

    const withGear = withRooms(rooms, {
      ...base,
      sourceAnchors: { gear_scope: { title: "GEAR", gid: 99 }, rooms: { title: "INFO", gid: 5 } },
    });
    expect(link(withGear)).toContain("#gid=99");
    cleanup();

    const noGear = withRooms(rooms, {
      ...base,
      sourceAnchors: { rooms: { title: "INFO", gid: 5 } },
    });
    expect(link(noGear)).toBe(
      buildSheetDeepLink(
        noGear.driveFileId,
        noGear.sourceAnchors[CARD_REGION_MAP["gear-room-details"]],
      ),
    );
    expect(link(noGear)).toContain("#gid=5");
  });

  test("rooms: a null card report leaves the source link and drops the report trigger", () => {
    const data = withRooms([room({ id: "r1", audio: "QU32" })], {
      driveFileId: "DRIVE123",
      sourceAnchors: { rooms: { title: "INFO", gid: 5 } },
    });
    const { container } = render(
      <RoomsSection
        {...ledgerProp()}
        data={data}
        viewer={CREW}
        today={TODAY}
        showId={SHOW_ID}
        cardReport={null}
      />,
    );
    const slot = panel(container)!.querySelector('[data-slot="section-card-action"]');
    expect(slot?.querySelector('a[data-slot="source-link"]')).not.toBeNull();
    expect(slot?.querySelector('[data-slot="card-report-trigger"]')).toBeNull();
  });
});

describe("rooms: scope and emphasis", () => {
  const GS = room({ id: "r1", audio: "2x SM58", video: "1x PTZ", lighting: "8x par" });

  test("rooms: a viewer's own discipline leads, labeled inside its row; every other stays, unmarked", () => {
    // A V1, not an A1: Audio leads the sheet's order, so an A1 would pass unsorted.
    const root = renderRooms(withRooms([GS], crewWith(["V1"])));
    expect(scopeKeys(root)).toEqual(["Video", "Audio", "Lighting"]);
    const [video, ...rest] = scopeRows(root);
    expect(video).toHaveAttribute("data-emphasis", "you");
    expect(video).toHaveTextContent("Your scope");
    for (const row of rest) {
      expect(row).not.toHaveAttribute("data-emphasis");
      expect(row).not.toHaveTextContent("Your scope");
    }
    expect(root.querySelectorAll('[data-emphasis="you"]')).toHaveLength(1);
  });

  test("rooms: a viewer with no discipline flags sees no label, the same rows, and the sheet's order", () => {
    const root = renderRooms(withRooms([GS], crewWith([])));
    expect(scopeKeys(root)).toEqual(["Audio", "Video", "Lighting"]);
    expect(root.querySelector("[data-emphasis]")).toBeNull();
    expect(root.textContent ?? "").not.toContain("Your scope");
  });

  test("rooms: a LEAD owns all three, in the sheet's order, ahead of Scenic and Other", () => {
    const root = renderRooms(
      withRooms(
        [room({ id: "r1", other: "Podium", scenic: "Drape", lighting: "Par", audio: "Mic" })],
        crewWith(["LEAD"]),
      ),
    );
    expect(scopeKeys(root)).toEqual(["Audio", "Lighting", "Scenic", "Other"]);
    expect(root.querySelectorAll('[data-emphasis="you"]')).toHaveLength(2);
  });

  test("rooms: the viewer's own discipline with nothing on file renders no row, in that room", () => {
    const root = renderRooms(
      withRooms(
        [room({ id: "r1", audio: "Mic", lighting: null }), room({ id: "r2", name: "Salon" })],
        crewWith(["L1"]),
      ),
    );
    expect(scopeKeys(root)).toEqual(["Audio"]);
    expect(root.querySelector('[data-emphasis="you"]')).toBeNull();
  });

  test("rooms: each discipline carries its own glyph and the emphasis is per room", () => {
    const root = renderRooms(
      withRooms(
        [
          room({ id: "r1", audio: "Mic" }),
          room({ id: "r2", kind: "breakout", name: "Salon", audio: "Lav", video: "Monitor" }),
        ],
        crewWith(["A1"]),
      ),
    );
    expect(scopeRows(root, 0)[0]).toHaveAttribute("data-emphasis", "you");
    expect(scopeRows(root, 1)[0]).toHaveAttribute("data-emphasis", "you");
    expect(scopeRows(root, 1)[1]).not.toHaveAttribute("data-emphasis");
    for (const row of scopeRows(root, 1)) expect(row.querySelector("svg")).not.toBeNull();
  });

  test("rooms: Scenic and Other render when populated, never emphasized", () => {
    const root = renderRooms(
      withRooms(
        [room({ id: "r1", scenic: "(2) Grey Spandex", other: "(1) Truss Podium" })],
        crewWith(["LEAD"]),
      ),
    );
    expect(scopeKeys(root)).toEqual(["Scenic", "Other"]);
    expect(root.querySelector("[data-emphasis]")).toBeNull();
  });

  test.each([
    ["a parsed Not specified", "Not specified"],
    ["a respaced lower-case form", " not  specified "],
    ["NA", "NA"],
    ["N/A", "N/A"],
    ["TBD", "TBD"],
    ["a dash", "-"],
    ["blank", "   "],
    ["null", null],
  ])("rooms: %s renders no row and indexes no line, beside a real discipline", (_name, value) => {
    const data = withRooms([room({ id: "r1", audio: "QU32", video: value })]);
    const root = renderRooms(data);
    // POSITIVE CONTROL: the real discipline in the same room renders and is indexed.
    expect(scopeKeys(root)).toEqual(["Audio"]);
    const entries = roomsPanel(data.rooms, []).entries;
    expect(entries.some((e) => e.label === "Audio" && e.value === "QU32")).toBe(true);
    expect(entries.some((e) => e.label === "Video")).toBe(false);
    expect(root.textContent ?? "").not.toContain("Not specified");
  });

  test("rooms: a discipline's line carries its room, and Your scope only for the viewer's own", () => {
    const data = withRooms([room({ id: "r1", audio: "QU32", video: "LED" })]);
    const entries = roomsPanel(data.rooms, ["A1"]).entries;
    expect(entries.find((e) => e.label === "Audio")?.context).toEqual([
      "Grand Ballroom",
      "Your scope",
    ]);
    expect(entries.find((e) => e.label === "Video")?.context).toEqual(["Grand Ballroom"]);
  });
});

describe("rooms: each room's header", () => {
  test("rooms: renders per-room detail, sentinels hidden, a time as written, nothing out of scope", () => {
    const root = renderRooms(
      withRooms([
        room({
          id: "r1",
          dimensions: "60' x 45'",
          floor: "8th Floor",
          setup: "18 tables of 7",
          set_time: "5/13 after 8pm",
          show_time: "10/20 @ TBD",
          strike_time: "TBD",
          // Out of scope for this card:
          power: "100A",
          digital_signage: "2 screens",
          notes: "be careful",
        }),
      ]),
    );
    const header = within(headerOf(root)!);
    expect(header.getByText("Grand Ballroom")).toBeTruthy();
    expect(header.getByText("General session")).toBeTruthy();
    expect(header.getByText("8th Floor")).toBeTruthy();
    expect(header.getByText("Room Dimensions")).toBeTruthy();
    expect(header.getByText("60' x 45'")).toBeTruthy();
    expect(header.getByText("Setup")).toBeTruthy();
    expect(header.getByText("18 tables of 7")).toBeTruthy();
    expect(header.getByText("5/13 after 8pm")).toBeTruthy();
    // A room time renders as written (plan decision 6); a bare sentinel does not.
    expect(header.getByText("10/20 @ TBD")).toBeTruthy();
    expect(header.queryByText("Strike")).toBeNull();
    for (const out of ["100A", "2 screens", "be careful"]) {
      expect(within(panel(root)!).queryByText(out)).toBeNull();
    }
  });

  test("rooms: a sentinel in every header field leaves the name and kind pill, and no empty list", () => {
    const root = renderRooms(
      withRooms([
        room({
          id: "r1",
          kind: "breakout",
          name: "Lasalle",
          dimensions: "N/A",
          floor: "TBD",
          setup: "-",
          set_time: "",
          audio: "TBD",
        }),
      ]),
    );
    expect(roomCards(root)).toHaveLength(1);
    expect(headerOf(root)).toHaveTextContent(/^LasalleBreakout$/);
    expect(root.querySelector('[data-testid="crew-panel-room-0-scope"]')).toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')).toBeNull();
  });

  test("rooms: a non-string value coerces and shows, in a header field and a discipline", () => {
    const root = renderRooms(
      withRooms([
        room({ id: "r1", dimensions: 169 as unknown as string, audio: 42 as unknown as string }),
      ]),
    );
    expect(within(headerOf(root)!).getByText("169")).toBeTruthy();
    expect(within(scopeRows(root)[0]!).getByText("42")).toBeTruthy();
  });

  test("rooms: every room renders past the old 12-block cap, with no overflow line", () => {
    const count = 14;
    const rooms = Array.from({ length: count }, (_, i) =>
      room({
        id: `r${i}`,
        kind: "breakout",
        name: `Room ${String(i + 1).padStart(2, "0")}`,
        dimensions: `${i}0' x 20'`,
      }),
    );
    const root = renderRooms(withRooms(rooms));
    expect(roomCards(root)).toHaveLength(count);
    expect(panel(root)).toHaveTextContent(`Room ${count}`);
    expect(root.textContent ?? "").not.toMatch(/more rooms?/);
  });
});

describe("rooms: the empty state and the fetch failure", () => {
  test.each([
    ["an empty list", []],
    ["a value that is not a list", { id: "not a list" }],
    ["null", null],
  ])("rooms: %s reads as no rooms: the empty state, no panel", (_name, rooms) => {
    const root = renderRooms(withRooms(rooms));
    expect(root.querySelector('[data-testid="section-empty"]')?.textContent).toBe(EMPTY_STATE);
    expect(panel(root)).toBeNull();
  });

  test("rooms: diagrams with no rooms show the Diagrams block, no panel and no empty state", () => {
    const root = renderRooms(withRooms([], { diagrams: diagrams("Stage plot") }));
    expect(root.querySelector('[data-testid="diagrams-tile"]')).not.toBeNull();
    expect(panel(root)).toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')).toBeNull();
  });

  test("rooms: a failed rooms fetch shows an admin the degraded block in place of the empty state", () => {
    const root = renderRooms(withRooms([], { tileErrors: { rooms: "boom" } }), ADMIN);
    expect(root.querySelector('[data-testid="section-tile-error-rooms"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')).toBeNull();
    expect(root.textContent ?? "").not.toContain("boom");
  });

  test("rooms: a failed rooms fetch shows a crew member the empty state, the audience unchanged", () => {
    const root = renderRooms(withRooms([], { tileErrors: { rooms: "boom" } }), CREW);
    expect(root.querySelector('[data-testid="section-tile-error-rooms"]')).toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')?.textContent).toBe(EMPTY_STATE);
  });

  test("rooms: with no failure the admin sees the empty state, not the degraded block", () => {
    const root = renderRooms(withRooms([]), ADMIN);
    expect(root.querySelector('[data-testid="section-tile-error-rooms"]')).toBeNull();
    expect(root.querySelector('[data-testid="section-empty"]')).not.toBeNull();
  });
});

describe("rooms: the Diagrams block", () => {
  const data = () =>
    withRooms([room({ id: "r1", audio: "QU32" })], { diagrams: diagrams("Stage plot") });

  test("rooms: the block sits under the panel, keeping its test id, card id and no source link", () => {
    const root = renderRooms(data());
    const section = root.querySelector('[data-testid="section-rooms"]')!;
    const block = root.querySelector<HTMLElement>('[data-testid="venue-diagrams"]');
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute("data-card-id", "venue-diagrams");
    expect(section.contains(block)).toBe(true);
    expect(panel(root)!.contains(block)).toBe(false);
    expect(
      panel(root)!.compareDocumentPosition(block!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(block!.querySelector('a[data-slot="source-link"]')).toBeNull();
    expect(block!.querySelector('[data-testid="diagrams-tile"]')).not.toBeNull();
  });

  test("rooms: no diagrams draw no block", () => {
    const root = renderRooms(withRooms([room({ id: "r1", audio: "QU32" })], { diagrams: null }));
    premiseHolds("the panel rendered", panel(root) !== null);
    expect(root.querySelector('[data-testid="venue-diagrams"]')).toBeNull();
  });

  test("rooms: the gallery keeps its own default sizes: there is no narrow column here", () => {
    const root = renderRooms(data());
    const sizes = root.querySelector("img")?.getAttribute("sizes") ?? "";
    premise("the gallery rendered an image with a sizes value", sizes.length, 0);
    expect(sizes).not.toContain("92px");
  });
});

describe("rooms: containment", () => {
  const data = () =>
    withRooms([room({ id: "r1", audio: "QU32" })], { diagrams: diagrams("Stage plot") });

  test("rooms: a throw from the body is contained under crew:gear:scope, with the Diagrams block intact", () => {
    vi.spyOn(roomsBodyModule, "RoomsBody").mockImplementation(() => {
      throw new Error("planted body fault");
    });
    const ledger = createTileRenderLedger();
    const root = renderRooms(data(), CREW, ledger);
    expect(root.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
    expect(ledger.failed.get("crew:gear:scope")?.message).toBe("planted body fault");
    expect(root.querySelector('[data-testid="diagrams-tile"]')).not.toBeNull();
    expect(ledger.failed.has("crew:venue:diagrams")).toBe(false);
  });

  test("rooms: a throw from the Diagrams block is contained under crew:venue:diagrams, with the room list intact", () => {
    vi.spyOn(diagramItemsModule, "diagramGalleryItems").mockImplementation(() => {
      throw new Error("planted gallery fault");
    });
    const ledger = createTileRenderLedger();
    const root = renderRooms(data(), CREW, ledger);
    const block = root.querySelector('[data-testid="venue-diagrams"]')!;
    expect(block.querySelector('[data-testid="tile-error-fallback"]')).not.toBeNull();
    expect(ledger.failed.get("crew:venue:diagrams")?.message).toBe("planted gallery fault");
    expect(ledger.failed.has("crew:gear:scope")).toBe(false);
    expect(scopeKeys(root)).toEqual(["Audio"]);
  });

  test("rooms: a clean render records both tiles as attempted and none as failed", () => {
    const ledger = createTileRenderLedger();
    renderRooms(data(), CREW, ledger);
    expect(ledger.attempted.has("crew:gear:scope")).toBe(true);
    expect(ledger.attempted.has("crew:venue:diagrams")).toBe(true);
    expect(ledger.failed.size).toBe(0);
  });
});
