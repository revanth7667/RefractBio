/**
 * Gemini model listing and capabilities.
 * Spec §4 (V8, V9) and §13.3.
 */

import type { ModelInfo } from '../types';
import { GEMINI_BASE_URL, buildGeminiHeaders, cleanGeminiModelId } from './wire';
import { mapProviderError } from '../errors';
import { filterAndEnrichModels, type RawModelInput } from '../modelFilter';

interface GeminiModelItem {
  name: string; // e.g. "models/gemini-1.5-pro"
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models?: GeminiModelItem[];
  nextPageToken?: string;
}

const MAX_PAGES = 20;

export async function fetchGeminiModels(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  const allModels: RawModelInput[] = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const url = new URL(`${GEMINI_BASE_URL}/models`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: buildGeminiHeaders(apiKey),
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal,
      });
    } catch (err) {
      throw mapProviderError({
        provider: 'Gemini',
        url: url.toString(),
        key: apiKey,
        rawError: err,
      });
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw mapProviderError({
        provider: 'Gemini',
        url: url.toString(),
        key: apiKey,
        httpStatus: res.status,
        bodyText,
      });
    }

    let json: GeminiModelsResponse;
    try {
      json = (await res.json()) as GeminiModelsResponse;
    } catch (err) {
      throw mapProviderError({
        provider: 'Gemini',
        url: url.toString(),
        key: apiKey,
        rawError: err,
      });
    }

    const items = json.models || [];
    for (const item of items) {
      const id = cleanGeminiModelId(item.name);
      allModels.push({
        id,
        displayName: item.displayName || id,
        provider: 'gemini',
        supportedGenerationMethods: item.supportedGenerationMethods,
      });
    }

    if (json.nextPageToken && json.nextPageToken !== pageToken && items.length > 0) {
      pageToken = json.nextPageToken;
    } else {
      break;
    }
  }

  return filterAndEnrichModels(allModels, 'gemini');
}

