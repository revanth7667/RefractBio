import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mapProviderError,
  extractHost,
  parseRetryAfter,
} from '../../src/providers/errors';

describe('Error Mapping & Host Extraction (src/providers/errors.ts)', () => {
  const fakeKey = 'sk-test-fake-0000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractHost', () => {
    it('extracts hostname only, stripping path, query, port and protocol', () => {
      expect(extractHost('https://api.anthropic.com/v1/messages?foo=bar#frag')).toBe('api.anthropic.com');
      expect(extractHost('https://generativelanguage.googleapis.com:443/v1beta/models?key=123')).toBe(
        'generativelanguage.googleapis.com'
      );
      expect(extractHost('api.example.com/some/path')).toBe('api.example.com');
      expect(extractHost(undefined)).toBe('the server');
    });

    it('ensures host never contains path or query', () => {
      const host = extractHost('https://api.anthropic.com/v1/models?limit=100');
      expect(host.includes('/')).toBe(false);
      expect(host.includes('?')).toBe(false);
      expect(host.includes('&')).toBe(false);
      expect(host).toBe('api.anthropic.com');
    });
  });

  describe('parseRetryAfter', () => {
    it('parses numeric seconds', () => {
      expect(parseRetryAfter('30')).toBe(30);
      expect(parseRetryAfter(' 12 ')).toBe(12);
      expect(parseRetryAfter(null)).toBeUndefined();
      expect(parseRetryAfter('invalid')).toBeUndefined();
    });

    it('parses HTTP date format', () => {
      const futureDate = new Date(Date.now() + 60000).toUTCString();
      const seconds = parseRetryAfter(futureDate);
      expect(seconds).toBeGreaterThanOrEqual(55);
      expect(seconds).toBeLessThanOrEqual(65);
    });
  });

  describe('mapProviderError', () => {
    it('maps HTTP 401/403 to auth', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 401,
        url: 'https://api.anthropic.com/v1/messages',
        key: fakeKey,
        bodyText: JSON.stringify({ error: { message: `invalid key: ${fakeKey}` } }),
      });
      expect(err.category).toBe('auth');
      expect(err.httpStatus).toBe(401);
      expect(err.message).toBe('The provider rejected your API key. Check that you pasted the whole key for Anthropic.');
      expect(err.detail).toContain('[redacted]');
      expect(err.detail?.includes(fakeKey)).toBe(false);
    });

    it('maps HTTP 404 to model_not_found', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 404,
        model: 'claude-missing',
        url: 'https://api.anthropic.com/v1/messages',
      });
      expect(err.category).toBe('model_not_found');
      expect(err.message).toBe(
        'The model "claude-missing" wasn\'t found or isn\'t available to your key. Pick another model or check the ID.'
      );
    });

    it('maps HTTP 413 or size mentions to too_large', () => {
      const err1 = mapProviderError({
        provider: 'Gemini',
        httpStatus: 413,
        url: 'https://generativelanguage.googleapis.com',
      });
      expect(err1.category).toBe('too_large');
      expect(err1.message).toBe(
        'The request is too large for this provider. Remove or shrink attachments, or shorten your Master Info.'
      );

      const err2 = mapProviderError({
        provider: 'Gemini',
        httpStatus: 400,
        bodyText: 'Payload too large: request exceeds 20MB limit',
      });
      expect(err2.category).toBe('too_large');
    });

    it('maps HTTP 400 with image/PDF/mime issues to unsupported_input', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 400,
        bodyText: 'This model does not support image media_type inputs',
      });
      expect(err.category).toBe('unsupported_input');
      expect(err.message).toBe('This model may not read images or PDFs. Remove the file or pick another model.');
    });

    it('maps generic HTTP 400 to bad_request', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 400,
        bodyText: JSON.stringify({ error: { message: 'invalid parameter: foo' } }),
      });
      expect(err.category).toBe('bad_request');
      expect(err.message).toBe('The provider rejected the request: invalid parameter: foo');
    });

    it('maps HTTP 429 to rate_limit with retry-after wait time when present', () => {
      const errWithWait = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 429,
        retryAfterHeader: '15',
      });
      expect(errWithWait.category).toBe('rate_limit');
      expect(errWithWait.retryAfterSeconds).toBe(15);
      expect(errWithWait.message).toBe('Rate limit reached for Anthropic. Try again in 15 seconds.');

      const errWithoutWait = mapProviderError({
        provider: 'Gemini',
        httpStatus: 429,
      });
      expect(errWithoutWait.category).toBe('rate_limit');
      expect(errWithoutWait.message).toBe('Rate limit reached for Gemini. Wait a moment and press Retry.');
    });

    it('maps HTTP 5xx to server', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 529,
      });
      expect(err.category).toBe('server');
      expect(err.message).toBe('Anthropic had a server problem. Press Retry in a moment.');
    });

    it('maps AbortError to aborted category', () => {
      const domAbort = new DOMException('The operation was aborted.', 'AbortError');
      const err = mapProviderError({
        provider: 'Anthropic',
        rawError: domAbort,
      });
      expect(err.category).toBe('aborted');
    });

    it('maps TypeError when offline to offline message', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const err = mapProviderError({
        provider: 'Anthropic',
        url: 'https://api.anthropic.com/v1/messages',
        rawError: new TypeError('Failed to fetch'),
      });
      expect(err.category).toBe('cors_or_network');
      expect(err.message).toBe('You appear to be offline. Check your connection and try again.');
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('maps TypeError when CSP violation was recorded for host', () => {
      window.dispatchEvent(
        Object.assign(new Event('securitypolicyviolation'), {
          blockedURI: 'https://evil-blocked-host.example.com/api',
        }),
      );
      const err = mapProviderError({
        provider: 'Test',
        url: 'https://evil-blocked-host.example.com/v1',
        rawError: new TypeError('Failed to fetch'),
      });
      expect(err.category).toBe('csp_blocked');
      expect(err.message).toBe(
        "This app's security policy blocked the request to evil-blocked-host.example.com. The hosted app only allows the Anthropic and Gemini addresses."
      );
    });

    it('maps TypeError otherwise to browser extension / network blocked message', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      const err = mapProviderError({
        provider: 'Anthropic',
        url: 'https://api.anthropic.com/v1/messages',
        rawError: new TypeError('Failed to fetch'),
      });
      expect(err.category).toBe('cors_or_network');
      expect(err.message).toContain('The request to api.anthropic.com was blocked before it reached the provider.');
      expect(err.message).toContain('browser extension (ad or privacy blocker)');
    });

    it('maps safety block content', () => {
      const err = mapProviderError({
        provider: 'Gemini',
        bodyText: JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
      });
      expect(err.category).toBe('safety_blocked');
      expect(err.message).toBe(
        'The provider blocked this response. Try rephrasing your custom instructions or check the job context.'
      );
    });

    it('truncates detail to 500 characters and redacts key', () => {
      const longMsg = `${fakeKey} ` + 'A'.repeat(600);
      const err = mapProviderError({
        provider: 'Anthropic',
        key: fakeKey,
        bodyText: longMsg,
      });
      expect(err.detail?.length).toBeLessThanOrEqual(500);
      expect(err.detail?.includes(fakeKey)).toBe(false);
      expect(err.detail).toContain('[redacted]');
    });

    it('maps HTTP 400 containing the word blocked to bad_request, not safety_blocked (Task 9b)', () => {
      const err = mapProviderError({
        provider: 'Anthropic',
        httpStatus: 400,
        bodyText: JSON.stringify({ error: { message: 'Input was blocked by schema validation' } }),
      });
      expect(err.category).toBe('bad_request');
      expect(err.message).toBe('The provider rejected the request: Input was blocked by schema validation');
    });
  });
});
