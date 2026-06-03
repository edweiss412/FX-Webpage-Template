import { describe, expect, test } from "vitest";
import { renderRealtimeProblem } from "@/lib/notify/templates/realtimeProblem";
import { renderDigest, type DigestInput } from "@/lib/notify/templates/digest";
import { resolveIngestionCopy } from "@/lib/admin/needsAttention";
import { DIGEST_MAX_SHOWS, DIGEST_MAX_ITEMS_PER_SHOW } from "@/lib/notify/constants";

const ORIGIN = "https://crew.fxav.app";
const EM_DASH = "—";

describe("renderRealtimeProblem — show level", () => {
  test("resolves <sheet-name> from the show title, no leftover placeholder, absolute link", () => {
    const out = renderRealtimeProblem({
      kind: "show",
      origin: ORIGIN,
      slug: "fxav-spring-tour",
      showTitle: "FXAV Spring Tour",
      code: "SHEET_UNAVAILABLE",
      contextSheetName: null,
    });
    expect(out.text).toContain("FXAV Spring Tour");
    expect(out.text).not.toContain("<sheet-name>");
    expect(out.html).not.toContain("<sheet-name>");
    // Absolute dashboard link via the injected origin (never a relative/localhost path).
    expect(out.text).toContain(`${ORIGIN}/admin/show/fxav-spring-tour`);
    expect(out.html).toContain(`href="${ORIGIN}/admin/show/fxav-spring-tour"`);
  });

  test("HTML-escapes a show title containing markup (no injection, no false placeholder throw)", () => {
    const out = renderRealtimeProblem({
      kind: "show",
      origin: ORIGIN,
      slug: "x",
      showTitle: "<script>x",
      code: "SHEET_UNAVAILABLE",
      contextSheetName: null,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;x");
  });
});

describe("renderRealtimeProblem — ingestion level", () => {
  test("uses the shared resolver (generic fallback for an unknown code), never a raw code, never throws", () => {
    const code = "TOTALLY_UNKNOWN_CODE";
    const driveFileName = "New Sheet";
    const expectedCopy = resolveIngestionCopy({ code, driveFileName });
    const out = renderRealtimeProblem({ kind: "ingestion", origin: ORIGIN, driveFileName, lastErrorCode: code });
    // Assert against the DATA SOURCE (resolveIngestionCopy), not the rendered container.
    expect(out.text).toContain(expectedCopy);
    expect(out.text).not.toContain(code);
    expect(out.text).toContain(`${ORIGIN}/admin`);
  });
});

describe("renderRealtimeProblem — global stall", () => {
  test("renders the SYNC_STALLED copy with an absolute link", () => {
    const out = renderRealtimeProblem({ kind: "global", origin: ORIGIN });
    expect(out.text).toContain(`${ORIGIN}/admin`);
    expect(out.text).not.toContain("<");
  });
});

describe("renderDigest — grouping, caps, overflow", () => {
  // Fixture dims drive expectations (never hardcode counts): one show OVER the per-show
  // item cap, and the show list OVER the show cap.
  const ITEMS_IN_FIRST = DIGEST_MAX_ITEMS_PER_SHOW + 1; // → exactly 1 item overflow
  const NUM_SHOWS = DIGEST_MAX_SHOWS + 1; // → exactly 1 show overflow

  function fixture(): DigestInput {
    const shows = Array.from({ length: NUM_SHOWS }, (_, i) => ({
      showTitle: `Show ${i}`,
      slug: `show-${i}`,
      items: i === 0
        ? Array.from({ length: ITEMS_IN_FIRST }, (_, j) => `Item ${j}`)
        : ["one issue"],
    }));
    return { origin: ORIGIN, shows };
  }

  test("overflow notes derive from SOURCE totals and link to the absolute dashboard", () => {
    const out = renderDigest(fixture());
    const itemOverflow = ITEMS_IN_FIRST - DIGEST_MAX_ITEMS_PER_SHOW;
    const showOverflow = NUM_SHOWS - DIGEST_MAX_SHOWS;
    expect(out.text).toContain(`+${itemOverflow} more on this show`);
    expect(out.text).toContain(`+${showOverflow} more shows`);
    expect(out.text).toContain(`${ORIGIN}/admin`);
    expect(out.html).toContain(`href="${ORIGIN}/admin"`);
    // Subject reflects the SOURCE show total, not the capped count.
    expect(out.subject).toContain(String(NUM_SHOWS));
  });

  test("caps the rendered shows and per-show items", () => {
    const out = renderDigest(fixture());
    // Only DIGEST_MAX_SHOWS show headings rendered.
    const headingCount = (out.html.match(/<h3>/g) ?? []).length;
    expect(headingCount).toBe(DIGEST_MAX_SHOWS);
    // First show renders only DIGEST_MAX_ITEMS_PER_SHOW items + 1 overflow <li>.
    expect(out.text).toContain("Item 0");
    expect(out.text).not.toContain(`Item ${DIGEST_MAX_ITEMS_PER_SHOW}`); // the (cap+1)th item is hidden
  });
});

describe("em-dash audit (DESIGN.md §9 — no em dashes in any rendered copy)", () => {
  test.each([
    () => renderRealtimeProblem({ kind: "show", origin: ORIGIN, slug: "s", showTitle: "S", code: "SHEET_UNAVAILABLE", contextSheetName: null }),
    () => renderRealtimeProblem({ kind: "global", origin: ORIGIN }),
    () => renderDigest({ origin: ORIGIN, shows: [{ showTitle: "S", slug: "s", items: ["one"] }] }),
  ])("rendered output %# has no em dash", (render) => {
    const out = render();
    expect(out.subject).not.toContain(EM_DASH);
    expect(out.text).not.toContain(EM_DASH);
    expect(out.html).not.toContain(EM_DASH);
  });
});
