/**
 * The built-in KPS dialer: WebRTC in browsers (`@kpstreams/webrtc-client`),
 * QUIC in Node/Deno (the optional `@kpstreams/quic-client` package).
 *
 * This lives in its own module — {@link KpsGateway} imports it *lazily*, and
 * only when no custom `dial` was injected — so an embedder that supplies its
 * own transport can mark `@kpstreams/*` external and ship a bundle that never
 * pulls in the KPS client code.
 */
import type { Connection } from '@kpstreams/core';
/** Opens a KPS connection to a gateway address (`ip:port:certhash`). */
export type DialFn = (address: string) => Promise<Connection>;
/**
 * Pick the KPS dialer for this environment: WebRTC in browsers, QUIC in
 * Node/Deno via the optional `@kpstreams/quic-client` package.
 */
export declare const kpsDial: DialFn;
//# sourceMappingURL=kpsDial.d.ts.map