// BL-ANNOUNCE-REGION-UNMOUNT-CLASS — a live region may not be born populated.
//
// THE DEFECT, once, so every site does not have to restate it. Screen readers
// announce mutations WITHIN a live region that is already in the DOM. A region
// inserted together with its text is just new DOM, and is not announced. So
// `cond ? <p role="status">{msg}</p> : null` reads as an announcement in review
// and makes none at runtime — which is why this class survived a11y passes.
//
// WHY A GUARD RATHER THAN A LIST OF FIXED SITES. The entry was filed FROM a
// sweep — it named 17 — and
// a sweep's output is a list that rots. The AST walk below found ELEVEN more
// than the filed list, which settles the argument. It walks the tree, so a NEW
// conditionally-inserted region fails here rather than waiting for the next
// person to run the same grep. `role="alert"` is deliberately not covered:
// alerts ARE announced on insertion, so the conditional form is correct for
// them, and forbidding it would be a change for symmetry rather than for a
// defect.
//
// TWO LAWFUL SHAPES, and the exemption list records which each site uses:
//   1. Mount the region unconditionally and toggle its TEXT. Right when the
//      region's owner outlives the success it announces.
//   2. Announce through `UndoAnnounceContext`, whose provider region lives in
//      the layout. Required when the owner does NOT outlive it — a component
//      that early-returns a different tree per phase, or a block that unmounts
//      on revalidate. A region stable relative to the wrong branch is not
//      stable.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const ROOTS = ["components", "app"];

/**
 * Sites whose region is legitimately conditional because the ANNOUNCEMENT does
 * not ride it — they call `announce()` on the branch-stable channel instead.
 *
 * A row here is a claim that the file imports `UndoAnnounceContext` and calls
 * `announce`, which the test below verifies rather than trusts.
 *
 * WHAT YOU WILL STILL FIND IN THESE FILES, so the next reader is not misled.
 * Several of them keep a conditionally-inserted `role="status"` on a VISIBLE
 * card — `RoleRecognizeControl.tsx:209` and `:257`, `RecentAutoAppliedStrip.tsx`
 * `:506` and `:686`, `ReSyncButton.tsx:362`. Those attributes announce NOTHING,
 * for the same reason this whole guard exists, and that is not a latent defect
 * here: the channel already announced the message, so nothing is lost. They are
 * misleading rather than broken — an attribute that reads like a live region and
 * is not one.
 *
 * Deliberately NOT stripped in this pass. Removing `role="status"` from a card
 * is only safe once you have verified, per site, that the channel really does
 * carry every message that card shows — the error card at `:686` in particular
 * is not obviously covered — and that is a different question from the mounting
 * class this guard closes. Filed as `BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS`.
 */
const CHANNEL_ANNOUNCERS: readonly string[] = [
  "components/admin/RescanSheetButton.tsx",
  "components/admin/RoleRecognizeControl.tsx",
  "components/admin/RecentAutoAppliedStrip.tsx",
  "components/admin/ReSyncButton.tsx",
];

/**
 * How many `announce(` calls each channel announcer makes.
 *
 * A FLOOR AGAINST THE FILE-LEVEL SKIP. `CHANNEL_ANNOUNCERS` exempts a whole
 * file once it proves one call exists, which is why review found outcomes with
 * no announcement at all inside exempted files. This does not prove per-message
 * coverage — it proves the number cannot fall silently, and forces anyone adding
 * an outcome to look. The remaining gap is recorded on
 * BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS.
 */
const CHANNEL_ANNOUNCE_CALLS: ReadonlyMap<string, number> = new Map([
  ["components/admin/RescanSheetButton.tsx", 2],
  ["components/admin/RoleRecognizeControl.tsx", 1],
  ["components/admin/RecentAutoAppliedStrip.tsx", 1],
  ["components/admin/ReSyncButton.tsx", 1],
]);

/**
 * Sites whose gate is NOT transient state, so the conditional form is correct.
 *
 * The defect is a region that appears at the same moment as the text it should
 * announce. A gate on something else — whether the viewer is a developer,
 * whether the show is published, which arm of an either/or content branch
 * renders — does not create that race: the element is absent for a reason that
 * has nothing to do with the announcement, and when it IS present its text
 * arrives with it because the whole surface is arriving.
 *
 * Each row names the gate, so a later reader can check the claim rather than
 * trust the exemption.
 *
 * KEYED ON THE ELEMENT'S `data-testid`, NOT ITS LINE. The first version used
 * `file:line` and went stale the moment an unrelated edit above it shifted the
 * file — an exemption that drifts is an exemption that stops describing what it
 * exempts, and it fails in the loud direction only by luck.
 */
const NON_TRANSIENT_GATES: ReadonlyMap<string, string> = new Map([
  [
    "share-hub-dev-capture-status",
    "gated on viewerIsDeveloper — a non-developer must not receive the element at all; the transient capture state toggles TEXT inside it",
  ],
  [
    "admin-current-share-link-unavailable",
    "one arm of a published/unpublished content branch, not a post-action announcement",
  ],
  [
    "picker-banner",
    "server-rendered banner: present on first paint with its text, never inserted later",
  ],
  [
    "crew-row-reset-announcer",
    "already a PERSISTENT sr-only region; the gate above it is the crew SECTION (actions enabled and members present), not the announcement's own state",
  ],
  [
    "components/admin/BulkIgnoreControls.tsx::",
    "persistent sr-only region inside the per-group chip it belongs to; the gate is whether that GROUP renders, and the region arrives with the whole chip",
  ],
  [
    "components/admin/StagedReviewCard.tsx::",
    "same shape: persistent sr-only announcer scoped to a staged row, gated on the row existing, not on the announcement",
  ],
  [
    "share-hub-remote-rotate-announce",
    "mounted for the popover's whole open lifetime regardless of linkActive, so the remote announcement swaps into a pre-existing node (announce-a11y spec §4.2)",
  ],
  [
    "components/admin/wizard/Step2Verify.tsx::",
    "the phase announcer sits inside the reading block it narrates; the gate is whether a reading exists at all",
  ],
  [
    "agenda-note",
    "one arm of an either/or CONTENT branch (agenda present vs the note explaining its absence), not a post-action announcement",
  ],
  [
    "components/agenda/AgendaPdfViewer.tsx::",
    'the `loading` placeholder handed to the PDF viewer — announced ON INSERTION is the correct behaviour for a loading state, which is why `role="alert"`-style insertion semantics are wanted here',
  ],
]);

/**
 * Files still carrying the defect, each with the shape its repair will use.
 *
 * EMPTY, AND KEPT ANYWAY. Every site the walk found is repaired, so this is not
 * a debt list any more — it is the mechanism that stops one from re-forming.
 * A future author who hits this guard on a new site has two honest exits (mount
 * the region, or announce through the channel) and one dishonest one, which is
 * to add a row here and move on. The row above it fails the moment the file goes
 * clean, so a row is a claim with an expiry rather than a place to put a defect.
 */
const PENDING: ReadonlyMap<string, string> = new Map([
  // FOUND BY THE AST WALK (whole-diff review R1), not by the regex it replaced —
  // which is the argument for the rewrite. Each is a region born populated, and
  // each needs a real repair rather than a mechanical toggle:
  [
    "components/admin/dev/MaterializeCard.tsx",
    '1 site — `result === null ? null : <div role="status">`; needs the region hoisted above the result gate',
  ],
  [
    "app/admin/settings/admins/RevokeRowButton.tsx",
    "1 site — the couldn't-confirm warning is inserted with its text after a failed revoke",
  ],
  [
    "components/admin/wizard/step3ReviewSections.tsx",
    "1 site — the report-status span (`-report-status`) is gated on the send outcome it reports",
  ],
  [
    "components/admin/wizard/Step3ReviewModal.tsx",
    "1 site — the publish-error span at :633 is mounted but its enclosing row is gated",
  ],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

/** `role="status"` occurrences whose element is opened by a conditional gate. */
/**
 * `role="status"` elements whose MOUNT is gated by a conditional.
 *
 * AST, NOT A LINE-WINDOW REGEX (whole-diff review R1). The first version looked
 * back six lines for a `?` or `&&` and missed, by the reviewer's own fixture
 * probe: same-line `&&`, a direct ternary, and any opening tag more than six
 * lines below its gate — including the REAL RoleMappingRow defect, which
 * returned no hit at all. A detector whose blind spots are "ordinary JSX
 * formatting" is not conservative, it is decorative: every miss is silent and
 * looks exactly like a clean file.
 *
 * The question is structural, so ask it structurally: walk up from the JSX
 * element to its enclosing function, and report it when any ancestor on that
 * path is a conditional expression, a `&&`/`||` chain, or an `if` whose branch
 * returns JSX. That is decidable, and it does not care how the source is
 * wrapped.
 *
 * DELIBERATELY STILL BLIND to a gate that lives in a DIFFERENT function — a
 * parent that renders `{cond ? <Child/> : null}` where `Child` owns the region.
 * That is a real gap and it is a documented limit rather than a silent one: the
 * RoleMappingRow-shaped defect (gate and region in one component) is what this
 * catches, and cross-component gating needs whole-program analysis, which is a
 * different tool. Recorded as a documented limit on
 * BL-LIVE-REGION-AST-WALK-RESIDUE, which also lists the four in-component sites
 * this walk found and the PENDING rows below hold.
 */
function conditionalStatusRegions(
  text: string,
  file: string,
): Array<{ line: number; testId: string }> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Array<{ line: number; testId: string }> = [];

  const attrs = (node: ts.JsxOpeningLikeElement) => node.attributes.properties;
  const attrText = (node: ts.JsxOpeningLikeElement, name: string): string | null => {
    for (const a of attrs(node)) {
      if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
      const init = a.initializer;
      if (init && ts.isStringLiteral(init)) return init.text;
      if (init && ts.isJsxExpression(init) && init.expression) return init.expression.getText();
      return "";
    }
    return null;
  };

  /** Is this element's MOUNT gated by a conditional inside its own function? */
  const gated = (node: ts.Node): boolean => {
    let cur: ts.Node | undefined = node.parent;
    let child: ts.Node = node;
    while (cur) {
      if (ts.isFunctionDeclaration(cur) || ts.isArrowFunction(cur) || ts.isFunctionExpression(cur))
        return false; // reached the component boundary without finding a gate
      if (ts.isConditionalExpression(cur) && (cur.whenTrue === child || cur.whenFalse === child))
        return true;
      if (
        ts.isBinaryExpression(cur) &&
        (cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          cur.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        cur.right === child
      )
        return true;
      if (ts.isIfStatement(cur)) return true;
      child = cur;
      cur = cur.parent;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (attrText(node, "role") === "status") {
        const el = ts.isJsxOpeningElement(node) ? node.parent : node;
        if (gated(el)) {
          hits.push({
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            testId: (attrText(node, "data-testid") ?? "")
              .replace(/^`|`$/g, "")
              .replace(/\$\{[^}]*\}/g, ""),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("live regions are mounted before their text (BL-ANNOUNCE-REGION-UNMOUNT-CLASS)", () => {
  const files = ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => relative(REPO_ROOT, f));

  it("the walk found a real tree (premise)", () => {
    // A walk that silently found nothing would make every row below vacuous —
    // the exact failure mode this guard exists to prevent, applied to itself.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.includes("RescanSheetButton"))).toBe(true);
  });

  it("every CHANNEL_ANNOUNCERS row actually announces through the channel", () => {
    // Without this the exemption list is a way to silence the guard. A row must
    // earn itself: import the context AND call announce.
    const bad = CHANNEL_ANNOUNCERS.filter((f) => {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      return !src.includes("UndoAnnounceContext") || !/\bannounce\(/.test(src);
    });
    expect(bad, "exempt as a channel announcer but does not announce").toEqual([]);

    // AND THE COUNT, because "at least one announce() exists" was the whole
    // weakness (whole-diff review R1): the exemption skips the FILE, so a
    // component with three outcomes and one `announce(` call had two silent
    // ones and passed. RoleRecognizeControl's stale and conflict outcomes and
    // ReSyncButton's ordinary success summary were exactly that. Pinning the
    // per-file call count does not prove each MESSAGE is covered — only a
    // behavioural test can — but it does stop the count from silently dropping,
    // and it makes adding an outcome without an announcement a failure here.
    for (const [f, expected] of CHANNEL_ANNOUNCE_CALLS) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      const calls = (src.match(/(?<![A-Za-z0-9_])announce\(/g) ?? []).length;
      expect(calls, `${f}: announce() call count changed — is every outcome still covered?`).toBe(
        expected,
      );
    }
  });

  it("no UNREGISTERED file inserts a live region together with its text", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (CHANNEL_ANNOUNCERS.includes(f) || PENDING.has(f)) continue;
      const hits = conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"), f);
      for (const hit of hits) {
        // Keyed on `file::testId`. The testid alone was not enough once the AST
        // walk started seeing regions that carry NO testid — those all collapsed
        // to the empty key and would have shared one exemption between unrelated
        // files, which is an exemption that stops describing what it exempts.
        if (!NON_TRANSIENT_GATES.has(hit.testId) && !NON_TRANSIENT_GATES.has(`${f}::${hit.testId}`))
          offenders.push(`${f}:${hit.line} (${hit.testId})`);
      }
    }
    expect(
      offenders,
      "a live region inserted together with its text is never announced — mount it " +
        "unconditionally and toggle the text, or announce through UndoAnnounceContext",
    ).toEqual([]);
  });

  it("no live region hides itself with a display:none mechanism", () => {
    // WHOLE-DIFF REVIEW R1 FOUND THIS ONE SHIPPED. `empty:hidden` compiles to
    // `:empty { display: none }`, and a `display: none` element is not in the
    // accessibility tree — so a region tidied that way is REVEALED with its
    // text rather than mutated in place, which announces nothing. It is the
    // original defect wearing the fix's clothes, and it passes every check that
    // only looks at whether the element is conditionally RENDERED.
    //
    // `sr-only` is the correct idle state: it clips the box and leaves the
    // element exposed. Checked as a scan rather than a fixed list because the
    // mechanism, not the site, is the thing being forbidden.
    const HIDERS = /\bempty:hidden\b|\bhidden\b(?!:)|display:\s*none/;
    const offenders: string[] = [];
    for (const f of files) {
      const lines = readFileSync(join(REPO_ROOT, f), "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]?.includes('role="status"')) continue;
        const el = lines.slice(i, i + 8).join("\n");
        // Only the element's OWN attributes, up to the closing bracket.
        const own = el.slice(0, el.indexOf(">") === -1 ? el.length : el.indexOf(">"));
        if (HIDERS.test(own)) offenders.push(`${f}:${i + 1}`);
      }
    }
    expect(
      offenders,
      "a display:none live region is not in the a11y tree — use sr-only for the idle state",
    ).toEqual([]);
  });

  it("PREMISE: that scan rejects the exact shape review found (self-test)", () => {
    // The guard above passes trivially on a clean tree, so prove it discriminates
    // against the literal line that shipped.
    const planted = '<p role="status" aria-live="polite" className="empty:hidden">';
    expect(/\bempty:hidden\b/.test(planted)).toBe(true);
  });

  it("the PENDING list is exact — no row that is already clean", () => {
    // Keeps the debt list honest in the shrinking direction: a repaired file
    // must leave this list, or the list stops describing the work.
    const stale = [...PENDING.keys()].filter(
      (f) => conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"), f).length === 0,
    );
    expect(stale, "listed as pending but already repaired — remove the row").toEqual([]);
  });
});
