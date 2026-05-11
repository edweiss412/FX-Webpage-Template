import { Readable } from "node:stream";

export class ByteLimitExceededError extends Error {
  constructor(readonly limitBytes: number) {
    super(`byte stream exceeded ${limitBytes} bytes`);
    this.name = "ByteLimitExceededError";
  }
}

export async function bytesFromWebStream(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
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
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function bytesFromNodeStream(
  stream: Readable | NodeJS.ReadableStream,
  limitBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
    total += bytes.byteLength;
    if (total > limitBytes) {
      if ("destroy" in stream) stream.destroy(new ByteLimitExceededError(limitBytes));
      throw new ByteLimitExceededError(limitBytes);
    }
    chunks.push(bytes);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
