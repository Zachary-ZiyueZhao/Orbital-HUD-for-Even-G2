import { HUD_WIDTH, type Rect } from './hud-surface'

// A normal image container can carry a single lit row/column even when the
// firmware omits borders on native widgets whose minor axis is only 1px.
export const INFO_RULES: readonly Rect[] = [{ x: 31, y: 119, width: 514, height: 1 }]
const WEATHER_DETAIL_RULES: readonly Rect[] = [
  { x: 199, y: 54, width: 1, height: 195 },
  { x: 373, y: 54, width: 1, height: 195 },
  { x: 31, y: 151, width: 511, height: 1 },
]
const WEATHER_ENVIRONMENT_RULES: readonly Rect[] = [
  { x: 287, y: 54, width: 1, height: 195 },
  { x: 31, y: 151, width: 513, height: 1 },
]

export function weatherRules(view: number): readonly Rect[] {
  return view === 2 ? WEATHER_DETAIL_RULES : view === 3 ? WEATHER_ENVIRONMENT_RULES : []
}

export function drawHudRules(pixels: Uint8Array, rules: readonly Rect[], brightness = 136) {
  // Integer pixel writes avoid Canvas stroke centering and antialiasing, so
  // each separator occupies exactly one row or column at its original origin.
  for (const rule of rules) {
    for (let y = rule.y; y < rule.y + rule.height; y++) {
      pixels.fill(brightness, y * HUD_WIDTH + rule.x, y * HUD_WIDTH + rule.x + rule.width)
    }
  }
}
