import type { TorStorageSimple } from './locking.js';
/**
 * Encode a storage key into a filesystem-safe filename.
 * Alphanumeric characters pass through; everything else becomes _XX_ or _XXXX_.
 *
 * Exported for unit tests; not re-exported from `storage/index.ts`, so it is not
 * part of the package's public API.
 */
export declare function mangleKey(key: string): string;
/**
 * Decode a mangled filename back to the original key.
 *
 * Exported for unit tests (see {@link mangleKey}).
 */
export declare function unmangleKey(filename: string): string;
export declare class FilesystemStorage implements TorStorageSimple {
    private dirPath;
    private name;
    private resolvedDirPath;
    private initialized;
    constructor(dirPath: string);
    static localShare(name: string): FilesystemStorage;
    private resolvedDir;
    private ensureDir;
    private filePath;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    keys(prefix: string): Promise<string[]>;
    getAll(prefix: string): Promise<[string, string][]>;
}
//# sourceMappingURL=filesystem.d.ts.map