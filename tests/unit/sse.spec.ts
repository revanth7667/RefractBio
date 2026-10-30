import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSSE, type SSEMessage } from '../../src/providers/sse';

function createStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<SSEMessage[]> {
  const events: SSEMessage[] = [];
  for await (const msg of parseSSE(stream, signal)) {
    events.push(msg);
  }
  return events;
}

describe('SSE Parser (src/providers/sse.ts)', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/sse/generic.txt');
  const fixtureBytes = fs.readFileSync(fixturePath);

  it('correctly parses generic SSE fixture in a single chunk', async () => {
    const stream = createStreamFromChunks([fixtureBytes]);
    const events = await collectEvents(stream);

    expect(events).toEqual([
      { event: 'start', data: '{"type":"init","status":"ready"}' },
      { event: undefined, data: 'line 1\nline 2\nline 3' },
      { event: 'unicode', data: 'Hello 🌍 world!' },
      { event: 'final', data: '{"done":true}' },
    ]);
  });

  it('handles chunk boundaries mid-line', async () => {
    // Split into tiny 7-byte chunks to force mid-line splits everywhere
    const chunkSize = 7;
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < fixtureBytes.length; i += chunkSize) {
      chunks.push(fixtureBytes.subarray(i, i + chunkSize));
    }

    const stream = createStreamFromChunks(chunks);
    const events = await collectEvents(stream);

    expect(events).toEqual([
      { event: 'start', data: '{"type":"init","status":"ready"}' },
      { event: undefined, data: 'line 1\nline 2\nline 3' },
      { event: 'unicode', data: 'Hello 🌍 world!' },
      { event: 'final', data: '{"done":true}' },
    ]);
  });

  it('handles chunk boundaries mid-UTF-8 multi-byte character', async () => {
    // Locate the emoji 🌍 in fixtureBytes: 0xF0, 0x9F, 0x8C, 0x8D
    const emojiIndex = fixtureBytes.findIndex(
      (b, idx) =>
        b === 0xf0 &&
        fixtureBytes[idx + 1] === 0x9f &&
        fixtureBytes[idx + 2] === 0x8c &&
        fixtureBytes[idx + 3] === 0x8d
    );
    expect(emojiIndex).toBeGreaterThan(0);

    // Split right in the middle of the 4-byte UTF-8 sequence (after 2 bytes)
    const splitPoint = emojiIndex + 2;
    const chunk1 = fixtureBytes.subarray(0, splitPoint);
    const chunk2 = fixtureBytes.subarray(splitPoint);

    const stream = createStreamFromChunks([chunk1, chunk2]);
    const events = await collectEvents(stream);

    expect(events[2]).toEqual({ event: 'unicode', data: 'Hello 🌍 world!' });
  });

  it('handles single-byte chunks (stress test chunk boundaries)', async () => {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < fixtureBytes.length; i++) {
      chunks.push(fixtureBytes.subarray(i, i + 1));
    }

    const stream = createStreamFromChunks(chunks);
    const events = await collectEvents(stream);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ event: 'start', data: '{"type":"init","status":"ready"}' });
    expect(events[1]).toEqual({ event: undefined, data: 'line 1\nline 2\nline 3' });
    expect(events[2]).toEqual({ event: 'unicode', data: 'Hello 🌍 world!' });
    expect(events[3]).toEqual({ event: 'final', data: '{"done":true}' });
  });

  it('dispatches final event even when stream terminates without a trailing blank line', async () => {
    // generic.txt ends with `data: {"done":true}` and no trailing newline
    const stream = createStreamFromChunks([fixtureBytes]);
    const events = await collectEvents(stream);
    const last = events[events.length - 1];
    expect(last).toEqual({ event: 'final', data: '{"done":true}' });
  });

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(fixtureBytes.subarray(0, 20));
        controller.abort();
      },
    });

    await expect(collectEvents(stream, controller.signal)).rejects.toThrow();
  });
});

