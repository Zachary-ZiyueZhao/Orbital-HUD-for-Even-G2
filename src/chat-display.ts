export const CHAT_VISIBLE_LINES = 7
const CHAT_LINE_BYTES = 128

export type DisplayMessage = { role: 'user' | 'assistant'; content: string }

// Bound each visual line as well as its width. Seven native rows then fit
// the 999-byte text limit, including CJK/emoji and newline separators.
export function formatChatTranscript(messages: readonly DisplayMessage[], measure: (text: string) => number) {
  const encoder = new TextEncoder()
  const lines: string[] = []
  let latestTurnStart = 0
  for (const message of messages) {
    if (message.role === 'user') {
      if (lines.length) lines.push('')
      latestTurnStart = lines.length
    }
    const content = message.content.replace(/https?:\/\/\S+/g, '[link]').replace(/\r/g, '')
      .replace(/[\t ]+/g, ' ').trim()
    const paragraphs = `${message.role === 'user' ? '> ' : '- '}${content}`.split('\n')
    for (let remaining of paragraphs) {
      if (!remaining) { lines.push(''); continue }
      while (remaining) {
        let line = '', size = 0
        for (const character of remaining) {
          const bytes = encoder.encode(character).length
          if (size + bytes > CHAT_LINE_BYTES || measure(line + character) > 500) break
          line += character; size += bytes
        }
        if (!line) line = [...remaining][0]
        if (line.length < remaining.length) {
          const wordBreak = line.lastIndexOf(' ')
          if (wordBreak > line.length / 2) line = line.slice(0, wordBreak)
        }
        lines.push(line)
        remaining = remaining.slice(line.length).trimStart()
      }
    }
  }
  return { lines: lines.length ? lines : ['Start a new conversation.', 'Hold to speak, or type on your phone.'], latestTurnStart }
}

export function chatScrollWindow(lines: readonly string[], offset: number) {
  const maxOffset = Math.max(0, lines.length - CHAT_VISIBLE_LINES)
  const start = Math.max(0, Math.min(offset, maxOffset))
  return { start, maxOffset, content: lines.slice(start, start + CHAT_VISIBLE_LINES).join('\n') || ' ' }
}
