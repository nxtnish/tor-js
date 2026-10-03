export interface TorByteStream {
    read(): Promise<Uint8Array | null>;
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
export type TorStreamConnector = (url: string) => Promise<TorByteStream>;
export interface TorWebSocketConstructor {
    readonly CONNECTING: number;
    readonly OPEN: number;
    readonly CLOSING: number;
    readonly CLOSED: number;
    new (url: string | URL, protocols?: string | string[]): TorWebSocket;
}
export declare class TorWebSocket extends EventTarget {
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
//# sourceMappingURL=TorWebSocket.d.ts.map