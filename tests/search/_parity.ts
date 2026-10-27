/**
 * INV-1 parity harness (spec §2.3): every search entry is a line the section
 * renders for this viewer, and every rendered search target is an entry.
 *
 * `assertParity(sectionRoot, entries)` walks one section's rendered DOM and
 * returns every violation of clauses 1 to 5 as a typed `{ kind, detail }`, in
 * clause order. It throws nothing; tests assert the list (usually `[]`), so a
 * self-test can assert the exact kinds a broken fixture produces.
 *
 * Terms, as the spec defines them:
 * - target: an element carrying `data-search-target` (its value is the id);
 * - group heading: an element carrying `data-search-group`;
 * - skip subtree: an element carrying `data-search-skip`;
 * - text inside an `<svg>` is ignored everywhere;
 * - a target's own text: the whitespace-collapsed text of its text nodes
 *   outside any skip subtree nested in it, plus the `alt` of its images;
 * - region: an element's nearest ancestor `[data-card-id]`, else the root.
 *
 * Markers are looked up inside the root only: a skip or card OUTSIDE the
 * section root covers nothing inside it.
 */
import type { SearchEntry } from "@/lib/search/types";

export type ParityViolationKind =
  // clause 1: ids
  | "entry-without-target"
  | "duplicate-target"
  | "duplicate-entry"
  | "target-without-entry"
  | "nested-target"
  // clause 2: nothing extra in the entry
  | "value-not-in-target"
  | "label-not-in-target"
  | "copy-not-in-target"
  | "group-not-in-region"
  | "context-not-in-region"
  // clause 3: nothing missing from the entry
  | "text-not-in-entry"
  // clause 4: group headings are represented
  | "group-heading-unrepresented"
  // clause 5: coverage
  | "uncovered-text"
  | "uncovered-alt";

export type ParityViolation = { kind: ParityViolationKind; detail: string };

const TARGET = "data-search-target";
const GROUP = "data-search-group";
const SKIP = "data-search-skip";
const COVERING = `[${TARGET}],[${GROUP}],[${SKIP}]`;

/** Collapse whitespace runs to one space and trim. */
function ws(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `closest`, but only an element inside (or equal to) `root` counts. */
function closestWithin(el: Element | null, selector: string, root: Element): Element | null {
  const found = el?.closest(selector) ?? null;
  return found !== null && (found === root || root.contains(found)) ? found : null;
}

function inSvg(el: Element | null, root: Element): boolean {
  return closestWithin(el, "svg", root) !== null;
}

/** Elements matching `selector` in `root`, the root itself included, in document order. */
function elementsIn(root: Element, selector: string): Element[] {
  const inner = [...root.querySelectorAll(selector)];
  return root.matches(selector) ? [root, ...inner] : inner;
}

/** Text nodes under `scope`, in document order, outside any `<svg>`. */
function textNodes(scope: Element, root: Element): Text[] {
  const out: Text[] = [];
  const walker = scope.ownerDocument.createTreeWalker(scope, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const text = n as Text;
    if (!inSvg(text.parentElement, root)) out.push(text);
  }
  return out;
}

/** Non-empty image alts under `scope` (the scope itself included), in document order. */
function imageAlts(scope: Element, root: Element): { img: Element; alt: string }[] {
  return elementsIn(scope, "img")
    .filter((img) => !inSvg(img, root))
    .map((img) => ({ img, alt: ws(img.getAttribute("alt") ?? "") }))
    .filter(({ alt }) => alt.length > 0);
}

/** True when `node` sits inside a skip subtree nested in `scope` (scope's own skip ancestors excluded). */
function inNestedSkip(node: Element | null, scope: Element): boolean {
  const skip = node?.closest(`[${SKIP}]`) ?? null;
  return skip !== null && skip !== scope && scope.contains(skip);
}

/** The pieces of a scope's own text: text nodes and image alts outside nested skips. */
function ownPieces(scope: Element, root: Element): string[] {
  const texts = textNodes(scope, root)
    .filter((t) => !inNestedSkip(t.parentElement, scope))
    .map((t) => t.data);
  const alts = imageAlts(scope, root)
    .filter(({ img }) => !inNestedSkip(img, scope))
    .map(({ alt }) => alt);
  return [...texts, ...alts];
}

/** A scope's own text, whitespace-collapsed: its text nodes run together, then its alts. */
function ownText(scope: Element, root: Element): string {
  const texts = textNodes(scope, root)
    .filter((t) => !inNestedSkip(t.parentElement, scope))
    .map((t) => t.data)
    .join("");
  const alts = imageAlts(scope, root)
    .filter(({ img }) => !inNestedSkip(img, scope))
    .map(({ alt }) => alt);
  return ws([texts, ...alts].join(" "));
}

/** All text of a region (skip subtrees included, svg excluded), whitespace-collapsed. */
function regionText(region: Element, root: Element): string {
  const texts = textNodes(region, root)
    .map((t) => t.data)
    .join("");
  const alts = imageAlts(region, root).map(({ alt }) => alt);
  return ws([texts, ...alts].join(" "));
}

function regionOf(el: Element, root: Element): Element {
  return closestWithin(el, "[data-card-id]", root) ?? root;
}

function describeRegion(region: Element, root: Element): string {
  return region === root ? "the section root" : `card "${region.getAttribute("data-card-id")}"`;
}

export function assertParity(
  sectionRoot: Element,
  entries: readonly SearchEntry[],
): ParityViolation[] {
  const root = sectionRoot;
  const violations: ParityViolation[] = [];
  const add = (kind: ParityViolationKind, detail: string) => violations.push({ kind, detail });

  const targets = elementsIn(root, `[${TARGET}]`);
  const targetsById = new Map<string, Element[]>();
  for (const t of targets) {
    const id = t.getAttribute(TARGET) ?? "";
    targetsById.set(id, [...(targetsById.get(id) ?? []), t]);
  }
  const entryCount = new Map<string, number>();
  for (const e of entries) entryCount.set(e.id, (entryCount.get(e.id) ?? 0) + 1);

  // ── Clause 1: ids ──
  // An entry is checked further only when it pairs with exactly one target and
  // no other entry claims the same id; anything else is already a clause-1
  // violation, and re-reporting it through clauses 2 and 3 would only add noise.
  const paired: { entry: SearchEntry; target: Element }[] = [];
  const reportedDuplicate = new Set<string>();
  for (const e of entries) {
    const found = targetsById.get(e.id) ?? [];
    if (found.length === 0) {
      add("entry-without-target", `entry "${e.id}" ("${e.value}") matches no rendered target`);
    } else if (found.length > 1) {
      if (!reportedDuplicate.has(e.id)) {
        add("duplicate-target", `entry "${e.id}" matches ${found.length} rendered targets`);
        reportedDuplicate.add(e.id);
      }
    } else if ((entryCount.get(e.id) ?? 0) > 1) {
      if (!reportedDuplicate.has(e.id)) {
        add("duplicate-entry", `${entryCount.get(e.id)} entries share the id "${e.id}"`);
        reportedDuplicate.add(e.id);
      }
    } else {
      paired.push({ entry: e, target: found[0] as Element });
    }
  }
  for (const t of targets) {
    const id = t.getAttribute(TARGET) ?? "";
    if (!entryCount.has(id)) {
      add("target-without-entry", `target "${id}" ("${ownText(t, root)}") has no entry`);
    }
    const outer = closestWithin(t.parentElement, `[${TARGET}]`, root);
    if (outer !== null) {
      add(
        "nested-target",
        `target "${id}" is nested inside target "${outer.getAttribute(TARGET)}"`,
      );
    }
  }

  const headings = elementsIn(root, `[${GROUP}]`).map((h) => ({
    el: h,
    text: ownText(h, root),
    region: regionOf(h, root),
  }));

  // ── Clause 2: nothing extra in the entry ──
  for (const { entry: e, target } of paired) {
    const own = ownText(target, root);
    const region = regionOf(target, root);
    if (!own.includes(ws(e.value))) {
      add(
        "value-not-in-target",
        `entry "${e.id}" value "${e.value}" is not in its target's text "${own}"`,
      );
    }
    if (e.label !== null && !own.includes(ws(e.label))) {
      add(
        "label-not-in-target",
        `entry "${e.id}" label "${e.label}" is not in its target's text "${own}"`,
      );
    }
    if (e.copy !== null && !own.includes(ws(e.copy.text))) {
      add(
        "copy-not-in-target",
        `entry "${e.id}" copy text "${e.copy.text}" is not in its target's text "${own}"`,
      );
    }
    const group = ws(e.group);
    const regionHeadings = headings.filter((h) => h.region === region);
    // An empty group is right exactly when the region has no group heading at all
    // (spec §2.3 clause 2: Today's bare Mode A key-times strip).
    const groupOk =
      group === "" ? regionHeadings.length === 0 : regionHeadings.some((h) => h.text === group);
    if (!groupOk) {
      add(
        "group-not-in-region",
        `entry "${e.id}" group "${e.group}" is not a group heading in ${describeRegion(region, root)}`,
      );
    }
    const where = regionText(region, root);
    for (const c of e.context) {
      if (!where.includes(ws(c))) {
        add(
          "context-not-in-region",
          `entry "${e.id}" context "${c}" is not in the text of ${describeRegion(region, root)}`,
        );
      }
    }
  }

  // ── Clause 3: nothing missing from the entry ──
  for (const { entry: e, target } of paired) {
    const fields = [e.label ?? "", e.value, ...e.context].map(ws);
    for (const piece of ownPieces(target, root)) {
      const text = ws(piece);
      if (text.length === 0) continue;
      if (!fields.some((f) => f.includes(text))) {
        add(
          "text-not-in-entry",
          `target "${e.id}" renders "${text}", which its entry does not carry`,
        );
      }
    }
  }

  // ── Clause 4: group headings are represented ──
  // Owed only by a heading whose region holds at least one target. A card that
  // renders only its title (Venue "Where" with only the Maps link; Show crew or
  // Key contacts whose every row hides itself) has no line to name it, and
  // clause 5 still holds the title itself to a group heading.
  const pairedRegions = paired.map(({ entry: e, target }) => ({
    group: ws(e.group),
    region: regionOf(target, root),
  }));
  const targetRegions = new Set(targets.map((t) => regionOf(t, root)));
  for (const h of headings) {
    if (!targetRegions.has(h.region)) continue;
    if (!pairedRegions.some((p) => p.region === h.region && p.group === h.text)) {
      add(
        "group-heading-unrepresented",
        `group heading "${h.text}" in ${describeRegion(h.region, root)} is the group of no entry there`,
      );
    }
  }

  // ── Clause 5: coverage ──
  for (const t of textNodes(root, root)) {
    const text = ws(t.data);
    if (text.length === 0) continue;
    if (closestWithin(t.parentElement, COVERING, root) === null) {
      add("uncovered-text", `"${text}" is not inside a target, a group heading or a skip subtree`);
    }
  }
  for (const { img, alt } of imageAlts(root, root)) {
    if (closestWithin(img, COVERING, root) === null) {
      add(
        "uncovered-alt",
        `image alt "${alt}" is not inside a target, a group heading or a skip subtree`,
      );
    }
  }

  return violations;
}
