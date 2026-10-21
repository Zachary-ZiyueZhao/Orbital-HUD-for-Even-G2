export const HUD_WIDTH = 576
export const HUD_HEIGHT = 288
export type Rect = { x: number; y: number; width: number; height: number }
export type SurfaceLayout = 'teleprompt' | 'algorithm-list' | 'algorithm-reader' | 'reminder' | 'schedule' | 'minimized' | 'home' | 'native-home' | 'symbol-home' | 'native-detail' | 'native-info' | 'native-todo' | 'leetcode'
  | 'weather-map' | 'weather-forecast' | 'weather-details' | 'weather-environment' | 'full'
export const HOME_MENU_RECT: Rect = { x: 263, y: 42, width: 262, height: 135 }
export const HOME_ICON_COLUMN_RECT: Rect = { x: 263, y: 42, width: 20, height: 135 }
export const HOME_DIVIDER_TEXT = '─'.repeat(13)
// Native ─ cells span 20px; native - and < have a 7px visible glyph. Anchor
// the visible right edge of the marker column to the divider's right edge.
export const HOME_INDICATOR_RECT: Rect = {
  x: HOME_MENU_RECT.x + HOME_DIVIDER_TEXT.length * 20 - 7,
  y: HOME_MENU_RECT.y, width: 16, height: 5 * 27,
}

// Keep the complete right card in two images. The clock and weather images
// stay untouched during a card swipe. Full-screen pages use all four tiles.
const HOME_TILES: readonly Rect[] = [
  { x: 18, y: 10, width: 226, height: 144 },
  { x: 18, y: 154, width: 226, height: 100 },
  { x: 250, y: 10, width: 288, height: 144 },
  { x: 250, y: 154, width: 288, height: 100 },
]
// The complete menu (icons, labels and divider) commits in one image update.
// Battery stays separate so selecting an option never resends its image.
const NATIVE_HOME_TILES: readonly Rect[] = [
  { x: 18, y: 10, width: 216, height: 144 },
  { x: 18, y: 166, width: 216, height: 78 },
  { x: 506, y: 10, width: 32, height: 20 },
  HOME_MENU_RECT,
]
const SYMBOL_HOME_TILES: readonly Rect[] = [
  ...NATIVE_HOME_TILES.slice(0, 3),
  HOME_ICON_COLUMN_RECT,
]
// Text pages retain native outer borders and text. Fine separators use exact
// pixel artwork because 1px native border containers disappear on hardware.
const NATIVE_DETAIL_TILES: readonly Rect[] = [
  { x: 31, y: 27, width: 20, height: 20 },
]
const NATIVE_INFO_TILES: readonly Rect[] = [
  // Share the left rule segment with the existing title icon. The second
  // image carries only the right segment, within the 288px width limit.
  { x: 31, y: 27, width: 288, height: 93 },
  { x: 319, y: 110, width: 226, height: 20 },
]
export const WEATHER_MAP_ART_RECT: Rect = { x: 348, y: 89, width: 194, height: 144 }
export const WEATHER_FORECAST_ART_RECTS: readonly Rect[] = [
  // Include the title icon in the first tile to stay within four images.
  // Split between forecast rows so no symbol or temperature bar is cut.
  { x: 31, y: 27, width: 200, height: 124 },
  { x: 89, y: 151, width: 142, height: 80 },
  { x: 354, y: 59, width: 142, height: 92 },
  { x: 354, y: 151, width: 142, height: 80 },
]
export const WEATHER_WIND_ICON_RECT: Rect = { x: 324, y: 80, width: 36, height: 36 }
export const WEATHER_MOON_ART_RECT: Rect = { x: 504, y: 112, width: 32, height: 32 }
const WEATHER_MAP_TILES: readonly Rect[] = [...NATIVE_DETAIL_TILES, WEATHER_MAP_ART_RECT]
const WEATHER_FORECAST_TILES: readonly Rect[] = WEATHER_FORECAST_ART_RECTS
const WEATHER_DETAIL_TILES: readonly Rect[] = [
  ...NATIVE_DETAIL_TILES,
  // Both upper vertical segments and the compass share one sparse tile.
  { x: 199, y: 54, width: 175, height: 90 },
  // Lower tiles contain the horizontal rule plus the remaining verticals.
  { x: 31, y: 144, width: 288, height: 105 },
  { x: 319, y: 144, width: 225, height: 105 },
]
const WEATHER_ENVIRONMENT_TILES: readonly Rect[] = [
  ...NATIVE_DETAIL_TILES,
  { x: 287, y: 54, width: 249, height: 90 },
  { x: 31, y: 144, width: 288, height: 105 },
  { x: 319, y: 144, width: 225, height: 20 },
]
const FULL_TILES: readonly Rect[] = [
  { x: 0, y: 0, width: 288, height: 144 },
  { x: 288, y: 0, width: 288, height: 144 },
  { x: 0, y: 144, width: 288, height: 144 },
  { x: 288, y: 144, width: 288, height: 144 },
]
const LEETCODE_TILES: readonly Rect[] = [
  { x: 31, y: 27, width: 257, height: 117 },
  { x: 288, y: 27, width: 257, height: 117 },
  { x: 31, y: 144, width: 257, height: 95 },
  { x: 288, y: 144, width: 257, height: 95 },
]

export function surfaceRects(layout: SurfaceLayout) {
  if (layout === 'reminder') return []
  if (layout === 'teleprompt') return NATIVE_DETAIL_TILES
  if (layout === 'algorithm-list' || layout === 'algorithm-reader') return NATIVE_DETAIL_TILES
  if (layout === 'schedule') return NATIVE_DETAIL_TILES
  if (layout === 'leetcode') return LEETCODE_TILES
  if (layout === 'minimized') return [{ x: 18, y: 10, width: 216, height: 144 }]
  if (layout === 'weather-map') return WEATHER_MAP_TILES
  if (layout === 'weather-forecast') return WEATHER_FORECAST_TILES
  if (layout === 'weather-details') return WEATHER_DETAIL_TILES
  if (layout === 'weather-environment') return WEATHER_ENVIRONMENT_TILES
  if (layout === 'native-home') return NATIVE_HOME_TILES
  if (layout === 'symbol-home') return SYMBOL_HOME_TILES
  if (layout === 'native-detail' || layout === 'native-todo') return NATIVE_DETAIL_TILES
  if (layout === 'native-info') return NATIVE_INFO_TILES
  return layout === 'home' ? HOME_TILES : FULL_TILES
}

export function surfaceLayoutForPage(page: 'home' | 'info' | 'todo' | 'chat' | 'weather' | 'leetcode' | 'schedule' | 'algorithms' | 'teleprompt', nativeHome = true, nativeSymbols = false, weatherView = 0): SurfaceLayout {
  if (page === 'teleprompt') return 'teleprompt'
  if (page === 'algorithms') return 'algorithm-list'
  if (page === 'schedule') return 'schedule'
  if (page === 'leetcode') return 'leetcode'
  if (page === 'todo') return 'native-todo'
  if (page === 'weather') return weatherView === 0 ? 'weather-map'
    : weatherView === 1 ? 'weather-forecast' : weatherView === 2 ? 'weather-details' : 'weather-environment'
  if (page === 'home') return nativeHome ? nativeSymbols ? 'symbol-home' : 'native-home' : 'home'
  if (!nativeHome) return 'full'
  return page === 'info' ? 'native-info' : 'native-detail'
}

export function surfaceTile(pixels: Uint8Array, rect: Rect) {
  const tile = new Uint8Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++) {
    const start = (rect.y + row) * HUD_WIDTH + rect.x
    tile.set(pixels.subarray(start, start + rect.width), row * rect.width)
  }
  return tile
}
