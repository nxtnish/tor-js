import './polyfills.js';
import { TorClient as WasmTorClient, TorClientOptions as WasmTorClientOptions } from '#wasm';
export { WasmTorClient, WasmTorClientOptions };
type WasmLogCallback = (level: string, target: string, message: string) => void;
/**
 * Register a log callback at a given level. The WASM subscriber is
 * automatically widened to the broadest level across all listeners.
 * Each listener only receives events at or above its own level.
 * Returns an unregister function.
 */
export declare function addLogListener(cb: WasmLogCallback, level?: string): () => void;
/**
 * Update the level for an existing listener and re-sync the WASM filter.
 */
export declare function setListenerLevel(cb: WasmLogCallback, level: string): void;
type WasmSourceProvider = () => Promise<BufferSource | Uint8Array>;
/**
 * Override the WASM binary URL. Must be called before any TorClient is created.
 */
export declare function setWasmUrl(url: string | URL): void;
/**
 * Set a custom WASM source provider. Called by entry points to configure
 * how the WASM binary is loaded (e.g. base64 decode, CDN fetch).
 * Must be called before any TorClient is created.
 */
export declare function setWasmSourceProvider(provider: WasmSourceProvider): void;
/**
 * Ensures the WASM module is loaded and initialized. Idempotent.
 */
export declare function ensureWasmInitialized(): Promise<void>;
//# sourceMappingURL=wasm.d.ts.map