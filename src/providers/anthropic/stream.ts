/**
 * Anthropic SSE stream processing.
 * Spec §4 (V4, V14) and Implementation Decisions in docs/provider-findings.md.
 */

import { parseSSE } from '../sse';
import type { GenerateResult } from '../types';
import { mapProviderError } from '../errors';

export async function processAnthropicStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  apiKey?: string
): Promise<GenerateResult> {
  let accumulatedText = '';
  let finishReason: string | undefined = undefined;
  let truncated = false;

  for await (const msg of parseSSE(stream, signal)) {
    if (msg.event === 'error') {
      throw mapProviderError({
        provider: 'Anthropic',
        key: apiKey,
        bodyText: msg.data,
      });
    }

    if (msg.event === 'content_block_delta') {
      try {
        const json = JSON.parse(msg.data);
        const delta = json.delta;
        if (delta && delta.type === 'text_delta' && typeof delta.text === 'string') {
          accumulatedText += delta.text;
          onDelta(delta.text);
        }
      } catch {
        // Ignore unparseable non-critical delta chunks
      }
    } else if (msg.event === 'message_delta') {
      try {
        const json = JSON.parse(msg.data);
        const reason = json.delta?.stop_reason;
        if (typeof reason === 'string') {
          finishReason = reason;
          if (reason === 'max_tokens') {
            truncated = true;
          }
        }
      } catch {
        // Ignore unparseable metadata chunks
      }
    }
  }

  return {
    text: accumulatedText,
    finishReason,
    truncated,
  };
}

