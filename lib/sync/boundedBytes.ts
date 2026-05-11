import { Readable, Transform } from "node:stream";
import { createHash } from "node:crypto";

export class ByteLimitExceededError extends Error {
  constructor(readonly limitBytes: number) {
    super(`byte stream exceeded ${limitBytes} bytes`);
    this.name = "ByteLimitExceededError";
  }
}

export type BoundedByteResult = {
  bytes: Uint8Array;
  sha256Base64Url: string;
  md5Hex: string;
};

export type BoundedReadOptions = {
  onChunk?: (byteLength: number) => void;
};

function finalizeChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readBoundedWebStream(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
  options: BoundedReadOptions = {},
): Promise<BoundedByteResult> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel();
        throw new ByteLimitExceededError(limitBytes);
      }
      try {
        options.onChunk?.(value.byteLength);
      } catch (error) {
        await reader.cancel();
        throw error;
      }
      sha256.update(value);
      md5.update(value);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return {
    bytes: finalizeChunks(chunks, total),
    sha256Base64Url: sha256.digest("base64url"),
    md5Hex: md5.digest("hex"),
  };
}

export async function bytesFromWebStream(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<Uint8Array> {
  return (await readBoundedWebStream(stream, limitBytes)).bytes;
}

export async function readBoundedNodeStream(
  stream: Readable | NodeJS.ReadableStream,
  limitBytes: number,
  options: BoundedReadOptions = {},
): Promise<BoundedByteResult> {
  const chunks: Uint8Array[] = [];
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let total = 0;
  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
    total += bytes.byteLength;
    if (total > limitBytes) {
      if ("destroy" in stream) stream.destroy(new ByteLimitExceededError(limitBytes));
      throw new ByteLimitExceededError(limitBytes);
    }
    try {
      options.onChunk?.(bytes.byteLength);
    } catch (error) {
      if ("destroy" in stream) stream.destroy(error instanceof Error ? error : undefined);
      throw error;
    }
    sha256.update(bytes);
    md5.update(bytes);
    chunks.push(bytes);
  }
  return {
    bytes: finalizeChunks(chunks, total),
    sha256Base64Url: sha256.digest("base64url"),
    md5Hex: md5.digest("hex"),
  };
}

export async function bytesFromNodeStream(
  stream: Readable | NodeJS.ReadableStream,
  limitBytes: number,
): Promise<Uint8Array> {
  return (await readBoundedNodeStream(stream, limitBytes)).bytes;
}

/**
 * Pass-through byte-limit transform. Returns a Node Readable that forwards
 * chunks from `input` AND errors out when cumulative bytes exceed
 * `limitBytes`. Use to wrap a Drive media stream before piping into a
 * Response body so an oversized payload never fully materializes in memory
 * (no buffering, no double-copy) AND the worker fails closed at the cap.
 *
 * Codex R2 P1 close-out: the asset routes (reel exact-revision, agenda
 * proxy) consume this so the response body stays a streamed Web
 * ReadableStream rather than a buffered Uint8Array.
 */
export function boundedPassThroughNode(
  input: Readable | NodeJS.ReadableStream,
  limitBytes: number,
): Readable {
  let total = 0;
  const transform = new Transform({
    transform(chunk: Buffer | Uint8Array, _enc, callback) {
      const len =
        chunk instanceof Uint8Array ? chunk.byteLength : Buffer.from(chunk as Buffer).byteLength;
      total += len;
      if (total > limitBytes) {
        callback(new ByteLimitExceededError(limitBytes));
        return;
      }
      callback(null, chunk);
    },
  });
  // Wire error propagation so a Drive-side error doesn't get swallowed.
  input.on("error", (err) => transform.destroy(err));
  (input as Readable).pipe(transform);
  return transform;
}

/**
 * Convenience: wrap a Node Readable in `boundedPassThroughNode` then
 * convert to a Web `ReadableStream<Uint8Array>` for direct use as a
 * `Response` body. Throws `ByteLimitExceededError` on the consumer side
 * if the cap is breached mid-stream.
 */
export function boundedWebStreamFromNode(
  input: Readable | NodeJS.ReadableStream,
  limitBytes: number,
): ReadableStream<Uint8Array> {
  return Readable.toWeb(boundedPassThroughNode(input, limitBytes)) as ReadableStream<Uint8Array>;
}

/**
 * Web-stream variant. Returns a `ReadableStream<Uint8Array>` that
 * forwards from `input` AND errors when cumulative bytes exceed
 * `limitBytes`. No buffering.
 */
export function boundedPassThroughWeb(
  input: ReadableStream<Uint8Array>,
  limitBytes: number,
): ReadableStream<Uint8Array> {
  let total = 0;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > limitBytes) {
        controller.error(new ByteLimitExceededError(limitBytes));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  // Fire-and-forget pipe; errors propagate through the transform to the
  // downstream Response consumer (which surfaces as a stream-aborted
  // response, NOT a worker crash).
  input.pipeTo(transform.writable).catch(() => {
    /* propagated via TransformStream */
  });
  return transform.readable;
}

/**
 * Convenience: wrap a single buffered Uint8Array in a Web ReadableStream
 * so a Response body can be returned without an extra ArrayBuffer copy.
 * The byte ceiling is asserted up-front (synchronously) — the caller is
 * expected to know the buffered size.
 */
export function webStreamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
