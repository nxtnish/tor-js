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
import { KpsGateway, type GatewayResponse } from './kpsGateway.js';
import type { DialFn } from './kpsDial.js';
import type { Log } from './Log.js';
/** Per-attempt deadline and post-failure cooldown, in ms. */
export interface GatewayTiming {
    /** Budget for one gateway attempt: dial + open stream + response head. */
    attemptTimeoutMs: number;
    /** Cooldown after a first failure; doubles per consecutive failure. */
    cooldownBaseMs: number;
    /** Ceiling on the cooldown. */
    cooldownMaxMs: number;
}
/** How a socket ended: cleanly, or with an error reason. */
export interface ArtiSocketCloseInfo {
    ok: boolean;
    reason?: string;
}
/** The parts a transport supplies to build an {@link ArtiSocket}. */
export interface ArtiSocketParts {
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
export declare class ArtiSocket {
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
export interface ArtiSocketProviderOptions {
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
export declare class ArtiSocketProvider {
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
//# sourceMappingURL=socketProvider.d.ts.map