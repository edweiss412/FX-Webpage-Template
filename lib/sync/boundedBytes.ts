import { Readable } from "node:stream";
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
