import { APP_ID, SCHEMA_VERSION } from '../config';

export type StorageKey = 'masterInfo' | 'instructions' | 'apiKeys' | 'settings';

export const STORAGE_PREFIX = `${APP_ID}:`;

export function getPrefixedKey(key: StorageKey): string {
  return `${APP_ID}:v${SCHEMA_VERSION}:${key}`;
}

