/**
 * Provider error classification and plain-English mapping.
 * Spec §13.5.
 */

import type { AppError } from '../types';
import { redact } from './redact';

const cspViolatedHosts = new Set<string>();

function recordCspViolation(blockedUri: string): void {
  try {
    const url = new URL(blockedUri);
    cspViolatedHosts.add(url.hostname);
  } catch {
    cspViolatedHosts.add(blockedUri);
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('securitypolicyviolation', (e) => {
    if (e.blockedURI) {
      recordCspViolation(e.blockedURI);
    }
  });
}

export function extractHost(rawUrl?: string): string {
  if (!rawUrl) return 'the server';
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname;
  } catch {
    // If not a full URL, strip any protocol, path, port or query
    const clean = rawUrl.replace(/^[a-zA-Z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0];
    return clean || 'the server';
  }
}

export function parseRetryAfter(headerValue?: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  const seconds = parseInt(trimmed, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    const diffSec = Math.ceil((date - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 0;
  }
  return undefined;
}

export function extractErrorMessage(bodyText?: string): string | undefined {
  if (!bodyText) return undefined;
  try {
    const json = JSON.parse(bodyText);
    if (json.error && typeof json.error === 'object') {
      if (typeof json.error.message === 'string') {
        return json.error.message;
      }
    }
    if (typeof json.message === 'string') {
      return json.message;
    }
  } catch {
    // Not valid JSON; use raw bodyText
  }
  return bodyText;
}

export interface ErrorMappingOptions {
  provider: string; // e.g. "Anthropic" or "Gemini"
  url?: string;
  key?: string;
  model?: string;
  httpStatus?: number;
  retryAfterHeader?: string | null;
  rawError?: unknown;
  bodyText?: string;
}

export function mapProviderError(opts: ErrorMappingOptions): AppError {
  const host = extractHost(opts.url);
  const provider = opts.provider;
  const key = opts.key;
  const model = opts.model || 'selected';
  const status = opts.httpStatus;

  // Extract raw detail message if present
  let rawDetail = extractErrorMessage(opts.bodyText);
  if (!rawDetail && opts.rawError instanceof Error) {
    rawDetail = opts.rawError.message;
  }

  // Redact key and truncate detail to 500 chars
  const detail = rawDetail ? redact(rawDetail, key).slice(0, 500) : undefined;

  // 1. Check for abort
  if (
    (opts.rawError instanceof DOMException && opts.rawError.name === 'AbortError') ||
    (opts.rawError instanceof Error && opts.rawError.name === 'AbortError')
  ) {
    return {
      category: 'aborted',
      message: 'Request was aborted.',
      detail,
    };
  }

  // 2. Check for fetch TypeError (network / CORS / offline / CSP)
  if (opts.rawError instanceof TypeError || (opts.rawError instanceof Error && opts.rawError.name === 'TypeError')) {
    if (cspViolatedHosts.has(host)) {
      return {
        category: 'csp_blocked',
        message: `This app's security policy blocked the request to ${host}. The hosted app only allows the Anthropic and Gemini addresses.`,
        detail,
      };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        category: 'cors_or_network',
        message: 'You appear to be offline. Check your connection and try again.',
        detail,
      };
    }
    return {
      category: 'cors_or_network',
      message: `The request to ${host} was blocked before it reached the provider. This is usually caused by a browser extension (ad or privacy blocker), a VPN, a firewall or a work network. Try turning extensions off for this page, switching networks, or using the other provider. If it keeps happening, the provider may no longer allow requests from web pages; see Help.`,
      detail,
    };
  }

  // 3. HTTP Status mappings
  if (status === 401 || status === 403) {
    return {
      category: 'auth',
      httpStatus: status,
      message: `The provider rejected your API key. Check that you pasted the whole key for ${provider}.`,
      detail,
    };
  }

  if (status === 404) {
    return {
      category: 'model_not_found',
      httpStatus: status,
      message: `The model "${model}" wasn't found or isn't available to your key. Pick another model or check the ID.`,
      detail,
    };
  }

  const detailLower = (detail || '').toLowerCase();

  if (status === 413 || detailLower.includes('too large') || detailLower.includes('payload too large') || detailLower.includes('request exceeds')) {
    return {
      category: 'too_large',
      httpStatus: status,
      message: 'The request is too large for this provider. Remove or shrink attachments, or shorten your Master Info.',
      detail,
    };
  }

  if (
    status === 400 &&
    (detailLower.includes('image') ||
      detailLower.includes('pdf') ||
      detailLower.includes('document') ||
      detailLower.includes('mime') ||
      detailLower.includes('media_type'))
  ) {
    return {
      category: 'unsupported_input',
      httpStatus: status,
      message: 'This model may not read images or PDFs. Remove the file or pick another model.',
      detail,
    };
  }

  if (status === 400) {
    return {
      category: 'bad_request',
      httpStatus: status,
      message: detail ? `The provider rejected the request: ${detail}` : 'The provider rejected the request.',
      detail,
    };
  }

  if (status === 429) {
    const retryAfterSeconds = parseRetryAfter(opts.retryAfterHeader);
    const retryMsg =
      retryAfterSeconds !== undefined && retryAfterSeconds > 0
        ? `Try again in ${retryAfterSeconds} seconds.`
        : 'Wait a moment and press Retry.';
    return {
      category: 'rate_limit',
      httpStatus: status,
      retryAfterSeconds,
      message: `Rate limit reached for ${provider}. ${retryMsg}`,
      detail,
    };
  }

  if (status && status >= 500 && status <= 599) {
    return {
      category: 'server',
      httpStatus: status,
      message: `${provider} had a server problem. Press Retry in a moment.`,
      detail,
    };
  }

  // Safety blocked (text heuristic when no status-based row matched, SPEC §13.5)
  if (detailLower.includes('safety') || detailLower.includes('blocked') || detailLower.includes('harm_category')) {
    return {
      category: 'safety_blocked',
      httpStatus: status,
      message: 'The provider blocked this response. Try rephrasing your custom instructions or check the job context.',
      detail,
    };
  }

  // 4. Unknown / fallback
  return {
    category: 'unknown',
    httpStatus: status,
    message: detail ? `Something went wrong: ${detail}` : 'Something went wrong.',
    detail,
  };
}
