import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { pxTruncate } from '@evenrealities/pretext'
import { supportsDashboardText } from './dashboard-font'
import { MAP_LABEL_HEIGHT, MAP_LABEL_SCALE, mapLabelWidth } from './map-text'
import { mapViewport, type MapViewport } from './map-viewport'

export type MapLabel = { text: string; x: number; y: number; water: boolean; rank: number }
export type WindBasemap = { pixels: Uint8Array; width: number; height: number; labels: MapLabel[]; spanKm: number }
type TileJSON = { tiles: string[]; scheme?: string }
type DecodedTile = { tile: VectorTile; x: number; y: number }
let source: Promise<TileJSON> | null = null
const tileCache = new Map<string, Promise<VectorTile>>()

function tileSource() {
  source ??= fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(15_000) })
    .then(async response => {
      if (!response.ok) throw new Error('Map source unavailable')
      const json = await response.json() as TileJSON
      if (!json.tiles?.length || json.scheme === 'tms') throw new Error('Unsupported map source')
      // Keep requests on the declared map origin even if metadata changes.
      const origin = new URL(json.tiles[0]).origin
      if (origin !== 'https://tiles.openfreemap.org') throw new Error('Unsupported map origin')
      return json
    }).catch(error => { source = null; throw error })
  return source
}

function tileData(url: string) {
  const existing = tileCache.get(url)
  if (existing) return existing
  const pending = fetch(url, { signal: AbortSignal.timeout(20_000) }).then(async response => {
    if (!response.ok) throw new Error('Map tile unavailable')
    let bytes = new Uint8Array(await response.arrayBuffer())
    // Most hosts decompress at HTTP level; also accept raw gzip tile payloads.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    }
    return new VectorTile(new PbfReader(bytes))
  }).catch(error => { tileCache.delete(url); throw error })
  tileCache.set(url, pending)
  // Memory-only cache; no bulk/offline downloads.
  if (tileCache.size > 24) tileCache.delete(tileCache.keys().next().value!)
  return pending
}

function featurePath(context: CanvasRenderingContext2D, feature: VectorTileFeature, tile: DecodedTile, view: MapViewport) {
  const scale = 256 / feature.extent
  context.beginPath()
  for (const ring of feature.loadGeometry()) {
    ring.forEach((point, index) => {
      const x = tile.x * 256 - view.left + point.x * scale
      const y = tile.y * 256 - view.top + point.y * scale
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y)
    })
    if (feature.type === 3) context.closePath()
  }
}

function strokeWaterOutline(context: CanvasRenderingContext2D, feature: VectorTileFeature, tile: DecodedTile, view: MapViewport) {
  const scale = 256 / feature.extent
  context.strokeStyle = '#707070'; context.lineWidth = 0.9
  for (const ring of feature.loadGeometry()) {
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index], b = ring[(index + 1) % ring.length]
      // Clipped polygon closure at tile edges is not a real shoreline.
      if ((a.x === b.x && (a.x === 0 || a.x === feature.extent))
        || (a.y === b.y && (a.y === 0 || a.y === feature.extent))) continue
      context.beginPath()
      context.moveTo(tile.x * 256 - view.left + a.x * scale, tile.y * 256 - view.top + a.y * scale)
      context.lineTo(tile.x * 256 - view.left + b.x * scale, tile.y * 256 - view.top + b.y * scale)
      context.stroke()
    }
  }
}

function renderMap(tiles: DecodedTile[], view: MapViewport): WindBasemap {
  const canvas = document.createElement('canvas')
  canvas.width = view.width; canvas.height = view.height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#080808'; context.fillRect(0, 0, view.width, view.height)
  const labels: MapLabel[] = []
  // Draw in geographic layer order across all tiles to avoid seam overpainting.
  for (const name of ['water', 'waterway', 'boundary', 'transportation']) {
    for (const tile of tiles) {
      const layer = tile.tile.layers[name]
      if (!layer) continue
      context.save()
      context.beginPath(); context.rect(tile.x * 256 - view.left, tile.y * 256 - view.top, 256, 256); context.clip()
      for (let index = 0; index < layer.length; index++) {
        const feature = layer.feature(index), properties = feature.properties
        const road = String(properties.class ?? '')
        if (name === 'boundary' && (Number(properties.admin_level) > 4 || properties.maritime === 1)) continue
        if (name === 'transportation' && !['motorway', 'trunk', 'primary', 'secondary'].includes(road)) continue
        if (name === 'water') { strokeWaterOutline(context, feature, tile, view); continue }
        featurePath(context, feature, tile, view)
        context.setLineDash([]); context.lineWidth = 0.65
        if (name === 'waterway') {
          context.strokeStyle = '#484848'; context.stroke()
        } else if (name === 'boundary') {
          context.strokeStyle = '#393939'; context.setLineDash([3, 3]); context.stroke()
        } else {
          context.strokeStyle = road === 'motorway' || road === 'trunk' ? '#555555' : '#363636'
          context.lineWidth = road === 'motorway' ? 0.8 : 0.55; context.stroke()
        }
      }
      context.restore()
    }
  }
  for (const tile of tiles) for (const name of ['place', 'water_name']) {
    const layer = tile.tile.layers[name]
    if (!layer) continue
    for (let index = 0; index < layer.length; index++) {
      const feature = layer.feature(index), properties = feature.properties
      if (feature.type !== 1) continue
      if (name === 'place' && !['city', 'town'].includes(String(properties.class))) continue
      const text = String(properties['name:en'] ?? properties.name_en ?? properties['name:latin'] ?? properties.name ?? '')
      if (!text || !supportsDashboardText(text)) continue
      const point = feature.loadGeometry()[0]?.[0]
      if (!point) continue
      const x = tile.x * 256 - view.left + point.x * 256 / feature.extent
      const y = tile.y * 256 - view.top + point.y * 256 / feature.extent
      if (x < 5 || x > view.width - 5 || y < 12 || y > view.height - 16) continue
      labels.push({ text, x, y, water: name === 'water_name', rank: Number(properties.rank ?? 10) })
    }
  }
  // Reserve room for the selected-location speed badge and its label.
  const boxes = [
    { x: view.width / 2 - 44, y: view.height / 2 - 20, width: 88, height: 65 },
    { x: 4, y: view.height - 40, width: 75, height: 40 },
  ]
  const picked: MapLabel[] = [], seen = new Set<string>()
  for (const item of labels.sort((a, b) => Number(b.water) - Number(a.water) || a.rank - b.rank)) {
    if (seen.has(item.text)) continue
    const text = pxTruncate(item.text, Math.min(200, (view.width - 12) / MAP_LABEL_SCALE)), width = mapLabelWidth(text)
    const x = Math.max(4, Math.min(view.width - width - 4, Math.round(item.x - width / 2)))
    const y = Math.max(2, Math.min(view.height - MAP_LABEL_HEIGHT - 2, Math.round(item.y - MAP_LABEL_HEIGHT / 2)))
    const box = { x: x - 3, y: y - 1, width: width + 6, height: MAP_LABEL_HEIGHT + 2 }
    if (boxes.some(b => box.x < b.x + b.width && box.x + box.width > b.x && box.y < b.y + b.height && box.y + box.height > b.y)) continue
    boxes.push(box); seen.add(item.text); picked.push({ ...item, text, x, y })
    if (picked.length === 6) break
  }
  const rgba = context.getImageData(0, 0, view.width, view.height).data
  const pixels = Uint8Array.from({ length: view.width * view.height }, (_, index) => rgba[index * 4])
  return { pixels, width: view.width, height: view.height, labels: picked, spanKm: view.spanKm }
}

export async function fetchWindBasemap(location: { latitude: number; longitude: number }): Promise<WindBasemap> {
  const view = mapViewport(location.latitude, location.longitude), metadata = await tileSource()
  const count = 2 ** view.zoom
  const requests: Array<Promise<DecodedTile>> = []
  // The small viewport intersects at most four 256px tiles.
  for (let y = Math.floor(view.top / 256); y <= Math.floor((view.top + view.height - 1) / 256); y++) {
    for (let x = Math.floor(view.left / 256); x <= Math.floor((view.left + view.width - 1) / 256); x++) {
      const wrappedX = ((x % count) + count) % count
      const url = metadata.tiles[0].replace('{z}', String(view.zoom)).replace('{x}', String(wrappedX)).replace('{y}', String(y))
      requests.push(tileData(url).then(tile => ({ tile, x, y })))
    }
  }
  return renderMap(await Promise.all(requests), view)
}
