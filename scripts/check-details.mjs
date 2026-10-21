import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { TextContainerProperty, TextContainerUpgrade, ImageContainerProperty, CreateStartUpPageContainer,
  OsEventTypeList, StartUpPageCreateResult, validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk'

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}
const display = await load('../src/chat-display.ts'), home = await load('../src/home-list.ts'), surface = await load('../src/hud-surface.ts')
const longText = '这是一段很长的中文回复，需要完整保留全部信息。😀\n'.repeat(80)
const messages = [
  { role: 'user', content: 'First question' }, { role: 'assistant', content: longText },
  { role: 'user', content: 'Next question' }, { role: 'assistant', content: 'Last answer' },
]
const transcript = display.formatChatTranscript(messages, getTextWidth)
assert.equal(transcript.lines[0], '> First question')
const nextQuestion = transcript.lines.indexOf('> Next question')
assert.equal(transcript.lines[nextQuestion - 1], '', 'turns must be separated by a blank line')
assert.equal(transcript.lines[nextQuestion + 1], '- Last answer', 'an answer follows its question')
for (let offset = 0; offset < transcript.lines.length; offset++) {
  assert.ok(Buffer.byteLength(display.chatScrollWindow(transcript.lines, offset).content) <= 940)
}

const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true)
const names = new Set(['setPage', 'routeEvent', 'chatContainers', 'chatTranscriptLines', 'chatTranscriptData', 'pageTextContainers',
  'surfaceContainers', 'surfaceImageContainers', 'ensureSurfaceLayout', 'textCacheKey', 'updateSurfaceText', 'queueHudRender',
  'moveChatScroll', 'cancelNewConversationClick', 'startNewConversation', 'addMessage', 'sendChat',
  'moveWeatherPage', 'weatherOverlay', 'refreshInformationQuote', 'cancelInformationQuote'])
const selected = parsed.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name?.text)).map(s => s.getText(parsed)).join('\n')
const payloads = [], renders = [], requests = [], phases = [], upgrades = [], stored = new Map(), widgets = new Map()
let providerReply
const context = vm.createContext({
  ...display, ...home, ...surface, TextContainerProperty, TextContainerUpgrade, ImageContainerProperty, CreateStartUpPageContainer,
  OsEventTypeList, StartUpPageCreateResult, getTextWidth, pxTruncate, console: { ...console, debug: () => {} }, performance,
  window: { setTimeout, clearTimeout },
  NATIVE_HOME_TEXT: true, FAST_NATIVE_HOME: true, EMPTY_TODO_TEXT: 'No to-dos right now', CARD_TOP: 36, CARD_WIDTH: 288, CARD_HEIGHT: 218,
  DASHBOARD_LINE_HEIGHT: 27, DETAIL_TITLE_X: 59, DETAIL_TITLE_Y: 23, DETAIL_BODY_Y: 50, DETAIL_EMPTY_Y: 127,
  DETAIL_RECT: { x: 18, y: 10, width: 540, height: 262 },
  page: 'home', selectedSection: 'ai', hudActive: true, appExited: false, hudTransitioning: false,
  animatingNavigation: false, animatingDashboard: false, recording: false, busy: false, transitionTextHidden: false, overlayTyping: false,
  chatScrollLine: 0, chatMessages: messages, chatArchives: [], chatConversationEpoch: 0, newConversationTimer: undefined,
  chatTranscriptSource: null, chatFormattedTranscript: { lines: [], latestTurnStart: 0 },
  surfaceReady: false, surfaceLayout: 'native-home', surfaceCapturesChat: false, surfaceBorderColor: 0, surfaceTiles: [], surfaceText: new Map(),
  hudAnimationEpoch: 0, hudRenderQueue: Promise.resolve(), lastDoubleClickAt: -Infinity, menu: {},
  quoteText: '', quoteRequestID: 0, quoteFetchController: null, quoteFallbackIndex: 0, QUOTE_FALLBACKS: ['Fallback quote'],
  weatherView: 0, WEATHER_TITLES: ['Weather', 'Forecast', 'Conditions', 'Environment'],
  settings: { temperatureUnit: 'celsius', apiKey: 'test-key', model: 'test', chatUrl: 'https://api.example.com/v1/chat/completions' },
  weather: {}, weatherExtras: {}, AI_MAX_PROMPT_CHARS: 4000,
  STORAGE_KEY: 'settings', CHAT_STORAGE_KEY: 'chat', CHAT_ARCHIVE_STORAGE_KEY: 'archive',
  nativeHomeSummary: section => section, showPanel: () => {}, ensureWeatherExtras: async () => {},
  renderWeatherOverlay: (...args) => { phases.push(args[4]); return new Uint8Array(0) },
  detailContainers: current => [new TextContainerProperty({ content: current }), new TextContainerProperty({ content: current === 'info' ? context.quoteText : ' ' })],
  fetchHitokoto: () => new Promise(resolve => requests.push(resolve)),
  persist: (key, value) => stored.set(key, structuredClone(value)),
  byId: id => { if (!widgets.has(id)) widgets.set(id, { value: '', disabled: false }); return widgets.get(id) },
  setStatus: () => {}, renderMessages: () => {}, readSettingsForm: () => context.settings,
  searchWeb: async () => '', normalizeChatUrl: url => url, aiRelayBase: () => '',
  buildChatPayload: (_model, _url, history) => ({ messages: history }),
  requestAiApi: () => new Promise(resolve => { providerReply = resolve }),
  reportAiError: error => { throw error },
  bridge: {
    rebuildPageContainer: async payload => {
      assert.equal(validateEvenHubPageContainer(payload.toJson()).valid, true)
      assert.ok(payload.textObject.every(container => Buffer.byteLength(container.content ?? '') <= 999))
      payloads.push(payload); return true
    },
    textContainerUpgrade: async upgrade => {
      assert.ok(Buffer.byteLength(upgrade.content ?? '') <= 999)
      upgrades.push(upgrade); return true
    },
  },
  renderHud: () => {
    const task = context.queueHudRender(async () => {
      await context.ensureSurfaceLayout(surface.surfaceLayoutForPage(context.page, true, true), context.page)
      await context.updateSurfaceText(context.page)
    })
    renders.push(task); return task
  },
})
vm.runInContext(ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
async function settled() { await Promise.all(renders); await context.hudRenderQueue; await new Promise(resolve => setTimeout(resolve, 0)) }

context.routeEvent(OsEventTypeList.CLICK_EVENT)
await settled()
assert.equal(context.page, 'chat')
assert.equal(payloads.at(-1).textObject.find(c => c.containerName === 'page-body').isEventCapture, 0)
assert.equal(payloads.at(-1).textObject.find(c => c.containerName === 'hud-input').isEventCapture, 1)
assert.ok(!payloads.at(-1).textObject.find(c => c.containerName === 'page-title').content.includes('1/'))
while (context.chatScrollLine > 0) { context.routeEvent(OsEventTypeList.SCROLL_TOP_EVENT); await settled() }
assert.equal(context.chatScrollLine, 0)
const seen = new Set()
const max = display.chatScrollWindow(transcript.lines, 0).maxOffset
do {
  for (let i = context.chatScrollLine; i < Math.min(transcript.lines.length, context.chatScrollLine + display.CHAT_VISIBLE_LINES); i++) seen.add(i)
  if (context.chatScrollLine === max) break
  context.routeEvent(OsEventTypeList.SCROLL_BOTTOM_EVENT)
  await settled()
} while (true)
assert.equal(seen.size, transcript.lines.length, 'up/down must expose all lines of a long answer without clicking')
assert.ok(upgrades.at(-1).content.includes('- Last answer'))
assert.equal(payloads.length, 1, 'scrolling must not rebuild the page')

// Double click cancels any preceding single-click action and preserves this chat.
context.routeEvent(OsEventTypeList.CLICK_EVENT)
context.routeEvent(OsEventTypeList.DOUBLE_CLICK_EVENT)
await new Promise(resolve => setTimeout(resolve, 400))
assert.equal(context.page, 'home')
assert.equal(context.chatMessages.length, messages.length)
assert.equal(context.chatArchives.length, 0)
context.setPage('chat'); await settled()
context.routeEvent(OsEventTypeList.CLICK_EVENT)
await new Promise(resolve => setTimeout(resolve, 400))
assert.equal(context.chatMessages.length, 0)
assert.equal(context.chatArchives.length, 1)
assert.deepEqual(stored.get('archive')[0].messages, messages)
assert.equal(context.chatScrollLine, 0)

// A reply belonging to the old conversation must never land in a new one.
const pending = context.sendChat('Old pending question')
await settled()
assert.equal(typeof providerReply, 'function')
context.startNewConversation()
providerReply({ choices: [{ message: { content: 'Late old answer' } }] })
await pending
assert.equal(context.chatMessages.length, 0)
assert.equal(context.busy, false)

context.setPage('weather'); await settled()
await context.moveWeatherPage(1); assert.equal(context.weatherView, 1)
await context.moveWeatherPage(1); assert.equal(context.weatherView, 2)
await context.moveWeatherPage(1); assert.equal(context.weatherView, 3)
await context.moveWeatherPage(1); assert.equal(context.weatherView, 3)
await context.moveWeatherPage(-1); assert.equal(context.weatherView, 2)
assert.equal(context.animatingNavigation, false)
context.weatherOverlay(); context.weatherOverlay()
assert.deepEqual(phases, [0, 0])

context.setPage('info'); assert.equal(requests.length, 1)
context.setPage('info'); assert.equal(requests.length, 1)
context.setPage('home'); context.setPage('info'); assert.equal(requests.length, 2)
requests[1]('The second entry quote.'); await settled()
assert.equal(context.quoteText, 'The second entry quote.')
requests[0]('A stale first entry quote.'); await settled()
assert.equal(context.quoteText, 'The second entry quote.')
console.log('Detail checks passed: chronological Q/A and turn spacing, all CJK/emoji lines reachable by swipes, byte limits, no scroll rebuilds, new-chat archive, double-click guard, stale reply isolation, static weather and entry-only quotes.')
