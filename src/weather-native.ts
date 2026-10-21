import { TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { pxTruncate } from '@evenrealities/pretext'
import { WEATHER_TITLES } from './weather-scenes'
import type { Weather, WeatherExtras } from './weather-data'

type Unit = 'celsius' | 'fahrenheit'

export function buildNativeWeatherContainers(weather: Weather | null, extras: WeatherExtras | null,
  view: number, unit: Unit, currentSummary: string) {
  const text = (id: number, name: string, x: number, y: number, width: number, height: number, content: string, color = 3) =>
    new TextContainerProperty({ xPosition: x, yPosition: y, width, height, containerID: id,
      containerName: name, content: content || ' ', textColor: color, isEventCapture: 0,
      zOrderIndex: id + 10, borderWidth: 0, paddingLength: 0 })
  const objects = [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262,
      containerID: 1, containerName: 'weather-frame', isEventCapture: 1, textColor: 0,
      // The gesture receiver contains no visible text for firmware to scroll.
      content: ' ', zOrderIndex: 10, borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 0 }),
    text(2, 'weather-title', 59, 23, 486, 27,
      WEATHER_TITLES[view] + (!weather && view > 0 ? ' / loading' : ''), 4),
  ]
  const shown = (value: number | null, suffix = '', digits = 0) => value === null ? `--${suffix}` : `${Number(value.toFixed(digits))}${suffix}`
  const temp = (value: number | null) => shown(value === null ? null : unit === 'fahrenheit' ? value * 9 / 5 + 32 : value, '°')
  const clock = (value: string | null) => value?.match(/T(\d{2}:\d{2})/)?.[1] ?? '--:--'
  const cardLines = (lines: string[], width: number) => lines.map(value => pxTruncate(value, width))

  if (view === 0) {
    objects.push(text(3, 'weather-current', 31, 50, 300, 189, currentSummary.split('\n').map(value => pxTruncate(value, 300)).join('\n'), 4))
    // Firmware container names are limited to 16 characters. Keep these
    // identifiers short even though the simulator accepts longer names.
    objects.push(text(4, 'wx-map-title', 351, 58, 190, 27, 'Wind map / N up'))
    objects.push(text(5, 'wx-map-status', 357, 147, 176, 27,
      extras?.basemap ? ' ' : extras?.loading ? 'Map loading...' : 'Map unavailable'))
  } else if (view === 1) {
    for (let column = 0; column < 2; column++) {
      const days = weather?.forecast.slice(column * 5, column * 5 + 5) ?? []
      const weekdays = days.map((day, row) => column * 5 + row === 0 ? 'Today'
        : new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }))
      const x = 31 + column * 265
      objects.push(text(3 + column * 3, `wx-days-${column}`, x, 71, 56, 135,
        weekdays.join('\n'), 4))
      objects.push(text(4 + column * 3, `wx-low-${column}`, x + 82, 71, 42, 135,
        days.map(day => pxTruncate(temp(day.low), 42)).join('\n'), 2))
      objects.push(text(5 + column * 3, `wx-high-${column}`, x + 203, 71, 42, 135,
        days.map(day => pxTruncate(temp(day.high), 42)).join('\n'), 4))
    }
  } else if (view === 2) {
    const uv = weather?.uvMax ?? null
    const cards = [
      ['Feels like', temp(weather?.feelsLike ?? null), `Actual ${temp(weather?.temperature ?? null)}`],
      [`Wind ${shown(weather?.windDirection ?? null, '°')}`, shown(weather?.windSpeed ?? null, ' km/h'), `Gust ${shown(weather?.gusts ?? null, ' km/h')}`],
      ['UV today', shown(uv, ' max', 1), uv === null ? 'Unavailable' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : 'Very high'],
      ['Sunset', clock(weather?.sunset ?? null), `Rise ${clock(weather?.sunrise ?? null)}`],
      ['Rain / past 24h', shown(weather?.precipPast24 ?? null, ' mm', 1), `Next ${shown(weather?.precipNext24 ?? null, ' mm', 1)}`],
      ['Visibility', shown(weather?.visibility == null ? null : weather.visibility / 1000, ' km', 1), 'Model estimate'],
    ]
    for (let column = 0; column < 3; column++) {
      // One blank native line separates the upper and lower cards. Both
      // retain fixed column origins and fit the original two-row grid.
      const content = [...cardLines(cards[column], 148), '', ...cardLines(cards[column + 3], 148)].join('\n')
      objects.push(text(column + 3, `wx-detail-${column}`, 39 + column * 174, 56, 150, 189, content))
    }
  } else {
    const air = extras?.air, aqi = air?.aqi ?? null
    const quality = aqi === null ? extras?.loading ? 'Loading...' : 'Unavailable'
      : aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Sensitive groups'
        : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous'
    const phase = weather?.moon.phase ?? 0
    const phaseName = phase < 0.03 || phase > 0.97 ? 'New moon' : phase < 0.23 ? 'Waxing crescent'
      : phase < 0.27 ? 'First quarter' : phase < 0.47 ? 'Waxing gibbous' : phase < 0.53 ? 'Full moon'
        : phase < 0.73 ? 'Waning gibbous' : phase < 0.77 ? 'Last quarter' : 'Waning crescent'
    const pressure = weather?.pressure ?? null
    const marker = pressure === null ? 2 : Math.round(Math.max(0, Math.min(1, (pressure - 950) / 100)) * 4)
    const cards = [
      ['Air quality / US AQI', `${shown(aqi)}  ${quality}`, `PM2.5 ${shown(air?.pm25 ?? null, ' ug/m3', 1)}`],
      [phaseName, `${Math.round(weather?.moon.illumination ?? 0)}% lit / set ${weather?.moon.moonset ?? '--:--'}`, `Full moon ~${weather?.moon.fullInDays ?? '--'}d`],
      ['Humidity', shown(weather?.humidity ?? null, '%'), `Dew point ${temp(weather?.dewPoint ?? null)}`],
      ['Sea-level pressure', shown(pressure, ' hPa'), `950 ${'─'.repeat(marker)}│${'─'.repeat(4 - marker)} 1050`],
    ]
    cards.forEach((card, index) => objects.push(text(index + 3, `wx-env-${index}`,
      39 + index % 2 * 265, 56 + Math.floor(index / 2) * 101, 232, 85, cardLines(card, 232).join('\n'))))
  }
  return objects
}
