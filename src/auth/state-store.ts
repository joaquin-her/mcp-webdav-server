import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OAuthStateStore');

function resolveStateFilePath(): string {
  return process.env.STATE_FILE_PATH || '/data/oauth-state.json';
}

/**
 * Loads persisted OAuth state (registered clients, access/refresh tokens)
 * from disk, if present. Returns `undefined` on first run or if the file is
 * missing/corrupt — callers should fall back to empty state in that case.
 */
export function loadState<T>(): T | undefined {
  const filePath = resolveStateFilePath();

  if (!existsSync(filePath)) {
    logger.info('No persisted OAuth state found, starting fresh', { filePath });
    return undefined;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    logger.info('Loaded persisted OAuth state', { filePath });
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error('Failed to read persisted OAuth state, starting fresh', error);
    return undefined;
  }
}

/**
 * Persists OAuth state to disk. Failures are logged but not thrown — a
 * write failure (e.g. the volume isn't mounted) should degrade to
 * in-memory-only behavior rather than crash request handling.
 */
export function saveState<T>(state: T): void {
  const filePath = resolveStateFilePath();

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state), 'utf8');
  } catch (error) {
    logger.error('Failed to persist OAuth state', error);
  }
}
