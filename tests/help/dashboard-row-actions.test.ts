/**
 * admin-dashboard-row-actions Task 6 — the help page tells the truth (AC-8).
 *
 * /help/admin/dashboard described the shows table as "a read-only glance" and
 * said archiving happens on a show's own page. Both became false the moment the
 * row gained its ⋮ menu, and a help page that is confidently stale is worse
 * than one that is silent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "../_shared/premise";

const SRC = readFileSync(join(__dirname, "..", "..", "app/help/admin/dashboard/page.mdx"), "utf8");

/**
 * The row-actions section ONLY — bounded at the next section heading. An
 * open-ended slice runs to the end of the file, so a label that drifted into
 * some later paragraph would satisfy an assertion about this section
 * (mutant (c) of the four-mutant pass survived exactly that way).
 */
const rowActionsSection = (): string => {
  const start = SRC.indexOf('id="row-actions"');
  const end = SRC.indexOf('id="pending-ingestion"');
  return SRC.slice(start, end);
};

describe("dashboard help — row actions (AC-8)", () => {
  it("documents all four actions in the row-actions section", () => {
    // PREMISE: every assertion below reads the row-actions section, so it has
    // to exist — otherwise a match elsewhere on the page would satisfy them.
    premiseHolds('the page has a "row-actions" section', SRC.includes('id="row-actions"'));
    const section = rowActionsSection();
    // The bold labels are the affordances Doug reads, so match the labelled
    // form, not a bare mention that could come from the surrounding prose.
    for (const label of ["**Open.**", "**Preview as…**", "**Re-sync.**", "**Archive.**"]) {
      expect(section, `row-actions section documents ${label}`).toContain(label);
    }
  });

  it("states the Held rule: an unpublished row offers Open only", () => {
    const section = rowActionsSection();
    expect(section).toMatch(/show \*\*Open\*\* only/);
    // …and says WHY, so the rule does not read as an arbitrary omission.
    expect(section).toMatch(/refused while a publish is in flight/);
  });

  it("the archive sentence names BOTH paths", () => {
    const archived = SRC.slice(SRC.indexOf('id="archived"'));
    premiseHolds('the page has an "archived" section', SRC.includes('id="archived"'));
    // The dashboard path…
    expect(archived).toMatch(/From the dashboard, tap the \*\*⋮\*\* button/);
    // …and the show-page path that already existed.
    expect(archived).toMatch(/tap \*\*Share link\*\*/);
    expect(archived).toMatch(/\*\*Archive show\*\*/);
  });

  it("no longer claims the table is read-only", () => {
    // The exact stale claim this task retired. Left in place it would tell Doug
    // the ⋮ menu he is looking at does not exist.
    expect(SRC).not.toContain("The table itself is a read-only glance");
    expect(SRC).not.toContain("that's where every action lives");
  });

  it("keeps the mechanical copy rules for the prose this task added", () => {
    const section = rowActionsSection();
    premise("the added section has prose to check", section.length, 200);
    // No em dash in user-visible copy (DESIGN.md:381).
    expect(section).not.toContain("—");
    // Typographic apostrophes only.
    expect(section.replace(/`[^`]*`/g, "")).not.toMatch(/\w'\w/);
  });
});
