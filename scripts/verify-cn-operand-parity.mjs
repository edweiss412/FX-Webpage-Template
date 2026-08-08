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
  { id: "C4", file: "components/admin/settings/NotifyToggle.tsx", before: "h-5 w-5", after: "size-5" },
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

function gitShow(sha, relPath) {
  return execFileSync("git", ["show", `${sha}:${relPath}`], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
}

/** Apply the declared C1–C6 deltas for a file, reporting which fired. */
function applyDeclaredDeltas(text, relPath) {
  let out = text;
  const fired = [];
  for (const delta of EXPECTED_TOKEN_DELTAS) {
    if (delta.file !== relPath) continue;
    if (!out.includes(delta.before)) continue;
    out = out.split(delta.before).join(delta.after);
    fired.push(delta.id);
  }
  return { text: out, fired };
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
      console.error("usage: node scripts/verify-cn-operand-parity.mjs --base <migration-parent-sha>");
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

  const findings = [];
  const firedDeltas = new Set();
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
        if (baseOperand === headOperand) return;

        const { text: canonicalized, fired } = applyDeclaredDeltas(baseOperand, rel);
        if (canonicalized === headOperand) {
          fired.forEach((id) => firedDeltas.add(id));
          return;
        }
        findings.push(
          `${where}: operand ${opIndex} changed, and the change is NOT one spec §6 declares\n` +
            `      base: ${baseOperand}\n` +
            `      head: ${headOperand}` +
            (fired.length > 0
              ? `\n      (declared deltas ${fired.join(", ")} applied and it still differs)`
              : ""),
        );
      });
    });
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
