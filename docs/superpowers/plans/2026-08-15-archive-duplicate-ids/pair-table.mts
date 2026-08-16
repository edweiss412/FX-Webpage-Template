import { readFileSync } from "node:fs";

const TERMINAL = /RESOLVED|CLOSED|DEMOTED|WITHDRAWN|WON'T BUILD|SHIPPED|OBSOLETE|REFUTED|GRADUATED|Graduated/;
const pairs: Record<string, Array<[string, number, number]>> = {
  "BACKLOG-archive.md": [],
  "DEFERRED-archive.md": [],
};
const spec: Record<string, string[][]> = {
  "BACKLOG-archive.md": [
    ["BL-RATE-LIMIT-SNAPSHOT-DURABILITY","2582","2611"],["BL-LEDGER-MDAST-SHARED-HOME","2623","2659"],
    ["BL-AGENDA-PERLINK-COMPLETENESS","2674","2708"],["BL-FITWITHINCLIP-CLIP-SCROLL-STALE","2728","2770"],
    ["BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP","2817","2850"],["BL-IDENTITYLINK-LANDED-VS-REQUESTED","2860","2893"],
    ["BL-UNDO-SELECTIONS-RESET-AT-DROP","2903","2935"],["BL-ADMIN-NOJS-LOADING-CONFLICT","2984","2986"],
    ["BL-MODAL-REALTIME-UPDATED-CUE","3067","3075"],["BL-ONBOARDING-CAS-SOURCE-ANCHORS","3085","3087"],
    ["BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT","3117","3119"],["BL-ADMIN-PARSEPANEL-ORPHANED","3125","3127"],
    ["BL-HELP-STRIP-COPYLINK-STALE","3131","3133"],["BL-UNPUBLISH-TO-HELD","3141","3143"],
    ["BL-VERSION-AMBIGUOUS-V1-OVERRIDE","3153","3155"],["BL-CI-STATIC-ENV-INJECTION","3383","3387"],
    ["BL-DANGLING-CITATIONS-RETIRED-WORKFLOW","3399","3401"],["BL-MASTERSPEC-FINANCIALS-VOCAB","3429","3431"],
    ["BL-SOUND-REDIRECT-GUARD","3439","3443"],["BL-CI-GITHUB-ENV-CROSS-STEP-STATE","3453","3457"],
    ["BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION","3465","3469"],["BL-LEDGER-GUARD-MDAST-REWRITE","3487","3491"],
    ["BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE","4870","4874"],["BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP","4880","4884"],
    ["BL-INVARIANT8-CLOSEOUT-ENFORCEMENT","5117","5123"],["BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS","5250","5254"],
    ["BL-ATTENTION-MENU-PANEL-CLIP","5266","5270"],["BL-PUBLISHED-TOGGLE-OVERLAY-CLIP","5282","5286"],
    ["BL-SHAREHUB-CONFIRM-NAMES-SHOW","5294","5298"],["BL-SHAREHUB-OPEN-TIMER-LEAK","5310","5314"],
    ["BL-POPOVER-SHARED-RAF-COALESCER","5324","5328"],["BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE","5590","5602"],
    ["BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE","5617","5625"],["BL-KNOWN-SECTIONS-WALKER","5639","5654"],
    ["BL-NEEDS-ATTENTION-HOLDS-ROLLUP","5973","5975"],
    ["BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK","5481","5488"],
    ["BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND","5664","5688"],
  ],
  "DEFERRED-archive.md": [
    ["NEWTAB-GUARD-UNDECIDABLE-2","380","412"],["DESTRUCT-ARM-ANNOUNCE-1","448","470"],
    ["PSQL-GUARD-RECALL-RESIDUAL","478","507"],["PSQL-STARTUP-FILE-NO-X-CLASSWIDE","541","587"],
    ["USE-RAW-FULL-LIST-1","1763","1905"],["CASP-2","1807","1818"],
  ],
};
for (const [file, rows] of Object.entries(spec)) {
  const lines = readFileSync(file, "utf8").split("\n");
  console.log(`## ${file}`);
  for (const [id, a, b] of rows) {
    const ha = lines[Number(a) - 1]!;
    const hb = lines[Number(b) - 1]!;
    const ta = TERMINAL.test(ha), tb = TERMINAL.test(hb);
    const survivor = ta && !tb ? a : !ta && tb ? b : "BOTH-OR-NEITHER";
    console.log(`| ${id} | ${a} (${ta ? "terminal" : "original"}) | ${b} (${tb ? "terminal" : "original"}) | keep ${survivor === a ? "first" : survivor === b ? "second" : "??"} |`);
    if (survivor === "BOTH-OR-NEITHER") { console.log(`    A: ${ha}`); console.log(`    B: ${hb}`); }
  }
}
