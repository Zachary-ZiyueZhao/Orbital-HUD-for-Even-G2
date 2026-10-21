import SunCalc from 'suncalc'
import { mapViewport, mapCoordinate } from './map-viewport'
import type { WindBasemap } from './wind-basemap'

export type ForecastDay = { date: string; high: number; low: number; code: number; rainChance: number | null }
export type MoonData = { phase: number; illumination: number; moonset: string | null; fullInDays: number | null }
export type Weather = {
  temperature: number; feelsLike: number; high: number | null; low: number | null; code: number; city: string
  latitude: number; longitude: number; fetchedAt: number
  rainInHours: number | null; rainAmount: number; rainChance: number | null
  windSpeed: number | null; windDirection: number | null; gusts: number | null
  humidity: number | null; cloudCover: number | null; visibility: number | null
  dewPoint: number | null; pressure: number | null; uvMax: number | null
  precipPast24: number | null; precipNext24: number | null
  sunrise: string | null; sunset: string | null; forecast: ForecastDay[]; moon: MoonData
}
export type WindField = { nodes: Array<{ speed: number; direction: number; u: number; v: number }>; spanKm: number }
export type AirQuality = { aqi: number | null; pm25: number | null; pm10: number | null }
export type WeatherExtras = {
  key: string; loading: boolean; wind: WindField | null; air: AirQuality | null; basemap: WindBasemap | null; fetchedAt: number
}
type Location = { latitude: number; longitude: number; city: string }
type ForecastResponse = {
  utc_offset_seconds: number
  current: { time: string; temperature_2m: number | null; apparent_temperature: number | null; weather_code: number | null;
    precipitation: number | null; wind_speed_10m: number | null; wind_direction_10m: number | null; wind_gusts_10m: number | null;
    relative_humidity_2m: number | null; cloud_cover: number | null; visibility: number | null; dew_point_2m: number | null; pressure_msl: number | null }
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[];
    sunrise: string[]; sunset: string[]; uv_index_max: Array<number | null>; precipitation_probability_max: Array<number | null> }
  hourly: { time: string[]; precipitation_probability: Array<number | null>; precipitation: Array<number | null> }
}
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
export const weatherKey = (weather: Location) => `${weather.latitude.toFixed(3)},${weather.longitude.toFixed(3)}`

async function request(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`)
  return response.json()
}

function moonData(time: string, offset: number, latitude: number, longitude: number): MoonData {
  const now = new Date(Date.parse(`${time}Z`) - offset * 1000)
  const illumination = SunCalc.getMoonIllumination(now)
  let moonset: string | null = null
  for (let day = 0; day < 3 && !moonset; day++) {
    const date = new Date(now.getTime() + day * 86_400_000)
    const set = SunCalc.getMoonTimes(date, latitude, longitude, true).set
    if (set && set >= now) moonset = new Date(set.getTime() + offset * 1000).toISOString().slice(11, 16)
  }
  // Locate the next phase crossing, rather than assuming every month is identical.
  let fullInDays: number | null = null
  let previous = illumination.phase
  for (let hours = 6; hours <= 31 * 24; hours += 6) {
    const phase = SunCalc.getMoonIllumination(new Date(now.getTime() + hours * 3_600_000)).phase
    if (previous < 0.5 && phase >= 0.5) {
      let low = hours - 6, high = hours
      for (let step = 0; step < 12; step++) {
        const middle = (low + high) / 2
        if (SunCalc.getMoonIllumination(new Date(now.getTime() + middle * 3_600_000)).phase < 0.5) low = middle
        else high = middle
      }
      fullInDays = Math.ceil(high / 24)
      break
    }
    previous = phase
  }
  return { phase: illumination.phase, illumination: illumination.fraction * 100, moonset, fullInDays }
}

export async function fetchWeather(location: Location): Promise<Weather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: 'auto', wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,cloud_cover,visibility,dew_point_2m,pressure_msl',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max,precipitation_probability_max',
    hourly: 'precipitation_probability,precipitation', forecast_days: '10', past_days: '1',
  }).toString()
  const data = await request(url) as ForecastResponse
  const current = data.current
  const time = String(current.time)
  if (!Number.isFinite(Date.parse(`${time}Z`)) || finite(current.temperature_2m) === null || finite(current.weather_code) === null) throw new Error('Weather data unavailable')
  const today = time.slice(0, 10)
  const todayIndex = data.daily.time.indexOf(today)
  if (todayIndex < 0) throw new Error('Weather forecast unavailable')
  const firstFutureHour = data.hourly.time.findIndex(hour => hour > time)
  const currentHour = data.hourly.time.findIndex(hour => hour.slice(0, 13) === time.slice(0, 13))
  let rainInHours: number | null = null, rainAmount = 0, rainChance: number | null = null
  if ((current.precipitation ?? 0) >= 0.1) {
    rainInHours = 0
    rainAmount = current.precipitation!
    rainChance = finite(data.hourly.precipitation_probability[currentHour])
  } else if (firstFutureHour >= 0) {
    for (let index = firstFutureHour; index < Math.min(firstFutureHour + 24, data.hourly.time.length); index++) {
      const amount = data.hourly.precipitation[index] ?? 0
      const probability = data.hourly.precipitation_probability[index] ?? 0
      if (amount >= 0.1 || probability >= 30) {
        rainInHours = index - firstFutureHour + 1; rainAmount = amount; rainChance = probability
        break
      }
    }
  }
  const sumHours = (start: number) => {
    const values = data.hourly.precipitation.slice(start, start + 24)
    return start >= 0 && values.length === 24 && values.every(value => finite(value) !== null)
      ? values.reduce<number>((sum, value) => sum + value!, 0) : null
  }
  return {
    ...location, fetchedAt: Date.now(), temperature: current.temperature_2m!, feelsLike: current.apparent_temperature ?? current.temperature_2m!,
    high: finite(data.daily.temperature_2m_max[todayIndex]), low: finite(data.daily.temperature_2m_min[todayIndex]), code: current.weather_code!,
    rainInHours, rainAmount, rainChance, windSpeed: finite(current.wind_speed_10m), windDirection: finite(current.wind_direction_10m),
    gusts: finite(current.wind_gusts_10m), humidity: finite(current.relative_humidity_2m), cloudCover: finite(current.cloud_cover),
    visibility: finite(current.visibility), dewPoint: finite(current.dew_point_2m), pressure: finite(current.pressure_msl),
    uvMax: finite(data.daily.uv_index_max[todayIndex]), precipPast24: sumHours(firstFutureHour - 24), precipNext24: sumHours(firstFutureHour),
    sunrise: data.daily.sunrise[todayIndex] ?? null, sunset: data.daily.sunset[todayIndex] ?? null,
    forecast: data.daily.time.map((date, index) => ({ date, high: data.daily.temperature_2m_max[index], low: data.daily.temperature_2m_min[index],
      code: data.daily.weather_code[index], rainChance: finite(data.daily.precipitation_probability_max[index]) }))
      .filter(day => day.date >= today && finite(day.high) !== null && finite(day.low) !== null && finite(day.code) !== null).slice(0, 10),
    moon: moonData(time, data.utc_offset_seconds, location.latitude, location.longitude),
  }
}

export async function fetchWindField(weather: Weather): Promise<WindField> {
  const latitude: string[] = [], longitude: string[] = []
  const view = mapViewport(weather.latitude, weather.longitude)
  // Row zero is north. Forecast samples use the same extent/projection as the map.
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const point = mapCoordinate(view, column / 2 * view.width, row / 2 * view.height)
    latitude.push(String(point.latitude)); longitude.push(String(point.longitude))
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({ latitude: latitude.join(','), longitude: longitude.join(','),
    current: 'wind_speed_10m,wind_direction_10m', wind_speed_unit: 'kmh', forecast_days: '1' }).toString()
  const data = await request(url) as Array<{ current: { wind_speed_10m?: number; wind_direction_10m?: number } }>
  if (!Array.isArray(data) || data.length !== 9) throw new Error('Wind field unavailable')
  const nodes = data.map(item => {
    const speed = finite(item.current?.wind_speed_10m), direction = finite(item.current?.wind_direction_10m)
    if (speed === null || direction === null) throw new Error('Wind field unavailable')
    const angle = direction * Math.PI / 180
    return { speed, direction, u: -speed * Math.sin(angle), v: speed * Math.cos(angle) }
  })
  return { nodes, spanKm: view.spanKm }
}

export async function fetchAirQuality(weather: Weather): Promise<AirQuality> {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.search = new URLSearchParams({ latitude: String(weather.latitude), longitude: String(weather.longitude),
    current: 'us_aqi,pm2_5,pm10', timezone: 'auto' }).toString()
  const data = await request(url) as { current?: Record<string, unknown> }
  if (!data.current) throw new Error('Air quality unavailable')
  return { aqi: finite(data.current.us_aqi), pm25: finite(data.current.pm2_5), pm10: finite(data.current.pm10) }
}
