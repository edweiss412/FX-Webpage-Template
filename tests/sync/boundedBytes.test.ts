/**
 * tests/sync/boundedBytes.test.ts — M7 close-out coverage for the
 * byte-bounded stream helpers introduced for the reel + agenda asset
 * routes (Codex R2 + R3 audits).
 *
 * Three contracts pinned here:
 *
 *   1. `boundedPassThroughNode` errors at the cap WITHOUT buffering — the
 *      consumer sees an aborted stream, not an unbounded allocation.
 *   2. `readChunkedHashBoundedNodeStream` (Codex R3 close-out) retains a
 *      single chunk-list reference + the running hash, and DOES NOT call
 *      `finalizeChunks` to copy them into a contiguous Uint8Array — total
 *      residency stays at 1x the body size for a hash-then-stream flow.
 *   3. `webStreamFromChunks` enqueues every chunk by reference (no copy).
 */
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import {
  ByteLimitExceededError,
  boundedPassThroughNode,
  readChunkedHashBoundedNodeStream,
  webStreamFromChunks,
} from "@/lib/sync/boundedBytes";

function chunkOf(byte: number, length: number): Uint8Array {
  const buf = new Uint8Array(length);
  buf.fill(byte);
  return buf;
}

async function drain(stream: Readable): Promise<{ total: number; chunks: Uint8Array[] }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const c of stream) {
    const u8 = c instanceof Uint8Array ? c : new Uint8Array(c as ArrayBuffer);
    chunks.push(u8);
    total += u8.byteLength;
  }
  return { total, chunks };
}

describe("boundedPassThroughNode", () => {
  test("forwards bytes under cap with byte-identical pass-through", async () => {
    const source = Readable.from([chunkOf(0xab, 4), chunkOf(0xcd, 4)]);
    const bounded = boundedPassThroughNode(source, 16);
    const { chunks, total } = await drain(bounded);
    expect(total).toBe(8);
    // Concatenated payload preserves the original bytes regardless of
    // how Node coalesces chunks across the Transform boundary.
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      joined.set(c, offset);
      offset += c.byteLength;
    }
    expect(joined[0]).toBe(0xab);
    expect(joined[3]).toBe(0xab);
    expect(joined[4]).toBe(0xcd);
    expect(joined[7]).toBe(0xcd);
  });

  test("aborts mid-stream when cumulative byte count crosses the cap", async () => {
    const source = Readable.from([chunkOf(0x00, 6), chunkOf(0x00, 6), chunkOf(0x00, 6)]);
    const bounded = boundedPassThroughNode(source, 10);
    await expect(drain(bounded)).rejects.toBeInstanceOf(ByteLimitExceededError);
  });
});

describe("readChunkedHashBoundedNodeStream (Codex R3 P1)", () => {
  test("returns a chunk list, NOT a finalized contiguous Uint8Array", async () => {
    const a = chunkOf(0x10, 4);
    const b = chunkOf(0x20, 4);
    const c = chunkOf(0x30, 4);
    const source = Readable.from([a, b, c]);
    const result = await readChunkedHashBoundedNodeStream(source, 64);
    expect(result.totalBytes).toBe(12);
    // The contract is that we return an array of chunks (no
    // `finalizeChunks` copy step). Chunk count may vary because Node
    // coalesces under the hood; what matters is the bytes are
    // preserved verbatim AND the result type is an array of references,
    // not a single finalized Uint8Array.
    expect(Array.isArray(result.chunks)).toBe(true);
    const joined = new Uint8Array(result.totalBytes);
    let offset = 0;
    for (const chunk of result.chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(joined[0]).toBe(0x10);
    expect(joined[4]).toBe(0x20);
    expect(joined[11]).toBe(0x30);
  });

  test("md5 + sha256 match a single-pass hash over the concatenation", async () => {
    const a = new TextEncoder().encode("hello ");
    const b = new TextEncoder().encode("world");
    const source = Readable.from([a, b]);
    const result = await readChunkedHashBoundedNodeStream(source, 64);
    const expectedMd5 = createHash("md5").update("hello world").digest("hex");
    const expectedSha = createHash("sha256").update("hello world").digest("base64url");
    expect(result.md5Hex).toBe(expectedMd5);
    expect(result.sha256Base64Url).toBe(expectedSha);
  });

  test("aborts when cumulative bytes exceed the cap (no oversized chunk[] left dangling)", async () => {
    const source = Readable.from([chunkOf(0x00, 8), chunkOf(0x00, 8)]);
    await expect(readChunkedHashBoundedNodeStream(source, 10)).rejects.toBeInstanceOf(
      ByteLimitExceededError,
    );
  });
});

describe("webStreamFromChunks", () => {
  test("enqueues every chunk verbatim — concatenating yields the original bytes", async () => {
    const a = new TextEncoder().encode("foo");
    const b = new TextEncoder().encode("bar");
    const c = new TextEncoder().encode("baz");
    const stream = webStreamFromChunks([a, b, c]);
    const reader = stream.getReader();
    const collected: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      collected.push(value);
    }
    expect(collected.length).toBe(3);
    expect(new TextDecoder().decode(collected[0])).toBe("foo");
    expect(new TextDecoder().decode(collected[1])).toBe("bar");
    expect(new TextDecoder().decode(collected[2])).toBe("baz");
  });

  test("each emitted chunk is the same reference passed in (no copy)", async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const stream = webStreamFromChunks([a]);
    const reader = stream.getReader();
    const { value } = await reader.read();
    // Same buffer + offset means React/Response can hand the view to the
    // network without an intermediate copy. Asserts the no-copy contract.
    expect(value).toBe(a);
  });
});
