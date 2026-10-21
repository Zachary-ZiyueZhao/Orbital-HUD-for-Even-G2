import { safeProblemImage } from './leetcode-data'
import { ditherProblemImage } from './leetcode-dither'

export type ProblemImage = { pixels: Uint8Array; width: number; height: number }
export async function loadProblemImage(source: string, relayBase = '', bundledSource?: string): Promise<ProblemImage> {
  const url = safeProblemImage(source)
  if (!url) throw new Error('Unsupported image URL')
  const urls = [...(bundledSource ? [bundledSource] : []),
    ...(relayBase ? [`${relayBase.replace(/\/+$/, '')}/leetcode/image?url=${encodeURIComponent(url)}`] : []), url]
  for (const target of urls) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let bitmap: ImageBitmap | undefined
    try {
      const response = await fetch(target, { credentials: 'omit', signal: controller.signal })
      if (!response.ok) throw new Error('Image unavailable')
      if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new Error('Image too large')
      const blob = await response.blob()
      if (blob.size > 4 * 1024 * 1024 || !/^image\/(png|jpeg|gif|webp)$/i.test(blob.type)) throw new Error('Unsupported image')
      bitmap = await createImageBitmap(blob)
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_000_000) throw new Error('Image too large')
      const scale = Math.min(1, 500 / bitmap.width, 189 / bitmap.height)
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas unavailable')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, 0, 0, width, height)
      const rgba = context.getImageData(0, 0, width, height).data
      const pixels = ditherProblemImage(rgba, width, height)
      return { pixels, width, height }
    } catch { /* Try the official asset directly if a configured relay fails. */ }
    finally { clearTimeout(timer); bitmap?.close() }
  }
  throw new Error('Image unavailable')
}
