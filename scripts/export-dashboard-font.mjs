// Start Vite and the official simulator on /scripts/capture-dashboard-font.html,
// with --automation-port 9900, then run this script. No image resampling is used.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allPoints = JSON.parse(await fs.readFile(path.join(root, 'scripts/font-codepoints.json'), 'utf8'))
const fontPath = path.join(root, 'src/assets/dashboard-native.g2font.json')
const extend = process.argv.includes('--extend')
const existingFont = extend ? JSON.parse(await fs.readFile(fontPath, 'utf8')) : null
const points = extend ? allPoints.filter(point => !(point in existingFont.glyphs)) : allPoints
const captureDir = path.join(root, '.hud-preview/native-font-source', extend ? 'extension' : '.')
await fs.mkdir(captureDir, { recursive: true })
const api = 'http://127.0.0.1:9900'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function request(endpoint, options) {
  const response = await fetch(api + endpoint, { ...options, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`)
  return response
}

function decodeRgba(png) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG')
  const chunks = []
  let width, height
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + size)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('Expected noninterlaced RGBA8 PNG')
    }
    if (type === 'IDAT') chunks.push(data)
    offset += size + 12
  }
  if (width !== 576 || height !== 288) throw new Error('Expected native 576x288 framebuffer')
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  const rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0
      const up = y ? rgba[(y - 1) * stride + x] : 0
      const corner = y && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0
      const p = left + up - corner
      const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner)
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? (a <= b && a <= c ? left : b <= c ? up : corner) : NaN
      if (!Number.isFinite(predictor)) throw new Error(`Unsupported PNG filter ${filter}`)
      rgba[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  return { width, rgba }
}

const glyphs = existingFont?.glyphs ?? {}
for (let batch = 0; batch < Math.ceil(points.length / 8); batch++) {
  const filename = path.join(captureDir, `glyphs-${String(batch).padStart(3, '0')}.png`)
  if (!process.argv.includes('--from-cache')) {
    const deadline = Date.now() + 10000
    for (;;) {
      const log = await (await request('/api/console')).json()
      if (log.entries.some(entry => entry.message === `FONT_BATCH:${batch}`)) break
      if (Date.now() > deadline) throw new Error(`Capture page has not painted batch ${batch}`)
      await pause(80)
    }
    // Bridge completion precedes the UI paint; capture after two display frames.
    await pause(120)
    await fs.writeFile(filename, Buffer.from(await (await request('/api/screenshot/glasses')).arrayBuffer()))
  }
  const { width, rgba } = decodeRgba(await fs.readFile(filename))
  for (let index = 0; index < 8 && batch * 8 + index < points.length; index++) {
    const cp = points[batch * 8 + index]
    const originX = 16 + index * 64, originY = 16
    let left = 48, right = -1, top = 27, bottom = -1
    for (let y = 0; y < 27; y++) for (let x = 0; x < 48; x++) {
      if (rgba[((originY + y) * width + originX + x) * 4 + 3]) {
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
    const w = Math.max(0, right - left + 1), h = Math.max(0, bottom - top + 1)
    const ink = Buffer.alloc(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // The official export stores glyph coverage in alpha, not RGB luminance.
      ink[y * w + x] = rgba[((originY + top + y) * width + originX + left + x) * 4 + 3]
    }
    glyphs[cp] = [w ? left : 0, h ? top : 0, w, h, ink.toString('base64')]
  }
  if (!process.argv.includes('--from-cache') && (batch + 1) * 8 < points.length) {
    await request('/api/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'down' }) })
  }
  if (batch % 10 === 0) console.log(`Exported ${Math.min((batch + 1) * 8, points.length)} / ${points.length} glyphs`)
}
const font = { format: 'g2-gray8-bitmap-font-v1', source: '@evenrealities/evenhub-simulator@0.9.5', lineHeight: 27, scale: 1, glyphs }
await fs.mkdir(path.join(root, 'src/assets'), { recursive: true })
await fs.writeFile(fontPath, JSON.stringify(font))
console.log(`Saved ${Object.keys(glyphs).length} unscaled glyphs to src/assets/dashboard-native.g2font.json`)
