import { getTextWidth } from '@evenrealities/pretext'
import { AlgorithmBrowser } from './browser'
import { ALGORITHM_NOTES, algorithmCount, algorithmPath, algorithmText, searchAlgorithms } from './catalogue'

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const browser = new AlgorithmBrowser(getTextWidth)
let listPage = 0
let onGlasses: ((id: string) => void) | undefined

export function renderAlgorithmPhone() {
  if (!onGlasses) return
  const query = el<HTMLInputElement>('algorithm-search').value.trim()
  const article = browser.article
  const entries = query ? searchAlgorithms(query) : browser.entries
  const maxPage = Math.max(0, Math.ceil(entries.length / 5) - 1)
  listPage = Math.max(0, Math.min(listPage, maxPage))
  el<HTMLElement>('algorithm-phone-path').textContent = algorithmPath(article?.id ?? browser.folderId).map(node => node.title.split('/')[0].trim()).join(' / ')
  el<HTMLElement>('algorithm-phone-count').textContent = `${ALGORITHM_NOTES.length} notes / offline`
  el<HTMLElement>('algorithm-phone-browser').hidden = Boolean(article)
  el<HTMLElement>('algorithm-phone-article').hidden = !article
  el<HTMLElement>('algorithm-phone-pager').hidden = Boolean(article)
  el<HTMLButtonElement>('algorithm-phone-back').disabled = !article && !browser.folder.parent && !query
  if (article) {
    el<HTMLElement>('algorithm-phone-title').textContent = article.title
    el<HTMLElement>('algorithm-phone-body').textContent = algorithmText(article)
    return
  }
  el<HTMLElement>('algorithm-phone-empty').hidden = entries.length !== 0
  el<HTMLElement>('algorithm-phone-page').textContent = `${listPage + 1} / ${maxPage + 1}`
  el<HTMLButtonElement>('algorithm-phone-prev').disabled = listPage === 0
  el<HTMLButtonElement>('algorithm-phone-next').disabled = listPage === maxPage
  const list = el<HTMLElement>('algorithm-phone-list')
  list.replaceChildren()
  for (const node of entries.slice(listPage * 5, listPage * 5 + 5)) {
    const row = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'; button.className = 'algorithm-link'; button.dataset.algorithmId = node.id
    const label = document.createElement('span'); label.textContent = node.title
    const detail = document.createElement('small')
    detail.textContent = node.kind === 'folder' ? `DIR / ${algorithmCount(node.id)} notes` : query
      ? algorithmPath(node.parent).slice(1).map(item => item.title.split('/')[0].trim()).join(' / ') : node.use
    button.append(label, detail); row.append(button); list.append(row)
  }
}

export function bindAlgorithmPhone(open: (id: string) => void) {
  onGlasses = open
  el<HTMLInputElement>('algorithm-search').addEventListener('input', () => {
    browser.articleId = null
    listPage = 0
    renderAlgorithmPhone()
  })
  el<HTMLElement>('algorithm-phone-list').addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('[data-algorithm-id]')
    if (!button?.dataset.algorithmId) return
    browser.open(button.dataset.algorithmId)
    listPage = 0
    renderAlgorithmPhone()
    el<HTMLElement>('algorithm-phone-article').scrollTo(0, 0)
  })
  el<HTMLButtonElement>('algorithm-phone-back').addEventListener('click', () => {
    if (browser.article) browser.back()
    else if (el<HTMLInputElement>('algorithm-search').value) el<HTMLInputElement>('algorithm-search').value = ''
    else browser.back()
    listPage = 0
    renderAlgorithmPhone()
  })
  el<HTMLButtonElement>('algorithm-open').addEventListener('click', () => open(browser.articleId ?? browser.folderId))
  for (const [id, direction] of [['algorithm-phone-prev', -1], ['algorithm-phone-next', 1]] as const) {
    el<HTMLButtonElement>(id).addEventListener('click', () => {
      listPage += direction; renderAlgorithmPhone(); el<HTMLElement>('algorithm-phone-browser').scrollTo(0, 0)
    })
  }
  renderAlgorithmPhone()
}
