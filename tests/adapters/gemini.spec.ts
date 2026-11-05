import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GeminiAdapter } from '../../src/providers/gemini/adapter';
import { GEMINI_BASE_URL } from '../../src/providers/gemini/wire';
import type { AssembledPrompt, GenerateRequest } from '../../src/providers/types';

describe('Gemini Adapter (tests/adapters/gemini.spec.ts)', () => {
  const adapter = new GeminiAdapter();
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
    it('sends correct URL, headers (no key in query) and text payload', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | null = null;

      const okSse = readFixture('gemini-ok.txt');

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
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: (text) => deltas.push(text),
      };

      const result = await adapter.generate(req);

      expect(capturedUrl).toBe(`${GEMINI_BASE_URL}/models/gemini-1.5-pro:streamGenerateContent?alt=sse`);
      expect(capturedUrl.includes(fakeKey)).toBe(false);
      const init = capturedInit as unknown as RequestInit;
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-goog-api-key']).toBe(fakeKey);
      expect(headers['content-type']).toBe('application/json');

      const body = JSON.parse(init.body as string);
      expect(body.systemInstruction.parts[0].text).toBe('You are an assistant.');
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts).toHaveLength(2);
      expect(body.contents[0].parts[0]).toEqual({ text: 'Part A content' });

      expect(deltas.join('')).toBe('Hello from Gemini! Here is the drafted content.');
      expect(result.text).toBe('Hello from Gemini! Here is the drafted content.');
      expect(result.finishReason).toBe('STOP');
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
              encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n\n')
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
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
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
              encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n\n')
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
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
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

    it('concatenates text from all parts of each candidate chunk and keeps raw finishReason', async () => {
      const multiPartSse = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "},{"text":"world!"}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":" Second "},{"text":"line."}]},"finishReason":"STOP"}]}',
        '',
        '',
      ].join('\n');

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        return new Response(multiPartSse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }));

      const deltas: string[] = [];
      const req: GenerateRequest = {
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: (text) => deltas.push(text),
      };

      const result = await adapter.generate(req);
      expect(deltas).toEqual(['Hello ', 'world!', ' Second ', 'line.']);
      expect(result.text).toBe('Hello world! Second line.');
      expect(result.finishReason).toBe('STOP');
      expect(result.truncated).toBe(false);
    });

    it('formats image and PDF inlineData parts correctly', async () => {
      let capturedBodyJson: { contents: Array<{ role: string; parts: unknown[] }> } | null = null;

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init) => {
        capturedBodyJson = JSON.parse(init.body) as { contents: Array<{ role: string; parts: unknown[] }> };
        return new Response(readFixture('gemini-ok.txt'), { status: 200 });
      }));

      const req: GenerateRequest = {
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'models/gemini-1.5-pro', // checks models/ prefix stripping in URL
        prompt: multimediaPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await adapter.generate(req);

      expect(capturedBodyJson).not.toBeNull();
      const parts = capturedBodyJson!.contents[0].parts;
      expect(parts).toHaveLength(4);
      expect(parts[1]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      });
      expect(parts[2]).toEqual({
        inlineData: {
          mimeType: 'application/pdf',
          data: 'JVBERi0xLjQKJcTl8uXrCg==',
        },
      });
    });

    it('detects truncated output when finishReason is MAX_TOKENS', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(readFixture('gemini-truncated.txt'), { status: 200 })
      ));

      const req: GenerateRequest = {
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      const result = await adapter.generate(req);
      expect(result.truncated).toBe(true);
      expect(result.finishReason).toBe('MAX_TOKENS');
    });

    it('detects safety block via promptFeedback and finishReason', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(readFixture('gemini-blocked.txt'), { status: 200 })
      ));

      const req: GenerateRequest = {
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-1.5-pro',
        prompt: textPrompt,
        signal: new AbortController().signal,
        onDelta: () => {},
      };

      await expect(adapter.generate(req)).rejects.toMatchObject({
        category: 'safety_blocked',
      });
    });

    it('maps HTTP error statuses', async () => {
      const testStatus = async (status: number, body: string, retryAfter?: string) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
          new Response(body, {
            status,
            headers: retryAfter ? { 'retry-after': retryAfter } : {},
          })
        ));

        const req: GenerateRequest = {
          config: { id: 'gemini', apiKey: fakeKey },
          model: 'gemini-test',
          prompt: textPrompt,
          signal: new AbortController().signal,
          onDelta: () => {},
        };

        return adapter.generate(req);
      };

      await expect(testStatus(400, '{"error":{"message":"API_KEY_INVALID"}}')).rejects.toMatchObject({
        category: 'bad_request',
      });

      await expect(testStatus(403, '{"error":{"message":"PERMISSION_DENIED"}}')).rejects.toMatchObject({
        category: 'auth',
      });

      await expect(testStatus(404, '{"error":{"message":"Model not found"}}')).rejects.toMatchObject({
        category: 'model_not_found',
      });

      await expect(testStatus(429, 'RESOURCE_EXHAUSTED', '5')).rejects.toMatchObject({
        category: 'rate_limit',
        retryAfterSeconds: 5,
      });

      await expect(testStatus(500, 'Internal Error')).rejects.toMatchObject({
        category: 'server',
      });
    });

    it('maps TypeError to cors_or_network', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const req: GenerateRequest = {
        config: { id: 'gemini', apiKey: fakeKey },
        model: 'gemini-test',
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
    it('fetches models, strips models/ prefix and paginates', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (urlStr: string) => {
        callCount++;
        const url = new URL(urlStr);
        const token = url.searchParams.get('pageToken');

        if (!token) {
          return new Response(
            JSON.stringify({
              models: [
                {
                  name: 'models/gemini-1.5-pro',
                  displayName: 'Gemini 1.5 Pro',
                  supportedGenerationMethods: ['generateContent'],
                },
              ],
              nextPageToken: 'page_2',
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/text-embedding-004',
                displayName: 'Text Embedding 004',
                supportedGenerationMethods: ['embedContent'],
              },
            ],
          }),
          { status: 200 }
        );
      }));

      const models = await adapter.listModels({ id: 'gemini', apiKey: fakeKey });

      expect(callCount).toBe(2);
      expect(models).toHaveLength(2);

      const pro = models.find((m) => m.id === 'gemini-1.5-pro')!;
      expect(pro.id).toBe('gemini-1.5-pro'); // stripped models/
      expect(pro.likelyChat).toBe(true);

      const embed = models.find((m) => m.id === 'text-embedding-004')!;
      expect(embed.likelyChat).toBe(false);
    });

    it('rejects with auth error if apiKey is empty', async () => {
      await expect(adapter.listModels({ id: 'gemini', apiKey: '' })).rejects.toMatchObject({
        category: 'auth',
      });
    });
  });

  describe('testConnection', () => {
    it('returns ok: true on successful model listing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }],
          }),
          { status: 200 }
        )
      ));

      const res = await adapter.testConnection({ id: 'gemini', apiKey: fakeKey });
      expect(res.ok).toBe(true);
      expect(res.modelsFound).toBe(1);
      expect(res.models).toBeDefined();
      expect(res.models?.length).toBe(1);
    });

    it('returns ok: false with mapped error and suggestions on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 403 })
      ));

      const res = await adapter.testConnection({ id: 'gemini', apiKey: fakeKey });
      expect(res.ok).toBe(false);
      expect(res.error?.category).toBe('auth');
      expect(res.suggestions.length).toBeGreaterThan(0);
    });
  });
});
