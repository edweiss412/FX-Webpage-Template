// @vitest-environment jsdom
/**
 * tests/components/admin/review/publishedNoStagedTraffic.test.tsx (Task 9 — spec §3.5)
 *
 * Structural pin for the published-mode section forks. Renders EVERY section
 * def emitted by `step3Sections(publishedFixture)` (filesystem-of-the-registry:
 * a NEW section added later is covered automatically — the test iterates the
 * registry, it does not name a subset) PLUS the modal-level RawUnrecognizedCallout,
 * from a PublishedSectionData built through the canonical `buildPublishedSectionData`
 * adapter entry path (never a hand-rolled shape).
 *
 * The invariants it pins (spec §3.5, plan meta-test inventory row):
 *   - ZERO `/api/admin/onboarding/*` traffic in published mode: no rendered
 *     `src`/`href` targets that route AND no `fetch` fires to it. A regression
 *     that wires a staged body (AgendaBreakdown POST, staged-diagram src,
 *     pull-sheet-override) into published mode fails here.
 *   - Agenda renders the STATIC variant: persisted extraction renders schedule
 *     blocks (not note-only rows) and the PDF anchor resolves through the
 *     published `/api/asset/agenda/<show>/<fileId>` route.
 *   - Diagram tiles resolve through the published `/api/asset/diagram/<show>/<rev>/<key>`
 *     asset route (crew Gallery pattern), never the staged wizard-session route.
 *   - Packlist renders read-only: no wizard-session identifier in any attribute
 *     and no archived-tab accept/skip affordance (Task 2's staged-only gate).
 *
 * Anti-tautology: every expected value derives from the fixture (rev, fileId,
 * snapshotPath last segment); DOM label scans are scoped `within(...)` the
 * section's own wrapper, and the wizard-session leak scan clones the packlist
 * subtree so a sibling section can never satisfy (or spoil) the assertion.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";

// Some published section bodies (warning controls) may read useRouter; none of
// them mutate, but keep RTL from throwing on the hook.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  RawUnrecognizedCallout,
  step3Sections,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const REV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"; // diagrams snapshot_revision_id
const DRIVE_FILE_ID = "DRIVE_PUB";
const AGENDA_FILE_ID = "FID_A";
const DIAGRAM_KEY = "asset-key-1.png"; // last segment of the persisted snapshotPath
const ONBOARDING_PREFIX = "/api/admin/onboarding/";

/** A high-confidence extraction the render-boundary validator accepts (days>0). */
function validExtraction() {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: 1,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-05-01",
        sessions: [
          { time: "09:00", title: "Opening Keynote", room: null, drift: null, tracks: [] },
        ],
      },
    ],
  };
}

/** Inner PersistedDiagrams shape — the value persisted at `shows.diagrams.current`
 *  by the promotion cutover (lib/sync/promoteSnapshot.ts:299). The real runtime
 *  column carries the `{ current, pending }` wrapper, not this shape directly, so
 *  the fixture below wraps this in `{ current: persistedDiagrams(), pending: null }`
 *  to exercise the `resolveCurrentDiagrams` unwrap (lib/data/diagrams.ts:54) through
 *  `PublishedDiagramsBreakdown` (step3ReviewSections.tsx:3291) rather than bypass it.
 *  One servable embedded image whose snapshotPath last segment is DIAGRAM_KEY, so the
 *  published asset URL is derivable from the fixture, not hardcoded into the component. */
function persistedDiagrams() {
  return {
    snapshot_revision_id: REV,
    snapshot_status: "complete",
    linkedFolder: null,
    embeddedImages: [
      {
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        sheetsRevisionId: "sr-1",
        embeddedFingerprint: "fp-1",
        recovery_disposition: "normal",
        snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/${DIAGRAM_KEY}`,
      },
    ],
    linkedFolderItems: [],
  };
}

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Published Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [
        { label: "Day 1", fileId: AGENDA_FILE_ID, extracted: validExtraction() },
        { label: "Ext", url: "https://ex.com/a.pdf" },
      ],
      coi_status: "received",
      // Real persisted shape is the `{ current, pending }` wrapper (see
      // persistedDiagrams() doc comment above) — never the inner shape directly.
      diagrams: { current: persistedDiagrams(), pending: null },
      pull_sheet: [{ caseLabel: "Case 1", items: [] }],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: [{ code: "W1", message: "A parse warning" }],
      raw_unrecognized: [{ block: "b", key: "k", value: "v" }],
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

/** Render every registry section + the modal-level callout for one published fixture. */
function renderPublished() {
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG });
  const defs = step3Sections(data);
  const utils = render(
    <div>
      {defs.map((def) => (
        <section key={def.id} data-testid={`sec-${def.id}`}>
          {def.render(data)}
        </section>
      ))}
      <div data-testid="modal-callout">
        <RawUnrecognizedCallout raw={data.rawUnrecognized} />
      </div>
    </div>,
  );
  return { data, defs, ...utils };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("published mode — zero staged (onboarding) traffic (spec §3.5)", () => {
  test("no rendered src/href targets an /api/admin/onboarding/* route", async () => {
    const { container } = renderPublished();
    // Flush any mount effects (a regressed staged body would POST here).
    await act(async () => {});

    const urlBearing = container.querySelectorAll<HTMLElement>("[src],[href]");
    const offenders = Array.from(urlBearing)
      .flatMap((el) => [el.getAttribute("src"), el.getAttribute("href")])
      .filter((v): v is string => typeof v === "string")
      .filter((v) => v.includes(ONBOARDING_PREFIX));
    expect(offenders).toEqual([]);
  });

  test("zero fetch calls hit an /api/admin/onboarding/* route", async () => {
    renderPublished();
    await act(async () => {});

    const onboardingCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input).includes(ONBOARDING_PREFIX),
    );
    expect(onboardingCalls).toEqual([]);
  });

  test("agenda renders the STATIC extraction variant with a published asset-route PDF anchor", () => {
    const { getByTestId } = renderPublished();
    const agenda = within(getByTestId("sec-agenda"));

    // Block rendered (not a note-only row): the extracted session title is present.
    expect(agenda.getByText("Opening Keynote")).toBeTruthy();
    // At least one static agenda item row rendered.
    expect(agenda.getAllByTestId("agenda-item").length).toBeGreaterThan(0);

    // Both the extracted (fileId) and the external (url-only) links render an
    // "Open PDF" anchor; the fileId link resolves through the published asset
    // route, and NONE targets the staged onboarding route.
    const hrefs = agenda.getAllByTestId("agenda-open-pdf").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/api/asset/agenda/${SHOW_ID}/${AGENDA_FILE_ID}`);
    expect(hrefs.some((h) => h?.includes(ONBOARDING_PREFIX))).toBe(false);
  });

  test("diagram tiles resolve through the published /api/asset/diagram/<show>/<rev>/<key> route", () => {
    const { getByTestId } = renderPublished();
    const rooms = within(getByTestId("sec-rooms"));

    const img = rooms
      .getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-diagram-tile-0`)
      .querySelector("img");
    expect(img).not.toBeNull();
    // Derived from the fixture: show id, snapshot revision, snapshotPath last segment.
    expect(img!.getAttribute("src")).toBe(`/api/asset/diagram/${SHOW_ID}/${REV}/${DIAGRAM_KEY}`);
  });

  test("packlist renders read-only: no wizard-session identifier and no archived-tab affordance", () => {
    const { getByTestId } = renderPublished();
    const packSection = getByTestId("sec-packlist");

    // The pull sheet itself still renders (source-agnostic).
    expect(within(packSection).getByText("Case 1")).toBeTruthy();

    // Clone-and-strip: scan the packlist subtree in isolation for any staged
    // wizard-session leak (published data carries no wizardSessionId, so a leak
    // would be a regression that re-introduced the staged affordance).
    const clone = packSection.cloneNode(true) as HTMLElement;
    const attrHaystack = Array.from(clone.querySelectorAll<HTMLElement>("*"))
      .flatMap((el) => Array.from(el.attributes).map((a) => a.value))
      .join(" ");
    expect(attrHaystack).not.toContain(ONBOARDING_PREFIX);
    // No archived-tab accept/skip control (the staged-only pull-sheet-override affordance).
    expect(clone.querySelector('[data-testid*="archived"]')).toBeNull();
  });
});
