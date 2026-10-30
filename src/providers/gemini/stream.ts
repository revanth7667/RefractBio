/**
 * Gemini SSE stream processing.
 * Spec §4 (V7, V14) and Implementation Decisions in docs/provider-findings.md.
 */

import { parseSSE } from '../sse';
import type { GenerateResult } from '../types';
import { mapProviderError } from '../errors';

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
    finishReason?: string;
    index?: number;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

export async function processGeminiStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  apiKey?: string
): Promise<GenerateResult> {
  let accumulatedText = '';
  let finishReason: string | undefined = undefined;
  let truncated = false;

  for await (const msg of parseSSE(stream, signal)) {
    if (!msg.data) continue;

    let chunk: GeminiStreamChunk;
    try {
      chunk = JSON.parse(msg.data) as GeminiStreamChunk;
    } catch {
      continue;
    }

    if (chunk.promptFeedback?.blockReason) {
      throw mapProviderError({
        provider: 'Gemini',
        key: apiKey,
        bodyText: JSON.stringify({
          error: { message: `Request blocked by safety policy: ${chunk.promptFeedback.blockReason}` },
        }),
      });
    }

    const candidate = chunk.candidates?.[0];
    if (candidate) {
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (typeof part.text === 'string' && part.text.length > 0) {
            accumulatedText += part.text;
            onDelta(part.text);
          }
        }
      }

      if (candidate.finishReason) {
        finishReason = candidate.finishReason;
        if (candidate.finishReason === 'MAX_TOKENS') {
          truncated = true;
        } else if (
          candidate.finishReason === 'SAFETY' ||
          candidate.finishReason === 'BLOCKLIST' ||
          candidate.finishReason === 'PROHIBITED_CONTENT'
        ) {
          throw mapProviderError({
            provider: 'Gemini',
            key: apiKey,
            bodyText: JSON.stringify({
              error: { message: `Generation stopped due to safety policy: ${candidate.finishReason}` },
            }),
          });
        }
      }
    }
  }

  return {
    text: accumulatedText,
    finishReason,
    truncated,
  };
}

