/**
 * tests/components/admin/showpage/unreadCalloutSourceRemoval.test.ts
 * (unread-callout-dedup spec §3, Fix A deletion accounting)
 *
 * Structural pins that the retired "Content we couldn't read" callout leaves no
 * residue on EITHER modal surface (published + wizard) and that its dead lib is
 * gone. A source scan, not a render: a re-introduced `bottomSlot` or
 * `RawUnrecognizedCallout` on any of the four wiring sites fails here even if the
 * render tests are not re-run. This is also the staged/wizard no-drop guard —
 * the wizard renders warnings via the surface's own §E3 map, so removing the
 * additive callout from Step3ReviewModal drops no content.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("unread-callout source removal (Fix A)", () => {
  it("ShowReviewSurface no longer declares or renders a bottomSlot", () => {
    expect(read("components/admin/review/ShowReviewSurface.tsx")).not.toMatch(/bottomSlot/);
  });

  it("neither modal imports or renders RawUnrecognizedCallout", () => {
    for (const rel of [
      "components/admin/showpage/PublishedReviewModal.tsx",
      "components/admin/wizard/Step3ReviewModal.tsx",
    ]) {
      expect(read(rel)).not.toMatch(/RawUnrecognizedCallout/);
    }
  });

  it("step3ReviewSections no longer defines the callout or imports its dead view builder", () => {
    const src = read("components/admin/wizard/step3ReviewSections.tsx");
    expect(src).not.toMatch(/RawUnrecognizedCallout/);
    expect(src).not.toMatch(/buildRawUnrecognizedView/);
  });

  it("the dead rawUnrecognized lib and its test are deleted", () => {
    expect(existsSync(join(ROOT, "lib/admin/rawUnrecognized.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "tests/admin/rawUnrecognized.test.ts"))).toBe(false);
    expect(
      existsSync(join(ROOT, "tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx")),
    ).toBe(false);
  });

  it("the wizard's own warning-rendering path (the §E3 map) is still present — the callout was additive, not the warnings home", () => {
    // Positive pin so this file cannot pass while the surface's own warning
    // rendering is accidentally gutted. The staged/wizard modal renders warnings
    // through `warningsBySection` + `routedWarningsRenderElsewhere` (the §E3 map),
    // NOT through the removed callout; behavioral coverage of that path lives in
    // tests/components/admin/wizard/Step3ReviewModal.test.tsx (14 flag-callout
    // assertions). This guards the structural anchors those tests rely on.
    const surface = read("components/admin/review/ShowReviewSurface.tsx");
    expect(surface).toMatch(/warningsBySection/);
    expect(surface).toMatch(/routedWarningsRenderElsewhere/);
  });
});
