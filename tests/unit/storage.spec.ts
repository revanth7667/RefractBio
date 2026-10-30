import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as storage from '../../src/storage/storage';
import { APP_ID, SCHEMA_VERSION } from '../../src/config';
import { getPrefixedKey } from '../../src/storage/keys';
import type { Settings } from '../../src/types';

describe('Storage Module', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reports availability accurately via probe key', () => {
    expect(storage.isAvailable()).toBe(true);
    // Probe key should be cleaned up immediately
    expect(localStorage.getItem(`${APP_ID}:__probe__`)).toBeNull();
  });

  it('stores and retrieves items wrapped in schema envelope', () => {
    const sampleSettings: Settings = {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet-20241022' },
      rememberKeys: false,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    };

    const setResult = storage.set('settings', sampleSettings);
    expect(setResult.ok).toBe(true);

    const fullKey = getPrefixedKey('settings');
    const rawStored = localStorage.getItem(fullKey);
    expect(rawStored).not.toBeNull();

    const parsedEnvelope = JSON.parse(rawStored!);
    expect(parsedEnvelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(typeof parsedEnvelope.savedAt).toBe('string');
    expect(parsedEnvelope.data).toEqual(sampleSettings);

    const getResult = storage.get<Settings>('settings');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value).toEqual(sampleSettings);
    }
  });

  it('returns not_found for non-existent key', () => {
    const res = storage.get('masterInfo');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('not_found');
    }
  });

  it('returns parse_error for corrupt JSON', () => {
    const fullKey = getPrefixedKey('masterInfo');
    localStorage.setItem(fullKey, '{ corrupt json');

    const res = storage.get('masterInfo');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('parse_error');
    }
  });

  it('returns schema_mismatch when envelope schemaVersion differs and no migration exists', () => {
    const fullKey = getPrefixedKey('settings');
    localStorage.setItem(
      fullKey,
      JSON.stringify({
        schemaVersion: 999,
        savedAt: new Date().toISOString(),
        data: {},
      })
    );

    const res = storage.get('settings');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('schema_mismatch');
    }
  });

  it('handles QuotaExceededError on set', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });

    const res = storage.set('settings', { theme: 'dark' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('quota_exceeded');
    }
  });

  it('handles SecurityError / unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      const err = new Error('Access denied');
      err.name = 'SecurityError';
      throw err;
    });

    const res = storage.get('settings');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('unavailable');
    }
  });

  it('removes single item with remove()', () => {
    storage.set('settings', { theme: 'light' });
    expect(storage.get('settings').ok).toBe(true);

    const remRes = storage.remove('settings');
    expect(remRes.ok).toBe(true);
    expect(storage.get('settings').ok).toBe(false);
  });

  it('removeAll() removes only keys with APP_ID prefix, preserving unrelated keys', () => {
    storage.set('settings', { theme: 'system' });
    storage.set('masterInfo', { text: 'test', updatedAt: new Date().toISOString() });
    localStorage.setItem('other_app_key', 'should_remain');

    const removeAllResult = storage.removeAll();
    expect(removeAllResult.ok).toBe(true);

    expect(storage.get('settings').ok).toBe(false);
    expect(storage.get('masterInfo').ok).toBe(false);
    expect(localStorage.getItem('other_app_key')).toBe('should_remain');
  });

  it('calculates approximate storage usage in bytes for app keys only', () => {
    localStorage.setItem('other_key', 'xxxx');
    const u0 = storage.usage();
    expect(u0.approxBytes).toBe(0);

    storage.set('settings', { theme: 'dark' });
    const u1 = storage.usage();
    expect(u1.approxBytes).toBeGreaterThan(0);
  });
});
