import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { getAdvW, getTextWidth } from '@evenrealities/pretext'
import { TextContainerProperty, TextContainerUpgrade, ImageContainerProperty, ImageRawDataUpdate,
  CreateStartUpPageContainer, OsEventTypeList, StartUpPageCreateResult,
  validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk'

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const home = await loadModule('../src/home-list.ts')
for (const section of home.HOME_SECTIONS) {
  assert.deepEqual(home.homeNativeIndicators(section).split('\n'),
    home.HOME_SECTIONS.map(row => row === section ? '<' : '-'))
}
for (const marker of ['<', '-']) assert.ok(getAdvW(marker.codePointAt(0)) > 0, 'selection markers must exist in the native G2 font')
const surface = await loadModule('../src/hud-surface.ts')
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true)
const functions = new Set(['surfaceContainers', 'surfaceImageContainers', 'ensureSurfaceLayout',
  'textCacheKey', 'updateSurfaceText', 'moveSection', 'sectionIndex',
  'queueHudRender', 'routeEvent', 'bindEvents'])
const source = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && functions.has(statement.name?.text))
  .map(statement => statement.getText(parsed)).join('\n')
const payloads = [], upgrades = [], opened = []
let input, renders = 0, imageUpdates = 0
const context = vm.createContext({
  ...home, ...surface, TextContainerProperty, TextContainerUpgrade, ImageContainerProperty,
  getTextWidth,
  CreateStartUpPageContainer, OsEventTypeList, StartUpPageCreateResult,
  NATIVE_HOME_TEXT: true, FAST_NATIVE_HOME: true, SECTIONS: [...home.HOME_SECTIONS], ImageRawDataUpdate,
  ImageRawDataUpdateResult: { success: 'success' }, encodeGrayPng: async data => data,
  CARD_WIDTH: 288, CARD_TOP: 36, CARD_HEIGHT: 218, DASHBOARD_LINE_HEIGHT: 27,
  nativeHomeSummary: section => `Summary for ${section}`, menu: {}, selectedSection: 'info',
  page: 'home', surfaceReady: false, surfaceLayout: 'full', surfaceCapturesChat: false, surfaceBorderColor: 0,
  surfaceTiles: [], surfaceText: new Map(), hudRenderQueue: Promise.resolve(), hudAnimationEpoch: 0,
  hudActive: true, appExited: false, hudTransitioning: false, overlayTyping: false,
  animatingDashboard: false, animatingNavigation: false, recording: false, longPressHeld: false,
  lastDoubleClickAt: -Infinity, performance, console,
  bridge: {
    createStartUpPageContainer: async payload => { payloads.push(payload); return StartUpPageCreateResult.success },
    rebuildPageContainer: async payload => { payloads.push(payload); return true },
    textContainerUpgrade: async upgrade => { upgrades.push(upgrade); return true },
    updateImageRawData: async () => { imageUpdates += 1; return 'success' },
    onEvenHubEvent: callback => { input = callback }, onDeviceStatusChanged: () => {},
  },
  renderHud: () => { renders += 1; return context.queueHudRender(() => context.updateSurfaceText(context.page)) }, syncQuoteMotion: () => {},
  cancelNewConversationClick: () => {},
  setPage: next => { opened.push(next); context.page = next; context.hudAnimationEpoch += 1 },
  setHudAwake: async awake => { context.hudActive = awake; context.hudAnimationEpoch += 1 },
})
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
vm.runInContext(outputText, context)
await context.ensureSurfaceLayout('symbol-home', 'home', true)
context.bindEvents()
const payload = payloads[0]
assert.equal(payload.containerTotalNum, 12)
assert.equal(validateEvenHubPageContainer(payload.toJson()).valid, true)
assert.equal(payload.listObject?.length ?? 0, 0, 'a native list would swallow swipe events')
assert.equal(payload.textObject.length, 8)
const all = [...payload.textObject, ...payload.imageObject]
assert.equal(new Set(all.map(container => container.containerID)).size, all.length, 'container IDs must be unique across all types')
const capture = all.filter(container => container.isEventCapture === 1)
assert.equal(capture.length, 1)
assert.equal(capture[0].containerName, 'home-frame')
assert.equal(capture[0].content, ' ', 'the swipe receiver must not overflow and scroll itself')
assert.ok(!payload.textObject.some(container => container.containerName === 'home-summary-rule'), 'the divider must not be scrollable text')
assert.equal(payload.imageObject.length, 4)
assert.deepEqual([payload.imageObject[3].xPosition, payload.imageObject[3].yPosition,
  payload.imageObject[3].width, payload.imageObject[3].height], [263, 42, 20, 114],
  'all four original icons should share one compact image column')
const divider = payload.textObject.find(c => c.containerName === 'home-divider')
assert.equal(divider.content, '─'.repeat(13))
assert.equal(divider.textColor, 2)
assert.equal(divider.xPosition, 263)
assert.equal(divider.yPosition, 141)
assert.equal(payload.textObject.find(container => container.containerName === 'home-info').content,
  home.homeSectionLabel('info'))
assert.equal(payload.textObject.find(container => container.containerName === 'home-info').textColor, 4)
assert.equal(payload.textObject.find(container => container.containerName === 'home-ai').textColor, 4)
for (const section of home.HOME_SECTIONS) {
  const row = payload.textObject.find(container => container.containerName === 'home-' + section)
  assert.equal(row.xPosition, 290, 'all labels must start in the same column beside the image icons')
  assert.equal(row.textColor, 4, 'selected and unselected labels must have equal brightness')
  assert.equal(row.content, home.homeSectionLabel(section), 'labels must not include spacing or selection markers')
}
const indicators = payload.textObject.find(container => container.containerName === 'home-indicators')
assert.equal(indicators.content, '<\n-\n-\n-')
assert.equal(indicators.xPosition + 7, divider.xPosition + getTextWidth(divider.content),
  'the visible marker right edge must meet the divider right edge')
assert.equal(indicators.yPosition, payload.textObject.find(c => c.containerName === 'home-info').yPosition)
assert.equal(indicators.height, 4 * context.DASHBOARD_LINE_HEIGHT)

async function swipe(eventType) {
  input({ textEvent: { eventType } }) // Real text swipes contain no selected index.
  await context.hudRenderQueue
}
await swipe(OsEventTypeList.SCROLL_BOTTOM_EVENT)
assert.equal(context.selectedSection, 'ai')
assert.ok(upgrades.some(upgrade => upgrade.containerName === 'home-summary' && upgrade.content === 'Summary for ai'))
assert.ok(upgrades.some(upgrade => upgrade.containerName === 'home-indicators'
  && upgrade.content === '-\n<\n-\n-' && upgrade.textColor === 4))
assert.ok(!upgrades.some(upgrade => /^home-(info|ai|weather|todo)$/.test(upgrade.containerName)),
  'selection changes must update the marker column without rewriting labels')
await swipe(OsEventTypeList.SCROLL_BOTTOM_EVENT)
assert.equal(context.selectedSection, 'weather')
assert.equal(upgrades.at(-1).content, 'Summary for weather')
await swipe(OsEventTypeList.SCROLL_BOTTOM_EVENT)
assert.equal(context.selectedSection, 'todo')
const atBottom = upgrades.length
await swipe(OsEventTypeList.SCROLL_BOTTOM_EVENT)
assert.equal(context.selectedSection, 'todo')
assert.equal(upgrades.length, atBottom)
await swipe(OsEventTypeList.SCROLL_TOP_EVENT)
assert.equal(context.selectedSection, 'weather')
input({ sysEvent: {} }) // Protobuf may omit zero-valued CLICK_EVENT.
assert.equal(opened.at(-1), 'weather')
input({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } })
assert.equal(context.page, 'home')
context.surfaceReady = false
await context.ensureSurfaceLayout('symbol-home', 'home')
assert.equal(context.selectedSection, 'weather', 'returning must preserve selection without reordering titles')
assert.deepEqual(Array.from(payloads[1].textObject.filter(container => /^home-(info|ai|weather|todo)$/.test(container.containerName)),
  container => container.content.trim().replace(/[<-]$/u, '').trim()), Object.values(home.HOME_SECTION_TITLES))
assert.equal(payloads[1].textObject.find(container => container.containerName === 'home-summary').content, 'Summary for weather')

// Home long press does nothing. Double tap sleeps; while asleep only another
// double tap wakes (system context menu is handled separately).
input({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_EVENT } })
input({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_RELEASE_EVENT } })
assert.equal(context.hudActive, true)
context.lastDoubleClickAt = -Infinity
input({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } })
assert.equal(context.hudActive, false)
await swipe(OsEventTypeList.SCROLL_BOTTOM_EVENT)
input({ sysEvent: {} })
assert.equal(context.selectedSection, 'weather')
assert.equal(opened.length, 2)
input({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_EVENT } })
input({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_RELEASE_EVENT } })
assert.equal(context.hudActive, false)
context.lastDoubleClickAt = -Infinity
input({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } })
assert.equal(context.hudActive, true)
// Fast swipes serialize text sends and leave the final synopsis consistent.
input({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } })
input({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } })
input({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } })
await context.hudRenderQueue
assert.equal(context.selectedSection, 'ai')
assert.equal(upgrades.at(-1).content, 'Summary for ai')
assert.equal(payloads.length, 2, 'swipes must not rebuild the page')
console.log('Home navigation checks passed: custom icon tile, aligned native arrows, equal label brightness, synopsis updates, fixed order, double-tap sleep/wake and fast swipes.')
