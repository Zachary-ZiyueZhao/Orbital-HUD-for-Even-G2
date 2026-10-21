import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { encodeGrayPng } = await loadModule('../src/hud-png.ts')
const { HUD_WIDTH, HUD_HEIGHT, surfaceRects, surfaceTile, surfaceLayoutForPage } = await loadModule('../src/hud-surface.ts')

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Decode independently: check standard PNG chunks/CRCs and reconstruct both
// supported row filters before comparing every pixel at display precision.
function decodePng(png, width, height) {
  const input = Buffer.from(png)
  assert.deepEqual([...input.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = []
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset)
    const type = input.toString('ascii', offset + 4, offset + 8)
    const payload = input.subarray(offset + 8, offset + 8 + length)
    assert.equal(input.readUInt32BE(offset + 8 + length), crc32(input.subarray(offset + 4, offset + 8 + length)))
    if (type === 'IHDR') {
      assert.equal(payload.readUInt32BE(0), width)
      assert.equal(payload.readUInt32BE(4), height)
      assert.deepEqual([...payload.subarray(8)], [4, 0, 0, 0, 0])
    }
    if (type === 'IDAT') chunks.push(payload)
    offset += length + 12
  }
  const data = inflateSync(Buffer.concat(chunks))
  const stride = Math.ceil(width / 2)
  assert.equal(data.length, (stride + 1) * height)
  const pixels = new Uint8Array(width * height)
  let previous = new Uint8Array(stride)
  for (let row = 0; row < height; row++) {
    const offset = row * (stride + 1)
    assert.ok(data[offset] === 0 || data[offset] === 2)
    const packed = new Uint8Array(stride)
    for (let column = 0; column < stride; column++) packed[column] = (data[offset + 1 + column] + (data[offset] === 2 ? previous[column] : 0)) & 255
    for (let column = 0; column < width; column++) pixels[row * width + column] = ((packed[column >>> 1] >>> (column % 2 === 0 ? 4 : 0)) & 15) * 17
    previous = packed
  }
  return pixels
}

for (const [width, height] of [[1, 1], [21, 23], [226, 144], [288, 144]]) {
  const patterns = [
    new Uint8Array(width * height), new Uint8Array(width * height).fill(255),
    Uint8Array.from({ length: width * height }, (_, index) => index % 256),
    Uint8Array.from({ length: width * height }, (_, index) => (index % width) % 16 * 17),
  ]
  for (const pixels of patterns) {
    const png = await encodeGrayPng(pixels, width, height)
    const decoded = decodePng(png, width, height)
    assert.deepEqual(decoded, pixels.map(value => Math.round(value / 17) * 17))
  }
}

const tileCounts = { home: 4, 'native-home': 4, 'symbol-home': 4, full: 4, 'native-detail': 1, 'native-info': 2,
  'weather-map': 2, 'weather-forecast': 4, 'weather-details': 4, 'weather-environment': 4, leetcode: 4 }
for (const [layout, count] of Object.entries(tileCounts)) {
  const coverage = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  const rects = surfaceRects(layout)
  assert.equal(rects.length, count)
  if (layout === 'symbol-home') assert.deepEqual(rects[3], { x: 263, y: 42, width: 20, height: 135 })
  for (const rect of rects) {
    assert.ok(rect.width >= 20 && rect.width <= 288 && rect.height >= 20 && rect.height <= 144)
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= HUD_WIDTH && rect.y + rect.height <= HUD_HEIGHT)
    for (let row = rect.y; row < rect.y + rect.height; row++) for (let col = rect.x; col < rect.x + rect.width; col++) coverage[row * HUD_WIDTH + col] += 1
  }
  assert.ok(coverage.every(value => value <= 1), 'tiles must not overlap')
  if (layout === 'full') assert.ok(coverage.every(value => value === 1))
}
assert.equal(surfaceLayoutForPage('chat'), 'native-detail')
assert.equal(surfaceLayoutForPage('todo'), 'native-detail')
assert.equal(surfaceLayoutForPage('info'), 'native-info')
assert.equal(surfaceLayoutForPage('weather'), 'weather-map')
assert.equal(surfaceLayoutForPage('weather', true, true, 1), 'weather-forecast')
assert.equal(surfaceLayoutForPage('weather', true, true, 2), 'weather-details')
assert.equal(surfaceLayoutForPage('weather', true, true, 3), 'weather-environment')
assert.equal(surfaceLayoutForPage('chat', false), 'full')
assert.equal(surfaceLayoutForPage('home', true, true), 'symbol-home')
assert.equal(surfaceRects('native-detail').reduce((sum, rect) => sum + rect.width * rect.height, 0), 400)

const before = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
const after = before.slice()
for (let row = 36; row < 254; row++) after.fill(170, row * HUD_WIDTH + 250, row * HUD_WIDTH + 538)
const changed = surfaceRects('home').flatMap((rect, index) => Buffer.from(surfaceTile(before, rect)).equals(Buffer.from(surfaceTile(after, rect))) ? [] : [index])
assert.deepEqual(changed, [2, 3], 'card motion must leave both left-side images untouched')
const homeArea = surfaceRects('home').slice(2).reduce((sum, rect) => sum + rect.width * rect.height, 0)
console.log(`HUD rendering checks passed: PNG round-trip (16 patterns), tile limits/coverage, card motion uses 2 tiles (${(100 * (1 - homeArea / (HUD_WIDTH * HUD_HEIGHT))).toFixed(1)}% fewer pixels).`)
