import { importScriptFile, validateScript, type TelepromptDocument, type TelepromptScript } from './teleprompt'
import type { PromptMotion, PromptReadingFrame } from './teleprompt-view'

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
type PhoneOptions = { document: TelepromptDocument; save: (script: TelepromptScript) => Promise<boolean>;
  open: () => void; toggle: () => Promise<void>; following: () => boolean; status: () => string;
  diagnostics: () => string; heard: () => string;
  presentation: () => PromptReadingFrame; motion: (value: PromptMotion) => void;
  editing: () => void; sensitivity: (value: number) => void; notify: (message: string) => void }
let options: PhoneOptions | undefined
let importRevision = 0
let committing = false

function draft(): TelepromptScript {
  return { title: el<HTMLInputElement>('tp-title').value.trim() || 'Teleprompt',
    text: el<HTMLTextAreaElement>('tp-text').value.replace(/\r\n?/g, '\n'),
    language: el<HTMLSelectElement>('tp-language').value as TelepromptScript['language'] }
}

export function renderTelepromptPhone() {
  if (!options) return
  const doc = options.document
  el<HTMLElement>('tp-state').textContent = options.status()
  el<HTMLElement>('tp-timing').textContent = options.diagnostics()
  el<HTMLElement>('tp-heard').textContent = options.heard() ? `Heard: ${options.heard()}` : 'Recognized speech appears here.'
  el<HTMLElement>('tp-state').classList.toggle('is-recording', options.following())
  el<HTMLButtonElement>('tp-follow').textContent = options.following() ? 'Pause follow' : 'Start follow'
  el<HTMLButtonElement>('tp-follow').setAttribute('aria-pressed', String(options.following()))
  const frame = options.presentation()
  el<HTMLElement>('tp-position').textContent = doc.lines.length
    ? `Reading ${frame.line + 1} / ${doc.lines.length}${frame.moving ? ' / gentle handoff' : ''}${frame.recognized > frame.line ? ` / recognized ${frame.recognized + 1}` : ''}` : 'No saved script'
  const preview = el<HTMLElement>('tp-preview-body')
  while (preview.children.length < frame.rows.length) {
    const row = document.createElement('span'); row.className = 'tp-preview-row'; preview.append(row)
  }
  frame.rows.forEach((row, index) => {
    const node = preview.children[index] as HTMLElement
    const content = `${row.marker ? '> ' : '  '}${row.text}`
    if (node.textContent !== content) node.textContent = content
    node.dataset.level = String(row.level)
    node.classList.toggle('is-focus', row.marker)
  })
  const edited = draft()
  const dirty = edited.title !== doc.script.title || edited.text !== doc.script.text || edited.language !== doc.script.language
  el<HTMLElement>('tp-draft-status').textContent = `${edited.text.length.toLocaleString()} / 60,000 characters${dirty ? ' / unsaved' : ' / saved'}`
}

export function applyTelepromptScriptToForm() {
  if (!options) return
  el<HTMLInputElement>('tp-title').value = options.document.script.title
  el<HTMLTextAreaElement>('tp-text').value = options.document.script.text
  el<HTMLSelectElement>('tp-language').value = options.document.script.language
  renderTelepromptPhone()
}

async function commit() {
  if (!options || committing) return false
  const script = draft()
  try { validateScript(script) } catch (error) { options.notify((error as Error).message); return false }
  committing = true
  el<HTMLButtonElement>('tp-save').disabled = true
  try { return await options.save(script) }
  finally { committing = false; el<HTMLButtonElement>('tp-save').disabled = false; renderTelepromptPhone() }
}

export function bindTelepromptPhone(callbacks: PhoneOptions) {
  options = callbacks
  applyTelepromptScriptToForm()
  for (const id of ['tp-title', 'tp-text', 'tp-language']) {
    el<HTMLElement>(id).addEventListener('input', () => { importRevision++; callbacks.editing(); renderTelepromptPhone() })
  }
  el<HTMLButtonElement>('tp-save').addEventListener('click', () => void commit())
  el<HTMLButtonElement>('tp-open').addEventListener('click', async () => { if (await commit()) callbacks.open() })
  el<HTMLButtonElement>('tp-follow').addEventListener('click', async () => {
    if (callbacks.following() || await commit()) await callbacks.toggle()
  })
  el<HTMLSelectElement>('tp-sensitivity').addEventListener('change', event => callbacks.sensitivity(Number((event.target as HTMLSelectElement).value)))
  for (const id of ['tp-transport', 'tp-model']) {
    el<HTMLSelectElement>(id).addEventListener('change', () => {
      callbacks.editing()
      callbacks.notify('Voice engine changed. Start follow to apply and save.')
    })
  }
  el<HTMLSelectElement>('tp-motion').addEventListener('change', event => {
    const value = (event.target as HTMLSelectElement).value
    callbacks.motion(value === 'calm' || value === 'instant' ? value : 'soft')
    renderTelepromptPhone()
  })
  el<HTMLButtonElement>('tp-import').addEventListener('click', () => el<HTMLInputElement>('tp-file').click())
  el<HTMLInputElement>('tp-file').addEventListener('change', async event => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const revision = ++importRevision
    callbacks.editing()
    el<HTMLButtonElement>('tp-import').disabled = true
    try {
      const script = await importScriptFile(file)
      if (revision !== importRevision) return
      el<HTMLInputElement>('tp-title').value = script.title
      el<HTMLTextAreaElement>('tp-text').value = script.text
      el<HTMLSelectElement>('tp-language').value = script.language
      showPane('write')
      callbacks.notify('TXT imported. Edit as needed, then save or start follow.')
      renderTelepromptPhone()
    } catch (error) { callbacks.notify((error as Error).message) }
    finally { input.value = ''; el<HTMLButtonElement>('tp-import').disabled = false }
  })
  document.querySelectorAll<HTMLButtonElement>('[data-tp-pane]').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.dataset.tpPane === 'preview' && draft().text.trim() && !await commit()) return
      showPane(button.dataset.tpPane === 'preview' ? 'preview' : 'write')
    })
  })
}

function showPane(pane: 'write' | 'preview') {
  el<HTMLElement>('tp-write-pane').hidden = pane !== 'write'
  el<HTMLElement>('tp-read-pane').hidden = pane !== 'preview'
  document.querySelectorAll<HTMLButtonElement>('[data-tp-pane]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tpPane === pane)))
  renderTelepromptPhone()
}
