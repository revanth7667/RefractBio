/**
 * Anthropic wire contract implementation.
 * Spec §4 (V1, V2, V3) and Implementation Decisions in docs/provider-findings.md.
 */

import type { AssembledPrompt } from '../types';
import generationDefaults from '../../data/generation-defaults.json';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2026-10-21';

export function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

export function buildAnthropicGenerateBody(
  model: string,
  prompt: AssembledPrompt,
  maxTokens: number = generationDefaults.anthropicMaxTokens || 4096
): unknown {
  const content = prompt.userParts.map((part) => {
    if (part.type === 'text') {
      return {
        type: 'text',
        text: part.text,
      };
    }
    if (part.type === 'image') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mime,
          data: part.base64,
        },
      };
    }
    if (part.type === 'pdf') {
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: part.base64,
        },
      };
    }
    throw new Error(`Unsupported prompt part type: ${(part as { type: string }).type}`);
  });

  return {
    model,
    max_tokens: maxTokens,
    stream: true,
    system: prompt.system,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  };
}

