import { wrapReaderText } from './leetcode-reader'

export const TELEPROMPT_KEY = 'eveng2-hud-teleprompt-v1'
export const TELEPROMPT_MAX_CHARS = 60_000
export type TelepromptScript = { title: string; text: string; language: '' | 'zh' | 'en' }
export type PromptSnapshot = { revision: number; cursor: number; first: number; lines: Array<{ id: number; text: string }> }
export const EMPTY_SCRIPT: TelepromptScript = { title: 'Teleprompt', text: '', language: '' }

export function validateScript(value: TelepromptScript) {
  if (!value.text.trim()) throw new Error('Enter a script or import a .txt file first.')
  if (value.text.length > TELEPROMPT_MAX_CHARS) throw new Error('Keep the script within 60,000 characters.')
  if (value.title.length > 80) throw new Error('Keep the title within 80 characters.')
  if (!['', 'zh', 'en'].includes(value.language)) throw new Error('Choose a supported language.')
}

export function parseScript(raw: string | null): TelepromptScript {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<TelepromptScript> | null
    if (!value || typeof value.text !== 'string' || value.text.length > TELEPROMPT_MAX_CHARS) return { ...EMPTY_SCRIPT }
    return { title: typeof value.title === 'string' ? value.title.slice(0, 80) : 'Teleprompt',
      text: value.text, language: value.language === 'zh' || value.language === 'en' ? value.language : '' }
  } catch { return { ...EMPTY_SCRIPT } }
}

export async function importScriptFile(file: File): Promise<TelepromptScript> {
  if (!/\.txt$/i.test(file.name)) throw new Error('Choose a .txt text file.')
  if (file.size > 512 * 1024) throw new Error('The .txt file must be 512 KB or smaller.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let text = ''
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes)
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes)
    else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes) }
    }
  } catch { throw new Error('Cannot decode this file. Save it as UTF-8 text and import again.') }
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('This file does not look like plain text. Save it as UTF-8 .txt.')
  const script = { title: file.name.replace(/\.txt$/i, '').slice(0, 80), text, language: '' as const }
  validateScript(script)
  return script
}

export class TelepromptDocument {
  script: TelepromptScript = { ...EMPTY_SCRIPT }
  lines: string[] = []
  first = 0
  cursor = 0
  revision = 0
  constructor(private measure: (text: string) => number) {}
  load(script: TelepromptScript) {
    this.script = { ...script }
    const encoder = new TextEncoder()
    this.lines = script.text.trim() ? wrapReaderText(script.text, text => encoder.encode(`> ${text}`).length > 128 ? Infinity : this.measure(`> ${text}`) + 16) : []
    this.first = 0; this.cursor = 0; this.revision++
  }
  // Allow a short final viewport: filling it with old lines would push the
  // reading marker down and violate the one-line context limit near the end.
  get maxFirst() { return Math.max(0, this.lines.length - 1) }
  get visible() { return this.lines.slice(this.first, this.first + 7) }
  manual(direction: -1 | 1, fromCursor = this.cursor) {
    if (!this.lines.length) return false
    const next = Math.max(0, Math.min(this.maxFirst, fromCursor + direction * 2))
    this.first = Math.max(0, next - 1); this.cursor = next; this.revision++
    return true
  }
  restart() { this.first = 0; this.cursor = 0; this.revision++ }
  snapshot(): PromptSnapshot {
    const start = Math.max(0, Math.min(this.first, this.cursor) - 1)
    const end = Math.min(this.lines.length, Math.max(this.first + 8, this.cursor + 7))
    return { revision: this.revision, first: this.first, cursor: this.cursor,
      lines: this.lines.slice(start, end).map((text, index) => ({ id: start + index, text })).filter(line => line.text.trim()) }
  }
  advance(line: number, revision: number) {
    if (revision !== this.revision || !Number.isInteger(line) || line < this.cursor || !this.lines[line]?.trim()
      || line > Math.max(this.cursor + 6, this.first + 6)) return false
    if (line === this.cursor) return false
    this.cursor = line
    this.first = Math.max(0, line - 1)
    return true
  }
}
