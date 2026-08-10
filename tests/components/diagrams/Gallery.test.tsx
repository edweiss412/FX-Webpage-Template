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
import { premise, premiseHolds } from "@/tests/_shared/premise";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function items(n: number, available = true, keyPrefix = "embedded-obj-"): GalleryItem[] {
  return Array.from({ length: n }, (_v, i) => ({
    id: `${keyPrefix}${i + 1}`,
    key: `${keyPrefix}${i + 1}.png`,
    alt: `Diagram ${i + 1}`,
    available,
    variants: [],
  }));
}

afterEach(() => cleanup());

describe("Gallery — thumbnail grid", () => {
  test("emits asset URLs with bare-UUID rev segment (no `r=` prefix)", () => {
    // M9 C6b / M7-D3 was REVERTED: thumbnails keep raw <img> because
    // /_next/image strips auth cookies. Test asserts the raw asset
    // URL directly. Since the next/image migration (spec §6) the element
    // reports an ORIGIN-QUALIFIED src, so the path is compared rather than the
    // raw attribute — the contract being pinned is the path shape, and an
    // origin-anchored regex would fail on a URL that satisfies it.
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items(3)} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(3);
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      const path = new URL(src, "http://localhost").pathname;
      expect(path).toMatch(
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
      {
        id: "embedded:obj-1",
        key: "embedded-obj-1.png",
        alt: "Embedded 1",
        available: true,
        variants: [],
      },
      {
        id: "embedded:obj-2",
        key: "embedded-obj-2.png",
        alt: "Embedded 2",
        available: true,
        variants: [],
      },
      {
        id: "linked:drv-1",
        key: "folder-drv-1.jpg",
        alt: "Linked 1",
        available: true,
        variants: [],
      },
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
      {
        id: "embedded:obj-1",
        key: "embedded-obj-1.png",
        alt: "Diagram 1",
        available: true,
        variants: [],
      },
      {
        id: "embedded:obj-2",
        key: "embedded-obj-2.png",
        alt: "Diagram 2",
        available: false,
        variants: [],
      },
      {
        id: "embedded:obj-3",
        key: "embedded-obj-3.png",
        alt: "Diagram 3",
        available: true,
        variants: [],
      },
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
    const { container } = render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[]} />);
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

  test("shared asset key + distinct id: onError isolates to its own slot (no twin blanking)", () => {
    // Two entries can legitimately share an asset `key` (same snapshotPath
    // last segment). Failed-load tracking MUST key on the unique `id`, else
    // one thumbnail's 4xx blanks its twin. Distinct `id`, identical `key`.
    const twins: GalleryItem[] = [
      {
        id: "embedded:obj-1",
        key: "embedded-dup.png",
        alt: "Diagram 1",
        available: true,
        variants: [],
      },
      {
        id: "embedded:obj-2",
        key: "embedded-dup.png",
        alt: "Diagram 2",
        available: true,
        variants: [],
      },
    ];
    render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={twins} />);

    // Both render (distinct React keys → no reconciliation collision).
    expect(screen.getAllByRole("img")).toHaveLength(2);

    // Fail slot 0 only.
    fireEvent.error(within(screen.getByTestId("diagram-slot-0")).getByRole("img"));

    // Slot 0 flips; slot 1 (same key, different id) stays available.
    expect(screen.getByTestId("diagram-slot-0").getAttribute("data-unavailable")).toBe("true");
    const slot1 = screen.getByTestId("diagram-slot-1");
    expect(slot1.getAttribute("data-unavailable")).toBeNull();
    expect(within(slot1).queryByRole("img")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// next/image migration (spec §6).
//
// The srcset assertions are the load-bearing ones: they prove the browser is
// offered ONLY variant URLs. A loader that fell back to the original above the
// ladder would put the original in srcset at 1080w-3840w — exactly the bytes
// this pipeline exists to stop shipping — while every status-and-MIME style
// assertion still passed.
// ---------------------------------------------------------------------------

describe("Gallery — next/image thumbnails", () => {
  const BLUR = "data:image/webp;base64,UklGRhIAAABXRUJQ";

  function variantItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
    return {
      id: "embedded-obj-1",
      key: "embedded-obj-1.png",
      alt: "Diagram 1",
      available: true,
      variants: [
        { width: 256, key: "embedded-obj-1.png@256.webp" },
        { width: 512, key: "embedded-obj-1.png@512.webp" },
      ],
      ...overrides,
    };
  }

  /** jsdom resolves img.src against the document origin; compare paths, not URLs. */
  function pathOf(url: string | null): string {
    return new URL(url ?? "", "http://localhost").pathname;
  }

  function firstImage(item: GalleryItem): HTMLImageElement {
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[item]} />,
    );
    return container.querySelector("img")!;
  }

  test("every srcset candidate is a VARIANT URL — the original never appears", () => {
    const img = firstImage(variantItem());
    const originalUrl = `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-1.png`;

    const candidates = (img.getAttribute("srcset") ?? "")
      .split(",")
      .map((entry) => pathOf(entry.trim().split(" ")[0]!))
      .filter(Boolean);
    // Without candidates there is nothing to check and the row is vacuous.
    premise("next/image emitted srcset candidates", candidates.length, 1);

    expect(candidates.every((url) => url.includes("@"))).toBe(true);
    expect(candidates).not.toContain(originalUrl);
    // Snapping collapses the candidate list onto the ladder.
    expect(new Set(candidates)).toEqual(
      new Set([
        `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-1.png@256.webp`,
        `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-1.png@512.webp`,
      ]),
    );
  });

  test("an item with no variants still serves the original", () => {
    const img = firstImage(variantItem({ variants: [] }));

    expect(pathOf(img.getAttribute("src"))).toBe(
      `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-1.png`,
    );
  });

  test("blurDataURL renders the blur placeholder", () => {
    const img = firstImage(variantItem({ blurDataURL: BLUR }));

    // next/image inlines the blur bytes into a background-image SVG filter.
    expect(img.getAttribute("style")).toContain("background-image");
    expect(img.getAttribute("style")).toContain(BLUR);
  });

  test.each([
    ["absent", undefined],
    ["an empty string", ""],
    ["a non-string", 42 as unknown as string],
  ])("blurDataURL that is %s renders NO placeholder", (_label, blurDataURL) => {
    const img = firstImage(
      variantItem(blurDataURL === undefined ? {} : { blurDataURL: blurDataURL as string }),
    );

    expect(img.getAttribute("style") ?? "").not.toContain("background-image");
  });

  test("thumbnails stay lazy — no priority anywhere (the gallery is below the fold)", () => {
    expect(firstImage(variantItem()).getAttribute("loading")).toBe("lazy");
  });

  test("the CELL is the positioned ancestor, not the button", () => {
    // `fill` is absolute inset-0, so it needs a positioned ancestor — but WHICH
    // one is load-bearing: WebKit resolves the button's `height: 100%` against
    // the cell's aspect-ratio BORDER box, so containing-blocking the image on the
    // button made it 2px taller than the cell's content box and cropped it at the
    // bottom, while Chromium matched the content box and hid the bug entirely.
    // Real-browser geometry: tests/e2e/crew-layout-dimensions.spec.ts.
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[variantItem()]} />,
    );
    const button = container.querySelector("button")!;
    const cell = button.parentElement!;

    premiseHolds(
      "the cell sizes itself by aspect-ratio, which is what makes the box choice matter",
      cell.className.includes("aspect-square"),
    );
    expect(cell.className).toContain("relative");
    expect(button.className.split(/\s+/)).not.toContain("relative");
  });

  test("onError still flips to the unavailable branch", () => {
    const { container } = render(
      <Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={[variantItem()]} />,
    );
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByTestId("diagram-slot-0").getAttribute("data-unavailable")).toBe("true");
  });

  test("REGRESSION PIN — an item carrying none of the new fields renders as before", () => {
    const legacy = {
      id: "embedded-legacy",
      key: "embedded-legacy.png",
      alt: "Diagram 1",
      available: true,
      variants: [],
    } satisfies GalleryItem;

    expect(pathOf(firstImage(legacy).getAttribute("src"))).toBe(
      `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-legacy.png`,
    );
  });
});
