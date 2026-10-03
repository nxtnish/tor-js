/* tslint:disable */
/* eslint-disable */
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */

export type ReadableStreamType = "bytes";

/**
 * Storage interface for persisting Tor client state.
 *
 * Implement this interface to provide custom storage (IndexedDB, filesystem, etc.).
 * All methods must return Promises.
 *
 * When storage is provided, the Tor client will persist guard selection and other
 * state, allowing faster reconnection across page reloads.
 *
 * @example
 * ```typescript
 * class IndexedDBStorage implements TorStorage {
 *   async get(key: string): Promise<string | null> {
 *     // Load from IndexedDB
 *   }
 *   async set(key: string, value: string): Promise<void> {
 *     // Save to IndexedDB
 *   }
 *   async delete(key: string): Promise<void> {
 *     // Delete from IndexedDB
 *   }
 *   async keys(prefix: string): Promise<string[]> {
 *     // List keys matching prefix
 *   }
 *   async tryLock(): Promise<boolean> {
 *     // addLocking is available in tor-js to solve locking with in-memory
 *     // overlay
 *     // true:   newly acquired
 *     // false:  already held
 *     // reject: couldn't lock
 *   }
 *   async unlock(): Promise<void> {
 *   }
 * }
 *
 * const options = new TorClientOptions(gatewayUrl)
 *   .withStorage(new IndexedDBStorage());
 * const client = await TorClient.create(options);
 * ```
 */
export interface TorStorage {
    /**
     * Get a value by key.
     * @param key - The storage key
     * @returns The stored value as a string, or null if not found
     */
    get(key: string): Promise<string | null>;

    /**
     * Get all key-value pairs matching a prefix.
     * @param prefix - The key prefix to match
     * @returns Array of [key, value] pairs
     */
    getAll(prefix: string): Promise<[string, string][]>;

    /**
     * Set a value by key.
     * @param key - The storage key
     * @param value - The value to store (JSON string)
     */
    set(key: string, value: string): Promise<void>;

    /**
     * Delete a value by key.
     * @param key - The storage key
     */
    delete(key: string): Promise<void>;

    /**
     * List all keys with a given prefix.
     * @param prefix - The key prefix to match
     * @returns Array of matching keys
     */
    keys(prefix: string): Promise<string[]>;

    /**
     * Try to acquire an exclusive write lock.
     * @returns true if newly acquired, false if already held.
     * Implement using Web Locks API (browser) or lock files (Node.js).
     */
    tryLock(): Promise<boolean>;

    /**
     * Release the write lock.
     */
    unlock(): Promise<void>;
}

export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;
    signal?: AbortSignal;
}

export interface TorClient {
    /** Make an HTTP fetch request through Tor. Returns a standard Response. */
    fetch(url: string, init?: FetchInit): Promise<Response>;
    /** Open a TLS-ready bidirectional stream for the TorWebSocket wrapper. */
    connectStream(url: string): Promise<TorStream>;
    close(): Promise<void>;
}

export interface TorStream {
    /** Read the next chunk, or null after EOF. Only one read may be pending. */
    read(): Promise<Uint8Array | null>;
    /** Write and flush one chunk. Only one write may be pending. */
    write(data: Uint8Array): Promise<void>;
    /** Close both sides of the stream. */
    close(): Promise<void>;
}

export interface TorClientOptions {
    /**
     * Set a custom storage implementation for persistent state.
     * If not provided, in-memory storage is used (state lost on page reload).
     */
    withStorage(storage: TorStorage): TorClientOptions;
}



export class IntoUnderlyingByteSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableByteStreamController): Promise<any>;
    start(controller: ReadableByteStreamController): void;
    readonly autoAllocateChunkSize: number;
    readonly type: ReadableStreamType;
}

export class IntoUnderlyingSink {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort(reason: any): Promise<any>;
    close(): Promise<any>;
    write(chunk: any): Promise<any>;
}

export class IntoUnderlyingSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableStreamDefaultController): Promise<any>;
}

/**
 * Tor client for making HTTP requests through the Tor network
 */
export class TorClient {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Close the TorClient and release resources
     */
    close(): Promise<any>;
    /**
     * Create a new TorClient with the given options.
     *
     * This is an async operation that returns a Promise.
     * The client will bootstrap and establish a connection to the Tor network.
     *
     * Usage from JS: `const client = await TorClient.create(options);`
     */
    static create(options: TorClientOptions): Promise<any>;
    /**
     * Wait until the client is ready for traffic (connection usable + valid directory).
     */
    ready(): Promise<any>;
}

/**
 * Options for creating a TorClient
 */
export class TorClientOptions {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create options with a connect function.
     *
     * The connect function receives a target address string (e.g. "198.51.100.1:9001")
     * and must return a Promise resolving to a socket object with:
     * - `send(data: Uint8Array)` — send binary data
     * - `onmessage: ((data: Uint8Array) => void) | null` — receive callback
     * - `onclose: (() => void) | null` — close notification
     * - `close()` — close the socket
     *
     * The TS wrapper provides this automatically via the Gateway class.
     */
    constructor(connect: Function);
    /**
     * Set a callback that provides bootstrap.zip bytes for fast directory pre-population.
     *
     * The callback should be `() => Promise<Uint8Array>` returning the
     * bootstrap archive from a tor-js-gateway server — either raw zip bytes
     * or zstd-compressed (`bootstrap.zip.zst`); compression is auto-detected.
     *
     * When set and storage has no cached consensus, the zip is parsed and the
     * directory cache is pre-populated before bootstrap begins.
     */
    withFastBootstrap(callback: Function): TorClientOptions;
    /**
     * Set a custom storage implementation for persistent state.
     *
     * When set, the Tor client will persist guard selection and other state
     * to this storage, allowing faster reconnection across page reloads.
     *
     * If not set, in-memory storage is used (state lost on page reload).
     *
     * # Arguments
     * * `storage` - A JavaScript object implementing the TorStorage interface
     */
    withStorage(storage: TorStorage): TorClientOptions;
}

export class TorStream {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Initialize the tor-js WASM module
 *
 * This must be called before creating any TorClient instances.
 * Sets up panic hooks and logging infrastructure.
 *
 * The optional `log_level` parameter sets the initial log level:
 * "trace", "debug", "info", "warn", or "error". Defaults to "debug".
 * The level can be changed later with `setLogLevel()`.
 */
export function init(log_level?: string | null): void;

/**
 * Set a callback function to receive log messages
 *
 * The callback receives three arguments: (level: string, target: string, message: string)
 */
export function setLogCallback(callback: Function): void;

/**
 * Dynamically update the minimum log level.
 *
 * Called from JS when the broadest requested level across all clients changes.
 */
export function setLogLevel(level: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
    readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
    readonly __wbg_torclient_free: (a: number, b: number) => void;
    readonly __wbg_torclientoptions_free: (a: number, b: number) => void;
    readonly __wbg_torstream_free: (a: number, b: number) => void;
    readonly init: (a: number, b: number) => [number, number];
    readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
    readonly intounderlyingbytesource_cancel: (a: number) => void;
    readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
    readonly intounderlyingbytesource_start: (a: number, b: any) => void;
    readonly intounderlyingbytesource_type: (a: number) => number;
    readonly intounderlyingsink_abort: (a: number, b: any) => any;
    readonly intounderlyingsink_close: (a: number) => any;
    readonly intounderlyingsink_write: (a: number, b: any) => any;
    readonly intounderlyingsource_cancel: (a: number) => void;
    readonly intounderlyingsource_pull: (a: number, b: any) => any;
    readonly setLogCallback: (a: any) => void;
    readonly setLogLevel: (a: number, b: number) => [number, number];
    readonly torclient_close: (a: number) => any;
    readonly torclient_connectStream: (a: number, b: number, c: number) => any;
    readonly torclient_create: (a: number) => any;
    readonly torclient_fetch: (a: number, b: number, c: number, d: any) => any;
    readonly torclient_ready: (a: number) => any;
    readonly torclientoptions_new: (a: any) => number;
    readonly torclientoptions_withFastBootstrap: (a: number, b: any) => number;
    readonly torclientoptions_withStorage: (a: number, b: any) => number;
    readonly torstream_close: (a: number) => any;
    readonly torstream_read: (a: number) => any;
    readonly torstream_write: (a: number, b: any) => any;
    readonly wasm_bindgen_2e541aa8012e5493___convert__closures_____invoke___js_sys_4841e98648b61fa6___Function_fn_wasm_bindgen_2e541aa8012e5493___JsValue_____wasm_bindgen_2e541aa8012e5493___sys__Undefined___js_sys_4841e98648b61fa6___Function_fn_wasm_bindgen_2e541aa8012e5493___JsValue_____wasm_bindgen_2e541aa8012e5493___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_2e541aa8012e5493___convert__closures_____invoke___wasm_bindgen_2e541aa8012e5493___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_2e541aa8012e5493___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_2e541aa8012e5493___convert__closures_____invoke___wasm_bindgen_2e541aa8012e5493___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_2e541aa8012e5493___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly __wbindgen_malloc_command_export: (a: number, b: number) => number;
    readonly __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store_command_export: (a: number) => void;
    readonly __externref_table_alloc_command_export: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure_command_export: (a: number, b: number) => void;
    readonly __externref_table_dealloc_command_export: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
