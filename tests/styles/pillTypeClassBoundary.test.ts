/**
 * The attention pill's phone type size, and the boundary of the class it was
 * swept over (spec 2026-08-30 §2.3, §2.5, §1.1 R8).
 *
 * AST, not regex. Two earlier drafts of this guard used a character-class
 * recogniser and both were wrong in ways a reviewer found by running them: one
 * stopped at the `}` inside `${HEADER_ACTION_CAP}` and saw zero wizard pills,
 * and the label probes walked back to the nearest `className=`, which is the
 * DECORATIVE DOT's, not the pill's. A JSX walk answers "which element renders
 * this text, and what is its className" directly, and it sees `className="..."`
 * and `className={...}` alike, so a future site written in the other form
 * cannot slip past.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

const ROOT = join(__dirname, "..", "..");
const PRM = "components/admin/showpage/PublishedReviewModal.tsx";
const S3M = "components/admin/wizard/Step3ReviewModal.tsx";

type Pill = { className: string; text: string; file: string };

function parse(rel: string): ts.SourceFile {
  return ts.createSourceFile(
    rel,
    readFileSync(join(ROOT, rel), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** The literal text of `className` on this opening element, interpolations
 *  included as their source text (so `${HEADER_ACTION_CAP}` survives). */
function classNameOf(open: ts.JsxOpeningLikeElement): string | null {
  for (const attr of open.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== "className") continue;
    const init = attr.initializer;
    if (!init) return "";
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) return init.expression.getText();
    return "";
  }
  return null;
}

/** Every JSX element in the file, with its own className and its own rendered
 *  text: the JsxText children of THAT element, never a descendant's. */
function elements(file: ts.SourceFile): Pill[] {
  const out: Pill[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      const cls = classNameOf(open);
      if (cls !== null) {
        const text = ts.isJsxElement(node)
          ? node.children
              .filter(ts.isJsxText)
              .map((c) => c.text.trim())
              .filter(Boolean)
              .join(" ")
          : "";
        out.push({ className: cls, text, file: file.fileName });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** In class = a pill that WRAPS inside a cap, the construction §2.3 rules on. */
const isWrappingPill = (e: Pill) =>
  e.className.includes("max-sm:flex-wrap") && e.className.includes("rounded-pill");

const RESPONSIVE = "text-sm sm:text-xs";

const prm = elements(parse(PRM));
const s3m = elements(parse(S3M));
const all = [...prm, ...s3m];

/** The element whose OWN text is `label`. */
function rendering(label: string): Pill {
  const hits = all.filter((e) => e.text === label);
  expect(hits.length, `exactly one element renders ${label}`).toBe(1);
  return hits[0]!;
}

describe("pill type-size class boundary (spec §2.3, §1.1 R8)", () => {
  it("premise: the walk found the in-class sites, and exactly the four expected", () => {
    // Not merely "nonzero": the boundary claim IS a count, so the premise
    // asserts it. A fifth capped, wrapping pill fails here first, by design.
    const wrapping = all.filter(isWrappingPill);
    premise("capped wrapping pills across both modals", wrapping.length, 1);
    expect(wrapping.length, "the wrapping-pill census moved; re-run the §2.5 class analysis").toBe(
      2,
    );
  });

  it("every capped, wrapping pill carries the responsive pair", () => {
    const offenders = all.filter(isWrappingPill).filter((e) => !e.className.includes(RESPONSIVE));
    expect(offenders.map((o) => `${o.file}: ${o.className.slice(0, 60)}`)).toEqual([]);
  });

  it("the two static published pills carry the pair too", () => {
    for (const label of ["Alerts unavailable", "In sync"]) {
      expect(rendering(label).className, `${label} pill missing the responsive pair`).toContain(
        RESPONSIVE,
      );
    }
  });

  it("the two out-of-class wizard arms are NOT swept (§1.1 R8)", () => {
    for (const label of ["Sheet changed", "All clean"]) {
      const cls = rendering(label).className;
      expect(cls, `${label} is out of class and must stay at text-xs`).toContain("text-xs");
      expect(cls, `${label} must not gain the responsive pair`).not.toContain("sm:text-xs");
    }
  });
});
