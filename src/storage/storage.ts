import { SCHEMA_VERSION } from '../config';
import { getPrefixedKey, STORAGE_PREFIX, type StorageKey } from './keys';

export type { StorageKey };

export type StorageResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'unavailable'
        | 'parse_error'
        | 'quota_exceeded'
        | 'schema_mismatch';
      message: string;
    };

interface StoredEnvelope<T> {
  schemaVersion: number;
  savedAt: string;
  data: T;
}

const migrations: Record<number, (oldData: unknown) => unknown> = {};

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function classifyError(error: unknown): 'quota_exceeded' | 'unavailable' {
  if (error && typeof error === 'object') {
    const err = error as { name?: string; code?: number };
    if (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    ) {
      return 'quota_exceeded';
    }
  }
  return 'unavailable';
}

export function isAvailable(): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    const probeKey = `${STORAGE_PREFIX}__probe__`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export function get<T>(key: StorageKey): StorageResult<T> {
  try {
    const storage = getStorage();
    if (!storage) {
      return { ok: false, reason: 'unavailable', message: 'Storage is not available in this environment' };
    }

    const fullKey = getPrefixedKey(key);
    const raw = storage.getItem(fullKey);
    if (raw === null) {
      return { ok: false, reason: 'not_found', message: `Key ${key} not found` };
    }

    let parsed: StoredEnvelope<T>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'parse_error', message: `Corrupt JSON stored for ${key}` };
    }

    if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
      return { ok: false, reason: 'parse_error', message: `Invalid envelope structure for ${key}` };
    }

    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      const migrator = migrations[parsed.schemaVersion];
      if (migrator) {
        return { ok: true, value: migrator(parsed.data) as T };
      }
      return {
        ok: false,
        reason: 'schema_mismatch',
        message: `Schema version ${parsed.schemaVersion} does not match current version ${SCHEMA_VERSION}`,
      };
    }

    return { ok: true, value: parsed.data };
  } catch (error) {
    const reason = classifyError(error);
    return {
      ok: false,
      reason,
      message: reason === 'quota_exceeded' ? 'Storage quota exceeded' : 'Storage is unavailable',
    };
  }
}

export function set<T>(key: StorageKey, value: T): StorageResult<void> {
  try {
    const storage = getStorage();
    if (!storage) {
      return { ok: false, reason: 'unavailable', message: 'Storage is not available in this environment' };
    }

    const fullKey = getPrefixedKey(key);
    const envelope: StoredEnvelope<T> = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data: value,
    };

    storage.setItem(fullKey, JSON.stringify(envelope));
    return { ok: true, value: undefined };
  } catch (error) {
    const reason = classifyError(error);
    return {
      ok: false,
      reason,
      message: reason === 'quota_exceeded' ? 'Storage quota exceeded' : 'Storage is unavailable',
    };
  }
}

export function remove(key: StorageKey): StorageResult<void> {
  try {
    const storage = getStorage();
    if (!storage) {
      return { ok: false, reason: 'unavailable', message: 'Storage is not available in this environment' };
    }

    const fullKey = getPrefixedKey(key);
    storage.removeItem(fullKey);
    return { ok: true, value: undefined };
  } catch (error) {
    const reason = classifyError(error);
    return {
      ok: false,
      reason,
      message: 'Storage is unavailable',
    };
  }
}

export function removeAll(): StorageResult<void> {
  try {
    const storage = getStorage();
    if (!storage) {
      return { ok: false, reason: 'unavailable', message: 'Storage is not available in this environment' };
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) {
      storage.removeItem(k);
    }

    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      reason: classifyError(error),
      message: 'Storage is unavailable',
    };
  }
}

export function usage(): { approxBytes: number } {
  try {
    const storage = getStorage();
    if (!storage) return { approxBytes: 0 };

    let approxBytes = 0;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        const val = storage.getItem(k) ?? '';
        approxBytes += (k.length + val.length) * 2;
      }
    }

    return { approxBytes };
  } catch {
    return { approxBytes: 0 };
  }
}

