/**
 * Provider adapter registry.
 * Spec §5.2 and §7.
 */

import type { ProviderAdapter, ProviderId } from './types';
import { anthropicAdapter } from './anthropic/adapter';
import { geminiAdapter } from './gemini/adapter';

const adapters: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = adapters[id];
  if (!adapter) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return adapter;
}

