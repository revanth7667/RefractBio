/**
 * Anthropic provider adapter.
 * Spec §13.
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ModelInfo,
  ConnectionTestResult,
  GenerateRequest,
  GenerateResult,
  AppError,
} from '../types';
import { ANTHROPIC_BASE_URL, buildAnthropicHeaders, buildAnthropicGenerateBody } from './wire';
import { fetchAnthropicModels } from './models';
import { processAnthropicStream } from './stream';
import { mapProviderError } from '../errors';

const SETUP_SUGGESTIONS = [
  'Check that your computer has an active internet connection.',
  'If using an ad or privacy blocking extension, VPN, or firewall, try disabling it for this site.',
  'Verify that you pasted the complete, valid API key from the Anthropic console.',
  'Check that your Anthropic workspace has available credit or active billing.',
];

export class AnthropicAdapter implements ProviderAdapter {
  readonly id = 'anthropic' as const;
  readonly displayName = 'Anthropic';

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelInfo[]> {
    if (!config.apiKey.trim()) {
      throw mapProviderError({
        provider: this.displayName,
        httpStatus: 401,
        bodyText: JSON.stringify({ error: { message: 'API key is required' } }),
      });
    }
    return fetchAnthropicModels(config.apiKey, signal);
  }

  async testConnection(config: ProviderConfig): Promise<ConnectionTestResult> {
    try {
      const models = await this.listModels(config);
      return {
        ok: true,
        modelsFound: models.length,
        suggestions: [],
      };
    } catch (err: unknown) {
      const error: AppError =
        typeof err === 'object' && err !== null && 'category' in err && 'message' in err
          ? (err as AppError)
          : mapProviderError({
              provider: this.displayName,
              rawError: err,
            });

      return {
        ok: false,
        error,
        suggestions: SETUP_SUGGESTIONS,
      };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const url = `${ANTHROPIC_BASE_URL}/messages`;
    const headers = buildAnthropicHeaders(req.config.apiKey);
    const body = buildAnthropicGenerateBody(req.model, req.prompt);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: req.signal,
      });
    } catch (err) {
      throw mapProviderError({
        provider: this.displayName,
        url,
        key: req.config.apiKey,
        model: req.model,
        rawError: err,
      });
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const retryAfter = res.headers.get('retry-after');
      throw mapProviderError({
        provider: this.displayName,
        url,
        key: req.config.apiKey,
        model: req.model,
        httpStatus: res.status,
        retryAfterHeader: retryAfter,
        bodyText,
      });
    }

    if (!res.body) {
      throw mapProviderError({
        provider: this.displayName,
        url,
        bodyText: 'Response body is empty',
      });
    }

    return processAnthropicStream(res.body, req.onDelta, req.signal, req.config.apiKey);
  }
}

export const anthropicAdapter = new AnthropicAdapter();

