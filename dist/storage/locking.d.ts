import type { TorStorage } from '#wasm';
/** Storage interface without locking — just the CRUD methods. */
export type TorStorageSimple = Omit<TorStorage, 'tryLock' | 'unlock'>;
/**
 * Wrap a simple storage with platform-detected locking.
 *
 * - Browser: Web Locks API (`navigator.locks`)
 * - Node.js: lock file at `~/.local/share/${name}/.lock`
 *
 * If the real lock can't be acquired (another tab/process holds it),
 * the wrapper degrades gracefully: reads fall through to the inner storage,
 * writes go to an in-memory overlay, and `tryLock()` still returns `true`.
 */
export declare function addLocking(inner: TorStorageSimple, name: string): TorStorage;
//# sourceMappingURL=locking.d.ts.map