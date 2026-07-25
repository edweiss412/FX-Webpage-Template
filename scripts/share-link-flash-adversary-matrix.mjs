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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HUB = "components/admin/showpage/ShareHub.tsx";
const CSS = "app/globals.css";
const CTX = "app/admin/show/[slug]/ShareTokenContext.tsx";
const COPY = "app/admin/show/[slug]/ShareLinkCopyButton.tsx";

const VITEST_SUITES = [
  "tests/components/admin/showpage/shareHubFlashState.test.tsx",
  "tests/components/admin/showpage/shareHubFlashTransitions.test.ts",
  "tests/components/shareTokenRotateSurface.test.tsx",
  "tests/styles/status-token-contrast.test.ts",

  "tests/components/admin/shareLinkCopyButtonRotate.test.tsx",
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
// Positionals count too: a stray `A5` (meaning `--only A5`) was silently
// ignored and the run did something other than what was asked (round-4 review).
const unknown = argv.filter((a, i) => !KNOWN.has(a) && argv[i - 1] !== "--only");
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
  const hits = argv.reduce((n, a, i) => (a === "--only" ? [...n, i] : n), []);
  if (hits.length > 1) {
    console.error(
      `--only given ${hits.length} times; only the first would take effect\n\n${USAGE}`,
    );
    process.exit(2);
  }
  const i = hits[0];
  if (i === undefined) return null;
  const raw = argv[i + 1];
  // `--only --quick` silently selected ZERO adversaries and exited 0, writing a
  // zero-row report that reads as success; bare `--only` threw. Both are
  // false-greens on a tool whose entire job is proving coverage.
  if (!raw || raw.startsWith("-")) {
    console.error(`--only requires a comma-separated id list, e.g. --only A5,A9\n\n${USAGE}`);
    process.exit(2);
  }
  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!ids.length) {
    console.error(`--only received no usable ids\n\n${USAGE}`);
    process.exit(2);
  }
  return new Set(ids);
})();

/**
 * ROW GRANULARITY, stated because the report's wording implied more than it
 * delivers: a "row" is a TEST, not an assertion. Both collectors record titles,
 * so an adversary that reds any one of `T-FLASH-RUN`'s assertions credits the
 * whole row. Removing a single assertion therefore need not change the matrix at
 * all (round-6 review).
 *
 * This is a real limit on what the matrix proves. It shows every registered
 * wrong implementation is caught by SOME row; it does not show each assertion is
 * load-bearing. Assertions with a history of being vacuous were mutation-checked
 * by hand and say so at the site.
 */

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
    "wash keyframe replaced by a single opacity stop",
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
    "keyframes moved into the component as a rendered <style> element",
    [
      // Twice inert before this. First a COMMENT containing "@keyframes", then
      // an unused exported STRING — both changed nothing observable and were
      // rejected only because a source regex saw the bytes (rounds 9 and 10).
      // Rendering the tag is the actual relocation: the rule really does ship
      // from the component, and the stylesheet really does lose it.
      [
        HUB,
        '      className="relative flex items-center gap-2 max-sm:w-full"\n    >\n',
        '      className="relative flex items-center gap-2 max-sm:w-full"\n    >\n      <style>{"@keyframes share-link-flash-bg { from { opacity: 1 } }"}</style>\n',
      ],
    ],
  ],
  [
    "A23",
    "attribute on the wrapper row, not the code block",
    [
      // Both halves are required. Adding to the wrapper WITHOUT removing it from
      // the <code> element tested duplication, not relocation, and the row this
      // adversary exists for is about which element carries the cue
      // (round-9 review).
      [
        HUB,
        `data-testid="admin-current-share-link-row"`,
        `data-testid="admin-current-share-link-row"\n                        {...(flash !== null ? { "data-share-link-flash": "" } : {})}`,
      ],
      [
        HUB,
        `                          {...(flash !== null ? { "data-share-link-flash": "" } : {})}\n                          className="min-w-0 flex-1 break-all`,
        `                          className="min-w-0 flex-1 break-all`,
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

/**
 * A29/A30 are the two implementations round-3 whole-diff review demonstrated
 * against N1's earlier substring form. Neither is a plausible authoring
 * mistake; both are exactly the shape a containment check cannot see, which is
 * why they are registered permanently rather than checked once by hand.
 *
 * A29 keeps the declaration byte-identical and only widens the selector, so
 * every fragment and substring assertion still matched while the rule's
 * specificity changed. A30 changes nothing at all about the first rule — it
 * appends a second copy, and `toContain` is satisfied by the first.
 */
ADVERSARIES.push([
  "A29",
  "selector widened to `html [data-...]` (defeats substring matching)",
  [
    [
      CSS,
      "[data-share-link-flash] {\n  animation:",
      "html [data-share-link-flash] {\n  animation:",
    ],
  ],
]);

ADVERSARIES.push([
  "A30",
  "the attribute rule is duplicated (a later copy wins the cascade)",
  [
    [
      CSS,
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n[data-share-link-flash] {\n  animation:\n    share-link-flash-bg 1600ms ease-out,\n    share-link-flash-ring 1600ms ease-out;\n}",
    ],
  ],
]);

/**
 * A31 exists because honest row attribution exposed T-FLASH-REST as vacuous.
 *
 * While `runBrowser` credited every browser row on any failure, T-FLASH-REST
 * appeared to reject 13 adversaries. Parsing the JSON reporter dropped it to
 * ZERO — spec §9.0 says a row that rejects nothing is deleted, not kept for
 * reassurance. The row is worth keeping, so give it the defect it is for: a cue
 * that is never gated on the attribute at all and therefore paints at rest.
 * Nothing else in the register reaches the resting state, because every other
 * adversary mutates behavior that only exists after a rotate.
 */
ADVERSARIES.push([
  "A31",
  "cue ungated: the URL block animates at rest, with no attribute",
  [
    [
      CSS,
      "[data-share-link-flash] {\n  animation:",
      '[data-testid="admin-current-share-link-url"] {\n  animation:',
    ],
  ],
]);

/**
 * A32-A35 close the four rows round-7 review found rejecting nothing. Spec §9.0
 * requires every non-exempt row to reject at least one adversary, and
 * registering the copy-button file in VITEST_SUITES did not satisfy that — no
 * adversary mutated the component, so its rows could never appear.
 *
 * A32-A34 are the exact mutations used to hand-verify those rows when they were
 * written; registering them makes the check executable and permanent instead of
 * a claim in a commit message.
 */
ADVERSARIES.push([
  "A32",
  "copy button: drops the captured-url check, so a stale write still confirms",
  [[COPY, "      if (requested !== urlRef.current) return;\n", ""]],
]);

ADVERSARIES.push([
  "A33",
  "copy button: no reset when the url rotates after a completed copy",
  [
    [
      COPY,
      "  const [seenUrl, setSeenUrl] = useState(url);\n  if (seenUrl !== url) {\n    setSeenUrl(url);\n    if (copied) setCopied(false);\n  }",
      "  const [seenUrl] = useState(url);\n  void seenUrl;",
    ],
  ],
]);

ADVERSARIES.push([
  "A34",
  "copy button: resets in a PASSIVE effect, painting one stale frame",
  [
    [
      COPY,
      "  const [seenUrl, setSeenUrl] = useState(url);\n  if (seenUrl !== url) {\n    setSeenUrl(url);\n    if (copied) setCopied(false);\n  }",
      "  useEffect(() => {\n    setCopied(false);\n  }, [url]);",
    ],
  ],
]);

ADVERSARIES.push([
  "A35",
  "copy button: suppresses EVERY deferred confirmation, not only stale ones",
  [[COPY, "      if (requested !== urlRef.current) return;", "      if (true) return;"]],
]);

/**
 * A36 reaches the one remaining bare row: "no cue on first render or first
 * open". A4 seeds the flash at mount but is equivalent precisely BECAUSE the
 * visibility predicate clears it in the same pass; removing that predicate as
 * well is what makes the seed observable, and cues a panel nobody rotated.
 */
ADVERSARIES.push([
  "A36",
  "seeded at mount AND never cleared, so opening the panel cues with no rotate",
  [
    [
      HUB,
      "const [flash, setFlash] = useState<number | null>(null);",
      "const [flash, setFlash] = useState<number | null>(1);",
    ],
    [HUB, "  if ((!open || !linkActive) && flash !== null) setFlash(null);", ""],
  ],
]);

/**
 * A37 is the exact stylesheet round-7 review built to defeat the byte check:
 * wrap the whole normative block in `@media screen { … }`. It passes raw
 * containment, occurrence counting, both keyframe checks, and the browser suite
 * (Playwright renders as screen media) while gating the cue behind a media
 * query. Registered so the top-level-context assertion can never be removed
 * without something going red.
 */
ADVERSARIES.push([
  "A37",
  "whole cue block nested inside `@media screen`, defeating contiguity",
  [
    [CSS, "/* ShareHub crew-link block:", "@media screen {\n/* ShareHub crew-link block:"],
    [
      CSS,
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n}",
    ],
  ],
]);

/**
 * A38 is round-8's escalation of A37: the same `@media screen` nesting, but
 * with escaped braces in class selectors on either side so the brace counts
 * cancel. It defeated the top-level check AND its end-of-file self-check —
 * `.escape\}` is a valid selector, and counting that brace as structural made
 * a nested block look top-level while the file still balanced.
 *
 * Registered separately from A37 because it is a distinct defect: A37 catches a
 * scanner that does not look at context at all, A38 catches one that looks but
 * mis-lexes escapes.
 */
ADVERSARIES.push([
  "A38",
  "`@media screen` nesting hidden by escaped braces that balance the count",
  [
    [
      CSS,
      "/* ShareHub crew-link block:",
      "@media screen {\n.escape\\} {\n  color: red;\n}\n/* ShareHub crew-link block:",
    ],
    [
      CSS,
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}",
      "@media (prefers-reduced-motion: reduce) {\n  [data-share-link-flash] {\n    animation: none;\n  }\n}\n}\n.escape\\{ {\n  color: red;\n}",
    ],
  ],
]);

/**
 * A39 makes an admitted coverage gap EXECUTABLE instead of prose.
 *
 * The captured-url guard reads `urlRef`, written in a LAYOUT effect so it holds
 * the new url before any passive effect runs. Round-10 review established that
 * nothing proves the LAYOUT part: T-FLASH-COPY-RACE awaits the whole rotate
 * before releasing the clipboard promise, by which time a passive effect has
 * updated the ref too, and A32 removes the comparison rather than its timing.
 *
 * Creating the commit-to-passive-effect window from Playwright is not something
 * I found a way to do. Rather than leave the gap as a sentence in a header,
 * register the mutation: if it survives, the report says so in the table, and
 * any future harness that CAN reach the window turns this row green by itself.
 */
ADVERSARIES.push([
  "A39",
  "urlRef written in a PASSIVE effect instead of a layout effect",
  [
    [
      COPY,
      "  useLayoutEffect(() => {\n    urlRef.current = url;",
      "  useEffect(() => {\n    urlRef.current = url;",
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

const TARGETS = [HUB, CSS, CTX, COPY];
/** Written (not mutated) by a full run, so it is NOT in TARGETS — restoring it
 *  would revert the very output the run exists to produce. Checked for
 *  cleanliness separately so a full run cannot overwrite uncommitted edits. */
const REPORT_DOC = "docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md";

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

/** The pid recorded in an existing lock, or null if unreadable/malformed. */
function lockHolder() {
  try {
    const pid = Number.parseInt(readFileSync(LOCK, "utf8").trim().split(/\s+/)[0] ?? "", 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Age of the existing lock in ms, or null if it carries no readable timestamp. */
function lockAgeMs() {
  try {
    const line = readFileSync(LOCK, "utf8").trim().split("\n")[1];
    const t = line ? Date.parse(line) : NaN;
    return Number.isFinite(t) ? Date.now() - t : null;
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0); // signal 0 tests existence without delivering anything
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by another user
  }
}

/**
 * Take the lock, or refuse. There is deliberately NO automatic takeover.
 *
 * Three review rounds went into making stale-lock takeover exclusive, and each
 * attempt was broken by the next: write-then-verify let both contenders verify
 * their own write; unlink-then-create let B unlink A's fresh lock. Every version
 * has a window because "is it stale" and "claim it" cannot be made one atomic
 * step this way.
 *
 * So drop the feature. `wx` create is atomic and needs no reasoning: exactly one
 * process can create the file. A crashed run leaves a lock that a human deletes,
 * guided by the message below — a rare manual step, traded for a race that can
 * silently corrupt tracked files and has already survived three fixes.
 */
function acquireLock() {
  // `tmp/` is gitignored and absent from a fresh worktree, so every write below
  // — lock, Playwright report, matrix JSON — failed before a single adversary
  // ran (round-7 review).
  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  try {
    writeFileSync(LOCK, `${process.pid}\n${new Date().toISOString()}\n`, { flag: "wx" });
    return;
  } catch (err) {
    // ONLY "already exists" means held. Treating every error as held reported a
    // sandbox EPERM — with no lock file present at all — as a concurrent winner
    // (round-6 review). Anything else is a real fault and must surface as one.
    if (err.code !== "EEXIST") throw err;
  }

  const holder = lockHolder();
  const age = lockAgeMs();
  const dead = holder !== null && !alive(holder);
  console.error(
    `refusing to run: ${LOCK} exists${holder === null ? "" : `, recorded pid ${holder}`}.\n` +
      "This script mutates tracked files; two concurrent runs strand mutants in\n" +
      "each other's windows.\n\n" +
      (dead
        ? `That pid is gone, so this lock is almost certainly stale — delete ${LOCK} and re-run.`
        : `If that process is not a matrix run (PIDs get reused${
            age === null ? "" : `; this lock is ${Math.round(age / 60000)}min old`
          }), delete ${LOCK} and re-run.`),
  );
  process.exit(2);
}

function releaseLock() {
  // Only drop OUR lock. Unconditional removal let a second run delete the
  // holder's lock and proceed, which is the collision the lock exists to stop.
  try {
    const held = readFileSync(LOCK, "utf8").trim().split("\n")[0];
    if (held !== String(process.pid)) return;
    rmSync(LOCK, { force: true });
  } catch {
    /* no lock, or unreadable — nothing to release */
  }
}

function assertCleanTargets() {
  // A full run REWRITES the report doc and then prettifies it, so uncommitted
  // edits there are destroyed just as surely as edits to a mutation target
  // (round-4 review). Only full runs write it, so only they need it clean.
  const checked = !ONLY && !QUICK ? [...TARGETS, REPORT_DOC] : TARGETS;
  const dirty = git("status", "--porcelain", "--", ...checked).trim();
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
    const rows = [...out.matchAll(/×\s+(.+?)\s+\d+ms/g)].map((m) => m[1].trim());
    // A mutation that breaks the BUILD produces a non-zero exit with no `×`
    // rows at all, which read as "nothing failed" and reported SURVIVED — the
    // exact false-green this tool exists to prevent (round-10, found while
    // fixing A20). A suite that could not run is an infrastructure fault, not a
    // coverage result, so refuse to score it.
    if (!rows.length) {
      throw new Error(
        "vitest exited non-zero but reported no failing rows — the mutant probably does not compile. " +
          "Fix the adversary so it produces runnable code; a build break is not a rejection.",
      );
    }
    return rows;
  }
}

/**
 * Failing browser rows ONLY.
 *
 * This used to scrape `T-FLASH-[A-Z]+:` out of the combined output on any
 * failure. Playwright prints EVERY test's title, passing ones included, so a
 * single red row credited all six to the adversary — and the generated coverage
 * table then presented that inflation as non-vacuity evidence. It was wrong in
 * the direction that flatters the matrix, which is the worst direction
 * (round-4 review, BLOCKING). Parse the JSON reporter instead of prose.
 */
function runBrowser() {
  // Write the report to a FILE, not stdout. Parsing stdout worked on the green
  // path and failed on the red one — the failure path carries extra output
  // around the document, which is exactly when this function has to be right.
  const reportPath = join(ROOT, "tmp", "pw-report.json");
  try {
    rmSync(reportPath, { force: true });
  } catch {
    /* nothing to clear */
  }
  try {
    execFileSync("pnpm", ["test:e2e:share-link-flash", "--reporter=json"], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 600_000,
      // No `--` before the flag: pnpm forwards trailing args already, and an
      // explicit `--` reaches Playwright as a POSITIONAL filter, leaving the
      // config's `list` reporter in force.
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
    });
    return [];
  } catch {
    /* red run — attribute the rows below */
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    throw new Error(
      `browser run failed but wrote no readable JSON report at ${reportPath} — refusing to guess which rows red`,
    );
  }

  const failed = new Set();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      // `test.status` is Playwright's OUTCOME after retries
      // ("expected" | "unexpected" | "flaky" | "skipped"); `results[]` is the
      // per-attempt log. Judging on results[] counts a FLAKY row — one that
      // failed once and passed on retry — as a rejection, which inflates
      // coverage in the same direction as the title-scrape this replaced. A row
      // that only sometimes catches a mutant has not rejected it.
      const red = (spec.tests ?? []).some((t) => t.status === "unexpected");
      // `[A-Z]+` stopped at the first hyphen, so T-FLASH-COPY-RACE was recorded as
      // "T-FLASH-COPY" — the coverage was real but the row was mislabelled, which
      // is exactly the kind of quiet inaccuracy this report exists to avoid.
      if (red) failed.add(spec.title.match(/^(T-FLASH-[A-Z0-9-]+)/)?.[1] ?? spec.title);
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return [...failed].sort();
}

// Unknown ids selected nothing and exited 0 — the same zero-adversary false
// green as `--only --quick`, just reached by a typo instead of a flag
// (round-4 review). Validate against the registry now that it is fully built.
if (ONLY) {
  const known = new Set(ADVERSARIES.map(([id]) => id));
  const bogus = [...ONLY].filter((id) => !known.has(id));
  if (bogus.length) {
    console.error(
      `--only names unknown adversary id(s): ${bogus.join(", ")}\n` +
        `known ids: ${[...known].join(", ")}`,
    );
    process.exit(2);
  }
}

assertCleanTargets();
acquireLock();
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
  // Targets are restored here, but the lock is NOT released yet: the matrix JSON
  // and the tracked report are still to be written. Releasing here let a second
  // run pass its cleanliness check and acquire the lock in that gap, after which
  // this run overwrote its evidence (round-7 review). The lock covers every
  // write, and is dropped at the very end.
  restoreTargets();
}

const survived = results.filter((r) => r.status === "SURVIVED");
const unapplied = results.filter((r) => r.status === "UNAPPLIED");
console.log(
  `\n${results.length} adversaries · ${results.length - survived.length - unapplied.length} rejected · ${survived.length} SURVIVED · ${unapplied.length} unapplied`,
);
writeFileSync(join(ROOT, "tmp", "adversary-matrix.json"), JSON.stringify(results, null, 2));

// Emit the recorded tables into the report doc between markers. Hand-transcribed
// totals are what drifted last time: a late CSS fix left the report describing a
// shape the code no longer had, which whole-diff review caught as BLOCKING. The
// prose around the markers stays hand-written; the data cannot disagree with the
// run that produced it. Partial runs never write — a `--only` or `--quick` run
// would record a truthful-looking table over an incomplete matrix.
if (!ONLY && !QUICK) {
  // Labels and test titles are free text. A literal pipe ends the cell and a
  // newline ends the row, so an unescaped one silently reshapes the table.
  const cell = (v) => String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

  const perAdversary = [
    "| # | Wrong implementation | Rows red |",
    "|---|---|---|",
    ...results.map(
      (r) =>
        `| ${cell(r.id)} | ${cell(r.label)} | ${r.status === "REJECTED" ? r.rows.length : r.status} |`,
    ),
  ].join("\n");

  const byRow = new Map();
  for (const r of results) {
    for (const row of r.rows) {
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row).push(r.id);
    }
  }
  const perTest = [
    "| Test row | Adversaries it rejects |",
    "|---|---|",
    ...[...byRow.entries()]
      .sort()
      .map(([row, ids]) => `| ${cell(row)} | ${cell(ids.join(", "))} |`),
  ].join("\n");

  const generated = `<!-- BEGIN GENERATED -->\n\n_${results.length} adversaries · ${results.length - survived.length - unapplied.length} rejected · ${survived.length} survived · ${unapplied.length} unapplied._\n\n${perAdversary}\n\n${perTest}\n\n<!-- END GENERATED -->`;
  const doc = join(ROOT, REPORT_DOC);
  const before = readFileSync(doc, "utf8");
  // Non-greedy, and the pair must be unique. A greedy match across duplicated or
  // nested markers spans the FIRST begin to the LAST end and silently deletes
  // every line of authored prose in between (round-4 review).
  const begins = (before.match(/<!-- BEGIN GENERATED -->/g) ?? []).length;
  const ends = (before.match(/<!-- END GENERATED -->/g) ?? []).length;
  // Order matters as much as count: a REVERSED pair passes the count check, the
  // regex then matches nothing, the replace is a silent no-op, and the run still
  // logs "report tables written" (round-5 review).
  const ordered =
    before.indexOf("<!-- BEGIN GENERATED -->") < before.indexOf("<!-- END GENERATED -->");
  if (begins !== 1 || ends !== 1 || !ordered) {
    console.error(
      `report doc must contain exactly one GENERATED marker pair (found ${begins} begin, ${ends} end): ${doc}`,
    );
    process.exitCode = 1;
  } else {
    // Replace with a FUNCTION, not a string: `$&`, `$1` and friends inside a
    // string replacement are substitution patterns, and adversary labels are
    // free text that can contain them.
    const after = before.replace(
      /<!-- BEGIN GENERATED -->[\s\S]*?<!-- END GENERATED -->/,
      () => generated,
    );
    // Compare against the MATCH, not against the whole file: an unchanged file is
    // the expected result of re-running a matrix whose output has not moved, and
    // flagging it failed every correct idempotent rerun (round-6 review). What is
    // actually worth catching is the regex matching nothing at all.
    if (!/<!-- BEGIN GENERATED -->[\s\S]*?<!-- END GENERATED -->/.test(before)) {
      console.error(`report marker replacement matched nothing: ${doc}`);
      process.exitCode = 1;
    } else {
      writeFileSync(doc, after);
      // Prettier owns markdown table alignment in this repo and format:check
      // runs in CI, so emitting raw pipes would leave the tree failing a gate
      // right after the matrix certified it.
      try {
        execFileSync("npx", ["prettier", "--write", doc], { cwd: ROOT, stdio: "pipe" });
      } catch (e) {
        console.error(`report written but prettier failed; run it by hand: ${e.message}`);
        process.exitCode = 1;
      }
      console.log(`report tables written to ${doc}`);
    }
  }
}

/** Survivors that are PROVEN EQUIVALENT, not coverage holes. A4 applies cleanly
 *  and changes nothing observable: `open` starts false, so the visibility clear
 *  nulls the seeded flash in the same render pass. Recorded here so a correct
 *  full run exits 0 — failing on it made every honest rerun red (round-6). */
const EQUIVALENT_SURVIVORS = new Set(["A4"]);
/** Survivors that are NOT equivalent — they are genuinely wrong and genuinely
 *  uncaught. Listing one here is an admission with a name attached, not a pass:
 *  A39 needs a promise to settle between commit and passive effects, which no
 *  harness here can arrange (round-10). Keeping it registered means the gap is
 *  visible in the generated table, and closes itself the day a harness can. */
const UNPROVEN_SURVIVORS = new Set(["A39"]);
const unexpectedSurvivors = survived.filter(
  (r) => !EQUIVALENT_SURVIVORS.has(r.id) && !UNPROVEN_SURVIVORS.has(r.id),
);
// The check has to run BOTH ways. A declared equivalent that comes back REJECTED
// is evidence of an unrelated failure — a broken baseline, browser infra — not
// of stronger coverage, and one-directional checking let that exit 0 reporting
// "31 rejected, 0 survived" (round-7 review).
const equivalentsRun = results.filter((r) => EQUIVALENT_SURVIVORS.has(r.id));
const wronglyRejected = equivalentsRun.filter((r) => r.status !== "SURVIVED");
if (wronglyRejected.length) {
  process.exitCode = 1;
  console.error(
    `declared-equivalent adversaries were REJECTED: ${wronglyRejected.map((r) => r.id).join(", ")} — ` +
      "they are proven to change nothing observable, so something else is failing. Do NOT read this as better coverage.",
  );
}
if (unexpectedSurvivors.length || unapplied.length) process.exitCode = 1;
if (unexpectedSurvivors.length) {
  console.error(
    `unexpected survivors: ${unexpectedSurvivors.map((r) => r.id).join(", ")} — ` +
      "either the assertion set has a hole, or the adversary is equivalent and belongs in EQUIVALENT_SURVIVORS with the argument written down.",
  );
}

// Every write is done — matrix JSON and the generated report included.
releaseLock();
