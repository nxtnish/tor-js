export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
/** @internal Whether `level` is at or above `min` (e.g. `warn` passes an `info` minimum). */
export declare function levelEnabled(level: LogLevel, min: LogLevel): boolean;
type RawLog = (level: LogLevel, ...args: unknown[]) => void;
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
export declare class Log {
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
export {};
//# sourceMappingURL=Log.d.ts.map