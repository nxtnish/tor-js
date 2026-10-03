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
export interface KpsAddress {
    ip: string;
    port: number;
    certhash: string;
}
export declare function parseAddress(s: string): KpsAddress;
export declare function formatAddress(addr: KpsAddress): string;
//# sourceMappingURL=kpsAddress.d.ts.map