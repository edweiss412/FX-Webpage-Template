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
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    // A `<summary` inside a COMMENT is prose about the element, not the element
    // — `RunOfShowList.tsx` and `ErrorExplainer.tsx` each carry a comment that
    // names the tag while explaining why its marker is hidden, and both were
    // reported as unrepaired sites until this mask existed. Tracked across
    // lines rather than stripped, so the line numbers stay real.
    // A `<summary` is inside a comment iff, in the text BEFORE it on its line,
    // a `/*` is still unclosed, or a block carried from an earlier line has not
    // closed yet, or a `//` precedes it.
    //
    // Two rounds of repair converged here. The first version masked whatever
    // followed a closing `*/`; the second still masked code after a block that
    // OPENED AND CLOSED on the same line (`/* note */ <summary>`, and its JSDoc
    // spelling), which round 2 caught. Reasoning about the head of the line
    // rather than about the line as a whole is what makes both cases fall out.
    //
    // Documented limit: a `//` inside a string literal before a `<summary` on
    // the same line would over-mask. No such line exists in this corpus, and
    // over-masking is the direction that HIDES a site, so if one ever appears
    // the walk's population premise below is what catches it.
    const commented: boolean[] = [];
    let inBlock = false;
    for (const line of lines) {
      const tag = line.indexOf("<summary");
      if (tag < 0) {
        commented.push(false);
      } else {
        const head = line.slice(0, tag);
        const lastOpen = head.lastIndexOf("/*");
        const lastClose = head.lastIndexOf("*/");
        commented.push(lastOpen > lastClose || (inBlock && lastClose < 0) || head.includes("//"));
      }
      const lineOpen = line.lastIndexOf("/*");
      const lineClose = line.lastIndexOf("*/");
      if (lineOpen > lineClose) inBlock = true;
      else if (lineClose > lineOpen) inBlock = false;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]!.includes("<summary") || commented[i]) continue;
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
