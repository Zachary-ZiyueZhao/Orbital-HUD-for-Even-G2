import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import vm from 'node:vm'
import ts from 'typescript'
import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { TextContainerProperty, TextContainerUpgrade, ImageContainerProperty, ImageRawDataUpdate,
  CreateStartUpPageContainer, StartUpPageCreateResult, ImageRawDataUpdateResult,
  validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk'

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}
const surface = await load('../src/hud-surface.ts'), home = await load('../src/home-list.ts'), png = await load('../src/hud-png.ts')
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true)
const names = new Set(['surfaceContainers', 'surfaceImageContainers', 'ensureSurfaceLayout', 'textCacheKey',
  'updateSurfaceText', 'queueHudRender', 'updateSurfaceFrame', 'cachedHudPng', 'renderHud', 'moveSection'])
const source = parsed.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name?.text)).map(s => s.getText(parsed)).join('\n')
const pages = [], texts = [], images = [], errors = [], metrics = []
let imageGate, holdNextImage = false, holdTexts = false, textGates = [], activeImages = 0, maxImages = 0
let body = 'First answer', weatherView = 0
let pngEncodes = 0

// Inspect the actual encoded PNG; the fixture's first row is uniform.
function firstPixel(data) {
  const input = Buffer.from(data), parts = []
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset)
    if (input.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(input.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const scanlines = inflateSync(Buffer.concat(parts))
  assert.equal(scanlines[0], 0)
  return (scanlines[1] >>> 4) * 17
}
function recordPage(payload) {
  assert.equal(validateEvenHubPageContainer(payload.toJson()).valid, true)
  pages.push(payload)
}
const context = vm.createContext({
  ...surface, ...home, ...png, TextContainerProperty, TextContainerUpgrade, ImageContainerProperty, ImageRawDataUpdate,
  CreateStartUpPageContainer, StartUpPageCreateResult, ImageRawDataUpdateResult, getTextWidth, pxTruncate, performance,
  console: { debug: (...args) => metrics.push(args), error: (...args) => errors.push(args) },
  NATIVE_HOME_TEXT: true, FAST_NATIVE_HOME: true, EMPTY_TODO_TEXT: 'No to-dos right now', CARD_TOP: 36, CARD_WIDTH: 288, CARD_HEIGHT: 218,
  DASHBOARD_LINE_HEIGHT: 27, DETAIL_TITLE_X: 59, DETAIL_TITLE_Y: 23, DETAIL_BODY_Y: 50, DETAIL_EMPTY_Y: 127,
  DETAIL_RECT: { x: 18, y: 10, width: 540, height: 262 },
  page: 'chat', selectedSection: 'info', hudActive: true, appExited: false, hudTransitioning: false,
  animatingNavigation: false, animatingDashboard: false, recording: false, transitionTextHidden: false, overlayTyping: false,
  hudRefreshPending: false, hudLayoutPage: null, hudAnimationEpoch: 0, hudRenderQueue: Promise.resolve(),
  hudRenderWorker: null, hudRenderVersion: 0, hudRenderFirst: false,
  hudPngCache: [], encodeGrayPng: (...args) => { pngEncodes += 1; return png.encodeGrayPng(...args) },
  surfaceReady: false, surfaceLayout: 'full', surfaceCapturesChat: false, surfaceBorderColor: 0,
  surfaceTiles: [], surfaceText: new Map(), menu: {},
  nativeHomeSummary: section => 'Summary for ' + section,
  pageTextContainers: page => [
    { content: page, textColor: 4 }, { content: body, borderColor: context.recording ? 12 : 7 },
  ],
  drawStaticPage: page => {
    const pixels = new Uint8Array(surface.HUD_WIDTH * surface.HUD_HEIGHT).fill(page === 'weather' ? 170 + weatherView * 17 : 102)
    if (page === 'home' && !context.FAST_NATIVE_HOME) {
      const rect = surface.HOME_MENU_RECT
      for (let row = rect.y; row < rect.y + rect.height; row++) {
        pixels.fill(34 + home.HOME_SECTIONS.indexOf(context.selectedSection) * 17,
          row * surface.HUD_WIDTH + rect.x, row * surface.HUD_WIDTH + rect.x + rect.width)
      }
    }
    return pixels
  },
  bridge: {
    createStartUpPageContainer: async payload => { recordPage(payload); return StartUpPageCreateResult.success },
    rebuildPageContainer: async payload => { recordPage(payload); return true },
    textContainerUpgrade: async upgrade => {
      texts.push(upgrade)
      if (holdTexts) await new Promise(resolve => textGates.push(resolve))
      return true
    },
    updateImageRawData: async update => {
      activeImages += 1; maxImages = Math.max(maxImages, activeImages)
      const data = Buffer.from(update.imageData)
      images.push({ id: update.containerID, width: data.readUInt32BE(16), height: data.readUInt32BE(20), sample: firstPixel(data) })
      if (holdNextImage) {
        holdNextImage = false
        await new Promise(resolve => { imageGate = resolve })
      }
      activeImages -= 1
      return ImageRawDataUpdateResult.success
    },
  },
})
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
async function waitFor(predicate) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    assert.equal(errors.length, 0, errors.map(args => args.join(' ')).join('\n'))
    assert.ok(Date.now() < deadline, 'transport condition did not settle')
    await new Promise(resolve => setImmediate(resolve))
  }
}
function releaseImage() { const release = imageGate; imageGate = undefined; release() }
function enter(page) { context.page = page; context.hudAnimationEpoch += 1 }

await context.renderHud(true)
assert.equal(errors.length, 0)
assert.equal(pages.at(-1).imageObject.length, 1)
assert.equal(pages.at(-1).textObject.find(c => c.containerName === 'hud-input').borderWidth, 1)
assert.deepEqual(images.map(({ width, height }) => [width, height]), [[20, 20]])
const before = { pages: pages.length, images: images.length }
body = 'An updated answer'
await context.renderHud()
assert.equal(images.length, before.images, 'answer updates must only send native text')
assert.equal(pages.length, before.pages, 'answer updates must not rebuild the page')
assert.equal(texts.at(-1).content, body)

// Native border brightness still changes during recording, through one
// layout rebuild and one small icon instead of four full-screen images.
context.recording = true
await context.renderHud()
assert.equal(pages.at(-1).textObject[0].borderColor, 12)
context.recording = false
await context.renderHud()
assert.equal(pages.at(-1).textObject[0].borderColor, 7)

enter('home'); await context.renderHud()
texts.length = 0
const nativeImageCount = images.length, nativeEncodeCount = pngEncodes
holdTexts = true
context.selectedSection = 'ai'
const highlight = context.renderHud()
await waitFor(() => textGates.length === 2)
assert.deepEqual(texts.map(t => t.containerName), ['home-indicators', 'home-summary'])
assert.equal(texts.find(t => t.containerName === 'home-indicators').textColor, 4)
assert.equal(texts.find(t => t.containerName === 'home-indicators').content, '-\n<\n-\n-')
holdTexts = false; for (const resolve of textGates) resolve(); textGates = []
await highlight
assert.equal(images.length, nativeImageCount, 'native selection changes must send zero images')
assert.equal(pngEncodes, nativeEncodeCount, 'native selection must do no image encoding')

// Slow native text requests must coalesce to the latest selection, without
// falling back to any image transport or splitting icons from labels.
holdTexts = true
context.selectedSection = 'weather'
const slow = context.renderHud()
await waitFor(() => textGates.length === 2)
const bursts = []
for (const section of ['ai', 'info', 'weather', 'ai', 'todo']) {
  context.selectedSection = section
  bursts.push(context.renderHud())
}
holdTexts = false; for (const resolve of textGates) resolve(); textGates = []
await Promise.all([slow, ...bursts])
assert.equal(images.length, nativeImageCount)
assert.equal(context.surfaceText.get(11), '4:-\n-\n-\n<')
assert.equal(context.surfaceText.get(9), '4:Summary for todo')

// The optional bitmap fallback also updates icons and labels together in
// one image. Returning to an already encoded state reuses its cached PNG.
context.FAST_NATIVE_HOME = false
await context.renderHud()
assert.equal(pages.at(-1).textObject.length, 2)
const bitmapImages = images.length
context.selectedSection = 'ai'; await context.renderHud()
assert.equal(images.length - bitmapImages, 1)
assert.deepEqual([images.at(-1).width, images.at(-1).height], [262, 114])
const cachedEncodes = pngEncodes
context.selectedSection = 'todo'; await context.renderHud()
assert.equal(pngEncodes, cachedEncodes, 'cached menu state must not be encoded a second time')
context.FAST_NATIVE_HOME = true

// A new weather page must cancel the old frame after the one image already
// in flight; it must not send the old frame's other three quadrants.
images.length = 0
enter('weather'); holdNextImage = true
const oldWeather = context.renderHud()
await waitFor(() => imageGate)
weatherView = 1
const latestWeather = context.renderHud()
releaseImage()
await Promise.all([oldWeather, latestWeather])
assert.deepEqual(images.map(image => image.sample), [170, 187, 187, 187, 187])

// Navigating away while an image is in flight has the same cancellation
// guarantee, followed by a single small image on the text page.
images.length = 0
weatherView = 2; holdNextImage = true
const leaving = context.renderHud()
await waitFor(() => imageGate)
enter('chat')
const chat = context.renderHud()
releaseImage()
await Promise.all([leaving, chat])
assert.deepEqual(images.map(image => [image.width, image.height]), [[288, 144], [20, 20]])
assert.equal(context.hudLayoutPage, 'chat')
// Returning home changes app state before the old layout is replaced. Input
// in that interval must update the selection rather than being discarded.
enter('home'); context.selectedSection = 'info'
await context.moveSection(1)
assert.equal(context.selectedSection, 'ai')
assert.equal(context.hudLayoutPage, 'home')
assert.equal(maxImages, 1, 'image sends must remain serial')
assert.equal(errors.length, 0)
assert.ok(metrics.some(([label, data]) => label === 'HUD image transport' && data.superseded))
console.log('HUD transport checks passed: native marker column and synopsis update without sending images or rewriting labels; bitmap fallback uses one cached menu image, slow refreshes coalesce, obsolete tiles cancel and image sends stay serial.')
