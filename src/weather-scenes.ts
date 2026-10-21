import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { drawDashboardText, supportsDashboardText } from './dashboard-font'
import { drawMapLabel, mapLabelWidth, MAP_LABEL_HEIGHT } from './map-text'
import { WIND_MAP_RECT } from './map-viewport'
import { HUD_WIDTH, HUD_HEIGHT } from './hud-motion'
import { WEATHER_MAP_ART_RECT, WEATHER_MOON_ART_RECT, WEATHER_WIND_ICON_RECT } from './hud-surface'
import { drawHudRules, weatherRules } from './hud-rules'
import { weatherKey, type Weather, type WeatherExtras, type WindField } from './weather-data'
import type { WindBasemap } from './wind-basemap'

export const WEATHER_TITLES = ['Weather', '10-day forecast', 'Weather details', 'Environment']
type Unit = 'celsius' | 'fahrenheit'
const gray = (value: number) => `rgb(${value},${value},${value})`
const shown = (value: number | null, suffix = '', digits = 0) => value === null ? `--${suffix}` : `${Number(value.toFixed(digits))}${suffix}`
const clock = (value: string | null) => value?.match(/T(\d{2}:\d{2})/)?.[1] ?? '--:--'
const temp = (value: number | null, unit: Unit) => shown(value === null ? null : unit === 'fahrenheit' ? value * 9 / 5 + 32 : value, '°')

function canvasPixels(canvas: HTMLCanvasElement) {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  return Uint8Array.from({ length: canvas.width * canvas.height }, (_, index) => Math.round(data[index * 4] * data[index * 4 + 3] / 255))
}

export function drawWeatherSymbol(context: CanvasRenderingContext2D, code: number, x: number, y: number, size = 16, brightness = 180) {
  context.save()
  context.translate(x, y)
  context.scale(size / 16, size / 16)
  context.strokeStyle = gray(brightness)
  context.lineWidth = 1
  context.lineCap = 'square'
  if (code <= 2) {
    context.beginPath()
    context.arc(code === 0 ? 8 : 11, code === 0 ? 8 : 5, 3, 0, 2 * Math.PI)
    context.stroke()
    const cx = code === 0 ? 8 : 11, cy = code === 0 ? 8 : 5
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      context.beginPath()
      context.moveTo(cx + 5 * Math.cos(angle), cy + 5 * Math.sin(angle))
      context.lineTo(cx + 6.5 * Math.cos(angle), cy + 6.5 * Math.sin(angle))
      context.stroke()
    }
  }
  if (code !== 0) {
    context.beginPath()
    context.moveTo(3, 11.5)
    context.bezierCurveTo(-1, 11.5, -1, 6, 3, 6)
    context.bezierCurveTo(3, 1, 10, 1, 11, 6)
    context.bezierCurveTo(16, 5, 17, 11.5, 12, 11.5)
    context.closePath()
    context.stroke()
  }
  if (code >= 51) for (let index = 0; index < 3; index++) {
    context.beginPath()
    context.moveTo(4 + index * 4, 13)
    context.lineTo(3 + index * 4, [71, 73, 75, 77, 85, 86].includes(code) ? 14 : 15)
    context.stroke()
  }
  context.restore()
}

function windVector(field: WindField, x: number, y: number) {
  const gx = Math.max(0, Math.min(1.9999, x)) , gy = Math.max(0, Math.min(1.9999, y))
  const column = Math.floor(gx), row = Math.floor(gy), fx = gx - column, fy = gy - row
  const nodes = [field.nodes[row * 3 + column], field.nodes[row * 3 + column + 1], field.nodes[(row + 1) * 3 + column], field.nodes[(row + 1) * 3 + column + 1]]
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
  return { u: nodes.reduce((sum, node, index) => sum + node.u * weights[index], 0),
    v: nodes.reduce((sum, node, index) => sum + node.v * weights[index], 0) }
}

type WindTrail = { points: Array<{ x: number; y: number }>; brightness: number }
const windTrailCache = new WeakMap<WindField, WindTrail[]>()
const mapCanvasCache = new WeakMap<WindBasemap, HTMLCanvasElement>()

function windTrails(field: WindField): WindTrail[] {
  const cached = windTrailCache.get(field)
  if (cached) return cached
  const rect = WIND_MAP_RECT
  const trails: WindTrail[] = []
  // Integrate once per forecast; display frames only shift a short segment.
  for (let seed = 0; seed < 56; seed++) {
    let x = (seed % 8 + 0.25) / 8 * 2, y = (Math.floor(seed / 8) + 0.4) / 7 * 2
    const trail: Array<{ x: number; y: number }> = [{ x: x / 2 * rect.width, y: y / 2 * rect.height }]
    const initial = windVector(field, x, y)
    for (let step = 0; step < 19; step++) {
      const vector = windVector(field, x, y)
      const speed = Math.hypot(vector.u, vector.v)
      if (speed < 0.3) break
      x += vector.u / speed * 0.035
      y += vector.v / speed * 0.035 * rect.width / rect.height
      if (x < 0 || x > 2 || y < 0 || y > 2) break
      trail.push({ x: x / 2 * rect.width, y: y / 2 * rect.height })
    }
    if (trail.length >= 3) trails.push({ points: trail, brightness: 90 + Math.min(65, Math.hypot(initial.u, initial.v) * 1.5) })
  }
  windTrailCache.set(field, trails)
  return trails
}

function trailPoint(points: WindTrail['points'], position: number) {
  const before = Math.max(0, Math.min(points.length - 1, Math.floor(position)))
  const after = Math.min(points.length - 1, before + 1)
  const fraction = Math.max(0, Math.min(1, position - before))
  return { x: points[before].x + (points[after].x - points[before].x) * fraction,
    y: points[before].y + (points[after].y - points[before].y) * fraction }
}

function drawWind(context: CanvasRenderingContext2D, field: WindField, phaseSeconds: number) {
  const rect = WIND_MAP_RECT
  context.save()
  context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.clip()
  context.lineWidth = 0.8
  windTrails(field).forEach((trail, seed) => {
    const max = trail.points.length - 1
    const head = (phaseSeconds * 0.75 + seed * 3.73) % (max + 7)
    const tail = Math.max(0, head - 7)
    if (tail >= max) return
    const end = Math.min(head, max)
    if (end - tail < 0.5) return
    const fade = Math.min(1, head / 2, (max + 7 - head) / 2)
    context.strokeStyle = gray(trail.brightness * fade)
    context.beginPath()
    const first = trailPoint(trail.points, tail)
    context.moveTo(rect.x + first.x, rect.y + first.y)
    for (let position = Math.ceil(tail); position < end; position++) {
      const point = trail.points[position]
      context.lineTo(rect.x + point.x, rect.y + point.y)
    }
    const tip = trailPoint(trail.points, end)
    context.lineTo(rect.x + tip.x, rect.y + tip.y)
    context.stroke()
  })
  context.restore()
}

function mapCanvas(basemap: WindBasemap) {
  const cached = mapCanvasCache.get(basemap)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = basemap.width; canvas.height = basemap.height
  const context = canvas.getContext('2d')!
  const rgba = context.createImageData(basemap.width, basemap.height)
  for (let index = 0; index < basemap.pixels.length; index++) {
    rgba.data[index * 4] = rgba.data[index * 4 + 1] = rgba.data[index * 4 + 2] = basemap.pixels[index]
    rgba.data[index * 4 + 3] = 255
  }
  context.putImageData(rgba, 0, 0)
  mapCanvasCache.set(basemap, canvas)
  return canvas
}

export function renderWeatherOverlay(weather: Weather | null, extras: WeatherExtras | null, view: number, unit: Unit, phaseSeconds = 0) {
  if (!weather || extras?.key !== weatherKey(weather)) extras = null
  const canvas = document.createElement('canvas')
  canvas.width = HUD_WIDTH; canvas.height = HUD_HEIGHT
  const context = canvas.getContext('2d')!
  const labels: Array<{ text: string; x: number; y: number; width: number; brightness: number }> = []
  const mapLabels: Array<{ text: string; x: number; y: number; brightness: number }> = []
  const label = (text: string, x: number, y: number, width = 150, brightness = 220) => labels.push({ text: pxTruncate(text, width), x, y, width, brightness })
  if (!weather) {
    if (view !== 0) label('Weather is loading.', 31, 75, 480)
  } else if (view === 0) {
    const rect = WIND_MAP_RECT
    label('Wind map / N up', 351, 58, 190, 170)
    context.save()
    context.beginPath(); context.roundRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1, 6); context.clip()
    context.fillStyle = '#080808'; context.fillRect(rect.x, rect.y, rect.width, rect.height)
    const basemap = extras?.basemap
    if (basemap) context.drawImage(mapCanvas(basemap), rect.x, rect.y)
    if (extras?.wind) drawWind(context, extras.wind, phaseSeconds)
    if (basemap) {
      for (const item of basemap.labels) {
        const x = rect.x + item.x, y = rect.y + item.y
        context.fillStyle = '#000'; context.fillRect(x - 1, y, mapLabelWidth(item.text) + 2, MAP_LABEL_HEIGHT)
        mapLabels.push({ text: item.text, x, y, brightness: item.water ? 195 : 230 })
      }
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2
      context.fillStyle = '#050505'; context.strokeStyle = gray(220); context.lineWidth = 1
      context.beginPath(); context.arc(cx, cy, 17, 0, Math.PI * 2); context.fill(); context.stroke()
      const speed = shown(weather.windSpeed)
      label(speed, Math.round(cx - getTextWidth(speed) / 2), Math.round(cy - 14), 36, 235)
      const city = weather.city.split(',')[0]
      const location = pxTruncate(supportsDashboardText(city) ? city : 'Here', 130)
      const cityX = Math.round(cx - mapLabelWidth(location) / 2), cityY = Math.round(cy + 20)
      context.fillStyle = '#000'; context.fillRect(cityX - 1, cityY, mapLabelWidth(location) + 2, MAP_LABEL_HEIGHT)
      mapLabels.push({ text: location, x: cityX, y: cityY, brightness: 230 })
    } else {
      // Keep failure/loading explicit; never invent shorelines or city positions.
      label(extras?.loading ? 'Map loading...' : 'Map unavailable', rect.x + 9, rect.y + 58, rect.width - 18, 180)
    }
    context.restore()
    context.strokeStyle = gray(75); context.lineWidth = 1
    context.beginPath(); context.roundRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1, 6); context.stroke()
    if (basemap) {
      // Geographic scale bar, sized from the viewport's actual latitude.
      const scaleKm = basemap.spanKm > 300 ? 100 : basemap.spanKm > 100 ? 50 : 10
      const length = Math.round(scaleKm / basemap.spanKm * rect.width)
      context.strokeStyle = gray(170); context.beginPath()
      context.moveTo(rect.x + 8, rect.y + rect.height - 10); context.lineTo(rect.x + 8 + length, rect.y + rect.height - 10); context.stroke()
      label(`${scaleKm} km`, rect.x + 7, rect.y + rect.height - 39, 73, 145)
    }
    if (!extras?.wind && !extras?.loading) label('Wind unavailable', rect.x + 8, rect.y + 4, rect.width - 16, 180)
  } else if (view === 1) {
    const min = Math.min(...weather.forecast.map(day => day.low)), max = Math.max(...weather.forecast.map(day => day.high))
    weather.forecast.forEach((day, index) => {
      const x = index < 5 ? 31 : 296, y = 53 + (index % 5) * 36
      const weekday = index === 0 ? 'Today' : new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      label(weekday, x, y, 51)
      drawWeatherSymbol(context, day.code, x + 58, y + 6, 16)
      label(temp(day.low, unit), x + 82, y, 42, 140)
      label(temp(day.high, unit), x + 203, y, 42)
      const left = x + 132, top = y + 15
      context.strokeStyle = gray(40); context.beginPath(); context.moveTo(left, top); context.lineTo(left + 62, top); context.stroke()
      context.strokeStyle = gray(180); context.lineWidth = 3
      context.beginPath(); context.moveTo(left + (day.low - min) / Math.max(1, max - min) * 62, top)
      context.lineTo(left + (day.high - min) / Math.max(1, max - min) * 62, top); context.stroke(); context.lineWidth = 1
    })
  } else if (view === 2) {
    context.strokeStyle = gray(64); context.lineWidth = 1
    context.beginPath()
    for (const x of [199, 373]) { context.moveTo(x + 0.5, 54); context.lineTo(x + 0.5, 249) }
    context.moveTo(31, 151.5); context.lineTo(542, 151.5)
    context.stroke()
    const card = (index: number, title: string, value: string, detail: string) => {
      const x = 31 + index % 3 * 174, y = 54 + Math.floor(index / 3) * 101
      label(title, x + 8, y + 2, 148, 145)
      label(value, x + 8, y + 29, 148)
      label(detail, x + 8, y + 58, 148, 170)
      return { x, y }
    }
    card(0, 'Feels like', temp(weather.feelsLike, unit), `Actual ${temp(weather.temperature, unit)}`)
    const wind = card(1, `Wind ${shown(weather.windDirection, '°')}`, shown(weather.windSpeed, ' km/h'), `Gust ${shown(weather.gusts, ' km/h')}`)
    if (weather.windDirection !== null) {
      const cx = wind.x + 137, cy = wind.y + 44, angle = weather.windDirection * Math.PI / 180
      context.strokeStyle = gray(150); context.beginPath(); context.arc(cx, cy, 14, 0, Math.PI * 2); context.stroke()
      context.beginPath(); context.moveTo(cx, cy - 17); context.lineTo(cx, cy - 14); context.stroke()
      context.strokeStyle = gray(220); context.beginPath(); context.moveTo(cx - Math.sin(angle) * 11, cy + Math.cos(angle) * 11)
      context.lineTo(cx + Math.sin(angle) * 11, cy - Math.cos(angle) * 11); context.stroke()
      context.fillStyle = gray(220); context.fillRect(Math.round(cx + Math.sin(angle) * 11) - 1, Math.round(cy - Math.cos(angle) * 11) - 1, 3, 3)
    }
    const uv = weather.uvMax
    card(2, 'UV today', shown(uv, ' max', 1), uv === null ? 'Unavailable' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : 'Very high')
    card(3, 'Sunset', clock(weather.sunset), `Rise ${clock(weather.sunrise)}`)
    card(4, 'Rain / past 24h', shown(weather.precipPast24, ' mm', 1), `Next ${shown(weather.precipNext24, ' mm', 1)}`)
    card(5, 'Visibility', shown(weather.visibility === null ? null : weather.visibility / 1000, ' km', 1), 'Model estimate')
  } else {
    context.strokeStyle = gray(64); context.lineWidth = 1
    context.beginPath()
    context.moveTo(287.5, 54); context.lineTo(287.5, 249)
    context.moveTo(31, 151.5); context.lineTo(544, 151.5)
    context.stroke()
    const card = (index: number, title: string, value: string, detail: string) => {
      const x = 31 + index % 2 * 265, y = 54 + Math.floor(index / 2) * 101
      label(title, x + 8, y + 2, 232, 145); label(value, x + 8, y + 29, 232)
      label(detail, x + 8, y + 58, 232, 170)
      return { x, y }
    }
    const air = extras?.air, aqi = air?.aqi ?? null
    const quality = aqi === null ? extras?.loading ? 'Loading...' : 'Unavailable'
      : aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Sensitive groups' : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous'
    card(0, 'Air quality / US AQI', `${shown(aqi)}  ${quality}`, `PM2.5 ${shown(air?.pm25 ?? null, ' ug/m3', 1)}`)
    const phase = weather.moon.phase
    const phaseName = phase < 0.03 || phase > 0.97 ? 'New moon' : phase < 0.23 ? 'Waxing crescent' : phase < 0.27 ? 'First quarter'
      : phase < 0.47 ? 'Waxing gibbous' : phase < 0.53 ? 'Full moon' : phase < 0.73 ? 'Waning gibbous' : phase < 0.77 ? 'Last quarter' : 'Waning crescent'
    const moon = card(1, phaseName, `${Math.round(weather.moon.illumination)}% lit  /  set ${weather.moon.moonset ?? '--:--'}`, `Full moon ~${weather.moon.fullInDays ?? '--'}d`)
    // Rasterize the illuminated part of a unit sphere; phase controls lit side.
    const radius = 15, cx = moon.x + 224, cy = moon.y + 74
    const angle = phase * Math.PI * 2
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = dx / radius, ny = dy / radius, z2 = 1 - nx * nx - ny * ny
      if (z2 < 0) continue
      const lit = nx * Math.sin(angle) - Math.sqrt(z2) * Math.cos(angle)
      context.fillStyle = gray(lit > 0 ? 180 : 25); context.fillRect(cx + dx, cy + dy, 1, 1)
    }
    card(2, 'Humidity', shown(weather.humidity, '%'), `Dew point ${temp(weather.dewPoint, unit)}`)
    const pressure = card(3, 'Sea-level pressure', shown(weather.pressure, ' hPa'), '')
    const scaleY = pressure.y + 70
    label('950', pressure.x + 65, scaleY, 55, 170)
    label('1050', Math.round(pressure.x + 172 - getTextWidth('1050')), scaleY, 70, 170)
    context.strokeStyle = gray(85); context.beginPath(); context.moveTo(pressure.x + 65, scaleY); context.lineTo(pressure.x + 172, scaleY); context.stroke()
    if (weather.pressure !== null) {
      const x = pressure.x + 65 + Math.max(0, Math.min(1, (weather.pressure - 950) / 100)) * 107
      context.fillStyle = gray(220); context.fillRect(Math.round(x), pressure.y + 65, 2, 10)
    }
  }
  const pixels = canvasPixels(canvas)
  // All detailed labels use the same native font and integer placement as motion.
  for (const item of labels) {
    const layer = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
    drawDashboardText(layer, HUD_WIDTH, item.text, item.x, item.y)
    for (let index = 0; index < pixels.length; index++) pixels[index] = Math.max(pixels[index], Math.round(layer[index] * item.brightness / 255))
  }
  for (const item of mapLabels) drawMapLabel(pixels, HUD_WIDTH, item.text, item.x, item.y, item.brightness)
  return pixels
}

function placeArtwork(target: Uint8Array, source: Uint8Array, rect: { x: number; y: number; width: number; height: number }) {
  for (let row = 0; row < rect.height; row++) {
    target.set(source.subarray(row * rect.width, (row + 1) * rect.width), (rect.y + row) * HUD_WIDTH + rect.x)
  }
}

function cropArtwork(source: Uint8Array, rect: { x: number; y: number; width: number; height: number }) {
  const output = new Uint8Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++) {
    const start = (rect.y + row) * HUD_WIDTH + rect.x
    output.set(source.subarray(start, start + rect.width), row * rect.width)
  }
  return output
}

/** Keep maps, symbols, range charts, compass, moon, and exact 1px rules. */
export function renderWeatherArtwork(weather: Weather | null, extras: WeatherExtras | null,
  view: number, unit: Unit, phaseSeconds = 0) {
  const artwork = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  if (view === 0) {
    const rendered = renderWeatherOverlay(weather, extras, view, unit, phaseSeconds)
    placeArtwork(artwork, cropArtwork(rendered, { ...WIND_MAP_RECT, height: WEATHER_MAP_ART_RECT.height }), WEATHER_MAP_ART_RECT)
  } else if (view === 1 && weather) {
    const canvas = document.createElement('canvas')
    canvas.width = HUD_WIDTH; canvas.height = HUD_HEIGHT
    const context = canvas.getContext('2d')!
    const min = Math.min(...weather.forecast.map(day => day.low)), max = Math.max(...weather.forecast.map(day => day.high))
    weather.forecast.slice(0, 10).forEach((day, index) => {
      const x = index < 5 ? 31 : 296, y = 71 + index % 5 * 27
      drawWeatherSymbol(context, day.code, x + 58, y + 6, 16)
      const left = x + 132, top = y + 15
      context.strokeStyle = gray(40); context.lineWidth = 1
      context.beginPath(); context.moveTo(left, top); context.lineTo(left + 62, top); context.stroke()
      context.strokeStyle = gray(180); context.lineWidth = 3
      context.beginPath(); context.moveTo(left + (day.low - min) / Math.max(1, max - min) * 62, top)
      context.lineTo(left + (day.high - min) / Math.max(1, max - min) * 62, top); context.stroke()
    })
    artwork.set(canvasPixels(canvas))
  } else if (view === 2 && weather?.windDirection !== null && weather?.windDirection !== undefined) {
    const rect = WEATHER_WIND_ICON_RECT
    const canvas = document.createElement('canvas')
    canvas.width = rect.width; canvas.height = rect.height
    const context = canvas.getContext('2d')!, cx = 18, cy = 18, angle = weather.windDirection * Math.PI / 180
    context.strokeStyle = gray(150); context.lineWidth = 1
    context.beginPath(); context.arc(cx, cy, 14, 0, Math.PI * 2); context.stroke()
    context.beginPath(); context.moveTo(cx, cy - 17); context.lineTo(cx, cy - 14); context.stroke()
    context.strokeStyle = gray(220); context.beginPath()
    context.moveTo(cx - Math.sin(angle) * 11, cy + Math.cos(angle) * 11)
    context.lineTo(cx + Math.sin(angle) * 11, cy - Math.cos(angle) * 11); context.stroke()
    context.fillStyle = gray(220)
    context.fillRect(Math.round(cx + Math.sin(angle) * 11) - 1, Math.round(cy - Math.cos(angle) * 11) - 1, 3, 3)
    placeArtwork(artwork, canvasPixels(canvas), rect)
  } else if (view === 3 && weather) {
    const rect = WEATHER_MOON_ART_RECT
    const canvas = document.createElement('canvas')
    canvas.width = rect.width; canvas.height = rect.height
    const context = canvas.getContext('2d')!
    const radius = 15, cx = 16, cy = 16, angle = weather.moon.phase * Math.PI * 2
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = dx / radius, ny = dy / radius, z2 = 1 - nx * nx - ny * ny
      if (z2 < 0) continue
      const lit = nx * Math.sin(angle) - Math.sqrt(z2) * Math.cos(angle)
      context.fillStyle = gray(lit > 0 ? 180 : 25)
      context.fillRect(cx + dx, cy + dy, 1, 1)
    }
    placeArtwork(artwork, canvasPixels(canvas), rect)
  }
  drawHudRules(artwork, weatherRules(view))
  return artwork
}
