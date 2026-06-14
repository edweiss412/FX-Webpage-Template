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
    // SHEET_UNAVAILABLE.dougFacing wraps the sheet name in "_…_". Email is
    // plaintext/escaped-HTML with no Markdown rendering, so the emphasis
    // markers must be stripped, never shown literally around the name.
    expect(out.text).not.toContain("_FXAV Spring Tour_");
    expect(out.html).not.toContain("_FXAV Spring Tour_");
    expect(out.text).toContain("FXAV Spring Tour isn't in your folder anymore");
    // Absolute dashboard link via the injected origin (never a relative/localhost path).
    expect(out.text).toContain(`${ORIGIN}/admin/show/fxav-spring-tour`);
    expect(out.html).toContain(`href="${ORIGIN}/admin/show/fxav-spring-tour"`);
  });

  test("strips asterisk emphasis markers from the body (SYNC_DELAYED_SEVERE)", () => {
    const out = renderRealtimeProblem({
      kind: "show",
      origin: ORIGIN,
      slug: "fxav-spring-tour",
      showTitle: "FXAV Spring Tour",
      code: "SYNC_DELAYED_SEVERE",
      contextSheetName: null,
    });
    // dougFacing = "*<sheet-name>*: crew page hasn't synced…" — markers gone.
    expect(out.text).toContain("FXAV Spring Tour: crew page hasn't synced");
    expect(out.text).not.toContain("*FXAV Spring Tour*");
    expect(out.text).not.toContain("*<sheet-name>*");
    expect(out.html).not.toContain("*FXAV Spring Tour*");
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
    const out = renderRealtimeProblem({
      kind: "ingestion",
      origin: ORIGIN,
      driveFileName,
      lastErrorCode: code,
    });
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
      items:
        i === 0 ? Array.from({ length: ITEMS_IN_FIRST }, (_, j) => `Item ${j}`) : ["one issue"],
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

describe("null/undefined template variables — fallbacks render, never the literal 'null'/'undefined'", () => {
  // Every nullable input is guarded with `??` in the templates; these tests PIN that
  // an admin email body can never contain the words "null" or "undefined" when a
  // nullable variable is absent. Failure mode caught: someone swaps a `??` fallback
  // for raw interpolation (`${input.showTitle}`) and "undefined" lands in Doug's inbox.
  const LEAK = /\b(?:null|undefined)\b/;

  function expectNoLeak(out: { subject: string; text: string; html: string }) {
    expect(out.subject).not.toMatch(LEAK);
    expect(out.text).not.toMatch(LEAK);
    expect(out.html).not.toMatch(LEAK);
  }

  test("show-level: null showTitle + null contextSheetName fall back to 'a show' / 'this show'", () => {
    const out = renderRealtimeProblem({
      kind: "show",
      origin: ORIGIN,
      slug: "s",
      showTitle: null,
      code: "SHEET_UNAVAILABLE",
      contextSheetName: null,
    });
    expect(out.subject).toBe("FXAV · a show: sync problem");
    expect(out.text).toContain("this show"); // <sheet-name> slot filled by the final fallback
    expectNoLeak(out);
  });

  test("ingestion-level: null driveFileName + null lastErrorCode use the shared resolver fallback", () => {
    const out = renderRealtimeProblem({
      kind: "ingestion",
      origin: ORIGIN,
      driveFileName: null,
      lastErrorCode: null,
    });
    expect(out.subject).toBe("FXAV · a new sheet: sync problem");
    // Body comes from the DATA SOURCE (shared resolver), not an inline literal.
    expect(out.text).toContain(resolveIngestionCopy({ code: null, driveFileName: null }));
    expectNoLeak(out);
  });

  test("digest: null/undefined showTitle renders 'Untitled show'; null/undefined slug links to the dashboard", () => {
    // React-style partial data can also surface `undefined` at runtime despite the
    // `string | null` type — pin that the `??` guards cover both.
    const undefinedShow = {
      showTitle: undefined,
      slug: undefined,
      items: ["other issue"],
    } as unknown as DigestInput["shows"][number];
    const out = renderDigest({
      origin: ORIGIN,
      shows: [{ showTitle: null, slug: null, items: ["one issue"] }, undefinedShow],
    });
    expect((out.html.match(/Untitled show/g) ?? []).length).toBe(2);
    expect(out.html).toContain(`href="${ORIGIN}/admin"`); // null slug → dashboard, not /admin/show/null
    expect(out.html).not.toContain("/admin/show/");
    expectNoLeak(out);
  });

  test("digest: zero shows renders a sane zero-count subject and the dashboard link", () => {
    const out = renderDigest({ origin: ORIGIN, shows: [] });
    expect(out.subject).toBe("FXAV daily review · 0 shows need attention");
    expect(out.text).toContain(`${ORIGIN}/admin`);
    expectNoLeak(out);
  });
});

describe("em-dash audit (DESIGN.md §9 — no em dashes in any rendered copy)", () => {
  test.each([
    () =>
      renderRealtimeProblem({
        kind: "show",
        origin: ORIGIN,
        slug: "s",
        showTitle: "S",
        code: "SHEET_UNAVAILABLE",
        contextSheetName: null,
      }),
    () => renderRealtimeProblem({ kind: "global", origin: ORIGIN }),
    () => renderDigest({ origin: ORIGIN, shows: [{ showTitle: "S", slug: "s", items: ["one"] }] }),
  ])("rendered output %# has no em dash", (render) => {
    const out = render();
    expect(out.subject).not.toContain(EM_DASH);
    expect(out.text).not.toContain(EM_DASH);
    expect(out.html).not.toContain(EM_DASH);
  });
});
