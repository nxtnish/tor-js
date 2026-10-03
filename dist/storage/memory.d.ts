import type { TorStorage } from '#wasm';
export declare class MemoryStorage implements TorStorage {
    private data;
    private locked;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    keys(prefix: string): Promise<string[]>;
    getAll(prefix: string): Promise<[string, string][]>;
    tryLock(): Promise<boolean>;
    unlock(): Promise<void>;
}
//# sourceMappingURL=memory.d.ts.map