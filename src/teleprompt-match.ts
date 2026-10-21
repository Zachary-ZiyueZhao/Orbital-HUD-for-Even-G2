import type { PromptSnapshot } from './teleprompt'

type Position = { line: number; word: number }
type ScriptToken = Position & { text: string }
export type PromptWordMatch = Position & { method: 'word tracking' | 'phrase match' }

function tokens(text: string) {
  return text.normalize('NFKC').toLowerCase().match(/\p{Script=Han}|[\p{L}\p{N}]+/gu) ?? []
}

// Match a suffix of actual speech against nearby script tokens. The script is
// never supplied to ASR. Ambiguous/repeated phrases fall back to semantic AI.
function matchPhrase(speech: string, snapshot: PromptSnapshot): Position | null {
  const spoken = tokens(speech).slice(-80)
  const chinese = spoken.filter(word => /\p{Script=Han}/u.test(word)).length >= spoken.length / 2
  const minimum = chinese ? 8 : 4
  if (spoken.length < minimum) return null
  const script = snapshot.lines.filter(line => line.id >= snapshot.cursor - 1 && line.id <= Math.max(snapshot.first + 6, snapshot.cursor + 6))
    .flatMap(line => tokens(line.text).map((text, word) => ({ text, line: line.id, word })))
  type Cell = { score: number; matches: number; start: number; steps: number }
  const empty = (): Cell => ({ score: 0, matches: 0, start: 0, steps: 0 })
  let previous: Cell[] = Array.from({ length: script.length + 1 }, empty)
  const candidates: Array<Position & { score: number }> = []
  for (let i = 1; i <= spoken.length; i++) {
    const current: Cell[] = [empty()]
    for (let j = 1; j <= script.length; j++) {
      const same = spoken[i - 1] === script[j - 1].text
      const sources = [
        { cell: previous[j - 1], value: same ? 3 : -3, match: same },
        { cell: previous[j], value: -2, match: false },
        { cell: current[j - 1], value: -2, match: false },
      ]
      const best = sources.reduce((a, b) => a.cell.score + a.value >= b.cell.score + b.value ? a : b)
      const score = best.cell.score + best.value
      const cell = score > 0 ? { score, matches: best.cell.matches + Number(best.match),
        start: best.cell.score ? best.cell.start : i - 1, steps: best.cell.steps + 1 } : empty()
      current.push(cell)
      // Require the current suffix, enough literal evidence, and a strong
      // ordered match. A common word at the start of a future line is insufficient.
      if (i === spoken.length && same && cell.matches >= minimum && cell.matches / cell.steps >= .82
        && spoken.slice(cell.start).join('').length >= (chinese ? 8 : 16)
        && script[j - 1].line >= snapshot.cursor) {
        const line = script[j - 1].line
        const inLine = script.slice(Math.max(0, j - (chinese ? 4 : 2)), j)
        if (inLine.every(token => token.line === line)) candidates.push({ line, word: script[j - 1].word, score })
      }
    }
    previous = current
  }
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (!best || candidates.some(item => item.line !== best.line && item.score >= best.score - 3)) return null
  return { line: best.line, word: best.word }
}

const COMMON_WORDS = new Set('a an the and or but so if as at in on of to for from by with is am are was were be been being it its this that these those i you he she we they my your our their his her me him us them do does did have has had can could will would should may might not no yes then than'.split(' '))
const isHan = (word: string) => /\p{Script=Han}/u.test(word)
const distinctive = (word: string) => !isHan(word) && /\p{L}/u.test(word) && word.length >= 4 && !COMMON_WORDS.has(word)

// Follow an already established word position with incremental ASR text. Short
// updates can move the line immediately; phrase matching is only for recovery.
// Each item replaces its previous partial, so repeated deltas never count as
// extra spoken words and a new audio turn doesn't throw away reading context.
export class PromptWordTracker {
  private revision = -1
  private order = -1
  private history: string[] = []
  private segment: string[] = []
  private position: Position | null = null
  private heardAt = 0

  reset() {
    this.revision = -1; this.order = -1; this.history = []; this.segment = []
    this.position = null; this.heardAt = 0
  }

  align(speech: string, snapshot: PromptSnapshot, order: number, final = false): PromptWordMatch | null {
    if (snapshot.revision !== this.revision) { this.reset(); this.revision = snapshot.revision }
    if (order < this.order) return null
    const words = tokens(speech).slice(-80)
    if (!words.length) return null
    if (Date.now() - this.heardAt > 5000) this.history = []
    else if (order !== this.order) this.history = [...this.history, ...this.segment].slice(-24)
    this.order = order; this.segment = words; this.heardAt = Date.now()
    const spoken = [...this.history, ...words].slice(-80)
    const script: ScriptToken[] = snapshot.lines
      .filter(line => line.id >= snapshot.cursor - 1 && line.id <= Math.max(snapshot.first + 6, snapshot.cursor + 6))
      .flatMap(line => tokens(line.text).map((text, word) => ({ line: line.id, word, text })))
    if (this.position && this.position.line < snapshot.cursor) this.position = null
    // ASR deltas may end inside an English word ("there" → "therefore").
    // If a nearby longer script word shares that prefix, wait for its ending
    // instead of advancing to an exact but premature shorter-word match.
    const last = words.at(-1)!
    if (!final && !isHan(last) && !/[\s\p{P}]$/u.test(speech)
      && script.some(token => token.line >= snapshot.cursor && token.line <= snapshot.cursor + 1
        && token.text.length > last.length && token.text.startsWith(last))) return null
    const fast = this.matchNext(spoken, script, snapshot.cursor)
    const found = fast ?? matchPhrase(spoken.join(' '), snapshot)
    if (!found) return null
    // Partial revisions can correct a word, but must not rewind confirmed
    // progress or reinterpret an old suffix as the start of the current line.
    if (this.position && (found.line < this.position.line
      || found.line === this.position.line && found.word < this.position.word)) return null
    this.position = { line: found.line, word: found.word }
    return { ...found, method: fast ? 'word tracking' : 'phrase match' }
  }

  private matchNext(spoken: string[], script: ScriptToken[], cursor: number): Position | null {
    const anchor = this.position ? script.findIndex(token => token.line === this.position!.line && token.word === this.position!.word) : -1
    const first = anchor >= 0 ? anchor : script.findIndex(token => token.line === cursor)
    if (first < 0) return null
    const candidates: Array<Position & { context: number; distance: number }> = []
    // A single newly heard word may move at most two words from a confirmed
    // anchor. Longer suffixes can recover small omissions, with evidence.
    for (let end = first; end < Math.min(script.length, first + (anchor >= 0 ? 9 : 5)); end++) {
      if (script[end].line < cursor || script[end].line > cursor + 6) continue
      if (anchor < 0 && script[end].line !== cursor) continue
      let context = 0
      while (context < Math.min(12, spoken.length, end + 1)
        && spoken[spoken.length - 1 - context] === script[end - context].text) context++
      if (!context) continue
      const last = spoken.at(-1)!, han = isHan(last), distance = end - first
      if (anchor < 0) {
        // A distinctive word can establish a position in the line selected
        // by the user. Common/short words need an ordered pair (Han: 3 chars).
        if (!(context >= (han ? 3 : 2) || distinctive(last))) continue
      } else if (context === 1) {
        if (distance > 2 || (han || COMMON_WORDS.has(last) || !distinctive(last)) && distance > 1) continue
        if (!/[\p{L}]/u.test(last)) continue // A lone number is ambiguous.
      } else if (distance > context + 2) continue
      candidates.push({ line: script[end].line, word: script[end].word, context, distance })
    }
    candidates.sort((a, b) => b.context - a.context || a.distance - b.distance)
    const best = candidates[0]
    if (!best) return null
    // Repeated suffixes with equal evidence must not jump to a later repeat.
    if (candidates.some(item => item !== best && item.context === best.context
      && (item.line !== best.line || item.word !== best.word))) return null
    return { line: best.line, word: best.word }
  }
}
