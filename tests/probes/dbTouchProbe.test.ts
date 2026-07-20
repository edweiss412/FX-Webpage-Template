// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import net from "node:net";
import {
  installDbTouchProbe,
  uninstallDbTouchProbe,
  setCurrentTestFile,
  recordedTouches,
  resetRecordedTouches,
} from "./dbTouchProbe";

// A real listening server, so the probe is exercised against an ACTUAL socket
// connect rather than a stub. Port 0 = OS-assigned, so this never collides with
// the local Supabase ports (54321/54322) or a sibling worktree's dev server.
const server = net.createServer((socket) => socket.end());
let port = 0;

beforeEach(async () => {
  resetRecordedTouches();
  if (port === 0) {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected an AddressInfo from a TCP server");
    }
    port = address.port;
  }
});

afterAll(async () => {
  uninstallDbTouchProbe();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function connectOnce(target: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: target });
    socket.on("connect", () => {
      socket.end();
      resolve();
    });
    socket.on("error", reject);
  });
}

describe("dbTouchProbe", () => {
  it("records a socket connect against the current test file", async () => {
    installDbTouchProbe();
    setCurrentTestFile("tests/example/alpha.test.ts");

    await connectOnce(port);

    const touches = recordedTouches();
    expect(touches).toHaveLength(1);
    expect(touches[0]?.file).toBe("tests/example/alpha.test.ts");
    expect(touches[0]?.port).toBe(port);
  });

  it("attributes each connect to whichever file was current at connect time", async () => {
    installDbTouchProbe();

    setCurrentTestFile("tests/example/alpha.test.ts");
    await connectOnce(port);
    setCurrentTestFile("tests/example/beta.test.ts");
    await connectOnce(port);

    expect(recordedTouches().map((t) => t.file)).toEqual([
      "tests/example/alpha.test.ts",
      "tests/example/beta.test.ts",
    ]);
  });

  // The whole point of the probe is that a file with ZERO connects is
  // distinguishable from one that connected. Without this, a probe that never
  // records anything would pass the positive tests only by accident of ordering.
  it("records nothing for a file that opens no socket", () => {
    installDbTouchProbe();
    setCurrentTestFile("tests/example/gamma.test.ts");

    expect(recordedTouches()).toEqual([]);
  });

  // Behavior-preservation: the probe OBSERVES, it must not break the socket.
  // If installing it changed connect semantics, every DB test in the suite
  // would fail under the probe and the measurement would be worthless.
  it("leaves the socket fully functional", async () => {
    installDbTouchProbe();
    setCurrentTestFile("tests/example/delta.test.ts");

    await expect(connectOnce(port)).resolves.toBeUndefined();
  });

  it("stops recording once uninstalled", async () => {
    installDbTouchProbe();
    setCurrentTestFile("tests/example/epsilon.test.ts");
    uninstallDbTouchProbe();

    await connectOnce(port);

    expect(recordedTouches()).toEqual([]);
  });

  // Idempotence matters because setup.ts runs per test file in a REUSED worker.
  // A probe that wrapped itself once per file would record N duplicates of every
  // connect on the Nth file, silently inflating the touch counts.
  it("does not double-record when installed twice", async () => {
    installDbTouchProbe();
    installDbTouchProbe();
    setCurrentTestFile("tests/example/zeta.test.ts");

    await connectOnce(port);

    expect(recordedTouches()).toHaveLength(1);
  });
});
