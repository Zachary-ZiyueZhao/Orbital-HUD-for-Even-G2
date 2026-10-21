import { getTextWidth } from '@evenrealities/pretext'
import { DASHBOARD_LINE_HEIGHT, drawDashboardText } from './dashboard-font'

import { HUD_WIDTH, HUD_HEIGHT, type Rect } from './hud-surface'
export { HUD_WIDTH, HUD_HEIGHT } from './hud-surface'
export { encodeGrayPng } from './hud-png'
export type NavigationArt = {
  background: Uint8Array
  homeBody: Uint8Array
  detailBody: Uint8Array
  homeTitle: Uint8Array
  detailTitle: Uint8Array
  icon: Uint8Array
  detailIcon: Uint8Array
  from: Rect
  to: Rect
  fromBodyY: number
  toBodyY: number
  fromTitle: { x: number; y: number }
  toTitle: { x: number; y: number }
  fromIcon: { x: number; y: number }
  toIcon: { x: number; y: number }
  targetBorder: number
  centeredText?: string
}

export function blendLayer(target: Uint8Array, source: Uint8Array, sourceWidth: number, x = 0, y = 0, opacity = 1, clip?: Rect) {
  const dx = Math.round(x), dy = Math.round(y)
  const bounds = clip ?? { x: 0, y: 0, width: HUD_WIDTH, height: HUD_HEIGHT }
  const left = Math.max(0, Math.ceil(bounds.x), dx)
  const right = Math.min(HUD_WIDTH, Math.floor(bounds.x + bounds.width), dx + sourceWidth)
  const top = Math.max(0, Math.ceil(bounds.y), dy)
  const bottom = Math.min(HUD_HEIGHT, Math.floor(bounds.y + bounds.height), dy + source.length / sourceWidth)
  if (opacity <= 0) return
  for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
    const ink = source[(row - dy) * sourceWidth + column - dx]
    if (ink) {
      const index = row * HUD_WIDTH + column
      target[index] = Math.min(255, target[index] + Math.round(ink * opacity))
    }
  }
}

let borderCanvas: HTMLCanvasElement | null = null
export function paintFrame(target: Uint8Array, rect: Rect, brightness: number) {
  borderCanvas ??= document.createElement('canvas')
  borderCanvas.width = HUD_WIDTH
  borderCanvas.height = HUD_HEIGHT
  const context = borderCanvas.getContext('2d')
  if (!context) throw new Error('HUD canvas is unavailable')
  const gray = Math.round(brightness)
  context.fillStyle = '#000'
  context.strokeStyle = `rgb(${gray},${gray},${gray})`
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1, 8)
  context.fill()
  context.stroke()
  const rgba = context.getImageData(0, 0, HUD_WIDTH, HUD_HEIGHT).data
  for (let index = 0; index < target.length; index++) {
    const alpha = rgba[index * 4 + 3] / 255
    if (alpha) target[index] = Math.round(rgba[index * 4] * alpha + target[index] * (1 - alpha))
  }
}

export function navigationFrame(art: NavigationArt, progress: number) {
  const p = Math.max(0, Math.min(1, progress))
  const lerp = (from: number, to: number) => Math.round(from + (to - from) * p)
  const rect = {
    x: lerp(art.from.x, art.to.x), y: lerp(art.from.y, art.to.y),
    width: lerp(art.from.width, art.to.width), height: lerp(art.from.height, art.to.height),
  }
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  blendLayer(pixels, art.background, HUD_WIDTH, 0, 0, 1 - p)
  paintFrame(pixels, rect, lerp(170, art.targetBorder))
  const clip = { x: rect.x + 13, y: rect.y + 13, width: rect.width - 26, height: rect.height - 26 }
  if (art.centeredText) {
    drawDashboardText(pixels, HUD_WIDTH, art.centeredText,
      Math.floor(rect.x + (rect.width - getTextWidth(art.centeredText)) / 2),
      Math.floor(rect.y + (rect.height - DASHBOARD_LINE_HEIGHT) / 2))
  } else {
    const bodyY = lerp(art.fromBodyY, art.toBodyY)
    blendLayer(pixels, art.homeBody, HUD_WIDTH, rect.x - art.from.x, bodyY - art.fromBodyY, 1 - p, clip)
    blendLayer(pixels, art.detailBody, HUD_WIDTH, rect.x - art.to.x, bodyY - art.toBodyY, p, clip)
  }
  const titleX = lerp(art.fromTitle.x, art.toTitle.x), titleY = lerp(art.fromTitle.y, art.toTitle.y)
  blendLayer(pixels, art.homeTitle, HUD_WIDTH, titleX, titleY, 1 - p)
  blendLayer(pixels, art.detailTitle, HUD_WIDTH, titleX, titleY, p)
  const iconX = lerp(art.fromIcon.x, art.toIcon.x), iconY = lerp(art.fromIcon.y, art.toIcon.y)
  blendLayer(pixels, art.icon, 20, iconX, iconY, 1 - p)
  blendLayer(pixels, art.detailIcon, 20, iconX, iconY, p)
  return pixels
}

