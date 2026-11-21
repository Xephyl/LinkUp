// apps/backend/src/config/cache.ts
// In-memory cache with TTL — single-instance replacement for Redis.
// Holds auth sessions, message-list cache, online markers, and OAuth replay
// markers. A restart clears everything: users re-login, caches rebuild.
// Do NOT use for data that must survive restarts or be shared across instances.

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

const sweep = (): void => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
};

// Periodic sweep so expired keys don't accumulate. unref() keeps the
// interval from holding the process open during shutdown/tests.
const sweeper = setInterval(sweep, 60_000);
sweeper.unref();

const getEntry = (key: string): CacheEntry | null => {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
};

// ── Cache Helpers ─────────────────────────────────────────────────────────────

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const entry = getEntry(key);
  if (!entry) return null;
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> => {
  store.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

export const cacheDel = async (key: string): Promise<void> => {
  store.delete(key);
};

// Atomic check-and-set — Node is single-threaded so this is race-free.
// Returns true if the key was absent and is now set, false if it already existed.
export const setIfAbsent = (key: string, ttlSeconds: number): boolean => {
  if (getEntry(key)) return false;
  store.set(key, { value: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
};
