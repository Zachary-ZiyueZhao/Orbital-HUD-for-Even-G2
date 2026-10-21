const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

function chunk(type: string, data: Uint8Array) {
  const result = new Uint8Array(data.length + 12)
  const view = new DataView(result.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index++) result[4 + index] = type.charCodeAt(index)
  result.set(data, 8)
  let crc = 0xffffffff
  for (let index = 4; index < result.length - 4; index++) crc = CRC_TABLE[(crc ^ result[index]) & 255] ^ (crc >>> 8)
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0)
  return result
}

// PNG type 0, depth 4: two display-level grayscale samples per byte. The image
// stays at its original resolution, with all 16 brightness levels available.
export function gray4Scanlines(pixels: Uint8Array, width: number, height: number) {
  if (pixels.length !== width * height || width < 1 || height < 1) throw new Error('Invalid HUD image size')
  const stride = Math.ceil(width / 2)
  const scanlines = new Uint8Array((stride + 1) * height)
  let previous = new Uint8Array(stride)
  for (let row = 0; row < height; row++) {
    const packed = new Uint8Array(stride)
    for (let column = 0; column < width; column++) {
      const level = Math.round(pixels[row * width + column] / 17)
      packed[column >>> 1] |= level << (column % 2 === 0 ? 4 : 0)
    }
    let noneCost = 0, upCost = 0
    for (let column = 0; column < stride; column++) {
      const difference = (packed[column] - previous[column]) & 255
      noneCost += Math.min(packed[column], 256 - packed[column])
      upCost += Math.min(difference, 256 - difference)
    }
    const useUp = upCost < noneCost
    const offset = row * (stride + 1)
    scanlines[offset] = useUp ? 2 : 0
    for (let column = 0; column < stride; column++) scanlines[offset + 1 + column] = useUp ? (packed[column] - previous[column]) & 255 : packed[column]
    previous = packed
  }
  return scanlines
}

export async function encodeGrayPng(pixels: Uint8Array, width: number, height: number) {
  if (typeof CompressionStream === 'undefined') return encodeCanvasPng(pixels, width, height)
  const scanlines = gray4Scanlines(pixels, width, height)
  const compressed = new Uint8Array(await new Response(
    new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer())
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width); view.setUint32(4, height)
  header[8] = 4 // bit depth; color type 0 (grayscale), no alpha or palette
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())]
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { png.set(part, offset); offset += part.length }
  return png
}

// Older companion WebViews retain the established encoded-image path.
async function encodeCanvasPng(pixels: Uint8Array, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('HUD canvas is unavailable')
  const rgba = context.createImageData(width, height)
  for (let index = 0; index < pixels.length; index++) {
    const offset = index * 4
    rgba.data[offset] = rgba.data[offset + 1] = rgba.data[offset + 2] = pixels[index]
    rgba.data[offset + 3] = 255
  }
  context.putImageData(rgba, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result ? resolve(result) : reject(new Error('HUD PNG encoding failed')), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
