import { getTextWidth } from '@evenrealities/pretext'
import { DASHBOARD_LINE_HEIGHT, drawDashboardText } from './dashboard-font'

export const MAP_LABEL_SCALE = 0.58
export const MAP_LABEL_HEIGHT = Math.round(DASHBOARD_LINE_HEIGHT * MAP_LABEL_SCALE)
export const mapLabelWidth = (text: string) => Math.max(1, Math.round(getTextWidth(text) * MAP_LABEL_SCALE))

type LabelPixels = { pixels: Uint8Array; width: number; height: number }
const cache = new Map<string, LabelPixels>()

function labelPixels(text: string): LabelPixels {
  const cached = cache.get(text)
  if (cached) return cached
  const sourceWidth = Math.max(1, Math.ceil(getTextWidth(text)) + 2)
  const source = new Uint8Array(sourceWidth * DASHBOARD_LINE_HEIGHT)
  drawDashboardText(source, sourceWidth, text, 0, 0)
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceWidth; sourceCanvas.height = DASHBOARD_LINE_HEIGHT
  const sourceContext = sourceCanvas.getContext('2d')!
  const rgba = sourceContext.createImageData(sourceWidth, DASHBOARD_LINE_HEIGHT)
  for (let index = 0; index < source.length; index++) {
    rgba.data[index * 4] = rgba.data[index * 4 + 1] = rgba.data[index * 4 + 2] = source[index]
    rgba.data[index * 4 + 3] = 255
  }
  sourceContext.putImageData(rgba, 0, 0)
  const width = mapLabelWidth(text), height = MAP_LABEL_HEIGHT
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = true
  context.drawImage(sourceCanvas, 0, 0, width, height)
  const data = context.getImageData(0, 0, width, height).data
  const pixels = Uint8Array.from({ length: width * height }, (_, index) => data[index * 4])
  const result = { pixels, width, height }
  cache.set(text, result)
  if (cache.size > 96) cache.delete(cache.keys().next().value!)
  return result
}

export function drawMapLabel(target: Uint8Array, targetWidth: number, text: string, x: number, y: number, brightness: number) {
  const label = labelPixels(text)
  const targetHeight = target.length / targetWidth
  for (let row = 0; row < label.height; row++) for (let column = 0; column < label.width; column++) {
    const px = x + column, py = y + row
    if (px < 0 || px >= targetWidth || py < 0 || py >= targetHeight) continue
    const value = Math.round(label.pixels[row * label.width + column] * brightness / 255)
    const index = py * targetWidth + px
    target[index] = Math.max(target[index], value)
  }
}
