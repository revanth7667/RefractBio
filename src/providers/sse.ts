/**
 * Generic SSE line parser.
 * Spec §13.2: decodes UTF-8 stream chunks, buffers partial lines,
 * and yields { event?: string, data: string } SSE events.
 */

export interface SSEMessage {
  event?: string;
  data: string;
}

export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SSEMessage, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent: string | undefined = undefined;
  let currentDataLines: string[] = [];

  const dispatch = (): SSEMessage | null => {
    if (currentDataLines.length > 0 || currentEvent !== undefined) {
      const msg: SSEMessage = {
        event: currentEvent,
        data: currentDataLines.join('\n'),
      };
      currentEvent = undefined;
      currentDataLines = [];
      return msg;
    }
    return null;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason || new DOMException('The operation was aborted.', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) {
        // Flush remaining decoder bytes
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        if (signal?.aborted) {
          throw signal.reason || new DOMException('The operation was aborted.', 'AbortError');
        }

        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        // Strip trailing \r
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }

        // Empty line triggers dispatch of accumulated event
        if (line === '') {
          const msg = dispatch();
          if (msg) {
            yield msg;
          }
          continue;
        }

        // Comment line
        if (line.startsWith(':')) {
          continue;
        }

        // Event line
        if (line.startsWith('event:')) {
          const raw = line.slice(6);
          currentEvent = raw.startsWith(' ') ? raw.slice(1) : raw;
          continue;
        }

        // Data line
        if (line.startsWith('data:')) {
          const raw = line.slice(5);
          const content = raw.startsWith(' ') ? raw.slice(1) : raw;
          currentDataLines.push(content);
          continue;
        }

        // Other fields (id, retry, etc.) are ignored per SSE spec
      }
    }

    // Process any remaining non-empty line in buffer at stream end
    if (buffer.length > 0) {
      let line = buffer;
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      if (line.startsWith('data:')) {
        const raw = line.slice(5);
        currentDataLines.push(raw.startsWith(' ') ? raw.slice(1) : raw);
      } else if (line.startsWith('event:')) {
        const raw = line.slice(6);
        currentEvent = raw.startsWith(' ') ? raw.slice(1) : raw;
      }
    }

    // Stream ended: dispatch any trailing event even if no trailing blank line
    const finalMsg = dispatch();
    if (finalMsg) {
      yield finalMsg;
    }
  } finally {
    reader.releaseLock();
  }
}
