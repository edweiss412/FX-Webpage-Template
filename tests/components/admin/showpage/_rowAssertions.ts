/**
 * tests/components/admin/showpage/_rowAssertions.ts
 *
 * Shared row-assertion helpers (spec 2026-07-20-share-hub-fidelity-fixes §7.0).
 *
 * Structural defense, not convenience: four consecutive adversarial-review
 * rounds found the same class of defect, an assertion form a WRONG
 * implementation could still satisfy (substring class matching; co-presence
 * instead of containment; uniqueness without containment; a required token
 * coexisting with a token that overrides it). Patching instances per round did
 * not converge, so the rigor lives here, in one place, and every row assertion
 * goes through it.
 *
 * Round-4 hardening, each closing a specific escape the previous form allowed:
 *   - `exactly` is the DEFAULT posture for a fully-prescribed class list.
 *     `has` alone permits `sm:w-auto` / `items-start` / `px-0` to ride along and
 *     override the token that was asserted.
 *   - forbid patterns are anchored to allow a variant prefix, so `sm:border`
 *     and `hover:border-accent` are caught, not just a bare `border`.
 *   - text assertions reject hidden carriers, and count occurrences over
 *     COMPOSED text so a duplicate split across sibling elements is caught
 *     (Testing Library's exact getAllByText does not match broken-up text).
 */
import { within } from "@testing-library/react";
import { expect } from "vitest";

/** Class tokens as a Set. NEVER assert against `className` directly:
 *  `.toContain("w-full")` also passes for `sm:w-full` / `max-w-full`. */
/** Class-based hiding mechanisms, matched AFTER any variant prefix. `sm:hidden`
 *  and `md:invisible` hide the row just as thoroughly as the bare tokens do at
 *  their breakpoint, and a bare-token check misses every one of them. */
const HIDING_TOKENS = ["sr-only", "hidden", "invisible", "collapse"] as const;
const HIDING_RE = new RegExp(`(?:^|:)(?:${HIDING_TOKENS.join("|")})$`);
const hidingTokensOf = (el: Element): string[] =>
  [...tokensOf(el)].filter((t) => HIDING_RE.test(t));

export const tokensOf = (el: Element): Set<string> =>
  new Set(el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);

/** Anchored to the token start OR just past a variant prefix, so `sm:border`
 *  and `hover:border-accent` are caught alongside a bare `border`. An unanchored
 *  /^border/ misses every variant-prefixed form. The negative lookahead excludes
 *  the table utilities that merely SHARE the prefix (`border-spacing-*`,
 *  `border-collapse`, `border-separate`) that declare no border of their own.
 *  A probe caught this helper flagging `border-spacing-0`. */
export const NO_BORDER = /(?:^|:)border(?!-(?:spacing|collapse|separate))(?:-|$)/;
/** No `bg-*` at REST. A variant-prefixed `hover:bg-*` is allowed by design; a
 *  regex over the whole class string cannot tell the two apart. */
export const NO_REST_BACKGROUND = /^bg-/;

export function expectClasses(
  el: Element,
  spec: { has?: readonly string[]; forbids?: readonly RegExp[]; exactly?: readonly string[] },
): void {
  const t = tokensOf(el);
  for (const c of spec.has ?? []) expect([...t], `missing token ${c}`).toContain(c);
  for (const re of spec.forbids ?? []) {
    expect(
      [...t].filter((x) => re.test(x)),
      `forbidden token matching ${re}`,
    ).toEqual([]);
  }
  // `exactly` is what stops a conflicting extra (sm:w-auto, items-start, px-0)
  // from overriding a token that `has` already matched.
  if (spec.exactly) expect([...t].sort()).toEqual([...spec.exactly].sort());
}

/** Whitespace-normalized text of an element and all its descendants, with a
 *  SEPARATOR inserted at every element boundary. Plain `textContent` concatenates
 *  with no gap, so `<span>Old link</span><span>stops working</span>` yields
 *  "Old linkstops working": a duplicate that reads identically on screen, with
 *  the gap supplied by `gap-1` rather than a text node, would go uncounted. */
const composedText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return [...node.childNodes].map(composedText).join(" ");
};
const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** jsdom loads no CSS, so real visibility belongs to the Playwright specs. What
 *  IS provable here: the carrier is not deliberately hidden from sight or from
 *  the a11y tree. Without this, `sr-only` / `hidden` text satisfies every
 *  containment assertion while rendering nothing a sighted user sees. */
function expectNotHidden(el: Element, root: Element, what: string): void {
  // Walk from the carrier UP THROUGH the root INCLUSIVE. Two escapes this
  // closes, both found by review: checking the carrier alone lets a `hidden`
  // row BUTTON hide everything, and stopping AT the button lets a hidden
  // wrapper ABOVE it do the same while every token, containment, and composed
  // -text assertion still passes. `root` is therefore the popover scope, not
  // the button.
  let cur: Element | null = el;
  while (cur) {
    const where = cur === el ? what : `${what} ancestor <${cur.tagName.toLowerCase()}>`;
    // Class-based hiding, variant-prefixed forms included.
    expect(hidingTokensOf(cur), `${where} must not carry a hiding class`).toEqual([]);
    expect(cur.hasAttribute("hidden"), `${where} must not carry the hidden attribute`).toBe(false);
    // `inert` removes the whole subtree from interaction and the a11y tree.
    // jsdom does not ENFORCE it, so a behavioral guard cannot see it either;
    // the attribute is decidable, so it is rejected here.
    expect(cur.hasAttribute("inert"), `${where} must not be inert`).toBe(false);
    expect(cur.getAttribute("aria-hidden"), `${where} must not be aria-hidden`).not.toBe("true");
    // INLINE style hiding. jsdom cannot resolve stylesheets, but it parses the
    // style attribute perfectly well, so `style={{ display: "none" }}` is
    // decidable here and must not be waved off as "a rendering property".
    const style = (cur as HTMLElement).style;
    expect(style?.display, `${where} must not be display:none`).not.toBe("none");
    expect(style?.visibility, `${where} must not be visibility:hidden`).not.toBe("hidden");
    expect(style?.visibility, `${where} must not be visibility:collapse`).not.toBe("collapse");
    if (cur === root) break;
    cur = cur.parentElement;
  }
}

/**
 * Counts how many ELEMENTS in the scope render exactly `needle` as their own
 * composed text.
 *
 * Not a raw substring count over the scope's text: with `rowLabel="Old link"`
 * and `rowDescription="Old link stops working immediately"` (both legal per
 * §4.2, which supports an arbitrary `rowLabel`), the label occurs twice as a
 * SUBSTRING and a correct row would be reported as a duplicate.
 *
 * Element-equality keeps the escape it was introduced for: a duplicate split
 * across siblings (`<p><span>Old link </span><span>stops working</span></p>`)
 * still has a parent whose COMPOSED text equals the needle, so it is counted.
 */
function countComposed(scope: HTMLElement, needle: string): number {
  const target = normalize(needle);
  const matches = [scope, ...scope.querySelectorAll("*")].filter(
    (el) => normalize(composedText(el)) === target,
  );
  // Keep only the DEEPEST match in each chain. An element whose sole text is the
  // needle propagates the match to every ancestor that adds no other text. With
  // no description rendered, the label span, its column, AND the button all
  // compose to the label, which would count 3 for a CORRECT row. (The self-test
  // caught exactly this.) The split-duplicate escape survives: in
  // `<p><span>Old link </span><span>stops working</span></p>` neither child
  // matches alone, so the `<p>` itself is the deepest match and is counted.
  return matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)))
    .length;
}

/**
 * The label/description contract, in ONE place. Proves, for a row button:
 * the text is rendered INSIDE the button (not left outside in a surviving old
 * block), is not hidden, the `aria-describedby` target is a DESCENDANT of the
 * button, its text matches EXACTLY, and each string appears exactly once in the
 * scope, counted over composed text.
 */
/** The row's prescribed typography (spec §4.1). Asserted with `exactly` so a
 *  row that renders the right STRINGS at the wrong size/weight/colour fails. */
export const LABEL_CLASSES = ["text-sm", "font-medium", "text-text-strong"] as const;
export const DESCRIPTION_CLASSES = ["text-xs", "text-text-subtle"] as const;
/** The stacked label/description column (spec §4.6). `flex` AND `flex-col`:
 *  `flex-col` alone sets flex-direction but establishes no flex context. */
export const COLUMN_CLASSES = ["flex", "min-w-0", "flex-col"] as const;
/** The row's outer wrapper (spec §4.6 width chain link 1). Unconditional: it
 *  does not vary with whether a description is present. */
export const WRAPPER_CLASSES = ["flex", "w-full", "flex-col", "gap-2"] as const;

/** The prescribed row topology: an icon, then the column, and nothing else.
 *  Asserting the pieces individually is not enough: label and description can
 *  each be correct while sitting as DIRECT children of the button, an unstacked
 *  flex row that satisfies every per-element check. */
/** Every heading in a subtree, root INCLUSIVE. `role` is a token LIST, so
 *  `role="heading presentation"` is still a heading and a `[role='heading']`
 *  attribute selector would miss it. */
function headingsIn(root: Element): Element[] {
  return [root, ...root.querySelectorAll("*")].filter(
    (el) =>
      /^h[1-6]$/i.test(el.tagName) ||
      (el.getAttribute("role") ?? "").split(/\s+/).includes("heading"),
  );
}

function expectRowTopology(button: HTMLElement, column: Element): void {
  // §4.3: the row contributes NO heading-outline entry, at ANY level.
  expect(headingsIn(button), "the row must contribute no heading").toEqual([]);

  // An implicit or `submit` type would SUBMIT AN ENCLOSING FORM when the row is
  // clicked. Cheap to assert, expensive to discover in production.
  expect(button.getAttribute("type"), "row must be type=button").toBe("button");
  expect(
    [...button.children].map((c) => c.tagName.toLowerCase()),
    "row children must be exactly [icon, column]",
  ).toEqual(["svg", "span"]);
  expect(button.children[1], "the column must be the row's second child").toBe(column);
  expectClasses(column, { exactly: COLUMN_CLASSES });
}

export function expectRowText(
  button: HTMLElement,
  scope: HTMLElement,
  { label, description }: { label: string; description: string },
): void {
  // CONTRACT, asserted rather than assumed: a row's label and description are
  // DISTINCT strings. A row whose description merely repeats its label conveys
  // nothing and would announce the same sentence twice; the uniqueness checks
  // below cannot express "exactly one of each" when the two are identical.
  // Narrowing the contract is the fix, rather than teaching every assertion to
  // handle a degenerate input no caller should produce.
  expect(normalize(label), "row label and description must be distinct").not.toBe(
    normalize(description),
  );
  // The button must itself be inside the scope, or the visibility walk below
  // would terminate without ever reaching the scope boundary.
  expect(scope.contains(button), "row button must be inside the asserted scope").toBe(true);
  const labelEl = within(button).getByText(label);
  expect(button.contains(labelEl)).toBe(true);
  expect(labelEl.tagName, "the label must be a plain span, never a heading").toBe("SPAN");
  expect([...labelEl.children], "the label must contain text only").toEqual([]);
  expectNotHidden(labelEl, scope, "row label");
  expect(button.getAttribute("aria-label")).toBe(label);
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  const descEl = document.getElementById(button.getAttribute("aria-describedby") ?? "");
  expect(descEl, "aria-describedby must resolve").not.toBeNull();
  expect(button.contains(descEl)).toBe(true);
  expectNotHidden(descEl!, scope, "row description");
  expect(normalize(composedText(descEl!))).toBe(description);
  expect(
    countComposed(scope, description),
    `description "${description}" must appear exactly once`,
  ).toBe(1);
  expectClasses(descEl!, { exactly: DESCRIPTION_CLASSES });
  // A plain text carrier: no nested elements. Otherwise
  // `<span id={descId} class="text-xs text-text-subtle"><a href="/x">…</a></span>`
  // passes exact text, classes, topology, and containment while nesting an
  // interactive control INSIDE the row button: invalid HTML and a real
  // click-target bug.
  expect(descEl!.tagName, "the description must be a plain span").toBe("SPAN");
  expect(
    [...descEl!.children],
    "the description must contain text only, no nested elements",
  ).toEqual([]);

  // Both strings must be STACKED IN THE COLUMN, not merely present. As direct
  // children of the button they would be flex ROW siblings of the icon and read
  // as one line, while satisfying every assertion above.
  expect(labelEl.parentElement, "label and description must share one parent").toBe(
    descEl!.parentElement,
  );
  expect(labelEl.parentElement, "label must not be a direct child of the row").not.toBe(button);

  // ORDER, not just co-parenthood: label above description. The reverse
  // satisfies every other assertion while reading upside-down on screen.
  expect(
    [...labelEl.parentElement!.children],
    "column children must be exactly [label, description], in that order",
  ).toEqual([labelEl, descEl]);

  expectRowTopology(button, labelEl.parentElement!);
}

/**
 * Asserts a row renders NO description carrier at all: the §4.5 contract for an
 * absent or whitespace-only `rowDescription`.
 *
 * Structural and TAG-AGNOSTIC by design. A span count is neither: an empty
 * `<p id={descId} class="text-xs text-text-subtle">` survives a
 * `querySelectorAll("span")` check while still leaving the forbidden empty
 * described node in the tree. The column holds the label and nothing else, so
 * `childElementCount === 1` is the contract regardless of what tag the escape
 * reaches for.
 */
export function expectNoDescriptionNode(
  button: HTMLElement,
  scope: HTMLElement,
  label: string,
  { allowLiveRegion = false }: { allowLiveRegion?: boolean } = {},
): void {
  expect(button.getAttribute("aria-describedby"), "no described node when absent").toBeNull();

  const labelEl = within(button).getByText(label);
  expect(labelEl.tagName, "the label must be a plain span, never a heading").toBe("SPAN");

  // The LABEL's own contract must survive the description being absent. Without
  // this, `aria-label={rowDescription?.trim() ? rowLabel : undefined}` passes:
  // the normal-description tests still see the right name, while a row with no
  // description silently loses its accessible name entirely.
  expect(button.getAttribute("aria-label"), "label survives an absent description").toBe(label);
  expectNotHidden(labelEl, scope, "row label");
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  // The label must still be unique in the scope: a conditional
  // absent-description branch could leave a duplicate label outside the button.
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);

  const column = labelEl.parentElement;
  expect(column, "label must sit in the row column").not.toBeNull();
  // The whole SUBTREE, not just the direct children: an empty `<span id={descId}/>`
  // nested INSIDE the label element leaves the column's child count at one, the
  // text content unchanged, and no description class anywhere.
  expect(
    [...column!.querySelectorAll("*")],
    "the column subtree must contain exactly the label element",
  ).toEqual([labelEl]);

  // Same topology as the with-description case, including the column's own
  // prescribed classes: an absent-description branch must not quietly drop
  // `flex min-w-0 flex-col` just because there is nothing left to stack.
  expectRowTopology(button, column!);

  // Scanned across the whole SCOPE, matching the COMPLETE description class set.
  //
  // Deliberately `every`, not `some`: the row ICON legitimately carries
  // `text-text-subtle`, which is one of the description tokens, so a `some`
  // match flags `<svg class="shrink-0 text-text-subtle">` and FAILS THE CORRECT
  // implementation. A partial-class carrier (`<p class="text-xs">`) is caught
  // structurally instead: by the row topology check (children exactly
  // `[svg, column]`), the column-subtree check, and the wrapper-children check
  // below, which is stronger than a class heuristic anyway.
  expect(
    [...scope.querySelectorAll("*")].filter((el) =>
      DESCRIPTION_CLASSES.every((c) => tokensOf(el).has(c)),
    ),
    "no element in the row scope may carry the description class set",
  ).toEqual([]);

  // The decisive check, because a class scan can only reject carriers that LOOK
  // like descriptions. A CLASSLESS `<p id={descId}>   </p>` beside the button
  // carries no description token at all and would otherwise survive. The idle
  // row wrapper renders the button and nothing else, so pinning its element
  // children forbids every sibling carrier, styled or not.
  //
  // Precondition: call this only on an idle row with no outcome banner mounted.
  // A banner is a legitimate wrapper sibling. The guard tests render the control
  // fresh, so no banner exists.
  // The whole boundary, which is the only thing that can see a forbidden
  // SIBLING of the button (classless carrier, empty heading, duplicate id).
  expectRowBoundary(button, { scope, descriptionId: null, allowLiveRegion });
}

/**
 * Asserts the row component's WHOLE rendered boundary, not just the button.
 *
 * Every escape found from round 13 onward had one shape: a forbidden node
 * rendered as a SIBLING of the button (a classless description carrier, an
 * empty `<h5 aria-label>`, a second element reusing the description id).
 * Button-scoped and class-based checks are structurally unable to see those, so
 * this pins the tree instead of adding another spot-check per round.
 *
 * The component boundary is the WRAPPER: rotate and reset each render exactly
 * one wrapper containing the row. That is the only boundary available inside
 * ShareHub, whose popover legitimately holds other content.
 *
 * `container` is optional and applies to STANDALONE renders only. Pass
 * Testing Library's `render(...).container`, which proves the component emits
 * that wrapper and nothing beside it. Do NOT pass `document.body` (its child is
 * TL's host div, not the wrapper) and do NOT pass the ShareHub popover (it holds
 * the crew-link block and the mailto rows too).
 *
 * `scope` bounds the description-id cardinality scan; `getElementById` resolves
 * only the first match, so a duplicate id elsewhere is otherwise invisible.
 *
 * Call on an IDLE row with no outcome banner mounted; a banner is a legitimate
 * wrapper sibling and callers with one should assert it explicitly instead.
 */
export function expectRowBoundary(
  button: HTMLElement,
  {
    scope,
    descriptionId,
    container,
    allowLiveRegion = false,
  }: {
    scope: HTMLElement;
    descriptionId: string | null;
    container?: HTMLElement;
    /** ONLY PickerResetControl renders a persistent live region (PCR-1 (a)).
     *  Defaults to false so rotate cannot quietly grow one. */
    allowLiveRegion?: boolean;
  },
): void {
  const wrapper = button.parentElement;
  expect(wrapper, "row button must have a wrapper").not.toBeNull();
  expectClasses(wrapper!, { exactly: WRAPPER_CLASSES });

  // The wrapper must be a PLAIN, non-interactive container. Nothing else pins
  // its tag, so `<button className={WRAPPER_CLASSES}><button …/></button>` or an
  // `<a href>` wrapper satisfies the exact classes, children, heading, and
  // container assertions while nesting interactive controls, which is invalid
  // HTML and breaks the one-button-per-control contract.
  expect(wrapper!.tagName, "the row wrapper must be a plain div").toBe("DIV");
  for (const attr of [
    "href",
    "onclick",
    "tabindex",
    "role",
    "disabled",
    "contenteditable",
    "inert",
  ]) {
    expect(wrapper!.hasAttribute(attr), `the row wrapper must not carry ${attr}`).toBe(false);
  }
  // The PERSISTENT live region is a legitimate wrapper sibling: PickerResetControl
  // renders `<div class="sr-only" role="status" aria-live="polite">` on EVERY
  // render, outcome or not (PCR-1 (a)), precisely so an announcement swaps into a
  // region already in the a11y tree. Requiring `[button]` outright would fail the
  // CORRECT reset implementation, so it is excluded BY IDENTITY (a live region),
  // not by being merely `sr-only`.
  // The live region is identified by its FULL contract, not by `role="status"`
  // plus any `aria-live` value: `<button role="status" aria-live="off">junk</button>`
  // would otherwise qualify as one.
  const isLiveRegion = (el: Element): boolean =>
    el.tagName === "DIV" &&
    el.getAttribute("role") === "status" &&
    el.getAttribute("aria-live") === "polite" &&
    tokensOf(el).has("sr-only");
  const liveRegions = [...wrapper!.children].filter(isLiveRegion);
  // A region that qualifies structurally can still be USELESS or polluted:
  // `class="sr-only hidden" aria-hidden="true"` removes it from the a11y tree,
  // destroying PCR-1 (a), and a nested <button> breaks one-control-per-row.
  // Both survive the identity match, so pin the region's own contract.
  for (const region of liveRegions) {
    expectClasses(region, { exactly: ["sr-only"] });
    expect(region.hasAttribute("hidden"), "the live region must not be hidden").toBe(false);
    expect(region.getAttribute("aria-hidden"), "the live region must not be aria-hidden").not.toBe(
      "true",
    );
    // INLINE style and `inert` hide it just as completely as the attributes
    // above, and both are decidable here. `display:none` on a live region means
    // the announcement never reaches the a11y tree.
    const rs = (region as HTMLElement).style;
    expect(rs.display, "the live region must not be display:none").not.toBe("none");
    expect(rs.visibility, "the live region must not be visibility:hidden").not.toBe("hidden");
    expect(region.hasAttribute("inert"), "the live region must not be inert").toBe(false);
    expect(
      [...region.children],
      "the live region carries announcement TEXT, never elements",
    ).toEqual([]);
  }
  expect(
    [...wrapper!.children].filter((el) => !liveRegions.includes(el)),
    "the idle wrapper contains the button (and, for reset, its live region)",
  ).toEqual([button]);
  // EXACTLY one when the control owns a live region, not "at most one":
  // PCR-1 (a) requires the region to be PERSISTENT, so a build that deletes it
  // loses the announcement entirely, and `<= 1` would call that a pass.
  expect(
    liveRegions.length,
    allowLiveRegion
      ? "reset must render exactly one persistent sr-only polite live region"
      : "this row must render no live region",
  ).toBe(allowLiveRegion ? 1 : 0);

  // No heading ANYWHERE in the component boundary, not merely inside the
  // button: an empty `<h5 aria-label="…"/>` beside the button restores the
  // outline entry while adding no composed text.
  expect(headingsIn(wrapper!), "the component must contribute no heading").toEqual([]);

  if (container) {
    expect([...container.children], "the component renders exactly one wrapper").toEqual([wrapper]);
    expect(headingsIn(container), "no heading beside the wrapper either").toEqual([]);
  }

  if (descriptionId) {
    expect(
      [...scope.querySelectorAll(`[id="${CSS.escape(descriptionId)}"]`)],
      `exactly one element may carry id ${descriptionId}`,
    ).toHaveLength(1);
  }
}
