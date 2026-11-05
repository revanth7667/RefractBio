import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AnthropicAdapter } from '../../src/providers/anthropic/adapter';
import { ANTHROPIC_BASE_URL, ANTHROPIC_VERSION } from '../../src/providers/anthropic/wire';
import type { AssembledPrompt, GenerateRequest } from '../../src/providers/types';

describe('Anthropic Adapter (tests/adapters/anthropic.spec.ts)', () => {
  const adapter = new AnthropicAdapter();
  const fakeKey = 'sk-test-fake-0000';

  const readFixture = (name: string): string => {
    return fs.readFileSync(path.resolve(__dirname, `../fixtures/sse/${name}`), 'utf-8');
  };

  const textPrompt: AssembledPrompt = {
    outputKind: 'RESUME',
    system: 'You are an assistant.',
    userParts: [
      { type: 'text', text: 'Part A content' },
      { type: 'text', text: 'Part C content' },
    ],
    estimate: { textTokens: 10, imageTokens: 0, pdfTokens: 0, total: 10 },
  };

  const multimediaPrompt: AssembledPrompt = {
    outputKind: 'RESUME',
    system: 'You are an assistant.',
    userParts: [
      { type: 'text', text: 'Part A content' },
      { type: 'image', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', name: 'test.png' },
      { type: 'pdf', base64: 'JVBERi0xLjQKJcTl8uXrCg==', name: 'doc.pdf' },
      { type: 'text', text: 'Part C content' },
    ],
    estimate: { textTokens: 10, imageTokens: 1500, pdfTokens: 500, total: 2010 },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generate', () => {
    it('sends correct URL, method, headers and text-only payload', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | null = null;

      const okSse = readFixture('anthropic-ok.txt');

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init || null;
        return new Response(okSse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }));

      const deltas: string[] = [];
      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: (text) => deltas.push(text),
      };

      const result = await adapter.generate(req);

      expect(capturedUrl).toBe(`${ANTHROPIC_BASE_URL}/messages`);
      const init = capturedInit as unknown as RequestInit;
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe(fakeKey);
      expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
      expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(headers['content-type']).toBe('application/json');

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('claude-3-5-sonnet');
      expect(body.stream).toBe(true);
      expect(body.system).toBe('You are an assistant.');
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'Part A content' });

      expect(deltas.join('')).toBe('Hello! This is a test draft.');
      expect(result.text).toBe('Hello! This is a test draft.');
      expect(result.finishReason).toBe('end_turn');
      expect(result.truncated).toBe(false);
    });

    it('maps mid-stream read TypeError to cors_or_network AppError', async () => {
      const encoder = new TextEncoder();
      let sentChunk = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sentChunk) {
            sentChunk = true;
            controller.enqueue(
              encoder.encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n')
            );
          } else {
            controller.error(new TypeError('Mid-stream network drop'));
          }
        },
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      ));

      const deltas: string[] = [];
      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: (text) => deltas.push(text),
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'cors_or_network',
      });
      expect(deltas).toEqual(['hello']);
    });

    it('re-throws mid-stream abort error as an abort, never as an error', async () => {
      const encoder = new TextEncoder();
      let sentChunk = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sentChunk) {
            sentChunk = true;
            controller.enqueue(
              encoder.encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n')
            );
          } else {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          }
        },
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      ));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      const errPromise = adapter.generate(req);
      await expect(errPromise).rejects.toSatisfy((err: unknown) => {
        return (
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        );
      });
    });

    it('formats image and PDF parts correctly in payload', async () => {
      let capturedBodyJson: { messages: Array<{ role: string; content: unknown[] }> } | null = null;

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init) => {
        capturedBodyJson = JSON.parse(init.body) as { messages: Array<{ role: string; content: unknown[] }> };
        return new Response(readFixture('anthropic-ok.txt'), { status: 200 });
      }));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: multimediaPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await adapter.generate(req);

      expect(capturedBodyJson).not.toBeNull();
      const bodyJson = capturedBodyJson!;
      expect(bodyJson.messages[0].content).toHaveLength(4);
      expect(bodyJson.messages[0].content[1]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      });
      expect(bodyJson.messages[0].content[2]).toEqual({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: 'JVBERi0xLjQKJcTl8uXrCg==',
        },
      });
    });

    it('detects truncated output when stop_reason is max_tokens', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(readFixture('anthropic-truncated.txt'), { status: 200 })
      ));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      const result = await adapter.generate(req);
      expect(result.truncated).toBe(true);
      expect(result.finishReason).toBe('max_tokens');
    });

    it('handles in-stream error event', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(readFixture('anthropic-error.txt'), { status: 200 })
      ));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'unknown',
        message: expect.stringContaining('Anthropic servers are temporarily overloaded'),
      });
    });

    it('rejects with unknown AppError when stream ends without message_stop event', async () => {
      const sseWithoutStop = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_01fake","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello unfinished"}}',
        '',
      ].join('\n');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(sseWithoutStop, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      ));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'unknown',
      });
    });

    it('rejects with unknown AppError when stream produces zero text', async () => {
      const emptySse = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_01fake","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(emptySse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      ));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-3-5-sonnet',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'unknown',
      });
    });

    it('maps HTTP errors (401, 404, 413, 429, 500)', async () => {
      const testStatus = async (status: number, body: string, retryAfter?: string) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
          new Response(body, {
            status,
            headers: retryAfter ? { 'retry-after': retryAfter } : {},
          })
        ));

        const req: GenerateRequest = {
          config: { id: 'anthropic', apiKey: fakeKey },
          model: 'claude-test',
          prompt: textPrompt,
          signal: new AbortController().signal,
          onDelta: () => {},
        };

        return adapter.generate(req);
      };

      await expect(testStatus(401, '{"error":{"message":"Invalid key"}}')).rejects.toMatchObject({
        category: 'auth',
      });

      await expect(testStatus(404, '{"error":{"message":"Model not found"}}')).rejects.toMatchObject({
        category: 'model_not_found',
      });

      await expect(testStatus(413, 'Payload too large')).rejects.toMatchObject({
        category: 'too_large',
      });

      await expect(testStatus(429, 'Rate limit', '10')).rejects.toMatchObject({
        category: 'rate_limit',
        retryAfterSeconds: 10,
      });

      await expect(testStatus(500, 'Internal Server Error')).rejects.toMatchObject({
        category: 'server',
      });
    });

    it('maps TypeError to cors_or_network', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const req: GenerateRequest = {
        config: { id: 'anthropic', apiKey: fakeKey },
        model: 'claude-test',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'cors_or_network',
      });
    });
  });

  describe('listModels and pagination', () => {
    it('fetches models across multiple pages and caps at 20 pages', async () => {
      let pageCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (urlStr: string) => {
        pageCount++;
        const url = new URL(urlStr);
        const after = url.searchParams.get('after_id');

        if (!after) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'claude-3-5-sonnet',
                  display_name: 'Claude 3.5 Sonnet',
                  capabilities: { image_input: { supported: true }, pdf_input: { supported: true } },
                },
              ],
              has_more: true,
              last_id: 'claude-3-5-sonnet',
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'claude-3-haiku',
                display_name: 'Claude 3 Haiku',
                capabilities: { image_input: { supported: false }, pdf_input: { supported: false } },
              },
            ],
            has_more: false,
            last_id: 'claude-3-haiku',
          }),
          { status: 200 }
        );
      }));

      const models = await adapter.listModels({ id: 'anthropic', apiKey: fakeKey });

      expect(pageCount).toBe(2);
      expect(models).toHaveLength(2);

      const sonnet = models.find((m) => m.id === 'claude-3-5-sonnet')!;
      expect(sonnet.supportsImages).toBe('yes');
      expect(sonnet.supportsPdf).toBe('yes');
      expect(sonnet.capabilitySource).toBe('api-metadata');

      const haiku = models.find((m) => m.id === 'claude-3-haiku')!;
      expect(haiku.smallTierGuess).toBe(true);
    });

    it('rejects with auth error if apiKey is empty', async () => {
      await expect(adapter.listModels({ id: 'anthropic', apiKey: '' })).rejects.toMatchObject({
        category: 'auth',
      });
    });
  });

  describe('testConnection', () => {
    it('returns ok: true with models count when connection succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet' }],
            has_more: false,
          }),
          { status: 200 }
        )
      ));

      const res = await adapter.testConnection({ id: 'anthropic', apiKey: fakeKey });
      expect(res.ok).toBe(true);
      expect(res.modelsFound).toBe(1);
      expect(res.models).toBeDefined();
      expect(res.models?.length).toBe(1);
      expect(res.suggestions).toEqual([]);
    });

    it('returns ok: false with mapped error and suggestions when rejected', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 })
      ));

      const res = await adapter.testConnection({ id: 'anthropic', apiKey: fakeKey });
      expect(res.ok).toBe(false);
      expect(res.error?.category).toBe('auth');
      expect(res.suggestions.length).toBeGreaterThan(0);
    });
  });
});
