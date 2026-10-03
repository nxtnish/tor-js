const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_HANDSHAKE_BYTES = 64 * 1024
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024
const CLOSE_TIMEOUT_MS = 5_000

export interface TorByteStream {
  read(): Promise<Uint8Array | null>
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
}

export type TorStreamConnector = (url: string) => Promise<TorByteStream>

export interface TorWebSocketConstructor {
  readonly CONNECTING: number
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number
  new (url: string | URL, protocols?: string | string[]): TorWebSocket
}

type Frame = {
  fin: boolean
  opcode: number
  payload: Uint8Array
}

export class TorWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = TorWebSocket.CONNECTING
  readonly OPEN = TorWebSocket.OPEN
  readonly CLOSING = TorWebSocket.CLOSING
  readonly CLOSED = TorWebSocket.CLOSED

  readonly url: string
  readonly extensions = ''

  binaryType: BinaryType = 'blob'
  bufferedAmount = 0
  protocol = ''
  readyState = TorWebSocket.CONNECTING

  onopen: ((this: TorWebSocket, event: Event) => unknown) | null = null
  onmessage: ((this: TorWebSocket, event: MessageEvent) => unknown) | null = null
  onerror: ((this: TorWebSocket, event: Event) => unknown) | null = null
  onclose: ((this: TorWebSocket, event: CloseEvent) => unknown) | null = null

  private readonly connector: TorStreamConnector
  private readonly protocols: string[]
  private stream: TorByteStream | null = null
  private incoming: Uint8Array = new Uint8Array()
  private writeChain: Promise<void> = Promise.resolve()
  private fragmentOpcode: number | null = null
  private fragments: Uint8Array[] = []
  private fragmentLength = 0
  private closeSent = false
  private closeReceived = false
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  private terminating = false

  constructor(
    url: string | URL,
    protocols: string | string[] | undefined,
    connector: TorStreamConnector,
  ) {
    super()
    this.url = normalizeWebSocketUrl(url)
    this.protocols = normalizeProtocols(protocols)
    this.connector = connector
    void this.connect()
  }

  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void {
    if (this.readyState !== TorWebSocket.OPEN) {
      throw invalidStateError('WebSocket is not open')
    }

    if (typeof data === 'string') {
      const payload = new TextEncoder().encode(data)
      this.queueDataFrame(0x1, payload.byteLength, async () => payload)
      return
    }

    if (isBlob(data)) {
      this.queueDataFrame(0x2, data.size, async () => new Uint8Array(await data.arrayBuffer()))
      return
    }

    const payload = toUint8Array(data)
    this.queueDataFrame(0x2, payload.byteLength, async () => payload)
  }

  close(code?: number, reason = ''): void {
    const reasonBytes = new TextEncoder().encode(reason)
    validateClose(code, reasonBytes)

    if (this.readyState === TorWebSocket.CLOSED || this.readyState === TorWebSocket.CLOSING) {
      return
    }

    if (this.readyState === TorWebSocket.CONNECTING) {
      this.readyState = TorWebSocket.CLOSING
      this.finishClose(1006, '', false)
      return
    }

    this.readyState = TorWebSocket.CLOSING
    this.closeSent = true
    const payload = encodeClosePayload(code, reasonBytes)
    void this.queueFrame(0x8, payload).catch(() => undefined)
    this.startCloseTimer()
  }

  private async connect(): Promise<void> {
    try {
      const stream = await this.connector(this.url)
      this.stream = stream

      if (this.readyState !== TorWebSocket.CONNECTING) {
        await stream.close().catch(() => undefined)
        this.finishClose(1006, '', false)
        return
      }

      const key = randomBase64(16)
      await stream.write(buildHandshakeRequest(new URL(this.url), key, this.protocols))
      const response = await this.readHandshake()
      this.protocol = await validateHandshake(response, key, this.protocols)

      if (this.readyState !== TorWebSocket.CONNECTING) {
        await stream.close().catch(() => undefined)
        this.finishClose(1006, '', false)
        return
      }

      this.readyState = TorWebSocket.OPEN
      this.emit('open', new Event('open'))
      void this.readLoop()
    } catch (error) {
      await this.fail(error)
    }
  }

  private async readHandshake(): Promise<string> {
    let bytes: Uint8Array = this.incoming

    while (true) {
      const end = findHeaderEnd(bytes)
      if (end >= 0) {
        const response = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end))
        this.incoming = bytes.slice(end + 4)
        return response
      }
      if (bytes.byteLength >= MAX_HANDSHAKE_BYTES) {
        throw new Error('WebSocket handshake response is too large')
      }

      const chunk = await this.stream?.read()
      if (!chunk?.byteLength) {
        throw new Error('Tor stream closed during WebSocket handshake')
      }
      bytes = concatBytes(bytes, chunk)
    }
  }

  private async readLoop(): Promise<void> {
    try {
      while (this.readyState === TorWebSocket.OPEN || this.readyState === TorWebSocket.CLOSING) {
        const frame = await this.readFrame()
        if (!frame) {
          if (!this.closeReceived) {
            this.finishClose(1006, '', false)
          }
          return
        }
        await this.handleFrame(frame)
      }
    } catch (error) {
      await this.fail(error)
    }
  }

  private async readFrame(): Promise<Frame | null> {
    if (!(await this.ensureBytes(2))) return null

    const first = this.incoming[0]
    const second = this.incoming[1]
    const fin = (first & 0x80) !== 0
    const rsv = first & 0x70
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let offset = 2

    if (rsv !== 0) throw new ProtocolError('RSV bits are set without an extension')
    if (masked) throw new ProtocolError('Server frames must not be masked')

    if (length === 126) {
      if (!(await this.ensureBytes(4))) return null
      length = new DataView(this.incoming.buffer, this.incoming.byteOffset + 2, 2).getUint16(0)
      if (length < 126) throw new ProtocolError('Non-canonical WebSocket frame length')
      offset = 4
    } else if (length === 127) {
      if (!(await this.ensureBytes(10))) return null
      const longLength = new DataView(this.incoming.buffer, this.incoming.byteOffset + 2, 8).getBigUint64(0)
      if (longLength < 65_536n || longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new ProtocolError('Invalid WebSocket frame length')
      }
      length = Number(longLength)
      offset = 10
    }

    const isControl = opcode >= 0x8
    if (isControl && (!fin || length > 125)) {
      throw new ProtocolError('Invalid fragmented or oversized control frame')
    }
    if (length > MAX_MESSAGE_BYTES) {
      throw new MessageTooLargeError()
    }
    if (!(await this.ensureBytes(offset + length))) return null

    const payload = this.incoming.slice(offset, offset + length)
    this.incoming = this.incoming.slice(offset + length)
    return { fin, opcode, payload }
  }

  private async ensureBytes(length: number): Promise<boolean> {
    while (this.incoming.byteLength < length) {
      const chunk = await this.stream?.read()
      if (!chunk?.byteLength) return false
      this.incoming = concatBytes(this.incoming, chunk)
    }
    return true
  }

  private async handleFrame(frame: Frame): Promise<void> {
    if (frame.opcode === 0x8) {
      await this.handleCloseFrame(frame.payload)
      return
    }
    if (frame.opcode === 0x9) {
      await this.queueFrame(0xa, frame.payload)
      return
    }
    if (frame.opcode === 0xa) return

    if (frame.opcode === 0x0) {
      if (this.fragmentOpcode === null) {
        throw new ProtocolError('Unexpected continuation frame')
      }
      this.appendFragment(frame.payload)
      if (frame.fin) {
        const opcode = this.fragmentOpcode
        const payload = concatMany(this.fragments, this.fragmentLength)
        this.clearFragments()
        this.deliverMessage(opcode, payload)
      }
      return
    }

    if (frame.opcode !== 0x1 && frame.opcode !== 0x2) {
      throw new ProtocolError('Unsupported WebSocket opcode')
    }
    if (this.fragmentOpcode !== null) {
      throw new ProtocolError('Received a new data frame during a fragmented message')
    }

    if (frame.fin) {
      this.deliverMessage(frame.opcode, frame.payload)
    } else {
      this.fragmentOpcode = frame.opcode
      this.appendFragment(frame.payload)
    }
  }

  private appendFragment(payload: Uint8Array): void {
    this.fragmentLength += payload.byteLength
    if (this.fragmentLength > MAX_MESSAGE_BYTES) throw new MessageTooLargeError()
    this.fragments.push(payload)
  }

  private clearFragments(): void {
    this.fragmentOpcode = null
    this.fragments = []
    this.fragmentLength = 0
  }

  private deliverMessage(opcode: number, payload: Uint8Array): void {
    let data: string | ArrayBuffer | Blob
    if (opcode === 0x1) {
      try {
        data = new TextDecoder('utf-8', { fatal: true }).decode(payload)
      } catch {
        throw new ProtocolError('Text message contains invalid UTF-8')
      }
    } else if (this.binaryType === 'arraybuffer' || typeof Blob === 'undefined') {
      data = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer
    } else {
      data = new Blob([payload])
    }
    this.emit('message', new MessageEvent('message', { data, origin: new URL(this.url).origin }))
  }

  private async handleCloseFrame(payload: Uint8Array): Promise<void> {
    if (payload.byteLength === 1) throw new ProtocolError('Invalid WebSocket close payload')

    let code = 1005
    let reason = ''
    if (payload.byteLength >= 2) {
      code = new DataView(payload.buffer, payload.byteOffset, 2).getUint16(0)
      if (!isValidReceivedCloseCode(code)) throw new ProtocolError('Invalid WebSocket close code')
      try {
        reason = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(2))
      } catch {
        throw new ProtocolError('Close reason contains invalid UTF-8')
      }
    }

    this.closeReceived = true
    this.readyState = TorWebSocket.CLOSING
    if (!this.closeSent) {
      this.closeSent = true
      await this.queueFrame(0x8, payload)
    }
    await this.stream?.close().catch(() => undefined)
    this.finishClose(code, reason, true)
  }

  private queueDataFrame(
    opcode: number,
    byteLength: number,
    getPayload: () => Promise<Uint8Array>,
  ): void {
    this.bufferedAmount += byteLength
    const operation = this.writeChain.then(async () => {
      const payload = await getPayload()
      if (this.readyState !== TorWebSocket.OPEN) return
      await this.writeFrame(opcode, payload)
    })
    this.writeChain = operation.catch(() => undefined)
    void operation.then(
      () => {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - byteLength)
      },
      async (error) => {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - byteLength)
        await this.fail(error)
      },
    )
  }

  private queueFrame(opcode: number, payload: Uint8Array): Promise<void> {
    const operation = this.writeChain.then(() => this.writeFrame(opcode, payload))
    this.writeChain = operation.catch(() => undefined)
    return operation
  }

  private async writeFrame(opcode: number, payload: Uint8Array): Promise<void> {
    if (!this.stream) throw new Error('Tor stream is not connected')
    await this.stream.write(encodeClientFrame(opcode, payload))
  }

  private startCloseTimer(): void {
    this.closeTimer = setTimeout(() => {
      void this.stream?.close().catch(() => undefined)
      this.finishClose(1006, '', false)
    }, CLOSE_TIMEOUT_MS)
  }

  private async fail(error: unknown): Promise<void> {
    if (this.readyState === TorWebSocket.CLOSED || this.terminating) return
    this.terminating = true

    const closeCode = error instanceof MessageTooLargeError ? 1009 : error instanceof ProtocolError ? 1002 : 1006
    if (this.readyState === TorWebSocket.OPEN && closeCode !== 1006) {
      this.readyState = TorWebSocket.CLOSING
      this.closeSent = true
      await this.queueFrame(0x8, encodeClosePayload(closeCode, new Uint8Array())).catch(() => undefined)
    }

    this.emit('error', new Event('error'))
    await this.stream?.close().catch(() => undefined)
    this.finishClose(closeCode, errorMessage(error), false)
  }

  private finishClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === TorWebSocket.CLOSED) return
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = null
    this.readyState = TorWebSocket.CLOSED
    this.stream = null
    this.clearFragments()
    this.emit('close', createCloseEvent(code, reason, wasClean))
  }

  private emit(type: 'open' | 'message' | 'error' | 'close', event: Event): void {
    this.dispatchEvent(event)
    const handler = this[`on${type}`]
    if (!handler) return
    try {
      handler.call(this, event as never)
    } catch (error) {
      queueMicrotask(() => {
        throw error
      })
    }
  }
}

class ProtocolError extends Error {}
class MessageTooLargeError extends Error {
  constructor() {
    super('WebSocket message exceeds the 16 MiB limit')
  }
}

function normalizeWebSocketUrl(value: string | URL): string {
  const url = new URL(value)
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new SyntaxError('WebSocket URL must use ws: or wss:')
  }
  if (url.username || url.password) throw new SyntaxError('WebSocket URL must not contain credentials')
  if (url.hash) throw new SyntaxError('WebSocket URL must not contain a fragment')
  return url.href
}

function normalizeProtocols(value?: string | string[]): string[] {
  const protocols = value === undefined ? [] : typeof value === 'string' ? [value] : [...value]
  const seen = new Set<string>()
  for (const protocol of protocols) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(protocol)) {
      throw new SyntaxError(`Invalid WebSocket protocol: ${protocol}`)
    }
    if (seen.has(protocol)) throw new SyntaxError(`Duplicate WebSocket protocol: ${protocol}`)
    seen.add(protocol)
  }
  return protocols
}

function buildHandshakeRequest(url: URL, key: string, protocols: string[]): Uint8Array {
  const path = `${url.pathname || '/'}${url.search}`
  const headers = [
    `GET ${path} HTTP/1.1`,
    `Host: ${url.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
  ]
  if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
    headers.push(`Origin: ${location.origin}`)
  }
  if (protocols.length) headers.push(`Sec-WebSocket-Protocol: ${protocols.join(', ')}`)
  return new TextEncoder().encode(`${headers.join('\r\n')}\r\n\r\n`)
}

async function validateHandshake(response: string, key: string, protocols: string[]): Promise<string> {
  const lines = response.split('\r\n')
  const status = /^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/i.exec(lines.shift() ?? '')
  if (!status || status[1] !== '101') throw new Error('WebSocket server rejected the upgrade')

  const headers = new Map<string, string>()
  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator <= 0) throw new Error('Invalid WebSocket handshake header')
    const name = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value)
  }

  if (!hasHeaderToken(headers.get('upgrade'), 'websocket')) {
    throw new Error('WebSocket upgrade header is missing')
  }
  if (!hasHeaderToken(headers.get('connection'), 'upgrade')) {
    throw new Error('WebSocket connection header is missing')
  }

  const expectedAccept = await sha1Base64(`${key}${WEBSOCKET_GUID}`)
  if (headers.get('sec-websocket-accept') !== expectedAccept) {
    throw new Error('WebSocket server returned an invalid accept key')
  }
  if (headers.has('sec-websocket-extensions')) {
    throw new Error('WebSocket server selected an unsupported extension')
  }

  const selectedProtocol = headers.get('sec-websocket-protocol') ?? ''
  if (selectedProtocol && !protocols.includes(selectedProtocol)) {
    throw new Error('WebSocket server selected an unsupported protocol')
  }
  if (!selectedProtocol && protocols.length && headers.has('sec-websocket-protocol')) {
    throw new Error('WebSocket server returned an invalid protocol')
  }
  return selectedProtocol
}

function encodeClientFrame(opcode: number, payload: Uint8Array): Uint8Array {
  const mask = crypto.getRandomValues(new Uint8Array(4))
  let headerLength = 2
  if (payload.byteLength >= 126 && payload.byteLength <= 0xffff) headerLength += 2
  else if (payload.byteLength > 0xffff) headerLength += 8

  const frame = new Uint8Array(headerLength + 4 + payload.byteLength)
  frame[0] = 0x80 | opcode
  let offset = 2
  if (payload.byteLength < 126) {
    frame[1] = 0x80 | payload.byteLength
  } else if (payload.byteLength <= 0xffff) {
    frame[1] = 0x80 | 126
    new DataView(frame.buffer).setUint16(2, payload.byteLength)
    offset = 4
  } else {
    frame[1] = 0x80 | 127
    new DataView(frame.buffer).setBigUint64(2, BigInt(payload.byteLength))
    offset = 10
  }
  frame.set(mask, offset)
  offset += 4
  for (let index = 0; index < payload.byteLength; index += 1) {
    frame[offset + index] = payload[index] ^ mask[index % 4]
  }
  return frame
}

function encodeClosePayload(code: number | undefined, reason: Uint8Array): Uint8Array {
  if (code === undefined) return new Uint8Array()
  const payload = new Uint8Array(2 + reason.byteLength)
  new DataView(payload.buffer).setUint16(0, code)
  payload.set(reason, 2)
  return payload
}

function validateClose(code: number | undefined, reason: Uint8Array): void {
  if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
    throw new RangeError('Close code must be 1000 or between 3000 and 4999')
  }
  if (reason.byteLength > 123) throw new SyntaxError('Close reason exceeds 123 UTF-8 bytes')
  if (code === undefined && reason.byteLength) throw new SyntaxError('A close reason requires a close code')
}

function isValidReceivedCloseCode(code: number): boolean {
  if (code < 1000 || code >= 5000) return false
  if ([1004, 1005, 1006, 1015].includes(code)) return false
  return code < 1016 || code >= 3000
}

function hasHeaderToken(value: string | undefined, token: string): boolean {
  return value?.split(',').some((part) => part.trim().toLowerCase() === token) ?? false
}

function findHeaderEnd(bytes: Uint8Array): number {
  for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
      return index
    }
  }
  return -1
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(left.byteLength + right.byteLength)
  bytes.set(left)
  bytes.set(right, left.byteLength)
  return bytes
}

function concatMany(chunks: Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function toUint8Array(data: ArrayBufferLike | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
  }
  return new Uint8Array(data).slice()
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function randomBase64(length: number): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(length)))
}

async function sha1Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return bytesToBase64(new Uint8Array(digest))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function invalidStateError(message: string): Error {
  return typeof DOMException === 'undefined' ? new Error(message) : new DOMException(message, 'InvalidStateError')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createCloseEvent(code: number, reason: string, wasClean: boolean): CloseEvent {
  if (typeof CloseEvent !== 'undefined') return new CloseEvent('close', { code, reason, wasClean })
  const event = new Event('close') as CloseEvent
  Object.defineProperties(event, {
    code: { value: code, enumerable: true },
    reason: { value: reason, enumerable: true },
    wasClean: { value: wasClean, enumerable: true },
  })
  return event
}
