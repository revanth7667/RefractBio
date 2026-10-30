/**
 * Gemini wire contract implementation.
 * Spec §4 (V5, V6) and Implementation Decisions in docs/provider-findings.md.
 */

import type { AssembledPrompt } from '../types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function buildGeminiHeaders(apiKey: string): Record<string, string> {
  return {
    'x-goog-api-key': apiKey,
    'content-type': 'application/json',
  };
}

export function cleanGeminiModelId(model: string): string {
  return model.replace(/^models\//, '');
}

export function buildGeminiStreamUrl(model: string): string {
  const clean = cleanGeminiModelId(model);
  return `${GEMINI_BASE_URL}/models/${clean}:streamGenerateContent?alt=sse`;
}

export function buildGeminiGenerateBody(prompt: AssembledPrompt): unknown {
  const parts = prompt.userParts.map((part) => {
    if (part.type === 'text') {
      return {
        text: part.text,
      };
    }
    if (part.type === 'image') {
      return {
        inlineData: {
          mimeType: part.mime,
          data: part.base64,
        },
      };
    }
    if (part.type === 'pdf') {
      return {
        inlineData: {
          mimeType: 'application/pdf',
          data: part.base64,
        },
      };
    }
    throw new Error(`Unsupported prompt part type: ${(part as { type: string }).type}`);
  });

  return {
    systemInstruction: {
      parts: [
        {
          text: prompt.system,
        },
      ],
    },
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  };
}

