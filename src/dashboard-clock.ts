// Dashboard-style numerals. Each occupied cell contains a 3x3 group of dots.
// This is independent of the compact date/weather lettering.
const DIGITS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['01000', '00100', '00100', '00100', '00100', '00100', '00100'],
  '2': ['01110', '00001', '00001', '01110', '10000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['10001', '10001', '10001', '01111', '00001', '00001', '00001'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11110', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['0', '1', '0', '0', '1', '0', '0'],
}
const DOT_COUNT = 3
const DOT_SIZE = 2
const DOT_GAP = 0.8
const COVERAGE_SCALE = 5
// Continue the same gap across adjacent nine-dot cells.
const CELL_STEP = DOT_COUNT * (DOT_SIZE + DOT_GAP)
const CHARACTER_GAP = 4
const COLON_GAP = 4
const CELL_SIZE = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_GAP

export function clockTextLayout(time: string) {
  let left = 0
  const glyphs = [...time].map((character, index, characters) => {
    const pixels = DIGITS[character] ?? DIGITS['0']
    if (character === ':') left += COLON_GAP
    const glyph = { pixels, x: left }
    left += (pixels[0].length - 1) * CELL_STEP + CELL_SIZE
    if (character === ':') left += COLON_GAP
    if (index < characters.length - 1) left += CHARACTER_GAP
    return glyph
  })
  return { glyphs, width: Number(left.toFixed(2)), height: Number((6 * CELL_STEP + CELL_SIZE).toFixed(2)) }
}

export function drawClockText(context: CanvasRenderingContext2D, layout: ReturnType<typeof clockTextLayout>, x: number, y: number) {
  // Five samples per native pixel represent the 0.8px gaps as grayscale coverage.
  // The dots stay 2x2 squares; averaging coverage avoids closing every fifth gap.
  const width = Math.ceil(layout.width), height = Math.ceil(layout.height)
  const canvas = document.createElement('canvas')
  canvas.width = width * COVERAGE_SCALE
  canvas.height = height * COVERAGE_SCALE
  const high = canvas.getContext('2d')
  if (!high) throw new Error('Clock canvas is unavailable')
  high.fillStyle = '#000'
  high.fillRect(0, 0, canvas.width, canvas.height)
  high.fillStyle = '#fff'
  const dotStep = DOT_SIZE + DOT_GAP
  for (const glyph of layout.glyphs) {
    for (let row = 0; row < glyph.pixels.length; row++) {
      for (let column = 0; column < glyph.pixels[row].length; column++) {
        if (glyph.pixels[row][column] !== '1') continue
        for (let dotY = 0; dotY < DOT_COUNT; dotY++) for (let dotX = 0; dotX < DOT_COUNT; dotX++) {
          high.fillRect(Math.round((glyph.x + column * CELL_STEP + dotX * dotStep) * COVERAGE_SCALE),
            Math.round((row * CELL_STEP + dotY * dotStep) * COVERAGE_SCALE),
            DOT_SIZE * COVERAGE_SCALE, DOT_SIZE * COVERAGE_SCALE)
        }
      }
    }
  }
  const source = high.getImageData(0, 0, canvas.width, canvas.height).data
  const output = context.createImageData(width, height)
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    let sum = 0
    for (let subY = 0; subY < COVERAGE_SCALE; subY++) for (let subX = 0; subX < COVERAGE_SCALE; subX++) {
      sum += source[((row * COVERAGE_SCALE + subY) * canvas.width + column * COVERAGE_SCALE + subX) * 4]
    }
    const index = (row * width + column) * 4
    const gray = Math.round(sum / (COVERAGE_SCALE * COVERAGE_SCALE))
    output.data[index] = output.data[index + 1] = output.data[index + 2] = gray
    output.data[index + 3] = 255
  }
  context.putImageData(output, Math.round(x), Math.round(y))
}
