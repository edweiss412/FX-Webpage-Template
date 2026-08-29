import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every Playwright webServer hands its app server a LOOPBACK database.
 *
 * `.env.local` points TEST_DATABASE_URL at the REMOTE validation pooler on purpose (the
 * schema-parity gates need that credential), `next dev` / `next start` load `.env.local`
 * INSIDE the server Playwright boots, and the route handlers resolve
 * `TEST_DATABASE_URL ?? DATABASE_URL ?? loopback`. So an entry with no pin hands the app
 * server a shared remote deployment whose notify cron mails Doug: nine real alerts on
 * 2026-08-26, and a local e2e run that returned ADMIN_ALERT_NOT_FOUND against a database
 * that never held the seeded show (BL-LOCAL-E2E-APP-SERVER-QUERIES-VALIDATION).
 *
 * Derived cover on two axes: config FILES are every *.config.ts in the repo, ASKED whether
 * they hold webServer entries, and ENTRIES come from each config's own array. So neither a
 * new config in a new directory nor a new entry in an existing one is silently exempt.
 */

// These shrink playwright.config.ts's webServer array via its own .filter(). With any set
// the walk is a subset; STEP3_LIVE_BUNDLE_ONLY empties it, and a per-entry assertion over
// an empty array passes while proving nothing.
const FILTER_VARS = [
  "HELP_DOCS_WALKER_ONLY",
  "CREW_E2E_ONLY",
  "BASELINE_SERVER_ONLY",
  "DEV_GATE_ONLY",
  "STEP3_LIVE_BUNDLE_ONLY",
] as const;

// Case-insensitive because DNS names are: LOCALHOST is a loopback host and a
// case-sensitive regex rejected it, failing on correct configuration. Both the bracketed
// and bare IPv6 forms are accepted, since `URL.host` keeps brackets and other readers
// strip them.
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\]|::1)(?::|$)/i;
const DB_KEYS = ["DATABASE_URL", "TEST_DATABASE_URL"] as const;

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "coverage"]);

/**
 * Discovery ASKS THE CONFIG, it does not read it.
 *
 * A lexical detector for a `webServer` declaration is unsound in both directions and cannot
 * be made sound by growing it: `defineConfig({ webServer })` shorthand and
 * `defineConfig({ "webServer": [...] })` are ordinary static forms a `/\bwebServer\s*:/`
 * scan misses, while that same scan fires on the word in a comment, a type, or a string in
 * an unrelated config. So every `*.config.ts` is imported and the ones holding real entries
 * are the set. Property syntax, quoting and dynamic construction all stop mattering, because
 * the resolved object is what gets asked.
 */
const IMPORT_THROWS: Record<string, string> = {
  "tests/e2e/visual.config.ts":
    "guards on SECTION_HEADER_VISUAL_CONTAINER and refuses to load without it",
  "tests/mutation/source/mutantOverlay.config.ts": "requires MUTATION_TARGET and its siblings",
};

/**
 * The configs that HOLD webServer entries, asserted as a set. An aggregate floor is not
 * enough: "some config yielded entries, and more than one in total" is satisfied by ONE
 * config, so a second could resolve to `[]` here while Playwright boots an unpinned entry
 * from it, and the per-entry assertions would pass over nothing for that file.
 *
 * Fail-closed in both directions, the same way IMPORT_THROWS is: a config that starts
 * holding entries fails until it is listed, and a listed one that stops holding them fails
 * until it is delisted. Neither drifts silently.
 */
const WEBSERVER_BEARING = ["playwright.config.ts", "playwright.screenshots.config.ts"];

/**
 * Both lists above are environment-dependent, and that is a defect unless the test pins the
 * environment. `SECTION_HEADER_VISUAL_CONTAINER=1` makes visual.config.ts import CLEANLY, and
 * the MUTATION_* set does the same for mutantOverlay.config.ts, so under the workflows that
 * set them an exact throw-set assertion would fail on entirely correct code. Delete them
 * before walking, and assert they are gone, so the walk is deterministic wherever it runs.
 */
const CONTROLLING_ENV = [
  "SECTION_HEADER_VISUAL_CONTAINER",
  "MUTATION_ROOT",
  "MUTATION_TARGET",
  "MUTATION_MUTANT",
  "MUTATION_SUITE",
];
for (const v of CONTROLLING_ENV) delete process.env[v];

function configFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".next")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) configFiles(full, out);
    else if (/\.config\.ts$/.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

const ALL_CONFIGS = configFiles(ROOT).sort();

type WebServer = {
  url?: string;
  command?: string;
  env?: Record<string, string | undefined>;
};

/**
 * Playwright starts each command with `shell: true`, so a `VAR=value` prefix on the command
 * string is applied by the SHELL, after the merged environment is handed over, and therefore
 * BEATS `webServer.env`. Four entries already carry inline assignments for other variables, so
 * adding a database one is an ordinary edit -- and it would leave every assertion below green
 * while the server took the value from the command.
 *
 * The check is that the NAME does not appear in the command at all, not that some assignment
 * grammar matches. A pattern keyed to `\sNAME=` was tried and missed the ordinary quoted forms
 * `env "TEST_DATABASE_URL=..."` and `env 'TEST_DATABASE_URL=...'`, which are exactly what one
 * writes for a DSN containing shell-sensitive characters. Widening that pattern to cover quotes
 * would invite the next quoting form; asking whether the name occurs at all has no grammar to
 * grow and no next form. These commands are short, none mentions a database variable for any
 * legitimate reason, and one that needed to would be a deliberate change reviewed here.
 */
const DB_VARIABLE_NAME = /DATABASE_URL/;

/**
 * Dynamic import, which disk discovery requires, can wrap the default export one level
 * deeper than a static import does: `mod.default.webServer` reads `undefined` while
 * `mod.default.default.webServer` holds the entries. Unwrapping a fixed number of levels
 * would walk zero entries and pass green, so descend until `webServer` appears, and let
 * the premises make a wrong guess loud rather than silent.
 */
function webServersOf(mod: unknown): WebServer[] {
  let node: unknown = mod;
  for (let i = 0; i < 8; i++) {
    if (node === null || typeof node !== "object") break;
    if ("webServer" in node) break;
    if (!("default" in node)) break;
    node = (node as { default: unknown }).default;
  }
  const raw = (node as { webServer?: WebServer | WebServer[] } | null)?.webServer;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/** Imports a config, or reports that it could not be imported. */
async function entriesOf(file: string): Promise<{ entries: WebServer[]; threw: boolean }> {
  try {
    return { entries: webServersOf(await import(resolve(ROOT, file))), threw: false };
  } catch {
    return { entries: [], threw: true };
  }
}

describe("every Playwright webServer pins a loopback database", () => {
  it("walks a deterministic config set (premise)", () => {
    for (const v of FILTER_VARS) {
      expect(process.env[v], `${v} is set, so webServer arrays are subsets`).toBeFalsy();
    }
    for (const v of CONTROLLING_ENV) {
      expect(process.env[v], `${v} is set, so the throw set is not deterministic`).toBeUndefined();
    }
    expect(ALL_CONFIGS.length, "*.config.ts in the repo").toBeGreaterThan(1);
  });

  it("every config imports, or is a listed thrower (premise)", async () => {
    const threw: string[] = [];
    for (const file of ALL_CONFIGS) {
      if ((await entriesOf(file)).threw) threw.push(file);
    }
    // A thrower is INVISIBLE to the walk, so an unlisted one is a hole.
    expect(threw.sort()).toEqual(Object.keys(IMPORT_THROWS).sort());
  });

  it("every config holding entries is a listed bearer, and every bearer holds some (premise)", async () => {
    const bearing: string[] = [];
    for (const file of ALL_CONFIGS) {
      if ((await entriesOf(file)).entries.length > 0) bearing.push(file);
    }
    // Set equality, not a count. A count is satisfied by one config while another silently
    // resolves to [] and its entries go unchecked, which is the whole failure this guards.
    expect(bearing.sort()).toEqual([...WEBSERVER_BEARING].sort());
  });

  it.each(ALL_CONFIGS)("%s pins both DB keys on every entry it declares", async (file) => {
    const { entries } = await entriesOf(file);
    // A config declaring no webServer is vacuously fine: it boots no server to pin.
    for (const [i, server] of entries.entries()) {
      const label = `${file} ${server.url ?? `entry ${i}`}`;
      expect(
        server.command ?? "",
        `${label}: the command mentions a database variable, and a shell assignment there is applied AFTER the merged env, so it overrides the pin`,
      ).not.toMatch(DB_VARIABLE_NAME);
      for (const key of DB_KEYS) {
        const value = server.env?.[key];
        expect(
          value,
          `${label}: ${key} unset, so .env.local's validation pooler wins inside the server`,
        ).toBeTruthy();
        expect(new URL(String(value)).host, `${label}: ${key}`).toMatch(LOOPBACK_HOST);
      }
    }
  });
});
