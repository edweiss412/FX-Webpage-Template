// @vitest-environment node
import { describe, it, expect } from "vitest";
import { summarizeFile } from "./dbTouchReport";

describe("summarizeFile", () => {
  // The zero-touch row is the ENTIRE point of the report. A reporter that only
  // emitted rows for files that connected would make "no DB touch" and "file
  // never ran" indistinguishable — which is precisely the vacuous-pass failure
  // mode that sank the previous spike.
  it("emits a row for a file that opened no socket at all", () => {
    const row = summarizeFile("tests/example/pure.test.ts", []);

    expect(row).toEqual({
      file: "tests/example/pure.test.ts",
      total: 0,
      db: 0,
      targets: [],
    });
  });

  it("counts Postgres and PostgREST connects as DB touches", () => {
    const row = summarizeFile("tests/example/dbbound.test.ts", [
      { file: "tests/example/dbbound.test.ts", host: "127.0.0.1", port: 54322 },
      { file: "tests/example/dbbound.test.ts", host: "127.0.0.1", port: 54321 },
    ]);

    expect(row.total).toBe(2);
    expect(row.db).toBe(2);
    expect(row.targets).toEqual(["127.0.0.1:54321", "127.0.0.1:54322"]);
  });

  // A file may legitimately open non-DB sockets (a local fixture HTTP server,
  // an MSW mock). Those must NOT count toward `db`, or every such file would be
  // wrongly held in the serial project and the measurement would recommend
  // nothing.
  it("does not count a non-DB socket as a DB touch", () => {
    const row = summarizeFile("tests/example/httpmock.test.ts", [
      { file: "tests/example/httpmock.test.ts", host: "127.0.0.1", port: 39001 },
    ]);

    expect(row.total).toBe(1);
    expect(row.db).toBe(0);
  });

  it("deduplicates repeated targets but keeps the raw connect count", () => {
    const row = summarizeFile("tests/example/chatty.test.ts", [
      { file: "tests/example/chatty.test.ts", host: "127.0.0.1", port: 54322 },
      { file: "tests/example/chatty.test.ts", host: "127.0.0.1", port: 54322 },
      { file: "tests/example/chatty.test.ts", host: "127.0.0.1", port: 54322 },
    ]);

    expect(row.total).toBe(3);
    expect(row.db).toBe(3);
    expect(row.targets).toEqual(["127.0.0.1:54322"]);
  });
});
