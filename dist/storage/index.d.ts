export { MemoryStorage } from './memory.js';
export { IndexedDBStorage } from './indexeddb.js';
export { FilesystemStorage } from './filesystem.js';
export { addLocking, type TorStorageSimple } from './locking.js';
import type { TorStorage } from '#wasm';
export declare function createAutoStorage(name?: string): TorStorage;
//# sourceMappingURL=index.d.ts.map