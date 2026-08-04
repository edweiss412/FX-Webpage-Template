import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const T = 60000;

/**
 * AC-35 / M82 — the CLI must survive being captured through a pipe.
 *
 * `process.stdout.write` is ASYNC on a pipe and SYNC to a file, so a
 * `process.exit()` on the next statement truncates piped output only. The
 * fixture therefore has to be big enough to lose that race: a small report
 * flushes before exit and the known-bad build passes every assertion. Measured
 * during design — a 305-byte report gives bufferEqual=true, summary=true
 * against `process.exit()`, while a 56 KB one truncates to 16384.
 */
const BIG = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";

describe("spec-lint CLI drains stdout on a pipe (design §2.2.3)", () => {
  it(
    "the fixture is large enough to expose the race",
    () => {
      const file = join(tmpdir(), `drain-${process.pid}.txt`);
      try {
        execFileSync(
          `${JSON.stringify(process.execPath)} ${JSON.stringify(TSX)} scripts/spec-lint.ts ${BIG} > ${JSON.stringify(file)}`,
          { cwd: ROOT, shell: "/bin/sh", encoding: "utf8" },
        );
      } catch {
        /* non-zero exit is fine: findings are expected */
      }
      const bytes = readFileSync(file).length;
      rmSync(file, { force: true });
      // Below the pipe buffer the race cannot be observed and this whole file
      // would certify the defect it exists to prevent.
      expect(bytes).toBeGreaterThan(64 * 1024);
    },
    T,
  );

  it(
    "piped capture is BYTE-IDENTICAL to a redirect, and ends with summary:",
    () => {
      const file = join(tmpdir(), `drain-file-${process.pid}.txt`);
      try {
        execFileSync(
          `${JSON.stringify(process.execPath)} ${JSON.stringify(TSX)} scripts/spec-lint.ts ${BIG} > ${JSON.stringify(file)}`,
          { cwd: ROOT, shell: "/bin/sh", encoding: "utf8" },
        );
      } catch {
        /* findings expected */
      }
      const viaFile = readFileSync(file);
      rmSync(file, { force: true });

      const piped = spawnSync(process.execPath, [TSX, "scripts/spec-lint.ts", BIG], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
      const viaPipe = piped.stdout;

      // Compare the BUFFERS. Equal byteLength is a proxy two different reports
      // of the same size both satisfy; String.length counts UTF-16 code units
      // and reads a byte-identical em-dash-heavy report as a shortfall.
      expect(Buffer.compare(viaPipe, viaFile)).toBe(0);
      expect(viaPipe.toString().trimEnd().split("\n").pop()).toMatch(/^summary:/);
    },
    T,
  );
});
