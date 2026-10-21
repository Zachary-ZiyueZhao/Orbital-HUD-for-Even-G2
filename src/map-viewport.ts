// Shared Web Mercator geometry keeps the forecast samples and map in alignment.
export const WIND_MAP_RECT = { x: 348, y: 89, width: 194, height: 145 }
export const MAP_ZOOM = 6
export type MapViewport = { zoom: number; left: number; top: number; width: number; height: number; worldSize: number; spanKm: number }
const MAX_LATITUDE = 85.05112878

export function mapViewport(latitude: number, longitude: number): MapViewport {
  const worldSize = 256 * 2 ** MAP_ZOOM
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))
  const sin = Math.sin(lat * Math.PI / 180)
  const x = (((longitude + 180) % 360 + 360) % 360) / 360 * worldSize
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize
  return { zoom: MAP_ZOOM, left: x - WIND_MAP_RECT.width / 2,
    top: Math.max(0, Math.min(worldSize - WIND_MAP_RECT.height, y - WIND_MAP_RECT.height / 2)),
    width: WIND_MAP_RECT.width, height: WIND_MAP_RECT.height, worldSize,
    spanKm: Math.round(WIND_MAP_RECT.width / worldSize * 40_075 * Math.cos(lat * Math.PI / 180)) }
}

export function mapCoordinate(view: MapViewport, x: number, y: number) {
  const worldX = ((view.left + x) % view.worldSize + view.worldSize) % view.worldSize
  const mercatorY = (view.top + y) / view.worldSize
  return { latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY))) * 180 / Math.PI,
    longitude: worldX / view.worldSize * 360 - 180 }
}
