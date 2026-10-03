import { Connection } from '@kpstreams/core';

type LogLevel$1 = 'trace' | 'debug' | 'info' | 'warn' | 'error';
type RawLog = (level: LogLevel$1, ...args: unknown[]) => void;
interface LogConstructorParams {
    rawLog?: RawLog;
    /**
     * @internal Where {@link Log.warnOnce} writes, if not `rawLog`. Lets a log
     * that discards everything else still deliver one-time warnings.
     */
    rawLogOnce?: RawLog;
    parentStartTime?: number;
    namePrefix?: string;
}
declare class Log {
    private rawLog;
    private rawLogOnce;
    private parentStartTime;
    private namePrefix;
    constructor(params?: LogConstructorParams);
    child(name: string): Log;
    trace(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    /**
     * Warn once per process for `key`; later calls with the same key are no-ops.
     * For warnings a person needs to see, such as a demo gateway, which is why
     * TorClient's otherwise-silent default log still delivers these.
     */
    warnOnce(key: string, ...args: unknown[]): void;
    /** @internal Create a callback for WASM setLogCallback */
    _makeWasmCallback(): (level: string, target: string, message: string) => void;
    private log;
    private emit;
    private defaultRawLog;
}

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
interface TorStorage {
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

/**
 * The built-in KPS dialer: WebRTC in browsers (`@kpstreams/webrtc-client`),
 * QUIC in Node/Deno (the optional `@kpstreams/quic-client` package).
 *
 * This lives in its own module — {@link KpsGateway} imports it *lazily*, and
 * only when no custom `dial` was injected — so an embedder that supplies its
 * own transport can mark `@kpstreams/*` external and ship a bundle that never
 * pulls in the KPS client code.
 */

/** Opens a KPS connection to a gateway address (`ip:port:certhash`). */
type DialFn = (address: string) => Promise<Connection>;

/**
 * tor-js-gateway client (KPS edition).
 *
 * The gateway speaks KPS-HTTP/1 (see tor-js-gateway/PROTOCOL.md): strict
 * HTTP/1.1 syntax over KPS streams, one exchange per stream, bodies
 * delimited by stream FIN. Clients dial the gateway's `ip:port:certhash`
 * address — no URL, no CA, no DNS. In browsers the dial goes over WebRTC
 * (@kpstreams/webrtc-client); in Node it goes over QUIC via the optional
 * @kpstreams/quic-client package.
 *
 * Relay connections are HTTP CONNECT tunnels (PROTOCOL.md §4): after the
 * gateway's 200 the stream is the raw TCP byte pipe to the relay.
 */

interface GatewayResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Uint8Array;
}
/** Options for {@link KpsGateway}. */
interface KpsGatewayOptions {
    /**
     * Custom KPS dialer. Defaults to the built-in WebRTC (browser) / QUIC (Node)
     * dialer, which is imported lazily so it only loads when this is omitted.
     * Inject a dialer to reach the gateway over a transport you already hold
     * (e.g. a KPS capability granted to a sandboxed worker); then the built-in
     * dialer and its `@kpstreams` client deps are never loaded.
     */
    dial?: DialFn;
    /**
     * Log for this gateway's messages, such as the one-time demo-gateway warning
     * (PROTOCOL.md §5). Omitted means they are dropped, and the demo check is
     * skipped since it would have nowhere to report.
     */
    log?: Log;
}
/**
 * A connection to one tor-js-gateway, addressed by its KPS address
 * (`ip:port:certhash`). The underlying KPS connection is dialed lazily and
 * reused; every request/tunnel is its own stream on it. Re-dials
 * automatically if the connection drops.
 */
declare class KpsGateway {
    #private;
    /**
     * @param address KPS address (`ip:port:certhash`).
     * @param options Optional {@link KpsGatewayOptions} (e.g. a custom `dial`).
     */
    constructor(address: string, options?: KpsGatewayOptions);
    get address(): string;
    /**
     * One KPS-HTTP/1 GET exchange (PROTOCOL.md §3): write the request, FIN,
     * then read the response; the body ends at EOF.
     *
     * @param path Absolute request path (e.g. "/bootstrap.zip.zst").
     * @param opts Optional `signal` bounding the whole exchange.
     */
    fetch(path: string, opts?: {
        signal?: AbortSignal;
    }): Promise<GatewayResponse>;
    /**
     * Open a TCP tunnel to a Tor relay via CONNECT (PROTOCOL.md §4). After
     * the gateway's 200 the stream is the raw byte pipe to the target.
     *
     * @param target Relay address as "ip:port" (consensus relays only).
     * @param opts Optional `signal` bounding setup (dial, stream, CONNECT reply);
     *   it does not affect the tunnel once established.
     */
    connect(target: string, opts?: {
        signal?: AbortSignal;
    }): Promise<ArtiSocket>;
    /** Close the underlying KPS connection (all streams/tunnels with it). */
    close(): void;
}

/**
 * Socket provider for connecting to Tor relays via direct TCP or a
 * tor-js-gateway reached over KPS (WebRTC in browsers, QUIC in Node).
 *
 * ArtiSocketProvider auto-detects available strategies based on environment:
 * - Node.js/Deno: tries direct TCP first, then the KPS gateway if one is set
 * - Browsers: KPS gateway only (browsers can't open TCP sockets)
 *
 * Each `connect(target)` call returns an {@link ArtiSocket} — a uniform
 * bidirectional byte pipe regardless of transport.
 */

/** Per-attempt deadline and post-failure cooldown, in ms. */
interface GatewayTiming {
    /** Budget for one gateway attempt: dial + open stream + response head. */
    attemptTimeoutMs: number;
    /** Cooldown after a first failure; doubles per consecutive failure. */
    cooldownBaseMs: number;
    /** Ceiling on the cooldown. */
    cooldownMaxMs: number;
}
/** How a socket ended: cleanly, or with an error reason. */
interface ArtiSocketCloseInfo {
    ok: boolean;
    reason?: string;
}
/** The parts a transport supplies to build an {@link ArtiSocket}. */
interface ArtiSocketParts {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    closed: Promise<ArtiSocketCloseInfo>;
    closeWrite: () => Promise<void>;
    close: () => void;
}
/**
 * A bidirectional byte pipe to a Tor relay, shaped like a KPS `Stream`.
 *
 * Data flows through the WHATWG `readable`/`writable` streams, which carry
 * backpressure end to end: the consumer (the WASM runtime) pulls from
 * `readable` on demand, so the transport only pulls from the network when
 * arti actually reads, and writes await the sink so a slow relay throttles
 * the writer. There is no intermediate buffering or event queue.
 */
declare class ArtiSocket {
    #private;
    /** Inbound bytes. Pull-based: reading drives the transport's network pull. */
    readonly readable: ReadableStream<Uint8Array>;
    /** Outbound bytes. The writer's backpressure reflects the transport buffer. */
    readonly writable: WritableStream<Uint8Array>;
    /** Resolves when the socket is fully closed. */
    readonly closed: Promise<ArtiSocketCloseInfo>;
    constructor(parts: ArtiSocketParts);
    /** Half-close the write side (the peer sees a TCP FIN); reads continue. */
    closeWrite(): Promise<void>;
    /** Tear down both halves of the socket. */
    close(): void;
    /** Wrap a Node.js net.Socket (already connected) as WHATWG streams. */
    static fromNodeSocket(socket: any): Promise<ArtiSocket>;
    /** Wrap a Deno TCP connection (whose readable/writable are already WHATWG). */
    static fromDenoConn(conn: any): ArtiSocket;
}
/**
 * Options for creating an ArtiSocketProvider.
 */
interface ArtiSocketProviderOptions {
    /**
     * Gateway KPS address(es) (`ip:port:certhash`, e.g.
     * `"198.51.100.7:12298:uEiAxk...9Qw"`). Pass several redundant gateways to
     * fail over and spread load between them.
     *
     * The list is an **unordered set**: position carries no priority, and each
     * client shuffles it to pick its own preference. (Explicit priorities or
     * weights may be added later.) Required in browsers for relay connections.
     * Optional in Node.js/Deno (enables fast bootstrap and gateway fallback when
     * provided; requires the optional `@kpstreams/quic-client` package).
     */
    gateway?: string | string[];
    /**
     * Custom KPS dialer, applied to every gateway. Defaults to the built-in
     * WebRTC/QUIC dialer. Inject one to reach gateways over a transport you
     * already hold (e.g. a KPS capability granted to a sandboxed worker).
     */
    dial?: DialFn;
    /**
     * Ordered list of strategies to try: `"direct"`, `"kps"`.
     * Defaults based on environment and whether a gateway address is provided.
     */
    strategies?: string[];
    /**
     * Override the per-attempt deadline and failure cooldown. Advanced; mainly
     * useful for tests that need short timings.
     */
    timing?: Partial<GatewayTiming>;
    /**
     * Log passed to each gateway (for example, for the one-time demo-gateway
     * warning). `TorClient` passes its own; omit it and gateway messages are
     * dropped.
     */
    log?: Log;
}
/**
 * Opens sockets to Tor relays via configurable strategies (direct TCP,
 * KPS gateway tunnels) with automatic fallback.
 *
 * The gateway address is optional — without it, only the `direct` strategy
 * is available (Node.js/Deno native TCP). With a gateway address, the `kps`
 * strategy becomes available (the only option in browsers).
 */
declare class ArtiSocketProvider {
    #private;
    constructor(options?: ArtiSocketProviderOptions);
    /**
     * The gateway currently preferred for single-gateway work, or null if none is
     * configured. Prefer {@link gatewayFetch} for requests — it falls over.
     */
    get gateway(): KpsGateway | null;
    /**
     * Open a relay socket to the given target (e.g. "198.51.100.1:9001").
     * Tries each configured strategy in order until one succeeds.
     */
    connect(target: string): Promise<ArtiSocket>;
    /** Close all KPS gateway connections and release resources. */
    close(): void;
    /**
     * One KPS-HTTP/1 GET against a gateway (used for fast bootstrap), falling
     * over to the next candidate on failure. The happy path contacts exactly one
     * gateway — bootstrap is not raced.
     */
    gatewayFetch(path: string): Promise<GatewayResponse>;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
/**
 * Options for creating a TorClient.
 *
 * In browsers, provide a gateway KPS address for relay tunneling and fast
 * bootstrap. In Node.js/Deno, the client connects via direct TCP without a
 * gateway; providing one enables fast bootstrap and gateway fallback (which
 * additionally requires the optional `@kpstreams/quic-client` package).
 */
type TorClientOptions = {
    /**
     * Gateway KPS address(es) (`ip:port:certhash`, e.g.
     * `"198.51.100.7:12298:uEiAxk...9Qw"` — printed by tor-js-gateway at
     * startup). Pass several redundant gateways to fail over and spread load
     * between them; the list is an unordered set, so position implies no
     * priority. Required in browsers for relay connections; optional in
     * Node.js/Deno.
     */
    gateway?: string | string[];
    /**
     * Optional logger instance.
     * Note: WASM logging is global, so all TorClient instances receive all WASM
     * log events, not just their own. This is because wasm-bindgen generates a
     * single module-level instance (`let wasm;`), so all Rust global state
     * (including the tracing subscriber) is shared.
     */
    log?: Log;
    /** Optional storage for persistent state (implements TorStorage). */
    storage?: TorStorage;
    /**
     * Minimum log level for this client's log listener. Defaults to 'debug'.
     * Can be changed at runtime via `TorClient.setLogLevel()`.
     * The WASM subscriber auto-widens to the broadest level across all clients.
     */
    logLevel?: LogLevel;
    /** Optional custom socket provider. When set, overrides the default ArtiSocketProvider created from the gateway address. */
    socketProvider?: ArtiSocketProvider;
};

interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;
    signal?: AbortSignal;
}

interface TorByteStream {
    read(): Promise<Uint8Array | null>;
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
type TorStreamConnector = (url: string) => Promise<TorByteStream>;
interface TorWebSocketConstructor {
    readonly CONNECTING: number;
    readonly OPEN: number;
    readonly CLOSING: number;
    readonly CLOSED: number;
    new (url: string | URL, protocols?: string | string[]): TorWebSocket;
}
declare class TorWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readonly url: string;
    readonly extensions = "";
    binaryType: BinaryType;
    bufferedAmount: number;
    protocol: string;
    readyState: number;
    onopen: ((this: TorWebSocket, event: Event) => unknown) | null;
    onmessage: ((this: TorWebSocket, event: MessageEvent) => unknown) | null;
    onerror: ((this: TorWebSocket, event: Event) => unknown) | null;
    onclose: ((this: TorWebSocket, event: CloseEvent) => unknown) | null;
    private readonly connector;
    private readonly protocols;
    private stream;
    private incoming;
    private writeChain;
    private fragmentOpcode;
    private fragments;
    private fragmentLength;
    private closeSent;
    private closeReceived;
    private closeTimer;
    private terminating;
    constructor(url: string | URL, protocols: string | string[] | undefined, connector: TorStreamConnector);
    send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void;
    close(code?: number, reason?: string): void;
    private connect;
    private readHandshake;
    private readLoop;
    private readFrame;
    private ensureBytes;
    private handleFrame;
    private appendFragment;
    private clearFragments;
    private deliverMessage;
    private handleCloseFrame;
    private queueDataFrame;
    private queueFrame;
    private writeFrame;
    private startCloseTimer;
    private fail;
    private finishClose;
    private emit;
}

declare class MemoryStorage implements TorStorage {
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

/** Storage interface without locking — just the CRUD methods. */
type TorStorageSimple = Omit<TorStorage, 'tryLock' | 'unlock'>;
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
declare function addLocking(inner: TorStorageSimple, name: string): TorStorage;

declare class IndexedDBStorage implements TorStorageSimple {
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

declare class FilesystemStorage implements TorStorageSimple {
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

declare function createAutoStorage(name?: string): TorStorage;

type index_FilesystemStorage = FilesystemStorage;
declare const index_FilesystemStorage: typeof FilesystemStorage;
type index_IndexedDBStorage = IndexedDBStorage;
declare const index_IndexedDBStorage: typeof IndexedDBStorage;
type index_MemoryStorage = MemoryStorage;
declare const index_MemoryStorage: typeof MemoryStorage;
type index_TorStorageSimple = TorStorageSimple;
declare const index_addLocking: typeof addLocking;
declare const index_createAutoStorage: typeof createAutoStorage;
declare namespace index {
  export { index_FilesystemStorage as FilesystemStorage, index_IndexedDBStorage as IndexedDBStorage, index_MemoryStorage as MemoryStorage, type index_TorStorageSimple as TorStorageSimple, index_addLocking as addLocking, index_createAutoStorage as createAutoStorage };
}

/**
 * Override the WASM binary URL. Must be called before any TorClient is created.
 */
declare function setWasmUrl(url: string | URL): void;

/**
 * KPS address parsing, vendored from `@kpstreams/core` so tor-js carries no
 * *runtime* dependency on that package — only its erasable types. This lets an
 * embedder that injects its own KPS transport (e.g. a sandboxed worker granted
 * a KPS capability) mark `@kpstreams/*` external and ship a bundle with no KPS
 * client code. Keep in sync with `@kpstreams/core`'s address parser.
 *
 * Wire format: `<ip>:<udp-port>:<certhash>`, IPv6 hosts bracketed
 * (`[<ipv6>]:<port>:<certhash>`, since the literal itself contains colons).
 */
interface KpsAddress {
    ip: string;
    port: number;
    certhash: string;
}
declare function parseAddress(s: string): KpsAddress;
declare function formatAddress(addr: KpsAddress): string;

export { ArtiSocket as A, type DialFn as D, type FetchInit as F, type GatewayResponse as G, type KpsAddress as K, type LogLevel as L, type TorWebSocketConstructor as T, type TorClientOptions as a, TorWebSocket as b, ArtiSocketProvider as c, type ArtiSocketProviderOptions as d, KpsGateway as e, type KpsGatewayOptions as f, Log as g, type LogLevel$1 as h, type TorByteStream as i, type TorStorage as j, type TorStreamConnector as k, formatAddress as l, index as m, parseAddress as p, setWasmUrl as s };
