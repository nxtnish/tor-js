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
import type { DialFn } from './kpsDial.js';
import type { Log } from './Log.js';
import { ArtiSocket } from './socketProvider.js';
export interface GatewayResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Uint8Array;
}
/** Options for {@link KpsGateway}. */
export interface KpsGatewayOptions {
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
export declare class KpsGateway {
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
//# sourceMappingURL=kpsGateway.d.ts.map