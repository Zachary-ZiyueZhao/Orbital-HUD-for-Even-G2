function validSize(length: number, width: number, height: number, channels: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || length !== width * height * channels) throw new Error('Invalid problem image size')
}

function percentile(histogram: Uint32Array, count: number, fraction: number) {
  const target = Math.max(1, Math.ceil(count * fraction))
  let total = 0
  for (let value = 0; value < 256; value++) {
    total += histogram[value]
    if (total >= target) return value
  }
  return 255
}

// Prepare emissive ink for the glasses: estimate the background from all four
// edges, remove its tint, stretch useful tones, then gently lift midtones.
export function enhanceProblemGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  validSize(rgba.length, width, height, 4)
  const gray = new Uint8Array(width * height)
  const border = new Uint32Array(256)
  let borderCount = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, offset = index * 4, alpha = rgba[offset + 3] / 255
    const luminance = rgba[offset] * .299 + rgba[offset + 1] * .587 + rgba[offset + 2] * .114
    gray[index] = Math.round(luminance * alpha + 255 * (1 - alpha))
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      border[gray[index]]++; borderCount++
    }
  }
  const background = percentile(border, borderCount, .5)
  const invert = background >= 128
  const histogram = new Uint32Array(256)
  let maximum = 0
  for (let index = 0; index < gray.length; index++) {
    const ink = Math.max(0, invert ? background - gray[index] : gray[index] - background)
    gray[index] = ink
    histogram[ink]++
    maximum = Math.max(maximum, ink)
  }
  const low = percentile(histogram, gray.length, .005)
  let high = percentile(histogram, gray.length, .995)
  // Sparse axes/text must not disappear when they cover less than 0.5%.
  if (high - low < 32) high = maximum
  const stretch = high - low >= 32
  const lookup = Uint8Array.from({ length: 256 }, (_, ink) => {
    const normalized = stretch ? Math.max(0, Math.min(1, (ink - low) / (high - low))) : ink / 255
    return Math.round(255 * Math.pow(normalized, .85))
  })
  for (let index = 0; index < gray.length; index++) gray[index] = lookup[gray[index]]
  return gray
}

// Serpentine Floyd–Steinberg error diffusion. Only fully off/on samples are
// emitted: gray is represented by dot density, rather than faint light levels.
// Run AFTER resizing and cache the result so scrolling never re-dithers it.
export function floydSteinbergMono(gray: Uint8Array, width: number, height: number): Uint8Array {
  validSize(gray.length, width, height, 1)
  const pixels = new Uint8Array(gray.length)
  let current = new Float32Array(width + 2), next = new Float32Array(width + 2)
  for (let y = 0; y < height; y++) {
    const direction = y % 2 === 0 ? 1 : -1
    for (let x = direction === 1 ? 0 : width - 1; x >= 0 && x < width; x += direction) {
      const index = y * width + x, ink = gray[index], column = x + 1
      // Preserve clear background and solid ink, including thin diagram axes.
      if (ink <= 3 || ink >= 252) { pixels[index] = ink <= 3 ? 0 : 255; continue }
      const corrected = Math.max(0, Math.min(255, ink + current[column]))
      const output = corrected >= 127.5 ? 255 : 0
      pixels[index] = output
      const error = corrected - output
      current[column + direction] += error * 7 / 16
      next[column - direction] += error * 3 / 16
      next[column] += error * 5 / 16
      next[column + direction] += error / 16
    }
    const previous = current
    current = next
    next = previous
    next.fill(0)
  }
  return pixels
}

export function ditherProblemImage(rgba: Uint8ClampedArray, width: number, height: number) {
  return floydSteinbergMono(enhanceProblemGrayscale(rgba, width, height), width, height)
}
