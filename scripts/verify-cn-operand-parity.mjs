#!/usr/bin/env node
/**
 * verify-cn-operand-parity.mjs — mechanism 2 of the migration's equivalence proof.
 *
 * Spec:  docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §4.2, §4.3
 * Plan:  docs/superpowers/plans/2026-08-07-classname-array-join-cn.md, Task 3
 *
 * WHAT IT PROVES. That the 36-site migration is a PURE SYNTACTIC REWRITE: every operand,
 * in order, survives `[A, B, C].join(" ")` → `cn(A, B, C)`. Composed with the `cn` unit
 * test (`cn ≡ filter(Boolean).join(" ")`) and the operand-kind audit (every operand at an
 * unfiltered site is truthy), that gives "same operands ⇒ same emitted string" — which is
 * the only way a 36-site mechanical diff can be reviewed at all. It is the anti-tautology
 * mechanism for the migration: it catches a rewrite that drops, reorders, or edits an
 * operand, which is the one failure mode that looks correct in review.
 *
 * EXPECTED VALUES COME FROM THE PRE-MIGRATION SOURCE, NEVER FROM A LITERAL. Each of the
 * 18 files is read at `--base` via `git show <sha>:<path>`.
 *
 * `--base` IS REQUIRED, AND IT IS THE MIGRATION COMMIT'S PARENT. Two failure modes
 * bracket the correct value, which is why there is no default:
 *
 *   - Re-resolving HEAD at a later invocation reads the already-migrated tree, finds zero
 *     array joins, and would pass vacuously.
 *   - The original branch base is wrong once the branch has been rebased, which it always
 *     will have been: `fix/step3-a11y-cluster` edits one of these 18 files concurrently.
 *     If upstream changed an operand from A to B and the migration accidentally restored
 *     A, comparing against the stale base sees A → A and passes, while stage 1 in fact
 *     changed output relative to its real parent. Neither the `cn` unit test nor the
 *     DayCard test covers that site.
 *
 * The recorded literal is valid only for the history it was captured in. Once the
 * migration commit exists the anchor is definitionally `<migration-sha>~1` — and any
 * later rebase rewrites BOTH, so after every rebase the anchor is re-resolved and this
 * script re-run (plan C4 step 4.2).
 *
 * WHY A SCRIPT AND NOT A TRACKED TEST (spec §4.3). As a vitest file it could not resolve
 * its own baseline — the unit workflow checks out at depth 1 and fetches only one pinned
 * object — and it would permanently freeze the class lists of all 18 files against a
 * closed migration's C1–C6 allowlist. It ships unwired, and is retained after merge only
 * because plan C4 step 4 re-runs it after the final rebase.
 *
 * Exit 0: parity holds at all 36 sites. Exit 1: a finding. Exit 2: usage error.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { collectSites, lineOf, operandText, parseSource } from "./lib/cnSites.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The 18 className files and their site counts (spec §2.2). */
const SITE_FILES = [
  ["components/admin/OnboardingWizard.tsx", 4],
  ["components/admin/PublishedToggle.tsx", 2],
  ["components/admin/settings/AutoPublishToggle.tsx", 2],
  ["components/admin/settings/DeveloperToggleButton.tsx", 2],
  ["components/admin/settings/NotifyToggle.tsx", 2],
  ["components/admin/wizard/Step3SheetCard.tsx", 1],
  ["components/atoms/Avatar.tsx", 1],
  ["components/atoms/KeyValue.tsx", 1],
  ["components/atoms/Section.tsx", 1],
  ["components/crew/RightNowHero.tsx", 3],
  ["components/crew/SectionChipLink.tsx", 1],
  ["components/crew/primitives/DayCard.tsx", 3],
  ["components/crew/primitives/PersonRow.tsx", 6],
  ["components/crew/sections/GearSection.tsx", 2],
  ["components/crew/sections/TodaySection.tsx", 2],
  ["components/crew/sections/TravelSection.tsx", 1],
  ["components/shared/AccentButton.tsx", 1],
  ["app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", 1],
];

const EXPECTED_SITE_TOTAL = 36;

/**
 * The 6 `.filter(Boolean)` sites (spec §2.2), by 0-based index in source order per file.
 *
 * Parity compared FORM and OPERANDS only, which left the base side's FILTER SEMANTICS
 * unchecked: if upstream removed a `.filter(Boolean)` (or swapped its predicate) before the
 * final rebase, the base site and the migrated `cn(...)` still had identical operands, so
 * parity passed while `join` and `cn` emitted different strings. The base's filter state is
 * now reconciled against this declaration at all six sites.
 */
const FILTERED_SITES = {
  "components/atoms/KeyValue.tsx": [0],
  "components/crew/sections/GearSection.tsx": [0],
  "components/crew/sections/TodaySection.tsx": [0, 1],
  "components/crew/sections/TravelSection.tsx": [0],
  "components/shared/AccentButton.tsx": [0],
};

/**
 * The declared stage-2 deltas — spec §6, C1–C6. `eslint --fix` DELIBERATELY changes these
 * class tokens, so a difference here is permitted; a token change anywhere else is a
 * finding, not a fix.
 *
 * On the Task 3 run this map is inert (nothing has been canonicalized yet). It earns its
 * keep when the script re-runs in Task 6 and at C4 step 4.2, where it is the only thing
 * separating "the six declared canonicalizations" from "an undeclared rewrite".
 */
const EXPECTED_TOKEN_DELTAS = [
  {
    id: "C1",
    file: "components/admin/OnboardingWizard.tsx",
    before: "max-w-[60px]",
    after: "max-w-confirm-box",
  },
  { id: "C2", file: "components/admin/PublishedToggle.tsx", before: "h-5 w-5", after: "size-5" },
  {
    id: "C3",
    file: "components/admin/settings/AutoPublishToggle.tsx",
    before: "h-5 w-5",
    after: "size-5",
  },
  {
    id: "C4",
    file: "components/admin/settings/NotifyToggle.tsx",
    before: "h-5 w-5",
    after: "size-5",
  },
  {
    id: "C5",
    file: "components/crew/RightNowHero.tsx",
    before: "min-h-(--spacing-right-now-min-h)",
    after: "min-h-right-now-min-h",
  },
  {
    id: "C6",
    file: "components/crew/sections/TodaySection.tsx",
    before: "text-sm leading-snug",
    after: "text-sm/snug",
  },
];

/**
 * The rendered initializer of `name`'s sole `const` declaration in a parsed file, or null.
 *
 * Operands that are IDENTIFIERS were compared by SPELLING alone, so `const base = "class-a"`
 * at the base and `const base = "class-b"` at the head produced identical operand lists and
 * identical truthiness verdicts while the rendered class changed. The parity claim is about
 * emitted strings, so an identifier's VALUE has to travel with its name.
 */
function identifierInitializer(sourceFile, name) {
  let rendered = null;
  let seen = 0;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined
    ) {
      seen += 1;
      rendered = renderInitializer(node.initializer, sourceFile);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return seen === 1 ? rendered : null;
}

/**
 * Render an initializer FORM-INDEPENDENTLY when it is itself a class-list expression.
 *
 * Some of the seven identifiers (`CHIP_CLASS`) are themselves among the 36 migrated sites,
 * so their initializer legitimately changes shape — `[...].join(" ")` at the base, `cn(...)`
 * at the head. Comparing raw renderings flagged that as drift. Comparing the OPERAND LIST
 * compares what the initializer emits, which is the claim, and still catches a changed
 * token inside it.
 */
function renderInitializer(node, sourceFile) {
  const asSite = collectSites(sourceFile).find((site) => site.node === node);
  if (asSite !== undefined) {
    return `LIST(${asSite.operands.map((o) => operandText(o, sourceFile)).join(", ")})`;
  }
  return operandText(node, sourceFile);
}

function gitShow(sha, relPath) {
  return execFileSync("git", ["show", `${sha}:${relPath}`], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
}

/** Apply the declared C1–C6 deltas for a file, reporting which fired. */
/**
 * Apply the declared C1–C6 deltas for a file, reporting which fired and which were
 * REFUSED.
 *
 * Unrestricted `split().join()` was too permissive in two independent ways: it rewrote
 * EVERY occurrence (so a delta could silently license two token changes where spec §6
 * declares one), and it matched inside larger tokens (so `h-5 w-5` would fire inside
 * `min-h-5 w-50`). A declared delta now fires only when it occurs EXACTLY ONCE and at
 * class-token boundaries; anything else is refused and surfaces as an undeclared change.
 */
/**
 * Apply declared deltas to a rendered operand, NEVER inside a conditional's discriminator.
 *
 * `operandText` renders a conditional as `<cond> ? <a> : <b>`, possibly nested. Applying
 * deltas to the whole rendering let a C-entry authorize a rewrite inside a DISCRIMINATOR —
 * C2 turning `mode === "foo h-5 w-5 bar"` into `mode === "foo size-5 bar"` selects a
 * DIFFERENT branch for the old input, while parity reported exactly the declared set. Spec
 * §6 declares rewrites of emitted CLASS STRINGS; a condition is not one.
 *
 * The rendering is split on TOP-LEVEL ` ? ` and ` : ` (quote- and bracket-aware). A segment
 * immediately followed by ` ? ` is a condition and is passed through untouched; every other
 * segment is a result and is eligible.
 */
function applyDeclaredDeltas(text, relPath) {
  const parts = splitConditionalSegments(text);
  if (parts === null) return applyDeclaredDeltasFlat(text, relPath);

  const fired = [];
  const refused = [];
  let out = "";
  for (const part of parts) {
    if (part.kind === "separator" || part.kind === "condition") {
      out += part.text;
      continue;
    }
    const applied = applyDeclaredDeltasFlat(part.text, relPath);
    out += applied.text;
    fired.push(...applied.fired);
    refused.push(...applied.refused);
  }
  return { text: out, fired, refused };
}

/**
 * Segment a rendering into conditions, results, and the ` ? ` / ` : ` separators between
 * them. Returns null when the rendering holds no top-level conditional.
 */
function splitConditionalSegments(rendering) {
  const seps = [];
  let depth = 0;
  for (let i = 0; i < rendering.length; i += 1) {
    const ch = rendering[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === '"') {
      i += 1;
      while (i < rendering.length && rendering[i] !== '"') i += rendering[i] === "\\" ? 2 : 1;
    } else if (depth === 0 && (ch === "?" || ch === ":")) {
      if (rendering[i - 1] === " " && rendering[i + 1] === " ") seps.push({ at: i, ch });
    }
  }
  if (seps.length === 0) return null;

  const parts = [];
  let cursor = 0;
  for (const sep of seps) {
    const text = rendering.slice(cursor, sep.at - 1);
    // A segment immediately followed by `?` is the discriminator of that conditional.
    parts.push({ kind: sep.ch === "?" ? "condition" : "result", text });
    parts.push({ kind: "separator", text: ` ${sep.ch} ` });
    cursor = sep.at + 2;
  }
  parts.push({ kind: "result", text: rendering.slice(cursor) });
  return parts;
}

function applyDeclaredDeltasFlat(text, relPath) {
  let out = text;
  const fired = [];
  const refused = [];
  for (const delta of EXPECTED_TOKEN_DELTAS) {
    if (delta.file !== relPath) continue;
    const applied = applyOneDelta(out, delta);
    if (applied.hits === 0) continue;
    if (applied.hits > 1) {
      refused.push(`${delta.id}: ${applied.hits} occurrences, spec §6 declares exactly one`);
      continue;
    }
    out = applied.text;
    fired.push(delta.id);
  }
  return { text: out, fired, refused };
}

/**
 * Apply one declared delta INSIDE THE STRING VALUE, at class-token boundaries.
 *
 * `operandText` renders a string literal as its JSON encoding, so the rendering's own
 * delimiting quotes are not part of the class list. Treating any quote as a boundary
 * therefore licensed a match embedded in the VALUE — `prefix'h-5 w-5'suffix` read as the
 * declared rewrite for every one of C1-C6. Decoding first makes "boundary" mean what it
 * means in a class attribute: whitespace, or the edge of the value.
 */
function applyOneDelta(rendering, delta) {
  const isQuoted = rendering.length >= 2 && rendering.startsWith('"') && rendering.endsWith('"');
  let value = rendering;
  if (isQuoted) {
    try {
      value = JSON.parse(rendering);
    } catch {
      value = rendering;
    }
  }
  const hits = boundedOccurrences(value, delta.before);
  if (hits.length !== 1) return { text: rendering, hits: hits.length };
  const at = hits[0];
  const next = value.slice(0, at) + delta.after + value.slice(at + delta.before.length);
  return { text: isQuoted ? JSON.stringify(next) : next, hits: 1 };
}

/** Offsets where `needle` sits at class-token boundaries: whitespace, or the value's edge. */
function boundedOccurrences(haystack, needle) {
  const isBoundary = (ch) => ch === undefined || /\s/.test(ch);
  const out = [];
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return out;
    if (isBoundary(haystack[i - 1]) && isBoundary(haystack[i + needle.length])) out.push(i);
    from = i + 1;
  }
}

/**
 * Is `base` really the parent of the migration commit on THIS history?
 * Returns null when it is, or a one-line reason when it is not.
 *
 * `--base` REQUIRED was never enough: a stale pre-rebase SHA is syntactically valid and
 * passed silently, which is the exact failure this file's header claims to prevent.
 */
function checkAnchorIdentity(base) {
  const git = (args) =>
    execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"], { cwd: REPO_ROOT });
  } catch {
    return "it is not an ancestor of HEAD — it names a commit from a rewritten history.";
  }
  const log = git(["log", "--format=%H%x09%s", "HEAD"]).split("\n").filter(Boolean);
  const migration = log.find((l) =>
    l.split("\t")[1].startsWith("refactor(ui): migrate array-join classNames"),
  );
  if (migration === undefined) {
    return "no commit on HEAD has the migration subject, so the anchor cannot be verified.";
  }
  const sha = migration.split("\t")[0];
  const parent = git(["rev-parse", `${sha}~1`]).trim();
  if (parent !== base) {
    return `the migration commit is ${sha.slice(0, 12)}, whose parent is ${parent.slice(0, 12)}.`;
  }
  return null;
}

function main(argv) {
  const args = argv.slice(2);
  let base = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--base") {
      base = args[i + 1];
      i += 1;
    } else if (args[i].startsWith("--base=")) {
      base = args[i].slice("--base=".length);
    } else {
      console.error(`unknown argument: ${args[i]}`);
      console.error(
        "usage: node scripts/verify-cn-operand-parity.mjs --base <migration-parent-sha>",
      );
      return 2;
    }
  }
  if (!base) {
    console.error("usage: node scripts/verify-cn-operand-parity.mjs --base <migration-parent-sha>");
    console.error(
      "--base is REQUIRED and is the MIGRATION COMMIT'S PARENT — not HEAD (which reads the\n" +
        "already-migrated tree and passes vacuously) and not the pre-rebase branch base (which\n" +
        "is stale the moment the branch is rebased). See this file's header.",
    );
    return 2;
  }

  let resolvedBase;
  try {
    resolvedBase = execFileSync("git", ["rev-parse", "--verify", `${base}^{commit}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    console.error(`--base ${base} does not resolve to a commit in this repository.`);
    return 2;
  }

  // `--base` REQUIRED was never enough: a stale, pre-rebase SHA is syntactically valid and
  // silently passed, which is the exact failure this file's header claims to prevent. The
  // anchor's IDENTITY is now checked — it must be an ancestor of HEAD, and it must be the
  // parent of the commit that actually performed the migration.
  const identity = checkAnchorIdentity(resolvedBase);
  if (identity !== null) {
    console.error(`--base ${resolvedBase} is not the current migration parent.`);
    console.error(`  ${identity}`);
    console.error(
      "Re-resolve it: find the commit whose subject starts\n" +
        '  "refactor(ui): migrate array-join classNames"\n' +
        "and pass its `~1`. Any rebase rewrites BOTH that commit and its parent.",
    );
    return 2;
  }

  const findings = [];
  const firedDeltas = new Set();
  /** How many times each declared delta fired across ALL operands of its file. */
  const deltaFireCount = new Map();
  let baseSiteTotal = 0;
  let headSiteTotal = 0;
  let comparedSites = 0;

  console.log("cn operand-parity verification");
  console.log(`  base (migration parent) ..... ${resolvedBase}`);
  console.log(`  working tree ................ ${REPO_ROOT}`);
  console.log("");

  for (const [rel, expectedCount] of SITE_FILES) {
    let baseText;
    try {
      baseText = gitShow(resolvedBase, rel);
    } catch {
      findings.push(`${rel}: not present at base ${resolvedBase} — spec §2.2's inventory is stale`);
      continue;
    }
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      findings.push(`${rel}: missing from the working tree`);
      continue;
    }
    const headText = fs.readFileSync(abs, "utf8");

    const baseFile = parseSource(rel, baseText);
    const headFile = parseSource(rel, headText);
    const baseSites = collectSites(baseFile);
    const headSites = collectSites(headFile);
    baseSiteTotal += baseSites.length;
    headSiteTotal += headSites.length;

    if (baseSites.length !== expectedCount) {
      findings.push(
        `${rel}: base holds ${baseSites.length} sites, spec §2.2 declares ${expectedCount}`,
      );
    }
    if (headSites.length !== baseSites.length) {
      findings.push(
        `${rel}: site count changed across the migration — base ${baseSites.length}, head ${headSites.length}. ` +
          "A migration that adds or drops a site is not a syntactic rewrite.",
      );
      continue;
    }

    baseSites.forEach((baseSite, index) => {
      const headSite = headSites[index];
      const where = `${rel}:${lineOf(headFile, headSite.node)}`;
      comparedSites += 1;

      const declaredFiltered = (FILTERED_SITES[rel] ?? []).includes(index);
      // `cn` joins with exactly one ASCII space. A base joined with "  ", "\t" or "\n" has
      // an identical form and identical operands and a DIFFERENT rendered string, so form
      // and operands alone cannot see it.
      if (baseSite.separatorText !== undefined && baseSite.separatorText !== " ") {
        findings.push(
          `${where}: the BASE separator is ${JSON.stringify(baseSite.separatorText)}, not a single ` +
            'ASCII space. `cn` always emits " ", so this site\'s migration changes the rendered string.',
        );
        return;
      }
      if (baseSite.hasForeignFilter) {
        findings.push(
          `${where}: the BASE site is filtered by something other than \`.filter(Boolean)\`. ` +
            "`cn` reproduces `filter(Boolean)` and nothing else, so this site's migration is " +
            "not operand-equivalent however well the operands match.",
        );
        return;
      }
      if (baseSite.hasFilterMarker !== declaredFiltered) {
        findings.push(
          `${where}: base filter semantics moved — site ${index} ` +
            (baseSite.hasFilterMarker
              ? "carries .filter(Boolean) but is not declared filtered"
              : "is declared filtered but carries no .filter(Boolean)") +
            '. Operands alone cannot see this: `[a, "", b].join(" ")` and ' +
            '`[a, "", b].filter(Boolean).join(" ")` share an operand list and emit different strings.',
        );
        return;
      }
      if (baseSite.form !== "array-join") {
        findings.push(
          `${rel} site ${index}: base form is ${baseSite.form}, expected array-join — ` +
            "the --base sha does not name a pre-migration commit.",
        );
        return;
      }
      if (headSite.form !== "cn-call") {
        findings.push(
          `${where}: head form is ${headSite.form}, expected cn-call — this site was not migrated.`,
        );
        return;
      }

      const baseOperands = baseSite.operands.map((o) => operandText(o, baseFile));
      const headOperands = headSite.operands.map((o) => operandText(o, headFile));

      if (baseOperands.length !== headOperands.length) {
        findings.push(
          `${where}: operand count changed — base ${baseOperands.length}, head ${headOperands.length}\n` +
            `      base: [${baseOperands.join(" | ")}]\n` +
            `      head: [${headOperands.join(" | ")}]`,
        );
        return;
      }

      baseOperands.forEach((baseOperand, opIndex) => {
        const headOperand = headOperands[opIndex];
        if (baseOperand === headOperand) {
          // Same SPELLING is not the same VALUE. For an identifier operand, compare the
          // definition it resolves to on each side; a changed initializer is a changed
          // rendered class that the operand list alone cannot see.
          const bareIdentifier = /^[A-Za-z_$][\w$]*$/.test(baseOperand);
          if (bareIdentifier) {
            const baseInit = identifierInitializer(baseFile, baseOperand);
            const headInit = identifierInitializer(headFile, headOperand);
            if (baseInit !== null && headInit !== null) {
              const { text: canonicalInit, refused: initRefused } = applyDeclaredDeltas(
                baseInit,
                rel,
              );
              if (canonicalInit !== headInit || initRefused.length > 0) {
                findings.push(
                  `${where}: identifier operand \`${baseOperand}\` has the same name but a ` +
                    "DIFFERENT definition across the migration\n" +
                    `      base: ${baseInit}\n` +
                    `      head: ${headInit}`,
                );
              }
            }
          }
          return;
        }

        const { text: canonicalized, fired, refused } = applyDeclaredDeltas(baseOperand, rel);
        if (canonicalized === headOperand && refused.length === 0) {
          fired.forEach((id) => {
            firedDeltas.add(id);
            deltaFireCount.set(id, (deltaFireCount.get(id) ?? 0) + 1);
          });
          return;
        }
        findings.push(
          `${where}: operand ${opIndex} changed, and the change is NOT one spec §6 declares\n` +
            `      base: ${baseOperand}\n` +
            `      head: ${headOperand}` +
            (fired.length > 0
              ? `\n      (declared deltas ${fired.join(", ")} applied and it still differs)`
              : "") +
            (refused.length > 0 ? `\n      REFUSED: ${refused.join("; ")}` : ""),
        );
      });
    });
  }

  // Spec §6 declares ONE rewrite per C-entry. Per-operand multiplicity was already refused,
  // but the same delta firing once in each of several operands of its file collapsed into a
  // single reported ID — so an ADDITIONAL undeclared rewrite read as exactly the declared
  // set. Multiplicity is therefore also checked per declared entry, across the whole file.
  for (const [id, count] of deltaFireCount) {
    if (count > 1) {
      findings.push(
        `declared delta ${id} fired ${count} times across its file; spec §6 declares exactly one ` +
          "rewrite per entry, so the extra occurrence is an undeclared token change.",
      );
    }
  }

  // The premise, stated executably and unconditionally — never inside a per-site
  // callback, whose iteration count can be zero. Without it, an extractor that silently
  // found no sites would report "all sites match" while comparing nothing.
  if (baseSiteTotal !== EXPECTED_SITE_TOTAL) {
    findings.unshift(
      `premise: base-commit extraction found ${baseSiteTotal} array-join sites, expected ${EXPECTED_SITE_TOTAL}. ` +
        "Every parity result below is meaningless until this is resolved (spec §2.2).",
    );
  }

  console.log(`  sites at base ............... ${baseSiteTotal} (expected ${EXPECTED_SITE_TOTAL})`);
  console.log(`  sites at head ............... ${headSiteTotal}`);
  console.log(`  sites compared .............. ${comparedSites}`);
  console.log(
    `  declared §6 deltas applied .. ${firedDeltas.size > 0 ? [...firedDeltas].sort().join(", ") : "none"}`,
  );

  if (findings.length > 0) {
    console.error(`\nFAIL — ${findings.length} finding(s):`);
    findings.forEach((f) => console.error(`  ${f}`));
    return 1;
  }

  console.log("\nOK — every operand at all 36 sites is preserved in order, with only the");
  console.log("declared spec §6 token deltas differing.");
  return 0;
}

process.exit(main(process.argv));
