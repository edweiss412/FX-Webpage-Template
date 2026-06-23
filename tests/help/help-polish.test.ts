/**
 * tests/help/help-polish.test.ts (audit Chunk 5: minor-polish sweep)
 *
 * Chunk 5 split run-on intros and added at-a-glance orientation across the
 * remaining /help pages (landing, getting-started, tour, whats-different,
 * parse-warnings, sharing-links). These guards pin the substantive improvements
 * so the run-ons / missing orientation can't creep back. (H1, anchors, and the
 * em-dash ban are covered by each page's own page-*.test.tsx.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, "app/help", rel), "utf8");

describe("Chunk 5: minor-polish sweep", () => {
  it("tour: the intro is a self-routing TL;DR naming all three buckets", () => {
    const src = read("tour/page.mdx");
    expect(src).toMatch(/grouped by when you use it/i);
    // names the three section buckets so Doug can self-route from the lead
    expect(src).toMatch(/when a show is live/i);
    expect(src).toMatch(/once per environment/i);
    // the old vague "one-paragraph orientation" lead is gone
    expect(src).not.toContain("A one-paragraph orientation to every admin surface");
  });

  it("parse-warnings: the page-stays-up reassurance is its own Callout, and BOTH escalation triggers survive", () => {
    const src = read("admin/parse-warnings/page.mdx");
    expect(src).toMatch(/<Callout type="note">[\s\S]*never blanks the page/);
    // both original escalation triggers survive the dedup (restored after Codex r1):
    // (a) panel/sheet mismatch, and (b) fix didn't clear after the next sync -> Tell Eric.
    expect(src, "panel-mismatch escalation must survive").toMatch(
      /panel keeps pointing at a row that looks correct[\s\S]*Tell Eric/,
    );
    expect(src, "fix-didn't-clear escalation must survive").toMatch(
      /still there after the next sync[\s\S]*Tell Eric/,
    );
  });

  it("whats-different: the intro orients to the three sections", () => {
    const src = read("whats-different/page.mdx");
    expect(src).toMatch(/sections below cover/i);
  });

  it("getting-started: the wizard reference is split out of the one-line promise", () => {
    const src = read("getting-started/page.mdx");
    expect(src).toMatch(/For the full wizard reference/);
    // the promise sentence no longer trails the wizard pointer in one run-on
    expect(src).not.toContain("The summary below is the quick path; the full step-by-step");
    // the two facts from the original run-on survive in the pointer (Codex r3 hardening)
    expect(src).toMatch(/folder-URL verification/);
    expect(src).toMatch(/\*\*Finalize\*\* step that activates sync/);
  });

  it("landing: the value/benefit intro is split into separate sentences", () => {
    const src = read("page.mdx");
    expect(src).toMatch(/Instead of a dense spreadsheet/);
  });

  it("sharing-links: crew-see is a field list, and the descriptive leads stay unbolded", () => {
    const src = read("admin/sharing-links/page.mdx");
    // run-on intro -> a scannable field list
    expect(src).toMatch(
      /shows just what they need for their role:[\s\S]*Their call time for the show day/,
    );
    expect(src).not.toContain("hotel and room if applicable, schedule, and the contact info");
    // every crew-visible field from the original run-on survives as a list item (Codex r3 hardening)
    for (const field of [
      /Their call time/,
      /Hotel and room/,
      /schedule items relevant/,
      /contacts they need/,
    ]) {
      expect(src, `field-list item ${field} must survive`).toMatch(field);
    }
    // field + expiry leads are NOT bolded (descriptive field names, not shipped UI controls;
    // bolding them re-introduces the UI-label-crosswalk violation this sweep avoided)
    expect(src).not.toMatch(/^- \*\*(Call time|Hotel and room|A rotated share-token)\*\*/m);
    // ...but the real shipped controls remain referenced
    expect(src).toMatch(/Rotate share-token/);
    expect(src).toMatch(/Reset picker selections/);
  });
});
