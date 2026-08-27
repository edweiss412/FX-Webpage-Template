/**
 * tests/components/auth/avatarMenuTransitionAudit.test.ts
 *
 * Structural transition audit for `components/auth/AvatarMenu.tsx`.
 *
 * The component's inventory is spec §4.6, amended 2026-08-27 from four states on
 * one axis to TWO INDEPENDENT AXES: the menu is `closed` or `open`, the switch is
 * `idle` / `pending` / `timedout` / `error`, seven observable configurations.
 * This file is the STRUCTURAL half: every conditional in the source carries a
 * declared treatment, and nothing can be added without a row.
 *
 * WHY THE AST AND NOT A REGEX. The first version of this file counted `? (`,
 * `&& (` and `if (` the way the same-route sibling's audit does. Measured against
 * the TypeScript AST it saw 7 of 12 ternaries, missed the `switch` entirely, and
 * counted the module header's prose "`Not you?`" as a branch: an identifier,
 * brace, or numeric consequent (`activeIndex === 0 ? 0 : -1`) is invisible to
 * that pattern. So the completeness the file advertised was false, and widening
 * the pattern would only move the next hole. The AST cannot miss a node, and a
 * comment is not a node.
 *
 * The check is a BIJECTION, not a count: every conditional the AST finds must be
 * matched by some row, and every row must match at least one conditional. A count
 * tells you the number moved; this tells you WHICH conditional nobody declared,
 * with its line and its text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { premise } from "../../_shared/premise";

const FILE = join("components", "auth", "AvatarMenu.tsx");
const SOURCE = readFileSync(join(process.cwd(), FILE), "utf8");

interface Site {
  readonly kind: "if" | "ternary" | "switch" | "jsx-and";
  readonly line: number;
  readonly text: string;
  /**
   * The statement that FOLLOWS this one in its block, or "".
   *
   * Two sites in this component are textually IDENTICAL
   * (`if (switchAttempt.current !== attempt) return;` in the catch and again on
   * the settle path; `if (!open) return;` in two effects), so node text alone
   * cannot tell them apart. Diff round 1 at this base proved the cost: with
   * rows free to match more than one site, deleting the catch's supersession
   * guard left the audit GREEN, because its row still matched the settle-path
   * twin. The match key is `text \u0000 after`, and the mapping below is
   * one-to-one.
   */
  readonly after: string;
}

/** The match key a DECLARED marker is tested against. */
function siteKey(site: Site): string {
  return `${site.text}\u0000${site.after}`;
}

/** `a && <jsx/>` is a render branch; `a && b` inside an `if` test is not. */
function isJsxGuard(node: ts.BinaryExpression): boolean {
  let right: ts.Node = node.right;
  while (ts.isParenthesizedExpression(right)) right = right.expression;
  return ts.isJsxElement(right) || ts.isJsxFragment(right) || ts.isJsxSelfClosingElement(right);
}

/** Every conditional site in the component, from the AST. */
function conditionalSites(): Site[] {
  const src = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    let kind: Site["kind"] | null = null;
    if (ts.isIfStatement(node)) kind = "if";
    else if (ts.isConditionalExpression(node)) kind = "ternary";
    else if (ts.isSwitchStatement(node)) kind = "switch";
    else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isJsxGuard(node)
    ) {
      kind = "jsx-and";
    }
    if (kind !== null) {
      let after = "";
      const parent = node.parent;
      if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
        const statements = parent.statements;
        const index = statements.indexOf(node as ts.Statement);
        if (index >= 0 && index + 1 < statements.length) {
          after = statements[index + 1]!.getText(src).replace(/\s+/g, " ").slice(0, 60);
        }
      }
      sites.push({
        kind,
        line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1,
        text: node.getText(src).replace(/\s+/g, " "),
        after,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return sites;
}

/** Every conditional in the component, with its §4.6 treatment. */
const DECLARED = [
  {
    id: "C1",
    what: "the name fallback when the crew member has no name",
    marker: /^name\.trim\(\) === "" \?/,
    treatment: "not a render branch; the trigger is never left unnamed",
  },
  {
    id: "C2",
    what: "the accessible-name builder appends role only when non-empty",
    marker: /^if \(role\.trim\(\) !== ""\)/,
    treatment: "not a render branch; no dangling punctuation by construction",
  },
  {
    id: "C3",
    what: "the watchdog effect arms only while pending",
    marker: /^if \(switchPhase !== "pending"\) return;\u0000/,
    treatment: "not a render branch; arming, not painting",
  },
  {
    id: "C4",
    what: "the watchdog callback refuses to leave a phase that is not pending",
    marker: /^phase === "pending" \? "timedout" : phase\u0000/,
    treatment: "instant when it fires; a no-op after a settle",
  },
  {
    id: "C5",
    what: "the re-entry guard on the click, reading the DERIVED busy flag",
    marker: /^if \(switchBusy\) \{/,
    treatment: "not a render branch; admitting the retry once the watchdog has fired is the point",
  },
  {
    id: "C6",
    what: "the catch drops a superseded attempt BEFORE rethrowing control flow",
    marker: /^if \(switchAttempt\.current !== attempt\) return;\u0000unstable_rethrow/,
    treatment: "not a render branch; a superseded redirect is not this row's to follow",
  },
  {
    id: "C6b",
    what: "the settle path drops a superseded attempt's result",
    marker: /^if \(switchAttempt\.current !== attempt\) return;\u0000setSwitchPhase\("idle"\)/,
    treatment: "not a render branch; a superseded attempt enters no state",
  },
  {
    id: "C7",
    what: "the settle path reports a failure",
    marker: /^if \(failed\) setSwitchStatus\("error"\);\u0000/,
    treatment: "instant; the row is enabled by the time the alert is readable",
  },
  {
    id: "C8",
    what: "close() restores focus only when asked",
    marker: /^if \(opts\.restoreFocus\)/,
    treatment: "not a render branch; focus, not paint",
  },
  {
    id: "C9",
    what: "the outside-pointerdown effect is inert while closed",
    marker: /^if \(!open\) return;\u0000const onPointerDown/,
    treatment: "not a render branch",
  },
  {
    id: "C9b",
    what: "the deferred-focus effect is inert while closed",
    marker: /^if \(!open\) return;\u0000const index = pendingFocus\.current;/,
    treatment: "not a render branch",
  },
  {
    id: "C10",
    what: "an in-container pointerdown does not close",
    marker: /^if \(target instanceof Node/,
    treatment: "not a render branch",
  },
  {
    id: "C11",
    what: "the deferred-focus effect is inert with no pending index",
    marker: /^if \(index === null\) return;\u0000/,
    treatment: "not a render branch",
  },
  {
    id: "C12",
    what: "trigger keydown: open-at-first on ArrowDown/Enter/Space",
    marker: /^if \(event\.key === "ArrowDown" \|\|/,
    treatment: "closed→open, the duration-fast enter treatment",
  },
  {
    id: "C13",
    what: "trigger keydown: open-at-last on ArrowUp",
    marker: /^if \(event\.key === "ArrowUp"\)/,
    treatment: "closed→open at the last item, carrying whatever switch phase is live",
  },
  {
    id: "C14",
    what: "the in-menu keyboard map",
    marker: /^switch \(event\.key\) \{/,
    treatment:
      "Escape closes and restores focus; arrows and Home/End move focus only; Tab closes and hands focus back",
  },
  {
    id: "C15",
    what: "the announcement says Switching person while pending",
    marker: /^if \(switchPhase === "pending"\) switchAnnouncement/,
    treatment: "instant; announcement only, no visual state",
  },
  {
    id: "C16",
    what: "the announcement says the timeout notice while timed out",
    marker: /^if \(switchPhase === "timedout"\) switchAnnouncement/,
    treatment: "instant; announcement only, no visual state",
  },
  {
    id: "C17",
    what: "the menu is named by the header, or labelled directly when there is none",
    marker: /^hasIdentity \? \{ "aria-labelledby"/,
    treatment: "not a render branch; a labelledby pointing at nothing would leave the menu unnamed",
  },
  {
    id: "C18",
    what: "the trigger toggles the menu",
    marker: /^open \? close\(\{ restoreFocus: false \}\) : openAt\(0\)\u0000/,
    treatment:
      "closed↔open; the close path does NOT restore focus, the person is already reaching elsewhere",
  },
  {
    id: "C19",
    what: "the popover renders only while open",
    marker: /^open \? \(/,
    treatment: "enter: motion-safe avatar-menu-in; exit is an unmount, motion-reduce instant",
  },
  {
    id: "C20",
    what: "the identity header renders only with an identity",
    marker: /^hasIdentity \? \(/,
    treatment: "instant; absent it, the menu takes aria-label instead",
  },
  {
    id: "C21",
    what: "the sr-only separator between name and role",
    marker:
      /^name\.trim\(\) !== "" && role\.trim\(\) !== "" && \( <span data-testid="avatar-menu-sr-separator"/,
    treatment: "instant; screen-reader punctuation only",
  },
  {
    id: "C22",
    what: "the visible middot between name and role",
    marker:
      /^name\.trim\(\) !== "" && role\.trim\(\) !== "" && \( <span className="font-medium text-text-subtle" aria-hidden/,
    treatment: "instant; decorative, hidden from AT",
  },
  {
    id: "C23",
    what: "the theme row's roving tabindex",
    marker: /^activeIndex === 0 \? 0 : -1\u0000/,
    treatment: "not a render branch; focus order, not paint",
  },
  {
    id: "C24",
    what: "the theme row toggles light and dark",
    marker: /^isDark \? "light" : "dark"\u0000/,
    treatment: "instant; the menu deliberately stays open",
  },
  {
    id: "C25",
    what: "the theme check glyph is visible only when mounted and dark",
    marker: /^mounted && isDark \? "visible" : "invisible"\u0000/,
    treatment: "instant; invisible rather than absent, so the row cannot reflow",
  },
  {
    id: "C26",
    what: "the switch row's roving tabindex",
    marker: /^activeIndex === 1 \? 0 : -1\u0000/,
    treatment:
      "not a render branch; the pending row stays focusable, which is why aria-disabled is used over disabled",
  },
  {
    id: "C27",
    what: "the visible timeout note renders only in the timed-out phase",
    marker: /^switchPhase === "timedout" \? \(/,
    treatment:
      "instant; a sibling of role=menu, aria-hidden so the sr-only region stays the single AT channel",
  },
  {
    id: "C28",
    what: "the failure alert renders only in the error state",
    marker: /^switchStatus === "error" \? \(/,
    treatment: "instant; a sibling of role=menu, and the menu stays open behind it",
  },
] as const;

describe("AvatarMenu transition audit (spec §4.6)", () => {
  test("the AST census finds a real population", () => {
    const sites = conditionalSites();
    // Premise: an empty or tiny parse would make every assertion below vacuous.
    premise("the component parses to a real conditional population", sites.length, 20);
    expect(
      sites.some((s) => s.kind === "switch"),
      "the keyboard switch is seen",
    ).toBe(true);
    expect(
      sites.some((s) => s.kind === "jsx-and"),
      "JSX && guards are seen",
    ).toBe(true);
  });

  test.each(DECLARED)("$id matches EXACTLY ONE conditional", ({ marker }) => {
    // Exactly one, not at least one. Diff round 1 at this base demonstrated the
    // difference with a live escaping mutant: with rows free to match more than
    // one site, deleting the catch's supersession guard left this suite GREEN,
    // because its row still matched the textually identical settle-path twin.
    const matched = conditionalSites().filter((s) => marker.test(siteKey(s)));
    expect(matched.map((m) => `${FILE}:${m.line}`)).toHaveLength(1);
  });

  test("every conditional is claimed by EXACTLY ONE row", () => {
    const offenders = conditionalSites()
      .map((s) => ({ s, rows: DECLARED.filter((d) => d.marker.test(siteKey(s))) }))
      .filter((x) => x.rows.length !== 1)
      .map(
        (x) =>
          `${FILE}:${x.s.line} [${x.s.kind}] claimed by ${x.rows.length} rows ` +
          `(${x.rows.map((r) => r.id).join(", ") || "none"}): ${x.s.text.slice(0, 70)}`,
      );
    expect(offenders, "each conditional needs exactly one DECLARED row").toEqual([]);
  });

  test("the row count equals the site count", () => {
    // The third leg of the bijection: rows and sites are the same size, so a
    // row cannot quietly go unused after its conditional is deleted.
    expect(DECLARED.length).toBe(conditionalSites().length);
  });

  test("every declared row has a treatment", () => {
    for (const row of DECLARED) expect(row.treatment.length, row.id).toBeGreaterThan(0);
  });

  test("the pending affordances read the component's own phase, never React's flag", () => {
    // Rendering from `switchPending` put the row in states the inventory
    // forbids, and the behavioural cases that catch a return to it are
    // avatarMenu.test.tsx's two "the RETRY settles ... while the first is still
    // hung". This is the structural half: the flag is not read at all.
    expect(SOURCE).toMatch(/const \[, startSwitch\] = useTransition\(\)/);
    expect(SOURCE).not.toMatch(/\bswitchPending\b/);
    expect(SOURCE).toMatch(/aria-disabled=\{switchBusy\}/);
    expect(SOURCE).toMatch(/aria-busy=\{switchBusy \|\| undefined\}/);
  });

  test("no transition or duration class rides the switch-phase swap", () => {
    // The watchdog re-enabling the row is instant by design: the row is
    // returning to its resting appearance, not animating into a new one.
    const note = /avatar-menu-switch-timeout-note[\s\S]{0,200}?>/.exec(SOURCE)?.[0] ?? "";
    expect(note).not.toMatch(/\btransition-/);
    expect(note).not.toMatch(/\banimate-/);
  });
});
