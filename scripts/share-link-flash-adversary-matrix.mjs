/**
 * scripts/share-link-flash-adversary-matrix.mjs
 *
 * Executable adversary matrix for the share-link cue (spec
 * 2026-07-24-share-link-chrome-backlog-design §9.0/§9.1.1, plan Task 6).
 *
 * Eight spec review rounds established that prose cannot settle "does this
 * assertion fail against that implementation?" — the claim was wrong four
 * rounds running, twice because a repair narrowed what an earlier repair had
 * widened. So the suite's teeth are demonstrated by execution rather than
 * argued: for each registered adversary, BUILD it, run the cue suite, record
 * which rows red.
 *
 *   node scripts/share-link-flash-adversary-matrix.mjs [--quick] [--only A5,A9]
 *
 * `--quick` skips the browser spec (Playwright), which roughly halves runtime
 * and is appropriate while iterating; the recorded matrix must be produced
 * WITHOUT it, since several adversaries are only observable in a real engine.
 *
 * Rules the run enforces, from the spec:
 *   - every adversary must red at least one row;
 *   - a row that reds for no adversary is vacuous and must be strengthened or
 *     deleted (reported here, judged by a human).
 *
 * Mutations are applied to a COMMITTED tree and reverted with `git checkout --`.
 * Running this against uncommitted work would discard it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HUB = "components/admin/showpage/ShareHub.tsx";
const CSS = "app/globals.css";
const CTX = "app/admin/show/[slug]/ShareTokenContext.tsx";

const VITEST_SUITES = [
  "tests/components/admin/showpage/shareHubFlashState.test.tsx",
  "tests/components/admin/showpage/shareHubFlashTransitions.test.ts",
  "tests/components/shareTokenRotateSurface.test.tsx",
  "tests/styles/status-token-contrast.test.ts",
];

const argv = process.argv.slice(2);

const USAGE = `share-link cue adversary matrix

  node scripts/share-link-flash-adversary-matrix.mjs [--quick] [--only A5,A9]

  --quick        skip the browser spec (Playwright). Faster while iterating, but
                 several adversaries are only observable in a real engine, so the
                 RECORDED matrix must be produced without it.
  --only IDS     comma-separated adversary ids, e.g. --only A5,A9
  -h, --help     this text

  MUTATES TRACKED FILES and restores them. Refuses to start against dirty targets
  or while another run holds the lock.`;

// An unrecognised flag must NOT fall through into a mutating run. A peer session
// ran this with `--help` to inspect its CLI surface and it silently began
// executing instead — the worst possible response to "what does this do?".
const KNOWN = new Set(["--quick", "--only", "-h", "--help"]);
const unknown = argv.filter(
  (a, i) => a.startsWith("-") && !KNOWN.has(a) && argv[i - 1] !== "--only",
);
if (argv.includes("-h") || argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
if (unknown.length) {
  console.error(`unknown flag(s): ${unknown.join(", ")}\n\n${USAGE}`);
  process.exit(2);
}

const QUICK = argv.includes("--quick");
const ONLY = (() => {
  const i = argv.indexOf("--only");
  return i === -1 ? null : new Set(argv[i + 1].split(","));
})();

/** A mutation is a list of [file, find, replace]. All must apply or the
 *  adversary is reported UNAPPLIED rather than silently passing. */
const ADVERSARIES = [
  [
    "A1",
    "never sets the attribute",
    [[HUB, `{...(flash !== null ? { "data-share-link-flash": "" } : {})}`, ``]],
  ],
  [
    "A2",
    "sets it, never clears it",
    [
      [
        HUB,
        "const t = setTimeout(() => setFlash(null), SHARE_LINK_FLASH_MS);",
        "const t = setTimeout(() => {}, SHARE_LINK_FLASH_MS);",
      ],
    ],
  ],
  [
    "A3",
    "clears on a duration other than the constant",
    [
      [
        HUB,
        "setTimeout(() => setFlash(null), SHARE_LINK_FLASH_MS)",
        "setTimeout(() => setFlash(null), 1000)",
      ],
    ],
  ],
  [
    "A4",
    "sets it unconditionally on mount",
    [
      [
        HUB,
        "const [flash, setFlash] = useState<number | null>(null);",
        "const [flash, setFlash] = useState<number | null>(1);",
      ],
    ],
  ],
  [
    "A5",
    "bumps on ANY token change, nulls included",
    [
      [
        HUB,
        "setFlash((n) => (prevToken !== null && token !== null ? (n ?? 0) + 1 : null));",
        "setFlash((n) => (n ?? 0) + 1);",
      ],
    ],
  ],
  [
    "A6",
    "clears on !open alone",
    [
      [
        HUB,
        "if ((!open || !linkActive) && flash !== null) setFlash(null);",
        "if (!open && flash !== null) setFlash(null);",
      ],
    ],
  ],
  [
    "A7",
    "clears on token-nullity alone",
    [
      [
        HUB,
        "if ((!open || !linkActive) && flash !== null) setFlash(null);",
        "if ((!open || token === null) && flash !== null) setFlash(null);",
      ],
    ],
  ],
  // Expressed through the GATE, not through ShareHub. The cue is derived from
  // `token`, so "fires on the rotate event rather than on the token changing"
  // cannot be written as a one-line edit in the component — it is a claim about
  // which rotations reach the token at all. Loosening the monotonic gate to
  // accept a strictly LOWER epoch makes a rejected rotation change the token and
  // therefore cue, which is precisely the defect.
  //
  // The first expression mutated a condition that could never be true, and then
  // smuggled A5's mutation in alongside it — so it was a no-op mutant that got
  // credit for A5's rejection. Both faults are the same one: a mutation whose
  // effect was never verified.
  [
    "A8",
    "cues for a rotation the epoch gate rejected",
    [
      [
        CTX,
        "(token: string, epoch: number) => setState((p) => (epoch >= p.epoch ? { token, epoch } : p)),",
        "(token: string, epoch: number) => setState(() => ({ token, epoch })),",
      ],
    ],
  ],
  ["A9", "omits key entirely", [[HUB, "          key={token}\n", ""]]],
  ["A10", "uses key={flash}", [[HUB, "          key={token}\n", "          key={flash}\n"]]],
  [
    "A11",
    "boolean instead of a nonce",
    [
      [
        HUB,
        "setFlash((n) => (prevToken !== null && token !== null ? (n ?? 0) + 1 : null));",
        "setFlash(prevToken !== null && token !== null ? 1 : null);",
      ],
    ],
  ],
  ["A12", "omits the effect cleanup", [[HUB, "return () => clearTimeout(t);", "return;"]]],
  [
    "A13",
    "empty keyframe bodies",
    [
      [
        CSS,
        "  0%,\n  45% {\n    background-color: var(--color-accent-tint);\n  }\n  100% {\n    background-color: var(--color-surface-sunken);\n  }",
        "  0% {\n    opacity: 1;\n  }",
      ],
    ],
  ],
  [
    "A14",
    "CSS duration drifts from the constant",
    [[CSS, "share-link-flash-bg 1600ms ease-out", "share-link-flash-bg 900ms ease-out"]],
  ],
  [
    "A15",
    "no reduced-motion override",
    [
      [
        CSS,
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
        "",
      ],
    ],
  ],
  [
    "A16",
    "override present but outranked by a later rule",
    [
      [CSS, "[data-share-link-flash] {\n  animation:", "[data-share-link-flash] {\n  animation:"],
      [
        CSS,
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n[data-share-link-flash] {\n  animation:\n    share-link-flash-bg 1600ms ease-out,\n    share-link-flash-ring 1600ms ease-out !important;\n}",
      ],
    ],
  ],
  [
    "A17",
    "later duplicate keyframes win the cascade",
    [
      [
        CSS,
        "[data-share-link-flash] {\n  animation:",
        "@keyframes share-link-flash-bg {\n  0% {\n    background-color: transparent;\n  }\n}\n[data-share-link-flash] {\n  animation:",
      ],
    ],
  ],
  [
    "A18",
    "ancestor-qualified rule suppresses it in the real tree",
    [
      [
        CSS,
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n[data-review-modal-panel] [data-share-link-flash] {\n  animation: none;\n}",
      ],
    ],
  ],
  [
    "A19",
    "ring suppressed while the wash still works",
    [
      [
        CSS,
        "    share-link-flash-ring 1600ms ease-out;",
        "    share-link-flash-ring 0ms ease-out;",
      ],
    ],
  ],
  [
    "A20",
    "keyframes moved into the component",
    [
      [
        HUB,
        "export const SHARE_LINK_FLASH_MS = 1600;",
        "export const SHARE_LINK_FLASH_MS = 1600;\n// @keyframes share-link-flash-bg { from { opacity: 1 } }",
      ],
    ],
  ],
  [
    "A23",
    "attribute on the wrapper row, not the code block",
    [
      [
        HUB,
        `data-testid="admin-current-share-link-row"`,
        `data-testid="admin-current-share-link-row"\n                        {...(flash !== null ? { "data-share-link-flash": "" } : {})}`,
      ],
    ],
  ],
  [
    "A24",
    "drops the !open arm",
    [
      [
        HUB,
        "if ((!open || !linkActive) && flash !== null) setFlash(null);",
        "if (!linkActive && flash !== null) setFlash(null);",
      ],
    ],
  ],
  [
    "A25",
    "constant AND CSS moved together",
    [
      [HUB, "export const SHARE_LINK_FLASH_MS = 1600;", "export const SHARE_LINK_FLASH_MS = 2400;"],
      [
        CSS,
        "share-link-flash-bg 1600ms ease-out,\n    share-link-flash-ring 1600ms ease-out;",
        "share-link-flash-bg 2400ms ease-out,\n    share-link-flash-ring 2400ms ease-out;",
      ],
    ],
  ],
  [
    "A26",
    "hold stop and ring width altered, colours kept",
    [
      [
        CSS,
        "  0%,\n  45% {\n    background-color: var(--color-accent-tint);",
        "  0%,\n  5% {\n    background-color: var(--color-accent-tint);",
      ],
      [
        CSS,
        "box-shadow: 0 0 0 2px var(--color-accent-edge);",
        "box-shadow: 0 0 0 1px var(--color-accent-edge);",
      ],
    ],
  ],
  [
    "A27",
    "steady wash under reduced motion",
    [
      [
        CSS,
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
        "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n    background-color: var(--color-accent-tint);\n  }\n}",
      ],
    ],
  ],
];

/** A22 is a token retune. It lives in the contrast pins and was already proved
 *  non-vacuous by hand during Task 4; included here so the register is complete. */
/**
 * A28 exists because round-2 review argued a rule scoped to the shell's own
 * subheader would kill the production cue while a synthetic panel stayed green.
 * Running it settled the question differently: a SUBHEADER-scoped selector
 * cannot match the cue in production either, because the popover PORTALS out of
 * the subheader into the panel (PopoverHostContext). The reviewer's specific
 * example was unreachable — and the portal escaping subtree-scoped rules is a
 * property of the design, not an accident.
 *
 * What IS reachable is a rule scoped to a real ancestor the portal lands under.
 * The panel is A18; this is the modal ROOT above it, which the synthetic harness
 * never had at all. That is the honest version of the finding, and it is the one
 * the rebuilt real-shell harness can now catch.
 */
ADVERSARIES.push([
  "A28",
  "ancestor rule scoped to the real modal ROOT suppresses the cue",
  [
    [
      CSS,
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
      '@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n[data-testid="published-show-review-modal"] [data-share-link-flash] {\n  animation: none;\n}',
    ],
  ],
]);

ADVERSARIES.push([
  "A22",
  "token retuned below the ring's contrast floor",
  [[CSS, "--color-accent-edge-runtime: #ffa047;", "--color-accent-edge-runtime: #33261a;", true]],
]);

/** A21 is not a mutation of the cue at all — it is a wrong token rendered or a
 *  stale clipboard payload, rejected by the preserved exact-value assertions in
 *  the reworked integration test. Mutating the URL derivation exercises it. */
ADVERSARIES.push([
  "A21",
  "renders a wrong token / Copy writes a stale one",
  [
    [
      HUB,
      "const url = token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;",
      "const url = token != null ? `${resolveOrigin()}/show/${slug}/${token}x` : null;",
    ],
  ],
]);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

const TARGETS = [HUB, CSS, CTX];

/**
 * Refuse to run against dirty targets, and restore them no matter how the run
 * ends.
 *
 * This script writes directly into tracked files and restores with
 * `git checkout --`, which DISCARDS uncommitted work in exactly those files. A
 * run started on a dirty tree would silently destroy the edits it was meant to
 * be testing, and an interrupt between mutate and restore would leave the branch
 * holding a mutant (round-1 whole-diff review).
 */
/**
 * A lock, because the clean-tree guard alone is not enough.
 *
 * The guard checks state at START. Two runs that both start clean then interleave
 * their mutate/restore cycles, and one strands a mutant in the other's window —
 * observed for real when a second session was asked to run this concurrently on
 * the same worktree. A script that writes to tracked files is single-writer by
 * construction; say so mechanically rather than in a comment nobody reads.
 */
const LOCK = join(ROOT, "tmp", ".adversary-matrix.lock");

function acquireLock() {
  try {
    writeFileSync(LOCK, `${process.pid}\n`, { flag: "wx" });
  } catch {
    console.error(
      `refusing to run: ${LOCK} exists, so another matrix run holds this worktree.\n` +
        "This script mutates tracked files; two concurrent runs strand mutants in\n" +
        "each other's windows. Wait for it, or delete the lock if it is stale.",
    );
    process.exit(2);
  }
}

function releaseLock() {
  try {
    rmSync(LOCK, { force: true });
  } catch {
    /* best effort */
  }
}

function assertCleanTargets() {
  const dirty = git("status", "--porcelain", "--", ...TARGETS).trim();
  if (dirty) {
    console.error(
      "refusing to run: mutation targets have uncommitted changes, which this " +
        "script would discard on restore.\n" +
        dirty +
        "\n\nCommit or stash them first.",
    );
    process.exit(2);
  }
}

/**
 * Restore, and make a FAILED restore fatal and loud.
 *
 * Swallowing the error let the run keep recording results with a mutant still
 * applied, and left the branch holding it afterwards — the same
 * work-destruction class this guard exists to prevent (round-2 review). A git
 * index lock or a killed checkout must stop the run, not be absorbed by it.
 */
function restoreTargets({ fatal = true } = {}) {
  try {
    git("checkout", "--", ...TARGETS);
  } catch (e) {
    console.error(
      "\nRESTORE FAILED — the working tree may still hold a mutant.\n" +
        `Run: git checkout -- ${TARGETS.join(" ")}\n` +
        String(e?.message ?? e),
    );
    if (fatal) process.exit(3);
  }
}

/**
 * Applies a mutation, refusing anything whose anchor is not UNIQUE.
 *
 * The uniqueness check is load-bearing, not defensive tidiness. `String.replace`
 * with a string argument rewrites only the FIRST match, and this file's own
 * anchors can appear in prose as well as in code — `key={token}` occurs both in
 * a JSX comment and as the real prop. Replacing the comment produces a no-op
 * mutant that the suite "survives", which reads as a coverage hole and is
 * nothing of the kind. That false negative is exactly the defect class this
 * whole matrix exists to catch, so an ambiguous anchor is a hard error rather
 * than a silent first-match.
 */
function apply(mutation) {
  for (const [file, find, replace, all = false] of mutation) {
    const p = join(ROOT, file);
    const src = readFileSync(p, "utf8");
    const hits = src.split(find).length - 1;
    if (hits === 0) return `anchor not found in ${file}: ${find.slice(0, 60)}`;
    // `all` is opt-in per mutation and only correct where the duplication is
    // ITSELF the contract: a theme token is declared once in the
    // prefers-color-scheme block and once in the [data-theme] block, and a
    // shipped test pins the two identical, so a single-site edit would model an
    // impossible state rather than the retune being tested.
    if (hits > 1 && !all)
      return `anchor is AMBIGUOUS (${hits} hits) in ${file}: ${find.slice(0, 60)}`;
    writeFileSync(p, all ? src.split(find).join(replace) : src.replace(find, replace));
  }
  return null;
}

function runVitest() {
  try {
    execFileSync("pnpm", ["vitest", "run", ...VITEST_SUITES], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 300_000,
    });
    return [];
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return [...out.matchAll(/×\s+(.+?)\s+\d+ms/g)].map((m) => m[1].trim());
  }
}

function runBrowser() {
  try {
    execFileSync("pnpm", ["test:e2e:share-link-flash"], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 600_000,
    });
    return [];
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return [...out.matchAll(/(T-FLASH-[A-Z]+):/g)]
      .map((m) => m[1])
      .filter((v, i, a) => a.indexOf(v) === i);
  }
}

assertCleanTargets();
// SIGINT alone left SIGTERM and SIGHUP able to kill the run between mutate and
// restore (round-2 review). CI cancellation sends SIGTERM.
for (const [sig, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
]) {
  process.on(sig, () => {
    restoreTargets({ fatal: false });
    releaseLock();
    process.exit(code);
  });
}

const results = [];
try {
  for (const [id, label, mutation] of ADVERSARIES) {
    if (ONLY && !ONLY.has(id)) continue;
    const err = apply(mutation);
    if (err) {
      restoreTargets();
      results.push({ id, label, status: "UNAPPLIED", detail: err, rows: [] });
      console.log(`${id}  UNAPPLIED  ${err}`);
      continue;
    }
    const rows = runVitest();
    const browserRows = QUICK ? [] : runBrowser();
    restoreTargets();
    const all = [...rows, ...browserRows];
    results.push({ id, label, status: all.length ? "REJECTED" : "SURVIVED", rows: all });
    console.log(
      `${id}  ${all.length ? "REJECTED" : "*** SURVIVED ***"}  (${all.length} rows)  ${label}`,
    );
  }
} finally {
  restoreTargets();
  releaseLock();
}

const survived = results.filter((r) => r.status === "SURVIVED");
const unapplied = results.filter((r) => r.status === "UNAPPLIED");
console.log(
  `\n${results.length} adversaries · ${results.length - survived.length - unapplied.length} rejected · ${survived.length} SURVIVED · ${unapplied.length} unapplied`,
);
writeFileSync(join(ROOT, "tmp", "adversary-matrix.json"), JSON.stringify(results, null, 2));
if (survived.length || unapplied.length) process.exitCode = 1;
