// tests/styles/_metaBgAccentInventory.test.ts
// Per-occurrence registry of every exact-token bg-accent fill (spec
// 2026-07-16-accent-contrast-token-pass §4.1b, meta row 11). Variant chains
// are normalized (disabled:hover:bg-accent MATCHES; bg-accent-tint /
// bg-accent/10 never do); comments are stripped before scanning. Every
// occurrence must carry a WCAG 1.4.11 disposition:
//   labeled         — control identified by its visible text (Understanding
//                     SC 1.4.11: no boundary required); text is 8.23:1 AA on
//                     the fill after the accent-text flip
//   edge-treated    — stateful fill whose ON state carries border-accent-edge
//   darkened-fill   — (zero rows by construction: the two darkened surfaces
//                     switched token to bg-accent-on-bg and left this scan;
//                     kept so a future partial darkening can be encoded)
//   redundant-glyph — checked state readable without color (Check glyph)
//   decorative      — non-interactive / redundant with adjacent text
// A NEW occurrence anywhere fails by default (unregistered); a removed one
// fails as a stale row. Never reconcile by loosening the matcher.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripComments, tokensOf, walk } from "./_classScanUtils";

type Disposition = "labeled" | "edge-treated" | "darkened-fill" | "redundant-glyph" | "decorative";
type Row = { file: string; index: number; context: string; disposition: Disposition };
const L = (file: string, index: number, context = "bg-accent"): Row => ({
  file,
  index,
  context,
  disposition: "labeled",
});
const E = (file: string, index: number): Row => ({
  file,
  index,
  context: "border-accent-edge bg-accent",
  disposition: "edge-treated",
});
const G = (file: string, index: number): Row => ({
  file,
  index,
  context: "border-accent bg-accent text-accent-text",
  disposition: "redundant-glyph",
});
const D = (file: string, index: number, context = "bg-accent"): Row => ({
  file,
  index,
  context,
  disposition: "decorative",
});

// GENERATED 2026-07-16 from the post-change tree (see the plan's generator
// one-liner); indexes are the nth exact-token occurrence per file after
// comment-stripping, in line order.
const REGISTRY: Row[] = [
  // labeled (33)
  L("components/admin/Mi11GateActions.tsx", 0),
  L("components/admin/RoleRecognizeControl.tsx", 0),
  L("components/admin/nav/AdminNav.tsx", 0),
  L("components/admin/nav/NotifBell.tsx", 0),
  L("components/admin/settings/AddAdminDisclosure.tsx", 0),
  L("components/admin/wizard/Step1Share.tsx", 0),
  L("components/admin/wizard/Step2Verify.tsx", 0),
  L("components/admin/wizard/Step3Review.tsx", 0, "bg-accent text-accent-text"), // tone-pill helper (labeled pill)
  L("components/admin/wizard/Step3ReviewModal.tsx", 1),
  L("components/admin/wizard/Step3ReviewModal.tsx", 2),
  L("components/shared/AccentButton.tsx", 0),
  L("components/shared/ReportButton.tsx", 0),
  L("components/shared/ReportModal.tsx", 0),
  L("components/shared/ReportModal.tsx", 1),
  L("components/shared/ReportModal.tsx", 2),
  L("components/shared/ReportModal.tsx", 3),
  L("components/shared/ReportModal.tsx", 4),
  L("app/admin/error.tsx", 0),
  L("app/admin/settings/admins/AddAdminForm.tsx", 0),
  L("app/admin/settings/admins/AddAdminForm.tsx", 1),
  L("app/admin/settings/admins/RevokeRowButton.tsx", 0),
  L("app/admin/settings/admins/RevokeRowButton.tsx", 1),
  L("app/admin/settings/admins/error.tsx", 0),
  L("app/admin/settings/error.tsx", 0),
  L("app/admin/settings/roles/RoleMappingRow.tsx", 0),
  L("app/admin/show/[slug]/ShareLinkCopyButton.tsx", 0),
  L("app/global-error.tsx", 0),
  L("app/me/page.tsx", 0, "bg-accent text-accent-text"), // tone-pill helper (labeled pill)
  L("app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", 0, "bg-accent text-accent-text"), // "Lead" chip
  L("app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", 0),
  L("app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", 1),
  L("app/show/[slug]/[shareToken]/error.tsx", 0),
  L("app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx", 0),
  // edge-treated (6)
  E("components/admin/OnboardingWizard.tsx", 0),
  E("components/admin/PublishedToggle.tsx", 0),
  E("components/admin/settings/AutoPublishToggle.tsx", 0),
  E("components/admin/settings/DeveloperToggleButton.tsx", 0),
  E("components/admin/settings/NotifyToggle.tsx", 0),
  E("components/admin/telemetry/AutoRefreshControl.tsx", 2),
  // redundant-glyph (2): checkbox fills with a Check glyph opacity swap
  G("components/admin/wizard/Step3SheetCard.tsx", 0),
  G("components/admin/wizard/Step3Review.tsx", 1),
  // decorative (7)
  D("components/admin/telemetry/AutoRefreshControl.tsx", 0, "telemetry-ping"),
  D("components/admin/telemetry/AutoRefreshControl.tsx", 1, "size-2 rounded-full"),
  D("components/admin/telemetry/EventVolumeSparkline.tsx", 0),
  D("components/admin/wizard/Step3ReviewModal.tsx", 0, "rounded-r-pill bg-accent"),
  D("components/crew/RightNowHero.tsx", 0),
  D("components/crew/primitives/DayCard.tsx", 0),
  D("components/right-now/RightNowCard.tsx", 0),
];

function bgAccentToken(tok: string): boolean {
  const parts = tok.split(":");
  const util = parts[parts.length - 1]!.replace(/^!/, "");
  return util === "bg-accent";
}

describe("META bg-accent per-occurrence disposition registry (spec §4.1b)", () => {
  it("matcher self-check", () => {
    expect(bgAccentToken("bg-accent")).toBe(true);
    expect(bgAccentToken("disabled:hover:bg-accent")).toBe(true);
    expect(bgAccentToken("data-[state=active]:bg-accent")).toBe(true);
    expect(bgAccentToken("bg-accent-tint")).toBe(false);
    expect(bgAccentToken("bg-accent-hover")).toBe(false);
    expect(bgAccentToken("bg-accent/10")).toBe(false);
  });

  it("every bg-accent occurrence is registered; every registry row exists", () => {
    const hits: Array<{ file: string; index: number; line: string; lineNo: number }> = [];
    for (const root of ["components", "app"]) {
      for (const file of walk(root)) {
        let n = 0;
        stripComments(readFileSync(file, "utf8"))
          .split("\n")
          .forEach((line, i) => {
            for (const tok of tokensOf(line)) {
              if (bgAccentToken(tok)) hits.push({ file, index: n++, line, lineNo: i + 1 });
            }
          });
      }
    }
    const problems: string[] = [];
    for (const h of hits) {
      const row = REGISTRY.find((r) => r.file === h.file && r.index === h.index);
      if (!row) {
        problems.push(`UNREGISTERED ${h.file}:${h.lineNo} (occurrence ${h.index})`);
        continue;
      }
      if (!h.line.includes(row.context)) {
        problems.push(`CONTEXT MISMATCH ${h.file}:${h.lineNo} expected "${row.context}"`);
      }
      if (row.disposition === "edge-treated" && !h.line.includes("border-accent-edge")) {
        problems.push(`EDGE MISSING ${h.file}:${h.lineNo}`);
      }
    }
    for (const r of REGISTRY) {
      if (!hits.some((h) => h.file === r.file && h.index === r.index)) {
        problems.push(`STALE REGISTRY ROW ${r.file} occurrence ${r.index}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
