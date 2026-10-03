import { createHash } from 'node:crypto'
import { test, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { bundleTs } from './bundle.mjs'

let TorWebSocket

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

before(async () => {
  ;({ TorWebSocket } = await bundleTs('src/TorWebSocket.ts', 'torWebSocket'))
})

describe('TorWebSocket', () => {
  test('validates URLs and subprotocols synchronously', () => {
    const connector = async () => new FakeStream()
    assert.throws(() => new TorWebSocket('https://example.com', undefined, connector), /ws: or wss:/)
    assert.throws(() => new TorWebSocket('wss://user@example.com', undefined, connector), /credentials/)
    assert.throws(() => new TorWebSocket('wss://example.com/#x', undefined, connector), /fragment/)
    assert.throws(() => new TorWebSocket('wss://example.com', 'not valid', connector), /protocol/)
    assert.throws(() => new TorWebSocket('wss://example.com', ['chat', 'chat'], connector), /Duplicate/)
  })

  test('performs an RFC 6455 handshake and preserves bytes after the headers', async () => {
    const firstMessage = serverFrame(0x1, encoder.encode('hello through tor'))
    const stream = new FakeStream({ firstFrame: firstMessage })
    const socket = new TorWebSocket('wss://relay.example:8443/nostr?x=1', ['nostr'], async () => stream)
    const openPromise = propertyEvent(socket, 'open')
    const messagePromise = propertyEvent(socket, 'message')
    await openPromise

    const request = decoder.decode(stream.writes[0])
    assert.match(request, /^GET \/nostr\?x=1 HTTP\/1\.1\r\n/)
    assert.match(request, /\r\nHost: relay\.example:8443\r\n/)
    assert.match(request, /\r\nSec-WebSocket-Protocol: nostr\r\n/)
    assert.equal(socket.protocol, 'nostr')
    assert.equal((await messagePromise).data, 'hello through tor')

    stream.push(serverFrame(0x8, closePayload(1000, 'done')))
    await once(socket, 'close')
  })

  test('masks outgoing frames and answers ping frames with pong', async () => {
    const stream = new FakeStream()
    const socket = new TorWebSocket('ws://relay.example/', undefined, async () => stream)
    await once(socket, 'open')

    socket.send('EVENT')
    await waitFor(() => stream.writes.length >= 2)
    const data = decodeClientFrame(stream.writes[1])
    assert.equal(data.opcode, 0x1)
    assert.equal(data.masked, true)
    assert.equal(decoder.decode(data.payload), 'EVENT')

    stream.push(serverFrame(0x9, encoder.encode('probe')))
    await waitFor(() => stream.writes.length >= 3)
    const pong = decodeClientFrame(stream.writes[2])
    assert.equal(pong.opcode, 0xa)
    assert.equal(pong.masked, true)
    assert.equal(decoder.decode(pong.payload), 'probe')

    stream.push(serverFrame(0x8, closePayload(1000, 'done')))
    await once(socket, 'close')
  })

  test('reassembles fragmented messages', async () => {
    const stream = new FakeStream()
    const socket = new TorWebSocket('wss://relay.example/', undefined, async () => stream)
    await once(socket, 'open')
    const messagePromise = once(socket, 'message')

    stream.push(serverFrame(0x1, encoder.encode('hel'), false))
    stream.push(serverFrame(0x0, encoder.encode('lo'), true))
    assert.equal((await messagePromise).data, 'hello')

    stream.push(serverFrame(0x8, closePayload(1000, 'done')))
    await once(socket, 'close')
  })

  test('handles payloads that use the 64-bit frame length', async () => {
    const stream = new FakeStream()
    const socket = new TorWebSocket('wss://relay.example/', undefined, async () => stream)
    await once(socket, 'open')
    const body = 'x'.repeat(70_000)

    socket.send(body)
    await waitFor(() => stream.writes.length >= 2)
    const sent = decodeClientFrame(stream.writes[1])
    assert.equal(sent.payload.byteLength, 70_000)
    assert.equal(decoder.decode(sent.payload), body)

    const messagePromise = once(socket, 'message')
    stream.push(serverFrame(0x1, encoder.encode(body)))
    assert.equal((await messagePromise).data, body)

    stream.push(serverFrame(0x8, closePayload(1000, 'done')))
    await once(socket, 'close')
  })

  test('rejects an invalid handshake and reports an abnormal close', async () => {
    const stream = new FakeStream({ invalidAccept: true })
    const socket = new TorWebSocket('wss://relay.example/', undefined, async () => stream)
    const errorPromise = once(socket, 'error')
    const closePromise = once(socket, 'close')

    await errorPromise
    const event = await closePromise
    assert.equal(event.code, 1006)
    assert.equal(event.wasClean, false)
    assert.equal(socket.readyState, TorWebSocket.CLOSED)
  })

  test('sends a close frame and completes the closing handshake', async () => {
    const stream = new FakeStream()
    const socket = new TorWebSocket('wss://relay.example/', undefined, async () => stream)
    await once(socket, 'open')
    socket.close(1000, 'bye')
    await waitFor(() => stream.writes.length >= 2)

    const sent = decodeClientFrame(stream.writes[1])
    assert.equal(sent.opcode, 0x8)
    assert.equal(new DataView(sent.payload.buffer, sent.payload.byteOffset, 2).getUint16(0), 1000)
    assert.equal(decoder.decode(sent.payload.subarray(2)), 'bye')

    stream.push(serverFrame(0x8, sent.payload))
    const event = await once(socket, 'close')
    assert.equal(event.code, 1000)
    assert.equal(event.reason, 'bye')
    assert.equal(event.wasClean, true)
  })
})

class FakeStream {
  constructor({ invalidAccept = false, firstFrame = null } = {}) {
    this.invalidAccept = invalidAccept
    this.firstFrame = firstFrame
    this.writes = []
    this.reads = []
    this.waiters = []
    this.closed = false
  }

  async write(data) {
    const copy = data.slice()
    this.writes.push(copy)
    if (this.writes.length !== 1) return

    const request = decoder.decode(copy)
    const key = /Sec-WebSocket-Key: ([^\r]+)\r\n/i.exec(request)?.[1]
    assert.ok(key, 'client handshake contains a key')
    const accept = this.invalidAccept
      ? 'invalid'
      : createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    const protocol = /Sec-WebSocket-Protocol: nostr\r\n/i.test(request)
      ? 'Sec-WebSocket-Protocol: nostr\r\n'
      : ''
    const response = encoder.encode(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${protocol}\r\n`,
    )
    this.push(this.firstFrame ? concat(response, this.firstFrame) : response)
  }

  read() {
    if (this.reads.length) return Promise.resolve(this.reads.shift())
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  push(data) {
    const waiter = this.waiters.shift()
    if (waiter) waiter(data)
    else this.reads.push(data)
  }

  async close() {
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter(null)
  }
}

function serverFrame(opcode, payload, fin = true) {
  const extendedLength = payload.byteLength < 126 ? 0 : payload.byteLength <= 0xffff ? 2 : 8
  const frame = new Uint8Array(2 + extendedLength + payload.byteLength)
  frame[0] = (fin ? 0x80 : 0) | opcode
  if (extendedLength === 0) {
    frame[1] = payload.byteLength
  } else if (extendedLength === 2) {
    frame[1] = 126
    new DataView(frame.buffer).setUint16(2, payload.byteLength)
  } else {
    frame[1] = 127
    new DataView(frame.buffer).setBigUint64(2, BigInt(payload.byteLength))
  }
  frame.set(payload, 2 + extendedLength)
  return frame
}

function decodeClientFrame(frame) {
  const masked = (frame[1] & 0x80) !== 0
  let length = frame[1] & 0x7f
  let offset = 2
  if (length === 126) {
    length = new DataView(frame.buffer, frame.byteOffset + 2, 2).getUint16(0)
    offset = 4
  } else if (length === 127) {
    length = Number(new DataView(frame.buffer, frame.byteOffset + 2, 8).getBigUint64(0))
    offset = 10
  }
  const mask = frame.subarray(offset, offset + 4)
  const payload = frame.slice(offset + 4, offset + 4 + length)
  for (let index = 0; index < payload.byteLength; index += 1) {
    payload[index] ^= mask[index % 4]
  }
  return { opcode: frame[0] & 0x0f, masked, payload }
}

function closePayload(code, reason) {
  const reasonBytes = encoder.encode(reason)
  const payload = new Uint8Array(2 + reasonBytes.byteLength)
  new DataView(payload.buffer).setUint16(0, code)
  payload.set(reasonBytes, 2)
  return payload
}

function concat(left, right) {
  const bytes = new Uint8Array(left.byteLength + right.byteLength)
  bytes.set(left)
  bytes.set(right, left.byteLength)
  return bytes
}

function once(target, type) {
  return new Promise((resolve) => target.addEventListener(type, resolve, { once: true }))
}

function propertyEvent(target, type) {
  return new Promise((resolve) => {
    target[`on${type}`] = resolve
  })
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await tick()
  }
  assert.fail('condition was not reached')
}
