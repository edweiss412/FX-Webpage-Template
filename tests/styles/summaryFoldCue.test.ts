/**
 * A `<summary>` that suppresses the native disclosure marker owes a replacement.
 *
 * WHY THIS EXISTS. DESIGN §1.1a's Family S lets a `<summary>` rest at
 * `--color-text-subtle` because "the fold affordance is carried by the
 * marker/chevron and the interaction, not by label weight". One Family S site
 * suppressed the native marker and rendered nothing in its place
 * (`BL-RUNOFSHOW-SUMMARY-NO-MARKER`), so on a mobile-first crew surface the only
 * hint that a truncated title expands was its trailing ellipsis. An ellipsis is
 * a truncation mark, not a control.
 *
 * THE SWEEP FOUND THREE MORE. Family S's registry is the derived cover for the
 * dim-summary question and it correctly returned one site; the SHAPE — a
 * suppressed marker with no replacement — is wider than Family S, and three
 * more summaries had it, two of them crew surfaces. "Same defect, different
 * file" is not a deferral reason, so all four were repaired together.
 *
 * WHAT THIS WALKS, and what it cannot see. Every `<summary>` under `app/` and
 * `components/` whose own class list suppresses the marker (`list-none`,
 * `marker:content-none`, or a `::-webkit-details-marker` hidden variant), read
 * from its opening tag to its close. A cue is a chevron/caret element or an
 * inline `<svg>` in that body. Anything else has to be registered with the
 * affordance it carries instead.
 *
 * DOCUMENTED LIMITS, both of them real. The walk reads SOURCE TEXT: a cue
 * rendered by a child component it cannot resolve reads as absent and must be
 * registered, and a chevron that is present but `hidden` at some breakpoint
 * reads as present. Neither is worth a resolver here — the registry is two rows
 * and each states its affordance. RE-FILE TRIGGER: a registered row whose
 * reason stops being true, or a marker-suppressing summary reaching `main`
 * whose cue this walk cannot see and whose author did not register it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

import { premise } from "../_shared/premise";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

const SUPPRESSES = /list-none|marker:content-none|details-marker\]:hidden/;
const CUE = /<(Chevron\w*|Caret\w*|svg)\b/;

type Site = { readonly file: string; readonly line: number; readonly body: string };

/** Every marker-suppressing `<summary>`, with its own element body. */
const SITES: Site[] = (() => {
  const found: Site[] = [];
  for (const file of [...walk("app"), ...walk("components")]) {
    // Comments come off through the shared single source BEFORE the walk, and
    // it blanks them in place, so line numbers stay real while a `<summary`
    // that only appears in prose simply is not there to find.
    //
    // This replaces a 25-line hand-rolled comment state machine. It existed
    // because `RunOfShowList.tsx` and `ErrorExplainer.tsx` each carry a comment
    // that NAMES the tag while explaining why its marker is hidden, and both
    // were reported as unrepaired sites until something masked them. Two rounds
    // of review each found one more spelling it mishandled — first code after a
    // closing `*/`, then a block that opened and closed on one line. Parsing the
    // file instead of matching markers ends that class rather than adding a
    // third case, and it retires the documented limit the machine carried (a
    // `//` inside a string literal before a `<summary` on the same line would
    // have over-masked). `tests/cross-cutting/_metaStripCommentsSingleSource`
    // requires the single source in any event.
    const lines = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]!.includes("<summary")) continue;
      let body = "";
      for (let k = i; k < Math.min(i + 60, lines.length); k++) {
        body += lines[k] + "\n";
        if (lines[k]!.includes("</summary>") || lines[k]!.includes("/>")) break;
      }
      if (SUPPRESSES.test(body)) found.push({ file, line: i + 1, body });
    }
  }
  return found;
})();

/**
 * Summaries whose affordance is something other than a chevron. Two rows, each
 * naming what carries it — an exemption that does not say why is a hole.
 */
const REGISTERED: ReadonlyArray<{ file: string; affordance: string }> = [
  {
    file: "components/admin/HelpTooltip.tsx",
    affordance:
      "the summary IS the glyph: its entire content is a help target sized `size-tap-min` in a `rounded-pill` box, so a chevron beside it would be a second affordance for one control.",
  },
  {
    file: "components/admin/HelpAffordance.tsx",
    affordance:
      "an underline plus `underline-offset-2` carries it — the link idiom, on a summary that reads as a link rather than as a section header.",
  },
];

describe("a marker-suppressing summary renders a replacement cue", () => {
  // The mask has to be proven on the POPULATION, not on pass/fail. Disabling
  // the strip and re-running is not a probe: the corpus's prose mentions of
  // `<summary` sit in RunOfShowList and ErrorExplainer, both of which now carry
  // a real chevron, so the false sites PASS and the suite goes green with 27
  // cases instead of 19. A mask whose only effect is the size of the population
  // is invisible to every assertion that ranges over it — so this asserts the
  // size directly, and names what the difference is made of.
  it("the comment mask actually excludes prose mentions of the tag", () => {
    const raw: string[] = [];
    for (const file of [...walk("app"), ...walk("components")]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const stripped = stripCommentsForFile(src, file);
      const rawLines = src.split("\n");
      const strippedLines = stripped.split("\n");
      for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i]!.includes("<summary") && !strippedLines[i]!.includes("<summary")) {
          raw.push(`${file}:${i + 1}`);
        }
      }
    }
    // Non-vacuity: if the corpus ever stops mentioning the tag in prose this
    // assertion stops meaning anything, so it fails rather than passing empty.
    premise("prose-only mentions of <summary> in the corpus", raw.length, 0);
    // and none of them reached the population
    const sitesAt = new Set(SITES.map((s) => `${s.file}:${s.line}`));
    expect(raw.filter((r) => sitesAt.has(r))).toEqual([]);
  });

  it("premise: the walk reaches the component tree and finds these summaries", () => {
    // Without this every assertion below is vacuously true over an empty list.
    premise("marker-suppressing summaries found", SITES.length, 10);
  });

  it.each(SITES.map((s) => [`${s.file}:${s.line}`, s] as const))(
    "%s renders a cue or is registered with the affordance it carries instead",
    (label, site) => {
      if (CUE.test(site.body)) return;
      const row = REGISTERED.find((r) => r.file === site.file);
      expect(
        row,
        `${label} suppresses the native marker and renders no chevron. Either render one, or register the affordance it carries instead.`,
      ).toBeDefined();
      expect(row!.affordance.trim().length).toBeGreaterThan(40);
    },
  );

  it("has no registered row that is no longer a marker-suppressing summary", () => {
    const live = new Set(SITES.map((s) => s.file));
    expect(REGISTERED.filter((r) => !live.has(r.file)).map((r) => r.file)).toEqual([]);
  });

  it("states in DESIGN.md §1.1a what carries Family S when the marker is suppressed", () => {
    const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(design).toContain("suppresses the native marker");
  });
});
