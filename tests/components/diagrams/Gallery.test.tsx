// @vitest-environment jsdom
/**
 * tests/components/diagrams/Gallery.test.tsx (M7 Task 7.9).
 *
 * Pins the Gallery's data → DOM contract. The actual swipe-gesture
 * behavior is verified in Playwright (`tests/e2e/diagrams-gallery.spec.ts`);
 * jsdom cannot exercise Embla's pointer-event handling reliably. Here we
 * focus on:
 *
 *   - AC-7.4 + M7 §6 watchpoint 12: every image src is built as
 *     `/api/asset/diagram/<show>/<bare-uuid>/<key>` with NO `r=` prefix.
 *   - AC-7.2: at most 12 items show in the initial collapsed view;
 *     "Show more" toggle reveals the rest.
 *   - AC-7.2b: order is pass-through — the parent (DiagramsTile) already
 *     ordered embedded-first; the Gallery is a pure renderer.
 *   - AC-7.7: items with `available: false` render a placeholder slot
 *     (NOT a hidden slot) so the layout rhythm survives.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function items(n: number, available = true, keyPrefix = "embedded-obj-"): GalleryItem[] {
  return Array.from({ length: n }, (_v, i) => ({
    key: `${keyPrefix}${i + 1}.png`,
    alt: `Diagram ${i + 1}`,
    available,
  }));
}

afterEach(() => cleanup());

describe("Gallery — thumbnail grid", () => {
  test("emits asset URLs with bare-UUID rev segment (no `r=` prefix)", () => {
    // M9 C6b / M7-D3 was REVERTED: thumbnails keep raw <img> because
    // /_next/image strips auth cookies. Test asserts the raw asset
    // URL directly (the next/image-aware variant was a transient
    // state — see commit history).
    render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(3)} />,
    );
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(3);
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      expect(src).toMatch(
        new RegExp(`^/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-\\d+\\.png$`),
      );
      expect(src).not.toContain("r=");
    }
  });

  test("AC-7.2: items.length ≤ 12 — renders all thumbnails, no Show more toggle", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(10)} />);
    expect(screen.getAllByRole("img")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /show all|show more/i })).toBeNull();
  });

  test("AC-7.2: items.length > 12 — first 12 visible + Show more toggle reveals rest", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(20)} />);
    // Initial collapsed state: only 12 thumbnails rendered.
    expect(screen.getAllByRole("img")).toHaveLength(12);
    const toggle = screen.getByRole("button", { name: /show all 20 diagrams/i });
    fireEvent.click(toggle);
    expect(screen.getAllByRole("img")).toHaveLength(20);
    // After expansion the toggle label flips.
    expect(screen.getByRole("button", { name: /show fewer/i })).toBeTruthy();
  });

  test("AC-7.2b: order is pass-through — embedded entries from caller come first", () => {
    // Caller (DiagramsTile) is responsible for placing embedded entries
    // first. The Gallery itself relays the order verbatim.
    const ordered: GalleryItem[] = [
      { key: "embedded-obj-1.png", alt: "Embedded 1", available: true },
      { key: "embedded-obj-2.png", alt: "Embedded 2", available: true },
      { key: "folder-drv-1.jpg", alt: "Linked 1", available: true },
    ];
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={ordered} />);
    const imgs = screen.getAllByRole("img");
    const srcs = imgs.map((i) => i.getAttribute("src"));
    expect(srcs[0]).toContain("embedded-obj-1.png");
    expect(srcs[1]).toContain("embedded-obj-2.png");
    expect(srcs[2]).toContain("folder-drv-1.jpg");
  });

  test("AC-7.7: unavailable item renders a placeholder slot, NOT a hidden slot", () => {
    const mixed: GalleryItem[] = [
      { key: "embedded-obj-1.png", alt: "Diagram 1", available: true },
      { key: "embedded-obj-2.png", alt: "Diagram 2", available: false },
      { key: "embedded-obj-3.png", alt: "Diagram 3", available: true },
    ];
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={mixed} />);

    // The slot for the unavailable item MUST still occupy a grid cell —
    // assert via the testid count instead of role=img (placeholder has no
    // image element).
    const slots = screen.getAllByTestId(/diagram-slot/);
    expect(slots).toHaveLength(3);
    // Slot #2 carries the placeholder marker and NO <img> child.
    const placeholderSlot = screen.getByTestId("diagram-slot-1");
    expect(within(placeholderSlot).queryByRole("img")).toBeNull();
    expect(placeholderSlot.getAttribute("data-unavailable")).toBe("true");
    // Anti-tautology: the available slots DO carry an <img>.
    expect(within(screen.getByTestId("diagram-slot-0")).getByRole("img")).toBeTruthy();
    expect(within(screen.getByTestId("diagram-slot-2")).getByRole("img")).toBeTruthy();
  });

  test("empty items: returns null (whole-gallery-missing — caller-tile reflows)", () => {
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("M9 C6b P1: <img onError> flips the thumbnail to the unavailable placeholder branch", () => {
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(2)} />);
    const slot0 = screen.getByTestId("diagram-slot-0");
    // Before error: <img> exists, slot has no data-unavailable.
    expect(within(slot0).queryByRole("img")).not.toBeNull();
    expect(slot0.getAttribute("data-unavailable")).toBeNull();

    const img0 = within(slot0).getByRole("img");
    fireEvent.error(img0);

    // After error: slot flips to the unavailable placeholder branch
    // (no <img>, data-unavailable="true").
    const slot0After = screen.getByTestId("diagram-slot-0");
    expect(within(slot0After).queryByRole("img")).toBeNull();
    expect(slot0After.getAttribute("data-unavailable")).toBe("true");

    // Slot #1 is unaffected — onError state is per-key.
    const slot1 = screen.getByTestId("diagram-slot-1");
    expect(within(slot1).queryByRole("img")).not.toBeNull();
    expect(slot1.getAttribute("data-unavailable")).toBeNull();
  });
});
