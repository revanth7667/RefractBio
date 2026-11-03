import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExtractedPdfInfo {
  numPages: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Parses a PDF buffer using pdfjs-dist under Node.js per official docs:
 * https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs
 */
export async function extractPdfInfo(pdfBuffer: Buffer): Promise<ExtractedPdfInfo> {
  const data = new Uint8Array(pdfBuffer);
  const loadingTask = getDocument({ data });
  const doc = await loadingTask.promise;

  const numPages = doc.numPages;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });

  const textContent = await page.getTextContent();
  const text = textContent.items
    .map((item) => ('str' in item ? (item as { str: string }).str : ''))
    .join(' ');

  page.cleanup();
  await loadingTask.destroy();

  return {
    numPages,
    width: viewport.width,
    height: viewport.height,
    text,
  };
}

/**
 * Creates an Anthropic SSE response stream from document text.
 */
export function makeAnthropicStream(text: string, stopReason: string | null = 'end_turn'): string {
  return [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null}}',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    'event: content_block_delta',
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'event: message_delta',
    `data: {"type":"message_delta","delta":{"stop_reason":${JSON.stringify(stopReason)}}}`,
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
    '',
  ].join('\n');
}

export interface AnthropicRequestBody {
  model?: string;
  max_tokens?: number;
  messages?: Array<{
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export interface AnthropicMockOptions {
  resume?: string;
  coverLetter?: string;
  email?: string;
  linkedin?: string;
  answers?: string;
  capturedRequests?: Array<{
    url: string;
    method: string;
    postData: string;
    parsedBody?: AnthropicRequestBody;
  }>;
}

/**
 * Sets up Playwright page route mocks for Anthropic API endpoints with full CORS support.
 */
export async function setupAnthropicMock(
  page: Page,
  options: AnthropicMockOptions,
): Promise<void> {
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();

    // CORS preflight OPTIONS response
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Models endpoint GET
    if (url.includes('/v1/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          data: [
            {
              id: 'claude-3-5-sonnet-20241022',
              display_name: 'Claude 3.5 Sonnet',
            },
          ],
        }),
      });
    }

    // Messages generation endpoint POST
    if (url.includes('/v1/messages')) {
      const postData = request.postData() || '';
      let parsedBody: AnthropicRequestBody | undefined;
      try {
        parsedBody = JSON.parse(postData) as AnthropicRequestBody;
      } catch {
        // ignore
      }
      if (options.capturedRequests) {
        options.capturedRequests.push({ url, method, postData, parsedBody });
      }

      let text = options.resume || '';
      if (postData.includes('Write the cover letter now') || postData.includes('COVER_LETTER')) {
        text = options.coverLetter || '';
      } else if (postData.includes('Write the LinkedIn message now') || postData.includes('LINKEDIN_MESSAGE')) {
        text = options.linkedin || '';
      } else if (postData.includes('Write the email now') || postData.includes('EMAIL')) {
        text = options.email || '';
      } else if (postData.includes('Write the answers') || postData.includes('ANSWERS')) {
        text = options.answers || '';
      } else if (postData.includes('Write the resume now') || postData.includes('RESUME')) {
        text = options.resume || '';
      }

      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: makeAnthropicStream(text),
      });
    }

    return route.abort();
  });
}

/**
 * Sets up Playwright page route mocks for Anthropic API endpoints with full CORS support.
 */
export async function setupAnthropicRoutes(
  page: Page,
  resumeFixture: string,
  coverLetterFixture: string,
): Promise<void> {
  return setupAnthropicMock(page, {
    resume: resumeFixture,
    coverLetter: coverLetterFixture,
  });
}

/**
 * Loads text fixtures from tests/fixtures.
 */
export function loadFixture(relativePath: string): string {
  const fullPath = path.resolve(__dirname, '..', 'fixtures', relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

