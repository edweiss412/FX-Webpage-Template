// @vitest-environment jsdom
/**
 * The row primitives and shared chrome carry the INV-1 markers (spec §2.3,
 * §2.5): `data-search-target` on a row only when the caller sets
 * `searchTarget`, `data-search-group` on a SectionCard title, and
 * `data-search-skip` on the root of non-sheet chrome ("In sheet", empty states,
 * tile error fallbacks).
 *
 * No visual change. The snapshots in this file were recorded BEFORE the
 * primitives changed, against the markup they rendered then: a row without
 * `searchTarget` must still match its snapshot byte for byte, and chrome that
 * gains a marker unconditionally must match once that one attribute is
 * stripped. A primitive that changed anything else fails here.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { TileErrorFallback } from "@/components/shared/TileErrorFallback";
import type { SearchEntry } from "@/lib/search/types";
import { premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";

afterEach(cleanup);

const MARKERS = ["data-search-target", "data-search-group", "data-search-skip"] as const;
const MARKER_SELECTOR = MARKERS.map((m) => `[${m}]`).join(",");

/** The container's markup with every search marker removed, on a clone. */
function stripped(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll(MARKER_SELECTOR)) {
    for (const m of MARKERS) el.removeAttribute(m);
  }
  return clone.innerHTML;
}

function targets(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("[data-search-target]")];
}

const DRIVE_FILE_ID = "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY";

describe("KeyValueRows", () => {
  const ROWS: KeyValueRow[] = [
    { k: "Hotel", v: "Hyatt Regency", span: 2 },
    { k: "Confirmation", v: "HQ79F", sub: "Two nights", code: true },
    { k: "Notes", v: "TBD" },
  ];

  it("a row without searchTarget renders today's markup", () => {
    const { container } = render(<KeyValueRows rows={ROWS} columns={2} />);
    expect(container.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("searchTarget renders on the row element only, and changes nothing else", () => {
    const plain = render(<KeyValueRows rows={ROWS} columns={2} />).container.innerHTML;
    cleanup();
    const withTarget: KeyValueRow[] = ROWS.map((r, i) =>
      i === 0 ? { ...r, searchTarget: "t-hotel" } : r,
    );
    const { container } = render(<KeyValueRows rows={withTarget} columns={2} />);

    const found = targets(container);
    expect(found).toHaveLength(1);
    const row = container.querySelector("dl > div");
    expect(found[0]).toBe(row);
    expect(found[0]?.getAttribute("data-search-target")).toBe("t-hotel");
    expect(found[0]?.querySelector("dt")?.textContent).toBe("Hotel");
    expect(stripped(container)).toBe(plain);
  });

  it("a sentinel row with searchTarget still renders nothing", () => {
    const { container } = render(
      <KeyValueRows rows={[{ k: "Notes", v: "TBD", searchTarget: "t-x" }]} />,
    );
    expect(targets(container)).toHaveLength(0);
    expect(container.querySelectorAll("dl > div")).toHaveLength(0);
  });
});

describe("FactRows", () => {
  const ROWS: FactRow[] = [
    { k: "Loading dock", v: "Bay 4", sub: "Off Elm St", testId: "venue-dock" },
    {
      k: "Wi-Fi password",
      v: "ORDTG.",
      code: true,
      copyLabel: "Copy Wi-Fi password",
      testId: "venue-wifi-password",
    },
    { k: "Power", v: "N/A" },
  ];

  it("a row without searchTarget renders today's markup", () => {
    const { container } = render(<FactRows rows={ROWS} />);
    expect(container.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("searchTarget renders on the row element only, and changes nothing else", () => {
    const plain = render(<FactRows rows={ROWS} />).container.innerHTML;
    cleanup();
    const withTarget: FactRow[] = ROWS.map((r, i) =>
      i === 1 ? { ...r, searchTarget: "t-pw" } : r,
    );
    const { container } = render(<FactRows rows={withTarget} />);

    const found = targets(container);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(container.querySelector('[data-testid="venue-wifi-password"]'));
    expect(found[0]?.getAttribute("data-search-target")).toBe("t-pw");
    expect(stripped(container)).toBe(plain);
  });

  it("a sentinel row with searchTarget still renders nothing", () => {
    const { container } = render(
      <FactRows rows={[{ k: "Power", v: "N/A", searchTarget: "t-x" }]} />,
    );
    expect(targets(container)).toHaveLength(0);
  });
});

describe("PersonRow", () => {
  const PERSON = {
    name: "Ana Ruiz",
    role: "A1",
    phone: "555-0100",
    email: "ana@example.com",
    notes: "Bring gaff tape",
    lead: true,
    partial: "Oct 7 only",
  };

  function inList(node: ReactNode) {
    return render(<ul>{node}</ul>).container;
  }

  it("a row without searchTarget renders today's markup", () => {
    const container = inList(<PersonRow person={PERSON} />);
    expect(container.querySelectorAll(MARKER_SELECTOR)).toHaveLength(0);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("identity and notes are separate targets, never the <li>, never nested", () => {
    const container = inList(
      <PersonRow person={{ ...PERSON, searchTarget: { identity: "t-ana", notes: "t-note" } }} />,
    );
    const li = container.querySelector('[data-testid="person-row"]');
    expect(li?.hasAttribute("data-search-target")).toBe(false);

    const found = targets(container);
    expect(found.map((t) => t.getAttribute("data-search-target"))).toEqual(["t-ana", "t-note"]);
    const [identity, notes] = found;

    // Identity holds the name, the chips and the role, and nothing else's text.
    expect(identity?.textContent).toContain("Ana Ruiz");
    expect(identity?.textContent).toContain("Lead");
    expect(identity?.textContent).toContain("Oct 7 only");
    expect(identity?.textContent).toContain("A1");
    expect(identity?.textContent).not.toContain("Bring gaff tape");
    expect(identity?.querySelector("a")).toBeNull();
    expect(identity?.querySelector('[data-testid="avatar"]')).toBeNull();

    // Notes is the notes line itself.
    expect(notes?.tagName).toBe("P");
    expect(notes?.textContent).toBe("Bring gaff tape");

    expect(identity?.contains(notes ?? null)).toBe(false);
    expect(notes?.contains(identity ?? null)).toBe(false);
  });

  it("the identity target keeps the name, chips and role in their order", () => {
    const plain = inList(<PersonRow person={PERSON} />);
    const plainText = plain.textContent;
    cleanup();
    const container = inList(
      <PersonRow person={{ ...PERSON, searchTarget: { identity: "t-ana" } }} />,
    );
    expect(container.textContent).toBe(plainText);
  });

  it("without a notes id the notes line carries no target", () => {
    const container = inList(
      <PersonRow person={{ ...PERSON, searchTarget: { identity: "t-ana" } }} />,
    );
    expect(targets(container).map((t) => t.getAttribute("data-search-target"))).toEqual(["t-ana"]);
  });

  it("a sentinel note renders no notes target", () => {
    const container = inList(
      <PersonRow
        person={{ ...PERSON, notes: "TBD", searchTarget: { identity: "t-ana", notes: "t-note" } }}
      />,
    );
    expect(targets(container).map((t) => t.getAttribute("data-search-target"))).toEqual(["t-ana"]);
  });

  it("a row with an action but no heading or role renders no identity target and today's markup", () => {
    const actionOnly = { phone: "555-0100" };
    const plain = inList(<PersonRow person={actionOnly} />).innerHTML;
    cleanup();
    const container = inList(
      <PersonRow person={{ ...actionOnly, searchTarget: { identity: "t-x" } }} />,
    );
    expect(targets(container)).toHaveLength(0);
    // A search-target row marks its non-sheet text skip (the avatar initials and
    // the call/email glyph group, spec §2.3 clause 5) and changes nothing else:
    // the same bytes once exactly those two attributes are taken out.
    const skips = [...container.querySelectorAll("[data-search-skip]")];
    expect(
      skips.map((el) => el.getAttribute("data-testid") ?? el.querySelector("a")?.tagName),
    ).toEqual(["avatar", "A"]);
    const SKIP_ATTR = ' data-search-skip=""';
    expect(container.innerHTML.split(SKIP_ATTR)).toHaveLength(3);
    expect(container.innerHTML.split(SKIP_ATTR).join("")).toBe(plain);
  });

  it("a search-target row marks the avatar and the action glyphs skip, a plain row does not", () => {
    const plain = inList(<PersonRow person={PERSON} />);
    expect(plain.querySelectorAll("[data-search-skip]")).toHaveLength(0);
    cleanup();
    const container = inList(<PersonRow person={{ ...PERSON, searchTarget: {} }} />);
    const avatar = container.querySelector('[data-testid="avatar"]');
    expect(avatar?.hasAttribute("data-search-skip")).toBe(true);
    const glyphGroup = container.querySelector('a[href^="tel:"]')?.parentElement;
    expect(glyphGroup?.hasAttribute("data-search-skip")).toBe(true);
    expect(glyphGroup?.querySelector('a[href^="mailto:"]')).not.toBeNull();
    // Nothing else is skipped: the name, chips, role and notes stay searchable text.
    expect(container.querySelectorAll("[data-search-skip]")).toHaveLength(2);
  });

  it("a row with no identity and no action still renders nothing", () => {
    const container = inList(
      <PersonRow person={{ notes: "Hi", searchTarget: { identity: "t-x", notes: "t-y" } }} />,
    );
    expect(container.querySelector("li")).toBeNull();
  });
});

describe("SectionCard", () => {
  function titled() {
    return render(
      <SectionCard title="Facilities" action={<span>action</span>}>
        <p>body</p>
      </SectionCard>,
    ).container;
  }

  it("puts data-search-group on its title only", () => {
    const container = titled();
    const groups = [...container.querySelectorAll("[data-search-group]")];
    expect(groups).toHaveLength(1);
    expect(groups[0]).toBe(container.querySelector('[data-slot="section-card-title"]'));
    expect(groups[0]?.textContent).toBe("Facilities");
  });

  it("renders today's markup once the marker is stripped", () => {
    expect(stripped(titled())).toMatchSnapshot();
  });

  it("a card without a title carries no group marker", () => {
    const { container } = render(
      <SectionCard>
        <p>body</p>
      </SectionCard>,
    );
    expect(container.querySelectorAll("[data-search-group]")).toHaveLength(0);
  });
});

describe("non-sheet chrome is a skip subtree at its root", () => {
  const CHROME: [string, () => ReactNode][] = [
    ["SourceLink", () => <SourceLink driveFileId={DRIVE_FILE_ID} />],
    ["EmptyState", () => <EmptyState label="No hotel reservations on file yet." />],
    ["SectionTileError", () => <SectionTileError domain="rooms" />],
    ["TileErrorFallback", () => <TileErrorFallback />],
  ];

  it.each(CHROME)("%s carries data-search-skip on its root only", (_name, make) => {
    const { container } = render(make());
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.hasAttribute("data-search-skip")).toBe(true);
    expect(container.querySelectorAll("[data-search-skip]")).toHaveLength(1);
  });

  it.each(CHROME)("%s renders today's markup once the marker is stripped", (_name, make) => {
    expect(stripped(render(make()).container)).toMatchSnapshot();
  });

  it("SourceLink with no source sheet still renders nothing", () => {
    const { container } = render(<SourceLink driveFileId={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("announce live regions are skip subtrees in a search render", () => {
  // An announcement is not sheet data. Inside a target it would be part of the
  // target's own text ("Copied." on the Wi-Fi password row, clause 3), and
  // outside one it would be uncovered text (a gallery update, clause 5).

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  const PASSWORD_ROW: FactRow = {
    k: "Wi-Fi password",
    v: "ORDTG.",
    code: true,
    copyLabel: "Copy Wi-Fi password",
    testId: "venue-wifi-password",
  };
  const PASSWORD_ENTRY: SearchEntry = {
    id: "t-pw",
    section: "venue",
    group: "Facilities",
    label: "Wi-Fi password",
    value: "ORDTG.",
    context: [],
    copy: { kind: "password", text: "ORDTG." },
  };

  async function tapCopy(row: FactRow): Promise<HTMLElement> {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const { container } = render(
      <div data-card-id="venue-facilities">
        <h2 data-search-group="">Facilities</h2>
        <FactRows rows={[row]} />
      </div>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    premiseHolds(
      "the copy tap announced Copied. into the row's log",
      screen.getByTestId("venue-wifi-copy-log").textContent === "Copied.",
    );
    return container;
  }

  it("a copy tap on a search row leaves the password target's own text unchanged", async () => {
    const container = await tapCopy({ ...PASSWORD_ROW, searchTarget: "t-pw" });
    expect(assertParity(container, [PASSWORD_ENTRY])).toEqual([]);
    expect(screen.getByTestId("venue-wifi-copy-log").hasAttribute("data-search-skip")).toBe(true);
  });

  it("a copy row without searchTarget renders its log with no marker", async () => {
    await tapCopy(PASSWORD_ROW);
    expect(screen.getByTestId("venue-wifi-copy-log").hasAttribute("data-search-skip")).toBe(false);
  });

  const SHOW_ID = "11111111-1111-4111-8111-111111111111";
  const REV = "22222222-2222-4222-8222-222222222222";
  const ITEMS: GalleryItem[] = [1, 2].map((i) => ({
    id: `embedded:obj-${i}`,
    key: `embedded-obj-${i}.png`,
    alt: `Plot ${i}`,
    available: true,
    variants: [],
  }));

  /** Fails the first thumbnail, which the gallery announces into its log. */
  function announceInGallery(searchTargets?: Record<string, string>): HTMLElement {
    render(
      <Gallery
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={ITEMS}
        {...(searchTargets !== undefined ? { searchTargets } : {})}
      />,
    );
    const img = within(screen.getByTestId("diagram-slot-0")).getByRole("img");
    act(() => {
      fireEvent.error(img);
    });
    const log = screen.getByTestId("gallery-announce-log");
    premiseHolds(
      "the failed thumbnail was announced into the gallery log",
      (log.textContent ?? "").includes("could not be loaded"),
    );
    return log;
  }

  it("the gallery's announce log is a skip subtree when the gallery renders search targets", () => {
    const log = announceInGallery({ "embedded:obj-1": "t-plot-1", "embedded:obj-2": "t-plot-2" });
    expect(log.hasAttribute("data-search-skip")).toBe(true);
  });

  it("the gallery's announce log carries no marker in a gallery without search targets", () => {
    expect(announceInGallery().hasAttribute("data-search-skip")).toBe(false);
  });
});
