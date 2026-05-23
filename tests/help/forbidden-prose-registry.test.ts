/**
 * Structural defense — forbidden-prose registry for help MDX.
 *
 * Class this catches: Doug-facing MDX prose that implies a UI affordance
 * which does NOT exist in shipped code. The R13 sibling test (`backlog-
 * label-annotation.test.ts`) catches LABEL-level drift (e.g., a bolded
 * `**Copy share link**` button name). This registry catches PROSE-level
 * drift — phrasings that don't name a button by label but still tell
 * Doug to perform an action the UI cannot perform.
 *
 * R14 root cause + Codex recommendation (2026-05-23): "Add a structural
 * grep/registry guard for copy-link and preview-links prose across all
 * help MDX, not just labels in UI_LABEL_EXCEPTIONS." This test is that
 * guard. Each entry pins a known-phantom phrasing surfaced by adversarial
 * review; future drift gets caught at CI time rather than waiting for the
 * next adversarial round.
 *
 * Convention: a forbidden-phrase entry is added to FORBIDDEN_PROSE only
 * AFTER a reviewer (cross-model adversarial or human) has ratified the
 * phrasing as misleading. Each entry MUST cite the round + the shipped
 * surface that proves the claim is wrong.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const HELP_ROOT = resolve(PROJECT_ROOT, "app/help");

type ForbiddenProseEntry = {
  /** Regex that catches the phantom phrasing. Match is case-insensitive by default. */
  pattern: RegExp;
  /** Short identifier for failure messages. */
  id: string;
  /** Why this phrasing is phantom; what shipped surface contradicts it. */
  rationale: string;
};

const FORBIDDEN_PROSE: readonly ForbiddenProseEntry[] = [
  {
    id: "copy-each-persons-link",
    pattern: /copy each person['']s link/i,
    rationale:
      "R14 finding 1 (tour.mdx:68). No copy-URL affordance ships in PerShowCrewSection. IssueLinkButton + RevokeAllLinksButton are the only crew-row controls; success state returns catalog copy, not a URL. Until a one-tap copy button ships, Doug shares URLs through his usual channel — prose must reflect that.",
  },
  {
    id: "copy-each-crew-members-link",
    pattern: /copy each crew member['']s link/i,
    rationale:
      "Paraphrase variant of copy-each-persons-link. Same shipped-state reasoning.",
  },
  {
    id: "dashboard-row-action",
    pattern: /(?:via|from|using|through)\s+the\s+dashboard['']?s?\s+row\s+actions?/i,
    rationale:
      "R14 finding 2 (per-show-panel.mdx:19). ActiveShowsPanel rows are link + dates + crew count + last-sync status, no in-row actions. Help must point Doug to Drive directly or to the per-show panel — never to a phantom dashboard row action.",
  },
  {
    id: "active-shows-row-actions-column",
    pattern: /\bActions\b[^.]{0,120}\b(?:Open|Preview as|Re-sync|Archive)\b/i,
    rationale:
      "R13 finding 2 (dashboard.mdx). ActiveShowsPanel does not render an Actions column. Every row-level action lives one click deeper on the per-show panel.",
  },
  {
    id: "yellow-warnings-badge",
    pattern: /\bYellow\s+warnings?\s+badge\b/i,
    rationale:
      "R13 finding 2 (dashboard.mdx). ActiveShowsPanel.statusGlyph emits only ✓, ⚠ Review staged changes, ✗ Needs attention, Publishing…, or · — there is no separate warnings-count badge in the row.",
  },
];

function helpMdxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".mdx")) {
        out.push(full);
      }
    }
  };
  try {
    statSync(HELP_ROOT);
    walk(HELP_ROOT);
  } catch {
    // help root missing in some snapshots; fine.
  }
  return out;
}

describe("Forbidden-prose registry (R14 structural defense)", () => {
  it("no help MDX file matches a known phantom-affordance phrase", () => {
    const violations: string[] = [];
    for (const file of helpMdxFiles()) {
      const src = readFileSync(file, "utf8");
      for (const entry of FORBIDDEN_PROSE) {
        const m = src.match(entry.pattern);
        if (m) {
          const idx = src.indexOf(m[0]);
          const lineNum = src.slice(0, idx).split("\n").length;
          violations.push(
            `${relative(PROJECT_ROOT, file)}:${lineNum} matches forbidden pattern "${entry.id}": "${m[0]}". ` +
              `Rationale: ${entry.rationale}`,
          );
        }
      }
    }
    expect(violations, violations.join("\n  → ")).toEqual([]);
  });

  it("rejects synthetic MDX containing a phantom copy-link claim (negative regression)", () => {
    const synthetic =
      "# Tour\n\nThe sharing tools let you copy each person's link one row at a time.\n";
    const matched = FORBIDDEN_PROSE.find((e) => e.pattern.test(synthetic));
    expect(matched?.id).toBe("copy-each-persons-link");
  });

  it("rejects synthetic MDX claiming a dashboard row action (negative regression)", () => {
    const synthetic =
      "# Per-show panel\n\nOpen the sheet in the same tab via the dashboard's row action, fix it, and re-sync.\n";
    const matched = FORBIDDEN_PROSE.find((e) => e.pattern.test(synthetic));
    expect(matched?.id).toBe("dashboard-row-action");
  });
});
