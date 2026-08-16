import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { deriveExecutionMethods } from "@/scripts/execution-methods/lib";

import { premiseHolds } from "../_shared/premise";
import { EXECUTION_METHODS } from "./_destructiveFileAnalysis";
import {
  POSTGRES_EXECUTION_CORE,
  POSTGRES_PARAMETER_MEMBERS,
  POSTGRES_TYPES_VERSION,
} from "./__generated__/postgresExecutionMethods";

const DRIVER_PACKAGE_JSON = "node_modules/postgres/package.json";

describe("deriveExecutionMethods (spec 2026-08-16 §2.1/§2.5)", () => {
  it("collects methods returning PendingQuery, deduplicating overloads", () => {
    const src = `
      interface ISql {
        unsafe(query: string): PendingQuery<Row[]>;
        file(path: string): PendingQuery<Row[]>;
        file(path: string, args: unknown[]): PendingQuery<Row[]>;
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["file", "unsafe"]);
  });

  it("collects PendingRequest and ListenRequest returners", () => {
    const src = `
      interface Sql {
        notify(channel: string, payload: string): PendingRequest;
        listen(channel: string, fn: (v: string) => void): ListenRequest;
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["listen", "notify"]);
  });

  it("does not collect a method returning a Promise (the begin shape)", () => {
    const src = `interface Sql { begin<T>(cb: (sql: unknown) => T): Promise<T>; }`;
    expect(deriveExecutionMethods(src)).toEqual({ core: [], parameterMembers: [] });
  });

  it("routes Parameter and ArrayParameter returners to parameterMembers", () => {
    const src = `
      interface ISql {
        json(value: unknown): Parameter;
        array(value: unknown[]): ArrayParameter<unknown[]>;
      }`;
    const out = deriveExecutionMethods(src);
    expect(out.core).toEqual([]);
    expect(out.parameterMembers).toEqual(["array", "json"]);
  });

  it("ignores property signatures whose type is a function returning Parameter (the typed shape)", () => {
    const src = `interface ISql { typed: (value: unknown, oid: number) => Parameter; }`;
    expect(deriveExecutionMethods(src)).toEqual({ core: [], parameterMembers: [] });
  });

  it("collects a qualified return reference (postgres.PendingQuery)", () => {
    const src = `interface ISql { unsafe(q: string): postgres.PendingQuery<Row[]>; }`;
    expect(deriveExecutionMethods(src).core).toEqual(["unsafe"]);
  });

  it("ignores a method with no return annotation", () => {
    const src = `interface ISql { unsafe(q: string); }`;
    expect(deriveExecutionMethods(src).core).toEqual([]);
  });

  it("walks interfaces inside a declare-namespace block (the real driver file's shape)", () => {
    const src = `
      declare namespace postgres {
        interface ISql { unsafe(q: string): PendingQuery<Row[]>; }
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["unsafe"]);
  });

  it("does not collect a method signature inside a type literal (the toJSON shape, spec §4)", () => {
    const src = `type JSONValue = string | { toJSON(): PendingQuery<Row[]> };`;
    expect(deriveExecutionMethods(src).core).toEqual([]);
  });

  it("does not collect a PROPERTY signature annotated with a core return type", () => {
    // Repays the one unaccepted survivor of the first enrolment run,
    // logical-connector:44:43 (`||` -> `&&` in the member guard). Under that
    // mutant a PropertySignature no longer short-circuits: `!isMethodSignature`
    // is true but `!isIdentifier` is false, so the guard stops skipping and
    // `pending` is collected as an execution method.
    //
    // The existing `typed` arm cannot reach this: its annotation is a
    // FunctionType, so `headIdentifier` returns null and the walk falls through
    // harmlessly whether or not the guard fired. Only a property whose
    // annotation is ITSELF a core head discriminates the two.
    const src = `interface ISql { pending: PendingQuery<Row[]>; }`;
    expect(deriveExecutionMethods(src).core).toEqual([]);
  });
});

describe("generated execution-methods module (spec §2.4)", () => {
  it("version sentinel: the committed module matches the installed driver", () => {
    const raw = readFileSync(DRIVER_PACKAGE_JSON, "utf8");
    const installed = (JSON.parse(raw) as { version: string }).version;
    // The suite's one environment-touching test (premise-contract classification,
    // Task 6): its premise is that the installed driver actually yielded a version.
    premiseHolds("installed driver package.json yields a version", installed.length > 0);
    expect(
      POSTGRES_TYPES_VERSION,
      "stale generated module -- run: pnpm gen:execution-methods",
    ).toBe(installed);
  });

  it("disjointness: no parameter member is in either half of the composition", () => {
    // Without this the arm is a loop over a possibly-empty array: an empty
    // POSTGRES_PARAMETER_MEMBERS makes it pass vacuously, and forever. Spec §2.4
    // arm 4 reasons about vacuity but closes only the empty-CORE vector; it
    // makes no claim about this array (BL-GUARD-PREMISE-REACHABILITY).
    premiseHolds(
      "the derivation produced parameter members to test disjointness against",
      POSTGRES_PARAMETER_MEMBERS.length > 0,
    );
    for (const name of POSTGRES_PARAMETER_MEMBERS) {
      expect(POSTGRES_EXECUTION_CORE).not.toContain(name);
    }
  });

  it("premise guard: the derivation floor members are present (spec §2.4 arm 4)", () => {
    premiseHolds(
      "the derivation produced a non-collapsed core",
      POSTGRES_EXECUTION_CORE.length > 0,
    );
    expect(POSTGRES_EXECUTION_CORE).toContain("unsafe");
    expect(POSTGRES_EXECUTION_CORE).toContain("file");
  });

  it("composition pin: the analyzer's exported set is exactly the shipped 10 members", () => {
    expect([...EXECUTION_METHODS].sort()).toEqual([
      "begin",
      "cursor",
      "end",
      "file",
      "listen",
      "notify",
      "reserve",
      "savepoint",
      "subscribe",
      "unsafe",
    ]);
  });

  it("disjointness covers the hand list too", () => {
    // Same vacuity vector as the arm above: an empty POSTGRES_PARAMETER_MEMBERS
    // would make this loop assert nothing while still reporting green.
    premiseHolds(
      "the derivation produced parameter members to test the hand list against",
      POSTGRES_PARAMETER_MEMBERS.length > 0,
    );
    for (const name of POSTGRES_PARAMETER_MEMBERS) {
      expect(EXECUTION_METHODS.has(name)).toBe(false);
    }
  });
});
