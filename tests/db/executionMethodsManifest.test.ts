import { describe, expect, it } from "vitest";

import { deriveExecutionMethods } from "@/scripts/execution-methods/lib";

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
});
