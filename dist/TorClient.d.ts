import type { TorClientOptions, FetchInit, LogLevel } from './types.js';
export declare class TorClient {
    private log;
    private logLevel;
    private clientPromise;
    private removeLogListener;
    private wasmCallback;
    private closed;
    private readyPromise;
    private socketProvider;
    constructor(options?: TorClientOptions);
    private bootstrap;
    /**
     * Make an HTTP fetch request through Tor.
     * Returns a standard browser Response object.
     */
    fetch(url: string, init?: FetchInit): Promise<Response>;
    /**
     * Wait for the Tor client to be ready for traffic
     * (guard connected, usable consensus, and sufficient microdescs).
     *
     * Parallel callers share the same underlying promise — a single WS
     * connection failure rejects all waiters. The cached promise is cleared
     * on settle so the next call creates a fresh attempt.
     */
    ready(): Promise<void>;
    /**
     * Change the log level for this client's listener.
     * Also re-syncs the global WASM filter to the broadest level across all clients.
     */
    setLogLevel(level: LogLevel): void;
    /**
     * Close the TorClient and release resources.
     */
    close(): void;
    [Symbol.dispose](): void;
}
//# sourceMappingURL=TorClient.d.ts.map