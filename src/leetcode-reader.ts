import { safeProblemImage, type DailyProblem } from './leetcode-data'

export const READER_ROWS = 7
export const READER_LINE_HEIGHT = 27
export const READER_BODY = { x: 31, y: 50, width: 514, height: READER_ROWS * READER_LINE_HEIGHT }
export type ReaderImage = { url: string | null; alt: string; start: number; rows: number }
export type ReaderDocument = { lines: string[]; images: ReaderImage[] }
type Block = { text: string } | { url: string | null; alt: string }

export function compactStatementText(value: string) {
  const lines = value.replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n').map(line => line.trimEnd())
  const compact: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      const previous = compact.at(-1) ?? ''
      let next = i + 1
      while (next < lines.length && !lines[next].trim()) next++
      if (!previous || next === lines.length || /^(?:Example\s+\d+\s*:|Constraints\s*:|Follow[ -]?up\s*:)/i.test(previous.trim())
        || (/^(?:- |\d+\. )/.test(previous.trimStart()) && /^(?:- |\d+\. )/.test(lines[next].trimStart()))) continue
      compact.push('')
    } else compact.push(line)
  }
  return compact.join('\n').trim()
}

// Parse inert HTML into text and image positions. Never insert remote HTML in
// the application DOM. Preserve mathematical indices, powers, examples/tables.
export function statementBlocks(html: string): Block[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  const blocks: Block[] = []
  let text = ''
  const newline = (count = 1) => {
    if (!text.trim()) return
    const trailing = (text.match(/\n[\s]*$/)?.[0].match(/\n/g) ?? []).length
    text = text.trimEnd() + '\n'.repeat(Math.max(trailing, count))
  }
  const flush = () => { const content = compactStatementText(text); if (content) blocks.push({ text: content }); text = '' }
  const visit = (node: Node, pre = false) => {
    if (node.nodeType === 3) {
      const value = node.textContent ?? ''
      if (!pre && !value.trim() && (!text || text.endsWith('\n'))) return
      text += pre ? value : value.replace(/\s+/g, ' ')
      return
    }
    if (node.nodeType !== 1) return
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    if (['script', 'style', 'noscript', 'iframe', 'object', 'form', 'button', 'input'].includes(tag)) return
    if (tag === 'img') {
      flush()
      blocks.push({ url: safeProblemImage(element.getAttribute('src') ?? ''), alt: element.getAttribute('alt')?.trim() || 'Problem diagram' })
      return
    }
    if (tag === 'svg') { newline(); text += '[Diagram: open original on phone]'; newline(); return }
    if (tag === 'br') { text += '\n'; return }
    const block = ['p', 'div', 'pre', 'ul', 'ol', 'li', 'tr', 'table', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)
    const listParagraph = tag === 'p' && element.parentElement?.tagName === 'LI'
    const spacing = !listParagraph && ['p', 'pre', 'table', 'blockquote'].includes(tag) ? 2 : 1
    if (block && !(listParagraph && !element.previousElementSibling)) newline(spacing)
    if (tag === 'li') {
      const parent = element.parentElement
      text += parent?.tagName === 'OL' ? `${Array.from(parent.children).indexOf(element) + 1}. ` : '- '
    }
    if ((tag === 'td' || tag === 'th') && element.previousElementSibling) text += ' | '
    if (tag === 'sup' || tag === 'sub') {
      const value = element.textContent?.trim() ?? ''
      text += `${tag === 'sup' ? '^' : '_'}${value.length > 1 ? `(${value})` : value}`
    } else if (tag === 'math' && element.getAttribute('alttext')) text += element.getAttribute('alttext')
    else for (const child of element.childNodes) visit(child, pre || tag === 'pre')
    if (block) newline(spacing)
  }
  for (const child of root.childNodes) visit(child)
  flush()
  return blocks
}

export function wrapReaderText(text: string, measure: (value: string) => number): string[] {
  const encoder = new TextEncoder()
  const lines: string[] = []
  for (let remaining of text.replace(/\r/g, '').replace(/\t/g, '    ').replace(/\u00a0/g, ' ').split('\n')) {
    remaining = remaining.trimEnd()
    if (!remaining) { if (lines.length && lines.at(-1) !== '') lines.push(''); continue }
    while (remaining) {
      let line = '', bytes = 0
      for (const character of remaining) {
        const size = encoder.encode(character).length
        if (bytes + size > 128 || measure(line + character) > 500) break
        line += character; bytes += size
      }
      if (!line) line = [...remaining][0]
      if (line.length < remaining.length) {
        const space = line.lastIndexOf(' ')
        if (space > line.length / 2) line = line.slice(0, space)
      }
      lines.push(line)
      remaining = remaining.slice(line.length).trimStart()
    }
  }
  return lines
}

export function buildReaderDocument(problem: DailyProblem, measure: (value: string) => number): ReaderDocument {
  const lines: string[] = []
  const images: ReaderImage[] = []
  for (const block of statementBlocks(problem.html)) {
    if ('text' in block) lines.push(...wrapReaderText(block.text, measure), '')
    else {
      // The statement keeps a compact reference; actual pictures are opened
      // in a dedicated viewer, so loading cannot shift or obscure the text.
      images.push({ ...block, start: lines.length, rows: 1 })
      lines.push(`[Image ${images.length} - tap to view]`, '')
    }
  }
  while (lines.at(-1) === '') lines.pop()
  if (lines.length) lines.push('')
  const count = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US')
  lines.push(...wrapReaderText([
    `Difficulty: ${problem.difficulty ?? 'Unavailable'}`,
    `Accepted submissions: ${count(problem.accepted)}`,
    `Total submissions: ${count(problem.submissions)}`,
    `Acceptance rate: ${problem.acceptanceRate === null ? 'Unavailable' : `${problem.acceptanceRate.toFixed(1)}%`}`,
  ].join('\n'), measure))
  return { lines: lines.length ? lines : ['Statement unavailable.'], images }
}

export function readerWindow(document: ReaderDocument, offset: number) {
  const maxOffset = Math.max(0, document.lines.length - READER_ROWS)
  const start = Math.max(0, Math.min(Number.isNaN(offset) ? 0 : Math.floor(offset), maxOffset))
  return { start, maxOffset, lines: document.lines.slice(start, start + READER_ROWS),
    images: document.images.filter(image => image.start + image.rows > start && image.start < start + READER_ROWS) }
}
