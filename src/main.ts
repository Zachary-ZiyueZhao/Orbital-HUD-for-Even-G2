import {
  AppLocationAccuracy,
  AudioInputSource,
  AudioSpeakerRole,
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { getTextWidth, pxTruncate } from '@evenrealities/pretext'
import { DASHBOARD_LINE_HEIGHT, drawDashboardText, supportsDashboardText } from './dashboard-font'
import { DASHBOARD_ICON_SIZE, drawDashboardIcon } from './dashboard-icons'
import { clockTextLayout, drawClockText } from './dashboard-clock'
import { HUD_WIDTH, HUD_HEIGHT, blendLayer, paintFrame, navigationFrame, encodeGrayPng, type NavigationArt } from './hud-motion'
import { HOME_MENU_RECT, HOME_ICON_COLUMN_RECT, HOME_DIVIDER_TEXT, HOME_INDICATOR_RECT, surfaceRects, surfaceTile, surfaceLayoutForPage, type SurfaceLayout } from './hud-surface'
import { HOME_SECTIONS, homeSections, homeSelectionStep, homeSectionLabel, homeNativeIndicators, type HomeSection, type HomeFolder } from './home-list'
import { drawHudRules, INFO_RULES } from './hud-rules'
import { formatChatTranscript, chatScrollWindow } from './chat-display'
import { fetchWeather, fetchWindField, fetchAirQuality, weatherKey, type Weather, type WeatherExtras } from './weather-data'
import { fetchWindBasemap } from './wind-basemap'
import { WEATHER_TITLES, renderWeatherArtwork, drawWeatherSymbol } from './weather-scenes'
import { buildNativeWeatherContainers } from './weather-native'
import { AiApiError, requestAiApi, resolveAiRoute } from './ai-client'
import { AI_MAX_PROMPT_CHARS, buildChatPayload, normalizeApiKey, normalizeChatUrl } from './ai-chat'
import { OPENAI_SEARCH_ENDPOINT, buildOpenAiSearchPayload, parseOpenAiSearchResponse, type AiCitation } from './ai-search'
import { LEETCODE_CACHE_KEY, fetchDailyProblem, restoreDailyProblem, type DailyProblem } from './leetcode-data'
import { READER_BODY, buildReaderDocument, readerWindow, type ReaderDocument } from './leetcode-reader'
import { loadProblemImage, type ProblemImage } from './leetcode-images'
import { parseTodos, mergeNewTodos, todoDueLabel, validTodoDate, validTodoTime, type TodoItem } from './todos'
import { TODO_FUNCTION, todoAiInstructions, todoCallArguments, parseTodoArguments, todoCreationReceipt } from './ai-todos'
import { SCHEDULE_KEY, REMINDER_KEY, WEEKDAYS, parseSchedule, parseReminderLog, upcomingClasses, localDateKey, type ScheduleData, type ClassOccurrence } from './schedule'
import { bindScheduleUi, renderScheduleUi } from './schedule-ui'
import { AlgorithmBrowser } from './algorithms/browser'
import { ALGORITHM_NOTES, algorithmCount } from './algorithms/catalogue'
import { bindAlgorithmPhone, renderAlgorithmPhone } from './algorithms/phone'
import { TELEPROMPT_KEY, TelepromptDocument, parseScript, validateScript, type TelepromptScript } from './teleprompt'
import { TelepromptFollower } from './teleprompt-follow'
import { pcmWav } from './teleprompt-api'
import { bindTelepromptPhone, renderTelepromptPhone } from './teleprompt-phone'
import { TelepromptReadingView, type PromptMotion } from './teleprompt-view'
import './style.css'

type Section = HomeSection
type Page = 'home' | 'weather' | 'info' | 'todo' | 'chat' | 'leetcode' | 'schedule' | 'algorithms' | 'teleprompt'
type Role = 'user' | 'assistant'
type ChatMessage = { role: Role; content: string; citations?: AiCitation[] }
type ChatArchive = { createdAt: string; messages: ChatMessage[] }
type Settings = {
  chatUrl: string
  aiRelayUrl: string
  apiKey: string
  model: string
  transcriptionUrl: string
  transcriptionApiKey: string
  transcriptionModel: string
  telepromptTransport: 'auto' | 'realtime' | 'http'
  telepromptModel: string
  telepromptMotion: PromptMotion
  searchEnabled: boolean
  searchApiKey: string
  city: string
  useDeviceLocation: boolean
  temperatureUnit: 'celsius' | 'fahrenheit'
}
const PIXEL_GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['0', '1', '1', '0', '1', '1', '0'],
  '.': ['0', '0', '0', '0', '0', '1', '1'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '°': ['0110', '1001', '1001', '0110', '0000', '0000', '0000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  h: ['10000', '10000', '11100', '10010', '10010', '10010', '10010'],
  d: ['00010', '00010', '01110', '10010', '10010', '10010', '01110'],
  r: ['00000', '00000', '10110', '11000', '10000', '10000', '10000'],
  y: ['00000', '00000', '10010', '10010', '01110', '00010', '11100'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
}

const STORAGE_KEY = 'eveng2-hud-settings-v1'
const GPS_DEFAULT_KEY = 'eveng2-hud-gps-default-v1'
const CHAT_STORAGE_KEY = 'eveng2-hud-chat-v1'
const CHAT_ARCHIVE_STORAGE_KEY = 'eveng2-hud-chat-archive-v1'
const TODO_STORAGE_KEY = 'eveng2-hud-todos-v1'
const NATIVE_HOME_TEXT = true
const FAST_NATIVE_HOME = import.meta.env.VITE_HOME_MENU_RENDERER !== 'bitmap'
const EMPTY_TODO_TEXT = 'No to-dos right now'
const HITOKOTO_URL = 'https://v1.hitokoto.cn/?lang=en&max_length=90'
const QUOTE_FALLBACKS = [
  'A small step can change the shape of a day.',
  'Keep your eyes open for the quiet details.',
  'Make room for one good thought today.',
]
const CARD_TITLE_INSET = DASHBOARD_ICON_SIZE + 8
const CARD_WIDTH = 288
const CARD_HEIGHT = 218
const CARD_PADDING = 12
const CARD_BORDER = 1
const CARD_TOP = 36
const HEADER_TOP = 10
const CARD_HEADER_HEIGHT = CARD_TOP - HEADER_TOP
const DETAIL_RECT = { x: 18, y: 10, width: 540, height: 262 }
const DETAIL_BODY_Y = 50
const DETAIL_TITLE_X = 59
const DETAIL_TITLE_Y = 23
const DETAIL_ICON_X = 31
const DETAIL_ICON_Y = 27
const DETAIL_EMPTY_Y = Math.floor(DETAIL_RECT.y + (DETAIL_RECT.height - DASHBOARD_LINE_HEIGHT) / 2)
const LEFT_WIDTH = 216
const DEFAULT_SETTINGS: Settings = {
  chatUrl: 'https://api.openai.com/v1/chat/completions',
  aiRelayUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  transcriptionUrl: 'https://api.openai.com/v1/audio/transcriptions',
  transcriptionApiKey: '',
  transcriptionModel: 'whisper-1',
  telepromptTransport: 'auto',
  telepromptModel: 'gpt-live-transcribe',
  telepromptMotion: 'soft',
  searchEnabled: false,
  searchApiKey: '',
  city: 'Toronto',
  useDeviceLocation: true,
  temperatureUnit: 'celsius',
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
applyPhoneTheme(safeJson(localStorage.getItem('orbital-phone-theme'), matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))
const bridge = await waitForEvenAppBridge()
let settings: Settings = { ...DEFAULT_SETTINGS }
let page: Page = 'home'
let selectedSection: Section = 'info'
let homeFolder: HomeFolder = 'root'
let hudActive = true
let appExited = false
let hudTransitioning = false
let hudMinimized = false
let longPressHeld = false
let lastDoubleClickAt = -Infinity
let lastHomeScrollAt = -Infinity
let lastHomeScrollDirection: -1 | 1 | null = null
let lastLeetcodeScrollEventAt = -Infinity
let lastLeetcodeScrollDirection: -1 | 1 | null = null
let lastScrollEventAt = -Infinity
let lastScrollAcceptedAt = -Infinity
let scrollNavigationPending = false
let weather: Weather | null = null
let weatherView = 0
let quoteText = ''
let quoteRequestID = 0
let quoteFetchController: AbortController | null = null
let quoteFallbackIndex = 0
let weatherExtras: WeatherExtras | null = null
const weatherExtraCache = new Map<string, WeatherExtras>()
const weatherExtraRequests = new Set<string>()
let batteryLevel: number | null = null
let connected = false
let recording = false
let animatingDashboard = false
let animatingNavigation = false
let transitionTextHidden = false
let overlayTyping = false
let pendingNavigation: Page | null = null
let hudAnimationEpoch = 0
let hudRefreshPending = false
let hudLayoutPage: Page | 'sleep' | 'minimized' | 'reminder' | null = null
let surfaceReady = false
let surfaceLayout: SurfaceLayout = 'full'
let surfaceCapturesChat = false
let surfaceBorderColor = 0
let surfaceTiles: Array<Uint8Array | null> = Array(4).fill(null)
const surfaceText = new Map<number, string>()
let hudRenderQueue: Promise<void> = Promise.resolve()
let hudRenderWorker: Promise<void> | null = null
let hudRenderVersion = 0
let hudRenderFirst = false
const homeMenuCache = new Map<string, Uint8Array>()
const hudPngCache: Array<{ pixels: Uint8Array; width: number; height: number; png: Promise<Uint8Array> }> = []
let recordingTimer: number | undefined
let weatherTimer: number | undefined
let clockTimer: number | undefined
let audioChunks: Uint8Array[] = []
let chatMessages: ChatMessage[] = []
let chatArchives: ChatArchive[] = []
let chatScrollLine = 0
let chatConversationEpoch = 0
let newConversationTimer: number | undefined
let homeClickTimer: number | undefined
let chatTranscriptSource: ChatMessage[] | null = null
let chatFormattedTranscript: ReturnType<typeof formatChatTranscript> = { lines: [], latestTurnStart: 0 }
let todos: TodoItem[] = []
let selectedTodoIndex = 0
let todoSessionIds: string[] = []
let phoneTab: 'hud' | 'todo' | 'schedule' | 'chat' | 'leetcode' | 'algorithms' | 'teleprompt' | 'settings' = 'hud'
let lastPlannerTab: 'todo' | 'schedule' = 'todo'
let lastStudyTab: 'leetcode' | 'algorithms' | 'teleprompt' = 'leetcode'
const telepromptDocument = new TelepromptDocument(getTextWidth)
let savedTeleprompt = parseScript(localStorage.getItem(TELEPROMPT_KEY))
let microphoneQueue: Promise<unknown> = Promise.resolve()
let telepromptClickTimer: number | undefined
let lastTelepromptScrollAt = -Infinity
let lastTelepromptScrollDirection: -1 | 1 | null = null
let resumeTelepromptAfterReminder = false
const telepromptView = new TelepromptReadingView({ document: telepromptDocument,
  allowed: () => page === 'teleprompt' && hudActive && !hudMinimized && !appExited && !activeReminder && !reminderBusy && !hudTransitioning && connected,
  render: async () => { renderTelepromptPhone(); await renderHud() },
})
const telepromptFollower = new TelepromptFollower({ document: telepromptDocument, microphone: controlGlassesMicrophone,
  allowed: () => page === 'teleprompt' && hudActive && !hudMinimized && !appExited && !activeReminder && !hudTransitioning,
  changed: () => { telepromptView.sync(); renderTelepromptPhone(); updateHudControls(); if (page === 'teleprompt') void renderHud() },
  observed: () => renderTelepromptPhone(),
})
const algorithmBrowser = new AlgorithmBrowser(getTextWidth)
let algorithmClickTimer: number | undefined
let lastAlgorithmScrollAt = -Infinity
let lastAlgorithmScrollDirection: -1 | 1 | null = null
let schedule: ScheduleData = parseSchedule(localStorage.getItem(SCHEDULE_KEY))
let reminderLog = parseReminderLog(localStorage.getItem(REMINDER_KEY))
let activeReminder: { items: ClassOccurrence[]; expiresAt: number } | null = null
let reminderTimer: number | undefined
let reminderNextCheckAt = Infinity
let reminderBusy = false
let reminderRestorePending = false
let lastReminderDismissedAt = -Infinity
let selectedClassIndex = 0
let lastClassScrollAt = -Infinity
let lastClassScrollDirection: -1 | 1 | null = null
let phoneTodoFilter: 'pending' | 'completed' = 'pending'
let phoneTodoPage = 0
let todoClickTimer: number | undefined
let lastTodoScrollEventAt = -Infinity
let lastTodoScrollDirection: -1 | 1 | null = null
let busy = false
let hudClock = new Date()
const readerCacheKey = LEETCODE_CACHE_KEY
let dailyProblem: DailyProblem | null = restoreDailyProblem(localStorage.getItem(readerCacheKey))
let dailyDocument: ReaderDocument = dailyProblem ? buildReaderDocument(dailyProblem, getTextWidth) : { lines: ['Loading daily challenge...'], images: [] }
let dailyScroll = 0
let leetcodeImageIndex: number | null = null
let leetcodeClickTimer: number | undefined
let dailyLoading = false
let dailyError = ''
let dailyRequest = 0
let dailyImageEpoch = 0
const dailyImages = new Map<string, ProblemImage | 'loading' | 'failed'>()

const menu = new MenuContainerProperty({
  menuItems: [
    new MenuItemProperty({ itemName: 'Dashboard', itemID: 1 }),
  ],
})

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function loadSavedState() {
  const localSettings = safeJson<Partial<Settings>>(localStorage.getItem(STORAGE_KEY), {})
  const localChat = safeJson<ChatMessage[]>(localStorage.getItem(CHAT_STORAGE_KEY), [])
  settings = { ...DEFAULT_SETTINGS, ...localSettings }
  chatMessages = localChat
  chatArchives = safeJson<ChatArchive[]>(localStorage.getItem(CHAT_ARCHIVE_STORAGE_KEY), [])
  todos = parseTodos(localStorage.getItem(TODO_STORAGE_KEY))

  try {
    const stored = await bridge.getLocalStorage(STORAGE_KEY)
    if (stored && stored !== 'null') settings = { ...DEFAULT_SETTINGS, ...safeJson<Partial<Settings>>(stored, {}) }
  } catch {
    // Browser storage remains available in the simulator and local preview.
  }
  try {
    const stored = await bridge.getLocalStorage(CHAT_STORAGE_KEY)
    if (stored && stored !== 'null') chatMessages = safeJson<ChatMessage[]>(stored, [])
  } catch {
    // Keep the local browser copy.
  }
  try {
    const stored = await bridge.getLocalStorage(CHAT_ARCHIVE_STORAGE_KEY)
    if (stored && stored !== 'null') chatArchives = safeJson<ChatArchive[]>(stored, [])
  } catch {
    // Keep archived conversations from the browser copy.
  }
  try {
    const stored = await bridge.getLocalStorage(TODO_STORAGE_KEY)
    if (stored && stored !== 'null') todos = parseTodos(stored)
  } catch {
    // Keep the local browser copy.
  }
  try {
    const stored = await bridge.getLocalStorage(SCHEDULE_KEY)
    if (stored && stored !== 'null') schedule = parseSchedule(stored)
    const log = await bridge.getLocalStorage(REMINDER_KEY)
    if (log && log !== 'null') reminderLog = { ...parseReminderLog(log), ...reminderLog }
  } catch { /* Keep the local timetable and delivered reminders. */ }
  try {
    const stored = await bridge.getLocalStorage(TELEPROMPT_KEY)
    if (stored && stored !== 'null') savedTeleprompt = parseScript(stored)
  } catch { /* Keep the phone's script. */ }
  telepromptDocument.load(savedTeleprompt)
  try {
    const stored = await bridge.getLocalStorage('orbital-phone-theme')
    const theme = stored ? safeJson<string>(stored, '') : ''
    if (theme === 'light' || theme === 'dark') applyPhoneTheme(theme)
  } catch { /* Use the phone's saved theme. */ }
  // Existing installs saved the old, off-by-default setting. Adopt GPS once;
  // later changes to the toggle remain the user's choice.
  if (localStorage.getItem(GPS_DEFAULT_KEY) !== '1') {
    settings.useDeviceLocation = true
    localStorage.setItem(GPS_DEFAULT_KEY, '1')
    persist(STORAGE_KEY, settings)
  }
}

function pendingTodos() {
  return todos.filter(todo => !todo.completed)
}

function glassesTodoItems() {
  if (page !== 'todo') return pendingTodos()
  return todoSessionIds.map(id => todos.find(todo => todo.id === id)).filter((todo): todo is TodoItem => Boolean(todo))
}

function saveTodos() {
  persist(TODO_STORAGE_KEY, todos)
  if (page === 'todo') {
    todoSessionIds = todoSessionIds.filter(id => todos.some(todo => todo.id === id))
    for (const todo of pendingTodos()) if (!todoSessionIds.includes(todo.id)) todoSessionIds.push(todo.id)
  }
  selectedTodoIndex = Math.max(0, Math.min(selectedTodoIndex, glassesTodoItems().length - 1))
  renderTodos()
  void renderHud()
}

function renderTodos() {
  const list = byId<HTMLElement>('todo-list')
  list.replaceChildren()
  document.querySelectorAll<HTMLButtonElement>('[data-todo-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.todoFilter === phoneTodoFilter))
  })
  byId<HTMLElement>('todo-count').textContent = `${pendingTodos().length} pending`
  const filtered = todos.filter(todo => todo.completed === (phoneTodoFilter === 'completed'))
  const maxPage = Math.max(0, Math.ceil(filtered.length / 5) - 1)
  phoneTodoPage = Math.max(0, Math.min(phoneTodoPage, maxPage))
  byId<HTMLElement>('todo-empty').hidden = filtered.length !== 0
  byId<HTMLElement>('todo-empty').textContent = phoneTodoFilter === 'completed' ? 'No completed tasks.' : EMPTY_TODO_TEXT
  byId<HTMLElement>('todo-page-label').textContent = `${phoneTodoPage + 1} / ${maxPage + 1}`
  byId<HTMLButtonElement>('todo-prev').disabled = phoneTodoPage === 0
  byId<HTMLButtonElement>('todo-next').disabled = phoneTodoPage === maxPage
  for (const todo of filtered.slice(phoneTodoPage * 5, phoneTodoPage * 5 + 5)) {
    const row = document.createElement('li')
    row.className = `todo-row${todo.completed ? 'is-complete' : ''}`
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'todo-toggle'
    toggle.dataset.todoToggle = todo.id
    toggle.textContent = todo.completed ? '✓' : ''
    toggle.setAttribute('aria-label', todo.completed ? 'Restore to-do' : 'Complete to-do')
    toggle.setAttribute('aria-pressed', String(todo.completed))
    const text = document.createElement('span')
    text.textContent = todo.text
    if (todo.dueDate) {
      const due = document.createElement('small')
      due.className = 'todo-due'
      due.textContent = todoDueLabel(todo)
      text.append(due)
    }
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'todo-remove'
    remove.dataset.todoRemove = todo.id
    remove.textContent = '×'
    remove.setAttribute('aria-label', 'Delete to-do')
    row.append(toggle, text, remove)
    list.append(row)
  }
}

function persist(key: string, value: unknown) {
  const serialized = JSON.stringify(value)
  localStorage.setItem(key, serialized)
  void bridge.setLocalStorage(key, serialized).catch(() => undefined)
}

function applySettingsToForm() {
  byId<HTMLInputElement>('chat-url').value = settings.chatUrl
  byId<HTMLInputElement>('ai-relay-url').value = settings.aiRelayUrl
  byId<HTMLInputElement>('api-key').value = settings.apiKey
  byId<HTMLInputElement>('model').value = settings.model
  byId<HTMLInputElement>('transcription-url').value = settings.transcriptionUrl
  byId<HTMLInputElement>('transcription-key').value = settings.transcriptionApiKey
  byId<HTMLInputElement>('transcription-model').value = settings.transcriptionModel
  byId<HTMLSelectElement>('tp-transport').value = settings.telepromptTransport || 'auto'
  byId<HTMLSelectElement>('tp-model').value = settings.telepromptModel || DEFAULT_SETTINGS.telepromptModel
  byId<HTMLSelectElement>('tp-motion').value = settings.telepromptMotion || 'soft'
  telepromptView.setMotion(settings.telepromptMotion)
  byId<HTMLInputElement>('search-key').value = settings.searchApiKey
  byId<HTMLInputElement>('city').value = settings.city
  byId<HTMLInputElement>('search-enabled').checked = settings.searchEnabled
  byId<HTMLInputElement>('use-location').checked = settings.useDeviceLocation
  byId<HTMLSelectElement>('temperature-unit').value = settings.temperatureUnit
  updateSearchStatus()
  byId<HTMLDetailsElement>('ai-advanced').open = !settings.chatUrl.startsWith('https://api.openai.com/')
    || settings.model !== DEFAULT_SETTINGS.model || Boolean(settings.aiRelayUrl)
  updateAiRouteHint()
}

function readSettingsForm(): Settings {
  return {
    chatUrl: byId<HTMLInputElement>('chat-url').value.trim() || DEFAULT_SETTINGS.chatUrl,
    aiRelayUrl: byId<HTMLInputElement>('ai-relay-url').value.trim(),
    apiKey: normalizeApiKey(byId<HTMLInputElement>('api-key').value),
    model: byId<HTMLInputElement>('model').value.trim() || DEFAULT_SETTINGS.model,
    transcriptionUrl: byId<HTMLInputElement>('transcription-url').value.trim() || DEFAULT_SETTINGS.transcriptionUrl,
    transcriptionApiKey: normalizeApiKey(byId<HTMLInputElement>('transcription-key').value),
    transcriptionModel: byId<HTMLInputElement>('transcription-model').value.trim() || DEFAULT_SETTINGS.transcriptionModel,
    telepromptTransport: (byId<HTMLSelectElement>('tp-transport').value || 'auto') as Settings['telepromptTransport'],
    telepromptModel: byId<HTMLSelectElement>('tp-model').value || DEFAULT_SETTINGS.telepromptModel,
    telepromptMotion: byId<HTMLSelectElement>('tp-motion').value === 'calm' ? 'calm'
      : byId<HTMLSelectElement>('tp-motion').value === 'instant' ? 'instant' : 'soft',
    searchEnabled: byId<HTMLInputElement>('search-enabled').checked,
    searchApiKey: normalizeApiKey(byId<HTMLInputElement>('search-key').value),
    city: byId<HTMLInputElement>('city').value.trim() || DEFAULT_SETTINGS.city,
    useDeviceLocation: byId<HTMLInputElement>('use-location').checked,
    temperatureUnit: byId<HTMLSelectElement>('temperature-unit').value as Settings['temperatureUnit'],
  }
}

function updateSearchStatus() {
  const input = byId<HTMLInputElement>('search-enabled')
  const label = byId<HTMLElement>('search-status')
  label.textContent = input.checked ? 'Web search on' : 'Web search off'
  label.classList.toggle('is-on', input.checked)
}

function showPanel(id: 'settings-panel' | 'chat-sheet', show: boolean) {
  const target = id === 'settings-panel' ? 'settings' : 'chat'
  if (show) {
    if (target === 'settings') setSettingsTab('connection')
    setPhoneTab(target)
  }
  else if (phoneTab === target) setPhoneTab('hud')
}

function setPhoneTab(tab: typeof phoneTab) {
  phoneTab = tab
  if (tab === 'todo' || tab === 'schedule') lastPlannerTab = tab
  if (tab === 'leetcode' || tab === 'algorithms' || tab === 'teleprompt') lastStudyTab = tab
  document.querySelectorAll<HTMLElement>('[data-phone-panel]').forEach(panel => {
    const active = panel.dataset.phonePanel === tab
    panel.hidden = !active
    panel.setAttribute('aria-hidden', String(!active))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-phone-tab]').forEach(button => {
    const active = button.dataset.phoneTab === tab || (button.dataset.phoneTab === 'todo' && tab === 'schedule')
      || (button.dataset.phoneTab === 'leetcode' && (tab === 'algorithms' || tab === 'teleprompt'))
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
    if (button.dataset.phoneTab === 'todo') button.setAttribute('aria-controls', tab === 'schedule' ? 'panel-schedule' : 'panel-todo')
    if (button.dataset.phoneTab === 'leetcode') button.setAttribute('aria-controls', tab === 'algorithms' ? 'panel-algorithms' : tab === 'teleprompt' ? 'panel-teleprompt' : 'panel-leetcode')
  })
  document.querySelectorAll<HTMLButtonElement>('[data-planner-tab]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.plannerTab === tab))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-study-tab]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.studyTab === tab))
  })
  if (tab === 'todo') renderTodos()
  if (tab === 'schedule') renderScheduleUi()
  if (tab === 'algorithms') renderAlgorithmPhone()
  if (tab === 'teleprompt') renderTelepromptPhone()
  if (tab === 'chat') { const list = byId<HTMLElement>('message-list'); list.scrollTop = list.scrollHeight }
  if (tab === 'leetcode') void refreshDailyProblem()
}

function setSettingsTab(name: string) {
  document.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(panel => {
    const active = panel.dataset.settingsPanel === name
    panel.hidden = !active
    panel.setAttribute('aria-hidden', String(!active))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach(button => {
    const active = button.dataset.settingsTab === name
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  })
  document.querySelector<HTMLElement>('.settings-scroll')?.scrollTo(0, 0)
}

function showToast(message: string, isError = false) {
  const toast = byId<HTMLElement>('toast')
  toast.textContent = message
  toast.classList.toggle('is-error', isError)
  toast.classList.add('is-visible')
  window.setTimeout(() => toast.classList.remove('is-visible'), 3200)
}

function setStatus(message: string, tone: 'ready' | 'busy' | 'error' = 'ready') {
  byId<HTMLElement>('connection-status').textContent = message
  byId<HTMLElement>('connection-status').dataset.tone = tone
  byId<HTMLElement>('chat-live-status').textContent = message
  renderHud()
}

function weatherDescription(code: number) {
  if (code === 0) return 'Clear sky'
  if (code === 1 || code === 2) return 'Mostly clear'
  if (code === 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Foggy'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Current weather'
}

function formatTemperature(value: number | null) {
  if (value === null) return `--°${settings.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}`
  const shown = settings.temperatureUnit === 'fahrenheit' ? value * 9 / 5 + 32 : value
  return `${Math.round(shown)}°${settings.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}`
}

async function getCoordinates() {
  if (settings.useDeviceLocation) {
    try {
      const location = await bridge.getAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: 8000 })
      if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
        && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180) {
        return { latitude: location.latitude, longitude: location.longitude, city: 'Your location' }
      }
    } catch {
      showToast('Location unavailable. Using your saved city.')
    }
  }

  const lookup = async (name: string, countryCode?: string) => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    const params: Record<string, string> = { name, count: '10', language: 'en', format: 'json' }
    if (countryCode) params.countryCode = countryCode
    url.search = new URLSearchParams(params).toString()
    const response = await fetch(url)
    if (!response.ok) throw new Error(`City lookup failed (${response.status})`)
    const data = await response.json() as { results?: Array<{
      latitude: number; longitude: number; name: string; country?: string; country_code?: string; admin1?: string
    }> }
    return data.results ?? []
  }
  const query = settings.city.trim()
  let places = await lookup(query)
  const isWaterloo = query.toLocaleLowerCase() === 'waterloo'
  let place = isWaterloo ? places.find(candidate => candidate.country_code === 'CA' && candidate.admin1 === 'Ontario') : undefined
  if (isWaterloo && !place) {
    places = await lookup('Waterloo, Ontario', 'CA')
    place = places.find(candidate => candidate.country_code === 'CA')
  }
  place ??= places[0]
  if (!place) throw new Error(`City not found: ${query}. Try adding a region or country, such as Waterloo, Ontario.`)
  const region = place.country_code === 'CA' && place.admin1 ? place.admin1 : place.country
  return { latitude: place.latitude, longitude: place.longitude, city: region ? `${place.name}, ${region}` : place.name }
}

async function refreshWeather(showErrors = false) {
  if (appExited) return
  try {
    const location = await getCoordinates()
    weather = await fetchWeather(location)
    if (page === 'weather' && hudActive) void ensureWeatherExtras()
    byId<HTMLElement>('weather-place').textContent = location.city
    byId<HTMLElement>('weather-temp').textContent = formatTemperature(weather.temperature)
    byId<HTMLElement>('weather-description').textContent = weatherDescription(weather.code)
    byId<HTMLElement>('weather-range').textContent = `Feels ${formatTemperature(weather.feelsLike)}  ·  High ${formatTemperature(weather.high)}  /  Low ${formatTemperature(weather.low)}`
    byId<HTMLElement>('weather-updated').textContent = 'Just updated · Open-Meteo'
    renderHud()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Weather unavailable'
    byId<HTMLElement>('weather-description').textContent = 'Weather unavailable'
    byId<HTMLElement>('weather-updated').textContent = message
    if (showErrors) showToast(message, true)
    renderHud()
  }
}

async function ensureWeatherExtras() {
  if (!weather || !hudActive || appExited) return
  const currentWeather = weather
  const key = weatherKey(currentWeather)
  const cached = weatherExtraCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < 30 * 60_000) {
    weatherExtras = cached
    return
  }
  if (weatherExtraRequests.has(key) && weatherExtras?.key === key) return
  const result: WeatherExtras = { key, loading: true, wind: cached?.wind ?? null, air: cached?.air ?? null, basemap: cached?.basemap ?? null, fetchedAt: 0 }
  weatherExtras = result
  if (weatherExtraRequests.has(key)) return
  weatherExtraRequests.add(key)
  const publish = () => {
    if (weather && weatherKey(weather) === key) {
      weatherExtras = result
      if (hudActive && page === 'weather') void renderHud()
    }
  }
  // Publish each source as it arrives so a slow AQ request cannot hide the map.
  const [wind, air, basemap] = await Promise.allSettled([
    fetchWindField(currentWeather).then(value => { result.wind = value; publish(); return value }),
    fetchAirQuality(currentWeather).then(value => { result.air = value; publish(); return value }),
    fetchWindBasemap(currentWeather).then(value => { result.basemap = value; publish(); return value }),
  ])
  result.loading = false
  result.fetchedAt = Date.now()
  result.wind = wind.status === 'fulfilled' ? wind.value : null
  result.air = air.status === 'fulfilled' ? air.value : null
  result.basemap = basemap.status === 'fulfilled' ? basemap.value : null
  weatherExtraRequests.delete(key)
  // Retry temporary service failures after one minute, without polling per frame.
  if (wind.status === 'rejected' || air.status === 'rejected' || basemap.status === 'rejected') result.fetchedAt -= 29 * 60_000
  weatherExtraCache.set(key, result)
  if (weatherExtraCache.size > 8) weatherExtraCache.delete(weatherExtraCache.keys().next().value!)
  publish()
}

function weatherOverlay(view = weatherView) {
  return renderWeatherArtwork(weather, weatherExtras, view, settings.temperatureUnit, 0)
}

function usableEnglishQuote(value: unknown) {
  if (typeof value !== 'string') return null
  const quote = value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim()
  if (quote.length < 8 || quote.length > 110 || !/[A-Za-z]/.test(quote)
    || !/^[\x20-\x7e]+$/.test(quote) || !supportsDashboardText(quote)) return null
  return quote
}

async function fetchHitokoto() {
  const controller = new AbortController()
  quoteFetchController = controller
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(HITOKOTO_URL, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json() as { hitokoto?: unknown }
    return usableEnglishQuote(data.hitokoto)
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
    if (quoteFetchController === controller) quoteFetchController = null
  }
}

function cancelInformationQuote() {
  quoteRequestID += 1
  quoteFetchController?.abort()
  quoteFetchController = null
}

async function refreshInformationQuote() {
  cancelInformationQuote()
  const requestID = quoteRequestID
  quoteText = 'Loading quote...'
  const fetched = await fetchHitokoto()
  if (requestID !== quoteRequestID || page !== 'info' || !hudActive || appExited) return
  quoteText = fetched ?? QUOTE_FALLBACKS[quoteFallbackIndex++ % QUOTE_FALLBACKS.length]
  console.debug('HUD information quote ready')
  await renderHud()
}

async function moveWeatherPage(direction: -1 | 1) {
  if (page !== 'weather' || !hudActive || appExited || hudTransitioning) return
  const next = (weatherView + direction + WEATHER_TITLES.length) % WEATHER_TITLES.length
  weatherView = next
  console.debug('HUD weather page', { view: next })
  // The input gate accepts one page turn per scroll burst; await its commit.
  await renderHud()
}

function trimForGlasses(value: string, maxLength = 74) {
  const clean = value.replace(/https?:\/\/\S+/g, '[link]').replace(/\s+/g, ' ').trim()
  let displayWidth = 0
  let clipped = ''
  for (const character of clean) {
    const characterWidth = (character.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
    if (displayWidth + characterWidth > maxLength) return clipped
    clipped += character
    displayWidth += characterWidth
  }
  return clipped
}

function sectionIndex() {
  return homeSections(homeFolder).indexOf(selectedSection)
}

function setHomeFolder(folder: HomeFolder) {
  if (!hudActive || hudMinimized || activeReminder || reminderBusy || hudTransitioning || appExited) return
  homeFolder = folder
  selectedSection = folder === 'study' ? 'schedule' : 'study'
  hudAnimationEpoch += 1
  lastHomeScrollAt = -Infinity
  lastHomeScrollDirection = null
  void renderHud()
}

function openHomeSection(section: Section) {
  if (section === 'study') setHomeFolder('study')
  else if (section === 'back') setHomeFolder('root')
  else setPage(section === 'ai' ? 'chat' : section)
}

async function moveSection(direction: -1 | 1) {
  if (NATIVE_HOME_TEXT) {
    if (!hudActive || appExited || hudTransitioning || page !== 'home') return
    const next = homeSelectionStep(selectedSection, direction, homeFolder)
    if (next === selectedSection) return
    selectedSection = next
    if (next === 'leetcode') void refreshDailyProblem()
    console.debug('HUD home selection', { section: next })
    await renderHud()
    return
  }
  if (animatingDashboard || animatingNavigation || !hudActive || page !== 'home') return
  animatingDashboard = true
  const epoch = hudAnimationEpoch
  try {
    await hudRenderQueue
    if (!hudActive || page !== 'home' || hudLayoutPage !== 'home' || epoch !== hudAnimationEpoch) return
    const sections = homeSections(homeFolder)
    const next = sections[(sectionIndex() + direction + sections.length) % sections.length]
    transitionTextHidden = true
    await updateSurfaceText('home')
    const fromImage = drawSectionCard(selectedSection)
    const toImage = drawSectionCard(next)
    const background = drawHomeBackground()
    await animateHudFrames(360, epoch, async eased => {
      const pixels = drawCardTransition(fromImage, toImage, direction, eased)
      const composed = background.slice()
      blendLayer(composed, pixels, CARD_WIDTH, 250, CARD_TOP)
      await updateSurfaceFrame(composed, epoch)
    })
    if (hudActive && page === 'home' && epoch === hudAnimationEpoch) {
      selectedSection = next
      await renderHud(false, true)
      transitionTextHidden = false
      if (next === 'ai') await revealAiOverlay(epoch)
    }
  } catch (error) {
    console.error('HUD card update failed', error)
    transitionTextHidden = false
    hudRefreshPending = true
  } finally {
    if (transitionTextHidden) {
      transitionTextHidden = false
      hudRefreshPending = true
    }
    animatingDashboard = false
    if (hudRefreshPending) {
      hudRefreshPending = false
      void renderHud()
    }
  }
}

function drawPixelText(context: CanvasRenderingContext2D, text: string, x: number, y: number, pixelSize: number, style: 'grid' | 'connected' | 'fine' = 'grid', glyphs = PIXEL_GLYPHS) {
  context.fillStyle = '#fff'
  const cellSize = pixelSize + (style !== 'connected' ? 1 : 0)
  const characterGap = style !== 'connected' ? pixelSize : 1
  let left = x
  for (const character of text) {
    const glyph = glyphs[character] ?? glyphs['-']
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') context.fillRect(left + column * cellSize, y + row * cellSize,
          pixelSize + (style === 'fine' && glyph[row][column + 1] === '1' ? 1 : 0),
          pixelSize + (style === 'fine' && glyph[row + 1]?.[column] === '1' ? 1 : 0))
      }
    }
    left += glyph[0].length * cellSize + characterGap
  }
}

function canvasGrayscale(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return new Uint8Array(canvas.width * canvas.height)
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
  const grayscale = new Uint8Array(canvas.width * canvas.height)
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4
    grayscale[pixel] = Math.round((rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114) * (rgba[offset + 3] / 255))
  }
  return grayscale
}

function drawClockImage(showDivider = true) {
  const canvas = document.createElement('canvas')
  canvas.width = LEFT_WIDTH
  canvas.height = 144
  const context = canvas.getContext('2d')
  if (!context) return new Uint8Array(canvas.width * canvas.height)
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const date = `${String(hudClock.getMonth() + 1).padStart(2, '0')}/${String(hudClock.getDate()).padStart(2, '0')} ${hudClock.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}`
  drawPixelText(context, date, 0, 2, 2, 'connected')
  const time = hudClock.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const layout = clockTextLayout(time)
  const left = Math.floor((canvas.width - layout.width) / 2)
  const top = CARD_HEADER_HEIGHT + Math.round((134 - CARD_HEADER_HEIGHT - layout.height) / 2)
  drawClockText(context, layout, left, top)
  if (showDivider) {
    context.fillStyle = '#777'
    context.fillRect(left, 134, layout.width, 1)
  }
  return canvasGrayscale(canvas)
}

function drawWeatherWidgetImage() {
  const canvas = document.createElement('canvas')
  canvas.width = LEFT_WIDTH
  canvas.height = 78
  const context = canvas.getContext('2d')
  if (!context) return new Uint8Array(canvas.width * canvas.height)
  const unit = settings.temperatureUnit === 'fahrenheit' ? 'F' : 'C'
  const current = weather ? formatTemperature(weather.temperature) : `--°${unit}`
  const feels = weather ? formatTemperature(weather.feelsLike) : `--°${unit}`
  const rainWhen = !weather ? '--H' : weather.rainInHours === null ? '24H' : weather.rainInHours === 0 ? 'NOW' : `${weather.rainInHours}H`
  const rainAmount = !weather ? '--mm' : weather.rainInHours === null ? 'dry'
    : weather.rainAmount < 0.1 ? '<.1mm' : `${Number(weather.rainAmount.toFixed(1))}mm`
  const wind = weather?.windSpeed == null ? '--' : String(Math.round(weather.windSpeed))
  // Equal column origins and fine one-pixel stems, deliberately dimmer than time.
  const width = (text: string) => [...text].reduce((total, character) => total + (PIXEL_GLYPHS[character] ?? PIXEL_GLYPHS['-'])[0].length * 2 + 1, -2)
  const leftWidth = Math.max(...[current, rainWhen, rainAmount].map(width))
  const rightWidth = Math.max(...[feels, wind, 'km/h'].map(width))
  const left = Math.floor((LEFT_WIDTH - (44 + leftWidth + rightWidth + 18)) / 2)
  const right = left + 22 + leftWidth + 18, top = 4, bottom = 40
  context.globalAlpha = 0.68
  const value = (text: string, x: number, y: number) => drawPixelText(context, text, x + 22, y + 1, 1, 'fine')
  drawWeatherSymbol(context, weather?.code ?? 3, left, top, 16, 255)
  value(current, left, top); value(feels, right, top)
  context.strokeStyle = '#fff'; context.lineWidth = 1
  context.beginPath()
  context.moveTo(right + 6.5, top + 10)
  context.lineTo(right + 6.5, top + 2.5)
  context.arc(right + 8, top + 2.5, 1.5, Math.PI, 0)
  context.lineTo(right + 9.5, top + 10)
  context.arc(right + 8, top + 12, 3, -Math.PI / 3, Math.PI * 4 / 3)
  context.closePath(); context.stroke()
  context.beginPath()
  context.moveTo(left + 8, bottom + 1)
  context.bezierCurveTo(left + 6, bottom + 6, left + 2, bottom + 8, left + 3, bottom + 12)
  context.bezierCurveTo(left + 4, bottom + 17, left + 12, bottom + 17, left + 13, bottom + 12)
  context.bezierCurveTo(left + 14, bottom + 8, left + 10, bottom + 6, left + 8, bottom + 1)
  context.stroke()
  for (const row of [4, 9, 14]) {
    context.beginPath(); context.moveTo(right + 1, bottom + row)
    context.lineTo(right + 11, bottom + row)
    context.arc(right + 11, bottom + row - 2, 2, Math.PI / 2, -Math.PI, true)
    context.stroke()
  }
  value(rainWhen, left, bottom); value(rainAmount, left, bottom + 19)
  value(wind, right, bottom); value('km/h', right, bottom + 19)
  return canvasGrayscale(canvas)
}

function latestChatTurn() {
  for (let index = chatMessages.length - 1; index >= 0; index--) {
    if (chatMessages[index].role !== 'user') continue
    return { question: chatMessages[index].content,
      answer: chatMessages.slice(index + 1).find(message => message.role === 'assistant')?.content }
  }
  return null
}

function fitPreviewLines(text: string, maxLines: number, maxWidth = CARD_WIDTH - 2 * (CARD_PADDING + CARD_BORDER) - 4) {
  const lines: string[] = []
  let remaining = trimForGlasses(text, 600)
  while (remaining && lines.length < maxLines) {
    if (getTextWidth(remaining) <= maxWidth) {
      lines.push(remaining)
      break
    }
    let line = ''
    for (const character of remaining) {
      if (getTextWidth(line + character) > maxWidth) break
      line += character
    }
    const wordBreak = line.lastIndexOf(' ')
    if (wordBreak > line.length / 2) line = line.slice(0, wordBreak)
    if (!line) break
    lines.push(line)
    remaining = remaining.slice(line.length).trimStart()
    // This preview has a fixed height; stop on the last visible line instead
    // of squeezing the rest into an unhelpful ellipsis.
    if (lines.length === maxLines) break
  }
  return lines
}

function visibleQuote() {
  return quoteText
}

function informationDetailBody() {
  const status = connected ? 'G2 connected' : 'Waiting for G2'
  const battery = batteryLevel === null ? 'Battery  --' : `Battery  ${Math.round(batteryLevel)}%`
  return [status, battery, '', ...fitPreviewLines(visibleQuote(), 4, 500)].join('\n')
}

function weatherDetailsContent() {
  if (!weather) return `${settings.city}\nWeather is loading.\nCheck your phone connection.`
  const percent = (value: number | null) => value === null ? '--%' : `${Math.round(value)}%`
  const clock = (value: string | null) => value?.match(/T(\d{2}:\d{2})/)?.[1] ?? '--:--'
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const direction = weather.windDirection === null ? '--'
    : directions[Math.round((((weather.windDirection % 360) + 360) % 360) / 22.5) % directions.length]
  const rainTiming = weather.rainInHours === 0 ? 'Rain now' : `Rain in ${weather.rainInHours}h`
  const rain = weather.rainInHours === null ? 'No rain expected in the next 24h'
    : `${rainTiming}: ${Number(weather.rainAmount.toFixed(1))} mm${weather.rainChance === null ? '' : ` / ${percent(weather.rainChance)}`}`
  return [
    weather.city,
    `${formatTemperature(weather.temperature)} / Feels ${formatTemperature(weather.feelsLike)}`,
    `${weatherDescription(weather.code)} / H ${formatTemperature(weather.high)} L ${formatTemperature(weather.low)}`,
    rain,
    `Wind ${weather.windSpeed === null ? '--' : Math.round(weather.windSpeed)} km/h ${direction}`,
    `Humidity ${percent(weather.humidity)}  / Clouds ${percent(weather.cloudCover)}`,
    `Sunrise ${clock(weather.sunrise)}  / Sunset ${clock(weather.sunset)}`,
  ].join('\n')
}

function sectionContent(section: Section) {
  if (section === 'study') return 'Study\nTimetable\nLeetCode daily\nAlgorithms\nTeleprompt'
  if (section === 'teleprompt') return `Teleprompt\n${savedTeleprompt.title}\n${telepromptDocument.lines.length} lines / voice follow or manual`
  if (section === 'algorithms') return `Algorithms\n${ALGORITHM_NOTES.length} offline notes\nBrowse by type / double-tap: back`
  if (section === 'back') return 'Back\nReturn to the main menu'
  if (section === 'schedule') return `Timetable\n${scheduleSummary()}\nReminders 30 min before class`
  if (section === 'leetcode') return `LeetCode daily\n${dailyProblem ? `#${dailyProblem.number}. ${dailyProblem.title}` : 'English daily challenge'}\nSwipe to read / double-tap to exit`
  if (section === 'weather') {
    const summary = weather
      ? `${formatTemperature(weather.temperature)}  ${weatherDescription(weather.code)}\nFeels like ${formatTemperature(weather.feelsLike)}\nHigh ${formatTemperature(weather.high)}   Low ${formatTemperature(weather.low)}`
      : 'Weather loading...\nForecast updates every 30 min'
    return `Weather\n${weather?.city ?? settings.city}\n${summary}`
  }
  if (section === 'info') {
    const status = connected ? 'G2 connected' : 'Waiting for G2'
    const battery = batteryLevel === null ? 'Battery  --' : `Battery  ${Math.round(batteryLevel)}%`
    return ['Information', status, battery, '', ...fitPreviewLines(visibleQuote(), 3)].join('\n')
  }
  if (section === 'todo') {
    const pending = pendingTodos()
    if (!pending.length) return `To-do list\n${EMPTY_TODO_TEXT}`
    const items = pending.slice(0, 5).map((todo, index) => `${index + 1}. ${todo.text}`)
    if (pending.length > 5) items.push(`+${pending.length - 5} more`)
    return [`To-do list`, ...items].join('\n')
  }
  const lines = [`AI assistant`, busy ? 'Thinking...' : settings.apiKey ? 'Ready to chat' : 'Add API key on phone',
    settings.searchEnabled ? 'Web search enabled' : 'Web search off']
  const turn = latestChatTurn()
  if (turn) {
    lines.push('', ...fitPreviewLines(`> ${turn.question}`, 1))
    const maxLines = Math.floor((CARD_HEIGHT - 2 * (CARD_PADDING + CARD_BORDER)) / DASHBOARD_LINE_HEIGHT)
    if (turn.answer) lines.push(...fitPreviewLines(`- ${turn.answer}`, Math.max(1, maxLines - lines.length)))
  }
  return lines.join('\n')
}

function cardContent(section: Section) {
  const inset = 2 * (CARD_PADDING + CARD_BORDER)
  const maxLines = Math.floor((CARD_HEIGHT - inset) / DASHBOARD_LINE_HEIGHT)
  // Fit the device's unscaled default font without creating native scroll overflow.
  return sectionContent(section).split('\n').slice(0, maxLines)
    .map((line, index) => pxTruncate(line, CARD_WIDTH - inset - 4 - (index === 0 ? CARD_TITLE_INSET : 0))).join('\n')
}

function drawSectionCard(section: Section) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('HUD canvas is unavailable')
  context.fillStyle = '#000'
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  context.strokeStyle = '#aaa'
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 8)
  context.stroke()
  drawDashboardIcon(context, section, CARD_PADDING + CARD_BORDER, CARD_PADDING + CARD_BORDER + 4)
  const content = cardContent(section)
  const pixels = canvasGrayscale(canvas)
  const emptyTodo = section === 'todo' && pendingTodos().length === 0
  const lines = emptyTodo ? content.split('\n').slice(0, 1) : content.split('\n')
  lines.forEach((line, index) => {
    // Keep the transition frame in the captured Dashboard font. Lines that
    // need a CJK fallback are revealed in a native text overlay afterwards.
    if (!supportsDashboardText(line)) return
    drawDashboardText(pixels, CARD_WIDTH, line,
      CARD_PADDING + CARD_BORDER + (index === 0 ? CARD_TITLE_INSET : 0),
      CARD_PADDING + CARD_BORDER + index * DASHBOARD_LINE_HEIGHT)
  })
  if (emptyTodo) {
    drawDashboardText(pixels, CARD_WIDTH, EMPTY_TODO_TEXT,
      Math.floor((CARD_WIDTH - getTextWidth(EMPTY_TODO_TEXT)) / 2),
      Math.floor((CARD_HEIGHT - DASHBOARD_LINE_HEIGHT) / 2))
  }
  if (section === 'info') pixels.fill(72, 108 * CARD_WIDTH + 13, 108 * CARD_WIDTH + CARD_WIDTH - 13)
  return pixels
}

function drawCardTransition(from: Uint8Array, to: Uint8Array, direction: -1 | 1, progress: number) {
  // Copy complete pixel rows, never scale/filter the card or re-render its text.
  const pixels = new Uint8Array(CARD_WIDTH * CARD_HEIGHT)
  const travel = CARD_HEIGHT + 12
  const offset = Math.round(progress * travel)
  const cards = [
    { pixels: from, top: -direction * offset },
    { pixels: to, top: direction * (travel - offset) },
  ]
  for (const card of cards) {
    const startRow = Math.max(0, -card.top)
    const endRow = Math.min(CARD_HEIGHT, CARD_HEIGHT - card.top)
    for (let row = startRow; row < endRow; row++) {
      pixels.set(card.pixels.subarray(row * CARD_WIDTH, (row + 1) * CARD_WIDTH), (row + card.top) * CARD_WIDTH)
    }
  }
  return pixels
}

function detailContainers(currentPage: Page = page) {
  if (currentPage === 'todo') {
    const pending = pendingTodos()
    const body = pending.length ? pending.slice(0, 7).map((todo, index) => pxTruncate(`${index + 1}. ${todo.text}`, 510)).join('\n') : ' '
    const textWidth = getTextWidth(EMPTY_TODO_TEXT)
    return [
      new TextContainerProperty({ xPosition: DETAIL_TITLE_X, yPosition: DETAIL_TITLE_Y, width: 486, height: DASHBOARD_LINE_HEIGHT, borderWidth: 0, paddingLength: 0, containerID: 1, containerName: 'detail-header', content: 'To-do list', textColor: 4, isEventCapture: 0 }),
      new TextContainerProperty({ xPosition: DETAIL_RECT.x, yPosition: DETAIL_RECT.y, width: DETAIL_RECT.width, height: DETAIL_RECT.height, borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 12, containerID: 2, containerName: 'todo-detail', content: body, textColor: 4, isEventCapture: 1 }),
      ...(!pending.length ? [new TextContainerProperty({ xPosition: Math.floor((HUD_WIDTH - textWidth) / 2), yPosition: DETAIL_EMPTY_Y, width: textWidth + 2, height: DASHBOARD_LINE_HEIGHT, borderWidth: 0, paddingLength: 0, containerID: 3, containerName: 'todo-empty', content: EMPTY_TODO_TEXT, textColor: 4, isEventCapture: 0 })] : []),
    ]
  }
  const isWeather = currentPage === 'weather'
  const body = isWeather
    ? weatherView === 0 ? weatherDetailsContent().split('\n').map(line => pxTruncate(line, 300)).join('\n') : ' '
    : informationDetailBody()
  return [
    new TextContainerProperty({ xPosition: DETAIL_TITLE_X, yPosition: DETAIL_TITLE_Y, width: 486, height: DASHBOARD_LINE_HEIGHT, borderWidth: 0, paddingLength: 0, containerID: 1, containerName: 'detail-header', content: isWeather ? WEATHER_TITLES[weatherView] : 'Information', textColor: 4, isEventCapture: 0 }),
    new TextContainerProperty({ xPosition: DETAIL_RECT.x, yPosition: DETAIL_RECT.y, width: DETAIL_RECT.width, height: DETAIL_RECT.height, borderWidth: 1, borderColor: isWeather ? 8 : 5, borderRadius: 8, paddingLength: 12, containerID: 2, containerName: 'detail-card', content: body, textColor: 4, isEventCapture: 1 }),
  ]
}

function chatContainers() {
  const window = chatScrollWindow(chatTranscriptLines(), chatScrollLine)
  chatScrollLine = window.start
  const content = window.content
  const chatStatus = recording ? 'LISTENING' : busy ? 'THINKING' : 'READY'
  return [
    new TextContainerProperty({ xPosition: DETAIL_TITLE_X, yPosition: DETAIL_TITLE_Y, width: 486, height: DASHBOARD_LINE_HEIGHT, borderWidth: 0, paddingLength: 0, containerID: 1, containerName: 'chat-header', content: `AI assistant  /  ${chatStatus}`, textColor: recording ? 4 : 3, isEventCapture: 0 }),
    new TextContainerProperty({ xPosition: DETAIL_RECT.x, yPosition: DETAIL_RECT.y, width: DETAIL_RECT.width, height: DETAIL_RECT.height, borderWidth: 1, borderColor: recording ? 12 : 7, borderRadius: 8, paddingLength: 12, containerID: 2, containerName: 'conversation', content, textColor: 4, isEventCapture: 1 }),
  ]
}

function pageTextContainers(currentPage: Page) {
  return currentPage === 'chat' ? chatContainers() : detailContainers(currentPage)
}

function chatTranscriptLines() {
  return chatTranscriptData().lines
}

function chatTranscriptData() {
  if (chatTranscriptSource !== chatMessages) {
    chatTranscriptSource = chatMessages
    chatFormattedTranscript = formatChatTranscript(chatMessages, getTextWidth)
  }
  return chatFormattedTranscript
}

function nativeOverlayText(text: string) {
  return text.split('\n').map(line => supportsDashboardText(line) ? ' ' : line).join('\n')
}

function nativeHomeSummary(section: Section) {
  let summary: string
  if (section === 'study') summary = 'Timetable / Daily / Notes / Prompt'
  else if (section === 'teleprompt') summary = telepromptDocument.lines.length ? `${savedTeleprompt.title} / ${telepromptDocument.lines.length} lines` : 'Type or import TXT on phone'
  else if (section === 'algorithms') summary = `${ALGORITHM_NOTES.length} offline notes / 12 categories`
  else if (section === 'back') summary = 'Return to main menu'
  else if (section === 'schedule') summary = scheduleSummary()
  else if (section === 'leetcode') summary = dailyProblem ? `#${dailyProblem.number} / ${dailyProblem.difficulty ?? '--'}`
    : dailyLoading ? 'Loading daily challenge...' : 'Daily coding challenge'
  else if (section === 'info') summary = connected
    ? `G2 connected / ${batteryLevel === null ? '--%' : `${Math.round(batteryLevel)}%`}` : 'Connection / daily quote'
  else if (section === 'ai') {
    const turn = latestChatTurn()
    summary = turn ? `> ${turn.question}` : busy ? 'Thinking...' : settings.apiKey ? 'Ready to chat' : 'Add API key on phone'
  } else if (section === 'weather') summary = weather
    ? `${formatTemperature(weather.temperature)} / ${weatherDescription(weather.code)}` : 'Forecast / wind map'
  else {
    const pending = pendingTodos()
    summary = pending.length ? `${pending.length} to-dos / ${pending[0].text}` : EMPTY_TODO_TEXT
  }
  return pxTruncate(summary.replace(/\s+/g, ' ').trim(), 236)
}

function applyPhoneTheme(theme: string) {
  const chosen = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = chosen
  byId<HTMLButtonElement>('theme-toggle').textContent = chosen === 'dark' ? 'Light' : 'Dark'
  byId<HTMLButtonElement>('theme-toggle').setAttribute('aria-label', `Switch to ${chosen === 'dark' ? 'light' : 'dark'} mode`)
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', chosen === 'dark' ? '#090909' : '#fafafa')
}

function scheduleSummary() {
  const next = upcomingClasses(schedule.courses)[0]
  return next ? `${WEEKDAYS[next.date.getDay()]} ${next.course.start} / ${next.course.title}` : 'No upcoming classes'
}

function nativeText(text: string, width = 506, maxBytes = 128) {
  const characters = [...text.split('\n').map(line => pxTruncate(line, width)).join('\n')]
  const encoder = new TextEncoder()
  while (encoder.encode(characters.join('')).length > maxBytes) characters.pop()
  return characters.join('') || ' '
}

function scheduleContainers() {
  const occurrences = upcomingClasses(schedule.courses)
  selectedClassIndex = Math.max(0, Math.min(selectedClassIndex, occurrences.length - 1))
  const first = Math.max(0, Math.min(selectedClassIndex - 1, occurrences.length - 3))
  const visible = occurrences.slice(first, first + 3)
  return [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262, containerID: 1,
      containerName: 'class-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
      borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 59, yPosition: 23, width: 486, height: 27, containerID: 4,
      containerName: 'class-header', content: occurrences.length ? `Timetable / ${selectedClassIndex + 1} of ${occurrences.length}` : 'Timetable',
      isEventCapture: 0, textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    ...Array.from({ length: 3 }, (_, index) => {
      const item = visible[index]
      const line = item ? `${first + index === selectedClassIndex ? '>' : '-'} ${WEEKDAYS[item.date.getDay()]} ${item.course.start}-${item.course.end} / ${item.course.title}\n  ${localDateKey(item.date)}${item.course.location ? ` / ${item.course.location}` : ''}`
        : !occurrences.length && index === 1 ? 'No upcoming classes\nAdd your timetable on the phone' : ' '
      return new TextContainerProperty({ xPosition: 31, yPosition: 58 + index * 54, width: 514, height: 54,
        containerID: 5 + index, containerName: `class-row-${index}`, content: nativeText(line), isEventCapture: 0,
        textColor: first + index === selectedClassIndex ? 4 : 2, zOrderIndex: 9 + index, borderWidth: 0, paddingLength: 0 })
    }),
    new TextContainerProperty({ xPosition: 31, yPosition: 235, width: 514, height: 27, containerID: 8,
      containerName: 'class-footer', content: `Reminders: ${schedule.remindersEnabled ? '30 min before' : 'off'} / Double-tap: back`,
      isEventCapture: 0, textColor: 2, zOrderIndex: 12, borderWidth: 0, paddingLength: 0 }),
  ]
}

function reminderContainers() {
  const items = activeReminder?.items ?? []
  const minutes = items[0] ? Math.max(1, Math.ceil((items[0].date.getTime() - Date.now()) / 60_000)) : 30
  return [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262, containerID: 1,
      containerName: 'reminder-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
      borderWidth: 1, borderColor: 12, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 23, width: 514, height: 27, containerID: 4,
      containerName: 'reminder-title', content: `CLASS IN ${minutes} MIN`, isEventCapture: 0,
      textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    ...Array.from({ length: 3 }, (_, index) => {
      const item = items[index]
      return new TextContainerProperty({ xPosition: 31, yPosition: 65 + index * 54, width: 514, height: 54,
        containerID: 5 + index, containerName: `reminder-row-${index}`, content: item
          ? nativeText(`${item.course.title}\n${item.course.start}-${item.course.end}${item.course.location ? ` / ${item.course.location}` : ''}`) : ' ',
        isEventCapture: 0, textColor: 4, zOrderIndex: 9 + index, borderWidth: 0, paddingLength: 0 })
    }),
    new TextContainerProperty({ xPosition: 31, yPosition: 235, width: 514, height: 27, containerID: 8,
      containerName: 'reminder-footer', content: `${items.length > 3 ? `+${items.length - 3} more / ` : ''}Tap: dismiss / Auto-return: 20s`,
      isEventCapture: 0, textColor: 2, zOrderIndex: 12, borderWidth: 0, paddingLength: 0 }),
  ]
}

function queueReminderCheck(delay = 1000) {
  const at = Date.now() + Math.max(250, delay)
  if (reminderTimer !== undefined && reminderNextCheckAt <= at) return
  if (reminderTimer !== undefined) window.clearTimeout(reminderTimer)
  reminderTimer = undefined
  reminderNextCheckAt = Infinity
  if (!appExited) {
    reminderNextCheckAt = at
    reminderTimer = window.setTimeout(() => {
      reminderTimer = undefined
      reminderNextCheckAt = Infinity
      void checkClassReminders().catch(error => { console.error('Reminder scheduler failed', error); queueReminderCheck(30_000) })
    }, Math.max(250, at - Date.now()))
  }
}

async function restoreReminderDisplay() {
  reminderRestorePending = true
  surfaceReady = false
  hudLayoutPage = null
  if (appExited) { reminderRestorePending = false; return }
  if (!hudActive) await renderSleepPage()
  else {
    await renderHud()
    if (hudLayoutPage !== (hudMinimized ? 'minimized' : page)) throw new Error('Reminder display restore incomplete')
  }
  reminderRestorePending = false
  if (page === 'teleprompt') telepromptView.sync()
}

async function dismissClassReminder() {
  if (!activeReminder || reminderBusy) return
  reminderBusy = true
  activeReminder = null
  lastReminderDismissedAt = performance.now()
  hudAnimationEpoch += 1
  try { await restoreReminderDisplay() }
  catch (error) { console.error('Reminder restore failed', error); showToast('Could not restore the display. Hold or double-tap to retry.', true) }
  finally { reminderBusy = false; updateHudControls(); telepromptView.sync(); resumeTelepromptIfNeeded(); queueReminderCheck() }
}
async function checkClassReminders() {
  if (appExited) return
  if (reminderBusy || hudTransitioning || animatingNavigation || animatingDashboard) { queueReminderCheck(); return }
  if (reminderRestorePending) {
    if (connected) {
      reminderBusy = true
      try { await restoreReminderDisplay() }
      catch (error) { console.error('Reminder display restore retry failed', error) }
      finally { reminderBusy = false; resumeTelepromptIfNeeded() }
    }
    queueReminderCheck(connected ? 1000 : 30_000)
    return
  }
  if (activeReminder) {
    if (Date.now() >= activeReminder.expiresAt || !schedule.remindersEnabled
      || activeReminder.items.some(item => !schedule.courses.includes(item.course))) await dismissClassReminder()
    else queueReminderCheck(Math.min(1000, activeReminder.expiresAt - Date.now()))
    return
  }
  const now = new Date()
  renderScheduleUi()
  if (!connected) { queueReminderCheck(30_000); return }
  const occurrences = schedule.remindersEnabled ? upcomingClasses(schedule.courses, now, 1) : []
  const due = occurrences.filter(item => item.reminderAt <= now.getTime() && !reminderLog[item.key]).slice(0, 3)
  if (!due.length) {
    const next = occurrences.find(item => !reminderLog[item.key])
    queueReminderCheck(next ? Math.min(30_000, next.reminderAt - now.getTime()) : 30_000)
    return
  }
  await showClassReminder(due)
}

async function showClassReminder(items: ClassOccurrence[]) {
  reminderBusy = true
  cancelHomeClick(); cancelTodoClick(); cancelLeetcodeClick(); cancelNewConversationClick()
  cancelAlgorithmClick()
  cancelTelepromptClick()
  telepromptView.suspend()
  if (page === 'teleprompt' && telepromptFollower.active) {
    resumeTelepromptAfterReminder = true
    void telepromptFollower.stop('Paused for class reminder')
  }
  hudAnimationEpoch += 1
  activeReminder = { items, expiresAt: Date.now() + 20_000 }
  try {
    await renderHud()
    if (hudLayoutPage !== 'reminder' || appExited || !connected) throw new Error('Could not show the class reminder')
    activeReminder.expiresAt = Date.now() + 20_000
    for (const item of items) reminderLog[item.key] = Date.now()
    reminderLog = parseReminderLog(JSON.stringify(reminderLog))
    persist(REMINDER_KEY, reminderLog)
    showToast(`Class in ${Math.ceil((items[0].date.getTime() - Date.now()) / 60_000)} min: ${items[0].course.title}`)
  } catch (error) {
    console.error('Class reminder failed', error)
    activeReminder = null
    hudAnimationEpoch += 1
    await restoreReminderDisplay().catch(restoreError => console.error('Reminder fallback failed', restoreError))
  } finally { reminderBusy = false; updateHudControls(); resumeTelepromptIfNeeded(); queueReminderCheck(activeReminder ? 1000 : 30_000) }
}

function saveSchedule(next: ScheduleData) {
  const previous = schedule
  try {
    persist(SCHEDULE_KEY, next)
    schedule = next
    renderScheduleUi()
    void renderHud()
    queueReminderCheck()
    return true
  } catch {
    schedule = previous
    showToast('Could not save the timetable. Please try again.', true)
    return false
  }
}

function controlGlassesMicrophone(open: boolean): Promise<boolean> {
  const operation = microphoneQueue.then(() => bridge.audioControl(open, AudioInputSource.Glasses))
  microphoneQueue = operation.catch(() => false)
  return operation
}

async function saveTeleprompt(script: TelepromptScript) {
  try {
    validateScript(script)
    if (script.title === savedTeleprompt.title && script.text === savedTeleprompt.text && script.language === savedTeleprompt.language) return true
    resumeTelepromptAfterReminder = false
    await telepromptFollower.stop('Script saved / manual mode')
    persist(TELEPROMPT_KEY, script)
    savedTeleprompt = { ...script }
    telepromptDocument.load(savedTeleprompt)
    renderTelepromptPhone()
    if (page === 'teleprompt') { hudAnimationEpoch++; void renderHud() }
    return true
  } catch (error) { showToast(error instanceof Error ? error.message : 'Could not save the script.', true); return false }
}

async function startTelepromptFollowing() {
  try {
    if (telepromptFollower.active) return
    if (!hudActive || hudMinimized || activeReminder || reminderBusy || hudTransitioning || appExited) throw new Error('Restore the glasses display before starting Teleprompt.')
    if (!connected) throw new Error('Connect the glasses before starting voice follow.')
    if (!telepromptDocument.lines.length) { setPhoneTab('teleprompt'); throw new Error('Type a script or import a TXT file on the phone first.') }
    settings = readSettingsForm()
    if (!settings.apiKey || !settings.transcriptionUrl || !settings.transcriptionModel || !settings.model) {
      showPanel('settings-panel', true)
      throw new Error('Configure the chat API key/model and transcription API in Setup first.')
    }
    persist(STORAGE_KEY, settings)
    if (recording) await finishVoiceCapture(false)
    setPage('teleprompt')
    await renderHud()
    if (page !== 'teleprompt' || hudLayoutPage !== 'teleprompt') throw new Error('Could not open Teleprompt on the glasses.')
    await telepromptFollower.start({ ...settings, relayBase: aiRelayBase(), language: savedTeleprompt.language })
  } catch (error) { showToast(error instanceof Error ? error.message : 'Could not start voice follow.', true) }
}

async function toggleTelepromptFollowing() {
  if (telepromptFollower.active || resumeTelepromptAfterReminder) {
    resumeTelepromptAfterReminder = false
    await telepromptFollower.stop()
  } else await startTelepromptFollowing()
}

function resumeTelepromptIfNeeded() {
  if (!resumeTelepromptAfterReminder || activeReminder || reminderBusy || reminderRestorePending) return
  resumeTelepromptAfterReminder = false
  renderTelepromptPhone()
  if (page === 'teleprompt' && hudActive && !hudMinimized && !appExited && connected) void startTelepromptFollowing()
}

function cancelTelepromptClick() {
  if (telepromptClickTimer !== undefined) window.clearTimeout(telepromptClickTimer)
  telepromptClickTimer = undefined
}

function telepromptContainers() {
  const doc = telepromptDocument
  const frame = telepromptView.frame
  const status = telepromptFollower.active ? telepromptFollower.status.includes('Matching') ? 'Matching' : telepromptFollower.status.includes('Recognizing') ? 'Recognizing' : 'Listening' : 'Manual'
  const text = (row: typeof frame.rows[number]) => `${row.marker ? '> ' : '  '}${row.text}`
  return [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262, containerID: 1,
      containerName: 'prompt-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
      borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 59, yPosition: 23, width: 486, height: 27, containerID: 4,
      containerName: 'prompt-header', content: nativeText(`Teleprompt / ${telepromptFollower.active ? 'MIC ON' : 'MANUAL'}`, 478),
      isEventCapture: 0, textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 50, width: 514, height: 27, containerID: 11,
      containerName: 'prompt-context', content: text(frame.rows[0]), isEventCapture: 0,
      textColor: frame.rows[0].level, zOrderIndex: 9, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 77, width: 514, height: 27, containerID: 5,
      containerName: 'prompt-focus', content: text(frame.rows[1]), isEventCapture: 0,
      textColor: frame.rows[1].level, zOrderIndex: 10, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 104, width: 514, height: 27, containerID: 12,
      containerName: 'prompt-next', content: text(frame.rows[2]), isEventCapture: 0,
      textColor: frame.rows[2].level, zOrderIndex: 11, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 131, width: 514, height: 108, containerID: 13,
      containerName: 'prompt-upcoming', content: frame.rows.slice(3).map(text).join('\n'), isEventCapture: 0,
      textColor: 3, zOrderIndex: 12, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 242, width: 514, height: 27, containerID: 10,
      containerName: 'prompt-footer', content: nativeText(`${doc.lines.length ? `${frame.line + 1}/${doc.lines.length} / ` : ''}${frame.moving ? 'Following' : status} / Tap: ${telepromptFollower.active ? 'pause' : 'follow'} / Double-tap: back`),
      isEventCapture: 0, textColor: 2, zOrderIndex: 14, borderWidth: 0, paddingLength: 0 }),
  ]
}

function algorithmContainers() {
  const article = algorithmBrowser.article
  const entries = algorithmBrowser.entries
  const selected = algorithmBrowser.selectedIndex
  const first = Math.max(0, Math.min(selected - 2, entries.length - 5))
  const visible = algorithmBrowser.window
  const shared = [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262, containerID: 1,
      containerName: 'algo-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
      borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 59, yPosition: 23, width: 486, height: 27, containerID: 4,
      containerName: 'algo-header', content: nativeText(article?.title ?? algorithmBrowser.folder.title, 478),
      isEventCapture: 0, textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
  ]
  if (article) return [...shared,
    new TextContainerProperty({ xPosition: 31, yPosition: 50, width: 514, height: 189, containerID: 5,
      containerName: 'algo-body', content: visible.lines.map(line => line || ' ').join('\n') || ' ',
      isEventCapture: 0, textColor: 4, zOrderIndex: 9, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 242, width: 514, height: 27, containerID: 10,
      containerName: 'algo-footer', content: `${visible.start + 1}-${Math.min(visible.start + 7, algorithmBrowser.document.lines.length)}/${algorithmBrowser.document.lines.length} / Swipe: read / Double-tap: back`,
      isEventCapture: 0, textColor: 2, zOrderIndex: 14, borderWidth: 0, paddingLength: 0 }),
  ]
  const current = entries[selected]
  const summary = current?.kind === 'folder' ? `${algorithmCount(current.id)} notes / folder` : current?.time ?? ' '
  return [...shared,
    ...Array.from({ length: 5 }, (_, index) => {
      const node = entries[first + index]
      return new TextContainerProperty({ xPosition: 31, yPosition: 56 + index * 27, width: 514, height: 27,
        containerID: 5 + index, containerName: `algo-row-${index}`, content: node
          ? nativeText(`${first + index === selected ? '>' : '-'} ${node.kind === 'folder' ? '+ ' : ''}${node.title}`) : ' ',
        isEventCapture: 0, textColor: 4, zOrderIndex: 9 + index, borderWidth: 0, paddingLength: 0 })
    }),
    new TextContainerProperty({ xPosition: 31, yPosition: 208, width: 514, height: 60, containerID: 10,
      containerName: 'algo-footer', content: nativeText(`${selected + 1}/${entries.length} / ${summary}\nTap: open / Double-tap: back`),
      isEventCapture: 0, textColor: 2, zOrderIndex: 14, borderWidth: 0, paddingLength: 0 }),
  ]
}

function cancelAlgorithmClick() {
  if (algorithmClickTimer !== undefined) window.clearTimeout(algorithmClickTimer)
  algorithmClickTimer = undefined
}

function updateAlgorithmView() {
  hudAnimationEpoch += 1
  lastAlgorithmScrollAt = -Infinity
  lastAlgorithmScrollDirection = null
  void renderHud()
}

function nativeWeatherContainers() {
  return buildNativeWeatherContainers(weather, weatherExtras, weatherView, settings.temperatureUnit, weatherDetailsContent())
}

function todoContainers() {
  const pending = glassesTodoItems()
  selectedTodoIndex = Math.max(0, Math.min(selectedTodoIndex, pending.length - 1))
  const first = Math.max(0, Math.min(selectedTodoIndex - 2, pending.length - 5))
  const visible = pending.slice(first, first + 5)
  const encoder = new TextEncoder()
  const labels = visible.map((todo, index) => {
    const characters = [...pxTruncate(`${first + index === selectedTodoIndex ? '>' : '-'} ${todo.completed ? '[x]' : '[ ]'} ${todo.text}`, 500)]
    while (encoder.encode(characters.join('')).length > 128) characters.pop()
    return characters.join('')
  })
  const selected = pending[selectedTodoIndex]
  const emptyWidth = getTextWidth(EMPTY_TODO_TEXT)
  return [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262, containerID: 1,
      containerName: 'todo-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
      borderWidth: 1, borderColor: 8, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 59, yPosition: 23, width: 486, height: 27, containerID: 4,
      containerName: 'todo-header', content: pending.length ? `To-do list / ${selectedTodoIndex + 1} of ${pending.length}` : 'To-do list',
      isEventCapture: 0, textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    ...Array.from({ length: 5 }, (_, index) => new TextContainerProperty({ xPosition: 31, yPosition: 56 + index * 27, width: 514, height: 27,
      containerID: 5 + index, containerName: `todo-row-${index}`, content: labels[index] ?? (!pending.length && index === 3
        ? `${' '.repeat(Math.max(0, Math.floor((514 - emptyWidth) / (2 * getTextWidth(' ')))))}${EMPTY_TODO_TEXT}` : ' '),
      isEventCapture: 0, textColor: visible[index]?.completed ? 2 : 4, zOrderIndex: 9 + index, borderWidth: 0, paddingLength: 0 })),
    new TextContainerProperty({ xPosition: 31, yPosition: 208, width: 514, height: 60, containerID: 10,
      containerName: 'todo-footer', content: selected ? `${pxTruncate(todoDueLabel(selected), 506)}\n${selected.completed ? 'Completed / Tap: restore' : 'Tap: complete'} / Double-tap: home`
        : ' \nAdd a task on your phone or ask AI',
      isEventCapture: 0, textColor: 2, zOrderIndex: 14, borderWidth: 0, paddingLength: 0 }),
  ]
}

function cancelTodoClick() {
  if (todoClickTimer !== undefined) window.clearTimeout(todoClickTimer)
  todoClickTimer = undefined
}

async function moveTodoSelection(direction: -1 | 1) {
  if (page !== 'todo' || !hudActive || hudMinimized || appExited || hudTransitioning) return
  const next = Math.max(0, Math.min(glassesTodoItems().length - 1, selectedTodoIndex + direction))
  if (next === selectedTodoIndex) return
  selectedTodoIndex = next
  await renderHud()
}

function toggleGlassesTodo(id: string) {
  if (page !== 'todo' || !hudActive || hudMinimized || appExited || hudTransitioning) return
  const task = todos.find(todo => todo.id === id)
  if (!task) return
  const previous = todos
  todos = todos.map(todo => todo.id === id ? { ...todo, completed: !todo.completed } : todo)
  try { saveTodos(); showToast(`${task.completed ? 'Restored' : 'Completed'}: ${task.text}`) }
  catch { todos = previous; showToast('Could not save this to-do change. Please try again.', true) }
}

function leetcodeContainers() {
  const visible = readerWindow(dailyDocument, dailyScroll)
  dailyScroll = visible.start
  let content = visible.lines.map(line => line || ' ').join('\n') || ' '
  let title = dailyProblem ? `#${dailyProblem.number}. ${dailyProblem.title}` : 'LeetCode daily'
  if (leetcodeImageIndex !== null && !dailyDocument.images[leetcodeImageIndex]) leetcodeImageIndex = null
  const image = leetcodeImageIndex === null ? null : dailyDocument.images[leetcodeImageIndex]
  if (image) {
    const loaded = image.url ? dailyImages.get(image.url) : 'failed'
    const status = loaded === 'failed' ? 'Image unavailable - see phone' : 'Loading image...'
    content = loaded && typeof loaded !== 'string' ? ' ' : ` \n \n \n${status}`
    title = `#${dailyProblem?.number ?? '--'} / Image ${leetcodeImageIndex! + 1} of ${dailyDocument.images.length}`
    if (image.url && !loaded) void ensureDailyImage(image.url)
  }
  const stale = dailyProblem && dailyProblem.date !== new Date().toISOString().slice(0, 10)
  const status = dailyLoading ? 'Updating...' : dailyError ? 'Offline cache / tap to retry' : stale ? 'Cached challenge' : 'Swipe to read'
  const footer = image ? `Image ${leetcodeImageIndex! + 1}/${dailyDocument.images.length} / Swipe: images / Tap: text`
    : `${dailyProblem?.date ?? 'LeetCode'} / ${status} / ${visible.start + 1}-${Math.min(visible.start + 7, dailyDocument.lines.length)}/${dailyDocument.lines.length}`
  return [
    new TextContainerProperty({ xPosition: 18, yPosition: 10, width: 540, height: 262,
      containerID: 1, containerName: 'lc-input', content: ' ', isEventCapture: 1, textColor: 0,
      zOrderIndex: 5, borderWidth: 1, borderColor: 7, borderRadius: 8, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 59, yPosition: 23, width: 486, height: 27,
      containerID: 4, containerName: 'lc-title', content: pxTruncate(title, 480),
      isEventCapture: 0, textColor: 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: READER_BODY.x, yPosition: READER_BODY.y, width: READER_BODY.width, height: READER_BODY.height,
      containerID: 5, containerName: 'lc-body', content,
      isEventCapture: 0, textColor: 4, zOrderIndex: 9, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: 244, width: 514, height: 27,
      containerID: 6, containerName: 'lc-progress', content: pxTruncate(footer, 506),
      isEventCapture: 0, textColor: 2, zOrderIndex: 10, borderWidth: 0, paddingLength: 0 }),
  ]
}

function drawLeetcodeArtwork() {
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  blendLayer(pixels, drawSectionIcon('leetcode'), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
  const image = leetcodeImageIndex === null ? null : dailyDocument.images[leetcodeImageIndex]
  const loaded = image?.url ? dailyImages.get(image.url) : null
  if (!loaded || typeof loaded === 'string') return pixels
  const x = READER_BODY.x + Math.floor((READER_BODY.width - loaded.width) / 2)
  const y = READER_BODY.y + Math.floor((READER_BODY.height - loaded.height) / 2)
  blendLayer(pixels, loaded.pixels, loaded.width, x, y, 1, READER_BODY)
  return pixels
}

async function ensureDailyImage(url: string) {
  if (dailyImages.has(url)) return
  dailyImages.set(url, 'loading')
  const request = dailyImageEpoch
  try {
    const image = await loadProblemImage(url, aiRelayBase())
    if (request === dailyImageEpoch) dailyImages.set(url, image)
  } catch { if (request === dailyImageEpoch) dailyImages.set(url, 'failed') }
  if (request !== dailyImageEpoch) return
  // Bound resident diagram memory while keeping failures stable until retry.
  const ready = [...dailyImages].filter(([, image]) => typeof image !== 'string')
  for (const [key] of ready.slice(0, Math.max(0, ready.length - 10))) dailyImages.delete(key)
  if (page === 'leetcode' && hudActive && !hudMinimized) void renderHud()
}

async function refreshDailyProblem(force = false) {
  if (dailyLoading) return
  if (!force && dailyProblem && dailyProblem.date === new Date().toISOString().slice(0, 10)
    && dailyProblem.difficulty !== null && dailyProblem.accepted !== null && dailyProblem.submissions !== null
    && Date.now() - dailyProblem.fetchedAt < 15 * 60_000) { updateDailyPhone(); return }
  dailyLoading = true
  dailyError = ''
  if (!dailyProblem) dailyDocument = { lines: ['Loading daily challenge...', '', 'Swipe up/down to read.', 'Double-tap to return home.'], images: [] }
  updateDailyPhone()
  if (page === 'leetcode') void renderHud()
  const request = ++dailyRequest
  try {
    const problem = await fetchDailyProblem(aiRelayBase())
    if (request !== dailyRequest) return
    const changed = dailyProblem?.slug !== problem.slug || dailyProblem?.html !== problem.html
    const statsChanged = dailyProblem?.difficulty !== problem.difficulty || dailyProblem?.accepted !== problem.accepted
      || dailyProblem?.submissions !== problem.submissions || dailyProblem?.acceptanceRate !== problem.acceptanceRate
    dailyProblem = problem
    if (changed || statsChanged) dailyDocument = buildReaderDocument(problem, getTextWidth)
    if (changed) {
      dailyScroll = 0
      leetcodeImageIndex = null
      dailyImageEpoch += 1
      dailyImages.clear()
    } else for (const [url, state] of dailyImages) if (state === 'failed') dailyImages.delete(url)
    try { localStorage.setItem(readerCacheKey, JSON.stringify(problem)) } catch { /* Reading remains available if storage is full. */ }
  } catch (error) {
    dailyError = error instanceof Error ? error.message : 'Cannot load daily challenge. Tap to retry.'
    if (!dailyProblem) dailyDocument = { lines: ['Daily challenge unavailable.', '', ...fitPreviewLines(dailyError, 3), '', 'Tap to retry / double-tap to exit.'], images: [] }
  } finally {
    dailyLoading = false
    updateDailyPhone()
    if (page === 'leetcode' || (page === 'home' && selectedSection === 'leetcode')) void renderHud()
  }
}

async function moveLeetcodeScroll(direction: -1 | 1) {
  if (page !== 'leetcode' || !hudActive || hudMinimized || appExited || hudTransitioning) return
  if (leetcodeImageIndex !== null) {
    const count = dailyDocument.images.length
    if (count < 2) return
    leetcodeImageIndex = (leetcodeImageIndex + direction + count) % count
    await renderHud()
    return
  }
  const visible = readerWindow(dailyDocument, dailyScroll + direction * 2)
  if (visible.start === dailyScroll) return
  dailyScroll = visible.start
  console.debug('HUD LeetCode scroll', { line: dailyScroll, total: dailyDocument.lines.length })
  await renderHud()
}

function cancelLeetcodeClick() {
  if (leetcodeClickTimer !== undefined) window.clearTimeout(leetcodeClickTimer)
  leetcodeClickTimer = undefined
}

function toggleLeetcodeImage() {
  if (page !== 'leetcode' || !hudActive || hudMinimized || appExited || hudTransitioning) return
  if (leetcodeImageIndex !== null) leetcodeImageIndex = null
  else if (dailyDocument.images.length) {
    // Open the reference nearest the current text position. With no visible
    // reference, this still gives a predictable image at any reading position.
    const center = dailyScroll + 3
    let closest = 0
    dailyDocument.images.forEach((image, index) => {
      if (Math.abs(image.start - center) < Math.abs(dailyDocument.images[closest].start - center)) closest = index
    })
    leetcodeImageIndex = closest
    const url = dailyDocument.images[closest].url
    if (url && dailyImages.get(url) === 'failed') dailyImages.delete(url)
  } else if (dailyError || !dailyProblem) { void refreshDailyProblem(true); return }
  else return
  lastLeetcodeScrollEventAt = -Infinity
  lastLeetcodeScrollDirection = null
  void renderHud()
}

function updateDailyPhone() {
  const status = byId<HTMLElement>('leetcode-status')
  if (!status) return
  status.textContent = dailyLoading ? 'Loading problem...' : dailyError || (dailyProblem
    ? `${dailyProblem.date} / International daily challenge` : 'English daily challenge / no API key needed')
  byId<HTMLElement>('leetcode-title').textContent = dailyProblem ? `#${dailyProblem.number}. ${dailyProblem.title}` : 'LeetCode daily'
  const link = byId<HTMLAnchorElement>('leetcode-source')
  link.href = dailyProblem?.url ?? 'https://leetcode.com/problemset/'
  const content = byId<HTMLElement>('leetcode-statement')
  if (content.dataset.source === dailyProblem?.fetchedAt.toString()) return
  content.replaceChildren()
  if (!dailyProblem) return
  content.dataset.source = dailyProblem.fetchedAt.toString()
  let start = 0
  for (const image of dailyDocument.images) {
    const text = document.createElement('p')
    text.textContent = dailyDocument.lines.slice(start, image.start).join('\n')
    content.append(text)
    if (image.url) {
      const picture = document.createElement('img')
      picture.src = image.url; picture.alt = image.alt; picture.loading = 'lazy'; picture.referrerPolicy = 'no-referrer'
      content.append(picture)
    }
    start = image.start + image.rows
  }
  const text = document.createElement('p')
  text.textContent = dailyDocument.lines.slice(start).join('\n')
  content.append(text)
}

function surfaceContainers(currentPage?: Page) {
  if (activeReminder) return reminderContainers()
  if (hudMinimized) return [new TextContainerProperty({ xPosition: 0, yPosition: 0, width: HUD_WIDTH, height: HUD_HEIGHT,
    containerID: 1, containerName: 'mini-input', content: ' ', isEventCapture: 1, textColor: 0,
    zOrderIndex: 5, borderWidth: 0, paddingLength: 0 })]
  if (currentPage === 'weather') return nativeWeatherContainers()
  if (currentPage === 'leetcode') return leetcodeContainers()
  if (currentPage === 'todo') return todoContainers()
  if (currentPage === 'schedule') return scheduleContainers()
  if (currentPage === 'algorithms') return algorithmContainers()
  if (currentPage === 'teleprompt') return telepromptContainers()
  if (NATIVE_HOME_TEXT && currentPage === 'home') {
    // Static labels and a separate native marker column avoid space padding.
    return [
      new TextContainerProperty({ xPosition: 250, yPosition: CARD_TOP, width: CARD_WIDTH, height: CARD_HEIGHT,
        containerID: 1, containerName: 'home-frame', content: ' ', isEventCapture: 1,
        textColor: 0, zOrderIndex: 4, borderWidth: 1, borderColor: 10, borderRadius: 8, paddingLength: 0 }),
      ...(FAST_NATIVE_HOME ? Array.from({ length: 5 }, (_, index) => new TextContainerProperty({
        xPosition: 290, yPosition: 42 + index * DASHBOARD_LINE_HEIGHT, width: 220, height: DASHBOARD_LINE_HEIGHT,
        containerID: index + 2, containerName: `home-row-${index}`, content: homeSections(homeFolder)[index] ? homeSectionLabel(homeSections(homeFolder)[index]) : ' ',
        isEventCapture: 0, textColor: 4,
        zOrderIndex: index + 6, borderWidth: 0, paddingLength: 0,
      })) : []),
      ...(FAST_NATIVE_HOME ? [new TextContainerProperty({
        xPosition: HOME_INDICATOR_RECT.x, yPosition: HOME_INDICATOR_RECT.y,
        width: HOME_INDICATOR_RECT.width, height: HOME_INDICATOR_RECT.height,
        containerID: 11, containerName: 'home-indicators', content: homeNativeIndicators(selectedSection, homeFolder),
        isEventCapture: 0, textColor: 4, zOrderIndex: 11, borderWidth: 0, paddingLength: 0,
      })] : []),
      // Share one native slot for the divider and synopsis to keep five fixed
      // single-row labels within the firmware's eight-text-container limit.
      new TextContainerProperty({ xPosition: 263, yPosition: FAST_NATIVE_HOME ? 168 : 208, width: 262, height: FAST_NATIVE_HOME ? 72 : 32,
        containerID: 9, containerName: 'home-summary', content: `${FAST_NATIVE_HOME ? `${HOME_DIVIDER_TEXT}\n` : ''}${nativeHomeSummary(selectedSection)}`, isEventCapture: 0,
        textColor: 4, zOrderIndex: 12, borderWidth: 0, paddingLength: 0 }),
    ]
  }
  const detail = currentPage && currentPage !== 'home' ? pageTextContainers(currentPage) : []
  const emptyWidth = getTextWidth(EMPTY_TODO_TEXT)
  if (NATIVE_HOME_TEXT && currentPage && currentPage !== 'home') {
    return [
      new TextContainerProperty({ xPosition: DETAIL_RECT.x, yPosition: DETAIL_RECT.y, width: DETAIL_RECT.width, height: DETAIL_RECT.height,
        containerID: 1, containerName: 'hud-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5,
        borderWidth: 1, borderColor: detail[1]?.borderColor ?? 7, borderRadius: 8, paddingLength: 0 }),
      new TextContainerProperty({ xPosition: DETAIL_TITLE_X, yPosition: DETAIL_TITLE_Y, width: 486, height: DASHBOARD_LINE_HEIGHT,
        containerID: 4, containerName: 'page-title', content: detail[0]?.content ?? ' ', isEventCapture: 0,
        textColor: detail[0]?.textColor ?? 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
      new TextContainerProperty({ xPosition: 31, yPosition: DETAIL_BODY_Y, width: 514, height: 209,
        containerID: 5, containerName: 'page-body', content: detail[1]?.content ?? ' ', isEventCapture: 0,
        textColor: 4, zOrderIndex: 9, borderWidth: 0, paddingLength: 0 }),
      new TextContainerProperty({ xPosition: Math.floor((HUD_WIDTH - emptyWidth) / 2), yPosition: DETAIL_EMPTY_Y, width: emptyWidth + 2, height: DASHBOARD_LINE_HEIGHT,
        containerID: 6, containerName: 'page-empty', content: detail[2]?.content ?? ' ', isEventCapture: 0,
        textColor: 4, zOrderIndex: 10, borderWidth: 0, paddingLength: 0 }),
    ]
  }
  const homeOverlay = currentPage === 'home' && selectedSection === 'ai'
    ? transitionTextHidden ? '\n'.repeat(Math.max(0, cardContent('ai').split('\n').length - 2))
      : nativeOverlayText(cardContent('ai').split('\n').slice(1).join('\n'))
    : ' '
  const detailContent = detail[1]?.content ?? ' '
  const body = currentPage === 'chat'
    ? transitionTextHidden ? detailContent.split('\n').map(() => ' ').join('\n') : detailContent
    : detailContent.split('\n').slice(0, 7).map(line => pxTruncate(line, 510)).join('\n')
  // Stable text slots keep native fallback and page geometry without rebuilding.
  return [
    new TextContainerProperty({ xPosition: 0, yPosition: 0, width: HUD_WIDTH, height: HUD_HEIGHT, containerID: 1, containerName: 'hud-input', content: ' ', isEventCapture: 1, textColor: 0, zOrderIndex: 5, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 291, yPosition: 49, width: 234, height: DASHBOARD_LINE_HEIGHT, containerID: 2, containerName: 'home-title', content: ' ', isEventCapture: 0, textColor: 4, zOrderIndex: 6, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 263, yPosition: 76, width: 262, height: 165, containerID: 3, containerName: 'home-body', content: homeOverlay || ' ', isEventCapture: 0, textColor: 4, zOrderIndex: 7, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: DETAIL_TITLE_X, yPosition: DETAIL_TITLE_Y, width: 486, height: DASHBOARD_LINE_HEIGHT, containerID: 4, containerName: 'page-title', content: detail[0]?.content ?? ' ', isEventCapture: 0, textColor: detail[0]?.textColor ?? 4, zOrderIndex: 8, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: 31, yPosition: DETAIL_BODY_Y, width: 514, height: 209, containerID: 5, containerName: 'page-body', content: body, isEventCapture: 0, textColor: 4, zOrderIndex: 9, borderWidth: 0, paddingLength: 0 }),
    new TextContainerProperty({ xPosition: Math.floor((HUD_WIDTH - emptyWidth) / 2), yPosition: DETAIL_EMPTY_Y, width: emptyWidth + 2, height: DASHBOARD_LINE_HEIGHT, containerID: 6, containerName: 'page-empty', content: detail[2]?.content ?? ' ', isEventCapture: 0, textColor: 4, zOrderIndex: 10, borderWidth: 0, paddingLength: 0 }),
  ]
}

function surfaceImageContainers(layout: SurfaceLayout) {
  return surfaceRects(layout).map((rect, index) => new ImageContainerProperty({
    xPosition: rect.x, yPosition: rect.y,
    width: rect.width, height: rect.height, containerID: 20 + index,
    containerName: layout === 'symbol-home' && index === 3 ? 'home-icons' : `hud-tile-${index}`,
    zOrderIndex: layout === 'symbol-home' && index === 3 ? 5
      : (layout === 'native-home' || layout === 'symbol-home') && index === 3 ? 12 : index + 1,
  }))
}

function drawHomeBackground() {
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  blendLayer(pixels, drawClockImage(), LEFT_WIDTH, 18, HEADER_TOP)
  blendLayer(pixels, drawWeatherWidgetImage(), LEFT_WIDTH, 18, 166)
  blendLayer(pixels, drawBatteryImage(), 32, 506, HEADER_TOP)
  if (NATIVE_HOME_TEXT) {
    if (!FAST_NATIVE_HOME) blendLayer(pixels, drawHomeMenu(selectedSection), HOME_MENU_RECT.width, HOME_MENU_RECT.x, HOME_MENU_RECT.y)
  }
  return pixels
}

function drawHomeMenu(selected: Section) {
  const key = `${homeFolder}:${selected}`
  const cached = homeMenuCache.get(key)
  if (cached) return cached
  const { width, height } = HOME_MENU_RECT
  const pixels = new Uint8Array(width * height)
  homeSections(homeFolder).forEach((section, index) => {
    const row = new Uint8Array(width * DASHBOARD_LINE_HEIGHT)
    drawDashboardText(row, width, homeSectionLabel(section), 27, 0)
    const icon = drawSectionIcon(section)
    for (let y = 0; y < DASHBOARD_ICON_SIZE; y++) {
      row.set(icon.subarray(y * DASHBOARD_ICON_SIZE, (y + 1) * DASHBOARD_ICON_SIZE), (y + 4) * width)
    }
    if (section !== selected) for (let offset = 0; offset < row.length; offset++) row[offset] = Math.round(row[offset] / 5)
    pixels.set(row, index * DASHBOARD_LINE_HEIGHT * width)
  })
  homeMenuCache.set(key, pixels)
  return pixels
}

function drawHomeIconColumn() {
  const { width, height } = HOME_ICON_COLUMN_RECT
  const pixels = new Uint8Array(width * height)
  homeSections(homeFolder).forEach((section, index) => {
    const icon = drawSectionIcon(section)
    for (let row = 0; row < DASHBOARD_ICON_SIZE; row++) {
      pixels.set(icon.subarray(row * width, (row + 1) * width), (index * DASHBOARD_LINE_HEIGHT + 4 + row) * width)
    }
  })
  return pixels
}

function cachedHudPng(pixels: Uint8Array, width: number, height: number) {
  const found = hudPngCache.findIndex(entry => entry.width === width && entry.height === height
    && entry.pixels.length === pixels.length && !pixels.some((pixel, index) => pixel !== entry.pixels[index]))
  if (found >= 0) {
    const [entry] = hudPngCache.splice(found, 1)
    hudPngCache.push(entry)
    return entry.png
  }
  const entry = { pixels, width, height, png: encodeGrayPng(pixels, width, height) }
  hudPngCache.push(entry)
  if (hudPngCache.length > 16) hudPngCache.shift()
  void entry.png.catch(() => {
    const index = hudPngCache.indexOf(entry)
    if (index >= 0) hudPngCache.splice(index, 1)
  })
  return entry.png
}

function drawSectionIcon(section: Section, brightness = 255) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = DASHBOARD_ICON_SIZE
  const context = canvas.getContext('2d')
  if (context) drawDashboardIcon(context, section, 0, 0)
  const pixels = canvasGrayscale(canvas)
  if (brightness < 255) for (let index = 0; index < pixels.length; index++) pixels[index] = Math.round(pixels[index] * brightness / 255)
  return pixels
}

function drawStaticPage(currentPage: Page) {
  if (activeReminder) return new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  if (hudMinimized) {
    const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
    blendLayer(pixels, drawClockImage(false), LEFT_WIDTH, 18, HEADER_TOP)
    return pixels
  }
  if (currentPage === 'home') {
    const pixels = drawHomeBackground()
    if (NATIVE_HOME_TEXT && FAST_NATIVE_HOME) blendLayer(pixels, drawHomeIconColumn(), HOME_ICON_COLUMN_RECT.width, HOME_ICON_COLUMN_RECT.x, HOME_ICON_COLUMN_RECT.y)
    if (!NATIVE_HOME_TEXT) blendLayer(pixels, drawSectionCard(selectedSection), CARD_WIDTH, 250, CARD_TOP)
    return pixels
  }
  if (currentPage === 'chat') return drawChatPageFrame()
  if (currentPage === 'leetcode') return drawLeetcodeArtwork()
  if (currentPage === 'schedule') {
    const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
    blendLayer(pixels, drawSectionIcon('schedule'), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
    return pixels
  }
  if (currentPage === 'algorithms' || currentPage === 'teleprompt') {
    const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
    blendLayer(pixels, drawSectionIcon(currentPage), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
    return pixels
  }
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  if (currentPage === 'weather') {
    blendLayer(pixels, drawSectionIcon('weather'), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
    blendLayer(pixels, weatherOverlay(), HUD_WIDTH)
    return pixels
  }
  const body = pageTextContainers(currentPage)[1]
  paintFrame(pixels, DETAIL_RECT, (body.borderColor ?? 8) * 17)
  blendLayer(pixels, drawSectionIcon(currentPage), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
  if (currentPage === 'info') drawHudRules(pixels, INFO_RULES)
  return pixels
}

function drawChatPageFrame() {
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  const conversation = chatContainers()[1]
  paintFrame(pixels, DETAIL_RECT, (conversation.borderColor ?? 8) * 17)
  blendLayer(pixels, drawSectionIcon('ai'), DASHBOARD_ICON_SIZE, DETAIL_ICON_X, DETAIL_ICON_Y)
  return pixels
}

function textBitmap(text: string, x = 0, y = 0, width = HUD_WIDTH, brightness = 4) {
  const pixels = new Uint8Array(HUD_WIDTH * HUD_HEIGHT)
  text.split('\n').forEach((line, index) => {
    const clipped = pxTruncate(line, width)
    // Uncaptured scripts remain native on the final page, without invented glyphs.
    if (supportsDashboardText(clipped)) drawDashboardText(pixels, HUD_WIDTH, clipped, x, y + index * DASHBOARD_LINE_HEIGHT)
  })
  if (brightness !== 4) for (let index = 0; index < pixels.length; index++) pixels[index] = Math.round(pixels[index] * brightness / 4)
  return pixels
}

function prepareNavigation(section: Section, detailPage: Page): NavigationArt {
  const lines = cardContent(section).split('\n')
  const detail = pageTextContainers(detailPage)
  const emptyHome = section === 'todo' && pendingTodos().length === 0
  const detailBody = textBitmap(detail[1].content ?? '', 31, DETAIL_BODY_Y, 514)
  if (detailPage === 'weather') blendLayer(detailBody, weatherOverlay(), HUD_WIDTH)
  if (detailPage === 'info') detailBody.fill(72, 119 * HUD_WIDTH + 31, 119 * HUD_WIDTH + 545)
  const homeBody = emptyHome ? textBitmap(EMPTY_TODO_TEXT, Math.floor(250 + (CARD_WIDTH - getTextWidth(EMPTY_TODO_TEXT)) / 2), Math.floor(CARD_TOP + (CARD_HEIGHT - DASHBOARD_LINE_HEIGHT) / 2))
    : textBitmap(lines.slice(1).join('\n'), 263, 76, 262)
  if (section === 'info') homeBody.fill(72, 144 * HUD_WIDTH + 263, 144 * HUD_WIDTH + 525)
  return {
    background: drawHomeBackground(),
    homeBody,
    detailBody,
    homeTitle: textBitmap(lines[0]),
    detailTitle: textBitmap(detail[0].content ?? '', 0, 0, 486, detail[0].textColor),
    icon: drawSectionIcon(section),
    detailIcon: drawSectionIcon(detailPage === 'chat' ? 'ai' : detailPage === 'home' ? section : detailPage),
    from: { x: 250, y: CARD_TOP, width: CARD_WIDTH, height: CARD_HEIGHT },
    to: DETAIL_RECT,
    fromBodyY: 76, toBodyY: DETAIL_BODY_Y,
    fromTitle: { x: 291, y: 49 }, toTitle: { x: DETAIL_TITLE_X, y: DETAIL_TITLE_Y },
    fromIcon: { x: 263, y: 53 }, toIcon: { x: DETAIL_ICON_X, y: DETAIL_ICON_Y },
    targetBorder: (detail[1].borderColor ?? 8) * 17,
    centeredText: emptyHome && detailPage === 'todo' ? EMPTY_TODO_TEXT : undefined,
  }
}

function queueHudRender(task: () => Promise<void>) {
  const result = hudRenderQueue.then(task)
  // A failed image must not prevent later navigation or shutdown from running.
  hudRenderQueue = result.catch(() => undefined)
  return result
}

async function animateHudFrames(duration: number, epoch: number, draw: (progress: number) => Promise<void>) {
  // Preparation and layout changes finish before this clock starts. On faster
  // links there is room for 60 updates/s; slow links skip obsolete frames.
  const interval = 1000 / 60
  const steps = Math.ceil(duration / interval)
  const started = performance.now()
  let displayed = 0, transferMs = 0
  for (let step = 1; step < steps; step++) {
    if (!hudActive || appExited || epoch !== hudAnimationEpoch) return
    const frameStarted = performance.now()
    const progress = Math.min(1, Math.max(step / steps, (frameStarted - started) / duration))
    if (progress >= 1) break // Commit the final native page once, below the animation.
    const eased = progress * progress * (3 - 2 * progress)
    await queueHudRender(() => draw(eased))
    displayed += 1
    transferMs += performance.now() - frameStarted
    const wait = Math.min(interval - (performance.now() - frameStarted), duration - (performance.now() - started))
    if (wait > 0) await new Promise(resolve => window.setTimeout(resolve, wait))
  }
  console.debug('HUD motion transport', {
    frames: displayed, durationMs: Math.round(performance.now() - started),
    averageFrameMs: displayed ? Math.round(transferMs / displayed) : 0,
  })
}

function drawBatteryImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 20
  const context = canvas.getContext('2d')
  if (!context) return new Uint8Array(canvas.width * canvas.height)
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const battery = batteryLevel === null ? null : Math.min(100, Math.max(0, Math.round(batteryLevel)))
  const iconX = canvas.width - 26
  context.fillStyle = '#fff'
  context.fillRect(iconX, 3, 20, 2)
  context.fillRect(iconX, 15, 20, 2)
  context.fillRect(iconX, 3, 2, 14)
  context.fillRect(iconX + 18, 3, 2, 14)
  context.fillRect(iconX + 20, 7, 3, 6)
  if (battery !== null) context.fillRect(iconX + 4, 7, Math.round(12 * battery / 100), 6)
  return canvasGrayscale(canvas)
}

async function updateSurfaceFrame(pixels: Uint8Array, epoch = hudAnimationEpoch, isCurrent = () => true) {
  const started = performance.now()
  const changed: Array<{ index: number; pixels: Uint8Array }> = []
  const layout = surfaceLayout
  const rects = surfaceRects(surfaceLayout)
  for (let index = 0; index < rects.length; index++) {
    const tile = surfaceTile(pixels, rects[index])
    const previous = surfaceTiles[index]
    if (!previous || tile.some((pixel, offset) => pixel !== previous[offset])) changed.push({ index, pixels: tile })
  }
  const encoded = await Promise.all(changed.map(async tile => ({ ...tile,
    png: await cachedHudPng(tile.pixels, rects[tile.index].width, rects[tile.index].height),
  })))
  const encodedAt = performance.now()
  if ((!hudActive && !activeReminder) || appExited || !surfaceReady || epoch !== hudAnimationEpoch || !isCurrent()) return
  // The companion supports one image send at a time. Encoding can be parallel,
  // but transport must stay serial. Abandon unsent tiles when newer input
  // arrives, rather than finishing an obsolete four-image frame first.
  let images = 0, imagePixels = 0, pngBytes = 0
  try {
    for (const tile of encoded) {
      if ((!hudActive && !activeReminder) || appExited || !surfaceReady || epoch !== hudAnimationEpoch || !isCurrent()) return
      const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
        containerID: 20 + tile.index, containerName: `hud-tile-${tile.index}`, imageData: tile.png,
      }))
      if (result !== ImageRawDataUpdateResult.success) throw new Error(`HUD image update failed: ${result}`)
      surfaceTiles[tile.index] = tile.pixels
      images += 1
      imagePixels += tile.pixels.length
      pngBytes += tile.png.length
    }
  } finally {
    if (images) console.debug('HUD image transport', { layout, images, imagePixels, pngBytes,
      encodeMs: Math.round(encodedAt - started), sendMs: Math.round(performance.now() - encodedAt),
      superseded: !isCurrent() })
  }
}

async function ensureSurfaceLayout(layout: SurfaceLayout, currentPage: Page, first = false) {
  const capturesChat = currentPage === 'chat'
  const textObject = surfaceContainers(currentPage)
  const borderColor = textObject[0]?.borderColor ?? 0
  if (!first && surfaceReady && surfaceLayout === layout && surfaceCapturesChat === capturesChat && surfaceBorderColor === borderColor) return
  const imageObject = surfaceImageContainers(layout)
  const containers = [...textObject, ...imageObject]
  // The SDK's JavaScript validator does not enforce the firmware name limit.
  for (const container of containers) {
    if ((container.containerName?.length ?? 0) > 16) {
      throw new Error(`HUD container name exceeds 16 characters: ${container.containerName}`)
    }
  }
  const ids = containers.map(container => container.containerID)
  if (new Set(ids).size !== ids.length) throw new Error('HUD layout has duplicate container IDs')
  const payload = new CreateStartUpPageContainer({
    containerTotalNum: textObject.length + imageObject.length,
    textObject, imageObject, menuObject: menu,
  })
  if (first) {
    const result = await bridge.createStartUpPageContainer(payload)
    if (result !== StartUpPageCreateResult.success) throw new Error(`HUD startup failed: ${result}`)
  } else if (!await bridge.rebuildPageContainer(payload)) {
    throw new Error(`HUD layout rebuild failed: ${layout}`)
  }
  surfaceReady = true
  surfaceLayout = layout
  surfaceCapturesChat = capturesChat
  surfaceBorderColor = borderColor
  surfaceTiles = Array(imageObject.length).fill(null)
  surfaceText.clear()
  for (const container of textObject) surfaceText.set(container.containerID!, textCacheKey(container))
  console.debug('HUD layout ready', { layout, nativeHomeText: layout === 'symbol-home', capturesChat,
    textContainers: textObject.length, imageContainers: imageObject.length })
}

function textCacheKey(container: TextContainerProperty) {
  return `${container.textColor}:${container.content}`
}

async function updateSurfaceText(currentPage?: Page, epoch = hudAnimationEpoch, isCurrent = () => true) {
  if ((!hudActive && !activeReminder) || appExited || !surfaceReady || epoch !== hudAnimationEpoch || !isCurrent()) return
  if (!activeReminder && NATIVE_HOME_TEXT && currentPage === 'home' && (page !== 'home'
    || (surfaceLayout !== 'native-home' && surfaceLayout !== 'symbol-home'))) return
  const changed = surfaceContainers(currentPage).filter(container => {
    const id = container.containerID!
    return !(overlayTyping && (id === 3 || id === 5)) && surfaceText.get(id) !== textCacheKey(container)
  })
  // Text requests are independent, unlike image packets. Push the marker
  // column and synopsis together so input feedback stays prompt.
  const results = await Promise.allSettled(changed.map(async container => {
    const id = container.containerID!
    const key = textCacheKey(container)
    if (!await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: id,
      containerName: container.containerName, content: container.content, textColor: container.textColor,
    }))) throw new Error('HUD text update failed')
    surfaceText.set(id, key)
  }))
  const failed = results.find(result => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

async function revealAiOverlay(epoch: number) {
  if (!hudActive || appExited || epoch !== hudAnimationEpoch) return
  const isHome = page === 'home' && selectedSection === 'ai'
  if (!isHome && page !== 'chat') return
  const slot = surfaceContainers(page)[isHome ? 2 : 4]
  const fullText = slot.content ?? ' '
  const characters = [...fullText]
  if (!characters.some(character => character !== ' ' && character !== '\n')) return
  const id = isHome ? 3 : 5
  const name = isHome ? 'home-body' : 'page-body'
  const textColor = slot.textColor ?? 4
  overlayTyping = true
  try {
    for (let offset = 0; offset < characters.length; offset += 4) {
      if (!hudActive || appExited || epoch !== hudAnimationEpoch || transitionTextHidden
        || (isHome ? page !== 'home' || selectedSection !== 'ai' : page !== 'chat')) return
      const content = characters.slice(0, offset + 4).join('')
      if (!await bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: id, containerName: name, content, textColor,
      }))) throw new Error('HUD text reveal failed')
      surfaceText.set(id, `${textColor}:${content}`)
      await new Promise(resolve => window.setTimeout(resolve, 18))
    }
  } finally {
    overlayTyping = false
  }
}

async function renderHud(first = false, navigationCommit = false) {
  if ((!hudActive && !activeReminder) || appExited) return
  if ((animatingNavigation || (animatingDashboard && page === 'home')) && !first && !navigationCommit && !hudTransitioning) {
    hudRefreshPending = true
    return
  }
  hudRenderVersion += 1
  hudRenderFirst ||= first
  if (!hudRenderWorker) {
    hudRenderWorker = queueHudRender(async () => {
      try {
        while ((hudActive || activeReminder) && !appExited) {
          const version = hudRenderVersion
          const currentPage = page
          const minimized = hudMinimized
          const reminder = activeReminder
          const awake = hudActive
          const epoch = hudAnimationEpoch
          const initial = hudRenderFirst
          hudRenderFirst = false
          const isCurrent = () => hudActive === awake && Boolean(hudActive || activeReminder) && !appExited && page === currentPage && activeReminder === reminder
            && hudMinimized === minimized && epoch === hudAnimationEpoch && version === hudRenderVersion
          try {
            await ensureSurfaceLayout(reminder ? 'reminder' : minimized ? 'minimized'
              : currentPage === 'algorithms' && algorithmBrowser.article ? 'algorithm-reader'
              : surfaceLayoutForPage(currentPage, NATIVE_HOME_TEXT, FAST_NATIVE_HOME, weatherView), currentPage, initial)
            const menuImageFirst = !reminder && !minimized && currentPage === 'home' && !FAST_NATIVE_HOME
            if (isCurrent() && !menuImageFirst) await updateSurfaceText(currentPage, epoch, isCurrent)
            if (isCurrent()) await updateSurfaceFrame(drawStaticPage(currentPage), epoch, isCurrent)
            if (isCurrent() && menuImageFirst) await updateSurfaceText(currentPage, epoch, isCurrent)
            if (isCurrent()) hudLayoutPage = reminder ? 'reminder' : minimized ? 'minimized' : currentPage
          } catch (error) {
            hudLayoutPage = null
            surfaceReady = false
            const message = error instanceof Error ? error.message : String(error)
            console.error('HUD render failed', { page: currentPage, weatherView, message })
            if (reminder) break
            if (!hudActive || appExited) break
            // A failed old page must not undo a newer navigation gesture.
            if (page !== currentPage || epoch !== hudAnimationEpoch) continue
            if (minimized) {
              hudMinimized = false
              hudAnimationEpoch += 1
              hudRenderVersion += 1
              updateHudControls()
              showToast(`Minimize failed. Returning to HUD. ${message}`, true)
              continue
            }
            if (currentPage !== 'weather') {
              showToast(`Display update failed: ${message}`, true)
              break
            }
            // Restore a usable page in this same serial worker. Do not leave
            // home visible while the gesture handler thinks Weather is open.
            page = 'home'
            selectedSection = 'weather'
            hudAnimationEpoch += 1
            hudRenderVersion += 1
            showToast(`Weather display failed. Returning home. ${message}`, true)
            continue
          }
          if (version === hudRenderVersion) break
        }
      } catch (error) {
        hudLayoutPage = null
        surfaceReady = false
        console.error('HUD render failed', error)
      } finally {
        hudRenderWorker = null
      }
    })
  }
  await hudRenderWorker
}

function stopWeatherTimer() {
  if (weatherTimer !== undefined) window.clearInterval(weatherTimer)
  weatherTimer = undefined
}

function startWeatherTimer() {
  if (!hudActive || appExited || weatherTimer !== undefined) return
  weatherTimer = window.setInterval(() => void refreshWeather(), 30 * 60_000)
}

function startClockTimer() {
  if (appExited || clockTimer !== undefined) return
  clockTimer = window.setInterval(() => {
    hudClock = new Date()
    updatePhoneClock()
    if (hudActive) void renderHud()
  }, 60_000)
}

async function setHudMinimized(minimized: boolean, fromDoubleTap = false) {
  if (!fromDoubleTap || !hudActive || page !== 'home') return
  if (appExited || hudTransitioning || animatingNavigation || animatingDashboard || minimized === hudMinimized) return
  const previousPage = page, previousMinimized = hudMinimized
  hudTransitioning = true
  cancelHomeClick()
  cancelNewConversationClick()
  cancelInformationQuote()
  try {
    if (recording) await finishVoiceCapture(false)
    page = 'home'
    hudMinimized = minimized
    hudClock = new Date()
    hudAnimationEpoch += 1
    hudLayoutPage = null
    showPanel('chat-sheet', false)
    updateHudControls()
    await renderHud()
    if (hudLayoutPage !== (minimized ? 'minimized' : 'home')) throw new Error('Could not change HUD mode')
  } catch (error) {
    hudMinimized = previousMinimized
    page = previousPage
    hudAnimationEpoch += 1
    await renderHud()
    showToast(error instanceof Error ? error.message : 'HUD mode change failed', true)
  } finally {
    hudTransitioning = false
    updateHudControls()
  }
}

function updateHudControls() {
  byId<HTMLElement>('hud-state').textContent = appExited ? 'App closed' : activeReminder ? 'Class reminder · tap to dismiss' : telepromptFollower.active ? 'Teleprompt · microphone on' : !hudActive ? 'Display asleep · hold to wake' : hudMinimized ? 'HUD minimized · double-tap to restore' : 'G2 HUD is running'
  byId<HTMLElement>('hud-state').classList.toggle('is-off', !hudActive)
  byId<HTMLButtonElement>('voice-button').disabled = appExited || !hudActive || hudMinimized || hudTransitioning || telepromptFollower.active
  byId<HTMLElement>('display-state').innerHTML = `<i></i> <b>${appExited ? 'CLOSED' : !hudActive ? 'ASLEEP' : hudMinimized ? 'MINIMIZED' : 'ACTIVE'}</b>`
}

async function renderSleepPage() {
  await queueHudRender(async () => {
    const cleared = await bridge.rebuildPageContainer(new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [new TextContainerProperty({ xPosition: 0, yPosition: 0, width: 576, height: 288,
        borderWidth: 0, paddingLength: 0, containerID: 10, containerName: 'sleep-input',
        content: ' ', textColor: 0, isEventCapture: 1 })],
      menuObject: menu,
    }))
    if (!cleared) throw new Error('Could not put the display to sleep')
    surfaceReady = false
    surfaceTiles = Array(4).fill(null)
    surfaceText.clear()
    hudLayoutPage = 'sleep'
  })
}

async function setHudAwake(awake: boolean, fromLongPress = false) {
  if (!fromLongPress || hudMinimized) return
  if (appExited || hudTransitioning || awake === hudActive) return
  const previousPage = page
  const previousMinimized = hudMinimized
  hudTransitioning = true
  cancelHomeClick()
  hudActive = awake
  hudMinimized = false
  cancelInformationQuote()
  hudAnimationEpoch += 1
  updateHudControls()
  try {
    if (!awake) {
      stopWeatherTimer()
      if (recording) await finishVoiceCapture(false)
      await controlGlassesMicrophone(false).catch(() => false)
      // Keep the foreground app and input target alive. Shutdown would exit it.
      await renderSleepPage()
      page = 'home'
      showPanel('chat-sheet', false)
    } else {
      page = 'home'
      hudClock = new Date()
      await renderHud()
      if (hudLayoutPage !== 'home') throw new Error('Could not wake the display')
      startWeatherTimer()
      void refreshWeather()
    }
    showToast(awake ? 'Display awake' : 'Display asleep · hold to wake')
  } catch (error) {
    hudActive = !awake
    hudMinimized = previousMinimized
    page = previousPage
    hudLayoutPage = null
    if (hudActive) {
      await renderHud()
      startWeatherTimer()
    } else {
      await renderSleepPage().catch(restoreError => console.error('Sleep restore failed', restoreError))
    }
    showToast(error instanceof Error ? error.message : 'Display update failed', true)
  } finally {
    hudTransitioning = false
    updateHudControls()
  }
}

async function animatePageNavigation(next: Page) {
  const previous = page
  const detailPage = previous === 'home' ? next : previous
  if (detailPage === 'home') return
  const involvesAi = next === 'chat' || previous === 'chat'
  const entering = previous === 'home'
  const duration = entering ? 232 : 384
  animatingNavigation = true
  pendingNavigation = null
  const epoch = ++hudAnimationEpoch
  try {
    await hudRenderQueue
    if (!hudActive || appExited || epoch !== hudAnimationEpoch) return
    transitionTextHidden = involvesAi
    if (involvesAi) await updateSurfaceText(previous)
    if (next === 'home') selectedSection = detailPage === 'chat' ? 'ai' : detailPage
    const art = prepareNavigation(selectedSection, detailPage)
    page = next
    showPanel('chat-sheet', next === 'chat')
    // Paint matching bitmap text before hiding native text, avoiding a blank frame.
    await queueHudRender(async () => {
      await ensureSurfaceLayout('full', previous)
      if (!hudActive || appExited || epoch !== hudAnimationEpoch) return
      await updateSurfaceFrame(navigationFrame(art, entering ? 0 : 1), epoch)
      if (hudActive && !appExited && epoch === hudAnimationEpoch) await updateSurfaceText()
    })
    await animateHudFrames(duration, epoch, async eased => {
      const pixels = navigationFrame(art, entering ? eased : 1 - eased)
      await updateSurfaceFrame(pixels, epoch)
    })
    if (hudActive && !appExited && epoch === hudAnimationEpoch) {
      await renderHud(false, true)
      transitionTextHidden = false
      if (next === 'chat' || (next === 'home' && selectedSection === 'ai')) await revealAiOverlay(epoch)
    }
  } catch (error) {
    console.error('HUD navigation animation failed', error)
    transitionTextHidden = false
    if (hudActive && !appExited && epoch === hudAnimationEpoch) await renderHud(false, true)
  } finally {
    transitionTextHidden = false
    animatingNavigation = false
    const queued = pendingNavigation as Page | null
    pendingNavigation = null
    if (queued && queued !== page && hudActive && !appExited && !hudTransitioning && epoch === hudAnimationEpoch) setPage(queued)
    if (hudRefreshPending) {
      hudRefreshPending = false
      void renderHud()
    }
  }
}

function setPage(next: Page) {
  if (!hudActive || hudMinimized || activeReminder || reminderBusy || appExited || hudTransitioning) return
  cancelHomeClick()
  cancelLeetcodeClick()
  cancelTodoClick()
  cancelAlgorithmClick()
  cancelTelepromptClick()
  if (animatingNavigation) {
    pendingNavigation = next
    return
  }
  if (page === next) return
  if (page === 'teleprompt' && next !== 'teleprompt') {
    telepromptView.suspend()
    resumeTelepromptAfterReminder = false
    void telepromptFollower.stop()
  }
  if (recording && next !== 'chat') void finishVoiceCapture(false)
  if (next !== 'home') {
    homeFolder = next === 'schedule' || next === 'leetcode' || next === 'algorithms' || next === 'teleprompt' ? 'study' : 'root'
    selectedSection = next === 'chat' ? 'ai' : next
  }
  if (page === 'todo') todoSessionIds = []
  if (next === 'todo') {
    todoSessionIds = pendingTodos().map(todo => todo.id)
    selectedTodoIndex = 0
    lastTodoScrollEventAt = -Infinity
    lastTodoScrollDirection = null
  }
  cancelNewConversationClick()
  cancelInformationQuote()
  if (next === 'chat') chatScrollLine = chatTranscriptData().latestTurnStart
  if (next === 'weather') {
    weatherView = 0
    void ensureWeatherExtras()
  }
  if (next === 'leetcode') {
    dailyScroll = 0
    leetcodeImageIndex = null
    lastLeetcodeScrollEventAt = -Infinity
    lastLeetcodeScrollDirection = null
    void refreshDailyProblem()
  }
  if (next === 'schedule') {
    selectedClassIndex = 0
    lastClassScrollAt = -Infinity
    lastClassScrollDirection = null
  }
  if (next === 'algorithms') {
    lastAlgorithmScrollAt = -Infinity
    lastAlgorithmScrollDirection = null
  }
  if (next === 'teleprompt') {
    lastTelepromptScrollAt = -Infinity
    lastTelepromptScrollDirection = null
  }
  if (!NATIVE_HOME_TEXT && surfaceReady && (page === 'home' || next === 'home')) {
    void animatePageNavigation(next)
    return
  }
  hudAnimationEpoch += 1
  page = next
  if (next === 'teleprompt') telepromptView.sync()
  if (next === 'info') void refreshInformationQuote()
  console.debug('HUD page entered', { page: next })
  renderHud()
  showPanel('chat-sheet', next === 'chat')
}

function openPhoneChat() {
  if (appExited || hudTransitioning || activeReminder || reminderBusy) return
  if (hudActive) setPage('chat')
  else page = 'chat'
  showPanel('chat-sheet', true)
}

function addMessage(role: Role, content: string, citations?: AiCitation[]) {
  chatMessages = [...chatMessages, { role, content, ...(citations?.length ? { citations } : {}) }]
  const transcript = chatTranscriptData()
  if (role === 'user') chatScrollLine = transcript.latestTurnStart
  else chatScrollLine = chatScrollWindow(transcript.lines, Infinity).start
  persist(CHAT_STORAGE_KEY, chatMessages)
  renderMessages()
  renderHud()
}

async function moveChatScroll(direction: -1 | 1) {
  if (page !== 'chat' || !hudActive || appExited || hudTransitioning) return
  const window = chatScrollWindow(chatTranscriptLines(), chatScrollLine + direction * 2)
  if (window.start === chatScrollLine) return
  chatScrollLine = window.start
  console.debug('HUD chat scroll', { line: chatScrollLine })
  await renderHud()
}

function cancelNewConversationClick() {
  if (newConversationTimer !== undefined) window.clearTimeout(newConversationTimer)
  newConversationTimer = undefined
}

function cancelHomeClick() {
  if (homeClickTimer !== undefined) window.clearTimeout(homeClickTimer)
  homeClickTimer = undefined
}

function startNewConversation() {
  if (appExited || page !== 'chat') return
  cancelNewConversationClick()
  chatConversationEpoch += 1
  if (chatMessages.length) {
    chatArchives.push({ createdAt: new Date().toISOString(), messages: [...chatMessages] })
    persist(CHAT_ARCHIVE_STORAGE_KEY, chatArchives)
  }
  chatMessages = []
  chatScrollLine = 0
  busy = false
  if (recording) void finishVoiceCapture(false).catch(error => console.error('Microphone stop failed', error))
  persist(CHAT_STORAGE_KEY, chatMessages)
  byId<HTMLInputElement>('chat-input').value = ''
  byId<HTMLButtonElement>('send-button').disabled = false
  setStatus('AI ready', 'ready')
  renderMessages()
  void renderHud()
  console.debug('HUD new conversation')
}

function renderMessages() {
  const list = byId<HTMLElement>('message-list')
  list.replaceChildren()
  if (!chatMessages.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-chat'
    empty.innerHTML = '<span class="empty-mark">✳</span><strong>Ask your AI assistant</strong><p>Type a message, or hold the glasses touchpad to talk.</p>'
    list.append(empty)
    return
  }
  for (const [index, message] of chatMessages.entries()) {
    const item = document.createElement('article')
    item.className = `message ${message.role}${message.role === 'user' && index > 0 ? ' new-turn' : ''}`
    const role = document.createElement('span')
    role.className = 'message-role'
    role.textContent = message.role === 'user' ? '>' : '-'
    const body = document.createElement('p')
    let cursor = 0
    for (const citation of message.citations ?? []) {
      if (!Number.isInteger(citation.start) || !Number.isInteger(citation.end)
        || citation.start < cursor || citation.end <= citation.start || citation.end > message.content.length) continue
      let url: URL
      try { url = new URL(citation.url) } catch { continue }
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) continue
      body.append(document.createTextNode(message.content.slice(cursor, citation.start)))
      const link = document.createElement('a')
      link.href = url.href
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.title = citation.title
      link.textContent = message.content.slice(citation.start, citation.end)
      body.append(link)
      cursor = citation.end
    }
    body.append(document.createTextNode(message.content.slice(cursor)))
    item.append(role, body)
    list.append(item)
  }
  list.scrollTop = list.scrollHeight
}

function aiRelayBase(value = settings.aiRelayUrl) {
  return value || import.meta.env.VITE_AI_RELAY_URL?.trim() || (import.meta.env.DEV ? '/__hud_api' : '')
}

function updateAiRouteHint() {
  const hint = byId<HTMLElement>('api-route-hint')
  try {
    const endpoint = normalizeChatUrl(byId<HTMLInputElement>('chat-url').value || settings.chatUrl)
    const relayBase = aiRelayBase(byId<HTMLInputElement>('ai-relay-url').value.trim())
    const route = resolveAiRoute(endpoint, relayBase)
    byId<HTMLAnchorElement>('openai-key-link').hidden = new URL(endpoint).origin !== 'https://api.openai.com'
    hint.textContent = route.relayed
      ? relayBase === '/__hud_api' ? 'Uses the existing computer connection. Requests run only when you send or check your key.' : 'Uses your HTTPS relay. Requests run only when you send or check your key.'
      : 'Connects directly to your API provider. Advanced connection includes an optional relay.'
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : 'Check the connection settings.'
  }
}

function reportAiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI request failed'
  byId<HTMLElement>('api-route-hint').textContent = message
  if (error instanceof AiApiError && error.status === 401 && error.code !== 'ip_not_authorized') {
    showPanel('settings-panel', true)
    const fieldId = error.service === 'Web search' ? 'search-key' : error.service === 'Transcription' ? 'transcription-key' : 'api-key'
    const field = byId<HTMLInputElement>(fieldId)
    if (fieldId === 'api-key') {
      field.setAttribute('aria-invalid', 'true')
      const hint = byId<HTMLElement>('api-key-error')
      hint.textContent = message
      hint.hidden = false
    }
    field.focus()
  }
  showToast(message, true)
}

async function checkAiConnection() {
  settings = readSettingsForm()
  persist(STORAGE_KEY, settings)
  updateAiRouteHint()
  if (!settings.apiKey) { showToast('Add your chat API key in Settings first', true); return }
  const button = byId<HTMLButtonElement>('check-ai-connection')
  button.disabled = true
  button.textContent = 'Connecting…'
  try {
    const endpoint = new URL(normalizeChatUrl(settings.chatUrl))
    endpoint.pathname = endpoint.pathname.replace(/\/chat\/completions$/, '/models')
    await requestAiApi(endpoint.href, { method: 'GET', headers: { Authorization: `Bearer ${settings.apiKey}` } }, {
      label: 'AI connection', relayBase: aiRelayBase(),
    })
    byId<HTMLElement>('api-route-hint').textContent = 'Connected. API key accepted for the model list. Chat still depends on model access and API quota.'
    showToast('Connected. API key accepted.')
  } catch (error) {
    reportAiError(error)
  } finally {
    button.disabled = false
    button.textContent = 'Check key'
  }
}

async function searchWeb(query: string) {
  if (!settings.searchEnabled) return ''
  if (!settings.searchApiKey) throw new Error('This provider needs a Tavily Search API key. OpenAI official API can use built-in web search with your chat key.')
  const data = await requestAiApi('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: settings.searchApiKey, query, search_depth: 'basic', max_results: 3, include_answer: true }),
  }, { label: 'Web search', relayBase: aiRelayBase() }) as { answer?: string; results?: Array<{ title: string; url: string; content: string }> }
  const results = data.results?.map(result => `- ${result.title}: ${result.content} (${result.url})`).join('\n') ?? ''
  return [data.answer ? `Search summary: ${data.answer}` : '', results].filter(Boolean).join('\n')
}

async function sendChat(text: string, fromVoice = false) {
  if (appExited) return
  const prompt = text.trim()
  if (!prompt || (busy && !fromVoice)) return
  if (prompt.length > AI_MAX_PROMPT_CHARS) {
    showToast(`Keep each question under ${AI_MAX_PROMPT_CHARS} characters.`, true)
    return
  }
  settings = readSettingsForm()
  persist(STORAGE_KEY, settings)
  if (!settings.apiKey) {
    showToast('Add your chat API key in Settings first', true)
    showPanel('settings-panel', true)
    return
  }

  const requestEpoch = chatConversationEpoch
  addMessage('user', prompt)
  const requestHistory = [...chatMessages]
  busy = true
  setStatus('Thinking…', 'busy')
  byId<HTMLButtonElement>('send-button').disabled = true
  byId<HTMLInputElement>('chat-input').value = ''
  try {
    const todoContext = todoAiInstructions(todos)
    const applyTodoCall = (data: unknown, responses: boolean) => {
      const args = todoCallArguments(data, responses)
      if (args === null) return false
      const items = parseTodoArguments(args, requestHistory.filter(message => message.role === 'user').slice(-4).map(message => message.content))
      const result = mergeNewTodos(todos, items)
      if (result.created.length) {
        const previous = todos
        todos = result.next
        try { saveTodos() } catch { todos = previous; throw new Error('Could not save to-dos on this phone. No new items were kept.') }
      }
      addMessage('assistant', todoCreationReceipt(result.created, result.duplicates, /[\u3400-\u9fff]/.test(prompt)))
      setStatus('AI ready · to-do list updated', 'ready')
      return true
    }
    const chatEndpoint = normalizeChatUrl(settings.chatUrl)
    const nativeSearch = settings.searchEnabled && !settings.searchApiKey
      && new URL(chatEndpoint).origin === 'https://api.openai.com'
    if (nativeSearch) {
      const payload = buildOpenAiSearchPayload(settings.model, requestHistory, todoContext)
      const data = await requestAiApi(OPENAI_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ ...payload, max_output_tokens: 1024, parallel_tool_calls: false,
          tools: [...payload.tools, { type: 'function', ...TODO_FUNCTION }] }),
      }, { label: 'OpenAI web search', relayBase: aiRelayBase() })
      if (requestEpoch !== chatConversationEpoch) return
      if (applyTodoCall(data, true)) return
      const answer = parseOpenAiSearchResponse(data)
      addMessage('assistant', answer.text, answer.citations)
      setStatus(answer.searched ? 'AI ready · web searched' : 'AI ready', 'ready')
    } else {
      const searchContext = await searchWeb(prompt)
      if (requestEpoch !== chatConversationEpoch) return
      const data = await requestAiApi(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ ...buildChatPayload(settings.model, chatEndpoint, requestHistory, searchContext, todoContext),
          ...(new URL(chatEndpoint).origin === 'https://api.openai.com' ? { max_completion_tokens: 1024 } : { max_tokens: 1024 }),
          tools: [{ type: 'function', function: TODO_FUNCTION }], tool_choice: 'auto', parallel_tool_calls: false }),
      }, { label: 'Chat API', relayBase: aiRelayBase() }) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }
      if (requestEpoch !== chatConversationEpoch) return
      if (applyTodoCall(data, false)) return
      const raw = data.choices?.[0]?.message?.content
      const answer = Array.isArray(raw) ? raw.map(part => part.text ?? '').join('') : raw
      if (!answer) throw new Error('The API returned no answer')
      addMessage('assistant', answer.trim())
      setStatus('AI ready', 'ready')
    }
  } catch (error) {
    if (requestEpoch !== chatConversationEpoch) return
    reportAiError(error)
    setStatus('Request incomplete', 'error')
  } finally {
    if (requestEpoch === chatConversationEpoch) {
      busy = false
      byId<HTMLButtonElement>('send-button').disabled = false
      renderHud()
    }
  }
}

function pcmToWav(chunks: Uint8Array[]) { return pcmWav(chunks) }

async function startVoiceCapture() {
  if (recording || busy || !hudActive || hudMinimized || appExited || hudTransitioning || animatingNavigation) return
  settings = readSettingsForm()
  persist(STORAGE_KEY, settings)
  if (!settings.apiKey) {
    showToast('Add your API key in Settings first', true)
    showPanel('settings-panel', true)
    return
  }
  recording = true
  audioChunks = []
  setStatus('Listening… Release to send', 'busy')
  byId<HTMLElement>('voice-state').textContent = 'Listening · release the touchpad to send'
  byId<HTMLElement>('voice-state').classList.add('is-recording')
  renderHud()
  let started = false
  try {
    started = await controlGlassesMicrophone(true)
  } catch {
    started = false
  }
  if (!recording || !hudActive || appExited || page !== 'chat') {
    await controlGlassesMicrophone(false).catch(() => false)
    return
  }
  if (!started) {
    recording = false
    byId<HTMLElement>('voice-state').textContent = 'Microphone unavailable. Check permissions.'
    byId<HTMLElement>('voice-state').classList.remove('is-recording')
    setStatus('Microphone unavailable', 'error')
    showToast('Microphone unavailable. Check app permissions and update the companion app.', true)
    renderHud()
    return
  }
  recordingTimer = window.setTimeout(() => void finishVoiceCapture(true), 25000)
}

async function finishVoiceCapture(send = true) {
  if (!recording) return
  const requestEpoch = chatConversationEpoch
  recording = false
  if (recordingTimer !== undefined) window.clearTimeout(recordingTimer)
  recordingTimer = undefined
  await controlGlassesMicrophone(false)
  if (requestEpoch !== chatConversationEpoch) return
  byId<HTMLElement>('voice-state').textContent = 'Open AI chat, then hold the glasses touchpad to talk'
  byId<HTMLElement>('voice-state').classList.remove('is-recording')
  renderHud()
  if (!send || !audioChunks.length) {
    setStatus('AI ready', 'ready')
    return
  }
  if (!settings.transcriptionUrl) {
    showToast('Add your transcription API URL in Settings', true)
    return
  }
  busy = true
  setStatus('Transcribing…', 'busy')
  try {
    const form = new FormData()
    form.append('file', pcmToWav(audioChunks), 'voice.wav')
    form.append('model', settings.transcriptionModel)
    const result = await requestAiApi(settings.transcriptionUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.transcriptionApiKey || settings.apiKey}` },
      body: form,
    }, { label: 'Transcription', relayBase: aiRelayBase() }) as { text?: string }
    if (requestEpoch !== chatConversationEpoch) return
    if (!result.text?.trim()) throw new Error('No speech was recognized')
    byId<HTMLInputElement>('chat-input').value = result.text.trim()
    await sendChat(result.text.trim(), true)
  } catch (error) {
    if (requestEpoch !== chatConversationEpoch) return
    reportAiError(error)
    setStatus('Voice request incomplete', 'error')
  } finally {
    if (requestEpoch === chatConversationEpoch) {
      busy = false
      renderHud()
    }
  }
}

function routeEvent(eventType: OsEventTypeList | undefined) {
  if (appExited) return
  if (eventType !== OsEventTypeList.CLICK_EVENT && eventType !== undefined) {
    cancelNewConversationClick()
    cancelHomeClick()
    cancelLeetcodeClick()
    cancelTodoClick()
    cancelAlgorithmClick()
    cancelTelepromptClick()
  }
  if (eventType === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) {
    longPressHeld = false
    if (recording) void finishVoiceCapture(true)
    return
  }
  if (activeReminder) {
    if (eventType === OsEventTypeList.CLICK_EVENT || eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || eventType === undefined) void dismissClassReminder()
    return
  }
  if (reminderBusy || performance.now() - lastReminderDismissedAt < 450) return
  if (hudTransitioning) return
  // A held press makes one transition. Require its release before another
  // long press can wake the black display, avoiding an immediate toggle.
  if (!hudActive) {
    if (eventType === OsEventTypeList.LONG_PRESS_EVENT && !longPressHeld) {
      longPressHeld = true
      void setHudAwake(true, true)
    }
    return
  }
  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    const now = performance.now()
    if (now - lastDoubleClickAt < 250) return
    lastDoubleClickAt = now
    if (hudMinimized) { void setHudMinimized(false, true); return }
    if (animatingNavigation) {
      pendingNavigation = 'home'
      return
    }
    if (page === 'algorithms') {
      if (algorithmBrowser.back()) updateAlgorithmView()
      else setPage('home')
      return
    }
    if (page === 'home' && homeFolder === 'study') setHomeFolder('root')
    else if (page === 'home') void setHudMinimized(true, true)
    else {
      if (recording) void finishVoiceCapture(false)
      setPage('home')
    }
    return
  }
  // Minimized mode accepts only double-tap; other gestures are ignored.
  if (hudMinimized) return
  if (eventType === OsEventTypeList.LONG_PRESS_EVENT) {
    if (longPressHeld) return
    longPressHeld = true
    if (page === 'teleprompt') { void toggleTelepromptFollowing(); return }
    if (page === 'home' && !animatingNavigation) void setHudAwake(false, true)
    else if (!animatingNavigation) {
      setPage('chat')
      void startVoiceCapture()
    }
    return
  }
  if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT || eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
    const now = performance.now()
    const direction = eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT ? 1 : -1
    if (page === 'home') {
      // Home changes only native selection text. Accept new selections while
      // the render worker coalesces older ones; do not wait for page commits.
      if (direction === lastHomeScrollDirection && now - lastHomeScrollAt < 100) return
      lastHomeScrollAt = now
      lastHomeScrollDirection = direction
      void moveSection(direction)
      return
    }
    if (page === 'leetcode') {
      // Group one continuous stream of same-direction hardware events into
      // one two-line movement. Update on EVERY event so a long burst cannot
      // auto-repeat. New gestures do not wait for 550ms or a render commit;
      // a direction change takes effect immediately.
      const repeated = direction === lastLeetcodeScrollDirection && now - lastLeetcodeScrollEventAt < 100
      lastLeetcodeScrollEventAt = now
      lastLeetcodeScrollDirection = direction
      if (!repeated) void moveLeetcodeScroll(direction).catch(error => console.error('HUD LeetCode scroll failed', error))
      return
    }
    if (page === 'algorithms') {
      const repeated = direction === lastAlgorithmScrollDirection && now - lastAlgorithmScrollAt < 100
      lastAlgorithmScrollAt = now
      lastAlgorithmScrollDirection = direction
      if (!repeated) { algorithmBrowser.move(direction); void renderHud() }
      return
    }
    if (page === 'teleprompt') {
      const repeated = direction === lastTelepromptScrollDirection && now - lastTelepromptScrollAt < 100
      lastTelepromptScrollAt = now
      lastTelepromptScrollDirection = direction
      if (!repeated && telepromptDocument.manual(direction, telepromptView.frame.line)) {
        telepromptView.sync()
        telepromptFollower.reanchor()
        renderTelepromptPhone()
        void renderHud()
      }
      return
    }
    if (page === 'todo') {
      const repeated = direction === lastTodoScrollDirection && now - lastTodoScrollEventAt < 100
      lastTodoScrollEventAt = now
      lastTodoScrollDirection = direction
      if (!repeated) void moveTodoSelection(direction).catch(error => console.error('HUD to-do selection failed', error))
      return
    }
    if (page === 'schedule') {
      const repeated = direction === lastClassScrollDirection && now - lastClassScrollAt < 100
      lastClassScrollAt = now
      lastClassScrollDirection = direction
      if (!repeated) {
        selectedClassIndex = Math.max(0, Math.min(upcomingClasses(schedule.courses).length - 1, selectedClassIndex + direction))
        void renderHud()
      }
      return
    }
    const quietMs = now - lastScrollEventAt
    // Update even for ignored events, so a continuing gesture cannot start
    // another page turn just because a fixed throttle interval expired.
    lastScrollEventAt = now
    if (quietMs < 350 || now - lastScrollAcceptedAt < 550 || scrollNavigationPending) return
    lastScrollAcceptedAt = now
    scrollNavigationPending = true
    // Do not queue repeats while the accepted page is being committed. The
    // first event still starts immediately, and double-tap remains independent.
    void (async () => {
      try {
        if (page === 'weather') await moveWeatherPage(direction)
        else if (page === 'chat') await moveChatScroll(direction)
        else { setPage('home'); await hudRenderWorker }
      } catch (error) {
        console.error('HUD scroll navigation failed', error)
      } finally {
        scrollNavigationPending = false
      }
    })()
    return
  }
  if (animatingDashboard || animatingNavigation) return
  if (eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined) {
    if (page === 'home') {
      // Classify double-tap before opening the selected detail page.
      cancelHomeClick()
      const section = selectedSection, epoch = hudAnimationEpoch
      homeClickTimer = window.setTimeout(() => {
        homeClickTimer = undefined
        if (hudActive && !hudMinimized && !hudTransitioning && page === 'home'
          && epoch === hudAnimationEpoch && selectedSection === section) openHomeSection(section)
      }, 350)
    } else if (page === 'teleprompt') {
      cancelTelepromptClick()
      const epoch = hudAnimationEpoch
      telepromptClickTimer = window.setTimeout(() => {
        telepromptClickTimer = undefined
        if (page === 'teleprompt' && epoch === hudAnimationEpoch && !activeReminder) void toggleTelepromptFollowing()
      }, 300)
    } else if (page === 'algorithms') {
      if (algorithmBrowser.article) return
      cancelAlgorithmClick()
      const id = algorithmBrowser.entries[algorithmBrowser.selectedIndex]?.id, epoch = hudAnimationEpoch
      if (id) algorithmClickTimer = window.setTimeout(() => {
        algorithmClickTimer = undefined
        if (page === 'algorithms' && epoch === hudAnimationEpoch && !activeReminder) {
          algorithmBrowser.open(id)
          updateAlgorithmView()
        }
      }, 300)
    } else if (page === 'todo') {
      cancelTodoClick()
      const id = glassesTodoItems()[selectedTodoIndex]?.id, epoch = hudAnimationEpoch
      if (id) todoClickTimer = window.setTimeout(() => {
        todoClickTimer = undefined
        if (epoch === hudAnimationEpoch) toggleGlassesTodo(id)
      }, 300)
    } else if (page === 'leetcode') {
      cancelLeetcodeClick()
      const epoch = hudAnimationEpoch
      leetcodeClickTimer = window.setTimeout(() => {
        leetcodeClickTimer = undefined
        if (epoch === hudAnimationEpoch) toggleLeetcodeImage()
      }, 300)
    } else if (page === 'chat') {
      cancelNewConversationClick()
      const conversation = chatConversationEpoch
      newConversationTimer = window.setTimeout(() => {
        newConversationTimer = undefined
        if (page === 'chat' && hudActive && conversation === chatConversationEpoch) startNewConversation()
      }, 350)
    }
  }
}

function bindEvents() {
  bridge.onEvenHubEvent(event => {
    const sys = event.sysEvent
    // Ignore unsolicited sensor reports instead of treating them as a tap.
    if (sys?.imuData || sys?.eventType === OsEventTypeList.IMU_DATA_REPORT) return
    if (sys?.eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) { queueReminderCheck(); return }
    if (sys?.eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) return
    if (sys?.eventType === OsEventTypeList.SYSTEM_EXIT_EVENT || sys?.eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      appExited = true
      hudActive = false
      cancelInformationQuote()
      cancelNewConversationClick()
      cancelHomeClick()
      cancelTodoClick()
      cancelLeetcodeClick()
      cancelAlgorithmClick()
      cancelTelepromptClick()
      resumeTelepromptAfterReminder = false
      telepromptView.suspend()
      void telepromptFollower.stop('App closed / microphone off')
      activeReminder = null
      if (reminderTimer !== undefined) window.clearTimeout(reminderTimer)
      stopWeatherTimer()
      if (clockTimer !== undefined) window.clearInterval(clockTimer)
      if (recording) void finishVoiceCapture(false)
      updateHudControls()
      return
    }
    if (event.audioEvent) {
      if (telepromptFollower.active && page === 'teleprompt') {
        telepromptFollower.pushAudio(new Uint8Array(event.audioEvent.audioPcm), event.audioEvent.speakerRole === AudioSpeakerRole.Other)
      } else if (recording) audioChunks.push(new Uint8Array(event.audioEvent.audioPcm))
    }
    if (NATIVE_HOME_TEXT && page === 'home' && (event.listEvent || event.textEvent || event.sysEvent)) {
      console.debug('HUD home input', {
        kind: event.listEvent ? 'list' : event.textEvent ? 'text' : 'system',
        type: (event.listEvent ?? event.textEvent ?? event.sysEvent)?.eventType ?? OsEventTypeList.CLICK_EVENT,
        index: event.listEvent?.currentSelectItemIndex,
      })
    }
    if (event.menuItemClickEvent) {
      if (activeReminder) { void dismissClassReminder(); return }
      if (!hudActive || hudMinimized || hudTransitioning) return
      if (event.menuItemClickEvent.itemID === 1) {
        homeFolder = 'root'
        selectedSection = 'info'
        setPage('home')
        void renderHud()
      }
      return
    }
    if (event.listEvent && NATIVE_HOME_TEXT && page === 'home') {
      // This home uses text input; ignore stale list events from older pages.
      return
    }
    // Zero-valued CLICK_EVENT may be omitted. Only default inside an envelope.
    if (event.sysEvent) routeEvent(event.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT)
    else if (event.textEvent) routeEvent(event.textEvent.eventType ?? OsEventTypeList.CLICK_EVENT)
    else if (event.listEvent) routeEvent(event.listEvent.eventType ?? OsEventTypeList.CLICK_EVENT)
  })

  bridge.onDeviceStatusChanged(status => {
    batteryLevel = typeof status.batteryLevel === 'number' ? status.batteryLevel : batteryLevel
    connected = status.isConnected()
    if (page === 'teleprompt') telepromptView.sync()
    if (!connected && telepromptFollower.active) {
      resumeTelepromptAfterReminder = false
      void telepromptFollower.stop('Glasses disconnected / follow paused')
    }
    updateDeviceDisplay()
    if (connected) queueReminderCheck()
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') queueReminderCheck() })
  window.addEventListener('focus', () => queueReminderCheck())
}

function updateDeviceDisplay() {
  byId<HTMLElement>('device-battery').textContent = batteryLevel === null ? (connected ? 'G2 connected' : 'Waiting for G2') : `G2 battery ${Math.round(batteryLevel)}%`
  byId<HTMLElement>('battery-value').textContent = batteryLevel === null ? '--%' : `${Math.round(batteryLevel)}%`
  byId<HTMLElement>('battery-fill').style.width = `${batteryLevel ?? 0}%`
  const pill = document.querySelector<HTMLElement>('.status-pill')
  if (pill) {
    pill.innerHTML = `<i></i> ${connected ? 'ONLINE' : 'OFFLINE'}`
    pill.style.color = connected ? '' : 'var(--muted)'
  }
  renderHud()
}

function bindUi() {
  bindTelepromptPhone({ document: telepromptDocument, save: saveTeleprompt,
    open: () => {
      if (!hudActive || hudMinimized || activeReminder || reminderBusy || hudTransitioning || appExited) {
        showToast('Restore the glasses display before opening Teleprompt.')
        return
      }
      setPage('teleprompt')
    },
    toggle: toggleTelepromptFollowing, following: () => telepromptFollower.active || resumeTelepromptAfterReminder,
    status: () => telepromptFollower.status,
    diagnostics: () => telepromptFollower.diagnostics,
    heard: () => telepromptFollower.heard,
    presentation: () => telepromptView.frame,
    motion: value => {
      settings = { ...settings, telepromptMotion: value }
      persist(STORAGE_KEY, settings)
      telepromptView.setMotion(value)
      telepromptView.sync()
      if (page === 'teleprompt') void renderHud()
    },
    editing: () => {
      if (telepromptFollower.active || resumeTelepromptAfterReminder) {
        resumeTelepromptAfterReminder = false
        void telepromptFollower.stop('Draft changed / follow paused')
      }
    },
    sensitivity: value => { telepromptFollower.sensitivity = [.003, .006, .014].includes(value) ? value : .006 },
    notify: message => showToast(message),
  })
  byId<HTMLButtonElement>('tp-restart').addEventListener('click', () => {
    telepromptDocument.restart()
    telepromptView.sync()
    telepromptFollower.reanchor()
    renderTelepromptPhone()
    if (page === 'teleprompt') void renderHud()
  })
  bindAlgorithmPhone(id => {
    if (!hudActive || hudMinimized || activeReminder || reminderBusy || hudTransitioning || appExited) {
      showToast('Restore the glasses display before opening an algorithm.')
      return
    }
    cancelAlgorithmClick()
    algorithmBrowser.open(id)
    setPage('algorithms')
    updateAlgorithmView()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-study-tab]').forEach(button => {
    button.addEventListener('click', () => setPhoneTab(button.dataset.studyTab === 'algorithms' ? 'algorithms' : button.dataset.studyTab === 'teleprompt' ? 'teleprompt' : 'leetcode'))
  })
  byId<HTMLButtonElement>('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyPhoneTheme(theme)
    persist('orbital-phone-theme', theme)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-planner-tab]').forEach(button => {
    button.addEventListener('click', () => setPhoneTab(button.dataset.plannerTab === 'schedule' ? 'schedule' : 'todo'))
  })
  bindScheduleUi({ read: () => schedule, save: saveSchedule, open: () => setPage('schedule'), notify: message => showToast(message) })
  document.querySelectorAll<HTMLButtonElement>('[data-phone-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.phoneTab
      if (tab === 'chat') openPhoneChat()
      else if (tab === 'todo') setPhoneTab(lastPlannerTab)
      else if (tab === 'leetcode') setPhoneTab(lastStudyTab)
      else if (tab === 'hud' || tab === 'settings') setPhoneTab(tab)
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach(button => {
    button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab!))
  })
  document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach(tablist => {
    tablist.addEventListener('keydown', event => {
      if (!(event.target instanceof HTMLButtonElement) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      const current = tabs.indexOf(event.target)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      event.preventDefault()
      tabs[index]?.click()
      tabs[index]?.focus()
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-todo-filter]').forEach(button => {
    button.addEventListener('click', () => {
      phoneTodoFilter = button.dataset.todoFilter === 'completed' ? 'completed' : 'pending'
      phoneTodoPage = 0
      renderTodos()
    })
  })
  for (const [id, delta] of [['todo-prev', -1], ['todo-next', 1]] as const) {
    byId<HTMLButtonElement>(id).addEventListener('click', () => {
      phoneTodoPage += delta
      renderTodos()
      byId<HTMLElement>('todo-list').closest<HTMLElement>('.pane-scroll')?.scrollTo(0, 0)
    })
  }
  byId<HTMLButtonElement>('todo-open').addEventListener('click', () => {
    setPage('todo')
  })
  byId<HTMLButtonElement>('leetcode-open').addEventListener('click', () => {
    setPage('leetcode')
  })
  byId<HTMLButtonElement>('leetcode-refresh').addEventListener('click', () => void refreshDailyProblem(true))
  updateDailyPhone()
  byId<HTMLFormElement>('todo-form').addEventListener('submit', event => {
    event.preventDefault()
    const input = byId<HTMLInputElement>('todo-input')
    const text = input.value.replace(/\s+/g, ' ').trim()
    if (!text) return
    if (todos.length >= 100) {
      showToast('Up to 100 to-dos. Remove completed items to add more.')
      return
    }
    const dateInput = byId<HTMLInputElement>('todo-date'), timeInput = byId<HTMLInputElement>('todo-time')
    const dueDate = dateInput.value || null, dueTime = timeInput.value || null
    if ((dueDate && !validTodoDate(dueDate)) || (dueTime && (!dueDate || !validTodoTime(dueTime)))) {
      showToast('Enter a valid due date before adding a time.', true)
      return
    }
    const previous = todos
    const result = mergeNewTodos(todos, [{ text: text.slice(0, 120), dueDate, dueTime }])
    todos = result.next
    phoneTodoFilter = 'pending'
    phoneTodoPage = Math.max(0, Math.ceil(pendingTodos().length / 5) - 1)
    try { saveTodos() } catch { todos = previous; showToast('Could not save this to-do.', true); return }
    input.value = ''
    dateInput.value = ''; timeInput.value = ''
  })
  byId<HTMLElement>('todo-list').addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    const toggle = event.target.closest<HTMLButtonElement>('[data-todo-toggle]')
    const remove = event.target.closest<HTMLButtonElement>('[data-todo-remove]')
    const previous = todos
    if (toggle) {
      todos = todos.map(item => item.id === toggle.dataset.todoToggle ? { ...item, completed: !item.completed } : item)
    } else if (remove) {
      todos = todos.filter(item => item.id !== remove.dataset.todoRemove)
    } else return
    try { saveTodos() } catch { todos = previous; showToast('Could not save this change.', true) }
  })
  byId<HTMLButtonElement>('settings-open').addEventListener('click', () => showPanel('settings-panel', true))
  byId<HTMLButtonElement>('check-ai-connection').addEventListener('click', () => void checkAiConnection())
  for (const id of ['api-key', 'transcription-key', 'search-key']) {
    byId<HTMLInputElement>(id).addEventListener('blur', event => {
      const input = event.target as HTMLInputElement
      input.value = normalizeApiKey(input.value)
    })
  }
  byId<HTMLInputElement>('api-key').addEventListener('input', () => {
    byId<HTMLInputElement>('api-key').removeAttribute('aria-invalid')
    byId<HTMLElement>('api-key-error').hidden = true
    updateAiRouteHint()
  })
  for (const id of ['chat-url', 'ai-relay-url']) byId<HTMLInputElement>(id).addEventListener('change', updateAiRouteHint)
  byId<HTMLButtonElement>('settings-close').addEventListener('click', () => showPanel('settings-panel', false))
  byId<HTMLButtonElement>('settings-save').addEventListener('click', async () => {
    settings = readSettingsForm()
    persist(STORAGE_KEY, settings)
    showPanel('settings-panel', false)
    updateSearchStatus()
    updateAiRouteHint()
    showToast('Settings saved on this phone')
    await refreshWeather(true)
    renderHud()
  })
  byId<HTMLInputElement>('search-enabled').addEventListener('change', updateSearchStatus)
  byId<HTMLFormElement>('chat-form').addEventListener('submit', event => {
    event.preventDefault()
    void sendChat(byId<HTMLInputElement>('chat-input').value)
  })
  byId<HTMLButtonElement>('chat-open').addEventListener('click', () => {
    openPhoneChat()
  })
  byId<HTMLButtonElement>('chat-new').addEventListener('click', startNewConversation)
  byId<HTMLButtonElement>('chat-close').addEventListener('click', () => {
    if (hudActive) setPage('home')
    else page = 'home'
    showPanel('chat-sheet', false)
  })
  byId<HTMLButtonElement>('weather-refresh').addEventListener('click', () => void refreshWeather(true))
  byId<HTMLButtonElement>('voice-button').addEventListener('click', () => {
    if (!hudActive) {
      showToast('Wake the display, then open AI chat and hold to talk')
      return
    }
    openPhoneChat()
    showToast('AI chat is open. Hold the glasses touchpad to talk.')
  })
  applySettingsToForm()
  renderMessages()
  renderTodos()
  setPhoneTab('hud')
  setSettingsTab('connection')
}

await loadSavedState()
// Drop obsolete motion preferences from both local stores on upgrade.
const legacySettings = settings as Settings & { autoMinimize?: unknown; motionCalibration?: unknown }
if ('autoMinimize' in legacySettings || 'motionCalibration' in legacySettings) {
  delete legacySettings.autoMinimize
  delete legacySettings.motionCalibration
  persist(STORAGE_KEY, settings)
}
applySettingsToForm()
bindUi()
bindEvents()
renderMessages()
if (!FAST_NATIVE_HOME) {
  await Promise.all(HOME_SECTIONS.map(section => cachedHudPng(drawHomeMenu(section), HOME_MENU_RECT.width, HOME_MENU_RECT.height)))
    .catch(error => console.error('HUD menu cache failed', error))
}
await renderHud(true)
void refreshWeather()
updateHudControls()
setStatus(settings.apiKey ? 'AI ready' : 'Add your API key')
void bridge.getDeviceInfo().then(info => {
  if (!info) return
  batteryLevel = info.status.batteryLevel ?? null
  connected = info.status.isConnected()
  updateDeviceDisplay()
  if (connected) queueReminderCheck()
}).catch(() => undefined)

startClockTimer()

function updatePhoneClock() {
  byId<HTMLElement>('phone-clock').textContent = hudClock.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  byId<HTMLElement>('phone-date').textContent = hudClock.toLocaleDateString('en-CA', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()
}
updatePhoneClock()

startWeatherTimer()
queueReminderCheck()


