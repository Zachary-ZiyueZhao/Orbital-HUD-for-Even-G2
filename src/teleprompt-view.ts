import type { TelepromptDocument } from './teleprompt'

export type PromptMotion = 'soft' | 'calm' | 'instant'
export type PromptReadingRow = { line: number | null; text: string; marker: boolean; level: number }
export type PromptReadingFrame = { line: number; recognized: number; rows: PromptReadingRow[]; moving: boolean }
type ViewOptions = { document: TelepromptDocument; allowed: () => boolean; render: () => Promise<void> }

// Recognition keeps its actual position. Presentation hands that position over
// at a readable pace, with one native-text line per step and no bitmap frames.
export class TelepromptReadingView {
  motion: PromptMotion = 'soft'
  private line = 0
  private revision = -1
  private phase: 'idle' | 'lead' | 'settle' = 'idle'
  private generation = 0
  private worker: Promise<void> | null = null
  private timer: number | undefined
  private wake: (() => void) | undefined

  constructor(private options: ViewOptions) {}

  setMotion(value: string) {
    const motion: PromptMotion = value === 'calm' || value === 'instant' ? value : 'soft'
    if (this.motion === motion) return
    this.suspend(); this.motion = motion
    if (motion === 'instant') this.line = this.options.document.cursor
  }

  private refreshRevision() {
    if (this.revision === this.options.document.revision) return
    this.suspend()
    this.revision = this.options.document.revision
    this.line = this.options.document.cursor
  }

  get frame(): PromptReadingFrame {
    this.refreshRevision()
    const doc = this.options.document
    const line = this.motion === 'instant' ? doc.cursor : this.line
    const levels = [this.phase === 'settle' ? 2 : 1, this.phase === 'lead' ? 3 : 4,
      this.phase === 'lead' ? 4 : 3, 3, 3, 3, 3]
    const rows = Array.from({ length: 7 }, (_, index) => {
      const id = line + index - 1
      return { line: id >= 0 && id < doc.lines.length ? id : null,
        text: doc.lines[id] || ' ', marker: index === 1 && Boolean(doc.lines.length), level: levels[index] }
    })
    if (!doc.lines.length) {
      rows[1].text = 'Add a script on your phone'
      rows[2].text = 'STUDY > Teleprompt'
      rows[3].text = 'Type text or import TXT'
    }
    return { line, recognized: doc.cursor, rows, moving: this.phase !== 'idle' || line < doc.cursor }
  }

  // Used for manual swipes/restart. They remain immediate and invalidate any
  // visual handoff from the old position without restarting the microphone.
  sync() {
    this.refreshRevision()
    if (!this.options.allowed()) { this.suspend(); return }
    if (this.motion === 'instant') { this.line = this.options.document.cursor; return }
    if (this.worker || this.line >= this.options.document.cursor) return
    const generation = this.generation
    const work = this.run(generation)
    this.worker = work
    void work.catch(error => console.error('Teleprompt transition failed', error)).finally(() => {
      if (this.worker !== work) return
      this.worker = null
      // A manual anchor may have cancelled an older worker while a fresh
      // recognition result arrived. Start only from the newest revision.
      if (generation !== this.generation && this.options.allowed()) this.sync()
    })
  }

  suspend() {
    this.generation++
    this.phase = 'idle'
    if (this.timer !== undefined) window.clearTimeout(this.timer)
    this.timer = undefined
    this.wake?.(); this.wake = undefined
  }

  private current(generation: number) {
    return generation === this.generation && this.revision === this.options.document.revision
      && this.options.allowed() && this.motion !== 'instant'
  }

  private wait(ms: number) {
    if (ms <= 0) return Promise.resolve()
    return new Promise<void>(resolve => {
      this.wake = resolve
      this.timer = window.setTimeout(() => { this.timer = undefined; this.wake = undefined; resolve() }, ms)
    })
  }

  private async run(generation: number) {
    while (this.current(generation) && this.line < this.options.document.cursor) {
      const started = performance.now(), duration = this.motion === 'calm' ? 480 : 320
      // Keep the > in the same screen location. Preview the incoming line by
      // brightness first, then retain its brightness as it enters that focus.
      this.phase = 'lead'
      await this.options.render()
      if (!this.current(generation)) return
      await this.wait(Math.max(40, duration * .38 - (performance.now() - started)))
      if (!this.current(generation)) return
      this.line++
      this.phase = 'settle'
      await this.options.render()
      if (!this.current(generation)) return
      await this.wait(Math.max(40, duration * .75 - (performance.now() - started)))
      if (!this.current(generation)) return
      this.phase = 'idle'
      await this.options.render()
      if (!this.current(generation)) return
      await this.wait(Math.max(40, duration - (performance.now() - started)))
    }
  }
}
