import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

// Transition inventory (spec §7.6): every visual state transition is INSTANT — no
// AnimatePresence, no motion, no max-height animation. The chevron rotates via a
// transform only. The load-bearing compound-transition proof (an ignore refresh not
// remounting a sibling's Report modal) lives in perShowActionableKeyStability.test.tsx.
describe("Data quality controls — transition audit (spec §7.6)", () => {
  const controls = readFileSync("components/admin/DataQualityWarningControls.tsx", "utf8");
  const page = readFileSync("app/admin/show/[slug]/page.tsx", "utf8");

  test("controls have NO motion/AnimatePresence — all transitions instant (D9)", () => {
    expect(controls).not.toMatch(/AnimatePresence|framer-motion|\bmotion\./);
  });

  test("Ignored (N) disclosure animates only the chevron transform — no max-height animation", () => {
    expect(page).toMatch(/group-open:rotate-90/);
    expect(page).not.toMatch(/transition-\[max-height\]|max-h-\S*\s+transition/);
  });

  test("error alert renders ONLY in the error state; running is an instant label/disabled swap", () => {
    expect(controls).toMatch(/state\.kind === "error"/);
    expect(controls).toMatch(/role="alert"/);
    expect(controls).toMatch(/state\.kind === "running"/);
    // no exit/initial/animate animation props on the conditional blocks
    expect(controls).not.toMatch(/exit=|initial=|animate=/);
  });

  test("supplementary: buildReportSurfaceId is order-independent (surviving sibling keeps its Report-modal scope)", () => {
    const B: Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet" | "blockRef"> = {
      code: "UNKNOWN_FIELD",
      rawSnippet: "Bravo",
      sourceCell: null,
    };
    expect(buildReportSurfaceId("rpas", B)).toBe(buildReportSurfaceId("rpas", { ...B }));
  });
});
