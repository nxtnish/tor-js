/**
 * Reject as soon as `signal` aborts, without disturbing `p` itself. Used to
 * bound one caller's wait on shared work (a dial, bootstrap): the work keeps
 * running, so a result that lands late still serves the other waiters.
 */
export declare function abortRace<T>(p: Promise<T>, signal: AbortSignal | undefined, makeError: () => Error): Promise<T>;
/**
 * The error a fetch rejects with when its signal aborts, shaped like the one
 * the WASM side raises (`JsTorError::aborted`).
 */
export declare function abortError(): Error;
//# sourceMappingURL=abort.d.ts.map