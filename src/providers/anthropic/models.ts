/**
 * Anthropic model listing and capabilities.
 * Spec §4 (V3, V9) and §13.3.
 */

import type { ModelInfo } from '../types';
import { ANTHROPIC_BASE_URL, buildAnthropicHeaders } from './wire';
import { mapProviderError } from '../errors';
import { filterAndEnrichModels, type RawModelInput } from '../modelFilter';

interface AnthropicModelItem {
  id: string;
  display_name?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  capabilities?: {
    image_input?: { supported?: boolean };
    pdf_input?: { supported?: boolean };
    [key: string]: unknown;
  };
}

interface AnthropicModelsResponse {
  data: AnthropicModelItem[];
  has_more?: boolean;
  first_id?: string | null;
  last_id?: string | null;
}

const MAX_PAGES = 20;

export async function fetchAnthropicModels(
  apiKey: string,
  signal?: AbortSignal
): Promise<ModelInfo[]> {
  const allModels: RawModelInput[] = [];
  let afterId: string | undefined = undefined;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const url = new URL(`${ANTHROPIC_BASE_URL}/models`);
    url.searchParams.set('limit', '1000');
    if (afterId) {
      url.searchParams.set('after_id', afterId);
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: buildAnthropicHeaders(apiKey),
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal,
      });
    } catch (err) {
      throw mapProviderError({
        provider: 'Anthropic',
        url: url.toString(),
        key: apiKey,
        rawError: err,
      });
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw mapProviderError({
        provider: 'Anthropic',
        url: url.toString(),
        key: apiKey,
        httpStatus: res.status,
        bodyText,
      });
    }

    let json: AnthropicModelsResponse;
    try {
      json = (await res.json()) as AnthropicModelsResponse;
    } catch (err) {
      throw mapProviderError({
        provider: 'Anthropic',
        url: url.toString(),
        key: apiKey,
        rawError: err,
      });
    }

    const items = json.data || [];
    for (const item of items) {
      allModels.push({
        id: item.id,
        displayName: item.display_name || item.id,
        provider: 'anthropic',
        capabilities: item.capabilities,
      });
    }

    if (json.has_more && items.length > 0) {
      const nextId = json.last_id || items[items.length - 1].id;
      if (nextId && nextId !== afterId) {
        afterId = nextId;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return filterAndEnrichModels(allModels, 'anthropic');
}

