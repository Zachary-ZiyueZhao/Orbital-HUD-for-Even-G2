import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import * as sdk from '@evenrealities/even_hub_sdk'
import * as pretext from '@evenrealities/pretext'
import { handleLeetcodeRelay } from '../server/leetcode-relay.mjs'

async function load(path, imports = {}) {
  const code = await readFile(new URL(path, import.meta.url), 'utf8')
  const context = vm.createContext({ exports: {}, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import ${name}`)
  }, URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, fetch, Date })
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context.exports
}
const data = await load('../src/leetcode-data.ts')
const reader = await load('../src/leetcode-reader.ts', { './leetcode-data': data })
const home = await load('../src/home-list.ts')
const surface = await load('../src/hud-surface.ts')
const fixture = { date: '2026-10-19', questionFrontendId: '2089', title: 'A statement', titleSlug: 'a-statement', content: '<p>Text</p>',
  difficulty: 'Easy', stats: JSON.stringify({ totalAcceptedRaw: 300000, totalSubmissionRaw: 400000, acRate: '75.0%' }) }
const normalized = data.normalizeDailyProblem(fixture)
assert.equal(normalized.number, '2089', 'display frontend problem number, never internal questionId')
assert.equal(data.normalizeDailyProblem({ date: fixture.date, question: fixture }).number, '2089', 'independent daily service format')
assert.equal(data.restoreDailyProblem(JSON.stringify(normalized)).slug, normalized.slug)
assert.equal(normalized.accepted, 300000)
assert.equal(normalized.submissions, 400000)
assert.equal(normalized.acceptanceRate, 75)
assert.equal(data.restoreDailyProblem(JSON.stringify(normalized)).accepted, 300000)
assert.equal(data.problemStatistics({ stats: '{broken' }).accepted, null)
assert.equal(data.problemStatistics({ stats: { totalAcceptedRaw: -1, totalSubmissionRaw: '10' }, acRate: 101 }).acceptanceRate, null)
assert.equal(data.problemStatistics({ stats: { totalAcceptedRaw: 1, totalSubmissionRaw: 4 } }).acceptanceRate, 25)
assert.equal(reader.compactStatementText('Paragraph A\n\n\nParagraph B\n\nExample 1:\n\nInput: x\nOutput: y\n\nConstraints:\n\n- a\n\n- b'),
  'Paragraph A\n\nParagraph B\n\nExample 1:\nInput: x\nOutput: y\n\nConstraints:\n- a\n- b')
assert.equal(data.restoreDailyProblem('{bad'), null)
for (const change of [{ date: '2026-02-31' }, { questionFrontendId: 7 }, { titleSlug: '../../x' }, { content: '' }]) {
  assert.throws(() => data.normalizeDailyProblem({ ...fixture, ...change }))
}
for (const url of ['', 'javascript:alert(1)', 'http://assets.leetcode.com/a.png', 'https://assets.leetcode.com.evil.test/a', 'https://user@assets.leetcode.com/a']) assert.equal(data.safeProblemImage(url), null)
assert.equal(data.safeProblemImage('//assets.leetcode.com/uploads/tree.png'), 'https://assets.leetcode.com/uploads/tree.png')
const calls = []
const problem = await data.fetchDailyProblem('/__hud_api', async (url, init) => {
  calls.push([url, init])
  return calls.length === 1 ? new Response('failed', { status: 502 }) : Response.json(fixture)
})
assert.equal(problem.number, '2089')
assert.equal(calls.length, 2)
assert.ok(calls.every(([, init]) => !init.headers && init.credentials === 'omit'), 'no API key or cookies sent to LeetCode')
const detailCalls = []
const enriched = await data.fetchDailyProblem('', async url => {
  detailCalls.push(url)
  return Response.json(url.includes('/problem/') ? { questionFrontendId: '2089', title: fixture.title,
    stats: fixture.stats, difficulty: 'Easy' } : { ...fixture, stats: undefined, acRate: 75 })
})
assert.equal(enriched.accepted, 300000, 'detail service has no titleSlug; match its unique public ID and title')
assert.equal(detailCalls.length, 2)
const mismatched = await data.fetchDailyProblem('', async url => Response.json(url.includes('/problem/')
  ? { ...fixture, questionFrontendId: '1' } : { ...fixture, stats: undefined }))
assert.equal(mismatched.accepted, null, 'never attach another question statistics')
await assert.rejects(data.fetchDailyProblem('', async () => Response.json({ errors: [{}] })), /Invalid daily/)
await assert.rejects(data.fetchDailyProblem('', async () => new Response('Too many requests', { status: 429 })), /rate limited/)
const long = reader.wrapReaderText(('English text 10^5 a_i / 中文 🧑‍💻 ' + 'x'.repeat(1000) + '\n').repeat(10), pretext.getTextWidth)
for (const line of long) { assert.ok(Buffer.byteLength(line) <= 128); assert.ok(pretext.getTextWidth(line) <= 500) }
const document = { lines: long, images: [{ start: 10, rows: 5, url: null, alt: 'diagram' }] }
assert.equal(reader.readerWindow(document, -100).start, 0)
assert.equal(reader.readerWindow(document, Infinity).start, long.length - 7)
const covered = new Set()
for (let offset = 0; offset <= long.length + 7; offset += 2) {
  const window = reader.readerWindow(document, offset)
  window.lines.forEach((_, i) => covered.add(window.start + i))
  assert.ok(Buffer.byteLength(window.lines.join('\n')) <= 999)
}
assert.equal(covered.size, long.length, 'continuous reader must reach every line including the end')

const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true)
const names = new Set(['surfaceContainers', 'surfaceImageContainers', 'leetcodeContainers', 'textCacheKey', 'refreshDailyProblem'])
const source = parsed.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name?.text)).map(s => s.getText(parsed)).join('\n')
const context = vm.createContext({ ...sdk, ...home, ...surface, ...reader, ...pretext, dailyDocument: document,
  dailyProblem: normalized, dailyScroll: 0, leetcodeImageIndex: null, dailyLoading: false, dailyError: '', dailyImages: new Map(),
  ensureDailyImage: () => {}, hudMinimized: false, NATIVE_HOME_TEXT: true, FAST_NATIVE_HOME: true, LEETCODE_IMAGE_TEST: false,
  selectedSection: 'leetcode', nativeHomeSummary: () => 'Daily coding challenge',
  CARD_TOP: 36, CARD_WIDTH: 288, CARD_HEIGHT: 218, DASHBOARD_LINE_HEIGHT: 27, Error })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
for (const page of ['home', 'leetcode']) {
  const texts = context.surfaceContainers(page), images = context.surfaceImageContainers(surface.surfaceLayoutForPage(page, true, true))
  const all = [...texts, ...images]
  const payload = new sdk.CreateStartUpPageContainer({ textObject: texts, imageObject: images, containerTotalNum: all.length })
  assert.equal(sdk.validateEvenHubPageContainer(payload.toJson()).valid, true)
  assert.ok(texts.length <= 8 && images.length <= 4 && all.length <= 12)
  assert.equal(new Set(all.map(c => c.containerID)).size, all.length)
  assert.equal(texts.filter(c => c.isEventCapture === 1).length, 1)
  for (const c of all) {
    assert.ok(c.containerName.length <= 16)
    assert.ok(c.xPosition >= 0 && c.yPosition >= 0 && c.xPosition + c.width <= 576 && c.yPosition + c.height <= 288)
  }
  for (const c of texts) {
    assert.ok(Buffer.byteLength(c.content) <= 999)
    for (const line of c.content.split('\n')) assert.ok(pretext.getTextWidth(line) <= c.width, `${c.containerName} text overflow`)
  }
  for (const c of images) assert.ok(c.width >= 20 && c.width <= 288 && c.height >= 20 && c.height <= 144)
  assert.equal(texts.find(c => c.isEventCapture === 1).content, ' ', 'fixed header must never be a scrollable capture body')
}
const menu = context.surfaceContainers('home')
assert.equal(menu.find(c => c.containerName === 'home-labels').content.split('\n').length, 5)
assert.equal(menu.find(c => c.containerName === 'home-indicators').content, '-\n-\n-\n-\n<')
assert.equal(menu.find(c => c.containerName === 'home-labels').height, 135)
assert.equal(home.homeSelectionStep('todo', 1), 'leetcode')
assert.equal(home.homeSelectionStep('leetcode', 1), 'info')
const title = context.leetcodeContainers()[1].content
for (let offset = 0; offset < document.lines.length; offset += 2) {
  context.dailyScroll = offset
  const containers = context.leetcodeContainers()
  assert.equal(containers[1].content, title, 'header must stay fixed throughout a long statement')
  assert.ok(Buffer.byteLength(containers[2].content) <= 999)
}
Object.assign(context, { dailyLoading: false, dailyRequest: 0, dailyImageEpoch: 0, page: 'leetcode',
  updateDailyPhone: () => {}, renderHud: async () => {}, aiRelayBase: () => '',
  fetchDailyProblem: async () => { throw new Error('Network offline. Tap to retry.') },
  fitPreviewLines: text => reader.wrapReaderText(text, pretext.getTextWidth),
  buildReaderDocument: () => document, readerCacheKey: 'test-cache', localStorage: { setItem: () => {} } })
await context.refreshDailyProblem(true)
assert.equal(context.dailyProblem, normalized, 'network failure must keep the cached question')
assert.match(context.dailyError, /offline/)
assert.equal(context.dailyLoading, false)
context.dailyProblem = null
await context.refreshDailyProblem(true)
assert.match(context.dailyDocument.lines.join('\n'), /Tap to retry/)
assert.equal(context.dailyLoading, false)
context.fetchDailyProblem = async () => normalized
await context.refreshDailyProblem(true)
assert.equal(context.dailyProblem.number, '2089')
assert.equal(context.dailyError, '')
assert.equal(context.dailyScroll, 0)

let upstream = ''
const response = await handleLeetcodeRelay(new Request('https://relay.test/leetcode/daily', { headers: { Authorization: 'Bearer SECRET' } }), {
  fetchImpl: async (url, init) => { upstream = url; assert.equal(new Headers(init.headers).get('authorization'), null); return Response.json({ data: { activeDailyCodingChallengeQuestion: {} } }) },
})
assert.equal(response.status, 200)
assert.equal(response.headers.get('access-control-allow-origin'), '*')
assert.ok(upstream.startsWith('https://leetcode.com/graphql?query='))
for (const url of ['https://evil.test/x', 'https://assets.leetcode.com.evil.test/uploads/x', 'http://assets.leetcode.com/uploads/x', 'https://assets.leetcode.com/other']) {
  const res = await handleLeetcodeRelay(new Request('https://relay.test/leetcode/image?url=' + encodeURIComponent(url)), { fetchImpl: () => { throw new Error('must not connect') } })
  assert.equal(res.status, 400)
}
assert.equal((await handleLeetcodeRelay(new Request('https://relay.test/leetcode/daily', { method: 'POST' }))).status, 405)
assert.equal((await handleLeetcodeRelay(new Request('https://relay.test/leetcode/image?url=https%3A%2F%2Fassets.leetcode.com%2Fuploads%2Ftree.png'), {
  fetchImpl: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
})).status, 415)
console.log('LeetCode data, fallback, cache, reader coverage, SDK budgets, five-row menu and relay checks passed.')
