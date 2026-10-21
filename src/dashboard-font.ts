import { getTextWidth } from '@evenrealities/pretext'
import font from './assets/dashboard-native.g2font.json'

// Native-size Gray8 coverage, exported from the official simulator framebuffer.
// Keep integer positions and 1:1 pixels: resizing changes the thin native strokes.
export const DASHBOARD_LINE_HEIGHT = font.lineHeight
type Glyph = { left: number; top: number; width: number; height: number; ink: Uint8Array }
const glyphs = new Map<string, Glyph>()
for (const [point, data] of Object.entries(font.glyphs)) {
  const [left, top, width, height, encoded] = data as [number, number, number, number, string]
  const bytes = atob(encoded)
  glyphs.set(String.fromCodePoint(Number(point)), {
    left, top, width, height, ink: Uint8Array.from(bytes, byte => byte.charCodeAt(0)),
  })
}

export function supportsDashboardText(text: string) {
  return [...text].every(character => character === '\n' || glyphs.has(character))
}

export function drawDashboardText(pixels: Uint8Array, width: number, text: string, x: number, y: number) {
  const characters = [...text]
  let left = Math.round(x)
  const height = pixels.length / width
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]
    const glyph = glyphs.get(character)
    if (!glyph) throw new Error(`Native bitmap font does not cover ${character}`)
    for (let row = 0; row < glyph.height; row++) for (let column = 0; column < glyph.width; column++) {
      const px = left + glyph.left + column, py = Math.round(y) + glyph.top + row
      if (px < 0 || px >= width || py < 0 || py >= height) continue
      const target = py * width + px
      const coverage = glyph.ink[row * glyph.width + column]
      pixels[target] = coverage + Math.round(pixels[target] * (255 - coverage) / 255)
    }
    const next = characters[index + 1] ?? ''
    // Pair advance reproduces the official per-glyph integer rounding and kerning.
    left += getTextWidth(character + next) - getTextWidth(next)
  }
}
