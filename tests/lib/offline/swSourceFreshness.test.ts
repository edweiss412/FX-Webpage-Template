import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { SW_SOURCE } from "@/lib/offline/__generated__/swSource";
import { CACHE_PREFIX } from "@/lib/offline/storeSchema";
import { buildSwSource } from "@/scripts/generate-sw-source";

// The committed worker bundle against the sources it was built from (spec
// 4.1, the gen:spec-codes pattern), and the modules that bundle may contain.
//
// The bundle is built once and shared. Every case reads the FRESH build, never
// only the committed string: a stale or empty committed bundle must not let a
// content scan pass over nothing.

const built = buildSwSource();

/** The worker runs in a browser, so these must never be reachable from its entry. */
const SERVER_ONLY_MODULES: readonly string[] = [
  "lib/offline/viewerKey.ts",
  "lib/offline/serverMarkers.ts",
  "lib/offline/killSwitch.ts",
  "lib/offline/statusLifecycle.ts",
  "lib/offline/assetList.ts",
];
const WORKER_ROOT = "lib/offline/";
const CLIENT_DIR = "lib/offline/client/";

/** Inputs the worker bundle must not contain: outside lib/offline/, server-only, or page-side. */
function disallowedInputs(inputs: readonly string[]): string[] {
  return inputs.filter(
    (input) =>
      !input.startsWith(WORKER_ROOT) ||
      SERVER_ONLY_MODULES.includes(input) ||
      input.startsWith(CLIENT_DIR),
  );
}

const FORBIDDEN_IN_BUNDLE: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  ["process.env", /process\.env/],
  ["require(", /require\(/],
  ["a node: specifier", /["'`]node:/],
];

function forbiddenIn(code: string): string[] {
  return FORBIDDEN_IN_BUNDLE.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
}

describe("the committed service worker bundle", () => {
  test("is what a fresh build of the worker sources produces", async () => {
    const { code } = await built;
    // Both sides empty would be equal: the fresh build must have real content.
    premise("a fresh build is not empty", code.length, 0);
    expect(
      SW_SOURCE === code,
      "lib/offline/__generated__/swSource.ts is stale. Run `pnpm gen:sw` and commit the result.",
    ).toBe(true);
  });
});

describe("what the worker bundle contains", () => {
  test("every input is a worker-safe module under lib/offline/", async () => {
    const { inputs } = await built;
    premise("the bundle has inputs", inputs.length, 0);
    premiseHolds(
      "the worker's install module is among the inputs",
      inputs.includes("lib/offline/worker/install.ts"),
    );
    expect(disallowedInputs(inputs)).toEqual([]);
  });

  test("the input check flags each way a module can be out of bounds", () => {
    // The check above passes on a clean list, so give it one that is not: one
    // module per rule, plus two that must stay allowed.
    const dirty = [
      "lib/offline/worker/install.ts",
      "lib/offline/idbStore.ts",
      "lib/offline/viewerKey.ts",
      "lib/offline/client/messaging.ts",
      "lib/messages/catalog.ts",
      "node_modules/esbuild/lib/main.js",
    ];
    expect(disallowedInputs(dirty)).toEqual([
      "lib/offline/viewerKey.ts",
      "lib/offline/client/messaging.ts",
      "lib/messages/catalog.ts",
      "node_modules/esbuild/lib/main.js",
    ]);
  });

  test("the bundle has no process.env, require( or node: specifier", async () => {
    const { code } = await built;
    // The scan is only about the worker if the bundle carries worker content:
    // the cache-name prefix is a string literal in the schema module the
    // worker's handlers import, and the cache names are built from it.
    premiseHolds(
      "the bundle carries the worker's cache-name prefix",
      code.includes(JSON.stringify(CACHE_PREFIX)),
    );
    expect(forbiddenIn(code)).toEqual([]);
  });

  test("the bundle scan finds each forbidden form", () => {
    const dirty = `const a = process.env.X; const b = require("y"); import "node:fs";`;
    expect(forbiddenIn(dirty)).toEqual(["process.env", "require(", "a node: specifier"]);
  });
});
