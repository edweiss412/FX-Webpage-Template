// tests/messages/_metaEmphasisRenderContract.test.ts
//
// Structural meta-test for the catalog-emphasis rendering contract.
//
// The §12.4 catalog authors copy with Markdown emphasis (`*em*`, `**bold**`,
// word-boundary `_em_`). Components that render catalog copy as JSX text
// MUST either style those markers (components/messages/renderEmphasis.tsx)
// or strip them (stripEmphasis in lib/messages/collapsedSummary.ts) — a raw
// `{entry.dougFacing}` interpolation leaks literal `*` / `_` characters into
// user-visible text. That leak shipped twice before this contract existed:
// crew saw "Last synced *2 hours* ago." in StaleFooter, and the AlertBanner
// comment claiming "the panel's <ErrorExplainer> renders them styled" was
// aspirational (ErrorExplainer emitted the raw string).
//
// Contract pinned here:
//  1. Every .tsx file under components/ or app/ that touches a catalog copy
//     accessor (.dougFacing / .crewFacing / .helpfulContext / getDougFacing /
//     getCrewFacing / getRequiredDougFacing / lookupHelpfulContext) must
//     either import an emphasis-aware helper OR carry a row in
//     SAFE_PLAINTEXT_REGISTRY below explaining why raw rendering is safe
//     (i.e., every code that can flow there has marker-free copy today).
//     A new file that matches the accessor pattern without a registry row
//     fails closed — the author decides: wrap, or register with a reason.
//  2. `title` and `longExplanation` must NEVER contain emphasis markers —
//     /help/errors/page.tsx renders them raw by design, and HelpTooltip
//     consumers do the same.
//  3. Registry rows for deleted files fail (stale-entry guard), so the
//     registry cannot drift away from the tree.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const ACCESSOR_RE =
  /\.dougFacing\b|\.crewFacing\b|\.helpfulContext\b|getDougFacing\(|getCrewFacing\(|getRequiredDougFacing\(|lookupHelpfulContext\(|messageFor\(/;

const EMPHASIS_AWARE_IMPORT_RE =
  /from\s+["']@\/components\/messages\/renderEmphasis["']|stripEmphasis/;

const MARKER_RE = /\*\*[^*]+\*\*|\*[^*]+\*|(^|[\s("'])_(\S(?:.*?\S)?)_(?=[\s)"'.,!?;:]|$)/;

/**
 * Files that touch catalog copy accessors but render only codes whose copy
 * is marker-free today (or don't render the copy as JSX at all). If marker
 * copy ever flows into one of these, wrap the render site with
 * renderEmphasis and delete the row.
 */
const SAFE_PLAINTEXT_REGISTRY: ReadonlyArray<{ file: string; reason: string }> = [
  { file: "app/admin/error.tsx", reason: "ADMIN_ROUTE_LOAD_FAILED only; marker-free." },
  {
    file: "components/admin/MaintenanceResetButtons.tsx",
    reason: "VALIDATION_RESET_*/RESEED_* dougFacing status copy; marker-free.",
  },
  { file: "app/admin/layout.tsx", reason: "Passes codes/copy to children; no raw copy render." },
  {
    file: "app/admin/settings/admins/ReAddRowButton.tsx",
    reason: "ADMIN_EMAIL_WRITE_FAILED status toast; marker-free.",
  },
  {
    file: "app/admin/settings/admins/RevokeRowButton.tsx",
    reason: "Admin-email action toasts; codes marker-free.",
  },
  {
    file: "app/admin/settings/admins/error.tsx",
    reason: "ADMIN_ROUTE_LOAD_FAILED only; marker-free.",
  },
  { file: "app/admin/settings/error.tsx", reason: "ADMIN_ROUTE_LOAD_FAILED only; marker-free." },
  {
    file: "app/help/errors/page.tsx",
    reason: "Renders title/longExplanation only — those fields are pinned marker-free below.",
  },
  {
    file: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx",
    reason: "PICKER_* crew copy; marker-free.",
  },
  {
    file: "app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx",
    reason: "Picker prompt crew copy; marker-free.",
  },
  {
    file: "app/show/[slug]/[shareToken]/not-found.tsx",
    reason: "CREW_LINK_UNAVAILABLE only; marker-free.",
  },
  {
    file: "app/show/[slug]/unpublish/page.tsx",
    reason: "Unpublish-link doug copy; marker-free.",
  },
  {
    file: "components/admin/ParsePanel.tsx",
    reason: "Comment-only messageFor mention; renders warningSummary strings, not catalog copy.",
  },
  {
    file: "components/admin/CleanupAbandonedFinalizeButton.tsx",
    reason: "Finalize-cleanup status toasts; codes marker-free.",
  },
  {
    file: "components/admin/HelpAffordance.tsx",
    reason: "Renders helpHref Learn-more link; helpfulContext flows to hosts, not rendered here.",
  },
  { file: "components/admin/nav/NotifBell.tsx", reason: "Notify-prefs error copy; marker-free." },
  {
    file: "components/admin/OnboardingWizard.tsx",
    reason: "ONBOARDING_OPERATOR_ERROR + infra copy; marker-free.",
  },
  {
    file: "components/admin/PendingPanelDiscardButtons.tsx",
    reason: "Discard status toasts; codes marker-free.",
  },
  {
    file: "components/admin/PendingPanelRetryButton.tsx",
    reason: "Retry status toasts; codes marker-free.",
  },
  {
    file: "components/admin/PerShowAlertResolveButton.tsx",
    reason: "Resolve status toasts; codes marker-free.",
  },
  {
    file: "components/admin/ReapStaleSessionsButton.tsx",
    reason: "Session-reap status toasts; codes marker-free.",
  },
  {
    file: "components/admin/settings/AdministratorsSection.tsx",
    reason: "Admin-roster copy; codes marker-free.",
  },
  {
    file: "components/admin/settings/DriveConnectionPanel.tsx",
    reason: "Drive-connection status copy; codes marker-free.",
  },
  {
    file: "components/admin/wizard/Step2Verify.tsx",
    reason: "Wizard verify 4xx copy; codes marker-free.",
  },
  {
    file: "components/agenda/AgendaPdfViewer.tsx",
    reason: "AGENDA_* crew copy; marker-free.",
  },
  {
    file: "components/auth/TerminalFailure.tsx",
    reason: "Bootstrap/session crew copy; marker-free.",
  },
  {
    file: "components/shared/ReportModal.tsx",
    reason: "Report-flow copy; codes marker-free.",
  },
  {
    file: "components/shared/TileErrorFallback.tsx",
    reason: "TILE_SERVER_RENDER_FAILED.crewFacing; marker-free (dougFacing is the marked one).",
  },
  {
    file: "components/shared/TileServerFallback.tsx",
    reason: "Produces admin_alerts rows; renders crew fallback via TileErrorFallback.",
  },
  {
    file: "components/crew/WrappedSection.tsx",
    reason:
      "Crew-section analog of TileServerFallback: produces admin_alerts rows (TILE_SERVER_RENDER_FAILED) and renders the static crew fallback via TileErrorFallback; the dougFacing it references is the upsert context, never rendered to the DOM.",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const ROOT = process.cwd();
const SOURCE_FILES = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))].map((f) =>
  f.slice(ROOT.length + 1),
);

describe("catalog emphasis rendering contract", () => {
  const matching = SOURCE_FILES.filter((f) => ACCESSOR_RE.test(readFileSync(f, "utf8")));

  it("every catalog-copy renderer is emphasis-aware or registered as safe-plaintext", () => {
    const registered = new Set(SAFE_PLAINTEXT_REGISTRY.map((r) => r.file));
    const violations = matching.filter((f) => {
      if (registered.has(f)) return false;
      return !EMPHASIS_AWARE_IMPORT_RE.test(readFileSync(f, "utf8"));
    });
    expect(
      violations,
      `Files render catalog copy without emphasis handling. Either wrap the render ` +
        `site with renderEmphasis (components/messages/renderEmphasis.tsx) or add a ` +
        `SAFE_PLAINTEXT_REGISTRY row with a reason:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("registry rows point at live files that still match the accessor pattern (stale-entry guard)", () => {
    const stale = SAFE_PLAINTEXT_REGISTRY.filter(
      (r) => !existsSync(join(ROOT, r.file)) || !ACCESSOR_RE.test(readFileSync(r.file, "utf8")),
    );
    expect(
      stale.map((r) => r.file),
      "Registry rows no longer needed (file deleted or no longer touches catalog copy) — remove them.",
    ).toEqual([]);
  });

  it("registered safe-plaintext files do not also import the emphasis helpers (one mechanism per file)", () => {
    const both = SAFE_PLAINTEXT_REGISTRY.filter((r) =>
      EMPHASIS_AWARE_IMPORT_RE.test(readFileSync(join(ROOT, r.file), "utf8")),
    );
    expect(
      both.map((r) => r.file),
      "File imports renderEmphasis/stripEmphasis AND has a safe-plaintext registry row — delete the row.",
    ).toEqual([]);
  });

  it("title and longExplanation never contain emphasis markers (rendered raw on /help/errors)", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of ["title", "longExplanation"] as const) {
        const value = entry[field];
        if (typeof value === "string" && MARKER_RE.test(value)) {
          violations.push(`${code}.${field}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
