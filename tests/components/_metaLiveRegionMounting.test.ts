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
 * THE FIVE RESIDUAL `role="status"` ATTRIBUTES ARE GONE (arc A, 2026-08-07,
 * BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS). They sat on visible cards that are
 * inserted together with their text, so none of them announced anything —
 * misleading rather than broken. Stripping them was gated on the per-site
 * verification the entry demanded, and that verification found the channel did
 * NOT cover four of the messages:
 *
 *   - RoleRecognizeControl's saved card renders THREE state variants and the
 *     announce always sent the `applied` summary — the wrong convergence claim
 *     for `revised` and `apply_pending`. One selector now feeds both the card
 *     and the announce, so they cannot drift apart again.
 *   - Its stale and conflict branches announced nothing at all; both now do.
 *   - RecentAutoAppliedStrip's load-failure card announced nothing. This was the
 *     entry's named suspect and the probe confirmed it. It announces through an
 *     EFFECT keyed on the previously-observed `data.kind`, because that
 *     component owns no transition: it receives already-resolved data as a prop.
 *   - ReSyncButton's success summary announced nothing; it now does.
 *
 * ONE SITE WAS STRIPPED WITHOUT WIRING, deliberately: RecentAutoAppliedStrip's
 * undo-all confirmation prompt. It is an inline PROMPT, not a status transition
 * — interactive content adjacent to the control the operator just activated,
 * with focus landing on its own buttons — and announcing a prompt through a
 * status channel is the wrong semantics. Re-open trigger: a screen-reader user
 * reporting that the prompt is missed.
 *
 * The file-level exemption these rows grant is still only as strong as the
 * per-message coverage above; `CHANNEL_ANNOUNCE_CALLS` below is the floor that
 * keeps the count from falling back silently.
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
 * an outcome to look.
 *
 * The gap this used to point at was closed by the per-site census in arc A (see
 * the CHANNEL_ANNOUNCERS header above); the floor stays because the census is a
 * snapshot and a count is not. Per-message coverage is proven where it can only
 * be proven — in each component's own behavioural cases, which assert the
 * announcement carries the string the CARD renders.
 */
const CHANNEL_ANNOUNCE_CALLS: ReadonlyMap<string, number> = new Map([
  ["components/admin/RescanSheetButton.tsx", 2],
  // 1 -> 3 (arc A). The stale and conflict branches announced nothing at all and
  // each got its own call, on its own branch beside its own `setPhase`. The plan
  // predicted 2 by assuming one shared call; these counts are MEASURED, not
  // predicted, and collapsing two branches into one ternary to hit a forecast
  // number is the wrong direction. The saved announce also became
  // variant-correct, which no count can see — that is what the behavioural
  // cases in RoleRecognizeControl.test.tsx pin.
  ["components/admin/RoleRecognizeControl.tsx", 3],
  // 1 -> 2 (arc A): the load-failure card announced nothing. The file's one
  // prior call is success-shaped and belongs to `GroupSection`, so this was the
  // entry's named suspect site and the probe confirmed it. The new call is an
  // EFFECT — this component owns no transition, it receives already-resolved
  // data as a prop — keyed on the previously-OBSERVED `data.kind`.
  ["components/admin/RecentAutoAppliedStrip.tsx", 2],
  // 1 -> 2 (arc A): the file's one prior call covered only the shrink_held pause
  // branch, so the SUCCESS summary — the most common outcome of the most common
  // admin action — was silent for AT.
  ["components/admin/ReSyncButton.tsx", 2],
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
    "staged-preview-banner",
    "server-rendered banner on a force-dynamic admin route: present on first paint with its text, and every state change (viewing-as, exit) is a FULL navigation, so it is never inserted into a live document — same shape as picker-banner above",
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
    "agenda-note",
    "one arm of an either/or CONTENT branch (agenda present vs the note explaining its absence), not a post-action announcement",
  ],
]);

/**
 * Files still carrying the defect, each with the shape its repair will use.
 *
 * EMPTY as of 2026-08-07 (arc A), and the emptiness is load-bearing rather than
 * incidental: the four rows the AST walk filed as
 * BL-LIVE-REGION-AST-WALK-RESIDUE were all resolved BY REPAIR, not by deletion.
 * Keep this sentence honest — a comment that describes a data structure is a
 * claim about it, and R2 caught the previous version of this docblock still
 * saying "empty" after four rows had landed. If you add a row, say four became
 * five here.
 *
 * The mechanism is the point. A row FAILS the moment its file goes clean, so a
 * row is a claim with an expiry rather than a place to put a defect and forget
 * it. A future author who hits this guard on a new site has two honest exits —
 * mount the region, or announce through the channel — and adding a row here is
 * a third that costs them a name in the ledger.
 *
 * DOCUMENTED LIMIT, re-homed here when the entry archived (arc A spec §4 limit
 * 1) because this file is the owning surface's limits record. THE WALK IS BLIND
 * TO A CROSS-COMPONENT GATE. A parent rendering `{cond ? <Child/> : null}` where
 * `Child` owns the region is the same defect and produces no hit, because the
 * walk stops at the component boundary by construction. The live instance is
 * the agenda parsing region in `step3ReviewSections.tsx`: its own in-file
 * `baseline.length === 0` guard was repaired, but the SECTION above it is gated
 * by `includesAgenda` (`components/admin/review/sectionInclusion.ts`), so that
 * component's first paint still cannot announce. Catching this class needs
 * whole-program analysis, which is a different tool and a different change; the
 * in-component shape — gate and region in one function, which is what every
 * instance found so far has been — is fully covered.
 */
const PENDING: ReadonlyMap<string, string> = new Map([]);

/**
 * How many conditional live-region sites each registered file is KNOWN to have.
 *
 * Whole-file skips were the hole R3 named: a new conditional region added to any
 * exempted file passed silently, because nothing counted. This pins the count,
 * so the ninth site in a file that declared eight fails by default — which is
 * the fail-by-default property the walk was supposed to provide and the
 * exemption lists were quietly removing.
 *
 * Counts are MEASURED. They have now been wrong TWICE from estimation — the
 * announce-call counts, and then these, which R4 probed and found carried
 * eleven slack slots across seven files, so appending an ordinary new site to
 * any of them still produced zero offenders. Slack does not degrade this guard
 * gracefully; it removes exactly the fail-by-default property the registry
 * exists to provide. The self-test below pins the exactness rather than trusting
 * the numbers.
 */
const REGISTERED_SITES: ReadonlyMap<string, number> = new Map([
  ["components/admin/RescanSheetButton.tsx", 0],
  // Stripped 2026-08-07 (arc A): 2 -> 0. Both attributes sat on cards inserted
  // wholesale by a phase flip, so neither ever announced. The channel now
  // carries the saved state's OWN copy (variant-correct across applied /
  // revised / apply_pending) and the stale and conflict notices.
  ["components/admin/RoleRecognizeControl.tsx", 0],
  // Stripped 2026-08-07 (arc A): 2 -> 0. The error card's attribute came off
  // once the channel demonstrably carried its copy; the undo-all confirm PROMPT
  // came off WITHOUT wiring, on purpose — see the no-wire reason in the
  // CHANNEL_ANNOUNCERS header above.
  ["components/admin/RecentAutoAppliedStrip.tsx", 0],
  // Stripped 2026-08-07 (arc A): 1 -> 0, once the channel demonstrably carried
  // the success summary the card renders (one string feeds both).
  ["components/admin/ReSyncButton.tsx", 0],
  // Repaired 2026-08-07 (arc A): the region hoisted above the result gate, the
  // visual box moved inside it and left result-scoped. No conditional site left.
  ["components/admin/dev/MaterializeCard.tsx", 0],
  // Repaired 2026-08-07 (arc A): the couldn't-confirm announcement moved to a
  // second key-stable persistent region beside the arm-expiry one; the visible
  // warning line keeps its copy and drops the role it could never honour.
  ["app/admin/settings/admins/RevokeRowButton.tsx", 0],
  // Repaired 2026-08-07 (arc A), both dispositions in this file: the
  // report-status region hoisted above the `expanded` disclosure (which is NOT
  // an exemptible surface gate — an async send settles while collapsed), and the
  // agenda parsing region hoisted above the in-file `baseline.length === 0`
  // guard. The agenda SECTION's cross-component gate remains the documented
  // walk-blindness limit in this file's header, not a site.
  ["components/admin/wizard/step3ReviewSections.tsx", 0],
  // Repaired 2026-08-07 (arc A): the publish-error region hoisted above the
  // four-arm footer chain, text arm-scoped. 2 -> 1, and the ONE remaining site
  // is the dev-capture region under `viewerIsDeveloper` — which is why this
  // file's PENDING row came off by hand rather than by going clean: the stale
  // -PENDING cross-check does not fire for a file that still has a site.
  ["components/admin/wizard/Step3ReviewModal.tsx", 1],
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
): Array<{ index: number; line: number; testId: string }> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Array<{ index: number; line: number; testId: string }> = [];

  const attrs = (node: ts.JsxOpeningLikeElement) => node.attributes.properties;
  const attrText = (node: ts.JsxOpeningLikeElement, name: string): string | null => {
    for (const a of attrs(node)) {
      if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
      const init = a.initializer;
      if (init && ts.isStringLiteral(init)) return init.text;
      if (init && ts.isJsxExpression(init) && init.expression) {
        // `role={"status"}` is the same attribute written differently (R2). Strip
        // the quotes a string literal keeps in `getText()` so both spellings
        // compare equal; anything non-literal falls through as its own text.
        // The TEMPLATE spelling was missed until diff R3 probed it: `getText()`
        // returns the backticks, so `` `log` `` never equalled `log` and a
        // template-spelled region escaped this scanner entirely.
        const e = init.expression;
        if (ts.isStringLiteral(e)) return e.text;
        if (ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
        return e.getText();
      }
      return "";
    }
    return null;
  };

  /** Does this statement contain a `return` anywhere inside it? */
  const hasReturn = (node: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node): void => {
      if (found) return;
      if (ts.isReturnStatement(n)) {
        found = true;
        return;
      }
      if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))
        return;
      ts.forEachChild(n, walk);
    };
    walk(node);
    return found;
  };

  /**
   * Can this region's text be the empty string — i.e. can it mount silent?
   *
   * Two ways, both decidable and both real in this corpus: an empty-string
   * branch in the JSX itself (`cond ? msg : ""`), or a bare identifier bound to
   * `useState("")`, which starts empty and is filled later. The second is
   * invisible from the element alone, which is why the first version of this
   * check flagged `Step3SheetCard`'s `{liveMessage}` — a false positive on a
   * region that works exactly as intended.
   */
  const emptyStateVars = new Set<string>();
  {
    const collect = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isArrayBindingPattern(n.name) &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        n.initializer.expression.getText().endsWith("useState")
      ) {
        const arg = n.initializer.arguments[0];
        const first = n.name.elements[0];
        if (
          arg &&
          ts.isStringLiteral(arg) &&
          arg.text === "" &&
          first &&
          ts.isBindingElement(first)
        )
          emptyStateVars.add(first.name.getText());
      }
      ts.forEachChild(n, collect);
    };
    collect(sf);
  }

  const canMountEmpty = (el: ts.Node): boolean => {
    // CHILDREN ONLY (R3). Scanning the whole element let an empty literal in an
    // unrelated ATTRIBUTE vouch for a region — `className={x ? "a" : ""}` was
    // enough — which is a different claim entirely from "the TEXT can be empty".
    //
    // WHAT THIS CANNOT DECIDE, stated rather than pretended: whether the empty
    // branch is REACHABLE at mount. R3's live instance had a `: ""` branch that
    // a guard clause made unreachable on first render, so the region was born
    // populated behind a check that said otherwise. That one is fixed at source
    // (the text now comes from a state initialised empty). Deciding reachability
    // in general needs the value of the condition at mount, which is not
    // available here — recorded on BL-LIVE-REGION-AST-WALK-RESIDUE as the limit
    // this check has, not as a claim it satisfies.
    if (!ts.isJsxElement(el)) return false;
    const kids = el.children.filter((c) => !ts.isJsxText(c) || c.getText().trim() !== "");
    if (kids.length !== 1) return false;
    const only = kids[0];
    if (!only || !ts.isJsxExpression(only) || !only.expression) return false;
    let empty = false;
    const walk = (n: ts.Node): void => {
      if (empty) return;
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text === "")
        empty = true;
      else if (ts.isIdentifier(n) && emptyStateVars.has(n.text)) empty = true;
      else ts.forEachChild(n, walk);
    };
    walk(only.expression);
    return empty;
  };

  /** Is this element's MOUNT gated by a conditional inside its own function? */
  const gated = (node: ts.Node): boolean => {
    let cur: ts.Node | undefined = node.parent;
    let child: ts.Node = node;
    while (cur) {
      if (
        ts.isFunctionDeclaration(cur) ||
        ts.isArrowFunction(cur) ||
        ts.isFunctionExpression(cur)
      ) {
        // GUARD-CLAUSE MOUNTING (R2): `if (!ok) return null; return <p role="status">…`
        // has no conditional ANCESTOR — the region sits in the tail return — yet
        // the component only reaches it on one path, so the region is inserted
        // populated exactly as if it were ternary-gated. Ordinary authoring, not
        // obfuscation. Detected by asking whether the function body contains an
        // earlier `return` that is itself inside an `if`.
        // ...BUT ONLY IF THE REGION CANNOT MOUNT SILENT. A guard-clause region
        // whose text has an empty-string branch (`cond ? msg : ""`) arrives
        // EMPTY and mutates afterwards, which is the working shape — flagging it
        // would be a false positive, and false positives are how a guard gets
        // silenced by exemptions until it guards nothing. Six live sites are
        // exactly this and are correctly NOT reported.
        if (canMountEmpty(node)) return false;
        const body = (cur as ts.FunctionLikeDeclaration).body;
        if (body && ts.isBlock(body)) {
          for (const st of body.statements) {
            if (ts.isIfStatement(st) && hasReturn(st)) return true;
            if (ts.isSwitchStatement(st)) return true;
          }
        }
        return false;
      }
      if (ts.isConditionalExpression(cur) && (cur.whenTrue === child || cur.whenFalse === child))
        return true;
      if (
        ts.isBinaryExpression(cur) &&
        (cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          cur.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        cur.right === child
      )
        return true;
      if (ts.isIfStatement(cur) || ts.isSwitchStatement(cur) || ts.isCaseClause(cur)) return true;
      child = cur;
      cur = cur.parent;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      // A LIVE REGION IS `role="status"`, `role="log"` OR `aria-live="polite"`
      // (R3, plus nav-badge-arrival-announce Task 4). All three are independent
      // spellings of the same thing, and a conditional `aria-live` region — one
      // shipped at UseRawControl.tsx — was invisible while only the role was
      // scanned. `role="log"` joined them because the admin shell's own
      // announce region is one (components/admin/announceLog.tsx:134), so the
      // guard's central subject was the one shape it could not see.
      // `role="alert"` stays excluded: alerts ARE announced on insertion, so
      // the conditional form is correct there.
      const role = attrText(node, "role");
      const live = attrText(node, "aria-live");
      if (role !== "alert" && (role === "status" || role === "log" || live === "polite")) {
        const el = ts.isJsxOpeningElement(node) ? node.parent : node;
        if (gated(el)) {
          hits.push({
            index: hits.length,
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

/**
 * `role="status"` elements that remove themselves from the accessibility tree.
 *
 * Attribute-level and AST-based (R2): `hidden`, `aria-hidden="true"`, `inert`,
 * a `display: none` / `visibility: hidden` inline style object, and the
 * `empty:hidden` / `hidden` Tailwind utilities in `className`. Order within the
 * opening tag is irrelevant here, which was the previous scan's main hole.
 */
function hidingStatusRegions(text: string, file: string): Array<{ line: number; how: string }> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Array<{ line: number; how: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      let isStatus = false;
      const reasons: string[] = [];
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const name = a.name.getText();
        const init = a.initializer;
        // All three spellings. This scanner recognised only StringLiteral, so a
        // hidden `` role={`log`} `` region was invisible to the guard whose
        // whole subject is a region nobody can hear (diff R3 finding 3).
        const initExpr =
          init && ts.isJsxExpression(init) && init.expression ? init.expression : null;
        const literal =
          init && ts.isStringLiteral(init)
            ? init.text
            : initExpr && ts.isStringLiteral(initExpr)
              ? initExpr.text
              : initExpr && ts.isNoSubstitutionTemplateLiteral(initExpr)
                ? initExpr.text
                : null;
        // `role="log"` is a live region exactly as `role="status"` is, and the
        // HIDDEN-region scanner was still status-only after the conditional-mount
        // scanner learned `log`. The consequence the review probed: changing the
        // app's own region (announceLog.tsx:134) from `sr-only` to `hidden`,
        // `inert`, `aria-hidden`, `display:none` or an `empty:hidden` class would
        // silently escape this guard, which is the one that exists to catch a
        // region nobody can hear.
        if (name === "role" && (literal === "status" || literal === "log")) isStatus = true;
        if (name === "hidden" || name === "inert") reasons.push(name);
        if (
          name === "aria-hidden" &&
          (literal === "true" ||
            init === undefined ||
            (init && ts.isJsxExpression(init) && init.expression?.getText() === "true"))
        )
          reasons.push("aria-hidden");
        // CONDITIONAL className TOO (R3): `className={x ? "sr-only" : "hidden"}`
        // is ordinary authoring and a literal-only check cannot see it. Reading
        // the whole expression text catches every branch — a hiding utility
        // anywhere in it hides on some render. `invisible` joins the set;
        // `overflow-hidden` deliberately does not, which the self-test pins.
        const classText =
          literal ??
          (init && ts.isJsxExpression(init) && init.expression ? init.expression.getText() : null);
        if (
          name === "className" &&
          classText !== null &&
          /\bempty:hidden\b|["'\s]hidden["'\s]|(^|\s)hidden(\s|$)|\binvisible\b/.test(classText)
        )
          reasons.push("className hidden");
        if (name === "style" && init && ts.isJsxExpression(init) && init.expression) {
          const t = init.expression.getText().replace(/\s/g, "");
          if (/display:["']none["']/.test(t)) reasons.push("style display:none");
          if (/visibility:["'](hidden|collapse)["']/.test(t)) reasons.push("style visibility");
        }
      }
      if (isStatus && reasons.length > 0)
        out.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          how: reasons.join("+"),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
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

  it("REGISTERED_SITES is EXACT — no slack slot can absorb a new region", () => {
    // R4 probed the counts I had measured and found eleven slack slots across
    // seven files: appending one ordinary conditional site to any of them still
    // produced zero offenders, so the registry was not failing new sites by
    // default at all. Estimation has now put wrong numbers in this file twice,
    // so the numbers are asserted against the scanner rather than trusted.
    for (const [f, declared] of REGISTERED_SITES) {
      const actual = conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"), f).filter(
        (h) => !NON_TRANSIENT_GATES.has(h.testId) && !NON_TRANSIENT_GATES.has(`${f}::${h.testId}`),
      ).length;
      expect(
        declared,
        `${f}: registry must equal the scanner, or the slack absorbs a new site`,
      ).toBe(actual);
    }
  });

  it("no UNREGISTERED file inserts a live region together with its text", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // NO WHOLE-FILE SKIPS (R3). Skipping the file meant a NEW conditional
      // region added to any of the eight registered files passed silently — the
      // announce-call count does not move when an unannounced outcome is added,
      // and PENDING only asked whether a file still had at least one hit. The
      // scan now runs on every file and exemption is decided PER SITE, so a
      // registered file is covered for everything except the sites it names.
      const exemptSites = REGISTERED_SITES.get(f);
      const hits = conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"), f);
      // Counted AFTER the testid exemptions, matching what REGISTERED_SITES
      // declares — comparing the raw index against it double-counted gated
      // sites and made the two disagree about the same file.
      let unexempt = 0;
      for (const hit of hits) {
        // Keyed on `file::testId`. The testid alone was not enough once the AST
        // walk started seeing regions that carry NO testid — those all collapsed
        // to the empty key and would have shared one exemption between unrelated
        // files, which is an exemption that stops describing what it exempts.
        if (NON_TRANSIENT_GATES.has(hit.testId) || NON_TRANSIENT_GATES.has(`${f}::${hit.testId}`))
          continue;
        // A registered file exempts only the NUMBER of sites it declared. Site
        // N+1 is a region nobody registered, and it fails — which is the
        // fail-by-default property whole-file skipping was removing.
        unexempt += 1;
        if (exemptSites !== undefined && unexempt <= exemptSites) continue;
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
    // WHOLE-DIFF R1 FOUND ONE SHIPPED (`empty:hidden` compiles to
    // `:empty { display: none }`, and a display:none element is not in the
    // accessibility tree — so the region is REVEALED with its text rather than
    // mutated, announcing nothing). R2 then showed the line-window scan that
    // replaced it had its own holes: it started AT the `role="status"` line, so
    // it missed attributes written earlier in a multiline tag; it did not know
    // `inert`; and it could not see `style={{ display: "none" }}`.
    //
    // So this asks the AST for the element's OWN attributes — order-independent
    // by construction, and it reads the style object rather than a text window.
    const offenders: string[] = [];
    for (const f of files) {
      for (const hit of hidingStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"), f)) {
        offenders.push(`${f}:${hit.line} (${hit.how})`);
      }
    }
    expect(
      offenders,
      "a display:none / hidden / inert live region is not in the a11y tree — use sr-only when idle",
    ).toEqual([]);
  });

  it("PREMISE: both scanners reject every shape review named (self-test)", () => {
    // A guard that passes on a clean tree proves nothing about what it would
    // catch. Every shape below was named by a review round as a MISS of an
    // earlier version, so this is the regression record for all of them.
    const gated = (src: string) => conditionalStatusRegions(src, "probe.tsx").length;
    const hidden = (src: string) => hidingStatusRegions(src, "probe.tsx").length;

    // R1: the line-window regex missed these three.
    expect(gated('const C = () => <div>{a && <p role="status">{m}</p>}</div>;')).toBe(1);
    expect(gated('const C = () => <div>{a ? <p role="status">{m}</p> : null}</div>;')).toBe(1);
    expect(
      gated(
        'const C = () => <div>{a ? (\n<p\nid="x"\nclass="y"\ndata-z="w"\nrole="status"\n>{m}</p>\n) : null}</div>;',
      ),
    ).toBe(1);

    // nav-badge-arrival-announce Task 4: `role="log"` is the third spelling of
    // a live region born populated, and the detector did not recognise it.
    // AdminAnnounceProvider's own region is a `role="log"`
    // (components/admin/announceLog.tsx:134), so a conditionally-mounted copy
    // of that shape was exactly as invisible as the `aria-live` one was.
    expect(gated('const C = () => <div>{a && <p role="log">{m}</p>}</div>;')).toBe(1);
    expect(gated('const C = () => <div>{a ? <p role="log">{m}</p> : null}</div>;')).toBe(1);
    expect(gated('const C = () => <div>{a ? <p role={"log"}>{m}</p> : null}</div>;')).toBe(1);
    // The template spelling, which diff R3 found escaping both scanners.
    expect(gated("const C = () => <div>{a ? <p role={`log`}>{m}</p> : null}</div>;")).toBe(1);
    expect(gated("const C = () => <div>{a ? <p role={`status`}>{m}</p> : null}</div>;")).toBe(1);
    // ...and the same not-a-false-positive rule the other spellings carry.
    expect(
      gated('function C(){ if(!ok) return null; return <p role="log">{a ? m : ""}</p>; }'),
    ).toBe(0);

    // R2: expression-form role, switch/case, and guard-clause mounting.
    expect(gated('const C = () => <div>{a ? <p role={"status"}>{m}</p> : null}</div>;')).toBe(1);
    expect(
      gated('function C(){ switch(k){ case 1: return <p role="status">{m}</p>; } return null; }'),
    ).toBe(1);
    expect(gated('function C(){ if(!ok) return null; return <p role="status">{m}</p>; }')).toBe(1);

    // ...and the guard-clause rule must NOT fire when the region can mount
    // silent, which is the working shape and the false positive that would get
    // this whole guard exempted into uselessness.
    expect(
      gated('function C(){ if(!ok) return null; return <p role="status">{a ? m : ""}</p>; }'),
    ).toBe(0);
    expect(
      gated(
        'function C(){ const [m,setM]=useState(""); if(!ok) return null; return <p role="status">{m}</p>; }',
      ),
    ).toBe(0);

    // R1+R2: every idle-hiding mechanism, including ones written before `role`
    // in the tag, which the previous line-window scan structurally could not see.
    expect(hidden('const C = () => <p role="status" className="empty:hidden">{m}</p>;')).toBe(1);
    expect(hidden('const C = () => <p hidden role="status">{m}</p>;')).toBe(1);
    expect(hidden('const C = () => <p aria-hidden="true" role="status">{m}</p>;')).toBe(1);
    expect(hidden('const C = () => <p inert role="status">{m}</p>;')).toBe(1);
    expect(hidden('const C = () => <p style={{ display: "none" }} role="status">{m}</p>;')).toBe(1);
    // And the correct idle state is not flagged.
    expect(hidden('const C = () => <p role="status" className="sr-only">{m}</p>;')).toBe(0);

    // R3: an `aria-live` region without `role="status"` is still a live region.
    expect(gated('const C = () => <div>{a && <p aria-live="polite">{m}</p>}</div>;')).toBe(1);
    // ...and an alert is deliberately NOT one — alerts announce on insertion.
    expect(gated('const C = () => <div>{a && <p role="alert">{m}</p>}</div>;')).toBe(0);

    // R3: the whole-file skip. A registered file must still fail on site N+1,
    // or the exemption silently covers regions nobody ever registered. Modelled
    // here rather than by editing a real file: two sites, one declared.
    // R3: the idle scanner's remaining ordinary forms.
    expect(
      hidden('const C = () => <p role="status" className={x ? "sr-only" : "hidden"}>{m}</p>;'),
    ).toBe(1);
    expect(hidden('const C = () => <p role="status" aria-hidden={true}>{m}</p>;')).toBe(1);
    expect(hidden('const C = () => <p role="status" className="invisible">{m}</p>;')).toBe(1);
    // A className that merely CONTAINS the word in another token is not a hit.
    expect(hidden('const C = () => <p role="status" className="overflow-hidden">{m}</p>;')).toBe(0);

    const twoSites =
      'const C = () => <div>{a && <p role="status">{x}</p>}{b && <p role="status">{y}</p>}</div>;';
    expect(conditionalStatusRegions(twoSites, "probe.tsx").map((h) => h.index)).toEqual([0, 1]);
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

/**
 * AC-10 of the nav badge arrival announcement.
 *
 * The widened walk above does NOT discharge this criterion, and an earlier
 * revision of that arc's plan claimed it did. That walk pushes a hit only when
 * `gated(el)` is true, because its subject is regions born populated. AC-10 is
 * a different claim: the nav must add NO live region at all, gated or not,
 * because the arc rides the layout's existing `AdminAnnounceProvider` and a
 * second region in the nav would be a competing announce channel.
 *
 * This is a NON-RED regression pin, stated plainly rather than dressed as TDD.
 * It passes on the pre-implementation tree, since the nav carries no
 * live-region attribute today, and its job is to keep passing. A "do not add"
 * criterion only ever fails on a later edit, which is what a regression pin is
 * for.
 */
describe("AC-10: the admin nav mints no live region of its own", () => {
  const NAV_DIR = "components/admin/nav";

  /**
   * Same unwrapping as the scanner above: a string literal, or the literal
   * inside `role={"log"}`. Local because that one is closed over by the
   * scanner's own factory, and duplicating four lines beats widening its scope
   * for a second caller.
   */
  const navAttrText = (node: ts.JsxOpeningLikeElement, name: string): string | null => {
    for (const a of node.attributes.properties) {
      if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
      const init = a.initializer;
      if (init && ts.isStringLiteral(init)) return init.text;
      if (init && ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        // Three spellings, not one. `role="log"`, `role={"log"}`, and
        // ``role={`log`}``; the template form was missed by the first version.
        if (ts.isStringLiteral(e)) return e.text;
        if (ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
        return e.getText();
      }
    }
    return null;
  };

  // RECURSIVE. The first version read only the immediate directory, so a live
  // region in a new subdirectory was invisible to a scan whose own name claims
  // `components/admin/nav/**`. Creating a subdirectory is an ordinary edit.
  const navFiles = (dir: string = NAV_DIR): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, dir))) {
      const rel = join(dir, entry);
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) out.push(...navFiles(rel));
      else if (/\.tsx?$/.test(entry)) out.push(rel);
    }
    return out.sort();
  };

  it("carries no role=log, role=status or aria-live under components/admin/nav/", () => {
    // Read from disk, not a file list: a nav file added later is in scope by
    // default rather than outside a list nobody updated.
    const files = navFiles();
    expect(files.length, "the nav directory should hold source files").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
          // Compares UNWRAPPED literals, so `role={"log"}` fails exactly as
          // `role="log"` does. That spelling is one ordinary edit away and the
          // repo's own attrText already unwraps it.
          const role = navAttrText(node, "role");
          const live = navAttrText(node, "aria-live");
          // Refuse the two live-region roles and any aria-live, in every
          // spelling. A NON-LITERAL role (`role={LIVE_ROLE}`, `role={x ? a : b}`)
          // is unresolvable from source, and on a nav element that is worth
          // refusing too, since it is the one shape that could hide a live role
          // from this scan.
          //
          // What is NOT refused: ordinary non-live roles. An earlier revision
          // allowlisted ten and rejected everything else, so adding
          // `role="group"`, `role="toolbar"`, `tablist` or `tab` to the action
          // cluster failed AC-10 while adding no live region at all. A guard
          // that reds on correct edits gets exempted into uselessness, so the
          // rule is now a denylist of live roles plus a resolvability check.
          const LIVE_ROLES = new Set(["log", "status", "alert", "marquee", "timer"]);
          const resolvable = role === null || /^[a-z]+$/.test(role);
          const unresolvableRole = !resolvable;
          if ((role !== null && LIVE_ROLES.has(role)) || live !== null || unresolvableRole) {
            offenders.push(
              `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(
      offenders,
      "the nav announces through the layout's AdminAnnounceProvider; a region here would be a second channel",
    ).toEqual([]);
  });
});
