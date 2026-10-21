import { alignPromptSpeech, speechHasWords, transcribePrompt, type FollowApiSettings } from './teleprompt-api'
import { PromptWordTracker } from './teleprompt-match'
import { PromptRealtime, type LiveTranscript } from './teleprompt-realtime'
import type { PromptSnapshot, TelepromptDocument } from './teleprompt'

type AudioSegment = { chunks: Uint8Array[]; revision: number; capturedAt: number }
type MatchJob = { speech: string; previous: string; snapshot: PromptSnapshot; capturedAt: number; order: number }
type FollowOptions = { document: TelepromptDocument; microphone: (open: boolean) => Promise<boolean>;
  allowed: () => boolean; changed: () => void; observed: () => void }

export class TelepromptFollower {
  active = false
  status = 'Manual / microphone off'
  diagnostics = ''
  heard = ''
  sensitivity = .006
  private generation = 0
  private timer: number | undefined
  private controller: AbortController | null = null
  private connectionController: AbortController | null = null
  private semanticController: AbortController | null = null
  private live: PromptRealtime | null = null
  private realtime = false
  private recognizing = false
  private matching = false
  private semanticAvailable = true
  private matchJob: MatchJob | null = null
  private pending: AudioSegment[] = []
  private chunks: Uint8Array[] = []
  private preRoll: Uint8Array[] = []
  private byteCount = 0
  private voicedMs = 0
  private silenceMs = 0
  private lastFrameAt = 0
  private lastVoiceAt = 0
  private previousSpeech = ''
  private shortSpeech = { text: '', at: 0 }
  private settings: FollowApiSettings | null = null
  private oddByte: number | null = null
  private lastOrder = 0
  private lastPositionOrder = 0
  private httpOrder = 0
  private observedAt = 0
  private recognitionMs = 0
  private timedItem = ''
  private matchInfo = ''
  private semanticError = ''
  private wordTracker = new PromptWordTracker()
  private speechSequence = 0
  private semanticQueuedAt = 0
  private semanticQueuedText = ''
  private partialUpdates = 0
  private finalUpdates = 0
  private frameMs = 0
  constructor(private options: FollowOptions) {}
  private get continuousLive() { return this.realtime && this.settings?.telepromptModel === 'gpt-live-transcribe' }
  private update(status: string) {
    if (this.status === status) return
    this.status = status
    this.options.changed()
  }
  private observe(text = this.heard, force = false) {
    this.heard = text
    const timing = this.heard ? `${this.realtime ? 'first text' : 'request → text'} ${(this.recognitionMs / 1000).toFixed(1)}s` : 'waiting for text'
    this.diagnostics = `${this.realtime ? 'Realtime' : 'HTTP'} / ${this.realtime ? this.settings?.telepromptModel : this.settings?.transcriptionModel} / PCM frame ${Math.round(this.frameMs)}ms / ${timing}${this.realtime ? ` / partials ${this.partialUpdates}, finals ${this.finalUpdates}` : ''}${this.matchInfo ? ` / ${this.matchInfo}` : ''}${this.semanticError ? ` / ${this.semanticError}` : ''}`
    // Phone-only diagnostics must not enqueue a glasses refresh for every delta.
    if (force || Date.now() - this.observedAt >= 160) { this.observedAt = Date.now(); this.options.observed() }
  }
  private resetBuffer() {
    this.chunks = []; this.preRoll = []; this.byteCount = 0
    this.voicedMs = 0; this.silenceMs = 0; this.oddByte = null
  }
  private invalidate() {
    ++this.generation
    this.controller?.abort(); this.controller = null
    this.semanticController?.abort(); this.semanticController = null
    this.connectionController?.abort(); this.connectionController = null
    this.live?.close(); this.live = null
    this.pending = []; this.matchJob = null; this.resetBuffer()
    this.previousSpeech = ''; this.shortSpeech = { text: '', at: 0 }
    this.lastOrder = 0; this.lastPositionOrder = 0; this.httpOrder = 0
    this.timedItem = ''
    this.wordTracker.reset(); this.speechSequence = 0
    this.semanticQueuedAt = 0; this.semanticQueuedText = ''
    this.partialUpdates = 0; this.finalUpdates = 0
    this.frameMs = 0
  }
  private async connectLive(generation: number) {
    if (!this.settings) return
    this.update('Connecting realtime transcription…')
    const controller = new AbortController()
    this.connectionController = controller
    const live = new PromptRealtime({
      transcript: value => {
        if (this.active && generation === this.generation && this.options.allowed()) this.acceptLive(value)
      },
      failed: message => { if (generation === this.generation && this.active) void this.stop(message) },
    })
    this.live = live
    await live.connect(this.settings, controller.signal)
    if (generation !== this.generation || !this.active) { live.close(); return }
    this.update('Listening / realtime')
  }
  async start(settings: FollowApiSettings) {
    if (this.active) return
    if (!this.options.allowed()) throw new Error('Open Teleprompt on the glasses before starting follow.')
    this.settings = { ...settings }
    const official = new URL(settings.transcriptionUrl).origin === 'https://api.openai.com'
    this.realtime = settings.telepromptTransport === 'realtime' || (settings.telepromptTransport === 'auto' && official)
    if (!this.realtime && official) this.settings.transcriptionModel = settings.telepromptModel === 'gpt-live-transcribe' ? 'gpt-4o-mini-transcribe' : settings.telepromptModel
    this.active = true
    this.invalidate()
    const generation = this.generation
    this.semanticAvailable = true; this.semanticError = ''; this.heard = ''; this.matchInfo = ''; this.recognitionMs = 0
    try {
      if (this.realtime) await this.connectLive(generation)
      if (!this.active || generation !== this.generation) return
      this.update('Starting microphone…')
      const opened = await this.options.microphone(true)
      if (generation !== this.generation || !this.active) return
      if (!opened || !this.options.allowed()) {
        await this.stop(opened ? 'Paused' : 'Microphone unavailable. Check glasses and microphone permission.'); return
      }
      this.lastFrameAt = Date.now(); this.lastVoiceAt = 0
      this.update(this.realtime ? 'Listening / realtime' : 'Listening / HTTP compatibility')
      this.observe('', true)
      this.timer = window.setInterval(() => {
        if (!this.options.allowed()) { void this.stop('Paused / microphone off'); return }
        if (Date.now() - this.lastFrameAt > 10_000) { void this.stop('No microphone audio. Check the connection, then resume.'); return }
        if (this.voicedMs >= 120 && Date.now() - this.lastVoiceAt >= 220) this.emitSegment(false)
      }, 80)
    } catch (error) {
      if (generation !== this.generation || !this.active) return
      const message = error instanceof Error ? error.message : 'Could not start voice follow.'
      await this.stop(message)
      throw new Error(message)
    }
  }
  async stop(status = 'Paused / microphone off') {
    const wasActive = this.active
    this.active = false
    this.invalidate()
    const generation = this.generation
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
    this.update(status)
    if (wasActive) {
      try {
        const stopped = await this.options.microphone(false)
        if (!stopped && generation === this.generation) this.update('Microphone stop not confirmed. Check the host app.')
      } catch {
        if (generation === this.generation) this.update('Microphone stop not confirmed. Check the host app.')
      }
    }
  }
  reanchor() {
    this.invalidate()
    if (!this.active) return
    if (this.realtime) {
      // A fresh session prevents late partials from the old viewport from
      // being mistaken for speech at the manually selected new position.
      const generation = this.generation
      void this.connectLive(generation).catch(error => {
        if (generation === this.generation && this.active) void this.stop((error as Error).message)
      })
    } else this.update('Position reset / listening')
  }
  pushAudio(raw: Uint8Array, otherSpeaker = false) {
    if (!this.active) return
    this.lastFrameAt = Date.now()
    let data = new Uint8Array(raw.length + (this.oddByte === null ? 0 : 1))
    let offset = 0
    if (this.oddByte !== null) { data[0] = this.oddByte; offset = 1 }
    data.set(raw, offset)
    this.oddByte = data.length % 2 ? data[data.length - 1] : null
    if (data.length % 2) data = data.slice(0, -1)
    if (!data.length) return
    if (otherSpeaker) data.fill(0)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    let squares = 0, count = 0
    for (let i = 0; i < data.length; i += 8) {
      const sample = view.getInt16(i, true) / 32768
      squares += sample * sample; count++
    }
    const voice = Math.sqrt(squares / Math.max(1, count)) >= this.sensitivity
    const duration = data.length / 32
    this.frameMs = duration
    if (!this.chunks.length && !voice) {
      this.preRoll.push(data)
      while (this.preRoll.reduce((sum, chunk) => sum + chunk.length, 0) > 6400) this.preRoll.shift()
      return
    }
    if (!this.chunks.length) {
      this.chunks.push(...this.preRoll)
      this.byteCount = this.preRoll.reduce((sum, chunk) => sum + chunk.length, 0)
      if (this.realtime) for (const chunk of this.preRoll) this.live?.push(chunk, false, this.options.document.revision)
      this.preRoll = []
    }
    this.chunks.push(data); this.byteCount += data.length
    if (voice) { this.voicedMs += duration; this.silenceMs = 0; this.lastVoiceAt = Date.now() }
    else this.silenceMs += duration
    if (this.realtime) this.live?.push(data, voice, this.options.document.revision)
    // Live transcription does not require a commit before producing text.
    // Keep continuous context rather than splitting it every two seconds.
    // Committed-turn models get shorter chunks; these still incur API delay.
    const maxSeconds = this.continuousLive ? 6 : this.realtime ? .9 : 1.2
    if (this.voicedMs >= 120 && (this.byteCount >= maxSeconds * 32000 || this.silenceMs >= 220)) this.emitSegment(voice)
    else if (this.byteCount > (maxSeconds + 1) * 32000) this.emitSegment(false)
  }
  private emitSegment(continuous: boolean) {
    if (!this.active || !this.chunks.length) return
    const chunks = this.chunks, voiced = this.voicedMs >= 120
    const segment = { chunks, revision: this.options.document.revision, capturedAt: Date.now() }
    this.chunks = []; this.byteCount = 0; this.voicedMs = 0; this.silenceMs = 0; this.preRoll = []
    if (this.realtime) { this.live?.commit(); return }
    if (!voiced) return
    if (continuous) {
      let bytes = 0
      for (let i = chunks.length - 1; i >= 0 && bytes < 6400; i--) {
        const tail = chunks[i].slice(-Math.min(chunks[i].length, 6400 - bytes))
        this.preRoll.unshift(tail); bytes += tail.length
      }
    }
    // Keep the newest pending segment; never build an eight-second backlog.
    this.pending = [segment]
    void this.drain()
  }
  private acceptLive(value: LiveTranscript) {
    if (value.revision !== this.options.document.revision || value.order < this.lastOrder || Date.now() - value.lastAudioAt > 8000) return
    this.lastOrder = value.order
    if (value.final) this.finalUpdates++
    else this.partialUpdates++
    if (this.timedItem !== value.item) {
      this.timedItem = value.item
      this.recognitionMs = Date.now() - value.capturedAt
    }
    this.acceptSpeech(value.text, value.final, value.lastAudioAt, value.order)
  }
  private acceptSpeech(text: string, final: boolean, capturedAt: number, order: number) {
    if (!text.trim()) return
    const sequence = ++this.speechSequence
    const snapshot = this.options.document.snapshot(), started = performance.now()
    // Do this BEFORE the semantic minimum-word gate. A confirmed position
    // plus one new unambiguous word is enough to follow across a line break.
    const local = this.wordTracker.align(text, snapshot, order, final)
    if (local !== null) {
      this.matchInfo = `${local.method} / ${Math.max(1, Math.round(performance.now() - started))}ms`
      this.lastPositionOrder = sequence
      this.matchJob = null; this.semanticController?.abort()
      if (this.options.document.advance(local.line, snapshot.revision)) this.options.changed()
    } else this.matchInfo = 'waiting for an unambiguous word'
    let speech = text.trim()
    if (this.shortSpeech.text && Date.now() - this.shortSpeech.at < 5000) speech = `${this.shortSpeech.text} ${speech}`.slice(-1600)
    if (!speechHasWords(speech)) {
      if (final) this.shortSpeech = { text: speech, at: Date.now() }
      this.observe(text, final); return
    }
    if (local === null && this.semanticAvailable && speech !== this.semanticQueuedText
      && (final || Date.now() - this.semanticQueuedAt >= 900)) {
      this.semanticQueuedAt = Date.now(); this.semanticQueuedText = speech
      this.matchJob = { speech, previous: this.previousSpeech, snapshot, capturedAt, order: sequence }
      void this.matchSemantic()
    }
    this.observe(text, final)
    if (final) {
      this.shortSpeech = { text: '', at: 0 }
      this.previousSpeech = `${this.previousSpeech} ${speech}`.slice(-800)
    }
  }
  private async matchSemantic() {
    if (this.matching || !this.active || !this.settings || !this.matchJob || !this.semanticAvailable) return
    const job = this.matchJob; this.matchJob = null
    if (job.snapshot.revision !== this.options.document.revision || Date.now() - job.capturedAt > 8000) return
    this.matching = true
    const generation = this.generation, controller = new AbortController(), started = performance.now()
    this.semanticController = controller
    const current = () => this.active && generation === this.generation && !controller.signal.aborted
      && this.options.allowed() && job.snapshot.revision === this.options.document.revision
    try {
      const line = await alignPromptSpeech(job.speech, job.previous, job.snapshot, this.settings, controller.signal)
      if (!current() || job.order < this.lastPositionOrder || Date.now() - job.capturedAt > 8000) return
      this.matchInfo = `AI match ${((performance.now() - started) / 1000).toFixed(1)}s`
      if (line !== null && this.options.document.advance(line, job.snapshot.revision)) {
        this.lastPositionOrder = job.order; this.wordTracker.reset(); this.options.changed()
      }
      this.observe(this.heard, true)
    } catch (error) {
      if (current()) {
        // Semantic failure does not stop low-latency literal following.
        this.semanticAvailable = false
        this.semanticError = `AI matching paused: ${(error as Error).message}`
        this.observe(this.heard, true)
      }
    } finally {
      if (this.semanticController === controller) this.semanticController = null
      this.matching = false
      if (this.active && this.matchJob) void this.matchSemantic()
    }
  }
  private async drain() {
    if (this.recognizing || !this.active || !this.settings) return
    const segment = this.pending.shift()
    if (!segment) return
    if (segment.revision !== this.options.document.revision || Date.now() - segment.capturedAt > 5000) { void this.drain(); return }
    this.recognizing = true
    const generation = this.generation, controller = new AbortController(), started = performance.now()
    this.controller = controller
    const current = () => this.active && generation === this.generation && !controller.signal.aborted
      && segment.revision === this.options.document.revision && this.options.allowed()
    try {
      const speech = await transcribePrompt(segment.chunks, this.settings, controller.signal)
      if (!current()) return
      this.recognitionMs = performance.now() - started
      if (Date.now() - segment.capturedAt <= 8000) this.acceptSpeech(speech, true, segment.capturedAt, ++this.httpOrder)
    } catch (error) {
      if (current()) await this.stop(error instanceof Error ? error.message : 'Recognition failed. Try resuming.')
    } finally {
      if (this.controller === controller) this.controller = null
      this.recognizing = false
      if (this.active && this.pending.length) void this.drain()
    }
  }
}
