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
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { TileErrorFallback } from "@/components/shared/TileErrorFallback";

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
    expect(container.innerHTML).toBe(plain);
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
