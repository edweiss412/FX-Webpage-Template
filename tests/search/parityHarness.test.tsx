// @vitest-environment jsdom
/**
 * Self-test for the INV-1 parity harness (spec §2.3), driven against
 * hand-written DOM, no section components. Every clause appears in a passing
 * and a failing form, and each failing form asserts the EXACT violation kinds,
 * so the harness is shown able to fail on each clause, not only to pass.
 *
 * Each failing fixture is the passing BASE with one edit, applied through
 * `edit`, which throws when its anchor is absent. A fixture that silently kept
 * the base would otherwise pass as "no violation" and prove nothing.
 */
import { describe, expect, it } from "vitest";
import { assertParity, type ParityViolation } from "./_parity";
import type { SearchEntry } from "@/lib/search/types";

const BASE_HTML = `
  <div data-card-id="venue-facilities">
    <header>
      <span><svg aria-hidden="true"><title>Wi-Fi icon</title><text>glyph</text></svg></span>
      <h2 data-search-group="">Facilities</h2>
      <span data-search-skip="">Your scope</span>
      <a href="#sheet" data-search-skip="">In sheet</a>
    </header>
    <dl>
      <div data-search-target="t-wifi">
        <dt>Wi-Fi password</dt>
        <dd>ORDTG.</dd>
        <button type="button" data-search-skip="">Copy</button>
      </div>
      <div data-search-target="t-dock">
        <dt>Loading dock</dt>
        <dd>Bay 4</dd>
      </div>
    </dl>
  </div>
  <div data-card-id="venue-diagrams">
    <h2 data-search-group="">Diagrams</h2>
    <button type="button" data-search-target="t-foh"><img src="foh.png" alt="FOH plot"></button>
    <button type="button" data-search-skip=""><img src="d3.png" alt="Diagram 3"></button>
    <img src="spacer.png" alt="">
  </div>
`;

function entry(over: Partial<SearchEntry> & Pick<SearchEntry, "id" | "value">): SearchEntry {
  return { section: "venue", group: "Facilities", label: null, context: [], copy: null, ...over };
}

const WIFI = entry({
  id: "t-wifi",
  label: "Wi-Fi password",
  value: "ORDTG.",
  copy: { kind: "password", text: "ORDTG." },
});
const DOCK = entry({
  id: "t-dock",
  label: "Loading dock",
  value: "Bay 4",
  context: ["Your scope"],
});
const FOH = entry({ id: "t-foh", group: "Diagrams", value: "FOH plot" });
const BASE_ENTRIES: readonly SearchEntry[] = [WIFI, DOCK, FOH];

function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture edit anchor not found: ${from}`);
  return html.replace(from, () => to);
}

function rootOf(html: string): HTMLElement {
  const root = document.createElement("section");
  root.innerHTML = html;
  return root;
}

function kinds(violations: readonly ParityViolation[]): string[] {
  return violations.map((v) => v.kind);
}

function check(html: string, entries: readonly SearchEntry[]): string[] {
  return kinds(assertParity(rootOf(html), entries));
}

function withEntry(id: string, over: Partial<SearchEntry>): SearchEntry[] {
  let hit = false;
  const out = BASE_ENTRIES.map((e) => {
    if (e.id !== id) return e;
    hit = true;
    return { ...e, ...over };
  });
  if (!hit) throw new Error(`no base entry ${id}`);
  return out;
}

describe("parity harness: passing base", () => {
  it("a section whose targets and entries agree has no violations", () => {
    expect(assertParity(rootOf(BASE_HTML), BASE_ENTRIES)).toEqual([]);
  });

  it("an empty section with no entries has no violations", () => {
    expect(assertParity(rootOf(""), [])).toEqual([]);
  });
});

describe("clause 1: ids", () => {
  it("an entry with no target", () => {
    expect(check(BASE_HTML, [...BASE_ENTRIES, entry({ id: "t-ghost", value: "Bay 9" })])).toEqual([
      "entry-without-target",
    ]);
  });

  it("a target with no entry", () => {
    expect(check(BASE_HTML, [WIFI, FOH])).toEqual(["target-without-entry"]);
  });

  it("an id matching two targets", () => {
    const html = edit(
      BASE_HTML,
      "</dl>",
      `<div data-search-target="t-dock"><dt>Loading dock</dt><dd>Bay 4</dd></div></dl>`,
    );
    expect(check(html, BASE_ENTRIES)).toEqual(["duplicate-target"]);
  });

  it("two entries for one target", () => {
    expect(check(BASE_HTML, [...BASE_ENTRIES, DOCK])).toEqual(["duplicate-entry"]);
  });

  it("nested targets", () => {
    const html = edit(BASE_HTML, "<dd>ORDTG.</dd>", `<dd data-search-target="t-pw">ORDTG.</dd>`);
    const inner = entry({ id: "t-pw", value: "ORDTG." });
    expect(check(html, [...BASE_ENTRIES, inner])).toEqual(["nested-target"]);
  });
});

describe("clause 2: nothing extra in the entry", () => {
  it("a value the target does not contain", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { value: "Bay 4 and 5" }))).toEqual([
      "value-not-in-target",
    ]);
  });

  it("a label the target does not contain", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { label: "Loading docks" }))).toEqual([
      "label-not-in-target",
    ]);
  });

  it("a null label is not checked", () => {
    const html = edit(BASE_HTML, "<dt>Loading dock</dt>", "");
    expect(check(html, withEntry("t-dock", { label: null }))).toEqual([]);
  });

  it("a copy text the target does not contain", () => {
    expect(
      check(BASE_HTML, withEntry("t-wifi", { copy: { kind: "password", text: "ORDTG.X" } })),
    ).toEqual(["copy-not-in-target"]);
  });

  it("a group that names a heading in another region only", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { group: "Diagrams" }))).toEqual([
      "group-not-in-region",
    ]);
  });

  it("an empty group passes where the region has no group heading at all", () => {
    // Spec §2.3 clause 2: Today's Mode A key-times strip renders bare, outside
    // every card, so its region has no heading and its entries' group is "".
    const html = `<dl><div data-search-target="t-set"><dt>Set</dt><dd>6:00 AM</dd></div></dl>`;
    const set = entry({ id: "t-set", section: "today", group: "", label: "Set", value: "6:00 AM" });
    expect(check(html, [set])).toEqual([]);
  });

  it("an empty group fails where the region has a group heading", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { group: "" }))).toEqual(["group-not-in-region"]);
  });

  it("a context string found only in another region", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { context: ["FOH plot"] }))).toEqual([
      "context-not-in-region",
    ]);
  });

  it("context strings are compared with whitespace collapsed", () => {
    expect(check(BASE_HTML, withEntry("t-dock", { context: ["  Your\n scope "] }))).toEqual([]);
  });
});

describe("clause 3: nothing missing from the entry", () => {
  const PERSON = `
    <div data-card-id="crew-contacts">
      <h2 data-search-group="">Key contacts</h2>
      <ul><li><p>Ana Ruiz</p><p>Bring tape</p></li></ul>
    </div>`;
  const ANA = entry({ id: "t-ana", section: "crew", group: "Key contacts", value: "Ana Ruiz" });
  const NOTE = entry({ id: "t-note", section: "crew", group: "Key contacts", value: "Bring tape" });

  it("a name-plus-note row indexed by the name alone fails", () => {
    const html = edit(PERSON, "<li>", `<li data-search-target="t-ana">`);
    expect(check(html, [ANA])).toEqual(["text-not-in-entry"]);
  });

  it("the same row as two targets, one per line, passes", () => {
    const html = edit(
      edit(PERSON, "<p>Ana Ruiz</p>", `<p data-search-target="t-ana">Ana Ruiz</p>`),
      "<p>Bring tape</p>",
      `<p data-search-target="t-note">Bring tape</p>`,
    );
    expect(check(html, [ANA, NOTE])).toEqual([]);
  });

  it("a line carried in context passes", () => {
    const html = edit(PERSON, "<li>", `<li data-search-target="t-ana">`);
    expect(check(html, [{ ...ANA, context: ["Bring tape"] }])).toEqual([]);
  });

  it("a nested skip is not the target's own text, but an unmarked control is", () => {
    const html = edit(
      BASE_HTML,
      `<button type="button" data-search-skip="">Copy</button>`,
      `<button type="button">Copy</button>`,
    );
    expect(check(html, BASE_ENTRIES)).toEqual(["text-not-in-entry"]);
  });

  it("an image target is matched by its alt, and fails when the entry names another", () => {
    expect(check(BASE_HTML, withEntry("t-foh", { value: "Stage plot" }))).toEqual([
      "value-not-in-target",
      "text-not-in-entry",
    ]);
  });
});

describe("clause 4: group headings are represented", () => {
  it("a heading no entry names", () => {
    const html = edit(BASE_HTML, "</dl>", `</dl><h3 data-search-group="">Power</h3>`);
    expect(check(html, BASE_ENTRIES)).toEqual(["group-heading-unrepresented"]);
  });

  it("a heading named only by entries in another region", () => {
    const html = edit(
      BASE_HTML,
      `<h2 data-search-group="">Diagrams</h2>`,
      `<h2 data-search-group="">Diagrams</h2><h3 data-search-group="">Facilities</h3>`,
    );
    expect(check(html, BASE_ENTRIES)).toEqual(["group-heading-unrepresented"]);
  });

  it("a card that renders only its title has no target, so its heading is not owed an entry", () => {
    // Venue "Where" with only the Maps link, or Show crew / Key contacts whose
    // every row hid itself: past skipped controls, the card renders only its title.
    const WHERE = `<div data-card-id="venue-where">
      <h2 data-search-group="">Where</h2>
      <a href="#maps" data-search-skip="">Open in Maps</a>
    </div>`;
    const titleOnly = edit(
      BASE_HTML,
      `<div data-card-id="venue-diagrams">`,
      `${WHERE}<div data-card-id="venue-diagrams">`,
    );
    expect(check(titleOnly, BASE_ENTRIES)).toEqual([]);
    // The exemption is the empty region only: once the card holds a target, its
    // heading must be some entry's group there again.
    const withLine = edit(
      titleOnly,
      `<a href="#maps" data-search-skip="">Open in Maps</a>`,
      `<p data-search-target="t-hall">Grand Hall</p><a href="#maps" data-search-skip="">Open in Maps</a>`,
    );
    const hall = entry({ id: "t-hall", value: "Grand Hall" });
    expect(check(withLine, [...BASE_ENTRIES, hall])).toEqual([
      "group-not-in-region",
      "group-heading-unrepresented",
    ]);
  });

  it("a line outside every card takes the section root as its region", () => {
    const html = `
      <h2 data-search-group="">Agenda</h2>
      <ul><li data-search-target="t-s1"><span>9:00 AM</span> <span>Welcome</span></li></ul>`;
    const s1 = entry({
      id: "t-s1",
      section: "schedule",
      group: "Agenda",
      label: "9:00 AM",
      value: "Welcome",
    });
    expect(check(html, [s1])).toEqual([]);
    // A card heading does not stand in for the root region's heading. The card
    // holds only its title, so its heading is owed no entry (clause 4); the
    // root-region line still has no heading of its own.
    const carded = `
      <div data-card-id="schedule-days"><h2 data-search-group="">Agenda</h2></div>
      <ul><li data-search-target="t-s1"><span>9:00 AM</span> <span>Welcome</span></li></ul>`;
    expect(check(carded, [s1])).toEqual(["group-not-in-region"]);
  });
});

describe("clause 5: coverage", () => {
  it.each([
    ["a button", `<button type="button">Show all</button>`],
    ["a link", `<a href="#maps">Open in Maps</a>`],
    ["an aria-hidden span", `<span aria-hidden="true">☎</span>`],
    ["a plain paragraph", `<p>Stray line</p>`],
  ])("unmarked text inside %s fails", (_where, markup) => {
    expect(check(edit(BASE_HTML, "</dl>", `</dl>${markup}`), BASE_ENTRIES)).toEqual([
      "uncovered-text",
    ]);
  });

  it("an unmarked image alt fails", () => {
    const html = edit(
      BASE_HTML,
      `<button type="button" data-search-skip=""><img src="d3.png" alt="Diagram 3"></button>`,
      `<button type="button"><img src="d3.png" alt="Diagram 3"></button>`,
    );
    expect(check(html, BASE_ENTRIES)).toEqual(["uncovered-alt"]);
  });

  it("text inside an svg is ignored, the same text outside one is not", () => {
    // The base carries svg <title> and <text> nodes and passes (see the base case).
    const html = edit(BASE_HTML, "</dl>", `</dl><span>Wi-Fi icon</span>`);
    expect(check(html, BASE_ENTRIES)).toEqual(["uncovered-text"]);
  });

  it("text inside a skip subtree is ignored, the same text unmarked is not", () => {
    const html = edit(
      BASE_HTML,
      `<a href="#sheet" data-search-skip="">In sheet</a>`,
      `<a href="#sheet">In sheet</a>`,
    );
    expect(check(html, BASE_ENTRIES)).toEqual(["uncovered-text"]);
  });

  it("a marker outside the section root covers nothing inside it", () => {
    const outer = document.createElement("div");
    outer.setAttribute("data-search-skip", "");
    const root = rootOf(`<p>Stray line</p>`);
    outer.appendChild(root);
    expect(kinds(assertParity(root, []))).toEqual(["uncovered-text"]);
  });

  it("text outside the section root is not scanned", () => {
    const outer = document.createElement("div");
    outer.innerHTML = "<p>Somewhere else</p>";
    const root = rootOf(BASE_HTML);
    outer.appendChild(root);
    expect(assertParity(root, BASE_ENTRIES)).toEqual([]);
  });

  it("names the uncovered text in the violation detail", () => {
    const html = edit(BASE_HTML, "</dl>", `</dl><p>Stray line</p>`);
    const violations = assertParity(rootOf(html), BASE_ENTRIES);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("Stray line");
  });
});
