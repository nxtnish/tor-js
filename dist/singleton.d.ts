import type { TorClientOptions, FetchInit } from './types.js';
export declare const tor: {
    /**
     * Make an HTTP fetch request through Tor.
     * Automatically opens the TorClient on first use.
     */
    fetch(url: string, init?: FetchInit): Promise<Response>;
    /**
     * Configure the singleton TorClient.
     * If already open, closes and reopens with the new config.
     */
    configure(options: TorClientOptions): void;
    /**
     * Open the singleton TorClient.
     * Optional — fetch() calls this automatically.
     * Call this early if you know you'll need Tor, to start bootstrapping sooner.
     */
    open(): void;
    /**
     * Close the singleton TorClient and release resources.
     */
    close(): void;
};
//# sourceMappingURL=singleton.d.ts.map