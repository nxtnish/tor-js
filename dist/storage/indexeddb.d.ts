import type { TorStorageSimple } from './locking.js';
export declare class IndexedDBStorage implements TorStorageSimple {
    private dbName;
    private storeName;
    private dbPromise;
    constructor(name?: string);
    private getDB;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    keys(prefix: string): Promise<string[]>;
    getAll(prefix: string): Promise<[string, string][]>;
}
//# sourceMappingURL=indexeddb.d.ts.map